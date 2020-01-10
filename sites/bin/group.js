/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js');

var projectDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	return true;
};

module.exports.createGroup = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	// console.log(' - server: ' + server.url);

	var name = argv.name;
	var type = argv.type || 'PUBLIC_OPEN';

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getGroups({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var groups = result || [];
				var found = false;
				for (var j = 0; j < groups.length; j++) {
					if (name.toLowerCase() === groups[j].name.toLowerCase()) {
						found = true;
						break;
					}
				}
				if (found) {
					console.log('ERROR: group ' + name + ' already exists');
					return Promise.reject();
				}

				return serverRest.createGroup({
					request: request,
					server: server,
					name: name,
					type: type
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - group ' + name + ' created');
				done(true);
			})
			.catch((error) => {
				done();
			});
	});

};

module.exports.deleteGroup = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	// console.log(' - server: ' + server.url);

	var name = argv.name;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getGroups({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var groups = result || [];
				var groupId;
				for (var j = 0; j < groups.length; j++) {
					if (name.toLowerCase() === groups[j].name.toLowerCase()) {
						groupId = groups[j].id;
						break;
					}
				}
				if (!groupId) {
					console.log('ERROR: group ' + name + ' does not exist');
					return Promise.reject();
				}

				return serverRest.deleteGroup({
					request: request,
					server: server,
					id: groupId,
					name: name
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - group ' + name + ' deleted');
				done(true);
			})
			.catch((error) => {
				done();
			});
	});

};