/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	crypto = require('crypto'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	formatter = require('./formatter.js');

var console = require('../test/server/logger.js').console;

var projectDir,
	buildDir,
	componentsSrcDir,
	connectionsSrcDir,
	connectorsSrcDir,
	contentSrcDir,
	typesSrcDir,
	recommendationSrcDir,
	serversSrcDir,
	transSrcDir,
	taxonomiesSrcDir,
	templatesSrcDir;

var verifyRun = function (argv) {
	if (process.shim) {
		return true;
	}
	projectDir = argv.projectDir;

	buildDir = serverUtils.getBuildFolder(projectDir);

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	templatesSrcDir = path.join(srcfolder, 'templates');
	connectorsSrcDir = path.join(srcfolder, 'connectors');
	connectionsSrcDir = path.join(srcfolder, 'connections');
	contentSrcDir = path.join(srcfolder, 'content');
	typesSrcDir = path.join(srcfolder, 'types');
	recommendationSrcDir = path.join(srcfolder, 'recommendations');
	taxonomiesSrcDir = path.join(srcfolder, 'taxonomies');
	transSrcDir = path.join(srcfolder, 'translationJobs');
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};


module.exports.createEncryptionKey = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var file = argv.file;
	if (!path.isAbsolute(file)) {
		file = path.join(projectDir, file);
	}
	file = path.resolve(file);

	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
		console.error('ERROR: no file specified');
		done();
		return;
	}
	var folder = file.substring(0, file.lastIndexOf(path.sep));
	if (!fs.existsSync(folder)) {
		console.error('ERROR: directory ' + folder + ' does not exist');
		done();
		return;
	}
	if (folder.indexOf(projectDir) === 0) {
		console.error('ERROR: key file cannot be saved in sites-toolkit directory');
		done();
		return;
	}

	try {
		var obj = crypto.generateKeyPairSync('rsa', {
			modulusLength: 2048, // the length of your key in bits
			publicKeyEncoding: {
				type: 'pkcs1',
				format: 'pem'
			},
			privateKeyEncoding: {
				type: 'pkcs8',
				format: 'pem'
				// cipher: 'aes-256-cbc',
				// passphrase: 'cec sites-toolkit secret'
			}
		});
		// console.log(obj.privateKey.length);

		fs.writeFileSync(file, obj.privateKey);
		console.log(' - key saved to ' + file);
		done(true);
	} catch (e) {
		if (e && e.message === 'crypto.generateKeyPairSync is not a function') {
			console.error('ERROR: require NodeJS 10.12.0 and later');
		}
		done();
	}

};

module.exports.registerServer = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var keyFile = argv.key;
	if (keyFile && !fs.existsSync(keyFile)) {
		console.error('ERROR: key file ' + keyFile + ' does not exist');
		done();
		return;
	}

	var name = argv.name;
	var endpoint = argv.endpoint;
	var user = argv.user || '';
	var password = argv.password || '';
	var type = argv.type || 'pod_ec';
	var idcs_url = argv.domainurl || argv.idcsurl;
	var client_id = argv.clientid;
	var client_secret = argv.clientsecret;
	var scope = argv.scope;
	var timeout = argv.timeout;
	var getToken = typeof argv.gettoken === 'string' && argv.gettoken.toLowerCase() === 'true';

	var savedPassword = password;
	var savedClientId = client_id;
	var savedClientSecret = client_secret;
	var encrypted;
	if (keyFile) {
		var key = fs.readFileSync(keyFile, 'utf8');
		try {
			encrypted = crypto.publicEncrypt({
				key: key,
			}, Buffer.from(password, 'utf8'));
			savedPassword = encrypted.toString('base64');
			console.info(' - encrypt the password');
		} catch (e) {
			console.error('ERROR: failed to encrypt the password');
			console.error(e);
			done();
			return;
		}

		if (client_id) {
			try {
				encrypted = crypto.publicEncrypt({
					key: key,
				}, Buffer.from(client_id, 'utf8'));
				savedClientId = encrypted.toString('base64');
				console.info(' - encrypt the client id');
			} catch (e) {
				console.error('ERROR: failed to encrypt the client id');
				console.error(e);
				done();
				return;
			}
		}

		if (client_secret) {
			try {
				encrypted = crypto.publicEncrypt({
					key: key,
				}, Buffer.from(client_secret, 'utf8'));
				savedClientSecret = encrypted.toString('base64');
				console.info(' - encrypt the client secret');
			} catch (e) {
				console.error('ERROR: failed to encrypt the client secret');
				console.error(e);
				done();
				return;
			}
		}
	}

	if (!fs.existsSync(serversSrcDir)) {
		fs.mkdirSync(serversSrcDir);
	}

	var serverPath = path.join(serversSrcDir, name);
	if (!fs.existsSync(serverPath)) {
		fs.mkdirSync(serverPath);
	}
	var serverFile = path.join(serverPath, 'server.json');
	// Use the same fields as serverUtils.getConfiguredServer
	var serverjson = {
		name: name,
		url: endpoint,
		username: user,
		password: savedPassword,
		env: type,
		key: keyFile,
		idcs_url: idcs_url,
		client_id: savedClientId,
		client_secret: savedClientSecret,
		scope: scope,
		timeout: timeout
	};

	if (getToken && type === 'dev_ec') {
		console.info(' - server of type dev_ec does not support OAuth token');
	}

	if (getToken && type !== 'dev_ec') {
		serverUtils.loginToServer(serverjson).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			serverjson.username = '';
			serverjson.password = '';
			if (serverjson.idcs_url) {
				serverjson.idcs_url = '';
			}
			if (serverjson.client_id) {
				serverjson.client_id = '';
			}
			if (serverjson.client_secret) {
				serverjson.client_secret = '';
			}
			if (serverjson.scope) {
				serverjson.scope = '';
			}
			serverjson.login = undefined;
			fs.writeFileSync(serverFile, JSON.stringify(serverjson));
			console.log(' - server with token registered in ' + serverFile);
			done(true);
		});
	} else {
		fs.writeFileSync(serverFile, JSON.stringify(serverjson));
		console.log(' - server registered in ' + serverFile);
		done(true);
	}
};

module.exports.configProperties = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var server = serverUtils.getConfiguredServer(projectDir, false);
	if (server && server.fileexist) {
		console.info(' - configuration file: ' + server.fileloc);
	} else {
		console.error('ERROR: no server is configured');
		done();
		return;
	}

	var name = argv.name;
	var value = argv.value;
	if (name === 'key') {
		if (!fs.existsSync(value)) {
			console.error('ERROR: key file ' + value + ' does not exist');
			done();
			return;
		}
	} else if (name === 'password' || name === 'client_id' || name === 'client_secret') {
		if (server.key && fs.existsSync(server.key)) {
			// encrypt
			console.info(' - key file ' + server.key);
			var encryptKey = fs.readFileSync(server.key, 'utf8');
			try {
				let encrypted = crypto.publicEncrypt({
					key: encryptKey
				}, Buffer.from(value, 'utf8'));
				value = encrypted.toString('base64');
				console.info(' - encrypt the ' + name);
			} catch (e) {
				console.error('ERROR: failed to encrypt the ' + name);
				console.error(e);
				done();
				return;
			}

		}
	}

	var toSave = [{
		name: 'cec_' + name,
		value: value
	}];

	if (serverUtils.saveToConfiguredServer(server, toSave)) {
		console.log(' - property ' + name + ' saved to ' + server.fileloc);
		if (name === 'key') {
			if (server.password) {
				console.log(' - please set password again to get it encrypted');
			}
			if (server.client_id) {
				console.log(' - please set client_id again to get it encrypted');
			}
			if (server.client_secret) {
				console.log(' - please set client_secret again to get it encrypted');
			}
		}
		done(true);
	} else {
		done();
	}
};


module.exports.setOAuthToken = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server;

	if (serverName) {
		server = serverUtils.getRegisteredServer(projectDir, serverName);
		if (!server || !server.fileexist) {
			done();
			return;
		}
		var serverPath = path.join(serversSrcDir, serverName, "server.json");
		if (fs.existsSync(serverPath)) {
			var serverstr = fs.readFileSync(serverPath).toString(),
				serverjson = JSON.parse(serverstr);
			serverjson.oauthtoken = argv.token;

			fs.writeFileSync(serverPath, JSON.stringify(serverjson));
			console.log(' - token saved to server ' + serverName);
			done(true);
		} else {
			done();
		}
	} else {
		server = serverUtils.getConfiguredServer(projectDir);
		if (!server || !server.fileexist) {
			done();
			return;
		}
		// save to the config file
		if (serverUtils.setTokenToConfiguredServer(server, argv.token)) {
			console.log(' - token saved to file ' + server.fileloc);
			done(true);
		} else {
			done();
		}
	}
};

module.exports.refreshOAuthToken = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server;

	if (serverName) {
		server = serverUtils.getRegisteredServer(projectDir, serverName);
		if (!server || !server.fileexist) {
			done();
			return;
		}

		var serverPath = path.join(serversSrcDir, serverName, "server.json");

	} else {
		server = serverUtils.getConfiguredServer(projectDir);
		if (!server || !server.fileexist) {
			done();
			return;
		}

	}

	if (server.env === 'dev_ec') {
		console.log(' - OAuth token is not supported on server ' + server.url);
		done();
		return;
	}

	var url = '/system/api/v1/security/token';
	var newToken;
	var expiresInMillis;
	var now;
	serverRest.executePost({ server: server, endpoint: url, noMsg: true, noError: true })
		.then(function (result) {
			if (result && result.accessToken) {
				newToken = result.accessToken;
				expiresInMillis = result.expiresInMillis;
				console.info(' - get new token');
				now = new Date();
			}

			var tokenPromises = [];
			if (!newToken && server.oauthtoken) {
				// seems the previous token expired, now use basic auth to get again
				server.oauthtoken = '';
				tokenPromises.push(serverRest.executePost({ server: server, endpoint: url, noMsg: true, noError: true }));
			}

			Promise.all(tokenPromises)
				.then(function (results) {
					if (results && results[0] && results[0].accessToken) {
						newToken = results[0].accessToken;
						expiresInMillis = results[0].expiresInMillis;
						console.info(' - get new token with basic auth');
						now = new Date();
					}

					if (newToken) {
						if (serverName) {
							var serverPath = path.join(serversSrcDir, serverName, "server.json");
							var serverstr = fs.readFileSync(serverPath).toString(),
								serverjson = JSON.parse(serverstr);
							serverjson.oauthtoken = newToken;

							fs.writeFileSync(serverPath, JSON.stringify(serverjson));
							console.log(' - fresh token saved to server ' + serverName);
							if (expiresInMillis) {
								console.log(' - token will expire on ' + new Date(now.getTime() + expiresInMillis));
							}

						} else {
							serverUtils.setTokenToConfiguredServer(server, newToken);
							console.log(' - fresh token saved to file ' + server.fileloc);
							if (expiresInMillis) {
								console.log(' - token will expire on ' + new Date(now.getTime() + expiresInMillis));
							}
						}
						done(true);
					} else {
						// final try: use browser
						var loginPromise = serverUtils.loginToServer(server);
						loginPromise.then(function (result) {
							if (!result.status) {
								console.error(result.statusMessage);
								done();
							} else {
								done(true);
							}
						});
					}
				});
		});
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
		var format = '    %-20s  %-8s  %-s';
		serverNames.forEach(function (name) {
			if (fs.existsSync(path.join(serversSrcDir, name, 'server.json'))) {
				var serverinfo = fs.readFileSync(path.join(serversSrcDir, name, 'server.json'));
				var serverinfojson = JSON.parse(serverinfo);
				console.log(sprintf(format, name, serverinfojson.env, serverinfojson.url));
			}
		});
	}
	console.log('');

	console.log('Components: ');
	var compNames = fs.readdirSync(componentsSrcDir);
	if (compNames) {
		compNames.forEach(function (name) {
			var isOptimizedComp = name.length > 6 && name.substring(name.length - 6) === '_build';
			if (!isOptimizedComp && fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	console.log('Templates: ');
	var tempNames = fs.readdirSync(templatesSrcDir);
	if (tempNames) {
		tempNames.forEach(function (name) {
			if (fs.existsSync(path.join(templatesSrcDir, name, 'siteinfo.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	//
	// Content Types
	//
	console.log('Content Types:');
	var typeNames = fs.existsSync(typesSrcDir) ? fs.readdirSync(typesSrcDir) : [];
	if (typeNames) {
		typeNames.forEach(function (name) {
			if (fs.existsSync(path.join(typesSrcDir, name, name + '.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

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
	console.log('');

	//
	// Recommendations
	//
	console.log('Recommendations:');
	var recoNames = fs.existsSync(recommendationSrcDir) ? fs.readdirSync(recommendationSrcDir) : [];
	if (recoNames) {
		recoNames.forEach(function (name) {
			if (fs.existsSync(path.join(recommendationSrcDir, name, 'contentexport'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	//
	// Taxonomies
	//
	console.log('Taxonomies:');
	var taxonomyNames = fs.existsSync(taxonomiesSrcDir) ? fs.readdirSync(taxonomiesSrcDir) : [];
	if (taxonomyNames) {
		taxonomyNames.forEach(function (name) {
			var taxPath = path.join(taxonomiesSrcDir, name);
			if (fs.statSync(taxPath).isDirectory()) {
				var files = fs.readdirSync(path.join(taxonomiesSrcDir, name));
				var jsonExist = false;
				if (files) {
					for (var i = 0; i < files.length; i++) {
						if (serverUtils.endsWith(files[i], '.json')) {
							jsonExist = true;
							break;
						}
					}
				}
				if (jsonExist) {
					console.log('    ' + name);
				}
			}
		});
	}
	console.log('');

	console.log('Translation connectors:');
	var connectorNames = fs.existsSync(connectorsSrcDir) ? fs.readdirSync(connectorsSrcDir) : [];
	if (connectorNames) {
		connectorNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectorsSrcDir, name, 'package.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	console.log('Translation connections:');
	var connectionNames = fs.existsSync(connectionsSrcDir) ? fs.readdirSync(connectionsSrcDir) : [];
	if (connectionNames) {
		connectionNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectionsSrcDir, name, 'connection.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	console.log('Translation jobs:');
	var jobNames = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	if (jobNames) {
		jobNames.forEach(function (name) {
			if (fs.existsSync(path.join(transSrcDir, name, 'site')) || fs.existsSync(path.join(transSrcDir, name, 'job.json'))) {
				console.log('    ' + name);
			}
		});
	}
	console.log('');

	done(true);
};

module.exports.listServerResources = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}


	_listServerResourcesRest(server, serverName, argv, done);

};

var _querySiteTotalItems = function (server, sites) {
	return new Promise(function (resolve, reject) {
		var total = sites.length;
		var groups = [];
		var limit = 20;
		var start, end;
		for (var i = 0; i < total / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= total) {
				end = total - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < total - 1) {
			groups.push({
				start: end + 1,
				end: total - 1
			});
		}

		var totalItems = [];
		var doGetItems = groups.reduce(function (itemPromise, param) {
			return itemPromise.then(function (result) {
				var itemPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					let site = sites[i];
					if (site.isEnterprise && site.channel && site.channel.id) {
						var q = 'channels co "' + site.channel.id + '"';
						itemPromises.push(serverRest.queryItems({
							server: server,
							q: q,
							limit: 1,
							showTotal: false
						}));
					}
				}

				return Promise.all(itemPromises).then(function (results) {
					results.forEach(function (result) {
						if (result.query) {
							totalItems.push({
								query: result.query,
								totalItems: result.limit || 0
							});
						}
					});
				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doGetItems.then(function (result) {
			resolve(totalItems);
		});

	});
};

var _querySiteItemsFromOtherRepos = function (server, sites) {
	return new Promise(function (resolve, reject) {
		var total = sites.length;
		var groups = [];
		var limit = 20;
		var start, end;
		for (var i = 0; i < total / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= total) {
				end = total - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < total - 1) {
			groups.push({
				start: end + 1,
				end: total - 1
			});
		}

		var totalItems = [];
		var doGetItems = groups.reduce(function (itemPromise, param) {
			return itemPromise.then(function (result) {
				var itemPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					let site = sites[i];
					if (site.isEnterprise && site.channel && site.channel.id && site.repository && site.repository.id) {
						var q = 'repositoryId ne "' + site.repository.id + '" AND channels co "' + site.channel.id + '"';
						itemPromises.push(serverRest.queryItems({
							server: server,
							q: q,
							limit: 1,
							showTotal: false
						}));
					}
				}

				return Promise.all(itemPromises).then(function (results) {
					results.forEach(function (result) {
						if (result.query) {
							totalItems.push({
								query: result.query,
								otherItems: result.limit || 0
							});
						}
					});
				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doGetItems.then(function (result) {
			resolve(totalItems);
		});

	});
};


var _listServerResourcesRest = function (server, serverName, argv, done) {

	var types = argv.types ? argv.types.split(',') : [];

	var listChannels = types.length === 0 || types.includes('channels');
	var listComponents = types.length === 0 || types.includes('components');
	var listLocalizationpolicies = types.length === 0 || types.includes('localizationpolicies');
	var listRankingPolicies = types.length === 0 || types.includes('rankingpolicies');
	var listRecommendations = types.length === 0 || types.includes('recommendations');
	var listRepositories = types.length === 0 || types.includes('repositories');
	var listSites = types.length === 0 || types.includes('sites');
	var listTemplates = types.length === 0 || types.includes('templates');
	var listThemes = types.length === 0 || types.includes('themes');
	var listTranslationConnectors = types.length === 0 || types.includes('translationconnectors');
	var listTaxonomies = types.length === 0 || types.includes('taxonomies');
	var listWorkflows = types.length === 0 || types.includes('workflows');
	var listBackgroundJobs = types.length === 0 || types.includes('backgroundjobs');

	if (!listChannels && !listComponents && !listLocalizationpolicies && !listRecommendations &&
		!listRankingPolicies && !listRepositories && !listSites &&
		!listTemplates && !listThemes && !listTaxonomies && !listWorkflows && !listTranslationConnectors &&
		!listBackgroundJobs) {
		console.error('ERROR: invalid resource types: ' + argv.types);
		done();
		return;
	}


	var format = '  %-36s';
	var format2 = '  %-36s  %-36s';
	var format3 = '  %-36s  %-36s  %-s';

	var sites = [];
	var siteTotalItems = [];
	var siteItemsFromOtherRepos = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var promises = (listChannels || listRepositories || listRecommendations) ? [serverRest.getChannels({
			server: server,
			fields: 'channelType,publishPolicy,channelTokens'
		})] : [];
		var channels;

		Promise.all(promises).then(function (results) {
			//
			// List channels
			//
			var channelTitleFormat = '  %-36s  %-36s  %-12s  %-8s  %-s';
			channels = results.length > 0 ? results[0] : [];
			channels.forEach((channel) => { channel.name = formatter.channelFormat(channel.name); });
			if (listChannels) {
				console.log('Channels:');
				console.log(sprintf(channelTitleFormat, 'Name', 'Token', 'SiteChannel', 'Access', 'Publishing'));
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
					var publishPolicy = channel.publishPolicy === 'anythingPublished' ? 'Anything can be published' : 'Only approved items can be published';
					var channelRowFormat = `  %-${formatter.channelColSize(36, channel.name)}s  %-36s  %-12s  %-8s  %-s`;
					console.log(sprintf(channelRowFormat, channel.name, channelToken, channel.isSiteChannel ? '    √' : '', channel.channelType, publishPolicy));
				}
				if (channels.length > 0) {
					console.log('Total: ' + channels.length);
				}
				console.log('');
			}

			promises = listComponents ? [sitesRest.getComponents({
				server: server
			})] : [];

			return Promise.all(promises);
		})
			.then(function (results) {
				//
				// list components
				//
				var comps = results.length > 0 ? results[0] : [];
				if (listComponents) {
					console.log('Components:');
					var titleFormat = '  %-36s  %-36s  %-s';
					console.log(sprintf(titleFormat, 'Name', 'Type', 'Published'));
					for (var i = 0; i < comps.length; i++) {
						var comp = comps[i];
						var compType = comp.type || 'local';
						var typeLabel = 'Local Component';
						if (compType.toLowerCase() === 'componentgroup') {
							typeLabel = 'Component Group';
						} else if (compType === 'remote') {
							typeLabel = 'Remote Component';
						} else if (compType.toLowerCase() === 'contentlayout') {
							typeLabel = 'Content Layout';
						} else if (compType === 'sandboxed') {
							typeLabel = 'Local component in an iframe';
						} else if (compType.toLowerCase() === 'sectionlayout') {
							typeLabel = 'Section Layout';
						} else if (compType.toLowerCase() === 'fieldeditor') {
							typeLabel = 'Content Field Editor';
						} else if (compType.toLowerCase() === 'contentform') {
							typeLabel = 'Content Form';
						} else if (compType.toLowerCase() === 'visualbuilder') {
							typeLabel = 'Visual Builder Component';
						} else if (compType.toLowerCase() === 'translationeditor') {
							typeLabel = 'Translation Job Editor';
						} else if (compType.toLowerCase() === 'rsstemplate') {
							typeLabel = 'RSS Template';
						}
						var published = comp.publishStatus === 'published' ? '    √' : '';
						comp.name = formatter.componentFormat(comp.name);
						var rowFormat = `  %-${formatter.componentColSize(36, comp.name)}s  %-36s  %-s`;
						console.log(sprintf(rowFormat, comp.name, typeLabel, published));
					}
					if (comps.length > 0) {
						console.log('Total: ' + comps.length);
					}
					console.log('');
				}

				promises = listLocalizationpolicies ? [serverRest.getLocalizationPolicies({
					server: server
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
					if (policies.length > 0) {
						console.log('Total: ' + policies.length);
					}
					console.log('');
				}

				promises = listRankingPolicies ? [serverRest.getRankingPolicyDescriptors({
					server: server
				})] : [];

				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// list ranking policies
				//
				if (listRankingPolicies) {
					var rankingPolicies = results && results[0] || [];
					console.log('Ranking policies:');
					var policyFormat = '  %-36s  %-36s  %-10s  %-10s  %-s';
					// console.log(JSON.stringify(rankingPolicies, null, 4));
					console.log(sprintf(policyFormat, 'Name', 'API Name', 'Draft', 'Promoted', 'Published'));
					rankingPolicies.forEach(function (policy) {
						var draft = policy.draftUID ? '  √' : '';
						var promoted = policy.promotedVersion ? ('  v' + policy.promotedVersion) : '';
						var published = policy.publishedVersion ? ('  v' + policy.publishedVersion) : '';
						console.log(sprintf(policyFormat, policy.name, policy.apiName, draft, promoted, published));
					});

					if (rankingPolicies.length > 0) {
						console.log('Total: ' + rankingPolicies.length);
					}
					console.log('');
				}

				promises = (listRepositories || listRecommendations) ? [serverRest.getRepositories({
					server: server,
					fields: 'contentTypes,channels,defaultLanguage'
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
					var repoTitleFormat = '  %-4s  %-30s  %-16s  %-42s  %-s';
					console.log(sprintf(repoTitleFormat, 'Type', 'Name', 'Default Language', 'Channels', 'Content Types'));
					for (var i = 0; i < repositories.length; i++) {
						var repo = repositories[i];
						var contentTypes = [];
						var j;
						for (j = 0; j < repo.contentTypes.length; j++) {
							contentTypes.push(formatter.typeFormat(repo.contentTypes[j].name));
						}
						var repoChannels = [];
						for (j = 0; j < repo.channels.length; j++) {
							for (var k = 0; k < channels.length; k++) {
								if (repo.channels[j].id === channels[k].id) {
									repoChannels.push(channels[k].name);
								}
							}
						}
						var repoType = repositories[i].repositoryType === 'Business' ? ' B' : ' S';
						repo.name = formatter.repositoryFormat(repo.name);
						var repoRowFormat = `  %-4s  %-${formatter.repositoryColSize(30, repo.name, repoChannels)}s  %-16s  %-${formatter.channelColSize(42, repoChannels)}s  %-s`;
						console.log(sprintf(repoRowFormat, repoType, repo.name, repo.defaultLanguage, repoChannels, contentTypes));
					}
					if (repositories.length > 0) {
						console.log('Total: ' + repositories.length);
					}
					console.log('');
				}

				promises = [];
				if (listRecommendations && repositories && repositories.length > 0) {
					repositories.forEach(function (repo) {
						promises.push(serverRest.getRecommendations({
							server: server,
							repositoryId: repo.id,
							repositoryName: repo.name,
							fields: 'all'
						}));
					});
				}

				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list recommendations
				//
				if (listRecommendations) {
					console.log('Recommendations:');
					var allRecommendations = results.length > 0 ? results : [];
					var recFormat = '  %-36s  %-7s  %-16s  %-10s  %-10s  %-24s  %-32s  %-s';
					// console.log(sprintf(recFormat, 'Name', 'Version', 'API Name', 'Status', 'Published', 'Content Type', 'Channels', 'Published Channels'));
					allRecommendations.forEach(function (value) {
						if (value && value.repositoryId && value.data) {
							var recommendations = value.data;
							if (recommendations.length > 0) {
								console.log('* Repository: ' + value.repositoryName);
								console.log(sprintf(recFormat, 'Name', 'Version', 'API Name', 'Status', 'Published', 'Content Type', 'Channels', 'Published Channels'));
								for (var i = 0; i < recommendations.length; i++) {
									var repositoryLabel = i === 0 ? value.repositoryName : '';
									var recomm = recommendations[i];
									var publishLabel = recomm.isPublished ? '   √' : '';
									var versionLabel = '  ' + recomm.version;
									var contentTypes = [];
									var j, k;
									for (j = 0; j < recomm.contentTypes.length; j++) {
										contentTypes.push(recomm.contentTypes[j].name);
									}
									var channelNames = [];
									if (recomm.channels && recomm.channels.length > 0 && channels.length > 0) {
										for (j = 0; j < recomm.channels.length; j++) {
											for (k = 0; k < channels.length; k++) {
												if (recomm.channels[j].id === channels[k].id) {
													channelNames.push(channels[k].name);
													break;
												}
											}
										}
									}
									var publishedChannelNames = [];
									if (recomm.publishedChannels && recomm.publishedChannels.length > 0 && channels.length > 0) {
										for (j = 0; j < recomm.publishedChannels.length; j++) {
											for (k = 0; k < channels.length; k++) {
												if (recomm.publishedChannels[j].id === channels[k].id) {
													publishedChannelNames.push(channels[k].name);
													break;
												}
											}
										}
									}
									console.log(sprintf(recFormat, recomm.name, versionLabel, recomm.apiName,
										recomm.status, publishLabel, contentTypes.join(', '),
										channelNames.join(', '), publishedChannelNames.join(', ')));
								}
							}
						}
					});
					console.log('');
				}

				promises = listSites ? [sitesRest.getSites({
					server: server,
					expand: 'channel,repository'
				})] : [];
				return Promise.all(promises);
			})
			.then(function (results) {
				sites = results.length > 0 ? results[0] : [];

				// query items in a site
				promises = listSites ? [_querySiteTotalItems(server, sites)] : [];

				return Promise.all(promises);
			})
			.then(function (results) {

				if (listSites) {
					siteTotalItems = results && results[0] || [];
				}
				// query items from other repositories
				promises = listSites ? [_querySiteItemsFromOtherRepos(server, sites)] : [];

				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list sites
				//
				if (listSites) {
					siteItemsFromOtherRepos = results && results[0] || [];
					console.log('Sites:');
					var siteTitleFormat = '  %-36s  %-36s  %-10s  %-10s  %-6s  %-6s  %-12s  %-s';
					console.log(sprintf(siteTitleFormat, 'Name', 'Theme', 'Type', 'Published', 'Online', 'Secure', 'Total Items', 'Items from other repos'));
					for (var i = 0; i < sites.length; i++) {
						var site = sites[i];
						var type = site.isEnterprise ? 'Enterprise' : 'Standard';
						var published = site.publishStatus !== 'unpublished' ? '    √' : '';
						var online = site.runtimeStatus === 'online' ? '  √' : '';
						var secure = site.security && site.security.access && !site.security.access.includes('everyone') ? '  √' : '';
						var totalItems = 0;
						var otherItems = 0;
						if (site.isEnterprise && site.channel && site.channel.id) {
							for (let j = 0; j < siteTotalItems.length; j++) {
								if (siteTotalItems[j].query.indexOf(site.channel.id) > 0) {
									totalItems = siteTotalItems[j].totalItems;
								}
							}
							for (let j = 0; j < siteItemsFromOtherRepos.length; j++) {
								if (siteItemsFromOtherRepos[j].query && siteItemsFromOtherRepos[j].query.indexOf(site.channel.id) > 0) {
									otherItems = siteItemsFromOtherRepos[j].otherItems;
								}
							}
						}
						site.name = formatter.siteFormat(site.name);
						site.themeName = formatter.themeFormat(site.themeName);
						var siteRowFormat = `  %-${formatter.siteColSize(36, site.name)}s  %-${formatter.themeColSize(36, site.themeName)}s  %-10s  %-10s  %-6s  %-6s  %-12s  %-s`;
						console.log(sprintf(siteRowFormat, site.name, site.themeName, type, published, online, secure, totalItems, otherItems));
					}
					if (sites.length > 0) {
						console.log('Total: ' + sites.length);
					}
					console.log('');
				}

				promises = listTemplates ? [sitesRest.getTemplates({
					server: server
				})] : [];
				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list templates
				//
				var templates = results.length > 0 ? results[0] : [];
				if (listTemplates) {
					console.log('Templates:');
					var templateTitleFormat = '  %-36s  %-36s  %-s';
					console.log(sprintf(templateTitleFormat, 'Name', 'Theme', 'Type'));
					for (var i = 0; i < templates.length; i++) {
						var temp = templates[i];
						var type = temp.isEnterprise ? 'Enterprise' : 'Standard';
						temp.name = formatter.templateFormat(temp.name);
						temp.themeName = formatter.themeFormat(temp.themeName);
						var templateRowFormat = `  %-${formatter.templateColSize(36, temp.name)}s  %-${formatter.themeColSize(36, temp.themeName)}s  %-s`;
						console.log(sprintf(templateRowFormat, temp.name, temp.themeName, type));
					}
				}
				if (templates.length > 0) {
					console.log('Total: ' + templates.length);
				}
				console.log('');

				promises = listThemes ? [sitesRest.getThemes({
					server: server
				})] : [];
				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// list themes
				//
				console.l
				var themes = results.length > 0 ? results[0] : [];
				if (listThemes) {
					console.log('Themes:');
					var themeTitleFormat = '  %-36s  %-36s';
					console.log(sprintf(themeTitleFormat, 'Name', 'Published'));
					for (var i = 0; i < themes.length; i++) {
						var status = themes[i].publishStatus === 'published' ? '   √' : '';
						themes[i].name = formatter.themeFormat(themes[i].name);
						var themeRowFormat = `  %-${formatter.themeColSize(36, themes[i].name)}s  %-36s`;
						console.log(sprintf(themeRowFormat, themes[i].name, status));
					}
				}
				if (themes.length > 0) {
					console.log('Total: ' + themes.length);
				}
				console.log('');

				promises = listTaxonomies ? [serverRest.getTaxonomies({
					server: server,
					fields: 'availableStates,publishedChannels'
				})] : [];

				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// list taxonomies
				//
				if (listTaxonomies) {
					var taxonomies = results && results.length > 0 && results[0] && results[0].length > 0 ? results[0] : [];
					console.log('Taxonomies:');
					var taxTitleFormat = '  %-45s  %-32s  %-12s  %-14s  %-10s  %-8s  %-10s  %-s';
					console.log(sprintf(taxTitleFormat, 'Name', 'Id', 'Abbreviation', 'isPublishable', 'Status', 'Version', 'Published', 'Published Channels'));
					taxonomies.forEach(function (tax) {
						var publishable = tax.isPublishable ? '     √' : '';
						var channels = [];
						var publishedChannels = tax.publishedChannels || [];
						publishedChannels.forEach(function (channel) {
							channels.push(channel.name);
						});
						var states = tax.availableStates;
						for (var i = 0; i < states.length; i++) {
							var name = i === 0 ? tax.name : '';
							var id = i === 0 ? tax.id : '';
							var abbr = i === 0 ? '    ' + tax.shortName : '';
							var version = states[i].version ? '   ' + states[i].version : '';
							var published = states[i].published ? '    √' : '';
							var channelLabel = states[i].published ? channels.join(', ') : '';

							var taxRowFormat = `  %-${formatter.taxonomyColSize(45, name)}s  %-32s  %-12s  %-14s  %-10s  %-8s  %-10s  %-s`;
							console.log(sprintf(taxRowFormat, formatter.taxonomyFormat(name), id, abbr, publishable, states[i].status, version, published, channelLabel));
						}
					});
					if (taxonomies.length > 0) {
						console.log('Total: ' + taxonomies.length);
					}
					console.log('');
				}

				promises = listTranslationConnectors ? [serverUtils.browseTranslationConnectorsOnServer(server)] : [];

				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// list translation connectors
				//
				if (listTranslationConnectors) {
					var connectors = results[0] && results[0].data || [];
					console.log('Translation Connectors:');
					var connectorFormat = '  %-46s  %-36s  %-s';
					console.log(sprintf(connectorFormat, 'Id', 'Name', 'Enabled'));
					for (var i = 0; i < connectors.length; i++) {
						var conn = connectors[i];
						console.log(sprintf(connectorFormat, conn.connectorId, conn.connectorName, (conn.isEnabled && conn.isEnabled.toLowerCase() === 'true' ? '   √' : '')));
					}
					console.log('');
				}

				promises = listWorkflows ? [serverRest.getWorkflows({
					server: server
				})] : [];

				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// List workflows
				//
				if (listWorkflows) {
					console.log('Workflows:');
					var wfFormat = '  %-36s  %-42s  %-8s  %-8s  %-s';
					var workflows = results && results.length > 0 && results[0] && results[0].length > 0 ? results[0] : [];
					console.log(sprintf(wfFormat, 'Name', 'Application Name', 'Revision', 'Enabled', 'Role Name'));
					workflows.forEach(function (wf) {
						var enabled = wf.isEnabled ? '  √' : '';
						console.log(sprintf(wfFormat, wf.name, wf.applicationName, wf.revision, enabled, wf.roleName));
					});
					if (workflows.length > 0) {
						console.log('Total: ' + workflows.length);
					}
					console.log('');
				}

				promises = [];
				if (listBackgroundJobs) {
					promises.push(serverUtils.getBackgroundServiceJobs(server, 'site'));
					promises.push(serverUtils.getBackgroundServiceJobs(server, 'theme'));
					promises.push(serverUtils.getBackgroundServiceJobs(server, 'template'));
				}

				return Promise.all(promises);

			})
			.then(function (results) {
				//
				// List back ground jobs (sites, themes, templates)
				//
				if (listBackgroundJobs) {
					console.log('Background jobs:');
					/*
					var jobFormat = '  %-20s  %-s';
					jobs.forEach(function (job) {
						console.log(sprintf(jobFormat, 'Id', job.JobID));
						console.log(sprintf(jobFormat, 'Type', job.JobType));
						console.log(sprintf(jobFormat, 'Action', job.JobAction));
						console.log(sprintf(jobFormat, 'Status', job.JobStatus));
						console.log(sprintf(jobFormat, 'Percentage', job.JobPercentage));
						console.log(sprintf(jobFormat, 'Creator', (job.JobCreatorFullName || job.JobCreatorLoginName)));
						console.log(sprintf(jobFormat, 'CreateDate', job.JobCreateDate));
						console.log(sprintf(jobFormat, 'Message', job.JobMessage));
						console.log('');
					});
					*/
					var jobFormat = '  %-57s  %-8s %-18s %-10s %-3s %-30s %-20s %-s';
					console.log(sprintf(jobFormat, 'Id', 'Type', 'Action', 'Status', '%', 'Creator', 'CreateDate', 'Message'));
					if (results && results.length > 0) {
						var totalJobs = 0;
						for (var i = 0; i < results.length; i++) {
							var jobs = results[i];
							if (jobs && !jobs.err) {
								jobs.forEach(function (job) {
									job.JobID = formatter.bgjobFormat(job.JobID);
									console.log(sprintf(jobFormat, job.JobID, job.JobType, job.JobAction, job.JobStatus,
										job.JobPercentage, (job.JobCreatorFullName || job.JobCreatorLoginName),
										job.JobCreateDate, job.JobMessage));
									totalJobs += 1;
								});
							}
						}
						if (totalJobs > 0) {
							console.log('Total: ' + totalJobs);
						}
					}
				}

				done(true);
			});
	});
};


module.exports.listActivities = function (argv, done) {
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

	var type = argv.type;
	var objectType = type[0].toUpperCase() + type.slice(1).toLowerCase();
	var category = argv.category;
	var eventCategory;
	if (category) {
		if (category === 'publishing') {
			eventCategory = type === 'site' ? 'SITE_PUBLISHING' : 'ASSET_PUBLISHING';
		} else if (category === 'lifecycle') {
			eventCategory = 'SITE_LIFECYCLE';
		} else if (category === 'security') {
			eventCategory = type === 'site' ? 'SITE_SECURITY' : 'ASSET_SECURITY'
		} else if (category === 'administration') {
			eventCategory = 'ASSET_ADMINISTRATION';
		}
	}

	var name = argv.name;
	var objectId;

	var beforeDate = argv.before === undefined ? '' : argv.before.toString();
	var afterDate = argv.after === undefined ? '' : argv.after.toString();

	if (beforeDate && !afterDate) {
		beforeDate = (new Date(beforeDate)).toISOString();
		afterDate = (new Date('1900')).toISOString();
	} else if (!beforeDate && afterDate) {
		beforeDate = (new Date()).toISOString();
		afterDate = (new Date(afterDate)).toISOString();
	} else if (beforeDate && afterDate) {
		beforeDate = (new Date(beforeDate)).toISOString();
		afterDate = (new Date(afterDate)).toISOString();
	}

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var resourcePromises = [];
		if (name) {
			if (type === 'site') {
				resourcePromises.push(sitesRest.getSite({ server: server, name: name }));
			} else if (type === 'repository') {
				resourcePromises.push(serverRest.getRepositoryWithName({ server: server, name: name }));
			} else if (type === 'channel') {
				resourcePromises.push(serverRest.getChannelWithName({ server: server, name: name }));
			} else if (type === 'taxonomy') {
				resourcePromises.push(serverRest.getTaxonomyWithName({server: server, name: name}));
			}
		}
		Promise.all(resourcePromises)
			.then(function (results) {
				if (name) {
					if (!results || !results[0] || results[0].err) {
						console.error('ERROR: ' + type + ' ' + name + ' not found');
						return Promise.reject();
					}
					let obj = type === 'site' ? results[0] : results[0].data;
					if (!obj || !obj.id) {
						console.error('ERROR: ' + type + ' ' + name + ' not found');
						return Promise.reject();
					}
					objectId = obj.id;
					console.info(' - get resource (Id: ' + objectId + ' name: ' + name + ')');
				}

				return serverRest.getAllActivities({
					server: server,
					objectType: objectType,
					objectId: objectId,
					eventCategory: eventCategory,
					beforeDate: beforeDate,
					afterDate: afterDate
				});

			})
			.then(function (result) {
				var acts = result || [];
				// console.log(JSON.stringify(acts, null, 4));

				if (!name) {
					// sort by name
					var byName = acts.slice(0);
					byName.sort(function (a, b) {
						var x = a.activityDetails.name;
						var y = b.activityDetails.name;
						var dateA = a.registeredAt;
						var dateB = b.registeredAt;
						return (x < y ? -1 : x > y ? 1 : (dateA <= dateB ? 1 : -1));
					});
					acts = byName;
				}

				var format = '  %-36s  %-20s  %-24s  %-32s  %-s';
				if (acts.length > 0) {
					// console.log(acts[0]);
					console.log(sprintf(format, 'Name', 'Action', 'Date', 'By', 'Message'));
					var cats = [];
					acts.forEach(function (event) {
						if (event.event && event.event.categories) {
							if (!cats.includes(event.event.categories[0].name)) {
								cats.push(event.event.categories[0].name);
							}
						}
						var initiatedBy = event.initiatedBy;
						var detail = event.activityDetails;
						var msg = event.message && event.message.text || '';
						var action = detail.action || detail.source || '';
						var updatedBy = detail.updatedBy || (initiatedBy && (initiatedBy.displayName || initiatedBy.name)) || '';
						console.log(sprintf(format, detail.name, action.toLowerCase(), event.registeredAt, updatedBy, msg));
					});
					console.log('');
					console.log(' - total activities: ' + acts.length);
					// console.log(cats);
				} else {
					console.log(' - no activities found');
				}
				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};


module.exports.describeBackgroundJob = function (argv, done) {
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

	var jobId = argv.id.toString();

	var wait = typeof argv.wait === 'string' && argv.wait.toLowerCase() === 'true';

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var jobFormat = '  %-20s  %-s';
		var job;

		serverUtils.getBackgroundServiceJobStatus(server, '', jobId)
			.then(function (result) {

				if (result && result.JobID === jobId) {
					// site/template/theme/component job
					job = result;
					// console.log(job);

					var jobData;
					var item;
					var publishJobData;

					var sitePromises = [];
					sitePromises.push(serverUtils.getBackgroundServiceJobData(server, '', jobId));
					sitePromises.push(sitesRest.resourceExist({ server: server, type: job.JobType + 's', id: job.ItemID, showInfo: false }));
					sitePromises.push(_getPublishingSiteJobProgress(server, job.JobID));

					Promise.all(sitePromises)
						.then(function (results) {
							jobData = results && results[0];
							item = results && results[1];
							publishJobData = results && results[2] || {};

							if ((job.JobStatus === 'PROCESSING' || job.JobStatus === 'QUEUED') && wait) {
								console.log('');
								console.log(sprintf(jobFormat, 'Id', job.JobID));
								console.log(sprintf(jobFormat, 'Type', job.JobType));
								if (job.ItemID) {
									let label = serverUtils.capitalizeFirstChar(job.JobType);
									console.log(sprintf(jobFormat, label + ' Id', job.ItemID));
									if (item && item.id && item.name) {
										console.log(sprintf(jobFormat, label + ' Name', item.name));
									}
								}
								console.log(sprintf(jobFormat, 'Action', job.JobAction));

								var inter = setInterval(function () {
									process.stdout.write(sprintf(jobFormat, 'Processing ', job.JobPercentage + ' [' + serverUtils.timeUsed(new Date(job.JobCreateDate), new Date()) + '] ...'));
									if (job.JobAction === 'publish' && job.JobType === 'site' && publishJobData) {
										let publishingStatus = ' (tasks total: ' + publishJobData.total + '  completed: ' + publishJobData.completed + '  failed: ' + publishJobData.failed + '  queued: ' + publishJobData.queued + ')';
										process.stdout.write(publishingStatus);
									}
									readline.cursorTo(process.stdout, 0);

									sitePromises = [];
									sitePromises.push(serverUtils.getBackgroundServiceJobStatus(server, '', jobId));
									sitePromises.push(serverUtils.getBackgroundServiceJobData(server, '', jobId));
									sitePromises.push(_getPublishingSiteJobProgress(server, job.JobID));
									Promise.all(sitePromises)
										.then(function (results) {
											job = results && results[0];
											jobData = results && results[1];
											publishJobData = results && results[2] || {};

											if (job.JobStatus === 'PROCESSING' || job.JobStatus === 'QUEUED') {
												process.stdout.write(sprintf(jobFormat, 'Processing ', job.JobPercentage + ' [' + serverUtils.timeUsed(new Date(job.JobCreateDate), new Date()) + '] ...'));
												if (job.JobAction === 'publish' && job.JobType === 'site' && publishJobData) {
													let publishingStatus = sprintf('%-s', ' (tasks total: ' + publishJobData.total + '  completed: ' + publishJobData.completed + '  failed: ' + publishJobData.failed + '  queued: ' + publishJobData.queued + ')          ');
													process.stdout.write(publishingStatus);
												}
												readline.cursorTo(process.stdout, 0);
											} else {
												clearInterval(inter);
												process.stdout.write(sprintf('%-100s', ' '));
												readline.cursorTo(process.stdout, 0);
												console.log(sprintf(jobFormat, 'Status', job.JobStatus));
												console.log(sprintf(jobFormat, 'Percentage', job.JobPercentage));
												console.log(sprintf(jobFormat, 'Creator', (job.JobCreatorFullName || job.JobCreatorLoginName)));
												console.log(sprintf(jobFormat, 'CreateDate', job.JobCreateDate));
												console.log(sprintf(jobFormat, 'CompleteDate', job.JobCompleteDate));
												var duration = job.JobCompleteDate ? serverUtils.timeUsed(new Date(job.JobCreateDate), new Date(job.JobCompleteDate)) :
													job.JobStatus === 'PROCESSING' ? serverUtils.timeUsed(new Date(job.JobCreateDate), new Date()) : '';
												console.log(sprintf(jobFormat, 'Time', duration));

												console.log(sprintf(jobFormat, 'Message', job.JobMessage));
												if (jobData && jobData.LocalData) {
													if (jobData.LocalData.compileServiceJobErrorMsg) {
														console.log(sprintf(jobFormat, 'CompileServiceError', jobData.LocalData.compileServiceJobErrorMsg));
													}
												}
												console.log('');

												if (job.JobAction === 'publish' && job.JobType === 'site' && job.JobStatus !== 'COMPLETE' && publishJobData) {
													var publishingStatus = 'total: ' + publishJobData.total + '  completed: ' + publishJobData.completed + '  failed: ' + publishJobData.failed + '  queued: ' + publishJobData.queued;
													console.log(sprintf(jobFormat, 'Publishing tasks', publishingStatus));
													if (publishJobData.failures && publishJobData.failures.length > 0) {
														console.log(publishJobData.failures);
													}

													console.log('');
												}
											}

										});

								}, 6000);

							} else {
								console.log('');
								console.log(sprintf(jobFormat, 'Id', job.JobID));
								console.log(sprintf(jobFormat, 'Type', job.JobType));
								if (job.ItemID) {
									let label = serverUtils.capitalizeFirstChar(job.JobType);
									console.log(sprintf(jobFormat, label + ' Id', job.ItemID));
									if (item && item.id && item.name) {
										console.log(sprintf(jobFormat, label + ' Name', item.name));
									}
								}
								console.log(sprintf(jobFormat, 'Action', job.JobAction));
								console.log(sprintf(jobFormat, 'Status', job.JobStatus));
								console.log(sprintf(jobFormat, 'Percentage', job.JobPercentage));
								console.log(sprintf(jobFormat, 'Creator', (job.JobCreatorFullName || job.JobCreatorLoginName)));
								console.log(sprintf(jobFormat, 'CreateDate', job.JobCreateDate));
								console.log(sprintf(jobFormat, 'CompleteDate', job.JobCompleteDate));
								var duration = job.JobCompleteDate ? serverUtils.timeUsed(new Date(job.JobCreateDate), new Date(job.JobCompleteDate)) :
									job.JobStatus === 'PROCESSING' ? serverUtils.timeUsed(new Date(job.JobCreateDate), new Date()) : '';
								console.log(sprintf(jobFormat, 'Time', duration));

								console.log(sprintf(jobFormat, 'Message', job.JobMessage));
								if (jobData && jobData.LocalData) {
									if (jobData.LocalData.compileServiceJobErrorMsg) {
										console.log(sprintf(jobFormat, 'CompileServiceError', jobData.LocalData.compileServiceJobErrorMsg));
									}
								}
								console.log('');

								if (job.JobAction === 'publish' && job.JobType === 'site' && job.JobStatus !== 'COMPLETE' && publishJobData) {
									var publishingStatus = 'total: ' + publishJobData.total + '  completed: ' + publishJobData.completed + '  failed: ' + publishJobData.failed + '  queued: ' + publishJobData.queued;
									console.log(sprintf(jobFormat, 'Publishing tasks', publishingStatus));
									if (publishJobData.failures && publishJobData.failures.length > 0) {
										// display failed publishing jobs for browser
										if (process.shim) {
											for (let f of publishJobData.failures) {
												for (let k in f) {
													console.log(`\t - ${k}\t${f[k]}`)
												}
											}
										} else {
											console.log(publishJobData.failures);
										}
									}

									console.log('');
								}
							}
							done(true);
							return;
						});


				} else {
					//
					// continue to check if it is content job
					//
					var jobPromises = [];
					jobPromises.push(serverRest.getContentJobStatus({ server: server, jobId: jobId, hideError: true, type: 'importjobs' }));
					jobPromises.push(serverRest.getContentJobStatus({ server: server, jobId: jobId, hideError: true, type: 'exportjobs' }));
					jobPromises.push(serverRest.getContentImportJobResult({ server: server, jobId: jobId }));

					Promise.all(jobPromises)
						.then(function (results) {
							var importJob = results && results[0] && results[0].data;
							var exportJob = results && results[1] && results[1].data;
							var importResults = results && results[2];
							var jobAction = importResults && importResults.length > 0 ? 'import' : 'export';
							var job = jobAction === 'import' ? importJob : exportJob;

							if (job && job.jobId === jobId) {
								if (job.status === 'INPROGRESS' && wait) {
									console.log('');
									console.log(sprintf(jobFormat, 'Id', job.jobId));
									console.log(sprintf(jobFormat, 'Type', 'content'));
									console.log(sprintf(jobFormat, 'Action', jobAction));
									var inter = setInterval(function () {
										var percentage = jobAction === 'import' && importJob && importJob.hasOwnProperty('statusPercent') ? (importJob.statusPercent + ' ') : '';
										process.stdout.write(sprintf(jobFormat, 'Processing ', percentage + ' [' + serverUtils.timeUsed(new Date(job.startedDate.value), new Date()) + '] ...'));
										readline.cursorTo(process.stdout, 0);
										// query again
										jobPromises = [];
										jobPromises.push(serverRest.getContentJobStatus({ server: server, jobId: jobId, hideError: true, type: 'importjobs' }));
										jobPromises.push(serverRest.getContentJobStatus({ server: server, jobId: jobId, hideError: true, type: 'exportjobs' }));
										jobPromises.push(serverRest.getContentImportJobResult({ server: server, jobId: jobId }));
										Promise.all(jobPromises)
											.then(function (results) {
												importJob = results && results[0] && results[0].data;
												exportJob = results && results[1] && results[1].data;
												importResults = results && results[2];
												job = jobAction === 'import' ? importJob : exportJob;
												if (job.status === 'INPROGRESS') {
													percentage = jobAction === 'import' && importJob && importJob.hasOwnProperty('statusPercent') ? (importJob.statusPercent + ' ') : '';
													process.stdout.write(sprintf(jobFormat, 'Processing ', percentage + '[' + serverUtils.timeUsed(new Date(job.startedDate.value), new Date()) + '] ...'));
													readline.cursorTo(process.stdout, 0);
												} else {
													clearInterval(inter);
													console.log(sprintf(jobFormat, 'Status', job.status + '        '));

													if (jobAction === 'import' && importJob && importJob.hasOwnProperty('statusPercent')) {
														console.log(sprintf(jobFormat, 'Percentage', importJob.statusPercent));
													}
													console.log(sprintf(jobFormat, 'Creator', job.startedBy));
													console.log(sprintf(jobFormat, 'CreateDate', job.startedDate && job.startedDate.value));
													if (jobAction === 'export' && exportJob && exportJob.summary) {
														if (exportJob.summary.contentItems) {
															console.log(sprintf(jobFormat, 'Exported items', exportJob.summary.contentItems.length));
														}
													}
													if (importResults && importResults.length > 0) {
														var importedItems = [];
														importResults.forEach(function (entry) {
															if (entry.status === 'SUCCESS') {
																var rows = entry.rows || [];
																for (var i = 0; i < rows.length; i++) {
																	if (rows[i].type === 'Item' && rows[i].copyId && !importedItems.includes(rows[i].copyId)) {
																		importedItems.push(rows[i].copyId);
																	}
																}
															}
														});
														console.log(sprintf(jobFormat, 'Imported items', importedItems.length));
													}
													let downloadLink = exportJob && exportJob.downloadLink && exportJob.downloadLink[0] && exportJob.downloadLink[0].href;
													if (downloadLink) {
														console.log(sprintf(jobFormat, 'content file', downloadLink));
													}
													if (job.errorDescription) {
														console.log(sprintf(jobFormat, 'Message', job.errorDescription));
													}

													console.log('');
												}
											});
									}, 6000);

								} else {
									console.log('');
									console.log(sprintf(jobFormat, 'Id', job.jobId));
									console.log(sprintf(jobFormat, 'Type', 'content'));
									console.log(sprintf(jobFormat, 'Action', jobAction));
									console.log(sprintf(jobFormat, 'Status', job.status));

									if (jobAction === 'import' && importJob && importJob.hasOwnProperty('statusPercent')) {
										console.log(sprintf(jobFormat, 'Percentage', importJob.statusPercent));
									}
									console.log(sprintf(jobFormat, 'Creator', job.startedBy));
									console.log(sprintf(jobFormat, 'CreateDate', job.startedDate && job.startedDate.value));
									if (jobAction === 'export' && exportJob && exportJob.summary) {
										if (exportJob.summary.contentItems) {
											console.log(sprintf(jobFormat, 'Exported items', exportJob.summary.contentItems.length));
										}
									}
									if (importResults && importResults.length > 0) {
										var importedItems = [];
										importResults.forEach(function (entry) {
											if (entry.status === 'SUCCESS') {
												var rows = entry.rows || [];
												for (var i = 0; i < rows.length; i++) {
													if (rows[i].type === 'Item' && rows[i].copyId && !importedItems.includes(rows[i].copyId)) {
														importedItems.push(rows[i].copyId);
													}
												}
											}
										});
										console.log(sprintf(jobFormat, 'Imported items', importedItems.length));
									}
									let downloadLink = exportJob && exportJob.downloadLink && exportJob.downloadLink[0] && exportJob.downloadLink[0].href;
									if (downloadLink) {
										console.log(sprintf(jobFormat, 'content file', downloadLink));
									}
									if (job.errorDescription) {
										console.log(sprintf(jobFormat, 'Message', job.errorDescription));
									}

									console.log('');
								}
								done(true);

							} else {
								//
								// content async bulk op
								//

								var _displayBulkJob = function (job, showId) {
									let operations = job.result && job.result.body && job.result.body.operations;
									let jobAction = operations ? Object.keys(operations) : '';

									if (showId === undefined || showId) {
										console.log(sprintf(jobFormat, 'Id', job.id));
										console.log(sprintf(jobFormat, 'Type', 'bulk items operation'));
									}
									console.log(sprintf(jobFormat, 'Operation', jobAction));
									console.log(sprintf(jobFormat, 'Status', job.progress));
									console.log(sprintf(jobFormat, 'Percentage', job.completedPercentage));
									console.log(sprintf(jobFormat, 'StartTime', job.startTime && job.startTime.value));
									console.log(sprintf(jobFormat, 'EndTime', job.endTime && job.endTime.value || ''));
									let duration = job.endTime && job.endTime.value ? serverUtils.timeUsed(new Date(job.startTime.value), new Date(job.endTime.value)) :
										job.startTime && job.startTime.value ? serverUtils.timeUsed(new Date(job.startTime.value), new Date()) : '';
									console.log(sprintf(jobFormat, 'Time', duration));
									console.log(sprintf(jobFormat, 'Message', job.message));
									if (job.error && job.error.detail) {
										console.log(sprintf(jobFormat, 'Error', job.error.detail));
									}
								};

								serverRest.getItemOperationStatus({ server: server, statusId: jobId, hideError: true }).then(function (result) {
									if (result && result.id === jobId) {
										job = result;
										// console.log(JSON.stringify(job, null, 4));
										var operations = job.result && job.result.body && job.result.body.operations;
										var renditionJobId = operations && operations.generateRenditions && operations.generateRenditions.jobId;

										var jobsPromises = [];
										if (renditionJobId) {
											jobsPromises.push(serverRest.getItemOperationStatus({ server: server, statusId: renditionJobId, hideError: true }));
										}

										Promise.all(jobsPromises).then(function (results) {
											var renditionJob = renditionJobId ? results[0] : undefined;

											if (job.progress === 'processing' && wait) {
												console.log('');
												console.log(sprintf(jobFormat, 'Id', job.id));
												console.log(sprintf(jobFormat, 'Type', 'bulk items operation'));
												// pulling job till it finishes
												var inter = setInterval(function () {
													let processInfo = job.completedPercentage + ' [' + serverUtils.timeUsed(new Date(job.startTime.value), new Date()) + '] ...';
													if (renditionJob) {
														processInfo += ' (rendition job ' + renditionJob.progress + ' ' + renditionJob.completedPercentage + ' percent)';
													}
													process.stdout.write(sprintf(jobFormat, 'Processing ', processInfo));
													readline.cursorTo(process.stdout, 0);

													// query jobs again
													serverRest.getItemOperationStatus({ server: server, statusId: jobId, hideError: true }).then(function (result) {
														job = result;
														let operations = job.result && job.result.body && job.result.body.operations;
														renditionJobId = operations && operations.generateRenditions && operations.generateRenditions.jobId;

														jobsPromises = [];
														if (renditionJobId) {
															jobsPromises.push(serverRest.getItemOperationStatus({ server: server, statusId: renditionJobId, hideError: true }));
														}
														return Promise.all(jobsPromises);

													}).then(function (results) {
														renditionJob = renditionJobId ? results[0] : undefined;

														if (job.progress === 'processing') {
															let processInfo = job.completedPercentage + ' [' + serverUtils.timeUsed(new Date(job.startTime.value), new Date()) + '] ...';
															if (renditionJob) {
																processInfo += ' (rendition job ' + renditionJob.progress + ' ' + renditionJob.completedPercentage + ' percent)';
															}
															process.stdout.write(sprintf(jobFormat, 'Processing ', processInfo));
															readline.cursorTo(process.stdout, 0);
														} else {
															clearInterval(inter);
															_displayBulkJob(job, false);
															if (renditionJob) {
																console.log('');
																console.log('Rendition job:');
																_displayBulkJob(renditionJob);
															}
															console.log('');
															done(true);
														}
													})
												}, 6000);
											} else {
												console.log('');
												_displayBulkJob(job);

												if (renditionJob) {
													console.log('');
													console.log('Rendition job:');
													_displayBulkJob(renditionJob);
												}
												console.log('');
												done(true);
											}

										});
									} else {
										//
										// invalid job id
										//
										console.error('ERROR: job not found');
										done();
									}
								});
							} // bulk operation

						});
				}
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

var _getPublishingSiteJobProgress = function (server, jobId) {
	return new Promise(function (resolve, reject) {
		var url = '/documents/integration?IdcService=SCS_DOWNLOAD_SITE_ITEM_JOB_LOG&IsJson=1&jobID=' + jobId;
		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (result) {
			var data;
			try {
				data = JSON.parse(result);
			} catch (e) {
				data = result;
			}
			var info = {};
			if (data && data.jobId) {
				var tasks = data.tasks || [];
				var pagesCompleted = 0;
				var pagesQueued = 0;
				var completed = 0;
				var queued = 0;
				var failed = 0;
				var failures = [];
				var queuedTasks = [];
				tasks.forEach(function (task) {
					if (task.taskStatus === 'FAILED') {
						failed += 1;
						failures.push(task);
					} else if (task.taskStatus === 'COMPLETE') {
						completed += 1;
					} else {
						queued += 1;
					}
				});
				info = {
					total: tasks.length,
					completed: completed,
					failed: failed,
					queued: queued,
					failures: failures
				};
			}

			return resolve(info);
		});
	});
};

module.exports.listPublishingJobs = function (argv, done) {
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

	var jobType = argv.type;
	var name = argv.name;
	var repositoryName = argv.repository;
	var repository;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var jobPromise = jobType === 'asset' ? _listAssetPublishJobs(server, repositoryName) : _listSitePublishJobs(server, jobType, name);
		jobPromise
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

var _listAssetPublishJobs = function (server, repositoryName) {
	return new Promise(function (resolve, reject) {
		var repository;
		var jobs;
		serverRest.getRepositoryWithName({ server: server, name: repositoryName })
			.then(function (result) {
				repository = result && result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify repository ' + repository.name + ' (Id: ' + repository.id + ')');

				return serverRest.getPublishingJobs({ server: server, repositoryId: repository.id });

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				jobs = result || [];

				var channelIds = [];
				var channelPromises = [];
				jobs.forEach(function (job) {
					if (job.channels) {
						for (var i = 0; i < job.channels.length; i++) {
							if (job.channels[i].id && !channelIds.includes(job.channels[i].id)) {
								channelIds.push(job.channels[i].id);
								channelPromises.push(serverRest.getChannel({ server: server, id: job.channels[i].id }));
							}
						}
					}
				});
				// console.log(channelIds);

				return Promise.all(channelPromises);

			})
			.then(function (results) {

				var channels = results || [];

				if (jobs.length > 0) {
					console.log(' - total jobs: ' + jobs.length);
					// Display asset publishing jobs
					var format = '  %-34s  %-10s  %-24s  %-10s  %-36s  %-s';
					console.log(sprintf(format, 'Id', 'Status', 'Completed Date', 'Duration', 'Published by', 'Channels'));
					jobs.forEach(function (job) {
						var channelStr = [];
						if (job.channels) {
							for (var i = 0; i < job.channels.length; i++) {
								var found = false;
								// find the channel name
								for (var j = 0; j < channels.length; j++) {
									if (job.channels[i].id === channels[j].id) {
										// display channel name
										channelStr.push(channels[j].name);
										found = true;
										break;
									}
								}
								if (!found) {
									// display channel id
									channelStr.push(job.channels[i].id);
								}
							}
						}

						var endDate = job.jobCompletedDate ? new Date(job.jobCompletedDate.value) : new Date();
						var duration = serverUtils.timeUsed(new Date(job.jobStartedDate.value), endDate);

						console.log(sprintf(format, job.id, job.publishStatus, job.jobCompletedDate ? job.jobCompletedDate.value : '', duration, job.owner, channelStr.toString()));

					});

					if (jobs.length > 40) {
						console.log(' - total jobs: ' + jobs.length);
					}
					console.log('');
				} else {
					console.log(' - no publishing job');
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({ err: 'err' });
			});
	});
};

var _listSitePublishJobs = function (server, type, name) {
	return new Promise(function (resolve, reject) {
		var resPromises = [];
		if (name) {
			resPromises.push(type === 'site' ? sitesRest.getSite({ server: server, name: name }) :
				(type === 'theme' ? sitesRest.getTheme({ server: server, name: name }) :
					sitesRest.getComponent({ server: server, name: name })));
		}

		var item;
		Promise.all(resPromises)
			.then(function (results) {
				if (name) {
					item = results && results[0];
					if (!item || !item.id) {
						return Promise.reject();
					}
					console.info(' - varify ' + type + ' ' + name + ' (Id: ' + item.id + ')');
				}

				var itemGUID = item && item.id;
				var jobId;
				return serverUtils.GetSCSPublishingJobs(server, type, itemGUID, jobId);

			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var jobs = result || [];

				if (jobs.length > 0) {
					console.log(' - total jobs: ' + jobs.length);
					// Display asset publishing jobs
					var format = '  %-57s  %-10s  %-24s  %-10s  %-40s  %-s';
					var nameLabel = type.charAt(0).toUpperCase() + type.slice(1) + ' Name';
					console.log(sprintf(format, 'Id', 'Status', 'Completed Date', 'Duration', 'Published by', nameLabel));
					jobs.forEach(function (job) {
						var duration = job.JobCompleteDate ? serverUtils.timeUsed(new Date(job.JobCreateDate), new Date(job.JobCompleteDate)) : '';
						console.log(sprintf(format, job.JobID, job.JobStatus, job.JobCompleteDate, duration, job.JobCreatorLoginName, job.ItemName));
					});

					if (jobs.length > 40) {
						console.log(' - total jobs: ' + jobs.length);
					}
					console.log('');

				} else {
					console.log(' - no publishing job');
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({ err: 'err' });
			});
	});
};

module.exports.downloadJobLog = function (argv, done) {
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

	var jobId = argv.id.toString();

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var job;
		var siteJob;
		var downloadUrl;
		var fileName;
		var filePath;

		// first check if it is a "site" job
		var type;
		var itemGUID;
		serverUtils.GetSCSPublishingJobs(server, type, itemGUID, jobId)
			.then(function (result) {
				if (result && result[0] && result[0].JobID) {
					job = result[0];
					siteJob = true;
					console.info(' - verify job: ' + job.Action + ' ' + job.ItemType + ' ' + job.ItemName);
					downloadUrl = '/documents/integration?IdcService=SCS_DOWNLOAD_SITE_ITEM_JOB_LOG&IsJson=1&jobID=' + job.JobID;
					fileName = 'publish-log-' + job.JobID + '.json';
				}

				var assetJobPromises = [];
				if (!job) {
					// try asset job
					assetJobPromises.push(serverRest.getPublishingJob({ server: server, id: jobId }));
				}

				return Promise.all(assetJobPromises);

			})
			.then(function (results) {
				if (!job) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}

					job = results[0];
					console.info(' - verify job: ' + job.jobType + ' assets');
					if (!job.publishLogDownloadLink || !job.publishLogDownloadLink.href) {
						console.log(' - job does not have log');
						return Promise.reject();
					}

					downloadUrl = job.publishLogDownloadLink.href;
					downloadUrl = downloadUrl.replace(server.url, '');
					if (downloadUrl.charAt(0) !== '/') {
						downloadUrl = '/' + downloadUrl;
					}
					fileName = downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1);
				}

				filePath = path.join(projectDir, 'dist', fileName);

				var writer = fs.createWriteStream(filePath);
				return serverRest.executeGetStream({ server: server, endpoint: downloadUrl, writer: writer, noMsg: true });

			})
			.then(function (result) {

				if (!fs.existsSync(filePath)) {
					return Promise.reject();
				}

				console.log(' - log saved to ' + filePath);

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};


var lpad = function (s) {
	var width = 7;
	var char = '0';
	return (s.length >= width) ? s : (new Array(width).join(char) + s).slice(-width);
};
var _create10000Assets = function (server) {
	return new Promise(function (resolve, reject) {
		var items = [];
		var start = 0;
		var max = 1000000;
		var i;
		for (i = start; i < max; i++) {
			var idx = lpad(i + 1);
			items.push({
				name: 'item_' + idx,
				title: 'Item ' + idx
			});
		}
		// console.log(items);
		var groups = [];
		var limit = 10;
		var end;
		for (i = 0; i < max / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= max) {
				end = max - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < max - 1) {
			groups.push({
				start: end + 1,
				end: max - 1
			});
		}

		var doCreate = groups.reduce(function (createPromise, param) {

			var repoId = 'B5705E0A32DB45219676DF68EC53CB9F';
			return createPromise.then(function (result) {
				var itemPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					var item = {
						type: 'SimpleType',
						name: items[i].name,
						fields: {
							title: items[i].title
						}
					};
					itemPromises.push(serverRest.createItem({
						server: server,
						repositoryId: repoId,
						type: item.type,
						name: item.name,
						fields: item.fields,
						language: 'en-US'
					}));
				}

				return Promise.all(itemPromises).then(function (results) {
					for (var i = 0; i < results.length; i++) {
						var item = results[i];
						if (item.id) {
							console.log(' - create content item ' + item.name + ' (Id: ' + item.id + ')');
						}
					}
				});
			});
		},
		Promise.resolve({}));

		doCreate.then(function (result) {
			resolve(result);
		});

	});

};

module.exports.executeGet = function (argv, done) {
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

	var output = argv.file;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
		// console.log(' - result file: ' + output + ' folder: ' + outputFolder);
		if (!fs.existsSync(outputFolder)) {
			console.error('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.error('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	var endpoint = argv.endpoint;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}


		/*
		var startTime = new Date();
		_create10000Assets(server).then(function (result) {
			console.log(' - finished [' + serverUtils.timeUsed(startTime, new Date()) + ']')
			done(true);
		});
		*/

		if (output) {
			var writer = fs.createWriteStream(output);
			serverRest.executeGetStream({
				server: server,
				endpoint: endpoint,
				writer: writer,
				noMsg: console.showInfo() ? false : true
			})
				.then(function (result) {

					if (!result || result.err) {
						done();
					} else {
						console.log(' - result saved to ' + output);
						done(true);
					}
				});
		} else {
			serverRest.executeGet({
				server: server,
				endpoint: endpoint,
				noMsg: console.showInfo() ? false : true,
				returnContentType: true
			})
				.then(function (result) {
					if (!result || result.err || !result.data) {
						done();
					}  else {
						let contentType = result.contentType || '';
						let data = result.data;
						if (contentType.indexOf('html') >= 0 || contentType.indexOf('text') >= 0) {
							console.log('');
							console.log(data.toString());
						} else if (contentType.indexOf('json') >= 0) {
							console.log('');
							console.log(JSON.stringify(JSON.parse(data), null, 4));
						} else {
							console.log(' - the result is ' + result.contentType + ', please specify a file to save it');
						}
						done(true);
					}
				});
		}
	});
};

module.exports.executePost = function (argv, done) {
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

	var bodyPath = argv.body ? argv.body.trim() : '';
	var body;
	if (bodyPath) {
		if (bodyPath.indexOf('{') >= 0 || bodyPath.indexOf('[') >= 0) {
			try {
				body = JSON.parse(bodyPath)
			} catch (e) {
				console.error('ERROR: ' + bodyPath + ' is not valid JSON');
				done();
				return;
			}

		} else {

			if (!path.isAbsolute(bodyPath)) {
				bodyPath = path.join(projectDir, bodyPath);
			}
			bodyPath = path.resolve(bodyPath);

			if (!fs.existsSync(bodyPath)) {
				console.error('ERROR: file ' + bodyPath + ' does not exist');
				done();
				return;
			}

			if (!fs.statSync(bodyPath).isFile()) {
				console.error('ERROR: ' + bodyPath + ' is not a file');
				done();
				return;
			}


			try {
				body = JSON.parse(fs.readFileSync(bodyPath));
			} catch (e) {
				console.error('ERROR: file ' + bodyPath + ' is not a valid JSON file');
				done();
				return;
			}
		}
	}

	var output = argv.file;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
		// console.log(' - result file: ' + output + ' folder: ' + outputFolder);
		if (!fs.existsSync(outputFolder)) {
			console.error('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.error('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	var endpoint = argv.endpoint;
	var isCAAS = endpoint.indexOf('/content/management/api/') === 0;
	var isSites = endpoint.indexOf('/sites/management/api/') === 0;
	var getToken = endpoint === '/system/api/v1/security/token';

	var async = typeof argv.async === 'string' && argv.async.toLowerCase() === 'true';

	var loginPromises = [];
	if (!getToken) {
		loginPromises.push(serverUtils.loginToServer(server));
	}

	Promise.all(loginPromises)
		.then(function (results) {
			if (!getToken && (!results || !results[0].status)) {
				console.error(results[0].statusMessage);
				done();
				return;
			}
			serverRest.executePost({
				server: server,
				endpoint: endpoint,
				body: body,
				async: async,
				responseStatus: true
			})
				.then(function (result) {
					if (result && result.err) {
						done();
					} else {
						if (result) {
							console.log('Result:');
							console.log(JSON.stringify(result, null, 4));
							if (output) {
								fs.writeFileSync(output, JSON.stringify(result, null, 4));
								console.log(' - result saved to ' + output);
							}
						}
						if (result && result.statusCode >= 400) {
							done();
						} else {
							done(true);
						}
					}
				});
		});
};

module.exports.executePut = function (argv, done) {
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

	var bodyPath = argv.body ? argv.body.trim() : '';
	var body;
	if (bodyPath) {
		if (bodyPath.indexOf('{') >= 0 || bodyPath.indexOf('[') >= 0) {
			try {
				body = JSON.parse(bodyPath)
			} catch (e) {
				console.error('ERROR: ' + bodyPath + ' is not valid JSON');
				done();
				return;
			}

		} else {

			if (!path.isAbsolute(bodyPath)) {
				bodyPath = path.join(projectDir, bodyPath);
			}
			bodyPath = path.resolve(bodyPath);

			if (!fs.existsSync(bodyPath)) {
				console.error('ERROR: file ' + bodyPath + ' does not exist');
				done();
				return;
			}

			if (!fs.statSync(bodyPath).isFile()) {
				console.error('ERROR: ' + bodyPath + ' is not a file');
				done();
				return;
			}


			try {
				body = JSON.parse(fs.readFileSync(bodyPath));
			} catch (e) {
				console.error('ERROR: file ' + bodyPath + ' is not a valid JSON file');
				done();
				return;
			}
		}
	}

	var output = argv.file;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
		// console.log(' - result file: ' + output + ' folder: ' + outputFolder);
		if (!fs.existsSync(outputFolder)) {
			console.error('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.error('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	var endpoint = argv.endpoint;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.executePut({
			server: server,
			endpoint: endpoint,
			body: body,
			responseStatus: true
		})
			.then(function (result) {
				if (result && result.err) {
					done();
				} else {
					if (result) {
						console.log('Result:');
						console.log(JSON.stringify(result, null, 4));
						if (output) {
							fs.writeFileSync(output, JSON.stringify(result, null, 4));
							console.log(' - result saved to ' + output);
						}
					}
					if (result && result.statusCode >= 400) {
						done();
					} else {
						done(true);
					}
				}
			});
	});
};

module.exports.executePatch = function (argv, done) {
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

	var bodyPath = argv.body ? argv.body.trim() : '';
	var body;
	if (bodyPath) {
		if (bodyPath.indexOf('{') >= 0 || bodyPath.indexOf('[') >= 0) {
			try {
				body = JSON.parse(bodyPath)
			} catch (e) {
				console.error('ERROR: ' + bodyPath + ' is not valid JSON');
				done();
				return;
			}

		} else {

			if (!path.isAbsolute(bodyPath)) {
				bodyPath = path.join(projectDir, bodyPath);
			}
			bodyPath = path.resolve(bodyPath);

			if (!fs.existsSync(bodyPath)) {
				console.error('ERROR: file ' + bodyPath + ' does not exist');
				done();
				return;
			}

			if (!fs.statSync(bodyPath).isFile()) {
				console.error('ERROR: ' + bodyPath + ' is not a file');
				done();
				return;
			}


			try {
				body = JSON.parse(fs.readFileSync(bodyPath));
			} catch (e) {
				console.error('ERROR: file ' + bodyPath + ' is not a valid JSON file');
				done();
				return;
			}
		}
	}

	var output = argv.file;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
		// console.log(' - result file: ' + output + ' folder: ' + outputFolder);
		if (!fs.existsSync(outputFolder)) {
			console.error('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.error('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	var endpoint = argv.endpoint;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.executePatch({
			server: server,
			endpoint: endpoint,
			body: body,
			responseStatus: true
		})
			.then(function (result) {
				if (result && result.err) {
					done();
				} else {
					if (result) {
						console.log('Result:');
						console.log(JSON.stringify(result, null, 4));
						if (output) {
							fs.writeFileSync(output, JSON.stringify(result, null, 4));
							console.log(' - result saved to ' + output);
						}
					}
					if (result && result.statusCode >= 400) {
						done();
					} else {
						done(true);
					}
				}
			});
	});
};

module.exports.executeDelete = function (argv, done) {
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

	var endpoint = argv.endpoint;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.executeDelete({
			server: server,
			endpoint: endpoint
		})
			.then(function (result) {
				if (!result || result.err) {
					done();
				} else {
					done(true);
				}
			});
	});

};

var _unzipFile = function (filePath, targetFolder) {
	return new Promise(function (resolve, reject) {
		var contentPath;
		if (fs.existsSync(targetFolder)) {
			fileUtils.remove(targetFolder);
		}
		fs.mkdirSync(targetFolder, {recursive: true});

		fileUtils.extractZip(filePath, targetFolder)
			.then(function (err) {
				if (err) {
					console.error('ERROR: file ' + filePath + ' is not a valid zip file');
					return resolve(contentPath);
				} else {
					let siteTemplateContentExport = path.join(targetFolder, 'template');
					let contentExport = path.join(targetFolder, 'contentexport');

					if (fs.existsSync(siteTemplateContentExport)) {
						siteTemplateContentExport = path.join(targetFolder, 'template', 'assets', 'contenttemplate');
						let exportFile = path.join(siteTemplateContentExport, 'export.zip');
						if (fs.existsSync(exportFile)) {
							// unzip the export.zip file
							fileUtils.extractZip(exportFile, siteTemplateContentExport)
								.then(function (err) {
									if (err) {
										return resolve(contentExport);
									} else {
										let items = fs.readdirSync(siteTemplateContentExport);
										for (let i = 0; i < items.length; i++) {
											if (items[i].startsWith('Content Template of')) {
												contentPath = path.join(siteTemplateContentExport, items[i]);
												break;
											}
										}
										return resolve(contentPath);
									}
								});
						} else {
							console.error('ERROR: site template file' + filePath + ' does not have content');
							return resolve(contentPath);
						}
					} else if (fs.existsSync(contentExport)) {
						contentPath = contentExport;
						return resolve(contentPath);
					} else {
						console.error('ERROR: file ' + filePath + ' is not a site template nor a content export file');
						return resolve(contentPath);
					}
				}
			});
	});
};

module.exports.describeLocalContent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}
	var name = argv.name;
	var isTemplate = typeof argv.template === 'string' && argv.template.toLowerCase() === 'true';
	var isFile = typeof argv.file === 'string' && argv.file.toLowerCase() === 'true';

	var contentPath;

	var unzipPromises = [];
	var filePath;
	if (isFile) {
		filePath = name;
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(projectDir, filePath);
		}
		filePath = path.resolve(filePath);

		if (!fs.existsSync(filePath)) {
			console.error('ERROR: file ' + filePath + ' does not exist');
			done();
			return;
		}

		// unzip to build folder first
		unzipPromises.push(_unzipFile(filePath, path.join(buildDir, 'content')));

	}

	Promise.all(unzipPromises)
		.then(function (results) {
			if (isFile) {
				if (!results || !results[0]) {
					// console.error('ERROR: file ' + filePath + ' does not contain content');
					return Promise.reject();
				}
				contentPath = results[0];
			}

			if (isTemplate) {
				var templatepath = path.join(templatesSrcDir, name);
				if (!fs.existsSync(templatepath)) {
					console.error('ERROR: template folder ' + templatepath + ' does not exist');
					return Promise.reject();
				}

				// check if the template has content
				contentPath = path.join(templatepath, 'assets', 'contenttemplate', 'Content Template of ' + name);
				if (!fs.existsSync(contentPath)) {
					console.error('ERROR: template ' + name + ' does not have content');
					return Promise.reject();
				}

			} else if (!isFile) {
				contentPath = path.join(contentSrcDir, name);
				if (!fs.existsSync(contentPath)) {
					console.error('ERROR: content folder ' + contentPath + ' does not exist');
					return Promise.reject();
				}
				contentPath = path.join(contentSrcDir, name, 'contentexport');
				if (!fs.existsSync(contentPath)) {
					console.error('ERROR: content export ' + name + ' does not have content');
					return Promise.reject();
				}
			}

			console.info(' - content from ' + contentPath);
			if (!contentPath || !fs.existsSync(contentPath)) {
				return Promise.reject();
			}

			var _getJson = function (filePath) {
				var obj = undefined;
				if (filePath && fs.existsSync(filePath)) {
					try {
						obj = JSON.parse(fs.readFileSync(filePath));
					} catch (e) {
						// not a JSON
					}
				}
				return obj;
			};

			var _getFolderItems = function (folderPath) {
				var objs = [];
				if (fs.existsSync(folderPath)) {
					let items = fs.readdirSync(folderPath);
					items.forEach(function (item) {
						let obj = _getJson(path.join(folderPath, item));
						if (obj) {
							objs.push(obj);
						}
					});
				}
				return objs;
			};

			var format1 = '  %-36s  %-s';
			// content types
			console.log('Content Types:');
			var types = _getFolderItems(path.join(contentPath, 'ContentTypes'));
			if (types.length > 0) {
				console.log(sprintf(format1, 'Name', 'Type'));
				types.forEach(function (type) {
					console.log(sprintf(format1, type.name, type.typeCategory || ''));
				});
			}
			console.log('');

			// localization policies
			console.log('Localization Policies:');
			var policies = _getFolderItems(path.join(contentPath, 'LocalizationPolicies'));
			if (policies.length > 0) {
				let policyFormat = '  %-36s  %-13s  %-36s  %-s';
				console.log(sprintf(policyFormat, 'Name', 'Default Value', 'Required Values', 'Optional Values'));
				policies.forEach(function (policy) {
					console.log(sprintf(policyFormat, policy.name, policy.defaultValue, policy.requiredValues, policy.optionalValues));
				});
			}
			console.log('');

			// Taxonomies
			console.log('Taxonomies:');
			var taxonomies = _getFolderItems(path.join(contentPath, 'Taxonomies'));
			if (taxonomies.length > 0) {
				let taxFormat = '  %-32s  %-48s  %-s'
				console.log(sprintf(taxFormat, 'Id', 'Name', 'Abbreviation'));
				taxonomies.forEach(function (tax) {
					console.log(sprintf(taxFormat, tax.id, tax.name, tax.shortName));
				});
			}
			console.log('');

			// Content Items
			console.log('Content Items:');
			var totalItems = 0;
			if (fs.existsSync(path.join(contentPath, 'ContentItems'))) {
				var itemTypes = fs.readdirSync(path.join(contentPath, 'ContentItems'));
				if (itemTypes.length > 0) {
					itemTypes.forEach(function (type) {
						if (type !== 'VariationSets') {
							let items = _getFolderItems(path.join(contentPath, 'ContentItems', type));
							console.log(type + ' (' + items.length + ')');
							let itemFormat = '  %-36s  %-48s  %-48s  %-s'
							console.log(sprintf(itemFormat, 'Id', 'Name', 'Slug', 'Language'));
							items.forEach(function (item) {
								console.log(sprintf(itemFormat, item.id, item.name, item.slug || '', item.language || ''));
							});
							console.log('');
							totalItems += items.length;
						}
					});
					console.log('Total items: ' + totalItems);
				}
			}
			console.log('');

			done(true);
		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			done();
		});
};

module.exports.renameContentType = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var typeName = argv.name;
	var newName = argv.newname;

	if (typeName.toLowerCase() === newName.toLowerCase()) {
		console.error('ERROR: the new name is the same as the original one');
		done();
		return;
	}

	var name = argv.content;
	var isTemplate = typeof argv.template === 'string' && argv.template.toLowerCase() === 'true';

	var contentTopDir;
	var templatePath;
	if (isTemplate) {
		templatePath = path.join(templatesSrcDir, name);
		if (!fs.existsSync(templatePath)) {
			console.error('ERROR: template folder ' + templatePath + ' does not exist');
			done();
			return;
		}

		// check if the template has content
		contentTopDir = path.join(templatePath, 'assets', 'contenttemplate');
		if (!fs.existsSync(contentTopDir)) {
			console.error('ERROR: template ' + name + ' does not have content');
			done();
			return;
		}
	} else {
		contentTopDir = path.join(contentSrcDir, name);
		if (!fs.existsSync(contentTopDir)) {
			console.error('ERROR: content folder ' + contentTopDir + ' does not exist');
			done();
			return;
		}
	}

	console.info(' - content at ' + contentTopDir);
	var contentDir = isTemplate ? path.join(contentTopDir, 'Content Template of ' + name) :
		path.join(contentTopDir, 'contentexport');

	// check if the type exists
	var typesDir = path.join(contentDir, 'ContentTypes');
	var typePath = path.join(typesDir, typeName + '.json');
	if (!fs.existsSync(typePath)) {
		console.error('ERROR: type ' + typeName + ' does not exist');
		done();
		return;
	}

	var newTypePath = path.join(typesDir, newName + '.json');
	if (fs.existsSync(newTypePath)) {
		console.error('ERROR: type ' + newName + ' already exists');
		done();
		return;
	}

	// update site template summary.json
	if (isTemplate) {
		var summaryPath = path.join(contentTopDir, 'summary.json');
		if (fs.existsSync(summaryPath)) {
			var summaryJson = JSON.parse(fs.readFileSync(summaryPath));
			var contenttypes = summaryJson.summary && summaryJson.summary.contentTypes || [];
			if (contenttypes.includes(typeName)) {
				contenttypes[contenttypes.indexOf(typeName)] = newName;
				summaryJson.summary.contentTypes = contenttypes;
			}

			var mappings = summaryJson.contentTypeMappings || summaryJson.categoryLayoutMappings || [];
			for (var i = 0; i < mappings.length; i++) {
				if (mappings[i].type === typeName) {
					mappings[i].type = newName;
				}
			}

			if (summaryJson.hasOwnProperty('contentTypeMappings')) {
				summaryJson.contentTypeMappings = mappings;
			} else {
				summaryJson.categoryLayoutMappings = mappings;
			}

			console.info(' - update summary.json');
			fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));
		} else {
			console.info(' - template ' + name + ' does not have summary.json');
		}
	}

	// update Summary.json
	var contentSummaryPath = path.join(contentDir, 'Summary.json');
	if (fs.existsSync(contentSummaryPath)) {
		var cntSummaryJson = JSON.parse(fs.readFileSync(contentSummaryPath));
		if (cntSummaryJson.types && cntSummaryJson.types.indexOf(typeName) >= 0) {
			var typesArr = cntSummaryJson.types.split(',');
			typesArr[typesArr.indexOf(typeName)] = newName;
			cntSummaryJson.types = typesArr.join(',');
			console.info(' - update Summary.json');
			fs.writeFileSync(contentSummaryPath, JSON.stringify(cntSummaryJson, null, 4));
		}
	}

	// update metadata.json
	var metadataPath = path.join(contentDir, 'metadata.json');
	if (fs.existsSync(metadataPath)) {
		var metadataJson = JSON.parse(fs.readFileSync(metadataPath));
		Object.keys(metadataJson).forEach(function (key) {
			var item = metadataJson[key];
			if (Array.isArray(item)) {
				if (item.includes(typeName)) {
					// update type
					item[item.indexOf(typeName)] = newName;
				} else {
					// update assets
					for (var i = 0; i < item.length; i++) {
						if (item[i].indexOf(typeName + ':') === 0) {
							item[i] = item[i].replace(typeName + ':', newName + ':');
						}
					}
				}
			}
		});

		console.info(' - update metadata.json');
		fs.writeFileSync(metadataPath, JSON.stringify(metadataJson, null, 4));
	}

	// update the type json file
	var typeJson = JSON.parse(fs.readFileSync(typePath));
	typeJson.name = newName;
	fs.writeFileSync(typePath, JSON.stringify(typeJson, null, 4));
	fs.renameSync(typePath, newTypePath);
	console.info(' - create new type file ' + newName + '.json');

	// update type reference by other types
	var types = fs.readdirSync(typesDir);
	types.forEach(function (type) {
		if (type !== newName) {
			var typeJson = JSON.parse(fs.readFileSync(path.join(typesDir, type)));
			var fields = typeJson.fields;
			var needUpdate = false;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].referenceType) {
					if (fields[i].referenceType.type === typeName) {
						fields[i].referenceType.type = newName;
						needUpdate = true;
					}

					if (fields[i].referenceType.types) {
						for (var j = 0; j < fields[i].referenceType.types.length; j++) {
							if (fields[i].referenceType.types[j] === typeName) {
								fields[i].referenceType.types[j] = newName;
								needUpdate = true;
							}
						}
					}
				} // has reference type
			}
			if (needUpdate) {
				fs.writeFileSync(path.join(typesDir, type), JSON.stringify(typeJson, null, 4));
				console.info(' - update references in ' + type);
			}
		}
	});

	// update assets
	var itemsDir = path.join(contentDir, 'ContentItems');

	// rename the type folder
	if (fs.existsSync(path.join(itemsDir, typeName))) {
		fs.renameSync(path.join(itemsDir, typeName), path.join(itemsDir, newName));
		console.info(' - rename items folder ' + typeName + ' to ' + newName);
	}

	var _updateItem = function (itemPath) {
		if (!fs.statSync(itemPath).isFile()) {
			return;
		}
		var itemJson = JSON.parse(fs.readFileSync(itemPath));
		var needUpdate = false;

		if (Array.isArray(itemJson)) {
			// variations
			itemJson.forEach(function (variation) {
				if (variation.type === typeName) {
					variation.type = newName;
					needUpdate = true;
				}
			});
		} else {
			if (itemJson.type === typeName) {
				itemJson.type = newName;
				needUpdate = true;
			}

			if (itemJson.fields) {
				Object.keys(itemJson.fields).forEach(function (fieldName) {
					if (itemJson.fields[fieldName]) {
						if (Array.isArray(itemJson.fields[fieldName])) {
							for (var i = 0; i < itemJson.fields[fieldName].length; i++) {
								if (itemJson.fields[fieldName][i] && itemJson.fields[fieldName][i].type === typeName) {
									itemJson.fields[fieldName][i].type = newName;
									needUpdate = true;
								}
							}
						} else {
							if (itemJson.fields[fieldName].type && itemJson.fields[fieldName].type === typeName) {
								itemJson.fields[fieldName].type = newName;
								needUpdate = true;
							}
						}
					}
				});
			}
		}
		if (needUpdate) {
			fs.writeFileSync(itemPath, JSON.stringify(itemJson, null, 4));
			console.info(' - update item ' + itemPath.substring(itemPath.indexOf('/ContentItems')));
		}
	};

	// update type for all assets
	types = fs.readdirSync(itemsDir);
	types.forEach(function (type) {
		if (type !== 'DigitalAsset' && type !== 'Image' && type !== 'Video' && type !== 'File') {
			var items = fs.readdirSync(path.join(itemsDir, type));
			for (var i = 0; i < items.length; i++) {
				// console.log(path.join(itemsDir, type, items[i]));
				_updateItem(path.join(itemsDir, type, items[i]));
			}
		}
	});

	// update site pages
	if (templatePath) {
		var pagesPath = path.join(templatePath, 'pages');
		var pages = fs.readdirSync(pagesPath);
		pages.forEach(function (pageFile) {
			var pagePath = path.join(pagesPath, pageFile);
			if (fs.statSync(pagePath).isFile() && pageFile.indexOf('.json') > 0) {
				var needUpdate = false;
				var pageJson = JSON.parse(fs.readFileSync(pagePath));
				if (pageJson.componentInstances) {
					Object.keys(pageJson.componentInstances).forEach(function (key) {
						var comp = pageJson.componentInstances[key];
						if (comp.data && comp.data.contentTypes && comp.data.contentTypes.includes(typeName)) {
							for (var i = 0; i < comp.data.contentTypes.length; i++) {
								if (comp.data.contentTypes[i] === typeName) {
									comp.data.contentTypes[i] = newName;
									needUpdate = true;
								}
							}
						}
					});
				}
				if (needUpdate) {
					fs.writeFileSync(pagePath, JSON.stringify(pageJson, null, 4));
					console.info(' - update page ' + pageFile);
				}
			}
		});
	}

	console.log(' - type ' + typeName + ' renamed to ' + newName);

	done(true);
};