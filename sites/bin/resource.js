/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	crypto = require('crypto'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var console = require('../test/server/logger.js').console;

var projectDir,
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
	projectDir = argv.projectDir;

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
	var user = argv.user;
	var password = argv.password;
	var type = argv.type || 'pod_ec';
	var idcs_url = argv.domainurl || argv.idcsurl;
	var client_id = argv.clientid;
	var client_secret = argv.clientsecret;
	var scope = argv.scope;
	var timeout = argv.timeout;
	var useRest = false;
	if (type.indexOf('dev_ec') === 0) {
		if (type.indexOf('rest') > 0) {
			useRest = true;
		}
		type = 'dev_ec';
	}

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
		useRest: useRest,
		key: keyFile,
		idcs_url: idcs_url,
		client_id: savedClientId,
		client_secret: savedClientSecret,
		scope: scope,
		timeout: timeout
	};
	fs.writeFileSync(serverFile, JSON.stringify(serverjson));
	console.log(' - server registered in ' + serverFile);
	done(true);
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
			var channelFormat = '  %-36s  %-36s  %-12s  %-8s  %-s';
			channels = results.length > 0 ? results[0] : [];
			if (listChannels) {
				console.log('Channels:');
				console.log(sprintf(channelFormat, 'Name', 'Token', 'SiteChannel', 'Access', 'Publishing'));
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
					console.log(sprintf(channelFormat, channel.name, channelToken, channel.isSiteChannel ? '    √' : '', channel.channelType, publishPolicy));
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
					console.log(sprintf(format3, 'Name', 'Type', 'Published'));
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
						console.log(sprintf(format3, comp.name, typeLabel, published));
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
					var repoFormat = '  %-4s  %-36s  %-16s  %-42s  %-s';
					console.log(sprintf(repoFormat, 'Type', 'Name', 'Default Language', 'Channels', 'Content Types'));
					for (var i = 0; i < repositories.length; i++) {
						var repo = repositories[i];
						var contentTypes = [];
						var j;
						for (j = 0; j < repo.contentTypes.length; j++) {
							contentTypes.push(repo.contentTypes[j].name);
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
						console.log(sprintf(repoFormat, repoType, repo.name, repo.defaultLanguage, repoChannels, contentTypes));
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
					server: server
				})] : [];
				return Promise.all(promises);
			})
			.then(function (results) {
				//
				// list sites
				//
				var sites = results.length > 0 ? results[0] : [];
				if (listSites) {
					var siteFormat = '  %-36s  %-36s  %-10s  %-10s  %-6s  %-s';
					console.log('Sites:');
					console.log(sprintf(siteFormat, 'Name', 'Theme', 'Type', 'Published', 'Online', 'Secure'));
					for (var i = 0; i < sites.length; i++) {
						var site = sites[i];
						var type = site.isEnterprise ? 'Enterprise' : 'Standard';
						var published = site.publishStatus !== 'unpublished' ? '    √' : '';
						var online = site.runtimeStatus === 'online' ? '  √' : '';
						var secure = site.security && site.security.access && !site.security.access.includes('everyone') ? '  √' : '';
						console.log(sprintf(siteFormat, site.name, site.themeName, type, published, online, secure));
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
					console.log(sprintf(format3, 'Name', 'Theme', 'Type'));
					for (var i = 0; i < templates.length; i++) {
						var temp = templates[i];
						var type = temp.isEnterprise ? 'Enterprise' : 'Standard';
						console.log(sprintf(format3, temp.name, temp.themeName, type));
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
					console.log(sprintf(format2, 'Name', 'Published'));
					for (var i = 0; i < themes.length; i++) {
						var status = themes[i].publishStatus === 'published' ? '   √' : '';
						console.log(sprintf(format2, themes[i].name, status));
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
					var taxFormat = '  %-45s  %-32s  %-12s  %-14s  %-10s  %-8s  %-10s  %-s';
					console.log(sprintf(taxFormat, 'Name', 'Id', 'Abbreviation', 'isPublishable', 'Status', 'Version', 'Published', 'Published Channels'));
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
							console.log(sprintf(taxFormat, name, id, abbr, publishable, states[i].status, version, published, channelLabel));
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
							jobs.forEach(function (job) {
								console.log(sprintf(jobFormat, job.JobID, job.JobType, job.JobAction, job.JobStatus,
									job.JobPercentage, (job.JobCreatorFullName || job.JobCreatorLoginName),
									job.JobCreateDate, job.JobMessage));
								totalJobs += 1;
							});
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var jobFormat = '  %-20s  %-s';
		var job;
		var jobData;
		serverUtils.getBackgroundServiceJobStatus(server, '', jobId)
			.then(function (result) {

				if (result && result.JobID === jobId) {
					// site/template/theme/component job
					job = result;
					// console.log(job);

					// get job data
					serverUtils.getBackgroundServiceJobData(server, '', jobId)
						.then(function (result) {
							jobData = result;
							// console.log(JSON.stringify(jobData, null, 4));

							sitesRest.resourceExist({ server: server, type: job.JobType + 's', id: job.ItemID, showInfo: false })
								.then(function (result) {
									var item = result;

									console.log('');
									console.log(sprintf(jobFormat, 'Id', job.JobID));
									console.log(sprintf(jobFormat, 'Type', job.JobType));
									console.log(sprintf(jobFormat, 'Action', job.JobAction));
									console.log(sprintf(jobFormat, 'Status', job.JobStatus));
									console.log(sprintf(jobFormat, 'Percentage', job.JobPercentage));
									console.log(sprintf(jobFormat, 'Creator', (job.JobCreatorFullName || job.JobCreatorLoginName)));
									console.log(sprintf(jobFormat, 'CreateDate', job.JobCreateDate));
									if (job.ItemID) {
										var label = serverUtils.capitalizeFirstChar(job.JobType);
										console.log(sprintf(jobFormat, label + ' Id', job.ItemID));
										if (item && item.id && item.name) {
											console.log(sprintf(jobFormat, label + ' Name', item.name));
										}
									}
									console.log(sprintf(jobFormat, 'Message', job.JobMessage));
									if (jobData && jobData.LocalData) {
										if (jobData.LocalData.compileServiceJobErrorMsg) {
											console.log(sprintf(jobFormat, 'CompileServiceError', jobData.LocalData.compileServiceJobErrorMsg));
										}
									}
									console.log('');

									done(true);
									return;
								});
						});

				} else {

					// continue to check if it is content job

					serverRest.getContentJobStatus({ server: server, jobId: jobId, hideError: true })
						.then(function (result) {
							if (result && result.data && result.data.jobId === jobId) {
								// console.log(JSON.stringify(result, null, 4));
								// content import/export job
								job = result.data;

								var downloadLink = job.downloadLink && job.downloadLink[0] && job.downloadLink[0].href;
								var jobAction = 'import/export';
								console.log('');
								console.log(sprintf(jobFormat, 'Id', job.jobId));
								console.log(sprintf(jobFormat, 'Type', 'content'));
								console.log(sprintf(jobFormat, 'Action', jobAction));
								console.log(sprintf(jobFormat, 'Status', job.status));
								if (downloadLink) {
									console.log(sprintf(jobFormat, 'content file', downloadLink));
								}
								// console.log(sprintf(jobFormat, 'Percentage', job.JobPercentage));
								console.log(sprintf(jobFormat, 'Creator', job.startedBy));
								console.log(sprintf(jobFormat, 'CreateDate', job.startedDate && job.startedDate.value));
								if (job.errorDescription) {
									console.log(sprintf(jobFormat, 'Message', job.errorDescription));
								}
								console.log('');
								done(true);

							} else {
								// content async bulk op
								serverRest.getItemOperationStatus({ server: server, statusId: jobId, hideError: true })
									.then(function (result) {
										if (result && result.id === jobId) {
											job = result;
											// console.log(JSON.stringify(job, null, 4));
											var operations = job.result && job.result.body && job.result.body.operations;
											var jobAction = operations ? Object.keys(operations) : '';

											console.log('');
											console.log(sprintf(jobFormat, 'Id', job.id));
											console.log(sprintf(jobFormat, 'Type', 'bulk items operation'));
											console.log(sprintf(jobFormat, 'Operation', jobAction));
											console.log(sprintf(jobFormat, 'Status', job.progress));
											console.log(sprintf(jobFormat, 'Percentage', job.completedPercentage));
											console.log(sprintf(jobFormat, 'StartTime', job.startTime && job.startTime.value));
											console.log(sprintf(jobFormat, 'EndTime', job.endTime && job.endTime.value || ''));
											console.log(sprintf(jobFormat, 'Message', job.message));
											if (job.error && job.error.detail) {
												console.log(sprintf(jobFormat, 'Error', job.error.detail));
											}
											console.log('');

											done(true);
										} else {
											console.error('ERROR: job not found');
											done();
										}
									});
							}

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

						var duration = serverUtils.timeUsed(new Date(job.jobStartedDate.value), new Date(job.jobCompletedDate.value));

						console.log(sprintf(format, job.id, job.publishStatus, job.jobCompletedDate.value, duration, job.owner, channelStr.toString()));

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
					// fs.writeFileSync(output, result);
					// var writer = fs.createWriteStream(output);
					// writer.write(result);
					console.log(' - result saved to ' + output);

					done(true);
				}
			});
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

	var bodyPath = argv.body;
	var body;
	if (bodyPath) {

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

	var async = typeof argv.async === 'string' && argv.async.toLowerCase() === 'true';

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.executePost({
			server: server,
			endpoint: endpoint,
			body: body,
			async: async
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
					done(true);
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

	var bodyPath = argv.body;
	var body;
	if (bodyPath) {

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
			body: body
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
					done(true);
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

	var bodyPath = argv.body;
	var body;
	if (bodyPath) {

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
			body: body
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
					done(true);
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