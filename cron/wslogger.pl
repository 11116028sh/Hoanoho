#! /usr/bin/perl
#
# Retrieves and logs the weather stats from a WH-1080/1081 weather station
#
# Steve Cliffe <steve@sjcnet.id.au>
# 
# Version 1.0 - 22 March 2010
# * Initial release
#
# Version 1.1 - 9 November 2010
# * Fixed a problem with it not handling negative temperatures
# * Also should now run on Big & Little Endian hardware
#
# Version 1.2 - 15 November 2010
# * Added outdoor dew point & wind chill
# * Added optional parseable output format
#
# Version 1.3 - 21 November 2010 - sparvu@systemdatarecorder.org
# * Added interval, count
# * Enhance sleep interval option
# * Enhance reporting meteo data 
#
# Version 1.4 - 1 January 2013
# * Output data to a template file for uploading to the Weather Underground via http://www.jerjanb.net/wu-upload/

#use strict;
use Device::USB;
use Data::Dumper;
use Carp::Assert;
use Getopt::Std;
use POSIX qw(sysconf pause strftime);
use Time::HiRes qw(setitimer ITIMER_REAL);


my $VENDOR = 0x1941;
my $PRODUCT = 0x8021;
#my $debug = 0;	
my $wu_upload_file = "/tmp/wu-wupload.htx"; 	# Set to empty string to disable

#
# Command line arguments
#
usage() if defined $ARGV[0] and $ARGV[0] eq "--help";
getopts('dhvp') or usage();
usage() if defined $main::opt_h;
revision() if defined $main::opt_v;
my $rrd   = defined $main::opt_p ? $main::opt_p : 0;
my $debug = defined $main::opt_d ? $main::opt_d : 0;

# process [[interval [count]]
my ($interval, $loop_max);
if (defined $ARGV[0]) {
    $interval = $ARGV[0];
    $loop_max = defined $ARGV[1] ? $ARGV[1] : 2**32;
    usage() if $interval == 0;
}
else {
    $interval = 1;
    $loop_max = 1; 
}

my $loop = 0;           # current loop number
my $PAGESIZE = 25;      # max lines per header
my $line = $PAGESIZE;   # counter for lines printed
my $max_rain_jump = 10;	# To filter out spurios rainfall spikes

$main::opt_h = 0;
$main::opt_v = 0;
$main::opt_d = 0;
$| = 1;                    # autoflush


##
## usage - print usage and exit.
##
sub usage {
        print STDERR <<END;
USAGE: wslogger [-dp] | [interval [count]]
   eg, wslogger         # print human readable output
       wslogger 5       # print every 5 seconds
       wslogger 1 5     # print 5 times, every 1 second
       wslogger -p 60   # print every 60 seconds parseable output
 Fields:
  Time    : Current time
  %IH     : % Indoor humidity
  %OH     : % Outdoor humidity
  ITÂ°C    : Indoor temp Celsius 
  OTÂ°C    : Outdoor temp Celsius
  DPÂ°C    : Outdoor dew point temp Celsius
  WCÂ°C    : Outdoor wind chill temp Celsius
  Wm/s    : Wind speed meter/sec
  Gust    : Wind gust meter/s
  WD      : Wind direction
  1hr     : Rain 1hr
  24hr    : Rain 24hr
  T       : Rain total
  P       : Abs Pressure
END
  exit 1;
}

##
## revision - print revision and exit
##
sub revision {
       print STDERR <<END;
wslogger: 1.4, 2013-01-01
END
       exit 1;
}


##
## Connect to the Weather Station
##

sub open_ws {

	my $usb = shift;
	my $namebuf = "\0" x 256;
	my $dev = $usb->find_device($VENDOR, $PRODUCT);

    	$dev->open();
	if ($dev->get_driver_np(0, $namebuf, 256) == 0) {
        	$dev->detach_kernel_driver_np(0);
    	}	

	if ($dev->claim_interface(0) != 0) {
		printf "usb_claim_interface failed\n";
		return 0;
	}
	$dev->set_altinterface(0);

	return $dev;
}

##
## Close the connection to the Weather Station & exit
##

sub close_ws {
	$dev->release_interface(0);
	undef $dev;
	exit;
}

##
## Dump a buffer in hex for debugging purposes
##

sub print_bytes {
	my $buf = shift;
	my $len = shift;
   
	if ($len <= 0) {
		return;
	}
	my @bytes = unpack("C$len", $buf);

    	if ($len > 0) {
        	for (my $i=0; $i<$len; $i++) {
            		printf "%02x ", $bytes[$i];
        	}
    	}
	printf "\n";
}

##
## Read a 32 byte block of data from the WS
##

sub read_block {
	my $dev = shift;
	my $offset = shift;

        my $xbuf = "\0" x 256;

	my $lsb = $offset & 0xFF;
	my $msb = $offset >>8 & 0xFF;
	my $tbuf = pack('CCCCCCCC', 0xA1, $msb, $lsb, 32, 0xA1, $msb, $lsb, 32);
        my $retval = $dev->control_msg(0x21, 9, 0x200, 0, $tbuf, 8, 1000);
        my $count = $dev->interrupt_read(0x81, $buf, 32, 1000);
	if ($debug) {
                printf ("Retval: %d, Read %d bytes\n", $retval, $count);
        }

	return $buf;
}

##
## Return dew point based on temperature & humidity
##
## http://en.wikipedia.org/wiki/Dew_Point
##

sub dew_point {
	my $temp = shift;
	my $humidity = shift;
	$humidity /= 100.0;
	my $gamma = (17.271 * $temp) / (237.7 + $temp) + log($humidity) ;
	return (237.7 * $gamma) / (17.271 - $gamma);
}

##
## Return wind chill temp based on temperature & wind speed
##
## http://en.wikipedia.org/wiki/Wind_chill
##

sub wind_chill {
	my $temp = shift;
	my $wind = shift;

	my $wind_kph = 3.6 * $wind;
	if (($wind_kph <= 4.8) || ($temp > 10.0)) {
		return $temp;
	}
	my $wct = 13.12 + (0.6215 * $temp) - (11.37 * ($wind_kph ** 0.16)) + (0.3965 * $temp * ($wind_kph ** 0.16));
	if ($wct < $temp) {
		return $wct;
	} else {
		return $temp;
	}
}

##
##
## Main Loop
##
##

my @hourly_rain = ((0) x 60);
my @daily_rain = ((0) x (60*24));
my @wind_dirs = ('N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW');
my @wind_dirs_degs = ('0', '22', '45', '67', '90', '112', '135', '157', '180', '202', '225', '247', '270', '292', '315', '337');
my $previous_rain = 0;

# how often do we trigger
my $first_interval = $interval;

# signal handler is empty, do nothing
$SIG{ALRM} = sub {};

# first value is the initial wait, second is the wait thereafter
setitimer(ITIMER_REAL, $first_interval, $interval);

$SIG{'INT'} = 'close_ws';
$SIG{'TERM'} = 'close_ws';

my $usb = Device::USB->new();
our $dev = open_ws($usb);
if ($dev ==  0) {
	printf "Couldn't connect to the Weather Station\n";
	exit 1;
}

# Loop forever polling the Weather Station

while (1) {

	# Get the first 32 bytes of the fixed block
	my $fixed_block = read_block($dev, 0);
        if ($debug) {
                print_bytes($fixed_block, 32);
        }

        if (unpack('C', $fixed_block) != 0x55) {
                printf("Got a dud fixed block - reconnecting\n");
                $dev->release_interface(0);
		undef $dev;
                sleep 10;
                $dev = open_ws($usb);
                next;
        }

        # Get the current weather record

        my $curpos = unpack('x30S',$fixed_block);
        my $current_block = read_block($dev, $curpos);
        if ($debug) {
                print_bytes($current_block, 32);
                printf ("Current position is %x\n", $curpos);
        }

        if ($line >= $PAGESIZE) {
            # print human readable
            if ($rrd == 0) {
                printf "%8s %3s %3s %6s %6s %6s %6s %5s %5s %3s %4s %4s %5s %6s\n",
                   "Time", "%IH", "%OH", "IT\302\260C", "OT\302\260C",
                   "DP\302\260C", "WC\302\260C", "Wm/s", "Gm/s", "WD",
                   "1Hr", "24Hr", "T", "P";

            }
            $line = 0;
        }
	
	
	# Decode current stats
	
	my $indoor_humidity = unpack('xC', $current_block);
	my $tlsb = unpack('xxC', $current_block);
 	my $tmsb = unpack('xxxC', $current_block) & 0x7f;
	my $tsign = unpack('xxxC', $current_block) >> 7;
	my $indoor_temperature = ($tmsb * 256 + $tlsb) * 0.1;
	if ($tsign) {
		$indoor_temperature *= -1;
	}
	
	my $outdoor_humidity = unpack('x4C', $current_block);
        $tlsb = unpack('x5C', $current_block);
        $tmsb = unpack('x6C', $current_block) & 0x7f;
        $tsign = unpack('x6C', $current_block) >> 7;
        $outdoor_temperature = ($tmsb * 256 + $tlsb) * 0.1;
        if ($tsign) {
                $outdoor_temperature *= -1;
        }

	my $abs_pressure= unpack('x7S', $current_block) * 0.1;
	my $wind = unpack('x9C', $current_block);
	my $gust = unpack('x10C', $current_block);
	my $wind_extra = unpack('x11C', $current_block);
	my $wind_dir = unpack('x12C', $current_block);
	my $total_rain = unpack('x13S', $current_block) * 0.3;

	$wind_speed = ($wind + (($wind_extra & 0x0F) <<8)) * 0.38;	# Was 0.1
	$gust_speed = ($gust + (($wind_extra & 0xF0) <<4)) * 0.38;	# Was 0.1
	
	my $outdoor_dew_point = dew_point($outdoor_temperature, $outdoor_humidity);
	my $wind_chill_temp = wind_chill($outdoor_temperature, $wind_speed);

	# Calculate rainfall rates
	
	if ($previous_rain == 0) {
		$previous_rain = $total_rain;
	}
	my $rain_diff = $total_rain - $previous_rain;

	if ($rain_diff > $max_rain_jump) {		# Filter rainfall spikes
		$rain_diff = 0;
		$total_rain = $previous_rain;
	}

	$previous_rain = $total_rain;
	shift @hourly_rain;
	shift @daily_rain;
	push @hourly_rain, $rain_diff;
	push @daily_rain, $rain_diff;
	my $hourly_rain_rate = 0;
	my $daily_rain_rate = 0;
	($hourly_rain_rate += $_) for @hourly_rain;
	($daily_rain_rate += $_) for @daily_rain;
	
	if ($rrd == 1) {
	    printf("%d:%d:%d:%.1f:%.1f:%.1f:%.1f:%.1f:%.1f:%s:%.1f:%.1f:%.1f:%.1f\n",
	        time,
                $indoor_humidity, $outdoor_humidity, $indoor_temperature, $outdoor_temperature, 
		$outdoor_dew_point, $wind_chill_temp, $wind_speed, $gust_speed, 
                $wind_dirs[$wind_dir], 
                $hourly_rain_rate, $daily_rain_rate, $total_rain,
                $abs_pressure);
	} else {
            my @Time = localtime();
            printf 
               "%02d:%02d:%02d %3d %3d %5.1f %5.1f %5.1f %5.1f %5.1f %5.1f %3s %4.1f %4.1f %4.1f %5.1f\n", 
               $Time[2], $Time[1], $Time[0],
               $indoor_humidity,
               $outdoor_humidity,
	       $indoor_temperature,
	       $outdoor_temperature,
	       $outdoor_dew_point,
	       $wind_chill_temp,
	       $wind_speed,
	       $gust_speed,
	       $wind_dirs[$wind_dir],
	       $hourly_rain_rate,
	       $daily_rain_rate,
	       $total_rain,
	       $abs_pressure;

               # add a newline for clarity in debug mode
               print "\n" if ($debug);

               $line++;
	}
        
	# Write template file for Weather Underground upload

	if (length ($wu_upload_file) > 0) {
		open (FH, ">$wu_upload_file")
			or die ("Unable to open $wu_upload_file : $!");
		my $now_date = strftime "%m/%d/%y", localtime;
		my $now_time = strftime "%H:%M", localtime;
		print (FH "stationDate=$now_date\n");
		print (FH "stationTime=$now_time\n");
		print (FH "windDir=$wind_dirs_degs[$wind_dir]\n");
		print (FH "wind10Avg=$wind_speed\n");
		print (FH "windSpeed=$gust_speed\n");
		print (FH "outsideHumidity=$outdoor_humidity\n");
		print (FH "outsideTemp=$outdoor_temperature\n");
		print (FH "dailyRain=$daily_rain_rate\n");
		print (FH "barometer=$abs_pressure\n");
		print (FH "tempUnit=C\n");
		print (FH "windUnit=km/h\n");
		print (FH "barUnit=hPa\n");
		print (FH "rainUnit=mm\n");
		close (FH);
	}
		

        ### Check for end
        last if ++$loop == $loop_max;

        ### Interval
        pause;

}
