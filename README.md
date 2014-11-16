# Hoanoho
Hoanoho is Maori and means Roommate. Hoanoho is a beautiful state of the art Frontend for FHEM.
It is designed to run a Raspberry Pi.


## Prerequisites

You need a fully working installation of FHEM and the corresponding actuators in your home environment.
DbLog module needs to be activated in FHEM.

A local web server together with PHP5 and MySQL as well as a working node.js installation.

PHP needs the following modules to be installed:

* php5-curl
* php5-gd
* php5-imagick
* php5-imap
* php5-mysql

node.js needs the following modules to be installed:

* mysql
* socket.io
* ws
* nconf
* forever

However, a copy of those modules currently comes with the Hoanoho repository directly so there is no need to install them within your system environment.

## Installation
Just put these files into your webserver root directory and go through the installer located under **http://yourhostname/install**.
Installation in a subdirectory might not be fully supported at this stage.
The installer will setup the initial database structure as well as store database credentials in `config/dbconfig.inc.php`.

You should also edit the Database credentials in file 'ws/socketserver.js'.
Daemonize the Socketserver by using the template startup file in `install/init.d/socketserver`.
The socketserver runs on port 8000, ensure this is accessible from external (e.g. open your firewall).

Give write access to folders named **pupnp**.

Cronjobs you should be activating can be found in `install/cron.d`. Ideally you just symlink the files to `/etc/cron.d` so they can be updated if you update Hoanoho using git pull command.

Depending on your actual installation directory, you should add **HOANOHO_DIR="/var/www/hoanoho"** to `/etc/environment` to ensure all scripts can reliably find their home directory.

FHEM needs to have DbLog module activated and configured properly.
Hoanoho and FHEM require to use the same MySQL server. The MySQL user for Hoanoho needs to have at least read-only access to the FHEM database as well as read+write access to it's own database.

If you are using a reverse proxy in your setup, you might want to ensure the URI **/helper-server** can only be accessed via localhost. URI **/api** may be restricted for local network access only.

## Compatibility List

Currently the following devices are supported:

### Actuators:
* Homematic HM-LC-Sw1PBU-FM
* Homematic HM-LC-Bl1PBU-FM
* Homematic HM-TC-IT-WM-W-EU
* Homematic HM-ES-PMSw1-Pl
* Homematic HM-LC-SW1-FM
* Homematic HM-Sec-TiS
* Homematic HM-SEC-SC-2

### Weather Stations
* Froggit WH1080

### Photovoltaics
* PVserver

### Power Meter / Energy Meter
* Iskra MT681

### Lawn Sprinkler
* Gardena selfbuild via Raspberry PI GPIO
