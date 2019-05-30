/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Site library
 */
var gulp = require('gulp'),
	serverUtils = require('./serverUtils.js'),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	argv = require('yargs').argv;

var projectDir = path.resolve('./');

module.exports.exportServerContent = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}

	projectDir = argv.projectDir || projectDir;

	var channel = argv.channel,
		output = argv.output;

	if (!channel) {
		console.error('ERROR: please run as npm run export-server-content -- --channel <channel name> [--output <the folder for the export zip file>]');
		done();
		return;
	}

	if (output && !path.isAbsolute(output)) {
		output = path.join(projectDir, output);
	}
	if (output && !fs.existsSync(path.resolve(output))) {
		console.log('ERROR: invalid output dir');
		done();
		return;
	}

	var destdir = output ? path.resolve(output) : projectDir;

	var request = require('request');
	request = request.defaults({
		jar: true,
		proxy: null
	});

		var channelsPromise = serverUtils.getChannelsFromServer(server);
		channelsPromise.then(function (result) {
			// console.log(result);
			var channels = result && result.channels || [];
			var channelId = '';
			var channelToken = '';
			for (var i = 0; i < channels.length; i++) {
				if (channels[i].name === channel) {
					channelId = channels[i].id;
					channelToken = channels[i].token;
					break;
				}
			}

			if (!channelId) {
				console.log('ERROR: channel ' + channel + ' does not exist');
				done();
				process.exit(0);
				return;
			}

			console.log(' - validate channel ' + channel + ' (id: ' + channelId + ')');

			var exportPromise = serverUtils.exportChannelContent(request, server, channelId, channel, destdir);
			exportPromise.then(function (result) {
				done();
				process.exit(0);
			});

		});


};
