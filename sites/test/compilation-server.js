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
	bodyParser = require('body-parser'),
	persistenceStore = require('./job-manager/persistenceStore.js').factory.create(),
	compilationService = require('./connector/compilationService.js'),
	server = express(),
	router = express.Router(),
	self = this;

var port = process.env.CEC_TOOLKIT_COMPILATION_PORT || 8087;

var keyPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_KEY;
var certPath = process.env.CEC_TOOLKIT_COMPILATION_HTTPS_CERTIFICATE;

var jobsDir = process.env.CEC_TOOLKIT_COMPILATION_JOBS_DIR || '';

var compileStepTimeoutValue = process.env.CEC_TOOLKIT_COMPILATION_COMPILE_STEP_TIMEOUT || 0;

var psArgs = {};

// If jobsDir is defined, then pass it to persistence store.
if (jobsDir) {
	psArgs.jobsDir = jobsDir;
	console.log('Compilation jobs files will be written to', jobsDir);
}

// Initialize compilation service with a persistence store object.
var compilationArgs = {
		ps: new persistenceStore(psArgs)
	};

this.compilation = new compilationService(compilationArgs);

server.set('port', port);
server.use(bodyParser.json());
server.use('/', router);

router.get('/compiler/rest/api', (request,response)=>{
	this.compilation.getApiVersions(request, response);
  });
  
  router.get('/compiler/rest/api/v1/server', (request,response)=>{
	this.compilation.getServer(request, response);
  });
  
  router.get('/compiler/rest/api/v1/job/:id', (request,response)=>{
	this.compilation.getJob(request, response);
  });
  
  router.post('/compiler/rest/api/v1/job', (request,response)=>{
	this.compilation.createJob(request, response);
  });
  
  router.post('/compiler/rest/api/v1/job/:id/compilesite', (request,response)=>{
	this.compilation.submitCompileSite(request, response);
  });

  router.post('/compiler/rest/api/v1/job/:id', (request,response)=>{
	this.compilation.updateJob(request, response);
  });

  router.delete('/compiler/rest/api/v1/job/:id', (request,response)=>{
	this.compilation.deleteJob(request, response);
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
			this.compilation.setLogsDir(compilationLogsDir);
			console.log('Compilation log files will be written to', compilationLogsDir);
		}

		if (compileStepTimeoutValue) {
			if (typeof compileStepTimeoutValue === 'string') {
				compileStepTimeoutValue = parseInt(compileStepTimeoutValue);
			}
			this.compilation.setCompileStepTimeoutValue(compileStepTimeoutValue);
			console.log('compile-template timeout value is', compileStepTimeoutValue);
		}

		this.compilation.restartJobs();
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
		startCompilationService.bind(self)();
	});
} else {
	var localhost = 'http://localhost:' + port;
	var localServer = server.listen(port, function () {
		console.log('Server starts: ' + localhost + ' (WARNING: Not Secure)');
		startCompilationService.bind(self)();
	});
}