/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	gulp = require('gulp'),
	path = require('path');

var projectDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

module.exports.createRepository = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			done();
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var desc = argv.description;
	var defaultLanguage = argv.defaultlanguage;

	var channels = [];
	var contentTypes = [];

	serverRest.getRepositories({
			registeredServerName: serverName,
			currPath: projectDir
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// get repositories
			var repositories = result || [];
			for (var i = 0; i < repositories.length; i++) {
				if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
					console.log('ERROR: repository ' + name + ' already exists');
					return Promise.reject();
				}
			}
			console.log(' - verify repository name');

			// get content types
			var typePromises = [];
			for (var i = 0; i < typeNames.length; i++) {
				typePromises.push(serverRest.getContentType({
					registeredServerName: serverName,
					currPath: projectDir,
					name: typeNames[i]
				}));
			}

			return Promise.all(typePromises);
		})
		.then(function (results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].err) {
					return Promise.reject();
				}
			}
			if (typeNames.length > 0) {
				console.log(' - verify content types');
			}

			// get channels
			var channelPromises = [];
			if (channelNames.length > 0) {
				channelPromises.push(serverRest.getChannels({
					registeredServerName: serverName,
					currPath: projectDir
				}));
			}

			return Promise.all(channelPromises);
		})
		.then(function (results) {
			var allChannels = results.length > 0 ? results[0] : [];
			for (var i = 0; i < channelNames.length; i++) {
				var found = false;
				for (var j = 0; j < allChannels.length; j++) {
					if (channelNames[i].toLowerCase() === allChannels[j].name) {
						found = true;
						channels.push({
							id: allChannels[j].id,
							name: allChannels[j].name
						});
						break;
					}
				}
				if (!found) {
					console.log('ERROR: channel ' + channelNames[i] + ' does not exist');
					return Promise.reject();
				}
			}
			if (channelNames.length > 0) {
				console.log(' - verify channels');
			}

			for (var i = 0; i < typeNames.length; i++) {
				contentTypes.push({
					name: typeNames[i]
				});
			}

			return serverRest.createRepository({
				registeredServerName: serverName,
				currPath: projectDir,
				name: name,
				description: desc,
				defaultLanguage: defaultLanguage,
				contentTypes: contentTypes,
				channels: channels
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// console.log(result);
			console.log(' - repository ' + name + ' created');

			done();
		})
		.catch((error) => {
			done();
		});

};

module.exports.controlRepository = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			done();
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var action = argv.action;
	var name = argv.repository;

	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];

	var repository;
	var channels = [];
	var types = [];

	serverRest.getRepositories({
			registeredServerName: serverName,
			currPath: projectDir
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// get repositories
			var repositories = result || [];
			for (var i = 0; i < repositories.length; i++) {
				if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
					repository = repositories[i];
					break;
				}
			}
			if (!repository) {
				console.log('ERROR: repository ' + name + ' does not exist');
				return Promise.reject();
			}
			console.log(' - verify repository');

			var typePromises = [];
			for (var i = 0; i < typeNames.length; i++) {
				typePromises.push(serverRest.getContentType({
					registeredServerName: serverName,
					currPath: projectDir,
					name: typeNames[i]
				}));
				types.push({
					name: typeNames[i]
				});
			}

			return Promise.all(typePromises);
		})
		.then(function (results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].err) {
					return Promise.reject();
				}
			}
			if (typeNames.length > 0) {
				console.log(' - verify content types');
			}

			// get channels
			var channelPromises = [];
			if (channelNames.length > 0) {
				channelPromises.push(serverRest.getChannels({
					registeredServerName: serverName,
					currPath: projectDir
				}));
			}

			return Promise.all(channelPromises);
		})
		.then(function (results) {
			var allChannels = results.length > 0 ? results[0] : [];
			for (var i = 0; i < channelNames.length; i++) {
				var found = false;
				for (var j = 0; j < allChannels.length; j++) {
					if (channelNames[i].toLowerCase() === allChannels[j].name) {
						found = true;
						channels.push({
							id: allChannels[j].id,
							name: allChannels[j].name
						});
						break;
					}
				}
				if (!found) {
					console.log('ERROR: channel ' + channelNames[i] + ' does not exist');
					return Promise.reject();
				}
			}
			if (channelNames.length > 0) {
				console.log(' - verify channels');
			}

			var finalTypes = repository.contentTypes;
			var finalChannels = repository.channels;
			if (action === 'add-type') {
				finalTypes = finalTypes.concat(types);
			} else if (action === 'remove-type') {
				for (var i = 0; i < typeNames.length; i++) {
					var idx = undefined;
					for (var j = 0; j < finalTypes.length; j++) {
						if (typeNames[i].toLowerCase() === finalTypes[j].name.toLowerCase()) {
							idx = j;
							break;
						}
					}
					if (idx !== undefined) {
						finalTypes.splice(idx, 1);
					}
				}
			} else if (action === 'add-channel') {
				finalChannels = finalChannels.concat(channels);
			} else if (action === 'remove-channel') {
				for (var i = 0; i < channels.length; i++) {
					var idx = undefined;
					for (var j = 0; j < finalChannels.length; j++) {
						if (channels[i].id === finalChannels[j].id) {
							idx = j;
							break;
						}
					}
					if (idx !== undefined) {
						finalChannels.splice(idx, 1);
					}
				}
			}

			return serverRest.updateRepository({
				registeredServerName: serverName,
				currPath: projectDir,
				repository: repository,
				contentTypes: finalTypes,
				channels: finalChannels
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			if (action === 'add-type') {
				console.log(' - added type ' + typeNames + ' to repository ' + name);
			} else if (action === 'remove-type') {
				console.log(' - removed type ' + typeNames + ' from repository ' + name);
			} else if (action === 'add-channel') {
				console.log(' - added channel ' + channelNames + ' to repository ' + name);
			} else if (action === 'remove-channel') {
				console.log(' - removed channel ' + channelNames + ' from repository ' + name);
			}

			done();
		})
		.catch((error) => {
			done();
		});

};

module.exports.createChannel = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			done();
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var channelType = argv.type || 'public';
	var publishPolicy = argv.publishpolicy || 'anythingPublished';
	var localizationPolicyName = argv.localizationpolicy;

	var localizationId;

	serverRest.getChannels({
			registeredServerName: serverName,
			currPath: projectDir
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var channels = result || [];
			for (var i = 0; i < channels.length; i++) {
				if (name.toLowerCase() === channels[i].name.toLowerCase()) {
					console.log('ERROR: channel ' + name + ' already exists');
					return Promise.reject();
				}
			}
			var localizationPolicyPromises = [];
			if (localizationPolicyName) {
				localizationPolicyPromises.push(serverRest.getLocalizationPolicies({
					registeredServerName: serverName,
					currPath: projectDir
				}));
			}
			return Promise.all(localizationPolicyPromises)
		})
		.then(function (results) {
			var policies = results.length > 0 ? results[0] : [];
			for (var i = 0; i < policies.length; i++) {
				if (localizationPolicyName === policies[i].name) {
					localizationId = policies[i].id;
					break;
				}
			}

			if (localizationPolicyName && !localizationId) {
				console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
				return Promise.reject();
			}
			if (localizationPolicyName) {
				console.log(' - verify localization policy ');
			}

			return serverRest.createChannel({
				registeredServerName: serverName,
				currPath: projectDir,
				name: name,
				description: desc,
				channelType: channelType,
				publishPolicy: publishPolicy,
				localizationPolicy: localizationId
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// console.log(result);
			console.log(' - channel ' + name + ' created');

			done();
		})
		.catch((error) => {
			done();
		});
};


module.exports.createLocalizationPolicy = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			done();
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var requiredLanguages = argv.requiredlanguages.split(',');
	var defaultLanguage = argv.defaultlanguage;
	var optionalLanguages = argv.optionallanguages ? argv.optionallanguages.split(',') : [];

	serverRest.getLocalizationPolicies({
			registeredServerName: serverName,
			currPath: projectDir
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			// verify if the localization policy exists
			var policies = result || [];
			for (var i = 0; i < policies.length; i++) {
				if (name === policies[i].name) {
					console.log('ERROR: localization policy ' + name + ' already exists');
					return Promise.reject();
				}
			}

			console.log(' - verify localization policy name');

			return serverRest.createLocalizationPolicy({
				registeredServerName: serverName,
				currPath: projectDir,
				name: name,
				description: desc,
				defaultLanguage: defaultLanguage,
				requiredLanguages: requiredLanguages,
				optionalLanguages: optionalLanguages
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// console.log(result);
			console.log(' - localization policy ' + name + ' created');

			done();
		})
		.catch((error) => {
			done();
		});
};