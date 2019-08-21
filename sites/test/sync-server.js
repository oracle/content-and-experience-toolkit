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

app.get('/*', function (req, res) {
	console.log('GET: ' + req.url);
	res.writeHead(200, {
		'Content-Type': 'text/plain'
	});
	res.write('CEC toolkit sync server');
	res.end();
});

app.post('/*', function (req, res) {
	console.log('POST: ' + req.url);

	console.log(req.headers);
	if (req.headers.authorization && req.headers.authorization.indexOf('Basic ') >= 0) {
		const base64Credentials = req.headers.authorization.split(' ')[1];
		const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
		if (!credentials || credentials !== username + ':' + password) {
			res.writeHead(401, {
				'Content-Type': 'text/plain'
			});
			res.end('Invalid Authentication Credentials' + os.EOL);
			console.log('ERROR: Invalid Authentication Credentials');
			return;
		}
	}
	console.log(req.body);
	var action = req.body.eventAction;
	var type = req.body.objectType;
	var objectId = req.body.objectId;
	var objectName = req.body.objectName;
	console.log('*** action: ' + action + ' type: ' + type + ' Id: ' + objectId);

	if (!action) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing event action' + os.EOL);
		console.log('ERROR: Missing event action');
		return;
	}
	if (!type) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing object type' + os.EOL);
		console.log('ERROR: Missing object type');
		return;
	}
	if (!objectId) {
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.end('Missing object id' + os.EOL);
		console.log('ERROR: Missing object id');
		return;
	}
	if (action === 'PUBLISHED' && type === 'CONTENTITEM') {
		// return immediately, webhook has a 5s timout
		res.writeHead(200, {
			'Content-Type': 'text/plain'
		});
		res.end();

		var repositoryId = req.body.repositoryId;
		var channelId = req.body.channelId;

		var args = {
			projectDir: projectDir,
			server: srcServer,
			destination: destServer,
			id: objectId,
			name: objectName,
			repositoryId: repositoryId,
			channelId: channelId
		};

		contentLib.syncPublishItem(args, function (success) {
			console.log('*** action finished');
		});

	} else if ((action === 'CREATED' || action === 'UPDATED') && type === 'CONTENTITEM') {
		// return immediately, webhook has a 5s timout
		res.writeHead(200, {
			'Content-Type': 'text/plain'
		});
		res.end();

		var repositoryId = req.body.repositoryId;
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
		});

	} else if (action === 'DELETED' && type === 'CONTENTITEM') {
		res.writeHead(200, {
			'Content-Type': 'text/plain'
		});
		res.end();

		var args = {
			projectDir: projectDir,
			server: srcServer,
			destination: destServer,
			action: action,
			id: objectId,
			name: objectName
		};

		contentLib.syncDeleteItem(args, function (success) {
			console.log('*** action finished');
		});

	} else {
		res.writeHead(200, {
			'Content-Type': 'text/plain'
		});
		res.end();
		console.log('ERROR: action ' + action + ' not supported yet');
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