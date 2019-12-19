/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, process, __dirname */
/* jshint esversion: 6 */

/**
 * compile server
 */

var express = require('express'),
	app = express(),
	fs = require('fs'),
	https = require('https'),
	path = require('path'),
	serverUtils = require('./server/serverUtils.js'),
	bodyParser = require('body-parser'),
	compiler = require('./connector/compilationService.js'),
	responses = require('./connector/connectorResponses'),
	server = express(),
	router = express.Router();

var cecDir = path.join(__dirname, "..");
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;

var port = process.env.CEC_TOOLKIT_COMPILATION_PORT || 8087;

var srcfolder = serverUtils.getSourceFolder(projectDir);
var serversDir = path.join(srcfolder, 'servers');

var compileServerName = process.env.CEC_TOOLKIT_COMPILATION_SERVER || 'server';

if (!compileServerName) {
	console.log('ERROR: compile server server is not specified');
	process.exit(1);
};
if (!fs.existsSync(path.join(serversDir, compileServerName, 'server.json'))) {
	console.log('ERROR: compile server server ' + compileServerName + ' does not exist');
	process.exit(1);
};
var srcServer = serverUtils.verifyServer(compileServerName, projectDir);
if (!srcServer || !srcServer.valid) {
	process.exit(1);
};

var keyPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_KEY;
var certPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_CERTIFICATE;

var username = process.env.CEC_TOOLKIT_COMPILATION_USERNAME;
var password = process.env.CEC_TOOLKIT_COMPILATION_PASSWORD;

server.set('port', port);
server.use(bodyParser.json());
server.use('/', router);

var authenticationCheck = function (request, response) {
		if (request.headers.authorization && request.headers.authorization.indexOf('Basic ') >= 0) {
			const base64Credentials = request.headers.authorization.split(' ')[1];
			const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
			if (!credentials || credentials !== username + ':' + password) {
				console.log('ERROR: Invalid Authentication Credentials');
				var responseMessage = responses.formatResponse("POST", "/authenticationError", {
						errorCode: 401,
						errorMessage: "ERROR: Unauthorized"
					});

				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify(responseMessage));
				return false;
			}
		}

		return true;
	};

router.get('/compiler/rest/api', (request,response)=>{
	compiler.getApiVersions(request, response);
  });
  
  router.get('/compiler/rest/api/v1/server', (request,response)=>{
	compiler.getServer(request, response);
  });
  
  router.get('/compiler/rest/api/v1/job/:id', (request,response)=>{
	compiler.getJob(request, response);
  });
  
  router.post('/compiler/rest/api/v1/job', (request,response)=>{
	if (authenticationCheck(request, response)) {
		compiler.createJob(request, response, compileServerName);
	}
  });
  
  router.post('/compiler/rest/api/v1/job/:id/compilesite', (request,response)=>{
	if (authenticationCheck(request, response)) {
		compiler.submitCompileSite(request, response);
	}
  });

  router.post('/compiler/rest/api/v1/job/:id', (request,response)=>{
	if (authenticationCheck(request, response)) {
		compiler.updateJob(request, response);
	}
  });

  router.delete('/compiler/rest/api/v1/job/:id', (request,response)=>{
	if (authenticationCheck(request, response)) {
		compiler.deleteJob(request, response);
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
		cert: fs.readFileSync(certPath),
		requestCert: false,
		rejectUnauthorized: false
	};
	var localhost = 'https://localhost:' + port;
	https.createServer(httpsOptions, app).listen(port, function () {
		console.log('Server starts: ' + localhost);
	});
} else {
	var localhost = 'http://localhost:' + port;
	var localServer = server.listen(port, function () {
		console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
	});
}