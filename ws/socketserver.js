var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8000, path: '/ws'});

var mysql = require('mysql');
var connection = mysql.createConnection({});
var databaseConnectionState = false;


var LOOP_INTERVAL = 1000;
var loopTimer_fhem;
var loopTimer_gpio;
var loopTimer_weatherwarning;
var loopTimer_garbage;

var connectionsArray = [];

var devices = { };

// Build SQL Querys with configuration
var dbConf = require('nconf');
dbConf.use('file', {file: '/etc/hoanoho/socketserver.inc.js'});
dbConf.load();

//var sqlquery_fhem = 'SELECT hoanoho.devices.dev_id, hoanoho.bindata.data image, hoanoho.types.name typename, fhem.current.DEVICE, fhem.current.VALUE, fhem.current.UNIT FROM fhem.current JOIN hoanoho.devices ON hoanoho.devices.identifier = fhem.current.DEVICE JOIN hoanoho.device_types ON hoanoho.device_types.dtype_id = hoanoho.devices.dtype_id JOIN hoanoho.bindata ON hoanoho.bindata.binid = CASE WHEN (fhem.current.VALUE = \'on\' or fhem.current.VALUE > 0) AND hoanoho.device_types.image_on_id is not null THEN hoanoho.device_types.image_on_id ELSE hoanoho.device_types.image_off_id END JOIN hoanoho.types on hoanoho.types.type_id = hoanoho.device_types.type_id WHERE fhem.current.TYPE !=  "GLOBAL" and fhem.current.READING = "state"';
var sqlquery_fhem = 'SELECT distinct ' + dbConf.get('db:fhemDB') + '.current.DEVICE FHEMDEVICE, ' + dbConf.get('db:hoanohoDB') + '.devices.dev_id, ' + dbConf.get('db:hoanohoDB') + '.bindata.data image, ' + dbConf.get('db:hoanohoDB') + '.types.name typename, ' + dbConf.get('db:fhemDB') + '.current.timestamp, ' + dbConf.get('db:hoanohoDB') + '.devices.identifier, ' + dbConf.get('db:hoanohoDB') + '.devices.identifier DEVICE, ' + dbConf.get('db:fhemDB') + '.current.READING, ' + dbConf.get('db:fhemDB') + '.current.VALUE, ' + dbConf.get('db:fhemDB') + '.current.UNIT '+
					'FROM ' + dbConf.get('db:fhemDB') + '.current ' +
						'JOIN ' + dbConf.get('db:hoanohoDB') + '.devices ON ' + dbConf.get('db:fhemDB') + '.current.DEVICE like concat(' + dbConf.get('db:hoanohoDB') + '.devices.identifier,\'%\') '+
						'JOIN ' + dbConf.get('db:hoanohoDB') + '.device_types ON ' + dbConf.get('db:hoanohoDB') + '.device_types.dtype_id = ' + dbConf.get('db:hoanohoDB') + '.devices.dtype_id '+
						'LEFT OUTER JOIN ' + dbConf.get('db:hoanohoDB') + '.bindata ON ' + dbConf.get('db:hoanohoDB') + '.bindata.binid = '+
							'CASE WHEN (' + dbConf.get('db:fhemDB') + '.current.VALUE = \'on\' or ' + dbConf.get('db:fhemDB') + '.current.VALUE = \'closed\' or replace(replace(' + dbConf.get('db:fhemDB') + '.current.VALUE, \'dim\', \'\'), \'%\', \'\') > 0) AND ' + dbConf.get('db:hoanohoDB') + '.device_types.image_on_id is not null and ' + dbConf.get('db:fhemDB') + '.current.READING = \'state\' THEN '+
								'' + dbConf.get('db:hoanohoDB') + '.device_types.image_on_id '+
							'WHEN (' + dbConf.get('db:fhemDB') + '.current.VALUE = \'off\' or ' + dbConf.get('db:fhemDB') + '.current.VALUE = \'open\' or replace(replace(' + dbConf.get('db:fhemDB') + '.current.VALUE, \'dim\' ,\'\'), \'%\', \'\') = 0) AND ' + dbConf.get('db:hoanohoDB') + '.device_types.image_on_id is not null and ' + dbConf.get('db:fhemDB') + '.current.READING = \'state\' THEN '+
								'' + dbConf.get('db:hoanohoDB') + '.device_types.image_off_id '+
							'ELSE '+
								'null '+
							'END '+
						'JOIN ' + dbConf.get('db:hoanohoDB') + '.types on ' + dbConf.get('db:hoanohoDB') + '.types.type_id = ' + dbConf.get('db:hoanohoDB') + '.device_types.type_id '+
					'WHERE ' + dbConf.get('db:fhemDB') + '.current.READING in (SELECT DISTINCT ' + dbConf.get('db:fhemDB') + '.current.READING FROM ' + dbConf.get('db:fhemDB') + '.current WHERE ' + dbConf.get('db:fhemDB') + '.current.type != "GLOBAL")';

var sqlquery_gpio = 'select ' + dbConf.get('db:hoanohoDB') + '.device_data.VALUE, t1.deviceident DEVICE, ' + dbConf.get('db:hoanohoDB') + '.types.name typename, ' + dbConf.get('db:hoanohoDB') + '.bindata.data image, ' + dbConf.get('db:hoanohoDB') + '.devices.dev_id  from ' + dbConf.get('db:hoanohoDB') + '.device_data ' +
						'join ( ' +
								'select max(ddid) ddid, deviceident, max(timestamp) from ' + dbConf.get('db:hoanohoDB') + '.device_data group by deviceident ' +
							  ') t1 on t1.ddid = device_data.ddid ' +
						'join ' + dbConf.get('db:hoanohoDB') + '.devices on devices.identifier = t1.deviceident ' +
						'join ' + dbConf.get('db:hoanohoDB') + '.device_types on devices.dtype_id = device_types.dtype_id ' +
						'join ' + dbConf.get('db:hoanohoDB') + '.types on device_types.type_id = types.type_id ' +
						'join ' + dbConf.get('db:hoanohoDB') + '.bindata ON ' + dbConf.get('db:hoanohoDB') + '.bindata.binid = CASE WHEN (VALUE = \'on\' or VALUE > 0) AND ' + dbConf.get('db:hoanohoDB') + '.device_types.image_on_id is not null THEN ' + dbConf.get('db:hoanohoDB') + '.device_types.image_on_id ELSE ' + dbConf.get('db:hoanohoDB') + '.device_types.image_off_id END ' +
						'where types.name = "Raspberry Pi GPIO"';
var sqlquery_weatherwarning = 'select id, name, data from ' + dbConf.get('db:hoanohoDB') + '.cron_data where name = \'dwd_warning\'';
var sqlquery_garbage = 'select id, date_format(pickupdate, \'%d.%m.%Y\') pickupdate,text from ' + dbConf.get('db:hoanohoDB') + '.garbageplan where date(NOW()) = pickupdate -INTERVAL 1 DAY';

// helper to count nested objects
Object.prototype.count = function() {
    var that = this,
        count = 0;

    for(property in that) {
        if(that.hasOwnProperty(property)) {
            count++;
        }
    }

    return count;
};



var loop_fhem = function () {
	if(databaseConnectionState == true)
	{
		var query = connection.query(sqlquery_fhem);
		//var query_gpio = connection.query(sqlquery_gpio);
		
		query
		.on('result',function(result)
		{
			if(result.DEVICE.length > 0)
			{
				if(!devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING] || devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING].value != result.VALUE)
				{
					devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING] = {device:result.DEVICE, fhemdevice:result.FHEMDEVICE, typename:result.typename, reading:result.READING, value:result.VALUE, dev_id:result.dev_id, image:result.image};

					connectionsArray.forEach(function(tmpSocket){
						if(tmpSocket != null)
							sendMessage(tmpSocket, devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING]);
				    });
				}
			}
		})

		.on('end',function()
		{
	        if(connectionsArray.length) {
	            loopTimer_fhem = setTimeout( loop_fhem, LOOP_INTERVAL );
	        }
	    });
    }
}

var loop_gpio = function () {
	if(databaseConnectionState == true)
	{
		var query_gpio = connection.query(sqlquery_gpio);

	    query_gpio
		.on('result',function(result)
		{			
			if(!devices[result.DEVICE] || devices[result.DEVICE].value != result.VALUE)
			{
				devices[result.DEVICE] = {device:result.DEVICE, typename:result.typename, value:result.VALUE, dev_id:result.dev_id, image:result.image};

				connectionsArray.forEach(function(tmpSocket){
					if(tmpSocket != null)
						sendMessage(tmpSocket, devices[result.DEVICE]);
			    });
			}
		})

		.on('end',function()
		{
	        if(connectionsArray.length) {
	            loopTimer_gpio = setTimeout( loop_gpio, LOOP_INTERVAL );
	        }
	    });
    }
}

var loop_weatherwarning = function () {
	if(databaseConnectionState == true)
	{
		var query_weatherwarning = connection.query(sqlquery_weatherwarning);

	    query_weatherwarning
		.on('result',function(result)
		{
			if(!devices['weatherwarn_'+result.id] || devices['weatherwarn_'+result.id].value != result.data)
			{
				devices['weatherwarn_'+result.id] = {device:result.name, typename:result.name, value:result.data, dev_id:result.id, image:null};

				connectionsArray.forEach(function(tmpSocket){
					if(tmpSocket != null)
						sendMessage(tmpSocket, devices['weatherwarn_'+result.id]);
			    });
			}
		})

		.on('end',function()
		{
	        if(connectionsArray.length) {
	            loopTimer_weatherwarning = setTimeout( loop_weatherwarning, LOOP_INTERVAL );
	        }
	    });
    }
}

var loop_garbage = function () {
	if(databaseConnectionState == true)
	{
		var query_garbage = connection.query(sqlquery_garbage);

	    query_garbage
		.on('result',function(result)
		{
			if(!devices['garbage'+result.id] || devices['garbage'+result.id].value.length != result.length)
			{
				devices['garbage'+result.id] = {device:'garbage', typename:'garbage', value:result, dev_id:null, image:null};

				connectionsArray.forEach(function(tmpSocket){
					if(tmpSocket != null)
						sendMessage(tmpSocket, devices['garbage'+result.id]);
			    });
			}
		})

		.on('end',function()
		{
	        if(connectionsArray.length) {
	            loopTimer_garbage = setTimeout( loop_garbage, LOOP_INTERVAL );
	        }
	    });
    }
}


// Message stuff

function sendMessage(socket, message)
{
	try {
		socket.send(JSON.stringify(message));
		//console.log("sending message: " + message);
	} catch (e) {
		console.log("socket send error: "+e);
	}
};
 



// Socket stuff

wss.on('connection', function(socket) 
{
	// on receiving message from client
	socket.on('message', function(message) 
	{
		var messageObj = JSON.parse(message);

		if(messageObj['command'] == "update_device")
		{
			for(var device in devices) {
		    	if(device != "count") {
		    		if(devices[device].dev_id == messageObj['message'])
		    		{
		    			delete devices[device];
		    		}
		    	}
		    }
		}
	});

	socket.on('close', function() 
	{
		if(connectionsArray.length > 0)
		{
			connectionsArray.splice(connectionsArray.indexOf(socket),1);
			console.log('Client getrennt - Verbindungsanzahl: ' + connectionsArray.length);
		}
	});

	

	if (!connectionsArray.length) {
        loop_fhem();
        loop_gpio();
        loop_weatherwarning();
        loop_garbage();
    }

    if(databaseConnectionState)
    {
		connectionsArray.push(socket);
		console.log('Client verbunden - Verbindungsanzahl: ' + connectionsArray.length);

		if(devices.count() > 0)
		{
		    for(var device in devices) {
		    	if(device != "count") {
		    		sendMessage(socket, devices[device]);
		    	}
		    }
		}
	}
	else
	{
		// close this socket connection
		socket.close();
	}
});


function disconnectAllConnectedClients() {
	connectionsArray.forEach(function(tmpSocket){
		if(tmpSocket != null){
			tmpSocket.close();
		}
	});
}


/* Database stuff */

function connectDatabase() {

	var nconf = require('nconf');
	nconf.use('file', {file: '/etc/hoanoho/socketserver.inc.js'});
	nconf.load();

	connection  = mysql.createConnection({
        host        : nconf.get('db:host'),
        user        : nconf.get('db:user'),
        password    : nconf.get('db:password'),
        database    : nconf.get('db:hoanohoDB')
    });

    connection.on('close', function (err) {
		console.log("Connection to database closed.")
		databaseConnectionState = false;

		// close all socket connections
		disconnectAllConnectedClients();
	});

	connection.on('error', function (err) {
		console.log('database error: ' + err);
		databaseConnectionState = false;

		// close all socket connections
		disconnectAllConnectedClients();
	});
}

var dbConnChecker = setInterval(function(){
  if(!databaseConnectionState)
  {
    console.log('Database not connected, attempting to connect ...');
   
   	connectDatabase();

    connection.connect(function(err) {
		//if(err != null)
			//console.log(err);
		if(!err) //else
		{
			console.log("Connection to database established.");
			databaseConnectionState = true;

			var query_fhem = connection.query(sqlquery_fhem);
			var query_gpio = connection.query(sqlquery_gpio);
			var query_weatherwarning = connection.query(sqlquery_weatherwarning);
			var query_garbage = connection.query(sqlquery_garbage);


			query_fhem
			.on('result',function(result)
			{	
				if(result.DEVICE.length > 0)
				{
					if(!devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING] || devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING].value != result.VALUE)
					{
						devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING] = {device:result.DEVICE, fhemdevice:result.FHEMDEVICE, typename:result.typename, reading:result.READING, value:result.VALUE, dev_id:result.dev_id, image:result.image};

						connectionsArray.forEach(function(tmpSocket){
							if(tmpSocket != null)
								sendMessage(tmpSocket, devices[result.DEVICE+"_"+result.FHEMDEVICE+"_"+result.READING]);
					    });
					}
				}
			})

			query_gpio
			.on('result',function(result)
			{	
				if(!devices[result.DEVICE] || devices[result.DEVICE].value != result.VALUE)
				{
					devices[result.DEVICE] = {device:result.DEVICE, typename:result.typename, value:result.VALUE, dev_id:result.dev_id, image:result.image};

					connectionsArray.forEach(function(tmpSocket){
						if(tmpSocket != null)
							sendMessage(tmpSocket, devices[result.DEVICE]); 
				    });
				}
			})

			query_weatherwarning
			.on('result',function(result)
			{	
				if(!devices['weatherwarn_'+result.id] || devices['weatherwarn_'+result.id].value != result.data)
				{
					devices['weatherwarn_'+result.id] = {device:result.name, typename:result.name, value:result.data, dev_id:result.id, image:null};

					connectionsArray.forEach(function(tmpSocket){
						if(tmpSocket != null)
							sendMessage(tmpSocket, devices['weatherwarn_'+result.id]);
				    });
				}
			})

			query_garbage
			.on('result',function(result)
			{	
				if(!devices['garbage'+result.id] || devices['garbage'+result.id].value.length != result.length)
				{
					devices['garbage'+result.id] = {device:'garbage', typename:'garbage', value:result, dev_id:null, image:null};

					connectionsArray.forEach(function(tmpSocket){
						if(tmpSocket != null)
							sendMessage(tmpSocket, devices['garbage'+result.id]); 
				    });
				}
			})
		}
	});
  }
}, 2000);

























function utf8_encode(argString) {
  //  discuss at: http://phpjs.org/functions/utf8_encode/
  // original by: Webtoolkit.info (http://www.webtoolkit.info/)
  // improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // improved by: sowberry
  // improved by: Jack
  // improved by: Yves Sucaet
  // improved by: kirilloid
  // bugfixed by: Onno Marsman
  // bugfixed by: Onno Marsman
  // bugfixed by: Ulrich
  // bugfixed by: Rafal Kukawski
  // bugfixed by: kirilloid
  //   example 1: utf8_encode('Kevin van Zonneveld');
  //   returns 1: 'Kevin van Zonneveld'

  if (argString === null || typeof argString === 'undefined') {
    return '';
  }

  var string = (argString + ''); // .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var utftext = '',
    start, end, stringl = 0;

  start = end = 0;
  stringl = string.length;
  for (var n = 0; n < stringl; n++) {
    var c1 = string.charCodeAt(n);
    var enc = null;

    if (c1 < 128) {
      end++;
    } else if (c1 > 127 && c1 < 2048) {
      enc = String.fromCharCode(
        (c1 >> 6) | 192, (c1 & 63) | 128
      );
    } else if ((c1 & 0xF800) != 0xD800) {
      enc = String.fromCharCode(
        (c1 >> 12) | 224, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128
      );
    } else { // surrogate pairs
      if ((c1 & 0xFC00) != 0xD800) {
        throw new RangeError('Unmatched trail surrogate at ' + n);
      }
      var c2 = string.charCodeAt(++n);
      if ((c2 & 0xFC00) != 0xDC00) {
        throw new RangeError('Unmatched lead surrogate at ' + (n - 1));
      }
      c1 = ((c1 & 0x3FF) << 10) + (c2 & 0x3FF) + 0x10000;
      enc = String.fromCharCode(
        (c1 >> 18) | 240, ((c1 >> 12) & 63) | 128, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128
      );
    }
    if (enc !== null) {
      if (end > start) {
        utftext += string.slice(start, end);
      }
      utftext += enc;
      start = end = n + 1;
    }
  }

  if (end > start) {
    utftext += string.slice(start, stringl);
  }

  return utftext;
}

function utf8_decode(str_data) {
  //  discuss at: http://phpjs.org/functions/utf8_decode/
  // original by: Webtoolkit.info (http://www.webtoolkit.info/)
  //    input by: Aman Gupta
  //    input by: Brett Zamir (http://brett-zamir.me)
  // improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // improved by: Norman "zEh" Fuchs
  // bugfixed by: hitwork
  // bugfixed by: Onno Marsman
  // bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // bugfixed by: kirilloid
  //   example 1: utf8_decode('Kevin van Zonneveld');
  //   returns 1: 'Kevin van Zonneveld'

  var tmp_arr = [],
    i = 0,
    ac = 0,
    c1 = 0,
    c2 = 0,
    c3 = 0,
    c4 = 0;

  str_data += '';

  while (i < str_data.length) {
    c1 = str_data.charCodeAt(i);
    if (c1 <= 191) {
      tmp_arr[ac++] = String.fromCharCode(c1);
      i++;
    } else if (c1 <= 223) {
      c2 = str_data.charCodeAt(i + 1);
      tmp_arr[ac++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
      i += 2;
    } else if (c1 <= 239) {
      // http://en.wikipedia.org/wiki/UTF-8#Codepage_layout
      c2 = str_data.charCodeAt(i + 1);
      c3 = str_data.charCodeAt(i + 2);
      tmp_arr[ac++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      i += 3;
    } else {
      c2 = str_data.charCodeAt(i + 1);
      c3 = str_data.charCodeAt(i + 2);
      c4 = str_data.charCodeAt(i + 3);
      c1 = ((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
      c1 -= 0x10000;
      tmp_arr[ac++] = String.fromCharCode(0xD800 | ((c1 >> 10) & 0x3FF));
      tmp_arr[ac++] = String.fromCharCode(0xDC00 | (c1 & 0x3FF));
      i += 4;
    }
  }

  return tmp_arr.join('');
}
