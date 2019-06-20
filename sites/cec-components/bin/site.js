/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var fs = require('fs'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	serverRest = require('../test/server/serverRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var projectDir,
	serversSrcDir;

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
}

var _cmdEnd = function (done, localServer) {
	done();
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
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			_cmdEnd(done);
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
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

	_createSiteSCS(request, server, name, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, done);

	/** wait till sites management API released
	 * 
	var template, repositoryId, tempLocalizationPolicy;

	var format = '   %-20s %-s';

	var tokenPromises = [];
	if (server.env === 'pod_ec') {
		tokenPromises.push(serverUtils.getOAuthTokenFromIDCS(request, server));
	}
	Promise.all(tokenPromises).then(function (result) {
		if (result.length > 0 && result[0].err) {
			_cmdEnd(done);
		}

		// save the OAuth token
		if (result.length > 0) {
			server.oauthtoken = result[0].oauthtoken;
		}

		//
		// validate the site name
		//
		var getSitePromise = serverUtils.getSiteFromServer(request, server, name);
		getSitePromise.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
				}

				if (result && result.data && result.data.id) {
					console.log('ERROR: site ' + name + ' already exists');
					_cmdEnd(done);
				}

				return serverUtils.getTemplateFromServer(request, server, templateName);
			})
			.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
				}

				template = result.data;

				if (!template || !template.id) {
					console.log('ERROR: template ' + templateName + ' does not exist');
					_cmdEnd(done);
				}

				console.log(' - get template');
				tempLocalizationPolicy = template.localizationPolicy;

				if (template.isEnterprise && !repositoryName) {
					console.log('ERROR: repository is required to create enterprise site');
					_cmdEnd(done);
				}
				var createEnterprise = repositoryName ? true : false;

				if (createEnterprise && (!tempLocalizationPolicy || !tempLocalizationPolicy.id) && !localizationPolicyName) {
					console.log('ERROR: localization policy is required to create enterprise site');
					_cmdEnd(done);
				}
				// Remove this condition when defaultLanguage returned from API /templates 
				if (createEnterprise && !defaultLanguage) {
					console.log('ERROR: default language is required to create enterprise site');
					_cmdEnd(done);
				}

				if (!createEnterprise) {
					console.log(' - creating standard site ...');
					console.log(sprintf(format, 'name', name));
					console.log(sprintf(format, 'template', templateName));
					var sitePromise = _createSite(request, server, template.id, false, name, description, sitePrefix);
					sitePromise.then(function (result) {
						_cmdEnd(done);
					});
				} else {
					var repositoryPromise = serverUtils.getRepositoryFromServer(request, server, repositoryName);
					repositoryPromise.then(function (result) {
							//
							// validate repository
							//
							if (!result || result.err) {
								_cmdEnd(done);
							}

							var repository = result.data;
							if (!repository || !repository.id) {
								console.log('ERROR: repository ' + repositoryName + ' does not exist');
								_cmdEnd(done);
							}
							repositoryId = repository.id;
							console.log(' - get repository');

							var policyPromises = [];
							if (localizationPolicyName) {
								policyPromises.push(serverUtils.getLocalizationPolicyFromServer(request, server, localizationPolicyName));
							}
							return Promise.all(policyPromises);
						})
						.then(function (results) {
							//
							// validate localization policy
							//
							var localizationPolicy;
							if (localizationPolicyName) {
								var result = results.length > 0 ? results[0] : undefined;
								if (!result || result.err) {
									_cmdEnd(done);
								}

								var policy = result.data;
								if (!policy || !policy.id) {
									console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
									_cmdEnd(done);
								}

								localizationPolicy = policy;
								console.log(' - get localization policy');
							} else {
								if (!tempLocalizationPolicy || !tempLocalizationPolicy.id) {
									console.log('ERROR: no localization policy is found in template');
									_cmdEnd(done);
								}
								console.log(' - use localization policy ' + tempLocalizationPolicy.name);
								localizationPolicy = tempLocalizationPolicy;
							}

							//
							// validate default language
							//

							var requiredLanguages = localizationPolicy.requiredValues;
							if (!requiredLanguages.includes(defaultLanguage)) {
								console.log('ERROR: language ' + defaultLanguage + ' is not in localization policy ' + localizationPolicy.name);
								_cmdEnd(done);
							}

							//
							// create enterprise site
							//
							console.log(' - creating enterprise site ...');
							console.log(sprintf(format, 'name', name));
							console.log(sprintf(format, 'template', templateName));
							console.log(sprintf(format, 'site prefix', sitePrefix));
							console.log(sprintf(format, 'respository', repositoryName));
							console.log(sprintf(format, 'localization policy', localizationPolicy.name));
							console.log(sprintf(format, 'default language', defaultLanguage));
							var sitePromise = _createSite(request, server, template.id, true, name, description, sitePrefix,
								repositoryId, localizationPolicy.id, defaultLanguage);
							sitePromise.then(function (result) {
								_cmdEnd(done);
							});

						});

				} // enterprise site

			}); // get template

	}); // get token 
	*/
}

var _createSite = function (request, server, templateId, isEnterprise, name, description, sitePrefix, repositoryId, localizationPolicyId, defaultLanguage) {
	var createPromise = new Promise(function (resolve, reject) {
		var auth = {
			user: server.username,
			password: server.password
		};

		var url = server.url + '/sites/management/api/v1/sites';

		var formData = {
			template: templateId,
			name: name
		}
		if (description) {
			formData.description = description;
		}
		if (isEnterprise) {
			if (sitePrefix) {
				formData.sitePrefix = sitePrefix;
			}
			formData.repository = repositoryId;
			formData.localizationPolicy = localizationPolicyId;
			formData.defaultLanguage = defaultLanguage;
		}
		// console.log(formData);
		var headers = {
			'Content-Type': 'application/json',
			'prefer': 'respond-async'
		};
		var options = {
			method: 'POST',
			url: url,
			headers: headers,
			body: JSON.stringify(formData)
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
				console.log('ERROR: failed to create site ' + err);
				resolve({
					err: 'err'
				});
			}

			if (response.statusCode === 202) {
				var statusUrl = response.headers && response.headers.location || '';

				// wait request to finish
				var inter = setInterval(function () {
					var statusPromise = _getSiteRequestStatus(request, server, statusUrl);
					statusPromise.then(function (data) {
						if (!data || data.progress === 'failed') {
							clearInterval(inter);
							console.log('ERROR: ' + data.error.detail);
							resolve({
								err: 'err'
							});
						}
						if (data.completed && data.progress === 'succeeded') {
							console.log(' - site created');
							resolve({});
						} else {
							console.log(' - creating, percentage ' + data.completedPercentage);
						}
					});
				}, 5000);

			} else {
				var data;
				try {
					data = JSON.parse(body);
				} catch (error) {};

				var msg = data ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to create site ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return createPromise;
};

var _getSiteRequestStatus = function (request, server, statusUrl) {
	var statusPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var options = {
			url: statusUrl
		};
		if (server.env === 'pod_ec') {
			options.headers = {
				Authorization: server.oauthtoken
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get status:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: failed to get status: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return statusPromise;
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
var _createSiteSCS = function (request, server, siteName, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, done) {
	var isPod = server.env === 'pod_ec';
	try {
		var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
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

			var auth = isPod ? {
				bearer: server.oauthtoken
			} : {
				user: server.username,
				password: server.password
			};

			var template, templateGUID;
			var repositoryId, localizationPolicyId;
			var createEnterprise;

			var format = '   %-20s %-s';

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options['auth'] = auth;

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

				var formData = createEnterprise ? {
					'idcToken': idcToken,
					'names': siteName,
					'descriptions': description,
					'items': 'fFolderGUID:' + templateGUID,
					'isEnterprise': '1',
					'repository': 'fFolderGUID:' + repositoryId,
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

			var localServer = app.listen(0, function () {
				port = localServer.address().port;
				localhost = 'http://localhost:' + port;

				var inter = setInterval(function () {
					// console.log(' - getting login user: ' + total);
					var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

					request.get(url, function (err, response, body) {
						var data = JSON.parse(body);
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
									return serverUtils.browseSitesOnServer(request, server, 'framework.site.template');

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
												_cmdEnd(done, localServer);
											} else {
												console.log(' - site created');
												_cmdEnd(done, localServer);
											}
										});

									} else {
										var repositoryPromise = serverUtils.getRepositoryFromServer(request, server, repositoryName);
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
												console.log(sprintf(format, 'respository', repositoryName));
												console.log(sprintf(format, 'localization policy', policy.name));
												console.log(sprintf(format, 'default language', defaultLanguage));

												var actionPromise = _postOneIdcService(request, localhost, server, 'SCS_COPY_SITES', 'create site', idcToken);
												actionPromise.then(function (result) {
													if (result.err) {
														_cmdEnd(done, localServer);
													} else {
														console.log(' - site created');
														_cmdEnd(done, localServer);
													}
												});

											})
											.catch((error) => {
												_cmdEnd(done, localServer);
											});

									} // enterprise site
								})
								.catch((error) => {
									_cmdEnd(done, localServer);
								});
						}
					}); // idc token
				}, 1000);
			}); // local
		});
	} catch (e) {
		console.log(e);
		_cmdEnd(done);
	}
};


/**
 * create site
 */
module.exports.controlSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {

		var serverName = argv.server;
		if (serverName) {
			var serverpath = path.join(serversSrcDir, serverName, 'server.json');
			if (!fs.existsSync(serverpath)) {
				console.log('ERROR: server ' + serverName + ' does not exist');
				_cmdEnd(done);
				return;
			}
		}

		var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
		if (!serverName) {
			console.log(' - configuration file: ' + server.fileloc);
		}
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured in ' + server.fileloc);
			_cmdEnd(done);
			return;
		}
		// console.log('server: ' + server.url);

		var action = argv.action;
		var siteName = argv.site;

		var request = serverUtils.getRequest();

		var site;

		_controlSiteSCS(request, server, action, siteName, done);

		/** wait sites management API to be released
		
		var tokenPromises = [];
		if (server.env === 'pod_ec') {
			tokenPromises.push(serverUtils.getOAuthTokenFromIDCS(request, server));
		}

		Promise.all(tokenPromises).then(function (result) {
			if (result.length > 0 && result[0].err) {
				_cmdEnd(done);
			}

			// save the OAuth token
			if (result.length > 0) {
				server.oauthtoken = result[0].oauthtoken;
			}

			//
			// validate the site name
			//
			var getSitePromise = serverUtils.getSiteFromServer(request, server, siteName);
			getSitePromise.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
				}

				if (!result || !result.data || !result.data.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					_cmdEnd(done);
				}
				site = result.data;

				var runtimeStatus = site.runtimeStatus;
				var publishStatus = site.publishStatus;
				console.log(' - get site: runtimeStatus: ' + runtimeStatus + '  publishStatus: ' + publishStatus);

				if (action === 'take-offline' && runtimeStatus === 'offline') {
					console.log(' - site is already offline');
					_cmdEnd(done);
				}
				if (action === 'bring-online' && runtimeStatus === 'online') {
					console.log(' - site is already online');
					_cmdEnd(done);
				}
				if (action === 'bring-online' && publishStatus === 'unpublished') {
					console.log('ERROR: site ' + siteName + ' is draft, publish it first');
					_cmdEnd(done);
				}

				if (action === 'unpublish' && runtimeStatus === 'online') {
					console.log('ERROR: site ' + siteName + ' is online, take it offline first');
					_cmdEnd(done);
				}
				if (action === 'unpublish' && publishStatus === 'unpublished') {
					console.log('ERROR: site ' + siteName + ' is draft');
					_cmdEnd(done);
				}

				if (action === 'publish' || action === 'unpublish') {
					var controlPromise = _IdcControlSite(request, server, action, site.id);
					controlPromise.then(function (result) {
						if (result.err) {
							_cmdEnd(done);
						}

						console.log(' - ' + action + ' ' + siteName + ' finished');
						_cmdEnd(done);
					});
				} else {
					var controlPromise = _setSiteRuntimeStatus(request, server, action, site.id);
					controlPromise.then(function (result) {
						if (result.err) {
							_cmdEnd(done);
						}

						if (action === 'bring-online') {
							console.log(' - site ' + siteName + ' is online now');
						} else {
							console.log(' - site ' + siteName + ' is offline now');
						}
						_cmdEnd(done);
					});
				}
			});
		});
		*/

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
				} catch (error) {};

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
 * Use Idc service to publish / unpublish a site
 */
var _IdcControlSite = function (request, server, action, siteId) {
	var controlPromise = new Promise(function (resolve, reject) {
		var isPod = server.env === 'pod_ec';

		var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
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

			var auth = isPod ? {
				bearer: server.oauthtoken
			} : {
				user: server.username,
				password: server.password
			};

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options['auth'] = auth;

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
				if (req.url.indexOf('SCS_PUBLISH_SITE') > 0 || req.url.indexOf('SCS_UNPUBLISH_SITE') > 0) {
					var url = server.url + '/documents/web?IdcService=' + (req.url.indexOf('SCS_PUBLISH_SITE') > 0 ? 'SCS_PUBLISH_SITE' : 'SCS_UNPUBLISH_SITE');
					var formData = {
						'idcToken': idcToken,
						'item': 'fFolderGUID:' + siteId
					};

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

			var localServer = app.listen(0, function () {
				port = localServer.address().port;
				localhost = 'http://localhost:' + port;

				var inter = setInterval(function () {
					// console.log(' - getting login user: ' + total);
					var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

					request.get(url, function (err, response, body) {
						var data = JSON.parse(body);
						dUser = data && data.LocalData && data.LocalData.dUser;
						idcToken = data && data.LocalData && data.LocalData.idcToken;
						if (dUser && dUser !== 'anonymous' && idcToken) {
							// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
							clearInterval(inter);
							console.log(' - establish user session');

							url = localhost + '/documents/web?IdcService=' + (action === 'publish' ? 'SCS_PUBLISH_SITE' : 'SCS_UNPUBLISH_SITE');

							request.post(url, function (err, response, body) {
								if (err) {
									console.log('ERROR: Failed to ' + action + ' site');
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
									console.log('ERROR: failed to ' + action + ' site ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
									return resolve({
										err: 'err'
									});
								}

								if (action === 'unpublish') {
									return resolve({});
								} else {
									var jobId = data.LocalData.JobID;

									// wait create to finish
									var inter = setInterval(function () {
										var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
										jobPromise.then(function (data) {
											if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
												clearInterval(inter);
												console.log(data);
												// try to get error message
												console.log('ERROR: ' + action + ' site failed: ' + (data && data.JobMessage));
												return resolve({
													err: 'err'
												});

											}
											if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
												clearInterval(inter);

												return resolve({});

											} else {
												console.log(' - ' + action + 'ing: percentage ' + data.JobPercentage);
											}
										});
									}, 5000);
								}
							}); // publish / unpublish
						}
					}); // idc token request

				}, 6000);
			}); // local 
		}); // login
	});
	return controlPromise;
};

/**
 * Use Idc service to control a site
 */
var _controlSiteSCS = function (request, server, action, siteName, done) {

	var isPod = server.env === 'pod_ec';

	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
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

		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var siteId;

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
				};

				options['auth'] = auth;

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
				formData['isSitePublishV2'] = 1;
			}

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

		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data = JSON.parse(body);
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
										_cmdEnd(done, localServer);
										return;
									}

									if (action === 'bring-online') {
										console.log(' - site ' + siteName + ' is online now');
									} else if (action === 'take-offline') {
										console.log(' - site ' + siteName + ' is offline now');
									} else {
										console.log(' - ' + action + ' ' + siteName + ' finished');
									}
									_cmdEnd(done, localServer);
								});
							})
							.catch((error) => {
								_cmdEnd(done, localServer);
							});
					}
				}); // idc token request

			}, 1000);
		}); // local 
	}); // login
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
				console.log('ERROR: failed to ' + action + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;

			if (jobId) {
				console.log(' - submit ' + action);
				// wait action to finish
				var inter = setInterval(function () {
					var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
					jobPromise.then(function (data) {
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							console.log(data);
							// try to get error message
							console.log('ERROR: ' + action + ' failed: ' + (data && data.JobMessage));
							return resolve({
								err: 'err'
							});

						}
						if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);

							return resolve({});

						} else {
							console.log(' - ' + action + ' in process: percentage ' + data.JobPercentage);
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
			} catch (e) {};

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
 * validate site
 */
module.exports.validateSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {

		var serverName = argv.server;
		if (serverName) {
			var serverpath = path.join(serversSrcDir, serverName, 'server.json');
			if (!fs.existsSync(serverpath)) {
				console.log('ERROR: server ' + serverName + ' does not exist');
				_cmdEnd(done);
				return;
			}
		}

		var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
		if (!serverName) {
			console.log(' - configuration file: ' + server.fileloc);
		}
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured in ' + server.fileloc);
			_cmdEnd(done);
			return;
		}

		var siteName = argv.name;

		var request = serverUtils.getRequest();

		var isPod = server.env === 'pod_ec';

		var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
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

			var auth = isPod ? {
				bearer: server.oauthtoken
			} : {
				user: server.username,
				password: server.password
			};

			var siteId;
			var repositoryId, channelId, channelToken;

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options['auth'] = auth;

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

			var localServer = app.listen(0, function () {
				port = localServer.address().port;
				localhost = 'http://localhost:' + port;

				var inter = setInterval(function () {
					// console.log(' - getting login user: ' + total);
					var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

					request.get(url, function (err, response, body) {
						var data = JSON.parse(body);
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
									if (!site || !site.fFolderGUID) {
										console.log('ERROR: site ' + siteName + ' does not exist');
										return Promise.reject();
									}

									if (site.isEnterprise !== '1') {
										console.log(' - site ' + siteName + ' is not an enterprise site');
										return Promise.reject();
									}

									siteId = site.fFolderGUID;

									// get other site info
									return _getOneIdcService(request, localhost, server, 'SCS_GET_SITE_INFO_FILE', 'siteId=' + siteName + '&IsJson=1');
								})
								.then(function (result) {
									if (result.err) {
										return Promise.reject();
									}

									var site = result.base ? result.base.properties : undefined;
									if (!site || !site.siteName) {
										console.log('ERROR: failed to get site info');
										return Promise.reject();
									}

									if (!site.defaultLanguage) {
										console.log(' - site ' + siteName + ' is not configured with a default language')
										return Promise.reject();
									}

									var tokens = site.channelAccessTokens;
									for (var i = 0; i < tokens.length; i++) {
										if (tokens[i].name === 'defaultToken') {
											channelToken = tokens[i].value;
											break;
										}
									}
									if (!channelToken && tokens.length > 0) {
										channelToken = tokens[0].value;
									}

									repositoryId = site.repositoryId;
									channelId = site.channelId;
									console.log(' - get site');
									console.log('   repository: ' + repositoryId);
									console.log('   channel: ' + channelId);
									console.log('   channelToken: ' + channelToken);
									console.log('   defaultLanguage: ' + site.defaultLanguage);

									var params = 'item=fFolderGUID:' + siteId;
									return _getOneIdcService(request, localhost, server, 'SCS_VALIDATE_SITE_PUBLISH', params);
								})
								.then(function (result) {
									if (result.err) {
										return Promise.reject();
									}

									var siteValidation;
									try {
										siteValidation = JSON.parse(result.LocalData && result.LocalData.SiteValidation);
									} catch (e) {};

									if (!siteValidation) {
										console.log('ERROR: failed to get site validation');
										return Promise.reject();
									}
									// console.log(siteValidation);
									console.log('Site Validation:');
									_displaySiteValidation(siteValidation);

									// query channel items
									return serverRest.getChannelItems({
										registeredServerName: serverName,
										currPath: projectDir,
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
										registeredServerName: serverName,
										currPath: projectDir,
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
									_cmdEnd(done, localServer);
								})
								.catch((error) => {
									_cmdEnd(done, localServer);
								});
						}
					}); // idc token request

				}, 6000);
			}); // local 
		}); // login
	} catch (e) {
		console.log(e);
		_cmdEnd(done);
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
					console.log(sprintf(format, 'item id', results[k].itemId));
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