/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, process, __dirname */
/* jshint esversion: 6 */

/**
 * sync changes notified by web hook from SRC to DEST servers
 */

var express = require('express'),
	app = express(),
	fs = require('fs'),
	https = require('https'),
	os = require('os'),
	path = require('path'),
	request = require('request'),
	cors = require('cors'),
	contentLib = require('../bin/content.js'),
	serverUtils = require('./server/serverUtils.js');

var cecDir = path.join(__dirname, "..");
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;

var port = process.env.CEC_TOOLKIT_SYNC_PORT || 8086;

var srcfolder = serverUtils.getSourceFolder(projectDir);
var serversDir = path.join(srcfolder, 'servers');

var srcServerName = process.env.CEC_TOOLKIT_SYNC_SRC;
var destServerName = process.env.CEC_TOOLKIT_SYNC_DEST;

if (!srcServerName) {
	console.log('ERROR: sync source server is not specified');
	process.exit(1);
};
if (!fs.existsSync(path.join(serversDir, srcServerName, 'server.json'))) {
	console.log('ERROR: sync source server ' + srcServerName + ' does not exist');
	process.exit(1);
};
var srcServer = serverUtils.verifyServer(srcServerName, projectDir);
if (!srcServer || !srcServer.valid) {
	process.exit(1);
};
if (!destServerName) {
	console.log('ERROR: sync destination server is not specified');
	process.exit(1);
};
if (!fs.existsSync(path.join(serversDir, destServerName, 'server.json'))) {
	console.log('ERROR: sync destination server ' + destServerName + ' does not exist');
	process.exit(1);
};
var destServer = serverUtils.verifyServer(destServerName, projectDir);
if (!destServer || !destServer.valid) {
	process.exit(1);
};

var keyPath = process.env.CEC_TOOLKIT_SYNC_HTTPS_KEY;
var certPath = process.env.CEC_TOOLKIT_SYNC_HTTPS_CERTIFICATE;

var username = process.env.CEC_TOOLKIT_SYNC_USERNAME;
var password = process.env.CEC_TOOLKIT_SYNC_PASSWORD;

app.use(cors());
app.use(express.json());

// enable cookies
request = request.defaults({
	jar: true,
	proxy: null
});

var eventsFilePath = path.join(projectDir, 'events.json');
var hasUnprocessedEvent = false;
if (!fs.existsSync(eventsFilePath)) {
	fs.writeFileSync(eventsFilePath, '[]');
} else {
	var str = fs.readFileSync(eventsFilePath).toString();
	if (str) {
		var unprocessedEvents = [];
		try {
			events = JSON.parse(str);
		} catch (e) {
			events = [];
			fs.writeFileSync(eventsFilePath, '[]');
		}
		for (var i = 0; i < events.length; i++) {
			if (!events[i].__processed) {
				unprocessedEvents.push(events[i]);
				hasUnprocessedEvent = true;
			} else {
				// save processed events for 7 days
				var currTime = (new Date()).getTime();
				var processTime = (new Date(events[i].__processed_date)).getTime();
				var days = (currTime - processTime) / (1000 * 60 * 60 * 24);
				if (days <= 7) {
					unprocessedEvents.push(events[i]);
				}
			}
		}
		fs.writeFileSync(eventsFilePath, JSON.stringify(unprocessedEvents, null, 4));
	}
}


app.get('/*', function (req, res) {
	console.log('GET: ' + req.url);
	res.writeHead(200, {
		'Content-Type': 'text/plain'
	});
	res.write('CEC toolkit sync server');
	res.end();
});

app.post('/*', function (req, res) {
	// console.log('POST: ' + req.url);

	// return immediately, otherwise webhook will resend the event 2 more times
	res.writeHead(200, {
		'Content-Type': 'text/plain'
	});
	res.end();

	// console.log(req.headers);
	if (req.headers.authorization && req.headers.authorization.indexOf('Basic ') >= 0) {
		const base64Credentials = req.headers.authorization.split(' ')[1];
		const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
		if (!credentials || credentials !== username + ':' + password) {
			console.log('ERROR: Invalid Authentication Credentials');
			return;
		}
	}
	// console.log(req.body);
	var action = req.body.event.name;
	var objectId = req.body.entity.id;

	if (!action) {
		console.log('ERROR: Missing event action');
		return;
	}
	if (!objectId) {
		console.log('ERROR: Missing object id');
		return;
	}

	if (action === 'CONTENTITEM_CREATED' ||
		action === 'CONTENTITEM_UPDATED' ||
		action === 'CONTENTITEM_DELETED' ||
		action === 'DIGITALASSET_CREATED' ||
		action === 'DIGITALASSET_UPDATED' ||
		action === 'DIGITALASSET_DELETED' ||
		action === 'CHANNEL_ASSETPUBLISHED' ||
		action === 'CHANNEL_ASSETUNPUBLISHED') {
		var events = [];
		if (fs.existsSync(eventsFilePath)) {
			var str = fs.readFileSync(eventsFilePath).toString();
			if (str) {
				events = JSON.parse(str);
			}
		}

		var event = req.body;
		event['__id'] = event.event.id;
		event['__processed'] = false;
		events.push(event);

		console.log('!!! Queue event: action: ' + action + ' Id: ' + objectId + ' (total: ' + events.length + ')');

		fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 4));

	} else {
		console.log('ERROR: action ' + action + ' not supported yet');
	}
});

var __active = false;

// This function is used to monitor the message text file data change.
var _watchEvents = function () {
	// This is the fs watch function.
	fs.watch(eventsFilePath, function (event, filename) {
		// If data change then send new text back to client.
		if (event === "change" && !__active) {
			// console.log('File ' + eventsFilePath + ' changed...');
			_processEvent();
		}
	});
};

// Handle startup errors
process.on('uncaughtException', function (err) {
	'use strict';
	if (err.code === 'EADDRINUSE' || err.errno === 'EADDRINUSE') {
		console.log('======================================');
		console.error(`Another server is using port ${err.port}. Stop that process and try to start the server again.`);
		console.log('======================================');
	} else {
		console.error(err);
	}
});

// start the server

if (keyPath && fs.existsSync(keyPath) && certPath && fs.existsSync(certPath)) {
	var httpsOptions = {
		key: fs.readFileSync(keyPath),
		cert: fs.readFileSync(certPath)
	};
	var localhost = 'https://localhost:' + port;
	https.createServer(httpsOptions, app).listen(port, function () {
		console.log('Server starts: ' + localhost);
		if (hasUnprocessedEvent) {
			_processEvent();
		}
		_watchEvents();
	});
} else {
	var localhost = 'http://localhost:' + port;
	var localServer = app.listen(port, function () {
		console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
		if (hasUnprocessedEvent) {
			_processEvent();
		}
		_watchEvents();
	});
}

var _updateEvent = function (eventId, success, retry) {
	var events = [];
	if (fs.existsSync(eventsFilePath)) {
		var str = fs.readFileSync(eventsFilePath).toString();
		if (str) {
			events = JSON.parse(str);
		}

		var newList = [];
		var theEvent;
		var found = false;
		for (var i = 0; i < events.length; i++) {
			if (eventId === events[i].__id) {
				found = true;
				events[i]['__processed_date'] = new Date();
				events[i]['__success'] = success === undefined ? false : success;

				if (retry === undefined || !retry) {
					// done for this event
					events[i].__processed = true;
					newList.push(events[i]);
				} else {
					// check if need retry
					if (events[i].__retry !== undefined &&  events[i].__retry > 10) {
						console.log(' -- already tried ' + events[i].__retry + ' times, give up');
						events[i].__processed = true;
						newList.push(events[i]);
					} else {
						console.log(' -- will retey');
						serverUtils.sleep(6000);
						events[i]['__retry'] = events[i].__retry ? (events[i].__retry + 1) : 1;
						theEvent = events[i];
					}
				}
			} else {
				newList.push(events[i]);
			}
		}
		if (theEvent) {
			// move to the end
			newList.push(theEvent);
		}
		if (found) {
			fs.writeFileSync(eventsFilePath, JSON.stringify(newList, null, 4));
			// console.log('updated events.json');
			// console.log(events);
			__active = false;
		}
	} else {
		__active = false;
	}
};
var _processEvent = function () {
	var events = [];
	if (fs.existsSync(eventsFilePath)) {
		var str = fs.readFileSync(eventsFilePath).toString();
		if (str) {
			try {
				events = JSON.parse(str);
			} catch (e) {}
		}
	}

	var event;
	for (var i = 0; i < events.length; i++) {
		if (!events[i].__processed) {
			event = events[i];
			break;
		}
	}
	if (event) {
		// start processing
		__active = true;

		var action = event.event.name;
		var objectId = event.entity.id;
		var objectName = event.entity.name;
		console.log('*** action: ' + action + ' Id: ' + objectId);

		if (action === 'CONTENTITEM_CREATED' ||
			action === 'CONTENTITEM_UPDATED' ||
			action === 'DIGITALASSET_CREATED' ||
			action == 'DIGITALASSET_UPDATED') {

			var repositoryId = event.entity.repositoryId;
			var args = {
				projectDir: projectDir,
				server: srcServer,
				destination: destServer,
				action: action,
				id: objectId,
				repositoryId: repositoryId
			};

			contentLib.syncCreateUpdateItem(args, function (success) {
				console.log('*** action finished');
				_updateEvent(event.__id, success);
			});

		} else if (action === 'CONTENTITEM_DELETED' || action === 'DIGITALASSET_DELETED') {

			var args = {
				projectDir: projectDir,
				server: srcServer,
				destination: destServer,
				action: action,
				id: objectId,
				name: objectName
			};

			contentLib.syncDeleteItem(args, function (success, retry) {
				console.log('*** action finished');
				_updateEvent(event.__id, success, retry);
			});

		} else if (action === 'CHANNEL_ASSETPUBLISHED' || action === 'CHANNEL_ASSETUNPUBLISHED') {
			var contentGuids = [];
			var items = event.entity.items || [];
			for (var i = 0; i < items.length; i++) {
				contentGuids.push(items[i].id);
			}
			var args = {
				projectDir: projectDir,
				server: srcServer,
				destination: destServer,
				action: action === 'CHANNEL_ASSETPUBLISHED' ? 'publish' : 'unpublish',
				id: objectId,
				name: objectName,
				contentGuids: contentGuids
			};

			contentLib.syncPublishUnpublishItems(args, function (success) {
				console.log('*** action finished');
				_updateEvent(event.__id, success);
			});

		}

	} // event exists
};