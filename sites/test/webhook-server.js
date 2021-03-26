/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, process, __dirname */
/* jshint esversion: 6 */

/**
 * webhook listener to handle events from OCE webhook
 */

var express = require('express'),
	app = express(),
	fs = require('fs'),
	path = require('path'),
	request = require('request'),
	cors = require('cors'),
	siteLib = require('../bin/site.js'),
	serverUtils = require('./server/serverUtils.js');

var cecDir = path.join(__dirname, "..");
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;

var port = process.env.CEC_TOOLKIT_WEBHOOK_PORT || 8087;

var srcfolder = serverUtils.getSourceFolder(projectDir);
var serversDir = path.join(srcfolder, 'servers');

var srcServerName = process.env.CEC_TOOLKIT_WEBHOOK_SERVER;

if (!srcServerName) {
	console.log('ERROR: sync source server is not specified');
	process.exit(1);
}
if (!fs.existsSync(path.join(serversDir, srcServerName, 'server.json'))) {
	console.log('ERROR: sync source server ' + srcServerName + ' does not exist');
	process.exit(1);
}
var srcServer = serverUtils.verifyServer(srcServerName, projectDir);
if (!srcServer || !srcServer.valid) {
	process.exit(1);
}

var typeNames = process.env.CEC_TOOLKIT_WEBHOOK_CONTENTTYPE.split(',');
var detailPages = process.env.CEC_TOOLKIT_WEBHOOK_DETAILPAGE.split(',');

var typeDetailPages = [];
for (var i = 0; i < typeNames.length; i++) {
	if (i < detailPages.length) {
		var detailpage = detailPages[i];
		if (detailpage && detailpage.endsWith('/')) {
			detailpage = detailpage.substring(0, detailpage.length - 1);
		}
		if (detailpage) {
			typeDetailPages.push({
				type: typeNames[i],
				detailpage: detailpage
			});
		}
	}
}
// console.log(typeDetailPages);

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
	res.write('CEC toolkit webhook server');
	res.end();
});

app.post('/*', function (req, res) {
	// console.log('POST: ' + req.url);

	// return immediately, otherwise webhook will resend the event 2 more times
	res.writeHead(200, {
		'Content-Type': 'text/plain'
	});
	res.end();

	var webHookName = req.body.webhook && req.body.webhook.name;
	// console.log('!!! event from ' + webHookName);

	// console.log(req.headers);

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

	if (action === 'CHANNEL_ASSETPUBLISHED') {
		var events = [];
		if (fs.existsSync(eventsFilePath)) {
			var str = fs.readFileSync(eventsFilePath).toString();
			if (str) {
				events = JSON.parse(str);
			}
		}

		var event = req.body;

		// get item's basic properties and save to events file
		var items = [];
		var eventItems = event.entity && event.entity.items && event.entity.items.length ? event.entity.items : [];
		eventItems.forEach(function (eitem) {
			items.push({
				id: eitem.id,
				name: eitem.name,
				slug: eitem.slug,
				type: eitem.type
			});
		});
		event.entity.items = items;

		event['__id'] = event.event.id;
		event['__processed'] = false;
		events.push(event);

		console.log('!!! Queue event: webhook: ' + webHookName + ' action: ' + action + ' Id: ' + objectId);

		fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 4));

	} else {
		console.log('ERROR: action ' + action + ' not supported yet');
		// console.log(req.body);
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
var localhost = 'http://localhost:' + port;
var localServer = app.listen(port, function () {
	console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
	if (hasUnprocessedEvent) {
		_processEvent();
	}
	_watchEvents();
});


var _updateEvent = function (eventId, success, timeused) {
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
				events[i]['__timeUsed'] = timeused;
				events[i].__processed = true;
				newList.push(events[i]);

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


		console.log('*** webhook: ' + event.webhook.name + ' action: ' + action + ' registeredAt ' + event.event.registeredAt + ' Id: ' + objectId);

		var startTime = new Date();
		var timeUsed;

		if (action === 'CHANNEL_ASSETPUBLISHED') {

			var items = event.entity.items || [];

			var args = {
				projectDir: projectDir,
				server: srcServer,
				id: objectId,
				name: objectName,
				items: items,
				typeDetailPages: typeDetailPages
			};

			siteLib.refreshSitePrerenderCache(args, function (success) {
				timeUsed = serverUtils.timeUsed(startTime, new Date());
				console.log('*** action finished status: ' + (success ? 'successful' : 'failed') + ' [' + timeUsed + ']');
				console.log(' ');
				_updateEvent(event.__id, success, timeUsed);
			});


		}
	} // event exists
};