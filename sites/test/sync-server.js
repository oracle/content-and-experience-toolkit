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
	process.exit(0);
};
if (!fs.existsSync(path.join(serversDir, srcServerName, 'server.json'))) {
	console.log('ERROR: sync source server ' + srcServerName + ' does not exist');
	process.exit(0);
};
if (!destServerName) {
	console.log('ERROR: sync destination server is not specified');
	process.exit(0);
};
if (!fs.existsSync(path.join(serversDir, destServerName, 'server.json'))) {
	console.log('ERROR: sync destination server ' + destServerName + ' does not exist');
	process.exit(0);
};

var srcServer = serverUtils.getRegisteredServer(projectDir, srcServerName);
console.log('Source server: ' + srcServer.url);

var destServer = serverUtils.getRegisteredServer(projectDir, destServerName);
console.log('Destination server: ' + destServer.url);

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

app.get('/*', function (req, res) {
	console.log('GET: ' + req.url);
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.write('CEC toolkit sync server');
	res.end();
});

app.post('/*', function (req, res) {
	console.log('POST: ' + req.url);

	if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') < 0) {
		res.writeHead(401, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing Authorization Header' + os.EOL);
		return;
	}

	const base64Credentials = req.headers.authorization.split(' ')[1];
	const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
	if (!credentials || credentials !== username + ':' + password) {
		res.writeHead(401, {
			'Content-Type': 'text/plain'
		});
		res.end('Invalid Authentication Credentials' + os.EOL);
		return;
	}

	var action = req.body.eventAction;
	var type = req.body.objectType;
	var objectId = req.body.objectId;
	console.log('*** action: ' + action + ' type: ' + type + ' Id: ' + objectId);

	if (!action) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing event action' + os.EOL);
		return;
	}
	if (!type) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing object type' + os.EOL);
		return;
	}
	if (!objectId) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing object id' + os.EOL);
		return;
	}
	if (action === 'PUBLISH' && type === 'CHANNEL') {
		var contentGuids = req.body.contentGuids;

		if (!contentGuids || contentGuids.length === 0) {
			res.writeHead(400, {
				'Content-Type': 'text/plain'
			});
			res.end('No content item found' + os.EOL);
			return;
		}
		var args = {
			projectDir: projectDir,
			server: srcServerName,
			destination: destServerName,
			channel: objectId,
			contentGuids: contentGuids
		};

		var logName = 'sync-publish-items.log';
		var defaultLog = process.stdout.write;
		var cLog = fs.createWriteStream(logName);
		process.stdout.write = cLog.write.bind(cLog);
		contentLib.syncPublishItems(args, function () {
			cLog.end(function () {
				process.stdout.write = defaultLog;
				var log = fs.readFileSync(logName).toString();
				console.log(log);
				var statusCode = log.indexOf('ERROR') >= 0 ? 500 : 200;
				res.writeHead(statusCode, {
					'Content-Type': 'text/plain'
				});
				res.end(log);
				console.log('*** status: ' + statusCode);
			});
		});

	} else if ((action === 'CREATE' || action === 'UPDATE') && type === 'CONTENTITEM') {
		var repositoryId = req.body.repositoryId;
		var args = {
			projectDir: projectDir,
			server: srcServerName,
			destination: destServerName,
			action: action,
			id: objectId,
			repositoryId: repositoryId
		};

		var logName = path.join(projectDir, 'sync-' + action.toLowerCase() + '-item.log');
		var defaultLog = process.stdout.write;
		var cLog = fs.createWriteStream(logName);
		process.stdout.write = cLog.write.bind(cLog);
		contentLib.syncCreateUpdateItem(args, function () {
			cLog.end(function () {
				process.stdout.write = defaultLog;
				var log = fs.readFileSync(logName).toString();
				console.log(log);
				var statusCode = log.indexOf('ERROR') >= 0 ? 500 : 200;
				res.writeHead(statusCode, {
					'Content-Type': 'text/plain'
				});
				res.end(log);
				console.log('*** status: ' + statusCode);
			});
		});
	} else if (action === 'DELETE' && type === 'CONTENTITEM') {
		var args = {
			projectDir: projectDir,
			server: srcServerName,
			destination: destServerName,
			action: action,
			id: objectId
		};

		var logName = path.join(projectDir, 'sync-' + action.toLowerCase() + '-item.log');
		var defaultLog = process.stdout.write;
		var cLog = fs.createWriteStream(logName);
		process.stdout.write = cLog.write.bind(cLog);
		contentLib.syncDeleteItem(args, function () {
			cLog.end(function () {
				process.stdout.write = defaultLog;
				var log = fs.readFileSync(logName).toString();
				console.log(log);
				var statusCode = log.indexOf('ERROR') >= 0 ? 500 : 200;
				res.writeHead(statusCode, {
					'Content-Type': 'text/plain'
				});
				res.end(log);
				console.log('*** status: ' + statusCode);
			});
		});
	} else {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('action ' + action + ' not supported yet' + os.EOL);
	}


});

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
	});
} else {
	var localhost = 'http://localhost:' + port;
	var localServer = app.listen(port, function () {
		console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
	});
}