/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var fs = require('fs'),
	fse = require('fs-extra'),
	os = require('os'),
	readline = require('readline'),
	path = require('path'),
	semver = require('semver'),
	sprintf = require('sprintf-js').sprintf,
	assetUtils = require('./asset.js').utils,
	contentUtils = require('./content.js').utils,
	documentUtils = require('./document.js').utils,
	templateUtils = require('./template.js').utils,
	siteUpdateLib = require('./siteUpdate.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverUtils = require('../test/server/serverUtils.js');

var cecDir = path.join(__dirname, ".."),
	themesDataDir = path.join(cecDir, 'data', 'themes');

var projectDir,
	documentsSrcDir,
	templatesSrcDir,
	serversSrcDir;

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	documentsSrcDir = path.join(srcfolder, 'documents');
	serversSrcDir = path.join(srcfolder, 'servers');
	templatesSrcDir = path.join(srcfolder, 'templates');

	return true;
};

var localServer;
var _cmdEnd = function (done, success) {
	done(success);
	if (localServer) {
		localServer.close();
	}
};


/**
 * create site
 */
module.exports.createSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		_cmdEnd(done);
		return;
	}

	var request = serverUtils.getRequest();

	var name = argv.name;
	var templateName = argv.template;
	var repositoryName = argv.repository;
	var localizationPolicyName = argv.localizationPolicy;
	var defaultLanguage = argv.defaultLanguage;
	var description = argv.description;
	var sitePrefix = argv.sitePrefix || name.toLowerCase();
	sitePrefix = sitePrefix.substring(0, 15);
	var updateContent = typeof argv.update === 'string' && argv.update.toLowerCase() === 'true';

	_createSiteREST(request, server, name, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, updateContent, done);

	// _createSiteSCS(request, server, name, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, updateContent, done);

};


/**
 * Use Idc Service APIs to create a site
 * @param {*} request 
 * @param {*} server 
 * @param {*} name 
 * @param {*} templateName 
 * @param {*} repositoryName 
 * @param {*} localizationPolicyName 
 * @param {*} defaultLanguage 
 * @param {*} description 
 * @param {*} sitePrefix 
 */
var _createSiteSCS = function (request, server, siteName, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, updateContent, done) {

	try {
		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var express = require('express');
			var app = express();

			var port = '9191';
			var localhost = 'http://localhost:' + port;

			var dUser = '';
			var idcToken;

			var auth = serverUtils.getRequestAuth(server);

			var template, templateGUID;
			var repositoryId, localizationPolicyId;
			var createEnterprise;

			var cecVersion;

			var format = '   %-20s %-s';

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options.auth = auth;

					request(options).on('response', function (response) {
							// fix headers for cross-domain and capitalization issues
							serverUtils.fixHeaders(response, res);
						})
						.on('error', function (err) {
							console.log('ERROR: GET request failed: ' + req.url);
							console.log(error);
							return resolve({
								err: 'err'
							});
						})
						.pipe(res);

				} else {
					console.log('ERROR: GET request not supported: ' + req.url);
					res.write({});
					res.end();
				}
			});
			app.post('/documents/web', function (req, res) {
				// console.log('POST: ' + req.url);
				var url = server.url + req.url;

				var repositoryPrefix = 'arCaaSGUID';
				// console.log(' - CEC version: ' + cecVersion + ' repositoryPrefix: ' + repositoryPrefix);
				var formData = createEnterprise ? {
					'idcToken': idcToken,
					'names': siteName,
					'descriptions': description,
					'items': 'fFolderGUID:' + templateGUID,
					'isEnterprise': '1',
					'repository': repositoryPrefix + ':' + repositoryId,
					'slugPrefix': sitePrefix,
					'defaultLanguage': defaultLanguage,
					'localizationPolicy': localizationPolicyId,
					'useBackgroundThread': 1
				} : {
					'idcToken': idcToken,
					'names': siteName,
					'descriptions': description,
					'items': 'fFolderGUID:' + templateGUID,
					'useBackgroundThread': 1
				};

				// keep the existing ids
				if (updateContent) {
					formData.doPreserveCaaSGUID = 1;
				}

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					formData: formData
				};

				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						console.log('ERROR: Failed to ' + action + ' site');
						console.log(error);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res)
					.on('finish', function (err) {
						res.end();
					});

			});

			localServer = app.listen(0, function () {
				port = localServer.address().port;
				localhost = 'http://localhost:' + port;
				localServer.setTimeout(0);

				var inter = setInterval(function () {
					// console.log(' - getting login user: ' + total);
					var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

					request.get(url, function (err, response, body) {
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {

						}
						dUser = data && data.LocalData && data.LocalData.dUser;
						idcToken = data && data.LocalData && data.LocalData.idcToken;
						if (dUser && dUser !== 'anonymous' && idcToken) {
							// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
							clearInterval(inter);
							console.log(' - establish user session');

							// verify site 
							var sitePromise = serverUtils.browseSitesOnServer(request, server);
							sitePromise.then(function (result) {
									if (result.err) {
										return Promise.reject();
									}

									var sites = result.data || [];
									var site;
									for (var i = 0; i < sites.length; i++) {
										if (siteName.toLowerCase() === sites[i].fFolderName.toLowerCase()) {
											site = sites[i];
											break;
										}
									}
									if (site && site.fFolderGUID) {
										console.log('ERROR: site ' + siteName + ' already exists');
										return Promise.reject();
									}

									// Verify template
									return serverUtils.browseSitesOnServer(request, server, 'framework.site.template', templateName);

								})
								.then(function (result) {
									if (!result || result.err) {
										return Promise.reject();
									}

									var templates = result.data;
									for (var i = 0; i < templates.length; i++) {
										if (templateName.toLowerCase() === templates[i].fFolderName.toLowerCase()) {
											templateGUID = templates[i].fFolderGUID;
											break;
										}
									}
									if (!templateGUID) {
										console.log('ERROR: template ' + templateName + ' does not exist');
										return Promise.reject();
									}

									// get other template info
									return _getOneIdcService(request, localhost, server, 'SCS_GET_SITE_INFO_FILE', 'siteId=SCSTEMPLATE_' + templateName + '&IsJson=1');
								})
								.then(function (result) {
									if (!result || result.err) {
										return Promise.reject();
									}

									template = result.base ? result.base.properties : undefined;
									if (!template || !template.siteName) {
										console.log('ERROR: failed to get template info');
										return Promise.reject();
									}

									console.log(' - get template ');
									// console.log(template);

									if (template.isEnterprise && !repositoryName) {
										console.log('ERROR: repository is required to create enterprise site');
										return Promise.reject();
									}

									createEnterprise = repositoryName ? true : false;

									if (createEnterprise && !template.localizationPolicy && !localizationPolicyName) {
										console.log('ERROR: localization policy is required to create enterprise site');
										return Promise.reject();
									}
									// Remove this condition when defaultLanguage returned from API /templates 
									if (createEnterprise && !defaultLanguage) {
										console.log('ERROR: default language is required to create enterprise site');
										return Promise.reject();
									}

									if (!createEnterprise) {
										console.log(' - creating standard site ...');
										console.log(sprintf(format, 'name', siteName));
										console.log(sprintf(format, 'template', templateName));

										var actionPromise = _postOneIdcService(request, localhost, server, 'SCS_COPY_SITES', 'create site', idcToken);
										actionPromise.then(function (result) {
											if (result.err) {
												_cmdEnd(done);
											} else {
												console.log(' - site created');
												_cmdEnd(done, true);
											}
										});

									} else {
										var repositoryPromise = serverRest.getRepositoryWithName({
											server: server,
											name: repositoryName
										});
										repositoryPromise.then(function (result) {
												//
												// validate repository
												//
												if (!result || result.err) {
													return Promise.reject();
												}

												var repository = result.data;
												if (!repository || !repository.id) {
													console.log('ERROR: repository ' + repositoryName + ' does not exist');
													return Promise.reject();
												}
												repositoryId = repository.id;
												console.log(' - get repository');

												var policyPromises = [];
												if (localizationPolicyName) {
													policyPromises.push(serverUtils.getLocalizationPolicyFromServer(request, server, localizationPolicyName));
												} else {
													policyPromises.push(serverUtils.getLocalizationPolicyFromServer(request, server, template.localizationPolicy, 'id'));
												}
												return Promise.all(policyPromises);
											})
											.then(function (results) {
												//
												// validate localization policy
												//
												var result = results.length > 0 ? results[0] : undefined;
												if (!result || result.err) {
													return Promise.reject();
												}

												var policy = result.data;
												if (!policy || !policy.id) {
													if (localizationPolicyName) {
														console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
													} else {
														console.log('ERROR: localization policy in template does not exist');
													}
													return Promise.reject();
												}

												if (localizationPolicyName) {
													console.log(' - get localization policy');
												} else {
													console.log(' - use localization policy from template: ' + policy.name);
												}
												localizationPolicyId = policy.id;

												//
												// validate default language
												//

												var requiredLanguages = policy.requiredValues;
												if (!requiredLanguages.includes(defaultLanguage)) {
													console.log('ERROR: language ' + defaultLanguage + ' is not in localization policy ' + policy.name);
													return Promise.reject();
												}

												//
												// create enterprise site
												//
												console.log(' - creating enterprise site ...');
												console.log(sprintf(format, 'name', siteName));
												console.log(sprintf(format, 'template', templateName));
												console.log(sprintf(format, 'site prefix', sitePrefix));
												console.log(sprintf(format, 'repository', repositoryName));
												console.log(sprintf(format, 'localization policy', policy.name));
												console.log(sprintf(format, 'default language', defaultLanguage));

												var actionPromise = _postOneIdcService(request, localhost, server, 'SCS_COPY_SITES', 'create site', idcToken);
												actionPromise.then(function (result) {
													if (result.err) {
														_cmdEnd(done);
													} else {
														console.log(' - site created');
														sitesRest.getSite({
															server: server,
															name: siteName
														}).then(function (result) {
															console.log(' - site id: ' + (result && result.id));
															_cmdEnd(done, true);
														});
													}
												});

											})
											.catch((error) => {
												_cmdEnd(done);
											});

									} // enterprise site
								})
								.catch((error) => {
									_cmdEnd(done);
								});
						}
					}); // idc token
				}, 5000);
			}); // local
		});
	} catch (e) {
		console.log(e);
		_cmdEnd(done);
	}
};

/**
 * Create a site using REST APIs
 * @param {*} request 
 * @param {*} server 
 * @param {*} name 
 * @param {*} templateName 
 * @param {*} repositoryName 
 * @param {*} localizationPolicyName 
 * @param {*} defaultLanguage 
 * @param {*} description 
 * @param {*} sitePrefix 
 * @param {*} done 
 */
var _createSiteREST = function (request, server, name, templateName, repositoryName, localizationPolicyName,
	defaultLanguage, description, sitePrefix, updateContent, done) {
	var template, templateGUID;
	var repositoryId, localizationPolicyId;
	var createEnterprise;

	var format = '   %-20s %-s';
	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		sitesRest.resourceExist({
				server: server,
				type: 'sites',
				name: name
			}).then(function (result) {
				if (!result.err) {
					console.log('ERROR: site ' + name + ' already exists');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: server,
					name: templateName,
					expand: 'localizationPolicy'
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				template = result;

				if (template.isEnterprise && !repositoryName) {
					console.log('ERROR: repository is required to create enterprise site');
					return Promise.reject();
				}

				createEnterprise = repositoryName ? true : false;

				if (createEnterprise && !template.localizationPolicy && !localizationPolicyName) {
					console.log('ERROR: localization policy is required to create enterprise site');
					return Promise.reject();
				}
				// Remove this condition when defaultLanguage returned from API /templates 
				if (createEnterprise && !defaultLanguage) {
					console.log('ERROR: default language is required to create enterprise site');
					return Promise.reject();
				}

				if (!createEnterprise) {
					console.log(' - creating standard site ...');
					console.log(sprintf(format, 'name', name));
					console.log(sprintf(format, 'template', templateName));

					sitesRest.createSite({
							server: server,
							name: name,
							templateId: template.id,
							templateName: templateName
						})
						.then(function (result) {
							if (result.err) {
								done();
							} else {
								console.log(' - site created');
								done(true);
							}
						});

				} else {

					serverRest.getRepositories({
							server: server
						})
						.then(function (result) {
							var repositories = result || [];
							for (var i = 0; i < repositories.length; i++) {
								if (repositories[i].name.toLowerCase() === repositoryName.toLowerCase()) {
									repositoryId = repositories[i].id;
									break;
								}
							}

							if (!repositoryId) {
								console.log('ERROR: repository ' + repositoryName + ' does not exist');
								return Promise.reject();
							}
							console.log(' - get repository');

							return serverRest.getLocalizationPolicies({
								server: server
							});
						})
						.then(function (result) {
							var policies = result || [];
							var policy;
							if (localizationPolicyName) {
								for (var i = 0; i < policies.length; i++) {
									if (policies[i].name === localizationPolicyName) {
										policy = policies[i];
										localizationPolicyId = policies[i].id;
										break;
									}
								}
								if (!localizationPolicyId) {
									console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
									return Promise.reject();
								}
								console.log(' - get localization policy');
							} else {
								for (var i = 0; i < policies.length; i++) {
									if (policies[i].id === template.localizationPolicy.id) {
										policy = policies[i];
										localizationPolicyId = policies[i].id;
										break;
									}
								}
								if (!localizationPolicyId) {
									console.log('ERROR: localization policy in template does not exist');
									return Promise.reject();
								}
								console.log(' - use localization policy from template: ' + policy.name);
							}

							var requiredLanguages = policy.requiredValues;
							if (!requiredLanguages.includes(defaultLanguage)) {
								console.log('ERROR: language ' + defaultLanguage + ' is not in localization policy ' + policy.name);
								return Promise.reject();
							}

							//
							// create enterprise site
							//
							console.log(' - creating enterprise site ...');
							console.log(sprintf(format, 'name', name));
							console.log(sprintf(format, 'template', templateName));
							console.log(sprintf(format, 'site prefix', sitePrefix));
							console.log(sprintf(format, 'repository', repositoryName));
							console.log(sprintf(format, 'localization policy', policy.name));
							console.log(sprintf(format, 'default language', defaultLanguage));

							return sitesRest.createSite({
								server: server,
								name: name,
								description: description,
								sitePrefix: sitePrefix,
								templateName: templateName,
								templateId: template.id,
								repositoryId: repositoryId,
								localizationPolicyId: localizationPolicyId,
								defaultLanguage: defaultLanguage,
								updateContent: updateContent
							});
						})
						.then(function (result) {
							if (result.err) {
								return Promise.reject();
							}

							console.log(' - site created');

							return sitesRest.getSite({
								server: server,
								name: name
							});

						})
						.then(function (result) {
							console.log(' - site id: ' + (result && result.id));

							done(true);
						})
						.catch((error) => {
							done();
						});
				}
			})
			.catch((error) => {
				done();
			});
	});
};


/**
 * copy site
 */
module.exports.copySite = function (argv, done) {
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

	var name = argv.name;
	var targetName = argv.target;
	var repositoryName = argv.repository;
	var description = argv.description;
	var sitePrefix = argv.sitePrefix || targetName.toLowerCase();
	sitePrefix = sitePrefix.substring(0, 15);

	var request = serverUtils.getRequest();

	var site;
	var targetRepository;

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		sitesRest.getSite({
				server: server,
				name: name,
				expand: 'channel,repository'
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - verify source site');
				site = result;

				if (site.isEnterprise && !repositoryName) {
					console.log('ERROR: repository is required to copy enterprise site');
					return Promise.reject();
				}

				return sitesRest.resourceExist({
					server: server,
					type: 'sites',
					name: targetName
				});
			})
			.then(function (result) {
				if (result && result.id) {
					console.log('ERROR: site ' + targetName + ' already exists');
					return Promise.reject();
				}

				var repositoryPromises = site.isEnterprise && repositoryName ? [serverRest.getRepositoryWithName({
					server: server,
					name: repositoryName
				})] : [];

				return Promise.all(repositoryPromises);
			})
			.then(function (results) {
				if (site.isEnterprise && repositoryName) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.log('ERROR: repository ' + repositoryName + ' does not exist');
						return Promise.reject();
					}
					targetRepository = results[0].data;
					console.log(' - verify repository');
				}

				var channelId = site.channel && site.channel.id;
				var repositoryId = site.repository && site.repository.id;

				var checkAssetPromises = site.isEnterprise && repositoryName ? [contentUtils.getSiteAssetsFromOtherRepos(server, channelId, repositoryId)] : [];

				return Promise.all(checkAssetPromises);

			})
			.then(function (results) {
				var copyUsingAPI = true;
				var otherItems = [];
				if (site.isEnterprise && repositoryName) {
					if (results && results[0] && results[0].data && results[0].data.length > 0) {
						console.log(' - site has assets from other repositories, only the assets from the default repository will be copied');
						copyUsingAPI = false;

						var items = results[0].data;
						var otherRepos = [];
						items.forEach(function (item) {
							if (item.repositoryId && !otherRepos.includes(item.repositoryId)) {
								otherRepos.push(item.repositoryId);
								otherItems.push({
									repositoryId: item.repositoryId,
									itemIds: []
								});
							}
						});

						for (var i = 0; i < otherItems.length; i++) {
							for (var j = 0; j < items.length; j++) {
								if (items[j].repositoryId === otherItems[i].repositoryId) {
									otherItems[i].itemIds.push(items[j].id);
								}
							}
						}
					}
				}

				console.log(' - will copy ' + (site.isEnterprise ? 'enterprise' : 'standard') + ' site ' + name);
				if (copyUsingAPI) {
					return sitesRest.copySite({
						server: server,
						sourceSite: name,
						name: targetName,
						description: description,
						sitePrefix: sitePrefix,
						repositoryId: targetRepository && targetRepository.id
					});

				} else {
					return _copySite(argv, request, server, site, targetName, description, sitePrefix, targetRepository, otherItems);
				}

			})
			.then(function (result) {

				if (!result || result.err) {
					return Promise.reject();
				}

				return sitesRest.getSite({
					server: server,
					name: targetName
				});

			})
			.then(function (result) {
				if (result && result.id) {
					console.log(' - site copied (name: ' + targetName + ' Id: ' + result.id + ')');
					done(true);
				} else {
					done();
				}
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done();
			});

	});
};

// 
// copy site that uses assets from multiple repositories
// Currently cannot use sites API to copy such sites
//
var _copySite = function (argv, request, server, site, targetName, description, sitePrefix, repository, otherItems) {
	return new Promise(function (resolve, reject) {
		var templateName = site.name + serverUtils.createGUID();
		var fileName = templateName + '.zip';
		var fileId;
		var destdir = path.join(projectDir, 'dist');

		var startTime;
		var idcToken;
		var templateId;
		var newTheme;

		var excludecontent = true;
		var enterprisetemplate = true;
		var excludecomponents = true;
		var excludeTheme = true;
		var excludeType = true;
		var siteHasAssets = true;
		var otherItemsNum = 0;

		var targetSite;

		templateUtils.createLocalTemplateFromSite(argv, templateName, site.name, server, excludecontent, enterprisetemplate, excludecomponents, excludeTheme, excludeType)
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				// check if the site has assets
				var q = '(repositoryId eq "' + site.repository.id + '") AND (channels co "' + site.channel.id + '")';
				return serverRest.queryItems({
					server: server,
					q: q,
					limit: 1
				});

			})
			.then(function (result) {
				var exportContentPromises = [];

				var items = result && result.data || [];
				if (items.length === 0) {
					console.log(' - site ' + site.name + ' does not have any asset');
					siteHasAssets = false;

				} else {
					siteHasAssets = true;

					// download content from the default repository
					var tempAssetPath = path.join(templatesSrcDir, templateName, 'assets', 'contenttemplate');

					exportContentPromises.push(contentUtils.downloadContent({
						projectDir: projectDir,
						server: server,
						channel: (site.channel && site.channel.name),
						repositoryName: (site.repository && site.repository.name),
						name: templateName + '_content',
						publishedassets: false,
						requiredContentPath: tempAssetPath,
						requiredContentTemplateName: 'Content Template of ' + templateName

					}));

					console.log(' - downloading assets ...');
				}

				return Promise.all(exportContentPromises);
			})
			.then(function (results) {
				if (siteHasAssets && (!results || !results[0] || results[0].err)) {
					return Promise.reject();
				}

				// rename asset ids
				var renameIdPromises = siteHasAssets ? [assetUtils.renameAssetIds(argv, templateName, [])] : [];

				return Promise.all(renameIdPromises);

			})
			.then(function (result) {

				// create a default theme
				return _createDefaultTheme();

			})
			.then(function (result) {
				newTheme = result;

				// zip up the template
				var optimize = false;
				var excludeContentTemplate = true;
				var extraComponents = [];
				var excludeSiteContent = false;

				return templateUtils.zipTemplate(argv, templateName, optimize, excludeContentTemplate, extraComponents, excludeSiteContent, excludecomponents, newTheme);

			})
			.then(function (result) {

				var templatePath = path.join(destdir, fileName);
				if (!fs.existsSync(templatePath)) {
					console.log('ERROR: failed to download template ' + templateName);
					return Promise.reject();
				}

				// upload template file to destination server
				startTime = new Date();
				return serverRest.createFile({
					server: server,
					parentID: 'self',
					filename: fileName,
					contents: fs.createReadStream(templatePath)
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to upload template file');
					return Promise.reject();
				}

				var uploadedFile = result;
				fileId = uploadedFile.id;
				console.log(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
					' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				return sitesRest.importTemplate({
					server: server,
					name: templateName,
					fileId: fileId
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to import template');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: server,
					name: templateName
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to query template');
					return Promise.reject();
				}

				templateId = result.id;

				return serverUtils.getIdcToken(server);
			})
			.then(function (result) {
				// fetch token
				if (result && result.idcToken) {
					idcToken = result && result.idcToken;
				}

				// update template to the original template
				var values = {
					'xScsSiteTheme': site.themeName
				};
				return serverUtils.setSiteMetadata(request, server, idcToken, templateId, values, []);

			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to set template theme back to ' + site.themeName);
					return Promise.reject();
				}
				console.log(' - set template theme back to ' + site.themeName);

				// preserve asset Ids
				return sitesRest.createSite({
					server: server,
					name: targetName,
					description: description,
					templateName: templateName,
					templateId: templateId,
					sitePrefix: sitePrefix,
					repositoryId: repository.id,
					localizationPolicyId: (site && site.channel && site.channel.localizationPolicy),
					defaultLanguage: site.defaultLanguage,
					updateContent: true
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to create site');
					return Promise.reject();
				}

				return sitesRest.getSite({
					server: server,
					name: targetName,
					expand: 'channel,defaultCollection'
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to query site ' + targetName);
					return Promise.reject();
				}
				targetSite = result;

				// query other repositories
				var queryRepoPromises = [];
				otherItems.forEach(function (repoItems) {
					queryRepoPromises.push(serverRest.getRepository({
						server: server,
						id: repoItems.repositoryId
					}));
				});

				return Promise.all(queryRepoPromises);

			})
			.then(function (results) {
				var otherRepos = results || [];
				var updateRepoPromises = [];
				otherRepos.forEach(function (repo) {
					if (repo && repo.id) {
						var channels = repo.channels || [];
						channels.push({
							id: targetSite.channel.id,
							name: targetSite.channel.name
						});
						updateRepoPromises.push(serverRest.updateRepository({
							server: server,
							repository: repo,
							channels: channels
						}));
					}
				});

				// add the new site channel to the other repositories
				return Promise.all(updateRepoPromises);

			})
			.then(function (results) {

				results.forEach(function (result) {
					if (result && result.id) {
						console.log(' - channel ' + targetSite.channel.name + ' added to repository ' + result.name);
					}
				});

				// add items from other repositories to the site channel
				var addItemPromises = [];
				otherItems.forEach(function (items) {
					otherItemsNum = otherItemsNum + items.itemIds.length;
					addItemPromises.push(serverRest.addItemsToChanel({
						server: server,
						channelId: targetSite.channel.id,
						itemIds: items.itemIds
					}));
				});

				return Promise.all(addItemPromises);

			})
			.then(function (results) {

				console.log(' - items from other repositories added to site channel ' + targetSite.channel.name);

				// delete template file
				return serverRest.deleteFile({
					server: server,
					fFileGUID: fileId
				});

			})
			.then(function (result) {
				// delete the site template 
				return sitesRest.deleteTemplate({
					server: server,
					name: templateName,
					hard: true,
					showError: false
				});

			})
			.then(function (result) {
				// delete the default theme
				return sitesRest.deleteTheme({
					server: server,
					name: newTheme.name,
					hard: true,
					showError: false
				});

			})
			.then(function (result) {


				var importAssetPromises = [];
				if (siteHasAssets) {
					var collectionName = targetSite.defaultCollection && targetSite.defaultCollection.name ?
						targetSite.defaultCollection.name : (targetName + ' Site');

					// upload content to the site channel
					var uploadArgs = {
						argv: argv,
						server: server,
						name: templateName,
						isTemplate: true,
						repositoryName: repository.name,
						collectionName: collectionName,
						channelName: targetName,
						updateContent: true,
						contentpath: path.join(templatesSrcDir, templateName, 'assets', 'contenttemplate'),
						contentfilename: templateName + '_export.zip'
					};

					importAssetPromises.push(contentUtils.uploadContent(uploadArgs));
				}

				return Promise.all(importAssetPromises);

			})
			.then(function (results) {

				return (siteHasAssets ? resolve(results && results[0]) : resolve({}));

			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};


var _createDefaultTheme = function () {
	var defaultThemeName = '__toolkit_theme';
	var newTheme;

	return new Promise(function (resolve, reject) {

		var buildfolder = serverUtils.getBuildFolder(projectDir);
		if (!fs.existsSync(buildfolder)) {
			fs.mkdirSync(buildfolder);
		}
		var themesBuildDir = path.join(buildfolder, 'themes');
		if (!fs.existsSync(themesBuildDir)) {
			fs.mkdirSync(themesBuildDir);
		}
		newThemeGUID = serverUtils.createGUID();
		newThemeName = defaultThemeName + newThemeGUID;
		newThemePath = path.join(themesBuildDir, newThemeName);
		if (fs.existsSync(newThemePath)) {
			fileUtils.remove(newThemePath);
		}
		fs.mkdirSync(newThemePath);
		var themePath = path.join(themesDataDir, defaultThemeName + '.zip');

		fileUtils.extractZip(themePath, newThemePath)
			.then(function (result) {

				var newTheme;
				if (!result) {
					// update the name and itemGUID
					var filePath = path.join(newThemePath, '_folder.json');
					if (fs.existsSync(filePath)) {
						var folderStr = fs.readFileSync(path.join(filePath));
						var folderJson = JSON.parse(folderStr);
						folderJson.itemGUID = newThemeGUID;
						folderJson.themeName = newThemeName;
						fs.writeFileSync(filePath, JSON.stringify(folderJson));
					}
					newTheme = {
						name: newThemeName,
						srcPath: newThemePath
					};
				}

				return resolve(newTheme);
			});
	});

};

var _transferSiteTemplateId;

var _transferStandardSite = function (argv, request, server, destServer, site, excludecomponents, suppressgovernance) {
	return new Promise(function (resolve, reject) {
		console.log(' - site ' + site.name + ' is a standard site');

		var destServerName = destServer.name;

		var siteName = site.name;

		var templateName = site.name + serverUtils.createGUID();
		templateName = templateName.substring(0, 40);
		var templatePath;
		var fileName, fileId;

		var creatNewSite = false;
		var siteMetadata;
		var siteMetadataRaw;
		var destSite;
		var destSiteMetadataRaw;
		var templateId;
		var contentLayoutNames = [];

		var destdir = path.join(projectDir, 'dist');
		var startTime;
		var idcToken;

		// query site metadata to get static site settings
		serverUtils.getSiteMetadata(request, server, site.id)
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				siteMetadata = result && result.data;
				// console.log(siteMetadata);

				// query site metadata to get used components, content types and items
				return serverUtils.getSiteMetadataRaw(request, server, site.id);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.log(' - get site metadata');

				siteMetadataRaw = result;
				// console.log(siteMetadataRaw);

				// check site on destination server
				return sitesRest.resourceExist({
					server: destServer,
					type: 'sites',
					name: siteName
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					creatNewSite = true;
				} else {
					destSite = result;
				}
				console.log(' - will ' + (creatNewSite ? 'create' : 'update') + ' site ' + siteName + ' on ' + destServer.url);

				// create a local template based on the site
				var enterprisetemplate = false;
				var excludecontent = true;
				return templateUtils.createLocalTemplateFromSite(argv, templateName, siteName, server, excludecontent, enterprisetemplate, excludecomponents);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				// zip up the template
				var optimize = false;
				var excludeContentTemplate = true;
				var extraComponents = [];
				var excludeSiteContent = false;

				return templateUtils.zipTemplate(argv, templateName, optimize, excludeContentTemplate, extraComponents, excludeSiteContent, excludecomponents);

			})
			.then(function (result) {
				fileName = templateName + '.zip';
				templatePath = path.join(destdir, fileName);
				if (!fs.existsSync(templatePath)) {
					console.log('ERROR: failed to download template ' + templateName);
					return Promise.reject();
				}

				// upload template file to destination server
				startTime = new Date();
				return serverRest.createFile({
					server: destServer,
					parentID: 'self',
					filename: fileName,
					contents: fs.createReadStream(templatePath)
				});
			})
			.then(function (result) {

				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to upload template file');
					return Promise.reject();
				}
				var uploadedFile = result;
				fileId = uploadedFile.id;
				console.log(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
					' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				return sitesRest.importTemplate({
					server: destServer,
					name: templateName,
					fileId: fileId
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to import template');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: destServer,
					name: templateName
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to query template');
					return Promise.reject();
				}

				templateId = result.id;
				_transferSiteTemplateId = templateId;

				var createSitePromises = [];
				if (creatNewSite && site) {
					createSitePromises.push(sitesRest.createSite({
						server: destServer,
						name: siteName,
						description: site.description,
						templateName: templateName,
						templateId: templateId,
						suppressgovernance: suppressgovernance
					}));
				}

				return Promise.all(createSitePromises);

			})
			.then(function (results) {
				if (creatNewSite) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
				}

				// query site to verify it's created
				return sitesRest.getSite({
					server: server,
					name: siteName
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.log(' - site id: ' + result.id);

				var deleteTemplatePromises = [];
				if (templateId) {
					// delete template
					deleteTemplatePromises.push(sitesRest.deleteTemplate({
						server: destServer,
						name: templateName,
						hard: true
					}));

					// delete the template file permanently
					var deleteArgv = {
						file: templateName + '.zip',
						permanent: 'true'
					};
					deleteTemplatePromises.push(documentUtils.deleteFile(deleteArgv, destServer, false));
				}

				return Promise.all(deleteTemplatePromises);
			})
			.then(function (results) {
				var unzipTemplatePromises = [];
				if (!creatNewSite) {
					unzipTemplatePromises.push(templateUtils.unzipTemplate(templateName, templatePath, false));
				}

				return Promise.all(unzipTemplatePromises);
			})
			.then(function (results) {

				if (creatNewSite) {

					console.log(' - site ' + siteName + ' created on ' + destServer.url);
					return resolve({});

				} else {

					var updateSiteArgs = {
						projectDir: projectDir,
						name: siteName,
						template: templateName,
						server: destServerName,
						excludecontenttemplate: 'true'
					};
					siteUpdateLib.updateSite(updateSiteArgs, function (success) {
						console.log(' - update site finished');
						if (success) {
							serverUtils.getIdcToken(destServer)
								.then(function (result) {
									idcToken = result && result.idcToken;
									if (!idcToken) {
										console.log('ERROR: failed to get idcToken');
										return Promise.reject();
									}

									return serverUtils.getSiteMetadataRaw(request, destServer, destSite.id);

								})
								.then(function (result) {
									destSiteMetadataRaw = result;
									// console.log(destSiteMetadataRaw);

									// update site metadata
									return _updateSiteMetadata(request, destServer, idcToken, destSite, siteMetadata, siteMetadataRaw, destSiteMetadataRaw);
								})
								.then(function (result) {
									if (result && !result.err) {
										console.log(' - update site metadata');
									}

									return resolve({});
								})
								.catch((error) => {
									if (error) {
										console.log(error);
									}
									return resolve({
										err: 'err'
									});
								});

						} else {
							return resolve({
								err: 'err'
							});
						}
					});
				}
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

/**
 * Transfer enterprise site
 */
module.exports.transferSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server;
	server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var destServerName = argv.destination;
	var destServer = serverUtils.verifyServer(destServerName, projectDir);
	if (!destServer || !destServer.valid) {
		done();
		return;
	}

	if (server.url === destServer.url) {
		console.log('ERROR: source and destination server are the same');
		done();
		return;
	}

	var excludecontent = typeof argv.excludecontent === 'string' && argv.excludecontent.toLowerCase() === 'true';
	var excludecomponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';
	var excludetheme = typeof argv.excludetheme === 'string' && argv.excludetheme.toLowerCase() === 'true';
	var excludetype = typeof argv.excludetype === 'string' && argv.excludetype.toLowerCase() === 'true';
	var publishedassets = typeof argv.publishedassets === 'string' && argv.publishedassets.toLowerCase() === 'true';
	var includestaticfiles = typeof argv.includestaticfiles === 'string' && argv.includestaticfiles.toLowerCase() === 'true';
	var suppressgovernance = typeof argv.suppressgovernance === 'string' && argv.suppressgovernance.toLowerCase() === 'true';

	var repositorymappings = argv.repositorymappings ? argv.repositorymappings.split(',') : [];

	var repoMappings = [];
	repositorymappings.forEach(function (mapping) {
		var pair = mapping.split(':');
		if (pair.length === 2) {
			repoMappings.push({
				srcName: pair[0],
				destName: pair[1],
				items: []
			});
		}
	});

	// console.log(' - excludecontent:' + excludecontent + ' excludecomponents:' + excludecomponents + ' excludetheme:' + excludetheme + ' excludetype:' + excludetype);

	// when transfer site without content, the site content won't be included in the
	// site template zip, they will be uploaded to site content folder after site is created
	var excludeSiteContent = excludecontent;

	var siteName = argv.name;
	var repositoryName = argv.repository;
	var localizationPolicyName = argv.localizationPolicy;
	var sitePrefix = argv.sitePrefix;

	var templateName = siteName + serverUtils.createGUID();
	templateName = templateName.substring(0, 40);
	var templatePath;
	var fileName, fileId;

	var creatNewSite = false;
	var repository;
	var policy;
	var srcPolicy;
	var site;
	var siteMetadata;
	var siteMetadataRaw;
	var destSite;
	var destSiteMetadataRaw;
	var templateId;
	var contentLayoutNames = [];
	var defaultThemeName = '__toolkit_theme';
	var newThemeName;
	var newThemeGUID;
	var newThemePath;

	var cecVersion, idcToken;

	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var actionSuccess = true;

	var request = serverUtils.getRequest();

	var startTime;

	serverUtils.loginToServer(server, request)
		.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer, request);
		})
		.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server ' + destServer.url);
				return Promise.reject();
			}

			// verify site on source server
			sitesRest.getSite({
					server: server,
					name: siteName,
					expand: 'channel,repository'
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					site = result;
					// console.log(site);

					return serverUtils.getIdcToken(destServer);
				})
				.then(function (result) {
					// fetch token
					if (result && result.idcToken) {
						idcToken = result && result.idcToken;
					}

					if (!site.isEnterprise) {

						_transferStandardSite(argv, request, server, destServer, site, excludecomponents, suppressgovernance)
							.then(function (result) {
								var success = result && !result.err;
								_cmdEnd(done, success);
								return;
							});

					} else {

						console.log(' - verify site (defaultLanguage: ' + site.defaultLanguage + ' theme: ' + site.themeName + ')');

						if (!site.channel || !site.channel.localizationPolicy) {
							console.log('ERROR: failed to get site channel ' + (site.channel ? JSON.stringify(site.channel) : ''));
							_cmdEnd(done);
							return;
						}

						sitesRest.resourceExist({
								server: destServer,
								type: 'themes',
								name: site.themeName
							})
							.then(function (result) {
								if (result && result.id) {
									console.log(' - theme ' + site.themeName + ' exists on server ' + destServerName);
								} else {
									if (excludetheme) {
										console.log(' - theme does not exist on server ' + destServerName + ' and will not exclude the theme');
										excludetheme = false;
									}
								}

								// query site metadata to get static site settings
								return serverUtils.getSiteMetadata(request, server, site.id);
							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								siteMetadata = result && result.data;
								// console.log(siteMetadata);

								// query site metadata to get used components, content types and items
								return serverUtils.getSiteMetadataRaw(request, server, site.id);
							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								siteMetadataRaw = result;
								// console.log(siteMetadataRaw);

								return serverRest.getLocalizationPolicy({
									server: server,
									id: site.channel.localizationPolicy
								});
							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}
								srcPolicy = result;
								console.log(' - verify site localization policy: ' + srcPolicy.name +
									' (defaultValue: ' + srcPolicy.defaultValue +
									' requiredValues: ' + srcPolicy.requiredValues +
									' optionalValues: ' + srcPolicy.optionalValues + ')');

								// check site on destination server
								return sitesRest.resourceExist({
									server: destServer,
									type: 'sites',
									name: siteName,
									expand: 'channel'
								});

							})
							.then(function (result) {
								if (!result || result.err) {
									creatNewSite = true;
								} else {
									destSite = result;
								}
								console.log(' - will ' + (creatNewSite ? 'create' : 'update') + ' site ' + siteName + ' on ' + destServer.url);

								if (creatNewSite) {
									if (!repositoryName) {
										console.log('ERROR: no repository is specified');
										return Promise.reject();
									}
									if (!localizationPolicyName) {
										console.log('ERROR: no localization policy is specified');
										return Promise.reject();
									}
								}

								var repositoryPromises = [];
								if (creatNewSite) {
									repositoryPromises.push(serverRest.getRepositoryWithName({
										server: destServer,
										name: repositoryName
									}));
								}

								return Promise.all(repositoryPromises);
							})
							.then(function (results) {
								if (creatNewSite) {
									if (!results || !results[0] || results[0].err || !results[0].data) {
										console.log('ERROR: repository ' + repositoryName + ' does not exist');
										return Promise.reject();
									}
									repository = results[0].data;
									console.log(' - verify repository');
								}

								// get all source repos
								var srcRepoPromises = [];
								repoMappings.forEach(function (mapping) {
									srcRepoPromises.push(serverRest.getRepositoryWithName({
										server: server,
										name: mapping.srcName
									}));
								});

								return Promise.all(srcRepoPromises);
							})
							.then(function (results) {
								if (repoMappings.length > 0) {
									var srcRepoNames = [];
									for (var j = 0; j < repoMappings.length; j++) {
										var found = false;
										for (var i = 0; i < results.length; i++) {
											if (results[i].data && results[i].data.name === repoMappings[j].srcName) {
												found = true;
												repoMappings[j].srcId = results[i].data.id;
												srcRepoNames.push(results[i].data.name);
												break;
											}
										}
										if (!found) {
											console.log('ERROR: repository ' + repoMappings[j].srcName + ' does not exist on server ' + server.name);
											return Promise.reject();
										}
									}
									console.log(' - verify repository ' + srcRepoNames + ' on server ' + server.name);
								}
								var destRepoPromises = [];
								repoMappings.forEach(function (mapping) {
									destRepoPromises.push(serverRest.getRepositoryWithName({
										server: destServer,
										name: mapping.destName
									}));
								});

								return Promise.all(destRepoPromises);

							})
							.then(function (results) {
								if (repoMappings.length > 0) {
									var destRepoNames = [];
									for (var j = 0; j < repoMappings.length; j++) {
										var found = false;
										for (var i = 0; i < results.length; i++) {
											if (results[i].data && results[i].data.name === repoMappings[j].destName) {
												found = true;
												repoMappings[j].destId = results[i].data.id;
												destRepoNames.push(results[i].data.name);
												break;
											}
										}
										if (!found) {
											console.log('ERROR: repository ' + repoMappings[j].destName + ' does not exist on server ' + destServer.name);
											return Promise.reject();
										}
									}
									console.log(' - verify repository ' + destRepoNames + ' on server ' + destServer.name);
									// console.log(repoMappings);
								}

								// get localizations
								var localizationPolicyPromises = [];
								if (creatNewSite) {
									localizationPolicyPromises.push(serverRest.getLocalizationPolicies({
										server: destServer
									}));
								}

								return Promise.all(localizationPolicyPromises);
							})
							.then(function (results) {
								if (creatNewSite) {
									if (!results || !results[0] || results[0].err) {
										console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
										return Promise.reject();
									}
									var policies = results[0] || [];
									for (var i = 0; i < policies.length; i++) {
										if (policies[i].name === localizationPolicyName) {
											policy = policies[i];
											break;
										}
									}
									if (!policy) {
										console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
										return Promise.reject();
									}

									var requiredLanguages = policy.requiredValues;
									if (!requiredLanguages.includes(site.defaultLanguage)) {
										console.log('ERROR: site default language ' + site.defaultLanguage + ' is not in localization policy ' + policy.name);
										return Promise.reject();
									}
									console.log(' - verify localization policy');
								}

								var checkSitePrefixPromises = [];
								if (creatNewSite) {
									var q = 'slug sw "' + (sitePrefix || site.sitePrefix) + '"';
									checkSitePrefixPromises.push(serverRest.queryItems({
										server: destServer,
										q: q,
										limit: 1
									}));
								}

								return Promise.all(checkSitePrefixPromises);

							})
							.then(function (results) {
								if (creatNewSite) {
									// console.log(results);
									if (results && results[0] && results[0].data && results[0].data.length > 0) {
										console.log('ERROR: site prefix "' + (sitePrefix || site.sitePrefix) + '" is used by some content, please specify a different prefix');
										return Promise.reject();
									}
								}

								// create template on the source server and download
								var enterprisetemplate = true;
								return templateUtils.createLocalTemplateFromSite(
									argv, templateName, siteName, server, excludecontent, enterprisetemplate, excludecomponents, excludetheme, excludetype);

							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								if (excludecontent) {
									contentLayoutNames = result.contentLayouts;
									// console.log(' - content layouts: ' + contentLayoutNames);
								}

								// 
								// Exclude the theme
								// replace with a "default" one
								//
								var extractThemePromises = [];
								if (excludetheme) {
									var buildfolder = serverUtils.getBuildFolder(projectDir);
									if (!fs.existsSync(buildfolder)) {
										fs.mkdirSync(buildfolder);
									}
									var themesBuildDir = path.join(buildfolder, 'themes');
									if (!fs.existsSync(themesBuildDir)) {
										fs.mkdirSync(themesBuildDir);
									}
									newThemeGUID = serverUtils.createGUID();
									newThemeName = defaultThemeName + newThemeGUID;
									newThemePath = path.join(themesBuildDir, newThemeName);
									if (fs.existsSync(newThemePath)) {
										fileUtils.remove(newThemePath);
									}
									fs.mkdirSync(newThemePath);
									var themePath = path.join(themesDataDir, defaultThemeName + '.zip');
									extractThemePromises.push(fileUtils.extractZip(themePath, newThemePath));
								}

								return Promise.all(extractThemePromises);

							})
							.then(function (results) {

								var newTheme;
								if (excludetheme && !results[0]) {
									// update the name and itemGUID
									var filePath = path.join(newThemePath, '_folder.json');
									if (fs.existsSync(filePath)) {
										var folderStr = fs.readFileSync(path.join(filePath));
										var folderJson = JSON.parse(folderStr);
										folderJson.itemGUID = newThemeGUID;
										folderJson.themeName = newThemeName;
										fs.writeFileSync(filePath, JSON.stringify(folderJson));
									}
									newTheme = {
										name: newThemeName,
										srcPath: newThemePath
									};
								}

								// zip up the template
								var optimize = false;
								var excludeContentTemplate = false;
								return templateUtils.zipTemplate(
									argv, templateName, optimize, excludeContentTemplate, contentLayoutNames, excludeSiteContent, excludecomponents, newTheme);

							})
							.then(function (results) {

								fileName = templateName + '.zip';
								templatePath = path.join(destdir, fileName);
								if (!fs.existsSync(templatePath)) {
									console.log('ERROR: failed to download template ' + templateName);
									return Promise.reject();
								}


								// upload template file to destination server
								startTime = new Date();
								return serverRest.createFile({
									server: destServer,
									parentID: 'self',
									filename: fileName,
									contents: fs.createReadStream(templatePath)
								});

							})
							.then(function (result) {

								if (!result || result.err || !result.id) {
									console.log('ERROR: failed to upload template file');
									return Promise.reject();
								}
								var uploadedFile = result;
								fileId = uploadedFile.id;
								console.log(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

								return sitesRest.importTemplate({
									server: destServer,
									name: templateName,
									fileId: fileId
								});

							})
							.then(function (result) {
								if (!result || result.err) {
									console.log('ERROR: failed to import template');
									return Promise.reject();
								}

								return sitesRest.getTemplate({
									server: destServer,
									name: templateName
								});

							})
							.then(function (result) {
								if (!result || result.err || !result.id) {
									console.log('ERROR: failed to query template');
									return Promise.reject();
								}

								templateId = result.id;

								return serverUtils.getIdcToken(destServer);
							})
							.then(function (result) {
								// fetch token
								if (result && result.idcToken) {
									idcToken = result && result.idcToken;
								}

								// update template to the original template
								var updateTemplatePromises = [];

								if (excludetheme) {
									var values = {
										'xScsSiteTheme': site.themeName
									};
									updateTemplatePromises.push(serverUtils.setSiteMetadata(request, destServer, idcToken, templateId, values, []));

								}

								return Promise.all(updateTemplatePromises);

							})
							.then(function (results) {
								if (excludetheme) {
									if (results && results[0] && !results[0].err) {
										console.log(' - set template theme back to ' + site.themeName);
									}
								}

								var createSitePromises = [];
								if (creatNewSite && site) {

									createSitePromises.push(sitesRest.createSite({
										server: destServer,
										name: siteName,
										description: site.description,
										sitePrefix: (sitePrefix || site.sitePrefix),
										templateName: templateName,
										templateId: templateId,
										repositoryId: repository.id,
										localizationPolicyId: policy.id,
										defaultLanguage: site.defaultLanguage,
										updateContent: true,
										suppressgovernance: suppressgovernance
									}));

								}

								return Promise.all(createSitePromises);

							})
							.then(function (results) {
								if (creatNewSite) {
									if (!results || !results[0] || results[0].err) {
										return Promise.reject();
									}
								}

								// query site to verify it's created
								return sitesRest.getSite({
									server: destServer,
									name: siteName,
									expand: 'channel,defaultCollection,repository'
								});
							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								destSite = result;

								console.log(' - site id: ' + result.id + ' prefix: ' + result.sitePrefix);

							})
							.then(function (result) {

								// Now upload site content after the site is created in transfer site wo content mode
								var uploadSiteContentPromises = [];
								if (excludeSiteContent && creatNewSite) {
									var siteContentPath = path.join(templatesSrcDir, templateName, 'content');
									if (fs.existsSync(siteContentPath)) {
										var uploadArgv = {
											path: siteContentPath,
											folder: 'site:' + siteName
										};
										uploadSiteContentPromises.push(documentUtils.uploadFolder(uploadArgv, destServer));
									}
								}

								return Promise.all(uploadSiteContentPromises);

							})
							.then(function (results) {

								var deleteTemplatePromises = [];
								if (templateId) {
									// delete template
									deleteTemplatePromises.push(sitesRest.deleteTemplate({
										server: destServer,
										name: templateName,
										hard: true
									}));

									// delete the template file permanently
									var deleteArgv = {
										file: templateName + '.zip',
										permanent: 'true'
									};
									deleteTemplatePromises.push(documentUtils.deleteFile(deleteArgv, destServer, false));
								}

								return Promise.all(deleteTemplatePromises);
							})
							.then(function (results) {

								// delete the dymmy theme in excludetheme mode
								var deleteThemePromises = [];
								if (newThemeName) {
									deleteThemePromises.push(sitesRest.deleteTheme({
										server: destServer,
										name: newThemeName,
										hard: true,
										showError: false
									}));
								}

								return Promise.all(deleteThemePromises);

							})
							.then(function (results) {
								// download static 
								var downloadStaticFolderPromises = [];
								if (includestaticfiles) {
									var staticFileFolder;
									if (creatNewSite && !excludeSiteContent) {
										if (!fs.existsSync(path.join(documentsSrcDir, siteName))) {
											fs.mkdirSync(path.join(documentsSrcDir, siteName));
										}
										staticFileFolder = path.join(documentsSrcDir, siteName, 'static');
									} else {
										staticFileFolder = path.join(templatesSrcDir, templateName, 'static');
									}
									fileUtils.remove(staticFileFolder);

									fs.mkdirSync(staticFileFolder);

									var downloadArgv = {
										folder: staticFileFolder,
										path: 'site:' + siteName + '/static'
									};

									downloadStaticFolderPromises.push(documentUtils.downloadFolder(downloadArgv, server, true, false));
								}

								return Promise.all(downloadStaticFolderPromises);

							})
							.then(function (results) {
								if (includestaticfiles) {
									console.log(' - download site static files');
								}

								// upload static files
								var uploadStaticFolderPromises = [];
								if (includestaticfiles && creatNewSite) {
									var staticFolderPath = excludeSiteContent ? path.join(templatesSrcDir, templateName, 'static') :
										path.join(documentsSrcDir, siteName, 'static');

									var uploadArgv = {
										path: staticFolderPath,
										folder: 'site:' + siteName
									};
									uploadStaticFolderPromises.push(documentUtils.uploadFolder(uploadArgv, destServer));
								}

								return Promise.all(uploadStaticFolderPromises);

							})
							.then(function (results) {
								if (includestaticfiles) {
									console.log(' - upload site static files');
								}

								if (creatNewSite) {
									if (actionSuccess) {
										console.log(' - site ' + siteName + ' created on ' + destServer.url);
									}

									_transferOtherAssets(argv, server, destServer, site, destSite, repoMappings, excludecontent).then(function (result) {

										// update the localization policy
										serverRest.updateLocalizationPolicy({
											server: destServer,
											id: policy.id,
											name: policy.name,
											data: srcPolicy
										}).then(function (result) {
											if (!result || result.err) {
												actionSuccess = false;
											} else {
												var newPolicy = result;
												console.log(' - update site localization policy ' + newPolicy.name);
											}
											_cmdEnd(done, actionSuccess);
										});
									});

								} else {

									var updateSiteArgs = {
										projectDir: projectDir,
										name: siteName,
										template: templateName,
										server: destServerName,
										excludecontenttemplate: excludecontent ? 'true' : 'false'
									};
									siteUpdateLib.updateSite(updateSiteArgs, function (success) {
										console.log(' - update site finished');

										if (success) {
											serverUtils.getIdcToken(destServer)
												.then(function (result) {
													idcToken = result && result.idcToken;
													if (!idcToken) {
														console.log('ERROR: failed to get idcToken');
														return Promise.reject();
													}

													return serverUtils.getSiteMetadataRaw(request, destServer, destSite.id);

												})
												.then(function (result) {
													destSiteMetadataRaw = result;
													// console.log(destSiteMetadataRaw);

													// update site metadata
													return _updateSiteMetadata(request, destServer, idcToken, destSite, siteMetadata, siteMetadataRaw, destSiteMetadataRaw);
												})
												.then(function (result) {
													if (result && !result.err) {
														console.log(' - update site metadata');
													}

													return _transferOtherAssets(argv, server, destServer, site, destSite, repoMappings, excludecontent);

												})
												.then(function (result) {

													return serverRest.getLocalizationPolicy({
														server: destServer,
														id: destSite.channel.localizationPolicy
													});
												})
												.then(function (result) {
													if (!result || result.err) {
														return Promise.reject();
													}
													policy = result;
													// update the localization policy
													return serverRest.updateLocalizationPolicy({
														server: destServer,
														id: policy.id,
														name: policy.name,
														data: srcPolicy
													});
												})
												.then(function (result) {
													if (!result || result.err) {
														return Promise.reject();
													}
													var newPolicy = result;
													console.log(' - update site localization policy ' + newPolicy.name);
													_cmdEnd(done, success);
												})
												.catch((error) => {
													if (error) {
														console.log(error);
													}
													_cmdEnd(done);
												});

										} else {
											_cmdEnd(done);
										}
									});
								}

							})
							.catch((error) => {
								if (error) {
									console.log(error);
								}
								_cmdEnd(done);
							});
					} // enterprise site

				})
				.catch((error) => {
					if (error) {
						console.log(error);
					}
					_cmdEnd(done);
				}); // get site

		}); // login
};

var _transferOtherAssets = function (argv, server, destServer, site, destSite, repoMappings, excludecontent) {
	return new Promise(function (resolve, reject) {
		if (repoMappings.length === 0 || excludecontent) {
			return resolve({});
		}

		contentUtils.getSiteAssetsFromOtherRepos(server, site.channel.id, site.repository.id)
			.then(function (result) {
				var items = result && result.data || [];
				if (items.length === 0) {
					return resolve({});
				}

				console.log(' - total assets from other repositories: ' + items.length);
				var destRepoIds = [];
				repoMappings.forEach(function (mapping) {
					if (!destRepoIds.includes(mapping.destId)) {
						destRepoIds.push(mapping.destId);
					}
					for (var i = 0; i < items.length; i++) {
						if (items[i].repositoryId === mapping.srcId) {
							mapping.items.push(items[i].id);
						}

					}
				});
				// console.log(repoMappings);

				// remove the assets from the site channel on the target
				return _removeRepoAssetsFromChannel(destServer, destSite.channel.id, destRepoIds);

			})
			.then(function (result) {

				// transfer assets from other repositories
				return _transferRepoAssets(argv, repoMappings, server, destServer, site, destSite);

			})
			.then(function (result) {

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: err
				});
			});
	});
};

var _removeRepoAssetsFromChannel = function (server, channelId, repoIds) {
	return new Promise(function (resolve, reject) {
		// console.log(repoIds);
		repoIds.forEach(function (repoId) {
			var q = 'repositoryId eq "' + repoId + '" AND channels co "' + channelId + '"';
			serverRest.queryItems({
				server: server,
				q: q
			}).then(function (result) {
				var items = result && result.data || [];
				var itemIds = [];
				items.forEach(function (item) {
					itemIds.push(item.id);
				});
				// console.log(' -- found assets (' + itemIds + ')');

				var removePromises = itemIds.length === 0 ? [] : [serverRest.removeItemsFromChanel({
					server: server,
					channelId: channelId,
					itemIds: itemIds
				})];

				Promise.all(removePromises).then(function (results) {
					return resolve({});
				});
			});
		});
	});
};

var _transferRepoAssets = function (argv, repoMappings, server, destServer, site, destSite) {
	return new Promise(function (resolve, reject) {
		var total = repoMappings.length;
		var destdir = path.join(projectDir, 'dist');
		var transferAssets = repoMappings.reduce(function (transferPromise, mapping) {
				return transferPromise.then(function (result) {
					console.log(' - *** transfering assets from repository ' + mapping.srcName + ' to repository ' + mapping.destName + ' ...');

					// download assets from the source server
					var name = site.name + '_' + mapping.srcName + '_assets';
					var downloadArgs = {
						projectDir: projectDir,
						server: server,
						assetGUIDS: mapping.items,
						name: name,
						publishedassets: false
					};
					return contentUtils.downloadContent(downloadArgs).then(function (result) {
						// console.log(' - * assets downloaded');

						// upload the downloaded assets to the target server
						var fileName = site.name + '_' + mapping.srcName + '_assets_export.zip';
						var filePath = path.join(destdir, fileName);
						if (fs.existsSync(filePath)) {
							var uploadArgs = {
								argv: argv,
								server: destServer,
								name: filePath,
								isFile: true,
								repositoryName: mapping.destName,
								channelName: destSite.channel.name,
								updateContent: true,
								contentpath: destdir,
								contentfilename: fileName
							};

							return contentUtils.uploadContent(uploadArgs).then(function (result) {
								// console.log(' - * assets uploaded');
							});

						}
					});
				});
			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		transferAssets.then(function (result) {
			resolve({});
		});

	});
};

var _getNewUsedObjects = function (fields, srcRows, destRows, instanceFieldName, rowsToAdd, unitIdsToAdd, rowsRoRemove, unitIdsToRemove) {
	if (fields && fields.length > 0) {
		var unitIDIdx;
		for (var i = 0; i < fields.length; i++) {
			if (fields[i].name === instanceFieldName) {
				instanceIDIdx = i;
			}
			if (fields[i].name === 'dIdentifier') {
				unitIDIdx = i;
			}
		}

		// find out rows to add (exist on source but not on destination)
		srcRows.forEach(function (srcObj) {
			var foundInDest = false;
			for (i = 0; i < destRows.length; i++) {
				if (srcObj[instanceIDIdx] === destRows[i][instanceIDIdx]) {
					foundInDest = true;
					break;
				}
			}
			if (!foundInDest) {
				rowsToAdd.push(srcObj);
				unitIdsToAdd.push(srcObj[unitIDIdx]);
			}
		});

		// find out rows to remove (exist on destination but not on source)
		for (i = 0; i < destRows.length; i++) {
			var foundInSource = false;
			for (var j = 0; j < srcRows.length; j++) {
				if (srcRows[j][instanceIDIdx] === destRows[i][instanceIDIdx]) {
					foundInSource = true;
					break;
				}
			}
			if (!foundInSource) {
				rowsRoRemove.push(destRows[i]);
				unitIdsToRemove.push(destRows[i][unitIDIdx]);
			}
		}
	}
	// console.log(instanceFieldName + ' to add ' + unitIdsToAdd + ' to remove ' + unitIdsToRemove);
};

var _updateSiteMetadata = function (request, destServer, idcToken, destSite, siteMetadata, siteMetadataRaw, destSiteMetadataRaw) {
	return new Promise(function (resolve, reject) {
		// update site metadata
		var siteSettings = {
			xScsSiteStaticResponseHeaders: siteMetadata ? siteMetadata.xScsSiteStaticResponseHeaders : '',
			xScsSiteMobileUserAgents: siteMetadata ? siteMetadata.xScsSiteMobileUserAgents : ''
		};

		var compFields = siteMetadataRaw && siteMetadataRaw.xScsComponentsUsedCollection && siteMetadataRaw.xScsComponentsUsedCollection.fields ||
			destSiteMetadataRaw && destSiteMetadataRaw.xScsComponentsUsedCollection && destSiteMetadataRaw.xScsComponentsUsedCollection.fields;
		var srcCompRows = siteMetadataRaw && siteMetadataRaw.xScsComponentsUsedCollection && siteMetadataRaw.xScsComponentsUsedCollection.rows || [];
		var destCompRows = destSiteMetadataRaw && destSiteMetadataRaw.xScsComponentsUsedCollection && destSiteMetadataRaw.xScsComponentsUsedCollection.rows || [];
		var compsToAdd = [];
		var compsToAddUnitId = [];
		var compsToRemove = [];
		var compsToRemoveUnitId = [];
		_getNewUsedObjects(compFields, srcCompRows, destCompRows, 'xScsComponentsUsedInstanceID',
			compsToAdd, compsToAddUnitId, compsToRemove, compsToRemoveUnitId);

		var itemFields = siteMetadataRaw && siteMetadataRaw.xScsContentItemsUsedCollection && siteMetadataRaw.xScsContentItemsUsedCollection.fields ||
			destSiteMetadataRaw && destSiteMetadataRaw.xScsContentItemsUsedCollection && destSiteMetadataRaw.xScsContentItemsUsedCollection.fields;
		var srcItemRows = siteMetadataRaw && siteMetadataRaw.xScsContentItemsUsedCollection && siteMetadataRaw.xScsContentItemsUsedCollection.rows || [];
		var destItemRows = destSiteMetadataRaw && destSiteMetadataRaw.xScsContentItemsUsedCollection && destSiteMetadataRaw.xScsContentItemsUsedCollection.rows || [];
		var itemsToAdd = [];
		var itemsToAddUnitId = [];
		var itemsToRemove = [];
		var itemsToRemoveUnitId = [];
		_getNewUsedObjects(itemFields, srcItemRows, destItemRows,
			'xScsContentItemsUsedInstanceID', itemsToAdd, itemsToAddUnitId, itemsToRemove, itemsToRemoveUnitId);

		var typeFields = siteMetadataRaw && siteMetadataRaw.xScsContentTypesUsedCollection && siteMetadataRaw.xScsContentTypesUsedCollection.fields ||
			destSiteMetadataRaw && destSiteMetadataRaw.xScsContentTypesUsedCollection && destSiteMetadataRaw.xScsContentTypesUsedCollection.fields;
		var srcTypeRows = siteMetadataRaw && siteMetadataRaw.xScsContentTypesUsedCollection && siteMetadataRaw.xScsContentTypesUsedCollection.rows || [];
		var destTypeRows = destSiteMetadataRaw && destSiteMetadataRaw.xScsContentTypesUsedCollection && destSiteMetadataRaw.xScsContentTypesUsedCollection.rows || [];
		var typesToAdd = [];
		var typesToAddUnitId = [];
		var typesToRemove = [];
		var typesToRemoveUnitId = [];
		_getNewUsedObjects(typeFields, srcTypeRows, destTypeRows,
			'xScsContentTypesUsedInstanceID', typesToAdd, typesToAddUnitId, typesToRemove, typesToRemoveUnitId);

		var resultSets = {};
		if (compsToAdd.length > 0 || compsToRemove.length > 0) {
			if (compsToAddUnitId.length > 0) {
				siteSettings['xScsComponentsUsedCollection+'] = compsToAddUnitId.join(',');
			}
			if (compsToRemoveUnitId.length > 0) {
				siteSettings['xScsComponentsUsedCollection-'] = compsToRemoveUnitId.join(',');
			}
			resultSets.xScsComponentsUsedCollection = siteMetadataRaw.xScsComponentsUsedCollection || destSiteMetadataRaw.xScsComponentsUsedCollection;
			resultSets.xScsComponentsUsedCollection.rows = compsToAdd.concat(compsToRemove);
		}
		if (itemsToAdd.length > 0 || itemsToRemove.length > 0) {
			if (itemsToAddUnitId.length > 0) {
				siteSettings['xScsContentItemsUsedCollection+'] = itemsToAddUnitId.join(',');
			}
			if (itemsToRemoveUnitId.length > 0) {
				siteSettings['xScsContentItemsUsedCollection-'] = itemsToRemoveUnitId.join(',');
			}
			resultSets.xScsContentItemsUsedCollection = siteMetadataRaw.xScsContentItemsUsedCollection || destSiteMetadataRaw.xScsContentItemsUsedCollection;
			resultSets.xScsContentItemsUsedCollection.rows = itemsToAdd.concat(itemsToRemove);
		}
		if (typesToAdd.length > 0 || typesToRemove.length > 0) {
			if (typesToAddUnitId.length > 0) {
				siteSettings['xScsContentTypesUsedCollection+'] = typesToAddUnitId.join(',');
			}
			if (typesToRemoveUnitId.length > 0) {
				siteSettings['xScsContentTypesUsedCollection-'] = typesToRemoveUnitId.join(',');
			}
			resultSets.xScsContentTypesUsedCollection = siteMetadataRaw.xScsContentTypesUsedCollection || destSiteMetadataRaw.xScsContentTypesUsedCollection;
			resultSets.xScsContentTypesUsedCollection.rows = typesToAdd.concat(typesToRemove);
		}

		serverUtils.setSiteMetadata(request, destServer, idcToken, destSite.id, siteSettings, resultSets)
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to set site metadata');
					return Promise.reject();
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});

};

var _uploadTemplateWithoutContent = function (argv, templateName, destServer, destdir, excludeSiteContent) {
	return new Promise(function (resolve, reject) {
		var fileName = templateName + '.zip';
		var templatePath = path.join(destdir, fileName);
		templateUtils.zipTemplate(argv, templateName, false, true, [], excludeSiteContent)
			.then(function (result) {
				// upload template file to destination server
				return serverRest.createFile({
					server: destServer,
					parentID: 'self',
					filename: fileName,
					contents: fs.createReadStream(templatePath)
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: failed to upload template file');
					return Promise.reject();
				}
				var uploadedFile = result;
				fileId = uploadedFile.id;
				console.log(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')');

				return sitesRest.importTemplate({
					server: destServer,
					name: templateName,
					fileId: fileId
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: failed to import template again');
					return Promise.reject();
				}
				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

/**
 * control site
 */
module.exports.controlSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {

		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			_cmdEnd(done);
			return;
		}

		// console.log('server: ' + server.url);

		var action = argv.action;
		var siteName = argv.site;

		var usedContentOnly = typeof argv.usedcontentonly === 'string' && argv.usedcontentonly.toLowerCase() === 'true';
		var compileSite = typeof argv.compilesite === 'string' && argv.compilesite.toLowerCase() === 'true';
		var staticOnly = typeof argv.staticonly === 'string' && argv.staticonly.toLowerCase() === 'true';
		var fullpublish = typeof argv.fullpublish === 'string' && argv.fullpublish.toLowerCase() === 'true';

		var request = serverUtils.getRequest();

		serverUtils.loginToServer(server, request).then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}
			// if (server.useRest) {
			_controlSiteREST(request, server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish)
				.then(function (result) {
					if (result.err) {
						done();
					} else {
						done(true);
					}
				});
			/*
						} else {
							_controlSiteSCS(request, server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish, done);
						}
						*/
		});

	} catch (e) {
		console.log(e);
		done();
	}

};

/**
 * Use sites management API to activate / deactivate a site
 * @param {*} request 
 * @param {*} server the server object
 * @param {*} action bring-online / take-offline
 * @param {*} siteId 
 */
var _setSiteRuntimeStatus = function (request, server, action, siteId) {
	var sitePromise = new Promise(function (resolve, reject) {

		var url = server.url + '/sites/management/api/v1/sites/' + siteId + '/' + (action === 'bring-online' ? 'activate' : 'deactivate');

		var headers = {
			'Content-Type': 'application/json'
		};
		var options = {
			method: 'POST',
			url: url,
			headers: headers
		};

		if (server.env === 'pod_ec') {
			headers.Authorization = server.oauthtoken;
			options.headers = headers;
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to ' + action + ' the site');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			if (response.statusCode === 303) {

				resolve({});

			} else {
				var data;
				try {
					data = JSON.parse(body);
				} catch (err) {}

				var msg = data ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to ' + action + ' the site - ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return sitePromise;
};


/**
 * Use Idc service to control a site
 */
var _controlSiteSCS = function (request, server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish, done) {

	var express = require('express');
	var app = express();

	var port = '9191';
	var localhost = 'http://localhost:' + port;

	var dUser = '';
	var idcToken;

	var auth = serverUtils.getRequestAuth(server);

	var siteId;

	app.get('/*', function (req, res) {
		// console.log('GET: ' + req.url);
		if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
			var url = server.url + req.url;

			var options = {
				url: url,
			};

			options.auth = auth;

			request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					serverUtils.fixHeaders(response, res);
				})
				.on('error', function (err) {
					console.log('ERROR: GET request failed: ' + req.url);
					console.log(error);
					return resolve({
						err: 'err'
					});
				})
				.pipe(res);

		} else {
			console.log('ERROR: GET request not supported: ' + req.url);
			res.write({});
			res.end();
		}
	});
	app.post('/documents/web', function (req, res) {
		// console.log('POST: ' + req.url);

		var url = server.url + req.url;
		var formData = {
			'idcToken': idcToken,
			'item': 'fFolderGUID:' + siteId
		};

		if (req.url.indexOf('SCS_ACTIVATE_SITE') > 0 || req.url.indexOf('SCS_DEACTIVATE_SITE') > 0) {
			formData.isSitePublishV2 = 1;
		}
		if (req.url.indexOf('SCS_PUBLISH_SITE')) {
			if (staticOnly > 0) {
				formData.doStaticFilePublishOnly = 1;
				formData.skipCompileSiteCheck = 1;
			} else if (!compileSite) {
				formData.skipCompileSiteCheck = 1;
			}

			if (usedContentOnly) {
				formData.publishUsedContentOnly = 1;
			}

			if (fullpublish) {
				formData.doForceActivate = 1;
			}
		}

		// console.log('controlSite formData', formData);

		var postData = {
			method: 'POST',
			url: url,
			'auth': auth,
			'formData': formData
		};
		request(postData).on('response', function (response) {
				// fix headers for cross-domain and capitalization issues
				serverUtils.fixHeaders(response, res);
			})
			.on('error', function (err) {
				console.log('ERROR: Failed to ' + action + ' site');
				console.log(err);
				return resolve({
					err: 'err'
				});
			})
			.pipe(res)
			.on('finish', function (err) {
				res.end();
			});

	});

	localServer = app.listen(0, function () {
		port = localServer.address().port;
		localhost = 'http://localhost:' + port;
		localServer.setTimeout(0);

		var inter = setInterval(function () {
			// console.log(' - getting login user: ' + total);
			var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

			request.get(url, function (err, response, body) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {}
				dUser = data && data.LocalData && data.LocalData.dUser;
				idcToken = data && data.LocalData && data.LocalData.idcToken;
				if (dUser && dUser !== 'anonymous' && idcToken) {
					// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
					clearInterval(inter);
					console.log(' - establish user session');

					// verify site 
					var sitePromise = serverUtils.browseSitesOnServer(request, server, '', siteName);
					sitePromise.then(function (result) {
							if (result.err) {
								return Promise.reject();
							}

							var sites = result.data || [];
							var site;
							for (var i = 0; i < sites.length; i++) {
								if (siteName.toLowerCase() === sites[i].fFolderName.toLowerCase()) {
									site = sites[i];
									break;
								}
							}
							if (!site || !site.fFolderGUID) {
								console.log('ERROR: site ' + siteName + ' does not exist');
								return Promise.reject();
							}

							siteId = site.fFolderGUID;

							// console.log(' - xScsIsSiteActive: ' + site.xScsIsSiteActive + ' xScsSitePublishStatus: ' + site.xScsSitePublishStatus);
							var runtimeStatus = site.xScsIsSiteActive && site.xScsIsSiteActive === '1' ? 'online' : 'offline';
							var publishStatus = site.xScsSitePublishStatus && site.xScsSitePublishStatus === 'published' ? 'published' : 'unpublished';
							console.log(' - get site: runtimeStatus: ' + runtimeStatus + '  publishStatus: ' + publishStatus);

							if (action === 'take-offline' && runtimeStatus === 'offline') {
								console.log(' - site is already offline');
								return Promise.reject();
							}
							if (action === 'bring-online' && runtimeStatus === 'online') {
								console.log(' - site is already online');
								return Promise.reject();
							}
							if (action === 'bring-online' && publishStatus === 'unpublished') {
								console.log('ERROR: site ' + siteName + ' is draft, publish it first');
								return Promise.reject();
							}

							if (action === 'unpublish' && runtimeStatus === 'online') {
								console.log('ERROR: site ' + siteName + ' is online, take it offline first');
								return Promise.reject();
							}
							if (action === 'unpublish' && publishStatus === 'unpublished') {
								console.log('ERROR: site ' + siteName + ' is draft');
								return Promise.reject();
							}

							var service;
							if (action === 'publish') {
								service = 'SCS_PUBLISH_SITE';
							} else if (action === 'unpublish') {
								service = 'SCS_UNPUBLISH_SITE';
							} else if (action === 'bring-online') {
								service = 'SCS_ACTIVATE_SITE';
							} else if (action === 'take-offline') {
								service = 'SCS_DEACTIVATE_SITE';
							} else {
								console.log('ERROR: invalid action ' + action);
								return Promise.reject();
							}

							var actionPromise = _postOneIdcService(request, localhost, server, service, action, idcToken);
							actionPromise.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
									return;
								}

								if (action === 'bring-online') {
									console.log(' - site ' + siteName + ' is online now');
								} else if (action === 'take-offline') {
									console.log(' - site ' + siteName + ' is offline now');
								} else if (action === 'publish') {
									if (compileSite) {
										console.log(' - ' + action + ' ' + siteName + ' (compile and publish) finished');
									} else if (staticOnly) {
										console.log(' - ' + action + ' ' + siteName + ' (static files) finished');
									} else {
										console.log(' - ' + action + ' ' + siteName + ' finished');
									}
								} else {
									console.log(' - ' + action + ' ' + siteName + ' finished');
								}
								_cmdEnd(done, true);
							});
						})
						.catch((error) => {
							_cmdEnd(done);
						});
				}
			}); // idc token request

		}, 5000);
	}); // local 
};

var _postOneIdcService = function (request, localhost, server, service, action, idcToken) {
	return new Promise(function (resolve, reject) {
		// service: SCS_PUBLISH_SITE, SCS_UNPUBLISH_SITE, SCS_ACTIVATE_SITE, SCS_DEACTIVATE_SITE
		var url = localhost + '/documents/web?IdcService=' + service;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to ' + action);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to ' + action + ' - ' + (data && data.LocalData ? data.LocalData.StatusMessage : response.statusMessage || response.statusCode));
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;

			if (jobId) {
				console.log(' - submit ' + action + ' (JobID: ' + jobId + ')');
				// wait action to finish
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
					jobPromise.then(function (data) {
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							// console.log(data);
							// try to get error message
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							console.log('ERROR: ' + action + ' failed: ' + (data && data.JobMessage));
							serverUtils.getBackgroundServiceJobData(server, request, idcToken, jobId)
								.then(function (result) {
									// console.log(result);
									if (result && result.LocalData && result.LocalData.StatusMessage) {
										console.log(result.LocalData.StatusMessage);
									}
									return resolve({
										err: 'err'
									});
								});
						} else if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}

							return resolve({});

						} else {
							process.stdout.write(' - ' + action + ' in process: percentage ' + data.JobPercentage +
								' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
					});
				}, 6000);
			} else {
				return resolve({});
			}
		});
	});
};

var _getOneIdcService = function (request, localhost, server, service, params) {
	return new Promise(function (resolve, reject) {
		// service: SCS_GET_SITE_INFO_FILE
		var url = localhost + '/documents/web?IdcService=' + service;
		if (params) {
			url = url + '&' + params;
		}

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to do ' + service);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (response && response.statusCode !== 200) {
				var msg = data && data.LocalData ? data.LocalData.StatusMessage : (response.statusMessage || response.statusCode);
				console.log('ERROR: Failed to do ' + service + ' - ' + msg);
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);
		});
	});
};

/**
 * Control site using REST APIs
 * @param {*} request 
 * @param {*} server 
 * @param {*} action 
 * @param {*} siteName 
 * @param {*} done 
 */
var _controlSiteREST = function (request, server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish) {

	return new Promise(function (resolve, reject) {
		sitesRest.getSite({
				server: server,
				name: siteName
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var site = result;
				var runtimeStatus = site.runtimeStatus;
				var publishStatus = site.publishStatus;
				console.log(' - get site: runtimeStatus: ' + runtimeStatus + '  publishStatus: ' + publishStatus);

				if (action === 'take-offline' && runtimeStatus === 'offline') {
					console.log(' - site is already offline');
					return Promise.reject();
				}
				if (action === 'bring-online' && runtimeStatus === 'online') {
					console.log(' - site is already online');
					return Promise.reject();
				}
				if (action === 'bring-online' && publishStatus === 'unpublished') {
					console.log('ERROR: site ' + siteName + ' is draft, publish it first');
					return Promise.reject();
				}

				if (action === 'unpublish' && runtimeStatus === 'online') {
					console.log('ERROR: site ' + siteName + ' is online, take it offline first');
					return Promise.reject();
				}
				if (action === 'unpublish' && publishStatus === 'unpublished') {
					console.log('ERROR: site ' + siteName + ' is draft');
					return Promise.reject();
				}

				var actionPromise;
				if (action === 'publish') {
					actionPromise = sitesRest.publishSite({
						server: server,
						name: siteName,
						usedContentOnly: usedContentOnly,
						compileSite: compileSite,
						staticOnly: staticOnly,
						fullpublish: fullpublish
					});
				} else if (action === 'unpublish') {
					actionPromise = sitesRest.unpublishSite({
						server: server,
						name: siteName
					});
				} else if (action === 'bring-online') {
					actionPromise = sitesRest.activateSite({
						server: server,
						name: siteName
					});
				} else if (action === 'take-offline') {
					actionPromise = sitesRest.deactivateSite({
						server: server,
						name: siteName
					});
				} else {
					console.log('ERROR: invalid action ' + action);
					return Promise.reject();
				}

				return actionPromise;
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (action === 'bring-online') {
					console.log(' - site ' + siteName + ' is online now');
				} else if (action === 'take-offline') {
					console.log(' - site ' + siteName + ' is offline now');
				} else {
					console.log(' - ' + action + ' ' + siteName + ' finished');
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

/**
 * share site
 */
module.exports.shareSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			_cmdEnd(done);
			return;
		}

		// console.log('server: ' + server.url);
		var name = argv.name;
		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];
		var role = argv.role;

		var siteId;
		var users = [];
		var groups = [];

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var sitePromise = sitesRest.getSite({
				server: server,
				name: name
			});
			sitePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (!result.id) {
						console.log('ERROR: site ' + name + ' does not exist');
						return Promise.reject();
					}
					siteId = result.id;
					console.log(' - verify site');

					var groupPromises = [];
					groupNames.forEach(function (gName) {
						groupPromises.push(
							serverRest.getGroup({
								server: server,
								name: gName
							}));
					});
					return Promise.all(groupPromises);
				})
				.then(function (result) {

					if (groupNames.length > 0) {
						console.log(' - verify groups');

						// verify groups
						var allGroups = result || [];
						for (var i = 0; i < groupNames.length; i++) {
							var found = false;
							for (var j = 0; j < allGroups.length; j++) {
								if (allGroups[j].name && groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
									found = true;
									groups.push(allGroups[j]);
									break;
								}
							}
							if (!found) {
								console.log('ERROR: group ' + groupNames[i] + ' does not exist');
							}
						}
					}

					var usersPromises = [];
					for (var i = 0; i < userNames.length; i++) {
						usersPromises.push(serverRest.getUser({
							server: server,
							name: userNames[i]
						}));
					}

					return Promise.all(usersPromises);
				})
				.then(function (results) {
					var allUsers = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i].items) {
							allUsers = allUsers.concat(results[i].items);
						}
					}
					if (userNames.length > 0) {
						console.log(' - verify users');
					}
					// verify users
					for (var k = 0; k < userNames.length; k++) {
						var found = false;
						for (var i = 0; i < allUsers.length; i++) {
							if (allUsers[i].loginName && allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
								users.push(allUsers[i]);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found) {
							console.log('ERROR: user ' + userNames[k] + ' does not exist');
						}
					}

					if (users.length === 0 && groups.length === 0) {
						return Promise.reject();
					}

					return serverRest.getFolderUsers({
						server: server,
						id: siteId
					});
				})
				.then(function (result) {
					var existingMembers = result.data || [];

					var sharePromises = [];
					for (var i = 0; i < users.length; i++) {
						var newMember = true;
						for (var j = 0; j < existingMembers.length; j++) {
							if (existingMembers[j].id === users[i].id) {
								newMember = false;
								break;
							}
						}
						// console.log(' - user: ' + users[i].loginName + ' new grant: ' + newMember);
						sharePromises.push(serverRest.shareFolder({
							server: server,
							id: siteId,
							userId: users[i].id,
							role: role,
							create: newMember
						}));
					}

					for (var i = 0; i < groups.length; i++) {
						var newMember = true;
						for (var j = 0; j < existingMembers.length; j++) {
							if (existingMembers[j].id === groups[i].groupID) {
								newMember = false;
								break;
							}
						}
						// console.log(' - group: ' + (groups[i].displayName || groups[i].name) + ' new grant: ' + newMember);
						sharePromises.push(serverRest.shareFolder({
							server: server,
							id: siteId,
							userId: groups[i].groupID,
							role: role,
							create: newMember
						}));
					}

					return Promise.all(sharePromises);
				})
				.then(function (results) {
					var shared = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i].errorCode === '0') {
							shared = true;
							var typeLabel = results[i].user.loginName ? 'user' : 'group';
							console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + ' granted "' +
								results[i].role + '" on site ' + name);
						} else {
							console.log('ERROR: ' + results[i].title);
						}
					}
					_cmdEnd(done, shared);
				})
				.catch((error) => {
					_cmdEnd(done);
				});
		}); // login
	} catch (e) {
		_cmdEnd(done);
	}
};


/**
 * share site
 */
module.exports.unshareSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			_cmdEnd(done);
			return;
		}

		// console.log('server: ' + server.url);
		var name = argv.name;
		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];

		var siteId;
		var users = [];
		var groups = [];

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var sitePromise = sitesRest.getSite({
				server: server,
				name: name
			});
			sitePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (!result.id) {
						console.log('ERROR: site ' + name + ' does not exist');
						return Promise.reject();
					}
					siteId = result.id;
					console.log(' - verify site');

					var groupPromises = [];
					groupNames.forEach(function (gName) {
						groupPromises.push(
							serverRest.getGroup({
								server: server,
								name: gName
							}));
					});
					return Promise.all(groupPromises);
				})
				.then(function (result) {

					if (groupNames.length > 0) {
						console.log(' - verify groups');

						// verify groups
						var allGroups = result || [];
						for (var i = 0; i < groupNames.length; i++) {
							var found = false;
							for (var j = 0; j < allGroups.length; j++) {
								if (allGroups[j].name && groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
									found = true;
									groups.push(allGroups[j]);
									break;
								}
							}
							if (!found) {
								console.log('ERROR: group ' + groupNames[i] + ' does not exist');
							}
						}
					}

					var usersPromises = [];
					for (var i = 0; i < userNames.length; i++) {
						usersPromises.push(serverRest.getUser({
							server: server,
							name: userNames[i]
						}));
					}

					return Promise.all(usersPromises);
				})
				.then(function (results) {
					var allUsers = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i].items) {
							allUsers = allUsers.concat(results[i].items);
						}
					}
					if (userNames.length > 0) {
						console.log(' - verify users');
					}
					// verify users
					for (var k = 0; k < userNames.length; k++) {
						var found = false;
						for (var i = 0; i < allUsers.length; i++) {
							if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
								users.push(allUsers[i]);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found) {
							console.log('ERROR: user ' + userNames[k] + ' does not exist');
						}
					}

					if (users.length === 0 && groups.length === 0) {
						return Promise.reject();
					}

					return serverRest.getFolderUsers({
						server: server,
						id: siteId
					});
				})
				.then(function (result) {
					var existingMembers = result.data || [];
					var revokePromises = [];
					for (var i = 0; i < users.length; i++) {
						var existingUser = false;
						for (var j = 0; j < existingMembers.length; j++) {
							if (users[i].id === existingMembers[j].id) {
								existingUser = true;
								break;
							}
						}

						if (existingUser) {
							revokePromises.push(serverRest.unshareFolder({
								server: server,
								id: siteId,
								userId: users[i].id
							}));
						} else {
							console.log(' - user ' + users[i].loginName + ' has no access to the site');
						}
					}

					for (var i = 0; i < groups.length; i++) {
						var existingUser = false;
						for (var j = 0; j < existingMembers.length; j++) {
							if (existingMembers[j].id === groups[i].groupID) {
								existingUser = true;
								break;
							}
						}

						if (existingUser) {
							revokePromises.push(serverRest.unshareFolder({
								server: server,
								id: siteId,
								userId: groups[i].groupID
							}));
						} else {
							console.log(' - group ' + (groups[i].displayName || groups[i].name) + ' has no access to the site');
						}
					}

					return Promise.all(revokePromises);
				})
				.then(function (results) {
					var unshared = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i].errorCode === '0') {
							unshared = true;
							var typeLabel = results[i].user.loginName ? 'user' : 'group';
							console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + '\'s access to the site removed');
						} else {
							console.log('ERROR: ' + results[i].title);
						}
					}
					_cmdEnd(done, unshared);
				})
				.catch((error) => {
					_cmdEnd(done);
				});
		}); // login
	} catch (e) {
		_cmdEnd(done);
	}
};


/**
 * validate site
 */
module.exports.validateSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {

		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		var siteName = argv.name;

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			_validateSiteREST(request, server, siteName, done);

		}); // login
	} catch (e) {
		console.log(e);
		done();
	}
};

var _displaySiteValidation = function (validation) {
	console.log('  is valid: ' + validation.valid);

	if (validation.valid) {
		return;
	}

	var format = '  %-12s : %-s';

	var pages = validation.pages;
	for (var i = 0; i < pages.length; i++) {
		if (!pages[i].publishable) {
			console.log(sprintf(format, 'page name', pages[i].name));
			for (var k = 0; k < pages[i].languages.length; k++) {
				var lang = pages[i].languages[k];
				var msg = lang.validation + ' ' + lang.policyStatus + ' language ' + lang.language;
				console.log(sprintf(format, (k === 0 ? 'languages' : ' '), msg));
			}
		}
	}
};

var _displayAssetValidation = function (validations) {
	var policyValidation;
	for (var i = 0; i < validations.length; i++) {
		var val = validations[i];
		Object.keys(val).forEach(function (key) {
			if (key === 'policyValidation') {
				policyValidation = val[key];
			}
		});
	}

	var format = '  %-12s : %-s';

	var items = policyValidation.items;
	var valid = true;
	for (var i = 0; i < items.length; i++) {
		var val = items[i].validations;

		for (var j = 0; j < val.length; j++) {
			if (!val[j].publishable) {
				valid = false;
				console.log(sprintf(format, 'name', items[i].name));
				console.log(sprintf(format, 'type', items[i].type));
				console.log(sprintf(format, 'language', items[i].language));

				var results = val[j].results;
				for (var k = 0; k < results.length; k++) {
					// console.log(results[k]);
					// results[k].value is the policy languages
					// console.log(sprintf(format, 'item id', results[k].itemId));
					console.log(sprintf(format, 'valid', results[k].valid));
					console.log(sprintf(format, 'message', results[k].message));
				}
				console.log('');
			}
		}
	}
	if (valid) {
		console.log('  is valid: ' + valid);
	}

};

var _validateSiteREST = function (request, server, siteName, done) {
	var siteId;
	var repositoryId, channelId, channelToken;
	sitesRest.getSite({
			server: server,
			name: siteName,
			expand: 'channel,repository'
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var site = result;
			if (!site.isEnterprise) {
				console.log(' - site ' + siteName + ' is not an enterprise site');
				return Promise.reject();
			}
			if (!site.defaultLanguage) {
				console.log(' - site ' + siteName + ' is not configured with a default language');
				return Promise.reject();
			}

			siteId = site.id;
			repositoryId = site.repository && site.repository.id;
			channelId = site.channel && site.channel.id;

			var tokens = site.channel && site.channel.channelTokens || [];
			for (var i = 0; i < tokens.length; i++) {
				if (tokens[i].name === 'defaultToken') {
					channelToken = tokens[i].token;
					break;
				}
			}
			if (!channelToken && tokens.length > 0) {
				channelToken = tokens[0].value;
			}

			console.log(' - get site');
			console.log('   repository: ' + repositoryId);
			console.log('   channel: ' + channelId);
			console.log('   channelToken: ' + channelToken);
			console.log('   defaultLanguage: ' + site.defaultLanguage);

			return sitesRest.validateSite({
				server: server,
				name: siteName
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			var siteValidation = result;
			console.log('Site Validation:');
			_displaySiteValidation(siteValidation);

			// query channel items
			return serverRest.getChannelItems({
				server: server,
				channelToken: channelToken
			});
		})
		.then(function (result) {
			var items = result || [];
			if (items.length === 0) {
				console.log('Assets Validation:');
				console.log('  no assets');
				return Promise.reject();
			}

			var itemIds = [];
			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				itemIds.push(item.id);
			}

			// validate assets
			return serverRest.validateChannelItems({
				server: server,
				channelId: channelId,
				itemIds: itemIds
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log('Assets Validation:');
			if (result.data && result.data.operations && result.data.operations.validatePublish) {
				var assetsValidation = result.data.operations.validatePublish.validationResults;
				_displayAssetValidation(assetsValidation);
			} else {
				console.log('  no assets');
			}

			done(true);
		})
		.catch((error) => {
			done();
		});
};

/**
 * get site security
 */
module.exports.getSiteSecurity = function (argv, done) {
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

	// console.log('server: ' + server.url);
	var name = argv.name;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var apiResult;
		sitesRest.getSite({
				server: server,
				name: name,
				expand: 'access'
			})
			.then(function (result) {
				apiResult = result;
				if (!result || result.err) {
					return Promise.reject();
				}
				// console.log(result);
				var site = result;

				var accValues = site.security && site.security.access || [];
				var signin = accValues.length === 0 || accValues.includes('everyone') ? 'no' : 'yes';
				console.log(' - secure site:' + (signin === 'yes' ? 'true' : 'false'));

				var format = '   %-50s %-s';
				console.log(sprintf(format, 'Site', name));
				console.log(sprintf(format, 'Require everyone to sign in to access', signin));
				if (signin === 'yes') {
					console.log(sprintf(format, 'Who can access this site when it goes online', ''));
					// console.log(accValues);

					var format2 = '           %-2s  %-s';
					var access = 'Cloud users';
					var checked = accValues.includes('cloud') ? '√' : '';
					console.log(sprintf(format2, checked, access));

					access = 'Visitors';
					checked = accValues.includes('visitors') ? '√' : '';
					console.log(sprintf(format2, checked, access));

					var access = 'Service users';
					var checked = accValues.includes('service') ? '√' : '';
					console.log(sprintf(format2, checked, access));

					var access = 'Specific users';
					var checked = accValues.includes('named') ? '√' : '';
					console.log(sprintf(format2, checked, access));

					if (accValues.indexOf('named') >= 0) {
						var siteUserNames = [];
						if (site.access && site.access.items && site.access.items.length > 0) {
							for (var i = 0; i < site.access.items.length; i++) {
								siteUserNames.push(site.access.items[i].displayName || site.access.items[i].name);
							}
						}
						console.log(sprintf(format, 'Published site viewers', ''));
						console.log(sprintf('           %-s', siteUserNames.length === 0 ? '' : siteUserNames.join(', ')));
					}
				}

				done(true);
			})
			.catch((error) => {
				console.log('ERROR: failed to get site security');
				if (error) {
					console.log(error);
				}
				console.log(apiResult);
				done();
			});
	});
};

/**
 * set site security
 */
module.exports.setSiteSecurity = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		_cmdEnd(done);
		return;
	}

	// console.log('server: ' + server.url);
	var name = argv.name;
	var signin = argv.signin;
	var access = argv.access;
	var addUserNames = argv.addusers ? argv.addusers.split(',') : [];
	var deleteUserNames = argv.deleteusers ? argv.deleteusers.split(',') : [];

	if (signin === 'no') {
		if (access) {
			console.log(' - ignore argument <access>');
		}
		if (addUserNames.length > 0) {
			console.log(' - ignore argument <addusers>');
		}
		if (deleteUserNames.length > 0) {
			console.log(' - ignore argument <deleteusers>');
		}
	} else {
		for (var i = 0; i < deleteUserNames.length; i++) {
			for (var j = 0; j < addUserNames.length; j++) {
				if (deleteUserNames[i].toLowerCase() === addUserNames[j].toLowerCase()) {
					console.log('ERROR: user ' + deleteUserNames[i] + ' in both <addusers> and <deleteusers>');
					_cmdEnd(done);
					return;
				}
			}
		}
	}


	_setSiteSecurityREST(server, name, signin, access, addUserNames, deleteUserNames, done);

};

var _setSiteSecurityREST = function (server, name, signin, access, addUserNames, deleteUserNames, done) {
	try {
		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var siteId;
			var siteSecurity;
			var siteMembers = [];
			var users = [];
			var accessValues = [];

			sitesRest.getSite({
					server: server,
					name: name,
					expand: 'access'
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					// console.log(result);
					var site = result;
					siteId = site.id;
					var siteOnline = site.runtimeStatus === 'online' ? true : false;
					siteSecurity = site.security && site.security.access || [];
					var siteSecured = siteSecurity.includes('everyone') ? false : true;
					console.log(' - get site: runtimeStatus: ' + site.runtimeStatus + ' securityStatus: ' + (siteSecured ? 'secured' : 'public'));

					if (signin === 'no' && !siteSecured) {
						console.log(' - site is already publicly available to anyone');
						return Promise.reject();
					}
					if (siteOnline) {
						console.log('ERROR: site is currently online. In order to change the security setting you must first bring this site offline.');
						return Promise.reject();
					}

					if (site.access && site.access.items && site.access.items.length > 0) {
						for (var i = 0; i < site.access.items.length; i++) {
							siteMembers.push(site.access.items[i].name);
						}
					}

					var usersPromises = [];
					if (signin === 'yes') {
						// console.log(' - add user: ' + addUserNames);
						// console.log(' - delete user: ' + deleteUserNames);
						for (var i = 0; i < addUserNames.length; i++) {
							usersPromises.push(serverRest.getUser({
								server: server,
								name: addUserNames[i]
							}));
						}
						for (var i = 0; i < deleteUserNames.length; i++) {
							usersPromises.push(serverRest.getUser({
								server: server,
								name: deleteUserNames[i]
							}));
						}
					}
					return Promise.all(usersPromises);

				})
				.then(function (results) {
					if (signin === 'yes') {
						if (addUserNames.length > 0 || deleteUserNames.length > 0) {
							var allUsers = [];
							for (var i = 0; i < results.length; i++) {
								if (results[i].items) {
									allUsers = allUsers.concat(results[i].items);
								}
							}

							console.log(' - verify users');
							var err = false;
							// verify users
							for (var k = 0; k < addUserNames.length; k++) {
								var found = false;
								for (var i = 0; i < allUsers.length; i++) {
									if (allUsers[i].loginName.toLowerCase() === addUserNames[k].toLowerCase()) {
										if (!siteMembers.includes(allUsers[i].loginName)) {
											var user = allUsers[i];
											user['action'] = 'add';
											users.push(allUsers[i]);
										}
										found = true;
										break;
									}
									if (found) {
										break;
									}
								}
								if (!found) {
									console.log('ERROR: user ' + addUserNames[k] + ' does not exist');
									err = true;
								}
							}
							for (var k = 0; k < deleteUserNames.length; k++) {
								var found = false;
								for (var i = 0; i < allUsers.length; i++) {
									if (allUsers[i].loginName.toLowerCase() === deleteUserNames[k].toLowerCase()) {
										if (siteMembers.includes(allUsers[i].loginName)) {
											var user = allUsers[i];
											user.action = 'delete';
											users.push(allUsers[i]);
										}
										found = true;
										break;
									}
									if (found) {
										break;
									}
								}
								if (!found) {
									console.log('ERROR: user ' + deleteUserNames[k] + ' does not exist');
									err = true;
								}
							}

							if (err && users.length === 0) {
								return Promise.reject();
							}
						}
					}

					if (!access || access.includes('Cloud users')) {
						accessValues.push('cloud');
						accessValues.push('visitors');
						accessValues.push('service');
						accessValues.push('named');
					} else {
						if (access.includes('Visitors')) {
							accessValues.push('visitors');
						}
						if (access.includes('Service users')) {
							accessValues.push('service');
						}
						if (access.includes('Specific users')) {
							accessValues.push('named');
						}
					}

					return sitesRest.setSiteRuntimeAccess({
						server: server,
						id: siteId,
						accessList: accessValues
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					// console.log(result);

					var removeAccessPromises = [];
					if (accessValues.includes('named')) {
						for (var i = 0; i < users.length; i++) {
							if (users[i].action === 'delete') {
								removeAccessPromises.push(sitesRest.removeSiteAccess({
									server: server,
									id: siteId,
									member: 'user:' + users[i].loginName
								}));
							}
						}
					}
					return Promise.all(removeAccessPromises);
				})
				.then(function (results) {

					var grantAccessPromises = [];
					if (accessValues.includes('named')) {
						for (var i = 0; i < users.length; i++) {
							if (users[i].action === 'add') {
								grantAccessPromises.push(sitesRest.grantSiteAccess({
									server: server,
									id: siteId,
									member: 'user:' + users[i].loginName
								}));
							}
						}
					}

					return Promise.all(grantAccessPromises);

				})
				.then(function (results) {

					if (!accessValues.includes('named') && users.length > 0) {
						console.log(' - add or remove memeber is not allowed when \'Specific users\' is not selected for site');
					}

					// query once more to get the final data
					return sitesRest.getSite({
						server: server,
						id: siteId,
						expand: 'access'
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					var site = result;
					console.log(' - site security settings updated:');
					var format = '   %-50s %-s';
					console.log(sprintf(format, 'Site', name));
					console.log(sprintf(format, 'Require everyone to sign in to access', signin));
					if (signin === 'yes') {
						console.log(sprintf(format, 'Who can access this site when it goes online', ''));
						var accValues = site.security && site.security.access || [];
						// console.log(accValues);

						var format2 = '           %-2s  %-s';
						var access = 'Cloud users';
						var checked = accValues.includes('cloud') ? '√' : '';
						console.log(sprintf(format2, checked, access));

						access = 'Visitors';
						checked = accValues.includes('visitors') ? '√' : '';
						console.log(sprintf(format2, checked, access));

						var access = 'Service users';
						var checked = accValues.includes('service') ? '√' : '';
						console.log(sprintf(format2, checked, access));

						var access = 'Specific users';
						var checked = accValues.includes('named') ? '√' : '';
						console.log(sprintf(format2, checked, access));

						if (accValues.indexOf('named') >= 0) {
							var siteUserNames = [];
							if (site.access && site.access.items && site.access.items.length > 0) {
								for (var i = 0; i < site.access.items.length; i++) {
									siteUserNames.push(site.access.items[i].displayName || site.access.items[i].name);
								}
							}
							console.log(sprintf(format, 'Published site viewers', ''));
							console.log(sprintf('           %-s', siteUserNames.length === 0 ? '' : siteUserNames.join(', ')));
						}
					}

					done(true);
				})
				.catch((error) => {
					done();
				});
		});
	} catch (e) {
		console.log(e);
		done();
	}
};

/**
 * Upload static files to a site
 */
module.exports.uploadStaticSite = function (argv, done) {
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

	var srcPath = argv.path;

	if (!path.isAbsolute(srcPath)) {
		srcPath = path.join(projectDir, srcPath);
	}
	srcPath = path.resolve(srcPath);

	if (!fs.existsSync(srcPath)) {
		console.log('ERROR: folder ' + srcPath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(srcPath).isDirectory()) {
		console.log('ERROR: ' + srcPath + ' is not a folder');
		done();
		return;
	}

	console.log(' - static site folder: ' + srcPath);

	var siteName = argv.site;

	var request = serverUtils.getRequest();

	var siteId;
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		sitesRest.getSite({
				server: server,
				name: siteName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				if (!result.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.log(' - verify site');

				return _prepareStaticSite(srcPath);

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var uploadArgv = {
					path: result.localFolder,
					folder: 'site:' + siteName
				};
				return documentUtils.uploadFolder(uploadArgv, server);
			})
			.then(function (result) {
				console.log(' - static files uploaded');
				done(true);
			})
			.catch((error) => {
				done();
			});

	});
};

var _prepareStaticSite = function (srcPath) {
	return new Promise(function (resolve, reject) {
		serverUtils.paths(srcPath, function (err, paths) {
			if (err) {
				console.log(err);
				return resolve({
					err: 'err'
				});
			} else {
				try {
					if (paths.files.length === 0 && paths.dirs.length === 0) {
						console.log('ERROR: no file nor folder under ' + srcPath);
						return resolve({
							err: 'err'
						});
					}

					var buildDir = serverUtils.getBuildFolder(projectDir);
					if (!fs.existsSync(buildDir)) {
						fs.mkdirSync(buildDir);
					}

					var srcFolderName = srcPath.substring(srcPath.lastIndexOf(path.sep) + 1);
					var staticFolder = path.join(buildDir, 'static');
					fileUtils.remove(staticFolder);

					fs.mkdirSync(staticFolder);

					// get all sub folders including empty ones
					var subdirs = paths.dirs;
					for (var i = 0; i < subdirs.length; i++) {
						var subdir = subdirs[i];
						subdir = subdir.substring(srcPath.length + 1);
						fs.mkdirSync(path.join(staticFolder, subdir), {
							recursive: true
						});
					}

					// get all sub folders including empty ones
					var files = paths.files;

					for (var i = 0; i < files.length; i++) {
						var fileFolder = files[i];
						var fileFolder = fileFolder.substring(srcPath.length + 1);
						fileFolder = fileFolder.substring(0, fileFolder.lastIndexOf(path.sep));

						// create _files folder
						var filesFolder;
						if (serverUtils.endsWith(fileFolder, '_files') || serverUtils.endsWith(fileFolder, '_mobilefiles')) {
							filesFolder = path.join(staticFolder, fileFolder);
						} else {
							filesFolder = path.join(staticFolder, fileFolder, '_files');
						}

						if (!fs.existsSync(filesFolder)) {
							fs.mkdirSync(filesFolder, {
								recursive: true
							});
						}

						var fileName = files[i];
						fileName = fileName.substring(fileName.lastIndexOf(path.sep) + 1);

						// copy file
						fs.copyFileSync(files[i], path.join(filesFolder, fileName));
					}

					return resolve({
						localFolder: staticFolder
					});
				} catch (e) {
					console.log(e);
					return resolve({
						err: 'err'
					});
				}
			}
		});
	});
};

/**
 * Download static files from a site
 */
module.exports.downloadStaticSite = function (argv, done) {
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

	var siteName = argv.site;

	var targetPath;
	var saveToSrc = false;
	if (argv.folder) {
		targetPath = argv.folder;
		if (!path.isAbsolute(targetPath)) {
			targetPath = path.join(projectDir, targetPath);
		}
		targetPath = path.resolve(targetPath);
		if (!fs.existsSync(targetPath)) {
			console.log('ERROR: folder ' + targetPath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(targetPath).isDirectory()) {
			console.log('ERROR: ' + targetPath + ' is not a folder');
			done();
			return;
		}
	} else {
		targetPath = path.join(documentsSrcDir, siteName, 'static');
		saveToSrc = true;
	}
	console.log(' - local folder ' + targetPath);

	var request = serverUtils.getRequest();

	var siteId;
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		sitesRest.getSite({
				server: server,
				name: siteName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				if (!result.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.log(' - verify site');

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: siteId,
					folderPath: 'static'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: site ' + siteName + ' does not have static files');
					return Promise.reject();
				}

				if (saveToSrc) {
					fileUtils.remove(targetPath);

					fs.mkdirSync(targetPath, {
						recursive: true
					});
				}

				var downloadArgv = {
					folder: targetPath,
					path: 'site:' + siteName + '/static'
				};

				return documentUtils.downloadFolder(downloadArgv, server, true, false);

			})
			.then(function (result) {
				return _processDownloadedStaticSite(targetPath);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - static files saved to ' + targetPath);

				done(true);
			})
			.catch((error) => {
				done();
			});

	});
};

var _processDownloadedStaticSite = function (srcPath) {
	return new Promise(function (resolve, reject) {
		serverUtils.paths(srcPath, function (err, paths) {
			if (err) {
				console.log(err);
				return resolve({
					err: 'err'
				});
			} else {
				try {
					if (paths.files.length === 0 && paths.dirs.length === 0) {
						console.log('ERROR: no file nor folder under ' + srcPath);
						return resolve({
							err: 'err'
						});
					}

					var files = paths.files;
					for (var i = 0; i < files.length; i++) {
						var filePath = files[i];
						var fileFolder = filePath.substring(0, filePath.lastIndexOf(path.sep));
						var fileName = filePath.substring(filePath.lastIndexOf(path.sep) + 1);

						// remove _files folder
						if (serverUtils.endsWith(fileFolder, '_files')) {
							var parentFolder = fileFolder.substring(0, fileFolder.length - 6);
							// console.log('move: ' + files[i] + ' =====> ' + parentFolder);
							fse.moveSync(filePath, path.join(parentFolder, fileName));
						}
					}

					var subdirs = paths.dirs;
					for (var i = 0; i < subdirs.length; i++) {
						var subdir = subdirs[i];
						if (serverUtils.endsWith(subdir, '_files')) {
							fileUtils.remove(subdir);
							// console.log('remove ' + subdir);
						}
					}

					return resolve({});
				} catch (e) {
					console.log(e);
					return resolve({
						err: 'err'
					});
				}
			}
		});
	});
};

/**
 * Delete static files from a site
 */
module.exports.deleteStaticSite = function (argv, done) {
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

	var siteName = argv.site;

	var request = serverUtils.getRequest();

	var siteId;
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}


		sitesRest.getSite({
				server: server,
				name: siteName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				if (!result.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.log(' - verify site');

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: siteId,
					folderPath: 'static'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.log('ERROR: site ' + siteName + ' does not have static files');
					return Promise.reject();
				}

				var deleteArgv = {
					path: 'site:' + siteName + '/static'
				};

				return documentUtils.deleteFolder(deleteArgv, server);

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - static files deleted');

				done(true);
			})
			.catch((error) => {
				done();
			});

	});
};

/**
 * Delete static files from a site
 */
module.exports.refreshPrerenderCache = function (argv, done) {
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

	var siteName = argv.site;

	var request = serverUtils.getRequest();

	var siteId;
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverUtils.getTenantConfig(server)
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var isSitesPrerenderEnabled = result.IsSitesPrerenderEnabled ? result.IsSitesPrerenderEnabled.toLowerCase() === 'true' : false;
				// console.log(' - isSitesPrerenderEnabled: ' + isSitesPrerenderEnabled);
				if (!isSitesPrerenderEnabled) {
					console.log('ERROR: Pre-render is not enabled');
					return Promise.reject();
				}

				return sitesRest.getSite({
						server: server,
						name: siteName
					})
					.then(function (result) {
						if (!result || result.err) {
							return Promise.reject();
						}
						if (!result.id) {
							console.log('ERROR: site ' + siteName + ' does not exist');
							return Promise.reject();
						}
						siteId = result.id;
						console.log(' - verify site');

						return sitesRest.refreshSiteContent({
							server: server,
							id: siteId,
							name: siteName
						});
					})
					.then(function (result) {
						if (!result || result.err) {
							return Promise.reject();
						}

						console.log(' - refresh pre-render cache finished');

						done(true);
					})
					.catch((error) => {
						done();
					});
			});

	});
};

var _importTemplateSCS = function (server, localhost, request, idcToken, name) {
	return new Promise(function (resolve, reject) {
		url = localhost + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
		request.post(url, function (err, response, body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || data.err || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log(' - failed to import ' + (data && data.LocalData ? ('- ' + data.LocalData.StatusMessage) : err));
				return resolve({
					err: 'err'
				});
			}
			if (data.LocalData.ImportConflicts) {
				var conflict = data.ResultSets.ImportConflictsResultSet;
				console.log(' - failed to import: ImportConflicts');
				// console.log(conflict);
				if (data.ResultSets.ImportConflictsResultSet) {
					var conflictIdx, nameIdx, ownerIdx, resolutionIdx;
					var fields = data.ResultSets.ImportConflictsResultSet.fields || [];
					var rows = data.ResultSets.ImportConflictsResultSet.rows;
					for (var i = 0; i < fields.length; i++) {
						if (fields[i].name === 'conflict') {
							conflictIdx = i;
						} else if (fields[i].name === 'name') {
							nameIdx = i;
						} else if (fields[i].name === 'fCreatorLoginName') {
							ownerIdx = i;
						} else if (fields[i].name === 'resolution') {
							resolutionIdx = i;
						}
					}

					for (var i = 0; i < rows.length; i++) {
						var msg = rows[i][conflictIdx] + ': ' + rows[i][nameIdx] + ' owned by ' + rows[i][ownerIdx] + ' ' + rows[i][resolutionIdx];
						console.log('   ' + msg);
					}
				}
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;
			console.log(' - importing template (JobID: ' + jobId + ')');
			var importTempStatusPromise = serverUtils.getTemplateImportStatus(server, request, localhost, jobId);
			importTempStatusPromise.then(function (data) {
				var success = false;
				if (data && data.LocalData) {
					if (data.LocalData.StatusCode !== '0') {
						console.log(' - failed to import ' + name + ': ' + data.LocalData.StatusMessage);
						return resolve({
							err: 'err'
						});
					} else if (data.LocalData.ImportConflicts) {
						// console.log(data.LocalData);
						console.log(' - failed to import ' + name + ': the template already exists and you do not have privilege to override it');
						return resolve({
							err: 'err'
						});
					} else if (data.JobInfo && data.JobInfo.JobStatus && data.JobInfo.JobStatus === 'FAILED') {
						console.log(' - failed to import: ' + data.JobInfo.JobMessage);
						return resolve({
							err: 'err'
						});
					} else {
						serverUtils.getBackgroundServiceJobData(server, request, idcToken, jobId)
							.then(function (data) {
								var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
								var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows || [];
								var siteInfo = {};
								if (rows.length > 0) {
									for (var i = 0; i < fields.length; i++) {
										var attr = fields[i].name;
										siteInfo[attr] = rows[0][i];
									}
								}
								// console.log(siteInfo);
								console.log(' - template ' + (siteInfo && siteInfo.fFolderName || name) + ' imported');
								return resolve({
									siteInfo: siteInfo
								});
							});
					}
				} else {
					console.log(' - failed to import ' + name);
					return resolve({
						err: 'err'
					});
				}
			});
		});
	});
};

var _migrateICGUID = function (templateName) {
	return new Promise(function (resolve, reject) {
		var tempSrc = path.join(templatesSrcDir, templateName);
		var digitalAssetPath = path.join(tempSrc, 'assets', 'contenttemplate',
			'Content Template of ' + templateName, 'ContentItems', 'DigitalAsset');
		if (!fs.existsSync(digitalAssetPath)) {
			console.log(' - template does not have digital assets');
			return resolve({});
		}

		var jsonFiles = fs.readdirSync(digitalAssetPath);
		if (!jsonFiles || jsonFiles.length === 0) {
			console.log(' - template does not have digital assets');
			return resolve({});
		}

		console.log(' - processing template digital assets');

		var idMap = new Map();

		jsonFiles.forEach(function (file) {
			var filePath = path.join(digitalAssetPath, file);
			var stat = fs.statSync(filePath);
			if (stat.isFile() && file.startsWith('DigitalAsset_proxy_') && file.endsWith('.json')) {
				var id = file.substring(0, file.indexOf('.'));
				var newId = id.replace('DigitalAsset_proxy_', '');
				newId = serverUtils.replaceAll(newId, '-', '');
				newId = 'CONT' + newId.toUpperCase();
				// console.log(' - id: ' + id + ' => ' + newId);

				idMap.set(id, newId);

				// rename the json file
				var newFile = newId + '.json';
				var newFilePath = path.join(digitalAssetPath, newFile);
				fs.renameSync(filePath, newFilePath);
				console.log('   rename file ' + file + ' => ' + newFile);
			}
		});

		if (idMap.size === 0) {
			return resolve({});
		}

		// console.log(idMap);

		// rename the folder name
		var files = fs.readdirSync(path.join(digitalAssetPath, 'files'));
		files.forEach(function (folder) {
			var folderPath = path.join(digitalAssetPath, 'files', folder);
			var stat = fs.statSync(folderPath);
			if (stat.isDirectory() && folder.startsWith('DigitalAsset_proxy_')) {
				var newFolder = idMap.get(folder);
				if (newFolder) {
					fse.moveSync(folderPath, path.join(digitalAssetPath, 'files', newFolder));
					console.log(' - rename folder ' + folder + ' => ' + newFolder);
				}
			}
		});

		// update all site pages
		var pagesPath = path.join(tempSrc, 'pages');
		var pageFiles = fs.readdirSync(pagesPath);
		if (!pageFiles || pageFiles.length === 0) {
			console.log(' - template does not have pages');
		} else {
			pageFiles.forEach(function (file) {
				var filePath = path.join(pagesPath, file);
				var stat = fs.statSync(filePath);
				if (stat.isFile() && file.endsWith('.json')) {
					var fileSrc = fs.readFileSync(filePath).toString();
					var newFileSrc = fileSrc;
					for (const [id, newId] of idMap.entries()) {
						newFileSrc = serverUtils.replaceAll(newFileSrc, id, newId);
					}

					if (fileSrc !== newFileSrc) {
						fs.writeFileSync(filePath, newFileSrc);
						console.log(' - update ' + filePath.replace((projectDir + path.sep), '') + ' with new IDs');
					}
				}
			});
		}

		// update all json files under content assets
		var contenttemplatePath = path.join(tempSrc, 'assets', 'contenttemplate');
		serverUtils.paths(contenttemplatePath, function (err, paths) {
			if (err) {
				console.log(err);
			} else {
				var files = paths.files;
				for (var i = 0; i < files.length; i++) {
					var filePath = files[i];
					if (filePath.endsWith('.json')) {
						var fileSrc = fs.readFileSync(filePath).toString();
						var newFileSrc = fileSrc;
						for (const [id, newId] of idMap.entries()) {
							newFileSrc = serverUtils.replaceAll(newFileSrc, id, newId);
						}

						if (fileSrc !== newFileSrc) {
							fs.writeFileSync(filePath, newFileSrc);
							console.log(' - update ' + filePath.replace((projectDir + path.sep), '') + ' with new IDs');
						}
					}
				}
			}
			return resolve({});
		});

	});
};

/**
 * create non-MLS enterprise site
 */
module.exports.migrateSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server;
	if (serverName) {
		server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}
		if (server.env !== 'pod_ic') {
			console.log('ERROR: server ' + server.url + ' is not a valid source to migrate site');
			done();
			return;
		}
	}

	var destServerName = argv.destination;
	var destServer = serverUtils.verifyServer(destServerName, projectDir);
	if (!destServer || !destServer.valid) {
		done();
		return;
	}
	if (destServer.env === 'pod_ic') {
		console.log('ERROR: server ' + destServer.url + ' is not a valid destination to migrate site');
		done();
		return;
	}

	var tempPath = argv.template;
	if (tempPath) {
		if (!path.isAbsolute(tempPath)) {
			tempPath = path.join(projectDir, tempPath);
		}
		tempPath = path.resolve(tempPath);

		if (!fs.existsSync(tempPath)) {
			console.log('ERROR: file ' + tempPath + ' does not exist');
			done();
			return;
		}
		if (fs.statSync(tempPath).isDirectory()) {
			console.log('ERROR: ' + tempPath + ' is not a file');
			done();
			return;
		}
	}

	var srcSiteName = argv.site;
	var templateName = srcSiteName + serverUtils.createGUID();
	templateName = templateName.substring(0, 40);
	var repositoryName = argv.repository;
	var siteName = argv.name || srcSiteName;
	var description = argv.description;
	var sitePrefix = argv.sitePrefix || siteName.toLowerCase();
	sitePrefix = sitePrefix.substring(0, 15);

	var request = serverUtils.getRequest();

	var folderId = 'self';
	var repositoryId;
	var fileName, fileId;
	var cecVersion;

	var loginPromise = serverUtils.loginToServer(destServer, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server ' + destServer.url);
			done();
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var idcToken;

		var auth = serverUtils.getRequestAuth(destServer);

		var template, templateGUID;

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = destServer.url + req.url;

				var options = {
					url: url,
					auth: auth
				};

				if (server.cookies) {
					options.headers = {
						Cookie: server.cookies
					};
				}

				request(options).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						console.log('ERROR: GET request failed: ' + req.url);
						console.log(err);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res);

			} else {
				console.log('ERROR: GET request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);

			if (req.url.indexOf('SCS_IMPORT_TEMPLATE_PACKAGE') > 0) {
				var importUrl = destServer.url + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
				var data = {
					'item': 'fFileGUID:' + fileId,
					'idcToken': idcToken,
					'useBackgroundThread': true,
					'ThemeConflictResolution': 'overwrite',
					'TemplateConflictResolution': 'overwrite',
					'DefaultComponentConflictResolution': true,
					'allowCrossTenant': true
				};
				var postData = {
					method: 'POST',
					url: importUrl,
					'auth': auth,
					'form': data
				};
				if (server.cookies) {
					postData.headers = {
						Cookie: server.cookies
					};
				}
				// console.log(postData);
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - template import finished');
						res.end();
					});
			} else if (req.url.indexOf('SCS_COPY_SITES') > 0) {
				var url = destServer.url + req.url;
				var repositoryPrefix = 'arCaaSGUID';
				var formData = {
					'idcToken': idcToken,
					'names': siteName,
					'descriptions': description,
					'items': 'fFolderGUID:' + templateGUID,
					'isEnterprise': '1',
					'repository': repositoryPrefix + ':' + repositoryId,
					'slugPrefix': sitePrefix,
					'useBackgroundThread': 1,
					'doPreserveCaaSGUID': 1
				};

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					formData: formData
				};
				if (server.cookies) {
					postData.headers = {
						Cookie: server.cookies
					};
				}
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						console.log('ERROR: Failed to ' + action + ' site');
						console.log(error);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res)
					.on('finish', function (err) {
						res.end();
					});

			} else {
				console.log('ERROR: POST request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});

		localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;
			localServer.setTimeout(0);

			// verify site
			sitesRest.resourceExist({
					server: destServer,
					type: 'sites',
					name: siteName
				})
				.then(function (result) {
					if (result && result.id) {
						console.log('ERROR: site ' + siteName + ' already exists');
						return Promise.reject();
					}

					// verify repository
					return serverRest.getRepositoryWithName({
						server: destServer,
						name: repositoryName
					});
				})
				.then(function (result) {
					if (!result || result.err || !result.data) {
						console.log('ERROR: repository ' + repositoryName + ' does not exist');
						return Promise.reject();
					}

					repositoryId = result.data && result.data.id;
					console.log(' - verify repository (Id: ' + repositoryId + ')');

					var createTemplatePromises = [];
					if (!tempPath) {
						var createTemplateArgv = {
							projectDir: projectDir,
							server: server,
							name: templateName,
							siteName: srcSiteName,
							includeUnpublishedAssets: true
						};

						// create template on the source server and download
						createTemplatePromises.push(templateUtils.createTemplateFromSiteAndDownloadSCS(createTemplateArgv));
					}

					return Promise.all(createTemplatePromises);
				})
				.then(function (results) {
					if (!tempPath) {
						if (!results || !results[0] || results[0].err) {
							return Promise.reject();
						}
					}

					var templatePath;
					if (tempPath) {
						fileName = tempPath.substring(tempPath.lastIndexOf(path.sep) + 1);
						templateName = fileName.substring(0, fileName.indexOf('.'));
						templatePath = tempPath;
						console.log(' - template file ' + templatePath + ' name ' + templateName);
					} else {
						fileName = templateName + '.zip';
						var destdir = path.join(projectDir, 'dist');
						if (!fs.existsSync(destdir)) {
							fs.mkdirSync(destdir);
						}
						templatePath = path.join(destdir, fileName);
						if (!fs.existsSync(templatePath)) {
							console.log('ERROR: failed to download template ' + templateName);
							return Promise.reject();
						}
					}

					return templateUtils.unzipTemplateUtil(argv, templateName, templatePath, false);

				})
				.then(function (result) {

					// process template
					return _migrateICGUID(templateName);

				})
				.then(function (result) {

					// create template package again
					return templateUtils.zipTemplate(argv, templateName);

				})
				.then(function (result) {
					if (!result || !result.zipfile) {
						return Promise.reject();
					}
					var templatePath = result.zipfile;
					console.log(' - template file: ' + templatePath);

					// upload template file
					return serverRest.createFile({
						server: destServer,
						parentID: folderId,
						filename: fileName,
						contents: fs.createReadStream(templatePath)
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					fileId = result.id;
					console.log(' - file ' + fileName + ' uploaded to Home folder (Id: ' + result.id + ' version:' + result.version + ')');

					return serverUtils.getIdcToken(destServer);
				})
				.then(function (result) {
					idcToken = result && result.idcToken;
					if (!idcToken) {
						console.log('ERROR: failed to get idcToken');
						return Promise.reject();
					}
					// console.log(' - get idcToken: ' + idcToken);

					return _importTemplateSCS(destServer, localhost, request, idcToken, templateName);
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					// the template zip name may be different from the real template name
					// take the name from import template result
					if (result.siteInfo && result.siteInfo.fFolderName) {
						templateName = result.siteInfo.fFolderName;
					}
					return sitesRest.getTemplate({
						server: destServer,
						name: templateName
					});

				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					templateGUID = result.id;

					return serverUtils.getIdcToken(destServer);
				})
				.then(function (result) {
					// re-fetch token
					if (result && result.idcToken) {
						idcToken = result && result.idcToken;
					}
					return _postOneIdcService(request, localhost, destServer, 'SCS_COPY_SITES', 'create site', idcToken);
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					// delete template file
					return serverRest.deleteFile({
						server: destServer,
						fFileGUID: fileId
					});

				})
				.then(function (result) {
					// delete template
					return sitesRest.deleteTemplate({
						server: destServer,
						name: templateName,
						hard: true,
						showError: false
					});
				})
				.then(function (result) {
					console.log(' - site ' + siteName + ' created on ' + destServer.url);
					_cmdEnd(done, true);
				})
				.catch((error) => {
					if (error) {
						console.log(error);
					}
					_cmdEnd(done);
				});
		});
	});
};


//////////////////////////////////////////////////////////////////////////
//    Sync server event handlers
//////////////////////////////////////////////////////////////////////////

module.exports.syncControlSiteSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcServer = argv.server;
	console.log(' - source server: ' + srcServer.url);

	var destServer = argv.destination;
	console.log(' - destination server: ' + destServer.url);

	var siteId = argv.id;
	var siteName = argv.name;
	var action = argv.action || 'publish';

	var siteName;

	var request = serverUtils.getRequest();

	serverUtils.loginToServer(srcServer, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		// verify the site
		sitesRest.getSite({
				server: destServer,
				name: siteName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				_controlSiteREST(request, destServer, action, siteName)
					.then(function (result) {
						if (result.err) {
							done();
						} else {
							done(true);
						}
					});
			})
			.catch((error) => {
				done();
			});
	});

};