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
	fs = require('fs'),
	https = require('https'),
	path = require('path'),
	bodyParser = require('body-parser'),
	compiler = require('./connector/compilationService.js'),
	server = express(),
	router = express.Router();

var port = process.env.CEC_TOOLKIT_COMPILATION_PORT || 8087;

var keyPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_KEY;
var certPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_CERTIFICATE;

server.set('port', port);
server.use(bodyParser.json());
server.use('/', router);

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
	compiler.createJob(request, response);
  });
  
  router.post('/compiler/rest/api/v1/job/:id/compilesite', (request,response)=>{
	compiler.submitCompileSite(request, response);
  });

  router.post('/compiler/rest/api/v1/job/:id', (request,response)=>{
	compiler.updateJob(request, response);
  });

  router.delete('/compiler/rest/api/v1/job/:id', (request,response)=>{
	compiler.deleteJob(request, response);
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

var startCompilationService = function() {
		// Compilation logs directory
		var compilationLogsDir = process.env.CEC_TOOLKIT_COMPILATION_LOGS_DIR;

		if (compilationLogsDir) {
			compiler.setLogsDir(compilationLogsDir);
			console.log('Compilation log files will be written to', compilationLogsDir);
		}
		compiler.restartJobs();
	};

// start the server

if (keyPath && fs.existsSync(keyPath) && certPath && fs.existsSync(certPath)) {
	var httpsOptions = {
		key: fs.readFileSync(keyPath),
		cert: fs.readFileSync(certPath),
		requestCert: false,
		rejectUnauthorized: false
	};
	// TODO: Need to default to 443. Will update when a way to test the 443 port is found.
	var localhost = 'https://localhost:' + port;
	https.createServer(httpsOptions, server).listen(port, function () {
		console.log('Server starts: ' + localhost);
		startCompilationService();
	});
} else {
	var localhost = 'http://localhost:' + port;
	var localServer = server.listen(port, function () {
		console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
		startCompilationService();
	});
}