/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * translation job library
 */

var path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	serverUtils = require('../test/server/serverUtils.js');
var Client = require('node-rest-client').Client;

var projectDir = path.join(__dirname, "..");

/** 
 * private 
 */
var _getTranslationJobs = function (server, jobType) {
	var jobPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/translationJobs?jobType=' + jobType + '&limit=999&offset=0&orderBy=name:asc';
		client.get(url, function (data, response) {
			var jobs = [];
			if (response && response.statusCode === 200) {
				jobs = data && data.items;
				resolve({
					jobType: jobType,
					data: jobs
				});
			} else {
				console.log('ERROR: failed to query translation jobs: ' + response.statusCode);
				resolve({err: 'err'});
			}
		});
	});
	return jobPromise;
};

//
// Tasks
//

/**
 * list translation jobs on the server
 */
module.exports.listServerTranslationJobs = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}
	var type = argv.type;
	if (type && type !== 'sites' && type !== 'assets') {
		console.log('ERROR: invalid job type ' + type);
		done();
		return;
	}
	var jobPromises = [];
	if (type) {
		jobPromises.push(_getTranslationJobs(server, type));
	} else {
		jobPromises.push(_getTranslationJobs(server, 'assets'));
		jobPromises.push(_getTranslationJobs(server, 'sites'));
	}
	Promise.all(jobPromises).then(function (values) {
		var assetJobs, siteJobs;
		for(var i = 0; i < values.length; i++) {
			if (values[i].jobType === 'assets') {
				assetJobs = values[i].data;
			} else {
				siteJobs = values[i].data;
			}
		}
		var format = '%-34s %-34s %-20s';
		if (assetJobs) {
			console.log('Asset translation jobs:');
			console.log(sprintf(format, 'Name', 'Id', 'Status'));
			for(var i = 0; i < assetJobs.length; i++) {
				console.log(sprintf(format, assetJobs[i].name, assetJobs[i].id, assetJobs[i].status));
			}
		}
		if (siteJobs) {
			console.log('Site translation jobs:');
			console.log(sprintf(format, 'Name', 'Id', 'Status'));
			for(var i = 0; i < siteJobs.length; i++) {
				console.log(sprintf(format, siteJobs[i].name, siteJobs[i].id, siteJobs[i].status));
			}
		}
		done();
	});
};