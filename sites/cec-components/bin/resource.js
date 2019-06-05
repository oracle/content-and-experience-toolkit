/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var projectDir,
	componentsSrcDir,
	connectionsSrcDir,
	connectorsSrcDir,
	contentSrcDir,
	serversSrcDir,
	transSrcDir,
	templatesSrcDir;

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	templatesSrcDir = path.join(srcfolder, 'templates');
	connectorsSrcDir = path.join(srcfolder, 'connectors');
	connectionsSrcDir = path.join(srcfolder, 'connections');
	contentSrcDir = path.join(srcfolder, 'content');
	transSrcDir = path.join(srcfolder, 'translationJobs');
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
}

var _cmdEnd = function (done) {
	done();
	process.exit(0);
};

module.exports.listLocalResources = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	// 
	// Servers
	//
	console.log('Servers:');
	var serverNames = fs.existsSync(serversSrcDir) ? fs.readdirSync(serversSrcDir) : [];
	if (serverNames) {
		var format = '    %-20s %-s';
		serverNames.forEach(function (name) {
			if (fs.existsSync(path.join(serversSrcDir, name, 'server.json'))) {
				var serverinfo = fs.readFileSync(path.join(serversSrcDir, name, 'server.json'));
				var serverinfojson = JSON.parse(serverinfo);
				console.log(sprintf(format, name, serverinfojson.url));
			}
		});
	}

	console.log('Components: ');
	var compNames = fs.readdirSync(componentsSrcDir);
	if (compNames) {
		compNames.forEach(function (name) {
			if (fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Templates: ');
	var tempNames = fs.readdirSync(templatesSrcDir);
	if (tempNames) {
		tempNames.forEach(function (name) {
			if (fs.existsSync(path.join(templatesSrcDir, name, 'siteinfo.json'))) {
				console.log('    ' + name);
			}
		});
	}

	//
	// Content
	//
	console.log('Content:');
	var contentNames = fs.existsSync(contentSrcDir) ? fs.readdirSync(contentSrcDir) : [];
	if (contentNames) {
		contentNames.forEach(function (name) {
			if (fs.existsSync(path.join(contentSrcDir, name, 'contentexport'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation connectors:');
	var connectorNames = fs.existsSync(connectorsSrcDir) ? fs.readdirSync(connectorsSrcDir) : [];
	if (connectorNames) {
		connectorNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectorsSrcDir, name, 'package.json'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation connections:');
	var connectionNames = fs.existsSync(connectionsSrcDir) ? fs.readdirSync(connectionsSrcDir) : [];
	if (connectionNames) {
		connectionNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectionsSrcDir, name, 'connection.json'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation jobs:');
	var jobNames = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	if (jobNames) {
		jobNames.forEach(function (name) {
			if (fs.existsSync(path.join(transSrcDir, name, 'site')) || fs.existsSync(path.join(transSrcDir, name, 'job.json'))) {
				console.log('    ' + name);
			}
		});
	}

	done();
};

module.exports.listServerResources = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
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
	// console.log('Server: ' + server.url);

	var types = argv.types ? argv.types.split(',') : [];

	var listChannels = types.length === 0 || types.includes('channels')
	var listComponents = types.length === 0 || types.includes('components')
	var listLocalizationpolicies = types.length === 0 || types.includes('localizationpolicies')
	var listRepositories = types.length === 0 || types.includes('repositories')
	var listSites = types.length === 0 || types.includes('sites')
	var listTemplates = types.length === 0 || types.includes('templates')

	if (!listChannels && !listComponents && !listLocalizationpolicies && !listRepositories && !listSites && !listTemplates) {
		console.log('ERROR: invalid resource types: ' + argv.types);
		_cmdEnd(done);
	}

	var format = '  %-36s';
	var format2 = '  %-36s  %-36s';
	var format3 = '  %-36s  %-36s  %-s';

	var isPod = server.env === 'pod_ec';
	var request = serverUtils.getRequest();

	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var promises = listChannels ? [_getChannels(serverName)] : [];

		Promise.all(promises).then(function (results) {
				//
				// List channels
				//
				var channels = results.length > 0 ? results[0] : [];
				if (listChannels) {
					console.log('Channels:');
					console.log(sprintf(format2, 'Name', 'Token'));
					for (var i = 0; i < channels.length; i++) {
						var channel = channels[i];
						var channelToken;
						var tokens = channel.channelTokens || [];
						for (var j = 0; j < tokens.length; j++) {
							if (tokens[j].name === 'defaultToken') {
								channelToken = tokens[j].token;
								break;
							}
						}
						if (!channelToken && tokens.length > 0) {
							channelToken = tokens[0].token;
						}
						console.log(sprintf(format2, channel.name, channelToken));
					}
					console.log('');
				}

				promises = listComponents ? [serverUtils.browseComponentsOnServer(request, server)] : [];

				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list components
				//
				var comps = results.length > 0 ? results[0].data : [];
				if (listComponents) {
					console.log('Components:');
					console.log(sprintf(format3, 'Name', 'Type', 'Published'));
					for (var i = 0; i < comps.length; i++) {
						var comp = comps[i];
						var compType = comp.xScsAppType;
						var typeLabel = 'Local component';
						if (compType === 'componentgroup') {
							typeLabel = 'Component group';
						} else if (compType === 'remote') {
							typeLabel = 'Remote component';
						} else if (compType === 'contentlayout') {
							typeLabel = 'Content layout';
						} else if (compType === 'sandboxed') {
							typeLabel = 'Local component in an iframe';
						} else if (compType === 'sectionlayout') {
							typeLabel = 'Section layout';
						}
						var published = comp.xScsIsAppActive === '1' ? '    √' : '';
						console.log(sprintf(format3, comp.fFolderName, typeLabel, published));
					}
					console.log('');
				}

				promises = listLocalizationpolicies ? [serverRest.getLocalizationPolicies({
					registeredServerName: serverName,
					currPath: projectDir
				})] : [];

				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list localization policies
				//
				var policies = results.length > 0 ? results[0] : [];
				if (listLocalizationpolicies) {
					console.log('Localization policies:');
					console.log(sprintf(format3, 'Name', 'Required Languages', 'Optional Languages'));
					for (var i = 0; i < policies.length; i++) {
						var policy = policies[i];
						console.log(sprintf(format3, policy.name, policy.requiredValues, policy.optionalValues));
					}
					console.log('');
				}

				promises = listRepositories ? [serverRest.getRepositories({
					registeredServerName: serverName,
					currPath: projectDir
				})] : [];

				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list repositories
				//
				var repositories = results.length > 0 ? results[0] : [];
				if (listRepositories) {
					console.log('Repositories:');
					console.log(sprintf(format, 'Name'));
					for (var i = 0; i < repositories.length; i++) {
						console.log(sprintf(format, repositories[i].name));
					}
					console.log('');
				}

				promises = listSites ? [serverUtils.browseSitesOnServer(request, server)] : [];
				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list sites
				//
				var sites = results.length > 0 ? results[0].data : [];
				if (listSites) {
					var siteFormat = '  %-36s  %-36s  %-10s  %-10s  %-s';
					console.log('Sites:');
					console.log(sprintf(siteFormat, 'Name', 'Theme', 'Type', 'Published', 'Online'));

					for (var i = 0; i < sites.length; i++) {
						var site = sites[i];
						var type = site.xScsIsEnterprise === '1' ? 'Enterprise' : 'Standard';
						var published = site.xScsSitePublishStatus === 'published' ? '    √' : '';
						var online = site.xScsIsSiteActive === '1' ? '  √' : ''
						console.log(sprintf(siteFormat, site.fFolderName, site.xScsSiteTheme, type, published, online))
					}
					console.log('');
				}

				promises = listTemplates ? [serverUtils.browseSitesOnServer(request, server, 'framework.site.template')] : [];
				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list templates
				//
				var templates = results.length > 0 ? results[0].data : [];
				if (listTemplates) {
					console.log('Templates:');

					console.log(sprintf(format3, 'Name', 'Theme', 'Type'));
					for (var i = 0; i < templates.length; i++) {
						var temp = templates[i];
						var type = temp.xScsIsEnterprise === '1' ? 'Enterprise' : 'Standard';
						console.log(sprintf(format3, temp.fFolderName, temp.xScsSiteTheme, type));
					}
				}

				_cmdEnd(done);
			});

	}); // login 
};

var _getChannels = function (serverName) {
	return new Promise(function (resolve, reject) {
		var chanelsPromise = serverRest.getChannels({
			registeredServerName: serverName,
			currPath: projectDir
		});
		chanelsPromise.then(function (result) {
				if (result.err) {
					return resolve(result);
				}

				var channels = result || [];
				var channelPromises = [];
				for (var i = 0; i < channels.length; i++) {
					channelPromises.push(serverRest.getChannel({
						registeredServerName: serverName,
						currPath: projectDir,
						id: channels[i].id
					}));
				}

				//
				// get channel detail
				//
				return Promise.all(channelPromises);
			})
			.then(function (results) {
				resolve(results);
			});
	});
};