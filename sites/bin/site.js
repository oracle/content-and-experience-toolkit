/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

const e = require('express');

var gulp = require('gulp'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip'),
	assetUtils = require('./asset.js').utils,
	componentUtils = require('./component.js').utils,
	contentUtils = require('./content.js').utils,
	documentUtils = require('./document.js').utils,
	templateUtils = require('./template.js').utils,
	siteUpdateLib = require('./siteUpdate.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var cecDir = path.join(__dirname, ".."),
	themesDataDir = path.join(cecDir, 'data', 'themes'),
	exportSiteFileGroupSize = 3;

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

var _executeGetExportService = function (args) {
	var server = args.server,
		url = args.endpoint,
		noMsg = args.noMsg;

	// Note: Export service on dev instances requires additional header
	var addheaders;
	if (server.env === 'dev_ec') {
		addheaders = { 'IDCS_REMOTE_USER': server.username };
	}

	return serverRest.executeGet({
		server: server,
		endpoint: url,
		noMsg: noMsg,
		headers: addheaders
	});
};

var _downloadReport = function (url, siteName, server) {
	return new Promise(function (resolve, reject) {
		console.info(' - Download reports from ' + url);
		var targetStem,
			namePrefix;

		if (url.indexOf('/system/export/api/v1/exports/') !== -1) {
			targetStem = 'siteExport';
			namePrefix = 'Export_';
		} else if (url.indexOf('/system/export/api/v1/imports/') !== -1) {
			targetStem = 'siteImport';
			namePrefix = 'Import_';
		}

		var targetPath = path.join(projectDir, 'src', targetStem);
		// Create target path
		fs.mkdirSync(targetPath, {
			recursive: true
		});

		targetPath = path.join(targetPath, namePrefix + siteName + '_Report.zip');
		console.info(' - Save reports to ' + targetPath);
		// Note: Export service on dev instances requires additional header
		var addheaders;
		if (server.env === 'dev_ec') {
			addheaders = { 'IDCS_REMOTE_USER': server.username };
		}

		var downloadArgs = {
			server: server,
			url: url,
			saveTo: targetPath,
			headers: addheaders
		}
		serverRest.downloadByURLSave(downloadArgs).then(function () {
			resolve();
		}).catch((error) => {
			console.error('Failed to download reports');
			resolve();
		});
	});
}
var _downloadReports = function (reports, siteName, server) {
	var downloadPromises = [];
	(reports || []).forEach(function (report) {
		downloadPromises.push(_downloadReport(report, siteName, server));
	});

	return Promise.all(downloadPromises);
};

var _getSiteForExportJob = function (id, server) {
	return new Promise(function (resolve, reject) {
		var url = '/system/export/api/v1/exports/' + id;
		url += '?fields=sources.select.type,sources.select.site.id';

		_executeGetExportService({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// Support single site for now
			var source = data.sources.at(0);
			sitesRest.getSite({
				server: server,
				id: source.select.site.id,
				showInfo: false
			}).then(site => {
				resolve(site);
			}).catch((siteError) => {
				console.error('Failed to get site details');
				resolve();
			});

		}).catch((jobError) => {
			console.error('Failed to get job details');
			resolve();
		})
	});
};

var _getSiteForImportJob = function (id, server) {
	return new Promise(function (resolve, reject) {
		var url = '/system/export/api/v1/imports/' + id;
		url += '?fields=targets.select.type,targets.select.site.id,targets.select.site.name';

		_executeGetExportService({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// Support single site for now
			var target = data.targets.at(0);
			resolve(target.select.site);
		}).catch((jobError) => {
			console.error('Failed to get job details');
			resolve();
		})
	});
};

var _getFolder = function (folderId, server) {
	return new Promise(function (resolve, reject) {
		var url = '/documents/api/1.2/folders/' + folderId;
		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			resolve(data);
		}).catch((siteError) => {
			console.error('Failed to get folder details');
			resolve();
		});
	});
};

var _getRepository = function (repositoryId, server) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/repositories/' + repositoryId;
		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			resolve(data);
		}).catch((siteError) => {
			console.error('Failed to get repository details');
			resolve();
		});
	});
};

var _getCategoryId = function (categoryPath, taxonomyId, server) {
	return new Promise(function (resolve, reject) {
		var categories = categoryPath.split('/');

		var getCategoryFromResult = function (result) {
			var cat;
			if (result) {
				if (result.categories && result.categories.length > 0) {
					// Should have one found only. Get the first one.
					cat = result.categories.at(0);
				}
			}
			return cat;
		}

		var getCategory = categories.reduce(function (categoryPromise, categoryName) {
			return categoryPromise.then(function (result) {
				// Handle leading and trailing / cases
				if (!categoryName) {
					return Promise.resolve(result);
				}

				var parentId;
				if (!result) {
					// First category in the list.
					parentId = taxonomyId;
				} else {
					var category = getCategoryFromResult(result);
					if (category) {
						parentId = category.id;
					} else {
						// Category not found case
						return Promise.reject();
					}
				}
				return serverRest.getCategory({
					server: server,
					taxonomyId: taxonomyId,
					parentCategoryId: parentId,
					categoryName: categoryName
				});
			});
		}, Promise.resolve()
		);

		getCategory.then(function (result) {
			var leafCategory = getCategoryFromResult(result);
			if (leafCategory) {
				resolve(leafCategory);
			} else {
				console.error('ERROR: ' + categoryPath + ' category not found');
				reject();
			}
		}).catch((error) => {
			console.error('ERROR: ' + categoryPath + ' category not found');
			reject();
		});
	});
};

var duration = function (beginTimeString, endTimeString) {
	if (!beginTimeString || !endTimeString) {
		return '';
	}

	var beginTime = new Date(Date.parse(beginTimeString)),
		endTime = new Date(Date.parse(endTimeString));

	return ((endTime.getTime() - beginTime.getTime()) / 1000).toFixed(0) + 's';
}

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

	var name = argv.name;
	var templateName = argv.template;
	var repositoryName = argv.repository;
	var localizationPolicyName = argv.localizationPolicy;
	var defaultLanguage = argv.defaultLanguage;
	var description = argv.description;
	var sitePrefix = argv.sitePrefix || name.toLowerCase();
	sitePrefix = sitePrefix.substring(0, 15);
	var updateContent = typeof argv.update === 'string' && argv.update.toLowerCase() === 'true';
	var reuseContent = typeof argv.reuse === 'string' && argv.reuse.toLowerCase() === 'true';
	var suppressgovernance = typeof argv.suppressgovernance === 'string' && argv.suppressgovernance.toLowerCase() === 'true';
	var taxonomyName = '';
	var categoryName = '';

	// Extract strings in the format of <taxonomy>:<category>
	if (argv.category) {
		var colonIdx = argv.category.indexOf(':');

		if (colonIdx > 0) {
			taxonomyName = argv.category.substring(0, colonIdx);
			categoryName = argv.category.substring(colonIdx + 1);
		}
	}

	_createSiteREST(server, name, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, updateContent, reuseContent, suppressgovernance, taxonomyName, categoryName, done);

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
var _createSiteREST = function (server, name, templateName, repositoryName, localizationPolicyName,
	defaultLanguage, description, sitePrefix, updateContent, reuseContent, suppressgovernance, taxonomyName, categoryName, done) {
	var template, templateGUID;
	var repositoryId, localizationPolicyId;
	var createEnterprise;
	var governanceEnabled;
	var localizationPolicyAllowed;
	var policy;
	var sitePrefixAllowed;
	var isUserSitesAdmin = false;
	var taxonomyId, categoryId;

	var format = '   %-20s %-s';
	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverUtils.getSitesGovernance(server)
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				governanceEnabled = result.sitesGovernanceEnabled;
				if (governanceEnabled) {
					console.info(' - governance for sites is enabled');
				}

				return serverUtils.getUserRoles(server);

			})
			.then(function (result) {
				var userRoles = result && result.userRoles;
				isUserSitesAdmin = userRoles && userRoles.indexOf('CECSitesAdministrator') >= 0;
				if (!isUserSitesAdmin && suppressgovernance) {
					console.log(' - suppressgovernance only for SitesAdmin');
					suppressgovernance = false;
				}

				return sitesRest.resourceExist({
					server: server,
					type: 'sites',
					name: name
				});
			})
			.then(function (result) {
				if (!result.err) {
					console.error('ERROR: site ' + name + ' already exists');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: server,
					name: templateName,
					expand: 'localizationPolicy,policy'
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				template = result;

				sitePrefixAllowed = template.policy && template.policy.sitePrefixAllowed;
				localizationPolicyAllowed = template.policy && template.policy.localizationPolicyAllowed;

				if (!suppressgovernance && governanceEnabled && (!template.policy || !template.policy.status || template.policy.status !== 'active')) {
					console.error('ERROR: the template is not active');
					return Promise.reject();
				}

				if (template.isEnterprise && !repositoryName) {
					console.error('ERROR: repository is required to create enterprise site');
					return Promise.reject();
				}

				// When governance is on, standard template can only creates standard site
				createEnterprise = repositoryName && (!governanceEnabled || template.isEnterprise) ? true : false;

				if (createEnterprise && !template.localizationPolicy && !localizationPolicyName) {
					console.error('ERROR: localization policy is required to create enterprise site');
					return Promise.reject();
				}
				// Remove this condition when defaultLanguage returned from API /templates 
				if (createEnterprise && !defaultLanguage) {
					console.error('ERROR: default language is required to create enterprise site');
					return Promise.reject();
				}

				if (!createEnterprise) {
					console.info(' - creating standard site ...');
					console.info(sprintf(format, 'name', name));
					console.info(sprintf(format, 'template', templateName));

					sitesRest.createSite({
						server: server,
						name: name,
						templateId: template.id,
						templateName: templateName,
						suppressgovernance: suppressgovernance
					})
						.then(function (result) {
							if (result.err) {
								done();
							}
							if (!result.status || result.status !== 'pending') {
								console.log(' - site created');

								sitesRest.getSite({
									server: server,
									name: name
								}).then(function (result) {
									if (result.err) {
										done();
									} else {
										console.log(' - site id: ' + (result && result.id));
										done(true);
									}
								});
							} else {
								done(true);
							}
						});

				} else {

					serverRest.getRepositories({
						server: server
					})
						.then(function (result) {
							var repositories = result || [];
							var repositoryType;
							for (var i = 0; i < repositories.length; i++) {
								if (repositories[i].name.toLowerCase() === repositoryName.toLowerCase()) {
									repositoryId = repositories[i].id;
									repositoryType = repositories[i].repositoryType;
									break;
								}
							}

							if (!repositoryId) {
								console.error('ERROR: repository ' + repositoryName + ' does not exist');
								return Promise.reject();
							}
							if (repositoryType && repositoryType.toLowerCase() === 'business') {
								console.error('ERROR: repository is a business repository');
								return Promise.reject();
							}

							console.info(' - get repository (Id: ' + repositoryId + ')');

							return serverRest.getLocalizationPolicies({
								server: server
							});
						})
						.then(function (result) {
							var policies = result || [];
							if (localizationPolicyName) {
								for (var i = 0; i < policies.length; i++) {
									if (policies[i].name === localizationPolicyName) {
										policy = policies[i];
										localizationPolicyId = policies[i].id;
										break;
									}
								}
								if (!localizationPolicyId) {
									console.error('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
									return Promise.reject();
								}
								console.info(' - get localization policy');
							} else {
								for (let i = 0; i < policies.length; i++) {
									if (policies[i].id === template.localizationPolicy.id) {
										policy = policies[i];
										localizationPolicyId = policies[i].id;
										break;
									}
								}
								if (!localizationPolicyId) {
									console.error('ERROR: localization policy in template does not exist');
									return Promise.reject();
								}
								console.info(' - use localization policy from template: ' + policy.name);
							}

							var requiredLanguages = policy.requiredValues;
							if (!requiredLanguages.includes(defaultLanguage)) {
								console.error('ERROR: language ' + defaultLanguage + ' is not in localization policy ' + policy.name);
								return Promise.reject();
							}

							if (taxonomyName) {
								return serverRest.getTaxonomiesWithName({
									server: server,
									name: taxonomyName
								});
							} else {
								return Promise.resolve();
							}
						})
						.then(function (result) {
							if (taxonomyName) {
								var taxonomies = result || [];
								var nameMatched = [];
								for (var i = 0; i < taxonomies.length; i++) {
									if (name && taxonomies[i].name === taxonomyName) {
										nameMatched.push(taxonomies[i]);
									}
								}

								if (nameMatched.length === 0) {
									console.error('ERROR: taxonomy ' + taxonomyName + ' does not exist');
									return Promise.reject();
								} else {
									// Return first one.
									taxonomyId = nameMatched.at(0).id;
								}


								if (categoryName) {
									return _getCategoryId(categoryName, taxonomyId, server);
								} else {
									return Promise.resolve();
								}
							} else {
								return Promise.resolve();
							}
						})
						.then(function (result) {
							if (categoryName) {
								categoryId = result && result.id;
							}

							//
							// create enterprise site
							//
							console.info(' - creating enterprise site ...');
							console.info(sprintf(format, 'name', name));
							console.info(sprintf(format, 'template', templateName));
							if (suppressgovernance || !governanceEnabled || sitePrefixAllowed) {
								console.info(sprintf(format, 'site prefix', sitePrefix));
							}
							console.info(sprintf(format, 'repository', repositoryName));
							if (suppressgovernance || !governanceEnabled && localizationPolicyAllowed) {
								console.info(sprintf(format, 'localization policy', policy.name));
							}
							console.info(sprintf(format, 'default language', defaultLanguage));

							return sitesRest.createSite({
								server: server,
								name: name,
								description: description,
								sitePrefix: suppressgovernance || !governanceEnabled || sitePrefixAllowed ? sitePrefix : '',
								templateName: templateName,
								templateId: template.id,
								repositoryId: repositoryId,
								localizationPolicyId: suppressgovernance || !governanceEnabled || localizationPolicyAllowed ? localizationPolicyId : '',
								defaultLanguage: defaultLanguage,
								updateContent: updateContent,
								reuseContent: reuseContent,
								suppressgovernance: suppressgovernance,
								taxonomyId: taxonomyName && taxonomyId,
								categoryId: categoryName && categoryId
							});
						})
						.then(function (result) {
							if (result.err) {
								return Promise.reject();
							}

							if (!result.status || result.status !== 'pending') {
								console.log(' - site created');

								sitesRest.getSite({
									server: server,
									name: name
								}).then(function (result) {
									if (!result || result.err) {
										done();
									} else {
										console.log(' - site id: ' + result.id + ' prefix: ' + result.sitePrefix);
										done(true);
									}
								});
							} else {
								done(true);
							}
						})
						.catch((error) => {
							done();
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

	var site;
	var targetRepository;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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

				console.info(' - verify source site');
				site = result;

				if (site.isEnterprise && !repositoryName) {
					console.error('ERROR: repository is required to copy enterprise site');
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
					console.error('ERROR: site ' + targetName + ' already exists');
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
						console.error('ERROR: repository ' + repositoryName + ' does not exist');
						return Promise.reject();
					}
					targetRepository = results[0].data;

					if (targetRepository.repositoryType && targetRepository.repositoryType.toLowerCase() === 'business') {
						console.error('ERROR: repository is a business repository');
						return Promise.reject();
					}

					console.info(' - verify repository');
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
						console.info(' - site has assets from other repositories, only the assets from the default repository will be copied');
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

				console.info(' - will copy ' + (site.isEnterprise ? 'enterprise' : 'standard') + ' site ' + name);
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
					return _copySite(argv, server, site, targetName, description, sitePrefix, targetRepository, otherItems);
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
					console.error(error);
				}
				done();
			});

	});
};

// 
// copy site that uses assets from multiple repositories
// Currently cannot use sites API to copy such sites
//
var _copySite = function (argv, server, site, targetName, description, sitePrefix, repository, otherItems) {
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
					console.info(' - site ' + site.name + ' does not have any asset');
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

					console.info(' - downloading assets ...');
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
				return serverUtils.createDefaultTheme(projectDir);

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
					console.error('ERROR: failed to download template ' + templateName);
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
					console.error('ERROR: failed to upload template file');
					return Promise.reject();
				}

				var uploadedFile = result;
				fileId = uploadedFile.id;
				console.info(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
					' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				return sitesRest.importTemplate({
					server: server,
					name: templateName,
					fileId: fileId
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: failed to import template');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: server,
					name: templateName
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: failed to query template');
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
					'scsSiteTheme': site.themeName
				};
				return serverUtils.setSiteMetadata(server, idcToken, templateId, values);

			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: failed to set template theme back to ' + site.themeName);
					return Promise.reject();
				}
				console.info(' - set template theme back to ' + site.themeName);

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
					console.error('ERROR: failed to create site');
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
					console.error('ERROR: failed to query site ' + targetName);
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
						console.info(' - channel ' + targetSite.channel.name + ' added to repository ' + result.name);
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

				console.info(' - items from other repositories added to site channel ' + targetSite.channel.name);

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
					console.error(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};


var _transferStandardSite = function (argv, server, destServer, site, excludecomponents, excludetheme, suppressgovernance, publishedversion, includestaticfiles) {
	return new Promise(function (resolve, reject) {
		console.info(' - site ' + site.name + ' is a standard site');

		var destServerName = destServer.name;

		var siteName = site.name;

		var templateName = site.name + serverUtils.createGUID();
		templateName = templateName.substring(0, 40);
		var templatePath;
		var fileName, fileId;

		var creatNewSite = false;
		var siteUsedData;
		var destSite;
		var destSiteUsedData;
		var templateId;
		var contentLayoutNames = [];
		var compsToVerify = [];
		var defaultThemeName = '__toolkit_theme';
		var newThemeName;
		var newThemeGUID;
		var newThemePath;

		var destdir = path.join(projectDir, 'dist');
		var startTime;
		var idcToken;

		var excludeSiteContent = false;

		sitesRest.resourceExist({
			server: destServer,
			type: 'themes',
			name: site.themeName
		})
			.then(function (result) {
				if (result && result.id) {
					console.info(' - theme ' + site.themeName + ' exists on server ' + destServerName);
				} else {
					if (excludetheme) {
						console.info(' - theme does not exist on server ' + destServerName + ' and will not exclude the theme');
						excludetheme = false;
					}
				}

				// query site metadata to get static site settings
				return serverUtils.getSiteUsedData(server, site.id);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.info(' - get site metadata');

				siteUsedData = result;

				// check site on destination server
				return sitesRest.resourceExist({
					server: destServer,
					type: 'sites',
					name: siteName,
					expand: 'staticSiteDeliveryOptions'
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					creatNewSite = true;
				} else {
					destSite = result;
				}
				console.info(' - will ' + (creatNewSite ? 'create' : 'update') + ' site ' + siteName + ' on ' + destServer.url);

				// create a local template based on the site
				var enterprisetemplate = false;
				var excludecontent = true;
				var excludeType, publishedassets, referencedassets, excludeFolders;
				return templateUtils.createLocalTemplateFromSite(argv, templateName, siteName, server, excludecontent, enterprisetemplate,
					excludecomponents, excludetheme, excludeType, publishedassets, referencedassets,
					excludeFolders, publishedversion);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.info(' - create template ' + templateName);

				// the result contains theme and components (itemGUID)

				compsToVerify = result.components || [];

				var verifyThemePromises = [];
				if (!excludetheme && result.theme && result.theme.themeName && result.theme.itemGUID) {
					verifyThemePromises.push(_verifyThemeItemGUID(destServer, result.theme.themeName, result.theme.itemGUID));
				}

				return Promise.all(verifyThemePromises);
			})
			.then(function (results) {

				var verifyCompPromises = [];
				if (!excludecomponents && compsToVerify && compsToVerify.length > 0) {
					verifyCompPromises.push(_verifyComponentItemGUID(destServer, compsToVerify));
				}

				return Promise.all(verifyCompPromises);

			})
			.then(function (results) {

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
				var excludeContentTemplate = true;
				var extraComponents = [];

				return templateUtils.zipTemplate(argv, templateName, optimize, excludeContentTemplate, extraComponents, excludeSiteContent, excludecomponents, newTheme);

			})
			.then(function (result) {
				fileName = templateName + '.zip';
				templatePath = path.join(destdir, fileName);
				if (!fs.existsSync(templatePath)) {
					console.error('ERROR: failed to download template ' + templateName);
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
					console.error('ERROR: failed to upload template file');
					return Promise.reject();
				}
				var uploadedFile = result;
				fileId = uploadedFile.id;
				console.info(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
					' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				return sitesRest.importTemplate({
					server: destServer,
					name: templateName,
					fileId: fileId
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: failed to import template');
					return Promise.reject();
				}

				return sitesRest.getTemplate({
					server: destServer,
					name: templateName
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: failed to query template');
					return Promise.reject();
				}

				templateId = result.id;

				// update template to the original theme
				var updateTemplatePromises = [];

				if (excludetheme) {
					var values = {
						'scsSiteTheme': site.themeName
					};
					updateTemplatePromises.push(serverUtils.setSiteMetadata(destServer, idcToken, templateId, values));

				}

				return Promise.all(updateTemplatePromises);

			})
			.then(function (results) {
				if (excludetheme) {
					if (results && results[0] && !results[0].err) {
						console.info(' - set template theme back to ' + site.themeName);
					}
				}

				var createSitePromises = [];
				if (creatNewSite && site) {
					createSitePromises.push(sitesRest.createSite({
						server: destServer,
						id: site.id,
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
					var showMsg = console.showInfo();
					deleteTemplatePromises.push(documentUtils.deleteFile(deleteArgv, destServer, false, showMsg));
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
					console.info(' - download site static files');
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
				if (includestaticfiles && creatNewSite) {
					console.info(' - upload site static files');
				}

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
										console.error('ERROR: failed to get idcToken');
										return Promise.reject();
									}

									// update site static delivery options
									return sitesRest.setSiteStaticDeliveryOptions({
										server: destServer,
										id: destSite.id,
										name: destSite.name,
										staticDeliveryOptions: site.staticSiteDeliveryOptions
									});

								})
								.then(function (result) {
									if (result && !result.err) {
										console.info(' - update site static delivery options');
									}

									return serverUtils.getSiteUsedData(destServer, destSite.id);

								})
								.then(function (result) {
									destSiteUsedData = result;

									// update site used items
									return _updateSiteUsedData(destServer, idcToken, destSite, siteUsedData, destSiteUsedData);
								})
								.then(function (result) {

									// update site theme if needed
									return sitesRest.setSiteTheme({
										server: destServer,
										site: destSite,
										themeName: site.themeName,
										showMsg: true
									});

								})
								.then(function (result) {

									return resolve({});
								})
								.catch((error) => {
									if (error) {
										console.error(error);
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
					console.error(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

var _createPageId = function (server, idcToken, siteName, pageLayout) {
	return new Promise(function (resolve, reject) {

		var url = '/documents/integration?IdcService=SCS_CREATE_NEW_PAGES&IsJson=1';

		var payload = {
			'idcToken': idcToken,
			'LocalData': {
				'IdcService': 'SCS_CREATE_NEW_PAGES',
				'siteId': siteName,
				'layouts': pageLayout,
			}
		};

		serverRest.executePost({
			server: server,
			endpoint: url,
			body: payload,
			noMsg: true
		}).then(function (result) {
			return resolve(result);
		});

	});
};

/**
 * create site page
 */
module.exports.createSitePage = function (argv, done) {
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

	//
	// validate page template JSON file
	//
	var pageJsonFilePath = argv.pagetemplate;
	if (!path.isAbsolute(pageJsonFilePath)) {
		pageJsonFilePath = path.join(projectDir, pageJsonFilePath);
	}
	pageJsonFilePath = path.resolve(pageJsonFilePath);
	if (!fs.existsSync(pageJsonFilePath)) {
		console.error('ERROR: ' + pageJsonFilePath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(pageJsonFilePath).isFile()) {
		console.error('ERROR: ' + pageJsonFilePath + ' is not a file');
		done();
		return;
	}
	var pageJson;
	try {
		pageJson = JSON.parse(fs.readFileSync(pageJsonFilePath));
	} catch (e) {
		console.error('ERROR: file ' + pageJsonFilePath + ' is not a valid JSON file');
		done();
		return;
	}
	if (!pageJson.properties || !pageJson.properties.pageLayout) {
		console.error('ERROR: file ' + pageJsonFilePath + ' is not a valid page template');
		done();
		return;
	}
	var pageLayout = pageJson.properties.pageLayout;

	//
	// validate page details
	//
	var pageDetailsFilePath = argv.pagedetails;
	if (!path.isAbsolute(pageDetailsFilePath)) {
		pageDetailsFilePath = path.join(projectDir, pageDetailsFilePath);
	}
	pageDetailsFilePath = path.resolve(pageDetailsFilePath);
	if (!fs.existsSync(pageDetailsFilePath)) {
		console.error('ERROR: ' + pageDetailsFilePath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(pageDetailsFilePath).isFile()) {
		console.error('ERROR: ' + pageDetailsFilePath + ' is not a file');
		done();
		return;
	}
	var pageDetails;
	try {
		pageDetails = JSON.parse(fs.readFileSync(pageDetailsFilePath));
	} catch (e) {
		console.error('ERROR: file ' + pageDetailsFilePath + ' is not a valid JSON file');
		done();
		return;
	}
	if (!pageDetails.name) {
		console.error('ERROR: no name is defined in file ' + pageDetailsFilePath);
	}
	if (!pageDetails.pageUrl) {
		console.error('ERROR: no pageUrl is defined in file ' + pageDetailsFilePath);
	}
	if (!pageDetails.name || !pageDetails.pageUrl) {
		done();
		return;
	}

	var pageName = pageDetails.name;
	var pageUrl = pageDetails.pageUrl;

	var siteName = argv.name;
	var parentId = argv.parent;
	var siblingId = argv.sibling;

	var ignoreValidation = typeof argv.ignorevalidation === 'string' && argv.ignorevalidation.toLowerCase() === 'true';

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var idcToken;
			var site;
			var channel;
			var repository;
			var structureFileId;
			var pagesFileId;
			var siteStructure;
			var realParent;
			var realSibling;
			var pageId;
			var repoContentTypes = [];
			var componentsUsed = [];
			var itemsUsed = [];
			var typesUsed = [];
			var siteUsedData = [];
			var components = [];
			var items = [];

			// verify site on source server
			sitesRest.getSite({
				server: server,
				name: siteName,
				expand: 'channel,repository'
			})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						return Promise.reject();
					}

					site = result;
					channel = site.channel;

					// get site repository (to get types)
					return serverRest.getRepository({
						server: server,
						id: site.repository && site.repository.id
					});

				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					repository = result;
					if (repository.contentTypes && repository.contentTypes.length > 0) {
						repository.contentTypes.forEach(function (type) {
							if (type.name && !repoContentTypes.includes(type.name)) {
								repoContentTypes.push(type.name);
							}
						});
					}

					// get site structure
					let promises = [];
					promises.push(serverRest.findFile({
						server: server,
						parentID: site.id,
						filename: 'structure.json',
						itemtype: 'file'
					}));
					promises.push(serverRest.findFile({
						server: server,
						parentID: site.id,
						filename: 'pages',
						itemtype: 'folder'
					}));

					return Promise.all(promises);

				})
				.then(function (results) {
					structureFileId = results && results[0].id;
					pagesFileId = results && results[1].id;

					if (!structureFileId) {
						console.error('ERROR: failed to get site structure file Id');
						return Promise.reject();
					}
					if (!pagesFileId) {
						console.error('ERROR: failed to get pages folder Id');
						return Promise.reject();
					}

					return serverRest.readFile({
						server: server,
						fFileGUID: structureFileId
					});

				})
				.then(function (result) {
					if (!result || result.err) {
						console.error('ERROR: failed to get site structure');
						return Promise.reject();
					}
					siteStructure = result;
					let pages = siteStructure && siteStructure.pages || [];

					console.info(' - verify site (Id: ' + site.id + ' total pages: ' + pages.length + ')');
					console.info(' - site repository (name: ' + repository.name + ' content types: ' + repoContentTypes + ')');
					console.info(' - site channel (Id: ' + channel.id + ')');

					//
					// validate parent and sibling
					//
					if (parentId) {
						let foundParent = false;
						for (let i = 0; i < pages.length; i++) {
							if (pages[i].id === parentId) {
								foundParent = true;
								break;
							}
						}
						if (!foundParent) {
							console.warn('WARNING: parent ' + parentId + ' is not found');
							parentId = undefined;
						}
					}
					if (siblingId) {
						let foundSibling = false;
						for (let i = 0; i < pages.length; i++) {
							if (pages[i].id === siblingId) {
								foundSibling = true;
								break;
							}
						}
						if (!foundSibling) {
							console.warn('WARNING: sibling ' + siblingId + ' is not found');
							siblingId = undefined;
						}
					}
					if (parentId === undefined && siblingId === undefined) {
						console.error('ERROR: no valid parent nor sibling is specified');
						return Promise.reject();
					}

					if (parentId !== undefined && siblingId !== undefined) {
						realParent = parentId;
						// check if the sibling's parent
						for (let i = 0; i < pages.length; i++) {
							if (pages[i].id === realParent) {
								if (pages[i].children.includes(siblingId)) {
									realSibling = siblingId;
								} else {
									console.warn('WARNING: sibling page ' + siblingId + ' is not a child page of page ' + realParent);
								}
								break;
							}
						}
					} else if (parentId !== undefined) {
						// add as the last child
						realParent = parentId;
						realSibling = undefined;
					} else {
						// find the parent with the sibling
						for (let i = 0; i < pages.length; i++) {
							if (pages[i].children && pages[i].children.length > 0 && pages[i].children.includes(siblingId)) {
								realParent = pages[i].id;
								realSibling = siblingId;
								break;
							}
						}
					}
					if (!realParent) {
						console.error('ERROR: no parent is found');
						return Promise.reject();
					}

					//
					// validate page name (unique among siblings)
					//
					let siblings = [];
					for (let i = 0; i < pages.length; i++) {
						if (pages[i].id === realParent) {
							siblings = pages[i].children || [];
							break;
						}
					}
					let sameNameId = undefined;
					for (let i = 0; i < siblings.length; i++) {
						for (let j = 0; j < pages.length; j++) {
							if (siblings[i] === pages[j].id && pages[j].name === pageName) {
								sameNameId = pages[j].id;
								break;
							}
						}
						if (sameNameId !== undefined) {
							break;
						}
					}
					if (sameNameId !== undefined) {
						console.error('ERROR: a sibling page (' + sameNameId + ') with the same name ' + pageName + ' already exists');
						return Promise.reject();
					}

					//
					// validte pageUrl (unique cross site)
					//
					let sameUrlId = undefined;
					for (let i = 0; i < pages.length; i++) {
						if (pages[i].pageUrl === pageUrl) {
							sameUrlId = pages[i].id;
						}
					}
					if (sameUrlId !== undefined) {
						console.error('ERROR: a page (' + sameUrlId + ') with the same pageUrl ' + pageUrl + ' already exists');
						return Promise.reject();
					}

					// find all components, items and content types used on the page
					// temporary page id, will be replaced later
					let pageData = {
						id: '999999',
						data: pageJson
					};

					var pageContent = _getPageInfo(site.id, [pageData], site.defaultLanguage);
					componentsUsed = pageContent && pageContent.components || [];
					itemsUsed = pageContent && pageContent.items || [];
					typesUsed = pageContent && pageContent.types || [];
					siteUsedData = pageContent && pageContent.siteUsedData || [];

					//
					// query components used on the page
					//
					let queryCompPromises = [];
					componentsUsed.forEach(function (name) {
						queryCompPromises.push(sitesRest.resourceExist({
							server: server,
							name: name,
							type: 'components',
							showInfo: false
						}));
					});

					return Promise.all(queryCompPromises);

				})
				.then(function (results) {
					if (componentsUsed.length > 0) {
						components = results;
					}

					//
					// query items on the page
					//
					let queryItemPromises = [];
					if (itemsUsed.length > 0) {
						let idq = '';
						itemsUsed.forEach(function (id) {
							if (idq) {
								idq = idq + ' or ';
							}
							idq = idq + 'id eq "' + id + '"';
						});
						let q = '(channels co "' + channel.id + '") AND (' + idq + ')';
						queryItemPromises.push(serverRest.queryItems({
							server: server,
							q: q,
							showTotal: false
						}));
					}

					return Promise.all(queryItemPromises);

				})
				.then(function (results) {

					if (itemsUsed.length > 0) {
						items = results && results[0] && results[0].data || [];
					}

					// 
					// validate components, items and types
					//
					var validated = true;
					componentsUsed.forEach(function (name) {
						let found = false;
						for (let i = 0; i < components.length; i++) {
							if (name === components[i].name && components[i].id) {
								found = true;
								break;
							}
						}
						if (!found) {
							if (ignoreValidation) {
								console.warn('WARNING: component ' + name + ' does not exist');
							} else {
								console.error('ERROR: component ' + name + ' does not exist');
								validated = false;
							}
						}
					});
					itemsUsed.forEach(function (id) {
						let found = false;
						for (let i = 0; i < items.length; i++) {
							if (id === items[i].id) {
								found = true;
								break;
							}
						}
						if (!found) {
							if (ignoreValidation) {
								console.warn('WARNING: item ' + id + ' is not in the site channel');
							} else {
								console.error('ERROR: item ' + id + ' is not in the site channel');
								validated = false;
							}
						}
					});
					typesUsed.forEach(function (type) {
						if (!repoContentTypes.includes(type)) {
							if (ignoreValidation) {
								console.warn('WARNING: type ' + type + ' is not in repository ' + repository.name);
							} else {
								console.error('ERROR: type ' + type + ' is not in repository ' + repository.name);
								validated = false;
							}
						}
					});


					if (!validated) {
						return Promise.reject();
					}

					return serverUtils.getIdcToken(server);

				})
				.then(function (result) {

					idcToken = result && result.idcToken;

					// generate new page ID
					return _createPageId(server, idcToken, site.name, pageLayout);

				})
				.then(function (result) {
					pageId = result && result[0] && result[0].properties && result[0].properties.pageId;
					if (!pageId) {
						let msg = result && result.LocalData && (result.LocalData.StatusMessage || result.LocalData.StatusMessageKey) || '';
						console.error('ERROR: failed to create page Id ' + msg);
						return Promise.reject();
					}

					var format = '   %-20s %-s';
					console.info(' - creating site page ...');
					console.info(sprintf(format, 'new page Id', pageId));
					console.info(sprintf(format, 'parent', realParent));
					console.info(sprintf(format, 'sibling', realSibling !== undefined ? realSibling : 'last child'));
					console.info(sprintf(format, 'name', pageName));
					console.info(sprintf(format, 'pageUrl', pageUrl));
					console.info(sprintf(format, 'pageLayout', pageLayout));
					console.info(sprintf(format, 'components', componentsUsed));
					console.info(sprintf(format, 'items', itemsUsed));
					console.info(sprintf(format, 'types', typesUsed));

					//
					// upload the page json file
					//
					return serverRest.createFile({
						server: server,
						parentID: pagesFileId,
						filename: pageId + '.json',
						contents: fs.readFileSync(pageJsonFilePath)
					});
				})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						console.error('ERROR: failed to upload page JSON file');
						return Promise.reject();
					}
					console.info(' - created page JSON file (name: ' + result.name + ' Id: ' + result.id + ')');

					pageDetails.id = pageId;
					pageDetails.parentId = realParent;
					pageDetails.children = [];
					// add to structure.json
					siteStructure.pages.push(pageDetails);
					// update the parent to include the new page
					for (let i = 0; i < siteStructure.pages.length; i++) {
						if (siteStructure.pages[i].id === realParent) {
							let parentPage = siteStructure.pages[i];
							if (realSibling === undefined) {
								// add to the end
								parentPage.children.push(pageId);
							} else {
								let idx = parentPage.children.indexOf(realSibling);
								if (idx >= 0) {
									// follow the specified sibling
									siteStructure.pages[i].children.splice(idx + 1, 0, pageId);
								} else {
									// add to the end
									parentPage.children.push(pageId);
								}
							}
						}
					}
					// console.log(siteStructure);

					//
					// update structure.json
					//
					let buildfolder = serverUtils.getBuildFolder(projectDir);
					if (!fs.existsSync(buildfolder)) {
						fs.mkdirSync(buildfolder);
					}
					let sitesBuildDir = path.join(buildfolder, 'sites');
					if (!fs.existsSync(sitesBuildDir)) {
						fs.mkdirSync(sitesBuildDir);
					}
					let fileName = 'structure.json';
					let filePath = path.join(sitesBuildDir, fileName);
					fs.writeFileSync(filePath, JSON.stringify(siteStructure, null, 4));
					return serverRest.createFile({
						server: server,
						parentID: site.id,
						filename: fileName,
						contents: fs.createReadStream(filePath)
					});

				})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						console.error('ERROR: failed to update site structure');
						return Promise.reject();
					}

					console.info(' - updated site structure');

					// 
					// update site used data
					//
					var usedDataPromises = [];
					if (siteUsedData.length > 0) {
						// set the real page id
						siteUsedData.forEach(function (data) {
							data.pageID = pageId;
						});
						// console.log(JSON.stringify(siteUsedData, null, 4));

						usedDataPromises.push(serverUtils.setSiteUsedData(server, idcToken, site.id, siteUsedData));
					}

					return Promise.all(usedDataPromises);

				})
				.then(function (results) {
					if (siteUsedData.length > 0) {
						if (!results || !results[0] || results[0].err) {
							console.error('ERROR: failed to set site used data');
							return Promise.reject();
						} else {
							console.info(' - update site used data for the page');
						}
					}

					// save page id to page detail file
					pageDetails.id = pageId;
					pageDetails.parentId = realParent;
					fs.writeFileSync(pageDetailsFilePath, JSON.stringify(pageDetails, null, 4));
					console.log(' - page id saved to file ' + pageDetailsFilePath);

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


/**
 * Transfer site
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
		console.error('ERROR: source and destination server are the same');
		done();
		return;
	}

	var excludecontent = typeof argv.excludecontent === 'string' && argv.excludecontent.toLowerCase() === 'true';
	var excludecomponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';
	var excludetheme = typeof argv.excludetheme === 'string' && argv.excludetheme.toLowerCase() === 'true';
	var excludetype = typeof argv.excludetype === 'string' && argv.excludetype.toLowerCase() === 'true';
	var publishedversion = typeof argv.publishedversion === 'string' && argv.publishedversion.toLowerCase() === 'true';
	var publishedassets = typeof argv.publishedassets === 'string' && argv.publishedassets.toLowerCase() === 'true';
	var referencedassets = typeof argv.referencedassets === 'string' && argv.referencedassets.toLowerCase() === 'true';
	var includestaticfiles = typeof argv.includestaticfiles === 'string' && argv.includestaticfiles.toLowerCase() === 'true';
	var suppressgovernance = typeof argv.suppressgovernance === 'string' && argv.suppressgovernance.toLowerCase() === 'true';
	var reuseContent = typeof argv.reuse === 'string' && argv.reuse.toLowerCase() === 'true';

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
	var siteUsedData;
	var destSite;
	var destSiteUsedData;
	var templateId;
	var contentLayoutNames = [];
	var defaultThemeName = '__toolkit_theme';
	var newThemeName;
	var newThemeGUID;
	var newThemePath;
	var compsToVerify = [];
	var referencedassetIds = [];

	var cecVersion, idcToken;

	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var actionSuccess = true;

	var startTime;

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + destServer.url);
				return Promise.reject();
			}

			// verify site on source server
			sitesRest.getSite({
				server: server,
				name: siteName,
				expand: 'channel,repository,staticSiteDeliveryOptions'
			})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					site = result;
					// console.log(site);

					if (publishedversion && site.publishStatus === 'unpublished') {
						console.error('ERROR: site ' + siteName + ' is not published');
						return Promise.reject();
					}

					return serverUtils.getIdcToken(destServer);
				})
				.then(function (result) {
					// fetch token
					if (result && result.idcToken) {
						idcToken = result && result.idcToken;
					}

					if (!site.isEnterprise) {

						_transferStandardSite(argv, server, destServer, site, excludecomponents, excludetheme, suppressgovernance, publishedversion, includestaticfiles)
							.then(function (result) {
								var success = result && !result.err;
								_cmdEnd(done, success);
								return;
							});

					} else {

						console.info(' - verify site (Id: ' + site.id + ' defaultLanguage: ' + site.defaultLanguage + ' theme: ' + site.themeName + ')');

						if (!site.channel || !site.channel.localizationPolicy) {
							console.error('ERROR: failed to get site channel ' + (site.channel ? JSON.stringify(site.channel) : ''));
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
									console.info(' - theme ' + site.themeName + ' exists on server ' + destServerName);
								} else {
									if (excludetheme) {
										console.info(' - theme does not exist on server ' + destServerName + ' and will not exclude the theme');
										excludetheme = false;
									}
								}

								// query site metadata to get used components, content types and items
								return serverUtils.getSiteUsedData(server, site.id);
							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								siteUsedData = result;

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
								console.info(' - verify site localization policy: ' + srcPolicy.name +
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
								console.info(' - will ' + (creatNewSite ? 'create' : 'update') + ' site ' + siteName + ' on ' + destServer.url);

								if (creatNewSite) {
									if (!repositoryName) {
										console.error('ERROR: no repository is specified');
										return Promise.reject();
									}
									if (!localizationPolicyName) {
										console.error('ERROR: no localization policy is specified');
										return Promise.reject();
									}
									var prefixToUse = sitePrefix || site.sitePrefix;
									if (prefixToUse.length > 15) {
										console.error('ERROR: site prefix ' + prefixToUse + ' is longer than 15 characters');
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
										console.error('ERROR: repository ' + repositoryName + ' does not exist');
										return Promise.reject();
									}
									repository = results[0].data;

									if (repository.repositoryType && repository.repositoryType.toLowerCase() === 'business') {
										console.error('ERROR: repository is a business repository');
										return Promise.reject();
									}

									console.info(' - verify repository');
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
											console.error('ERROR: repository ' + repoMappings[j].srcName + ' does not exist on server ' + server.name);
											return Promise.reject();
										}
									}
									console.info(' - verify repository ' + srcRepoNames + ' on server ' + server.name);
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
											console.error('ERROR: repository ' + repoMappings[j].destName + ' does not exist on server ' + destServer.name);
											return Promise.reject();
										}
									}
									console.info(' - verify repository ' + destRepoNames + ' on server ' + destServer.name);
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
										console.error('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
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
										console.error('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
										return Promise.reject();
									}

									var requiredLanguages = policy.requiredValues;
									if (!requiredLanguages.includes(site.defaultLanguage)) {
										console.error('ERROR: site default language ' + site.defaultLanguage + ' is not in localization policy ' + policy.name);
										return Promise.reject();
									}
									console.info(' - verify localization policy');
								}

								var checkSitePrefixPromises = [];
								if (creatNewSite) {
									// the same check as CAAS: [site prefix]- 
									var q = 'slug sw "' + (sitePrefix || site.sitePrefix) + '-"';
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
										console.error('ERROR: site prefix "' + (sitePrefix || site.sitePrefix) + '" is used by some content, please specify a different prefix');
										return Promise.reject();
									}
								}

								// create template on the source server and download
								var enterprisetemplate = true;
								var excludeFolders;
								return templateUtils.createLocalTemplateFromSite(
									argv, templateName, siteName, server, excludecontent, enterprisetemplate,
									excludecomponents, excludetheme, excludetype, publishedassets, referencedassets,
									excludeFolders, publishedversion);

							})
							.then(function (result) {
								if (!result || result.err) {
									return Promise.reject();
								}

								console.info(' - create template ' + templateName);

								// console.log(result);
								// the result contains theme and components (itemGUID)

								compsToVerify = result.components || [];

								var verifyThemePromises = [];
								if (!excludetheme && result.theme && result.theme.themeName && result.theme.itemGUID) {
									verifyThemePromises.push(_verifyThemeItemGUID(destServer, result.theme.themeName, result.theme.itemGUID));
								}

								return Promise.all(verifyThemePromises);
							})
							.then(function (results) {

								var verifyCompPromises = [];
								if (!excludecomponents && compsToVerify && compsToVerify.length > 0) {
									verifyCompPromises.push(_verifyComponentItemGUID(destServer, compsToVerify));
								}

								return Promise.all(verifyCompPromises);

							})
							.then(function (results) {

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
									console.error('ERROR: failed to export template ' + templateName);
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
									console.error('ERROR: failed to upload template file');
									return Promise.reject();
								}
								var uploadedFile = result;
								fileId = uploadedFile.id;
								console.info(' - file ' + fileName + ' uploaded to Home folder (Id: ' + fileId + ' version:' + uploadedFile.version + ')' +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

								return sitesRest.importTemplate({
									server: destServer,
									name: templateName,
									fileId: fileId
								});

							})
							.then(function (result) {
								if (!result || result.err) {
									console.error('ERROR: failed to import template');
									return Promise.reject();
								}

								return sitesRest.getTemplate({
									server: destServer,
									name: templateName
								});

							})
							.then(function (result) {
								if (!result || result.err || !result.id) {
									console.error('ERROR: failed to query template');
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

								// update template to the original theme
								var updateTemplatePromises = [];

								if (excludetheme) {
									var values = {
										'scsSiteTheme': site.themeName
									};
									updateTemplatePromises.push(serverUtils.setSiteMetadata(destServer, idcToken, templateId, values));

								}

								return Promise.all(updateTemplatePromises);

							})
							.then(function (results) {
								if (excludetheme) {
									if (results && results[0] && !results[0].err) {
										console.info(' - set template theme back to ' + site.themeName);
									}
								}

								var createSitePromises = [];
								if (creatNewSite && site) {

									// will preserve the original site id
									createSitePromises.push(sitesRest.createSite({
										server: destServer,
										id: site.id,
										name: siteName,
										description: site.description,
										sitePrefix: (sitePrefix || site.sitePrefix),
										templateName: templateName,
										templateId: templateId,
										repositoryId: repository.id,
										localizationPolicyId: policy.id,
										defaultLanguage: site.defaultLanguage,
										updateContent: true,
										reuseContent: reuseContent,
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
									var showMsg = console.showInfo();
									deleteTemplatePromises.push(documentUtils.deleteFile(deleteArgv, destServer, false, showMsg));
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
									console.info(' - download site static files');
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
								if (includestaticfiles && creatNewSite) {
									console.info(' - upload site static files');
								}

								if (creatNewSite) {
									if (actionSuccess) {
										console.log(' - site ' + siteName + ' created on ' + destServer.url);
									}

									_transferOtherAssets(argv, server, destServer, site, destSite, repoMappings, excludecontent, publishedassets, reuseContent).then(function (result) {

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
												console.info(' - update site localization policy ' + newPolicy.name);
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
										excludecontenttemplate: excludecontent ? 'true' : 'false',
										reuseContent: reuseContent
									};
									siteUpdateLib.updateSite(updateSiteArgs, function (success) {
										console.log(' - update site finished');

										if (success) {
											serverUtils.getIdcToken(destServer)
												.then(function (result) {
													idcToken = result && result.idcToken;
													if (!idcToken) {
														console.error('ERROR: failed to get idcToken');
														return Promise.reject();
													}

													// update site static delivery options
													return sitesRest.setSiteStaticDeliveryOptions({
														server: destServer,
														id: destSite.id,
														name: destSite.name,
														staticDeliveryOptions: site.staticSiteDeliveryOptions
													});

												})
												.then(function (result) {
													if (result && !result.err) {
														console.info(' - update site static delivery options');
													}

													return serverUtils.getSiteUsedData(destServer, destSite.id);

												})
												.then(function (result) {
													destSiteUsedData = result;

													// update site used items
													return _updateSiteUsedData(destServer, idcToken, destSite, siteUsedData, destSiteUsedData);
												})
												.then(function (result) {

													// update site theme if needed
													return sitesRest.setSiteTheme({
														server: destServer,
														site: destSite,
														themeName: site.themeName,
														showMsg: true
													});

												})
												.then(function (result) {

													return _transferOtherAssets(argv, server, destServer, site, destSite, repoMappings, excludecontent, publishedassets, reuseContent);

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
													console.info(' - update site localization policy ' + newPolicy.name);
													_cmdEnd(done, success);
												})
												.catch((error) => {
													if (error) {
														console.error(error);
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
									console.error(error);
								}
								_cmdEnd(done);
							});
					} // enterprise site

				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					_cmdEnd(done);
				}); // get site
		}) // login
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			_cmdEnd(done);
		});
};

var _transferOtherAssets = function (argv, server, destServer, site, destSite, repoMappings, excludecontent, publishedassets, reuseContent) {
	return new Promise(function (resolve, reject) {
		if (repoMappings.length === 0 || excludecontent) {
			return resolve({});
		}

		contentUtils.getSiteAssetsFromOtherRepos(server, site.channel.id, site.repository.id, publishedassets)
			.then(function (result) {
				var items = result && result.data || [];
				if (items.length === 0) {
					return resolve({});
				}

				console.info(' - total assets from other repositories: ' + items.length);
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
				return _transferRepoAssets(argv, repoMappings, server, destServer, site, destSite, publishedassets, reuseContent);

			})
			.then(function (result) {

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({
					err: 'err'
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

var _transferRepoAssets = function (argv, repoMappings, server, destServer, site, destSite, publishedassets, reuseContent) {
	return new Promise(function (resolve, reject) {
		var total = repoMappings.length;
		var destdir = path.join(projectDir, 'dist');
		var transferAssets = repoMappings.reduce(function (transferPromise, mapping) {
			return transferPromise.then(function (result) {
				if (mapping.items.length > 0) {
					console.info(' - *** transfering assets from repository ' + mapping.srcName + ' to repository ' + mapping.destName + ' (' + mapping.items.length + ') ...');

					// download assets from the source server
					var name = site.name + '_' + mapping.srcName + '_assets';
					var downloadArgs = {
						projectDir: projectDir,
						server: server,
						channel: site.name,
						assetGUIDS: mapping.items,
						name: name,
						publishedassets: publishedassets
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
								channelName: destSite.name,
								reuseContent: reuseContent,
								updateContent: true,
								contentpath: destdir,
								contentfilename: fileName
							};

							return contentUtils.uploadContent(uploadArgs).then(function (result) {
								// console.log(' - * assets uploaded');
							});

						}
					});
				}
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		transferAssets.then(function (result) {
			resolve({});
		});

	});
};

// to make sure the itemGUID of the theme on the target server is the same as the source
var _verifyThemeItemGUID = function (server, themeName, itemGUID) {
	return new Promise(function (resolve, reject) {
		sitesRest.resourceExist({
			server: server,
			type: 'themes',
			name: themeName
		})
			.then(function (result) {
				if (result && result.id) {

					var themeId = result.id;

					// get the theme metadata
					serverUtils.getThemeMetadata(server, themeId, themeName)
						.then(function (result) {
							var targetItemGUID = result && result.metadata && result.metadata.scsItemGUID;
							if (targetItemGUID === itemGUID) {
								console.info(' - theme ' + themeName + ' itemGUID ' + targetItemGUID + ' is in sync');
								return resolve({});
							} else {
								serverUtils.setThemeMetadata(server, result && result.idcToken, themeId, {
									scsItemGUID: itemGUID
								})
									.then(function (result) {
										if (!result.err) {
											console.info(' - update theme ' + themeName + ' itemGUID to ' + itemGUID);
											return resolve({});
										} else {
											resolve({
												err: 'err'
											});
										}
									});
							}

						});
				} else {
					return resolve({});
				}
			});
	});
};

var _verifyOneComponentItemGUID = function (server, compName, itemGUID) {
	return new Promise(function (resolve, reject) {
		sitesRest.resourceExist({
			server: server,
			type: 'components',
			name: compName,
			showInfo: false
		})
			.then(function (result) {
				if (result && result.id) {
					// component exists
					// get its metadata 
					var compId = result.id;
					serverUtils.getComponentMetadata(server, compId, compName)
						.then(function (result) {
							var targetItemGUID = result && result.metadata && result.metadata.scsItemGUID;
							if (targetItemGUID === itemGUID) {
								// console.log(' - component ' + compName + ' itemGUID ' + targetItemGUID + ' is in sync');
								return resolve({});
							} else {
								// console.log(' - component ' + compName + ' itemGUID ' + targetItemGUID + ' needs update');
								serverUtils.setComponentMetadata(server, result && result.idcToken, compId, {
									scsItemGUID: itemGUID
								})
									.then(function (result) {
										if (!result.err) {
											console.info(' - update component ' + compName + ' itemGUID to ' + itemGUID);
											return resolve({});
										} else {
											resolve({
												err: 'err'
											});
										}
									});
							}
						});
				} else {
					// console.log(' - component ' + comp.name + ' does not exist');
					return resolve({});
				}
			});
	});
};

// to make sure the itemGUID of the components on the target server is the same as the source
var _verifyComponentItemGUID = function (server, comps) {
	return new Promise(function (resolve, reject) {

		console.info(' - verify component itemGUID ...');
		var doUpdate = comps.reduce(function (compPromise, comp) {
			return compPromise.then(function (result) {
				return _verifyOneComponentItemGUID(server, comp.name, comp.itemGUID)
					.then(function (result) {
						// console.log(' - verify component ' + comp.name);
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({})
		);

		doUpdate.then(function (result) {
			return resolve({});
		});
	});
};


var _updateSiteUsedData = function (destServer, idcToken, destSite, siteUsedData, destSiteUsedData) {
	return new Promise(function (resolve, reject) {
		// console.log(JSON.stringify(siteUsedData, null, 4));
		// console.log(JSON.stringify(destSiteUsedData, null, 4));

		var itemsUsedAdded = [];
		var itemsUsedDeleted = [];

		// components to add
		siteUsedData.componentsUsed.forEach(function (comp) {
			var found = false;
			for (var i = 0; i < destSiteUsedData.componentsUsed.length; i++) {
				var destComp = destSiteUsedData.componentsUsed[i];
				if (comp.scsPageID === destComp.scsPageID &&
					comp.scsInstanceID === destComp.scsInstanceID &&
					comp.scsComponentName === destComp.scsComponentName) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedAdded.push({
					type: 'component',
					identifier: destSite.id,
					instanceID: comp.scsInstanceID,
					pageID: comp.scsPageID,
					name: comp.scsComponentName
				});
			}
		});

		// components to delete
		destSiteUsedData.componentsUsed.forEach(function (destComp) {
			var found = false;
			for (var i = 0; i < siteUsedData.componentsUsed.length; i++) {
				var comp = siteUsedData.componentsUsed[i];
				if (comp.scsPageID === destComp.scsPageID &&
					comp.scsInstanceID === destComp.scsInstanceID &&
					comp.scsComponentName === destComp.scsComponentName) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedDeleted.push({
					type: 'component',
					identifier: destComp.scsIdentifier,
					instanceID: destComp.scsInstanceID,
					pageID: destComp.scsPageID,
					name: destComp.scsComponentName
				});
			}
		});

		// content items to add 
		siteUsedData.contentItemsUsed.forEach(function (item) {
			var found = false;
			for (var i = 0; i < destSiteUsedData.contentItemsUsed.length; i++) {
				var destItem = destSiteUsedData.contentItemsUsed[i];
				if (item.scsPageID === destItem.scsPageID &&
					item.scsInstanceID === destItem.scsInstanceID &&
					item.scsContentItemID === destItem.scsContentItemID) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedAdded.push({
					type: 'contentItem',
					identifier: destSite.id,
					instanceID: item.scsInstanceID,
					pageID: item.scsPageID,
					contentItemID: item.scsContentItemID,
					version: item.scsVersion
				});
			}
		});

		// content items to delete 
		destSiteUsedData.contentItemsUsed.forEach(function (destItem) {
			var found = false;
			for (var i = 0; i < siteUsedData.contentItemsUsed.length; i++) {
				var item = siteUsedData.contentItemsUsed[i];
				if (item.scsPageID === destItem.scsPageID &&
					item.scsInstanceID === destItem.scsInstanceID &&
					item.scsContentItemID === destItem.scsContentItemID) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedDeleted.push({
					type: 'contentItem',
					identifier: destItem.scsIdentifier,
					instanceID: destItem.scsInstanceID,
					pageID: destItem.scsPageID,
					contentItemID: destItem.scsContentItemID
				});
			}
		});

		// content types to add 
		siteUsedData.contentTypesUsed.forEach(function (type) {
			var found = false;
			for (var i = 0; i < destSiteUsedData.contentTypesUsed.length; i++) {
				var destType = destSiteUsedData.contentTypesUsed[i];
				if (type.scsPageID === destType.scsPageID &&
					type.scsInstanceID === destType.scsInstanceID &&
					type.scsTypeName === destType.scsTypeName) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedAdded.push({
					type: 'contentType',
					identifier: destSite.id,
					instanceID: type.scsInstanceID,
					pageID: type.scsPageID,
					name: type.scsTypeName
				});
			}
		});
		// content types to delete 
		destSiteUsedData.contentTypesUsed.forEach(function (destType) {
			var found = false;
			for (var i = 0; i < siteUsedData.contentTypesUsed.length; i++) {
				var type = siteUsedData.contentTypesUsed[i];
				if (type.scsPageID === destType.scsPageID &&
					type.scsInstanceID === destType.scsInstanceID &&
					type.scsTypeName === destType.scsTypeName) {
					found = true;
					break;
				}
			}
			if (!found) {
				itemsUsedDeleted.push({
					type: 'contentType',
					identifier: destType.scsIdentifier,
					instanceID: destType.scsInstanceID,
					pageID: destType.scsPageID,
					name: destType.scsTypeName
				});
			}
		});

		// console.log(' - itemsUsedAdded: \n' + JSON.stringify(itemsUsedAdded, null, 4));
		// console.log(' - itemsUsedDeleted: \n' + JSON.stringify(itemsUsedDeleted, null, 4));

		if (itemsUsedAdded.length === 0 && itemsUsedDeleted.length === 0) {
			console.info(' - no change for site used items')
			return resolve({});
		} else {
			serverUtils.setSiteUsedData(destServer, idcToken, destSite.id, itemsUsedAdded, itemsUsedDeleted)
				.then(function (result) {
					if (!result || result.err) {
						console.error('ERROR: failed to set site used data');
						return Promise.reject();
					}

					console.info(' - update site used items');
					return resolve({});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					return resolve({
						err: 'err'
					});
				});
		}
	});

};

var _getPages = function (server, pageFiles) {
	return new Promise(function (resolve, reject) {
		var pageData = [];
		var doQueryPage = pageFiles.reduce(function (pagePromise, pageFile) {
			return pagePromise.then(function (result) {
				return serverRest.downloadFile({
					server: server,
					fFileGUID: pageFile.fileId
				}).then(function (result) {
					var pageSource = {};
					if (result && result.data) {
						try {
							pageSource = JSON.parse(result.data);
						} catch (e) {
							// validate
						}
					}
					pageData.push({
						id: pageFile.pageId,
						data: pageSource
					})
				})
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQueryPage.then(function (result) {
			resolve(pageData);
		});

	});
};

var _getContentListQueryString = function (type, limit, offset, orderBy, categoryFilters, queryString, locale) {
	var str = 'fields=ALL';
	var q = '';
	if (orderBy) {
		if (orderBy.indexOf('updateddate') >= 0) {
			orderBy = serverUtils.replaceAll(orderBy, 'updateddate', 'updatedDate');
		}
		str = str + '&orderBy=' + orderBy;
	}
	if (limit) {
		str = str + '&limit=' + limit;
	}
	if (offset) {
		str = str + '&offset=' + offset;
	}
	if (type) {
		if (locale) {
			q = '(type eq "' + type + '") and (language eq "' + locale + '" or translatable eq "false")';
		} else {
			q = '(type eq "' + type + '")';
		}
	}
	if (categoryFilters && categoryFilters.length > 0) {
		let taxq = '';
		categoryFilters.forEach(function (tax) {
			if (tax.taxonomy && tax.categories && tax.categories.length > 0) {
				let catq = '';
				for (let i = 0; i < tax.categories.length; i++) {
					if (catq) {
						catq = catq + ' or ';
					}
					catq = catq + 'taxonomies.categories.nodes.id eq "' + tax.categories[i] + '"';
				}
				if (catq) {
					if (taxq) {
						taxq = taxq + ' and ';
					}
					taxq = taxq + '(' + catq + ')';
				}
			}
		});
		if (taxq) {
			q = q + ' and ' + taxq;
		}
	}
	if (queryString) {
		q = q + ' and (' + queryString + ')';
	}
	if (q) {
		str = str + '&q=(' + q + ')';
	}
	return str;
};

//
// Get components, content items on the pages
//
var _getPageInfo = function (siteId, pages, locale) {
	const _ootbComps = ["scs-title", "scs-paragraph", "scs-text", "scs-text-link", "scs-button", "scs-divider",
		"scs-spacer", "scs-contentitem", "scs-contentplaceholder", "scs-contentlist", "scs-contentsearch",
		"scs-recommendation", "scs-image", "scs-gallery", "scs-gallerygrid", "scs-youtube", "scs-video",
		"scs-document", "Folder List", "File List", "Documents Manager", "Project Library", "scs-socialbar",
		"Facebook Like", "Twitter Follow", "Twitter Share", "Facebook Recommend", "Conversation", "Conversation List",
		"Start Form", "Task List", "Task Details", "scs-opainterview", "scs-cobrowse", "scs-map", "scs-comp-article",
		"scs-comp-headline", "scs-comp-image-text", "scs-componentgroup", "scs-sl-horizontal", "scs-sl-slider",
		"scs-sl-tabs", "scs-sl-three-columns", "scs-sl-two-columns", "scs-sl-vertical"];
	var components = [];
	var itemIds = [];
	var contentTypes = [];
	var contentListQueries = [];
	var contentNames = [];
	var siteUsedData = [];

	var _getInstanceInfo = function (siteId, pageId, compInstanceId, comp) {
		var data = comp.data || {};
		// collect content items, content lists and components
		if (comp.id === 'scs-contentitem' || (comp.id === 'scsCaaSLayout' && comp.type === 'scs-component')) {
			if (data.contentId && !itemIds.includes(data.contentId)) {
				itemIds.push(data.contentId);

				if (compInstanceId) {
					siteUsedData.push({
						type: 'contentItem',
						identifier: siteId,
						instanceID: compInstanceId,
						pageID: pageId,
						contentItemID: data.contentId,
						version: data.contentViewing || 'draft'
					});
				}
			}
			if (data.contentTypes && data.contentTypes.length > 0 && data.contentTypes[0]) {
				if (!contentTypes.includes(data.contentTypes[0])) {
					contentTypes.push(data.contentTypes[0]);

					if (compInstanceId) {
						siteUsedData.push({
							type: 'contentType',
							identifier: siteId,
							instanceID: compInstanceId,
							pageID: pageId,
							name: data.contentTypes[0]
						});
					}
				}
			}
		} else if (comp.id === 'scs-image' || comp.id === 'scs-gallery' || comp.id === 'scs-video') {
			if (data.contentIds) {
				for (let k = 0; k < data.contentIds.length; k++) {
					if (!itemIds.includes(data.contentIds[k])) {
						itemIds.push(data.contentIds[k]);

						if (compInstanceId) {
							siteUsedData.push({
								type: 'contentItem',
								identifier: siteId,
								instanceID: compInstanceId,
								pageID: pageId,
								contentItemID: data.contentIds[k],
								version: data.contentViewing || 'draft'
							});
						}
					}
				}
			}
		} else if (comp.id === 'scs-contentlist') {
			if (data.contentTypes[0]) {
				let type = data.contentTypes[0];
				let offset = data.firstItem;
				let limit = data.maxResults;
				let orderBy = data.sortOrder;
				var categoryFilters = data.categoryFilters;
				let queryString = data.queryString;
				let str = _getContentListQueryString(type, limit, offset, orderBy, categoryFilters, queryString, locale);
				contentListQueries.push(str);
				if (!contentTypes.includes(type)) {
					contentTypes.push(type);

					if (compInstanceId) {
						siteUsedData.push({
							type: 'contentType',
							identifier: siteId,
							instanceID: compInstanceId,
							pageID: pageId,
							name: data.contentTypes[0]
						});
					}
				}
			}
		} else if (!_ootbComps.includes(comp.id) && (comp.type === 'scs-component' || comp.type === 'scs-app')) {
			// custom component
			var name = comp.type === 'scs-component' ? comp.id : data.appName;
			if (name && name !== comp.type) {
				if (!components.includes(name)) {
					components.push(name);

					if (compInstanceId) {
						siteUsedData.push({
							type: 'component',
							identifier: siteId,
							instanceID: compInstanceId,
							pageID: pageId,
							name: name
						});
					}
				}
			}
		}
		if (data.imageUrl && data.imageUrl.startsWith('[!--$SCS_CONTENT_URL--]/')) {
			let file = data.imageUrl.substring(data.imageUrl.indexOf('/') + 1);
			if (file && !contentNames.includes(file)) {
				contentNames.push(file);
			}
		}
		if (data.images && data.images.length > 0) {
			data.images.forEach(function (image) {
				if (image.source && image.source.startsWith('[!--$SCS_CONTENT_URL--]/')) {
					let file = image.source.substring(image.source.indexOf('/') + 1);
					if (file && !contentNames.includes(file)) {
						contentNames.push(file);
					}
				}
			});
		}
	};

	for (var i = 0; i < pages.length; i++) {
		var pageId = pages[i].id;
		var componentInstances = pages[i].data.componentInstances || {};
		Object.keys(componentInstances).forEach(function (key) {
			var comp = componentInstances[key];
			_getInstanceInfo(siteId, pageId, key, comp);

			if (comp.data.nestedComponents && comp.data.nestedComponents.length > 0) {
				for (let i = 0; i < comp.data.nestedComponents.length; i++) {
					//nested components do not have instance Id
					_getInstanceInfo(siteId, pageId, '', comp.data.nestedComponents[i]);
				}
			}
		});
	}

	return ({
		components: components,
		items: itemIds,
		types: contentTypes,
		contentLists: contentListQueries,
		content: contentNames,
		siteUsedData: siteUsedData
	});
};

var _updateSitePageUsedData = function (destServer, idcToken, destSite, pageIds, siteUsedData, destSiteUsedData) {
	return new Promise(function (resolve, reject) {
		// console.log(JSON.stringify(siteUsedData, null, 4));
		// console.log(JSON.stringify(destSiteUsedData, null, 4));

		var itemsUsedAdded = [];
		var itemsUsedDeleted = [];

		// the value in pageIds is number 
		// components to add
		siteUsedData.componentsUsed.forEach(function (comp) {
			if (pageIds.includes(parseInt(comp.scsPageID))) {
				var found = false;
				for (var i = 0; i < destSiteUsedData.componentsUsed.length; i++) {
					var destComp = destSiteUsedData.componentsUsed[i];
					if (comp.scsPageID === destComp.scsPageID &&
						comp.scsInstanceID === destComp.scsInstanceID &&
						comp.scsComponentName === destComp.scsComponentName) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedAdded.push({
						type: 'component',
						identifier: destSite.id,
						instanceID: comp.scsInstanceID,
						pageID: comp.scsPageID,
						name: comp.scsComponentName
					});
				}
			}
		});

		// components to delete
		destSiteUsedData.componentsUsed.forEach(function (destComp) {
			if (pageIds.includes(parseInt(destComp.scsPageID))) {
				var found = false;
				for (var i = 0; i < siteUsedData.componentsUsed.length; i++) {
					var comp = siteUsedData.componentsUsed[i];
					if (comp.scsPageID === destComp.scsPageID &&
						comp.scsInstanceID === destComp.scsInstanceID &&
						comp.scsComponentName === destComp.scsComponentName) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedDeleted.push({
						type: 'component',
						identifier: destComp.scsIdentifier,
						instanceID: destComp.scsInstanceID,
						pageID: destComp.scsPageID,
						name: destComp.scsComponentName
					});
				}
			}
		});

		// content items to add 
		siteUsedData.contentItemsUsed.forEach(function (item) {
			if (pageIds.includes(parseInt(item.scsPageID))) {
				var found = false;
				for (var i = 0; i < destSiteUsedData.contentItemsUsed.length; i++) {
					var destItem = destSiteUsedData.contentItemsUsed[i];
					if (item.scsPageID === destItem.scsPageID &&
						item.scsInstanceID === destItem.scsInstanceID &&
						item.scsContentItemID === destItem.scsContentItemID) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedAdded.push({
						type: 'contentItem',
						identifier: destSite.id,
						instanceID: item.scsInstanceID,
						pageID: item.scsPageID,
						contentItemID: item.scsContentItemID,
						version: item.scsVersion
					});
				}
			}
		});

		// content items to delete 
		destSiteUsedData.contentItemsUsed.forEach(function (destItem) {
			if (pageIds.includes(parseInt(destItem.scsPageID))) {
				var found = false;
				for (var i = 0; i < siteUsedData.contentItemsUsed.length; i++) {
					var item = siteUsedData.contentItemsUsed[i];
					if (item.scsPageID === destItem.scsPageID &&
						item.scsInstanceID === destItem.scsInstanceID &&
						item.scsContentItemID === destItem.scsContentItemID) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedDeleted.push({
						type: 'contentItem',
						identifier: destItem.scsIdentifier,
						instanceID: destItem.scsInstanceID,
						pageID: destItem.scsPageID,
						contentItemID: destItem.scsContentItemID
					});
				}
			}
		});

		// content types to add 
		siteUsedData.contentTypesUsed.forEach(function (type) {
			if (pageIds.includes(parseInt(type.scsPageID))) {
				var found = false;
				for (var i = 0; i < destSiteUsedData.contentTypesUsed.length; i++) {
					var destType = destSiteUsedData.contentTypesUsed[i];
					if (type.scsPageID === destType.scsPageID &&
						type.scsInstanceID === destType.scsInstanceID &&
						type.scsTypeName === destType.scsTypeName) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedAdded.push({
						type: 'contentType',
						identifier: destSite.id,
						instanceID: type.scsInstanceID,
						pageID: type.scsPageID,
						name: type.scsTypeName
					});
				}
			}
		});
		// content types to delete 
		destSiteUsedData.contentTypesUsed.forEach(function (destType) {
			if (pageIds.includes(parseInt(destType.scsPageID))) {
				var found = false;
				for (var i = 0; i < siteUsedData.contentTypesUsed.length; i++) {
					var type = siteUsedData.contentTypesUsed[i];
					if (type.scsPageID === destType.scsPageID &&
						type.scsInstanceID === destType.scsInstanceID &&
						type.scsTypeName === destType.scsTypeName) {
						found = true;
						break;
					}
				}
				if (!found) {
					itemsUsedDeleted.push({
						type: 'contentType',
						identifier: destType.scsIdentifier,
						instanceID: destType.scsInstanceID,
						pageID: destType.scsPageID,
						name: destType.scsTypeName
					});
				}
			}
		});

		// console.log(' - itemsUsedAdded: \n' + JSON.stringify(itemsUsedAdded, null, 4));
		// console.log(' - itemsUsedDeleted: \n' + JSON.stringify(itemsUsedDeleted, null, 4));

		if (itemsUsedAdded.length === 0 && itemsUsedDeleted.length === 0) {
			console.info(' - no change for site used items')
			return resolve({});
		} else {
			serverUtils.setSiteUsedData(destServer, idcToken, destSite.id, itemsUsedAdded, itemsUsedDeleted)
				.then(function (result) {
					if (!result || result.err) {
						console.error('ERROR: failed to set site used data for pages');
						return Promise.reject();
					}

					console.info(' - update site used data for pages');
					return resolve({});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					return resolve({
						err: 'err'
					});
				});
		}
	});
};

var _executeContentListQueries = function (server, channelToken, queries) {
	var items = [];
	return new Promise(function (resolve, reject) {
		if (queries.length === 0) {
			return resolve(items);
		} else {
			var itemPromises = [];
			queries.forEach(function (q) {
				let url = '/content/management/api/v1.1/items?' + q + '&channelToken=' + channelToken;
				itemPromises.push(serverRest.executeGet({
					server: server,
					endpoint: url,
					noMsg: true
				}));
			})
			Promise.all(itemPromises).then(function (results) {
				results.forEach(function (result) {
					var data;
					try {
						data = JSON.parse(result);
					} catch (e) {
						// validate
					}
					if (data && data.items && data.items.length > 0) {
						items = items.concat(data.items);
					}
				})
				return resolve(items);
			});
		}
	});
};

var _transferSiteContent = function (server, destServer, site, destSite, name, fileNames) {
	return new Promise(function (resolve, reject) {
		if (fileNames.length === 0) {
			return resolve({});
		} else {
			var folderPromises = [];
			folderPromises.push(serverRest.findFolderHierarchy({
				server: server,
				parentID: site.id,
				folderPath: 'content'
			}));
			folderPromises.push(serverRest.findFolderHierarchy({
				server: destServer,
				parentID: destSite.id,
				folderPath: 'content'
			}));

			var srcContentFolderId, destContentFolderId;
			var files = [];
			var targetFolder;

			Promise.all(folderPromises)
				.then(function (results) {
					srcContentFolderId = results && results[0] && results[0].id;
					destContentFolderId = results && results[1] && results[1].id;
					if (!srcContentFolderId || !destContentFolderId) {
						return Promise.reject();
					}

					return serverRest.getAllChildItems({ server: server, parentID: srcContentFolderId });
				})
				.then(function (result) {
					var contentFiles = result || [];
					// find the fileGUID of the content files on the source sercer
					fileNames.forEach(function (name) {
						var found = false;
						for (let i = 0; i < contentFiles.length; i++) {
							if (name === contentFiles[i].name) {
								files.push(contentFiles[i]);
								found = true;
							}
						}
						if (!found) {
							console.error('ERROR: file ' + name + ' not found');
						}
					});

					if (files.length === 0) {
						return Promise.reject();
					}
					// save to src/documents/<name>/
					targetFolder = path.join(documentsSrcDir, name);
					if (!fs.existsSync(targetFolder)) {
						fs.mkdirSync(targetFolder);
					}
					var downloadPromises = [];
					files.forEach(function (file) {
						var targetFile = path.join(targetFolder, file.name);
						downloadPromises.push(serverRest.downloadFileSave({
							server: server,
							fFileGUID: file.id,
							saveTo: targetFile
						}));
					});

					return Promise.all(downloadPromises);

				})
				.then(function (results) {
					var uploadPromises = [];
					files.forEach(function (file) {
						var targetFile = path.join(targetFolder, file.name);
						if (fs.existsSync(targetFile)) {
							uploadPromises.push(serverRest.createFile({
								server: destServer,
								parentID: destContentFolderId,
								filename: file.name,
								contents: fs.createReadStream(targetFile)
							}));
						}
					});

					return Promise.all(uploadPromises);
				})
				.then(function (results) {
					return resolve(results);
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					return resolve({});
				});

		}
	});
};

var _getChildPages = function (structureJson, parentId, childIds) {
	var pages = structureJson && structureJson.pages || [];
	for (let i = 0; i < pages.length; i++) {
		if (pages[i].id.toString() === parentId.toString()) {
			if (pages[i].children && pages[i].children.length > 0) {
				for (let j = 0; j < pages[i].children.length; j++) {
					childIds.push(pages[i].children[j]);
				}
				for (let j = 0; j < pages[i].children.length; j++) {
					_getChildPages(structureJson, pages[i].children[j], childIds);
				}
			}
		}
	}
};

var _addPagesToStructure = function (server, site, srcSiteStructure, destSiteStructure, pageIds) {
	return new Promise(function (resolve, reject) {
		if (pageIds.length === 0) {
			return resolve({});
		} else {
			// first add the each page to site structure
			pageIds.forEach(function (pageId) {
				let pageNode = undefined;
				for (let i = 0; i < srcSiteStructure.pages.length; i++) {
					if (pageId == srcSiteStructure.pages[i].id) {
						pageNode = srcSiteStructure.pages[i];
						break;
					}
				}
				if (pageNode) {
					destSiteStructure.pages.push(pageNode);
				}
			});
			// add the page to its parent's children array
			pageIds.forEach(function (pageId) {
				let parentId = undefined;
				for (let i = 0; i < srcSiteStructure.pages.length; i++) {
					if (pageId == srcSiteStructure.pages[i].id) {
						parentId = srcSiteStructure.pages[i].parentId;
						break;
					}
				}

				if (parentId) {
					let srcChildren = [];
					for (let i = 0; i < srcSiteStructure.pages.length; i++) {
						if (parentId == srcSiteStructure.pages[i].id) {
							srcChildren = srcSiteStructure.pages[i].children;
							break;
						}
					}

					let idx = srcChildren.indexOf(pageId);
					for (let i = 0; i < destSiteStructure.pages.length; i++) {
						if (parentId == destSiteStructure.pages[i].id && !destSiteStructure.pages[i].children.includes(pageId)) {
							if (idx >= destSiteStructure.pages[i].children.length) {
								destSiteStructure.pages[i].children.push(pageId);
							} else {
								destSiteStructure.pages[i].children.splice(idx, 0, pageId);
							}
							break;
						}
					}
				}
			});
			// update the site structure
			let fileName = 'structure.json';
			let filePath = path.join(documentsSrcDir, site.name, fileName);
			fs.writeFileSync(filePath, JSON.stringify(destSiteStructure, null, 4));
			serverRest.createFile({
				server: server,
				parentID: site.id,
				filename: fileName,
				contents: fs.createReadStream(filePath)
			}).then(function (result) {
				return resolve(result);
			});
		}
	});
};

/**
 * Transfer site pages
 */
module.exports.transferSitePage = function (argv, done) {
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
		console.error('ERROR: source and destination server are the same');
		done();
		return;
	}

	var siteName = argv.name;
	var pageIds = typeof argv.pages === 'number' ? [argv.pages] : argv.pages.split(',');
	for (let i = 0; i < pageIds.length; i++) {
		pageIds[i] = parseInt(pageIds[i]);
	}

	var srcSite, destSite;
	var srcSiteChannelToken;
	var srcSiteStructure, destSiteStructure;
	var validPageIds = [];
	var validPageParentIds = [];
	var pageIdsToTransfer = [];
	var pageIdsToUpdate = [];
	var pageIdsToCreate = [];
	// an array of page json objects
	var pageData = [];
	// names of components on the pages
	var components = [];
	// ID of items on the pages
	var itemIds = [];
	// content list queries
	var contentListQueries = [];
	// files under site content folder
	var content = [];

	var contentName = 'page' + pageIds[0] + 'items' + serverUtils.createGUID();
	contentName = contentName.substring(0, 40);

	var siteContentName = serverUtils.replaceAll(contentName, 'items', 'content');

	var srcPagesFolderId;
	var destPagesFolderId;

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + destServer.url);
				return Promise.reject();
			}

			// verify site on source server
			return sitesRest.getSite({
				server: server,
				name: siteName,
				expand: 'channel'
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				console.error('ERROR: site ' + siteName + ' does not exist on source server');
				return Promise.reject();
			}
			srcSite = result;
			let tokens = srcSite.channel && srcSite.channel.channelTokens || [];
			for (var i = 0; i < tokens.length; i++) {
				if (tokens[i].name === 'defaultToken') {
					srcSiteChannelToken = tokens[i].token;
					break;
				}
			}
			if (!srcSiteChannelToken && tokens.length > 0) {
				srcSiteChannelToken = tokens[0].value;
			}
			console.info(' - verify site on source server (Id: ' + srcSite.id + ', channelToken: ' + srcSiteChannelToken + ')');

			// verify site on target server
			return sitesRest.getSite({
				server: destServer,
				name: siteName,
				expand: 'repository'
			});
		})
		.then(function (result) {
			if (!result || result.err || !result.id) {
				console.error('ERROR: site ' + siteName + ' does not exist on destination server');
				return Promise.reject();
			}
			destSite = result;
			if (!destSite.repository || !destSite.repository.id) {
				console.error('ERROR: site ' + siteName + ' repository not found on destination server');
				return Promise.reject();
			}
			console.info(' - verify site on destination server (Id: ' + destSite.id + ', repository: ' + destSite.repository.name + ')');

			// get site structure
			return documentUtils.getFile({ file: 'site:' + siteName + '/structure.json' }, server);
		})
		.then(function (result) {
			if (!result || result.err || !result.data) {
				console.error('ERROR: failed to get site structure on source server');
				return Promise.reject();
			}
			try {
				srcSiteStructure = JSON.parse(result.data);
			} catch (e) {
				// validate
			}
			if (!srcSiteStructure) {
				console.error('ERROR: site structure on source server is invalid');
				return Promise.reject();
			}

			// validate the pages
			for (let i = 0; i < pageIds.length; i++) {
				let found = false;
				for (let j = 0; j < srcSiteStructure.pages.length; j++) {
					if (pageIds[i] == srcSiteStructure.pages[j].id) {
						found = true;
						validPageIds.push(pageIds[i]);
						validPageParentIds.push(srcSiteStructure.pages[j].parentId || 'root');
						break;
					}
				}
				if (!found) {
					console.error('ERROR: invalid page ID ' + pageIds[i]);
				}
			}
			if (validPageIds.length === 0) {
				console.error('ERROR: no valid page to transfer');
				return Promise.reject();
			}

			// get site structure on target server
			return documentUtils.getFile({ file: 'site:' + siteName + '/structure.json' }, destServer);
		})
		.then(function (result) {
			if (!result || result.err || !result.id || !result.data) {
				console.error('ERROR: failed to get site structure on destination server');
				return Promise.reject();
			}
			try {
				destSiteStructure = JSON.parse(result.data);
			} catch (e) {
				// validate
			}
			if (!destSiteStructure) {
				console.error('ERROR: site structure on destination server is invalid');
				return Promise.reject();
			}

			// validate the pages
			for (let i = 0; i < validPageIds.length; i++) {
				let found = false;
				for (let j = 0; j < destSiteStructure.pages.length; j++) {
					if (validPageIds[i] == destSiteStructure.pages[j].id) {
						found = true;
						break;
					}
				}
				if (found) {
					pageIdsToUpdate.push(validPageIds[i]);
				} else {
					// verify new page's parent exist on the target
					let parentId = validPageParentIds[i];
					let foundParent = false;
					if (parentId) {
						for (let j = 0; j < destSiteStructure.pages.length; j++) {
							if (parentId == destSiteStructure.pages[j].id) {
								foundParent = true;
								break;
							}
						}
					}
					if (parentId && !foundParent) {
						console.error('ERROR: page ' + validPageIds[i] + '\'s parent page ' + parentId + '  does not exist on destination server');
					} else {
						pageIdsToCreate.push(validPageIds[i]);
					}
				}
			}
			if (pageIdsToCreate.length === 0 && pageIdsToUpdate.length === 0) {
				console.error('ERROR: no valid page to transfer');
				return Promise.reject();
			}

			if (pageIdsToCreate.length > 0) {
				// all child pages will be transferred
				pageIdsToCreate.forEach(function (parentId) {
					let childIds = [];
					_getChildPages(srcSiteStructure, parentId, childIds);
					// console.log(' - page ' + parentId + ' children: ' + childIds);
					pageIdsToCreate = pageIdsToCreate.concat(childIds);
				});
			}

			console.info(' - pages to update: ' + pageIdsToUpdate);
			console.info(' - pages to create: ' + pageIdsToCreate);

			pageIdsToTransfer = pageIdsToCreate.concat(pageIdsToUpdate);

			// find folder pages on the source server 
			return serverRest.findFolderHierarchy({
				server: server,
				parentID: srcSite.id,
				folderPath: 'pages'
			});

		})
		.then(function (result) {
			if (!result || !result.id) {
				return Promise.reject();
			}
			srcPagesFolderId = result.id;

			// get page file ids 
			return serverRest.getAllChildItems({
				server: server,
				parentID: srcPagesFolderId
			});

		})
		.then(function (result) {
			let pageFiles = result || [];
			let pageFileIds = [];
			pageIdsToTransfer.forEach(function (id) {
				let pageName = id + '.json';
				for (let i = 0; i < pageFiles.length; i++) {
					if (pageName === pageFiles[i].name) {
						pageFileIds.push({
							pageId: id,
							fileId: pageFiles[i].id
						});
					}
				}
			});
			// console.log(pageFileIds);

			return _getPages(server, pageFileIds);

		})
		.then(function (result) {
			pageData = result;

			var pageContent = _getPageInfo(srcSite.id, pageData, srcSite.defaultLanguage);
			components = pageContent && pageContent.components || [];
			itemIds = pageContent && pageContent.items || [];
			contentListQueries = pageContent && pageContent.contentLists || [];
			content = pageContent && pageContent.content || [];

			console.info(' - components: ' + components);
			console.info(' - content items: ' + itemIds);
			console.info(' - content lists: ' + contentListQueries);
			console.info(' - site content: ' + content);

			// execute content list queries to get the items to download
			return _executeContentListQueries(server, srcSiteChannelToken, contentListQueries);

		})
		.then(function (result) {

			if (result && result.length > 0) {
				result.forEach(function (item) {
					if (!itemIds.includes(item.id)) {
						itemIds.push(item.id);
					}
				});
			}

			// download all components
			var downloadCompPromises = [];
			if (components.length > 0) {
				let noMsg = true;
				downloadCompPromises.push(componentUtils.downloadComponents(server, components, argv, noMsg));
			}

			return Promise.all(downloadCompPromises);

		})
		.then(function (results) {
			if (components.length > 0 && results[0].err) {
				return Promise.reject();
			}

			// export the components first
			let downloadCompPromises = [];
			if (components.length > 0) {
				let exportArgv = {
					component: components.join(','),
					projectDir: projectDir,
					noOptimize: true,
					noMsg: true
				};
				downloadCompPromises.push(componentUtils.exportComponents(exportArgv));
			}
			return Promise.all(downloadCompPromises);

		})
		.then(function (results) {
			if (components.length > 0 && results[0].err) {
				return Promise.reject();
			}

			let uploadCompPromises = [];
			if (components.length > 0) {
				let folder = '';
				let folderId = 'self';
				let publish = false;
				let comps = [];
				for (let i = 0; i < components.length; i++) {
					let zipfile = path.join(projectDir, "dist", components[i]) + ".zip";
					if (fs.existsSync(zipfile)) {
						comps.push({
							name: components[i],
							zipfile: zipfile
						});
					}
				}
				let noMsg = false;
				let noDocMsg = true;
				uploadCompPromises.push(componentUtils.uploadComponents(destServer, folder, folderId, comps, publish, noMsg, noDocMsg));
			}

			// upload all components to the target server
			return Promise.all(uploadCompPromises);

		})
		.then(function (results) {
			if (components.length > 0 && results[0].err) {
				return Promise.reject();
			}

			// download content items
			var donwloadItemPromises = [];
			if (itemIds.length > 0) {
				let downloadItemArgv = { projectDir: projectDir, server: server, assetGUIDS: itemIds, name: contentName };
				donwloadItemPromises.push(contentUtils.downloadContent(downloadItemArgv));
			}

			return Promise.all(donwloadItemPromises);

		})
		.then(function (results) {
			if (itemIds.length > 0 && results[0].err) {
				return Promise.reject();
			}

			var uploadItemPromises = [];
			if (itemIds.length > 0) {
				let fileFolder = path.join(projectDir, 'dist');
				let fileName = contentName + '_export.zip';
				let uploadItemArgv = {
					argv: argv,
					server: destServer,
					isFile: true,
					filePath: path.join(fileFolder, fileName),
					repositoryName: destSite.repository.name,
					channelName: destSite.name,
					collectionName: destSite.name + ' Site',
					reuseContent: true,
					contentpath: fileFolder,
					contentfilename: fileName
				};
				uploadItemPromises.push(contentUtils.uploadContent(uploadItemArgv));
			}

			return Promise.all(uploadItemPromises);

		})
		.then(function (results) {
			if (itemIds.length > 0 && results[0].err) {
				return Promise.reject();
			}

			// transfer site content
			return _transferSiteContent(server, destServer, srcSite, destSite, siteContentName, content);

		})
		.then(function (result) {
			if (result && result.length > 0 && result[0].id) {
				console.info(' - site content transferred')
			}

			// find folder pages on the target server 
			return serverRest.findFolderHierarchy({
				server: destServer,
				parentID: destSite.id,
				folderPath: 'pages'
			});

		})
		.then(function (result) {
			if (!result || !result.id) {
				return Promise.reject();
			}
			destPagesFolderId = result.id;

			if (!fs.existsSync(path.join(documentsSrcDir, siteName))) {
				fs.mkdirSync(path.join(documentsSrcDir, siteName));
			}
			if (!fs.existsSync(path.join(documentsSrcDir, siteName, 'pages'))) {
				fs.mkdirSync(path.join(documentsSrcDir, siteName, 'pages'));
			}
			var uploadPagePromises = [];
			pageData.forEach(function (page) {
				let fileName = page.id + '.json';
				let filePath = path.join(documentsSrcDir, siteName, 'pages', fileName);
				fs.writeFileSync(filePath, JSON.stringify(page.data, null, 4));
				uploadPagePromises.push(serverRest.createFile({
					server: destServer,
					parentID: destPagesFolderId,
					filename: fileName,
					contents: fs.createReadStream(filePath)
				}));
			});

			return Promise.all(uploadPagePromises);

		})
		.then(function (results) {

			pageData.forEach(function (page) {
				let updated = false;
				for (let i = 0; i < results.length; i++) {
					if (page.id + '.json' === results[i].name) {
						updated = true;
						break;
					}
				}
				if (updated) {
					if (pageIdsToCreate.includes(parseInt(page.id))) {
						console.info(' - created page ' + page.id);
					} else {
						console.info(' - updated page ' + page.id);
					}
				} else {
					if (pageIdsToCreate.includes(parseInt(page.id))) {
						console.error(' - failed to create page ' + page.id);
					} else {
						console.error(' - failed to update page ' + page.id);
					}
				}
			});

			return _addPagesToStructure(destServer, destSite, srcSiteStructure, destSiteStructure, pageIdsToCreate);

		})
		.then(function (result) {
			if (pageIdsToCreate.length > 0) {
				if (!result || result.err) {
					return Promise.reject();
				} else {
					console.info(' - added new pages to site structure');
				}
			}

			// get site metadata
			var getUsedDataPromises = [];
			getUsedDataPromises.push(serverUtils.getIdcToken(destServer));
			getUsedDataPromises.push(serverUtils.getSiteUsedData(server, srcSite.id));
			getUsedDataPromises.push(serverUtils.getSiteUsedData(destServer, destSite.id));

			return Promise.all(getUsedDataPromises);

		})
		.then(function (results) {
			// update site used data for the pages
			return _updateSitePageUsedData(destServer, results[0] && results[0].idcToken,
				destSite, pageIdsToTransfer, results[1], results[2]);

		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log(' - transfer page ' + pageIdsToTransfer + ' finished');
			done(true);
		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			done();
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
		var theme = argv.theme;

		var usedContentOnly = typeof argv.usedcontentonly === 'string' && argv.usedcontentonly.toLowerCase() === 'true';
		var compileSite = typeof argv.compilesite === 'string' && argv.compilesite.toLowerCase() === 'true';
		var staticOnly = typeof argv.staticonly === 'string' && argv.staticonly.toLowerCase() === 'true';
		var compileOnly = typeof argv.compileonly === 'string' && argv.compileonly.toLowerCase() === 'true';
		var fullpublish = typeof argv.fullpublish === 'string' && argv.fullpublish.toLowerCase() === 'true';
		var deletestaticfiles = typeof argv.deletestaticfiles === 'string' && argv.deletestaticfiles.toLowerCase() === 'true';

		var metadataName = argv.name;
		var metadataValue = argv.value ? argv.value : '';

		var expireDate = argv.expiredate;

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}
			// if (server.useRest) {
			_controlSiteREST(server, action, siteName, usedContentOnly, compileSite, staticOnly, compileOnly, fullpublish, theme,
				metadataName, metadataValue, expireDate, deletestaticfiles)
				.then(function (result) {
					if (result.err) {
						done(result.exitCode);
					} else {
						done(true);
					}
				});

		});

	} catch (e) {
		console.error(e);
		done();
	}

};


/**
 * Control site using REST APIs
 * @param {*} request 
 * @param {*} server 
 * @param {*} action 
 * @param {*} siteName 
 * @param {*} done 
 */
var _controlSiteREST = function (server, action, siteName, usedContentOnly, compileSite, staticOnly, compileOnly, fullpublish, newTheme,
	metadataName, metadataValue, expireDate, deletestaticfiles) {

	return new Promise(function (resolve, reject) {
		var exitCode;
		var goverancePromises = action === 'expire' ? [serverUtils.getSitesGovernance(server)] : [];
		Promise.all(goverancePromises)
			.then(function (results) {
				if (action === 'expire') {
					var governanceEnabled = results && results[0].sitesGovernanceEnabled;
					if (!governanceEnabled) {
						console.info('ERROR: governance for sites is not enabled');
						return Promise.reject();
					}
				}

				return sitesRest.getSite({
					server: server,
					name: siteName
				})
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var site = result;
				var runtimeStatus = site.runtimeStatus;
				var publishStatus = site.publishStatus;
				var themeName = site.themeName;

				console.info(' - get site: runtimeStatus: ' + runtimeStatus + '  publishStatus: ' + publishStatus + '  theme: ' + themeName);

				if (action === 'take-offline' && runtimeStatus === 'offline') {
					console.log(' - site is already offline');
					exitCode = 2;
					return Promise.reject();
				}
				if (action === 'bring-online' && runtimeStatus === 'online') {
					console.log(' - site is already online');
					exitCode = 2;
					return Promise.reject();
				}
				if (action === 'bring-online' && publishStatus === 'unpublished') {
					console.error('ERROR: site ' + siteName + ' is draft, publish it first');
					return Promise.reject();
				}

				if (action === 'unpublish' && runtimeStatus === 'online') {
					console.error('ERROR: site ' + siteName + ' is online, take it offline first');
					return Promise.reject();
				}
				if (action === 'unpublish' && publishStatus === 'unpublished') {
					console.error('ERROR: site ' + siteName + ' is draft');
					return Promise.reject();
				}
				if (action === 'set-theme' && themeName === newTheme) {
					console.log(' - site\'s theme is already ' + newTheme);
					exitCode = 2;
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
						compileOnly: compileOnly,
						fullpublish: fullpublish,
						deletestaticfiles: deletestaticfiles
					});
				} else if (action === 'publish-internal') {
					console.log(' - publish site using Idc service');
					actionPromise = _publishSiteInternal(server, site.id, site.name, usedContentOnly, compileSite, staticOnly, compileOnly, fullpublish, deletestaticfiles);

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
				} else if (action === 'set-theme') {

					actionPromise = sitesRest.setSiteTheme({
						server: server,
						site: site,
						themeName: newTheme
					});

				} else if (action === 'set-metadata') {

					actionPromise = _setSiteMetadata(server, site.id, site.name, metadataName, metadataValue);

				} else if (action === 'expire') {
					actionPromise = sitesRest.setSiteExpirationDate({
						server: server,
						name: siteName,
						expireDate: expireDate
					});
				} else {
					console.error('ERROR: invalid action ' + action);
					return Promise.reject();
				}

				return actionPromise;
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				if (action === 'bring-online') {
					console.log(' - site ' + siteName + ' is online now');
				} else if (action === 'take-offline') {
					console.log(' - site ' + siteName + ' is offline now');
				} else if (action === 'set-theme') {
					console.log(' - set theme to ' + newTheme);
				} else if (action === 'set-metadata') {
					if (metadataValue) {
						console.log(' - set site metadata ' + metadataName + ' to ' + metadataValue);
					} else {
						console.log(' - clear site metadata ' + metadataName);
					}
				} else if (action === 'expire') {
					console.log(' - site expires at ' + result.expiresAt);
				} else {
					console.log(' - ' + action + ' ' + siteName + ' finished');
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({
					err: 'err',
					exitCode: exitCode
				});
			});
	});
};

var _setSiteMetadata = function (server, siteId, siteName, metadataName, metadataValue) {
	return new Promise(function (resolve, reject) {
		serverUtils.getSiteMetadata(server, siteId, siteName)
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var metadata = result.metadata;
				var idcToken = result.idcToken;

				// validate metadata
				if (!metadata.hasOwnProperty(metadataName)) {
					console.error('ERROR: invalid site metadata ' + metadataName);
					return Promise.reject();
				}

				var values = {};
				values[metadataName] = metadataValue ? metadataValue : '';

				return serverUtils.setSiteMetadata(server, idcToken, siteId, values);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

/**
 * Publish a site using IdcService (compile site workaround)
 */
var _publishSiteInternal = function (server, siteId, siteName, usedContentOnly, compileSite, staticOnly, compileOnly, fullpublish, deletestaticfiles) {
	return new Promise(function (resolve, reject) {

		serverUtils.getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					console.error('ERROR: failed to get idcToken');
					return Promise.reject();
				}
				var url = server.url + '/documents/integration?IdcService=SCS_PUBLISH_SITE&IsJson=1';

				var body = {
					'idcToken': idcToken,
					'LocalData': {
						'IdcService': 'SCS_PUBLISH_SITE',
						item: 'fFolderGUID:' + siteId
					}
				};

				if (server.oauthtoken) {
					body.LocalData.token = server.oauthtoken;
				}

				if (usedContentOnly) {
					body.LocalData.publishUsedContentOnly = true;
				}
				if (compileSite) {
					body.LocalData.skipCompileSiteCheck = false;
				}
				if (staticOnly) {
					body.LocalData.doStaticFilePublishOnly = true;
				}
				if (compileOnly) {
					body.LocalData.doCompilePublishOnly = true;
				}
				if (fullpublish) {
					body.LocalData.doForceActivate = 1;
				}
				if (deletestaticfiles) {
					body.LocalData.doPurgeSiteStaticFiles = true;
				}

				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(body),
					json: true
				};

				serverUtils.showRequestOptions(postData);

				var request = require('../test/server/requestUtils.js').request;
				request.post(postData, function (err, response, body) {
					if (response && response.statusCode !== 200) {
						console.error('ERROR: Failed to publish site: ' + response.statusCode);
					}
					if (err) {
						console.error('ERROR: Failed to publish site');
						console.log(err);
						return reject({
							err: err
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						if (typeof body === 'object') {
							data = body;
						}
					}
					// console.log(data);
					if (!data || !data.LocalData || data.LocalData.StatusCode !== '0' || !data.LocalData.JobID) {
						// console.error('ERROR: failed to set site metadata ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
						var errorMsg = data && data.LocalData ? '- ' + data.LocalData.StatusMessage : '';
						console.error('ERROR: failed to publish site ' + errorMsg);
						return resolve({
							err: 'err'
						});
					} else {
						var jobId = data.LocalData.JobID;
						// console.log(' - job id: ' + jobId);
						var statusUrl = '/sites/management/api/v1/sites/_status/' + jobId;
						console.log(' - job status: ' + statusUrl);
						statusUrl = server.url + statusUrl + '?expand=site&links=none';
						var startTime = new Date();
						var needNewLine = false;
						var inter = setInterval(function () {
							var jobPromise = sitesRest.getBackgroundJobStatus({
								server: server,
								url: statusUrl
							});
							jobPromise.then(function (data) {
								// console.log(data);
								if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									var msg = data && data.message;
									if (data && data.error) {
										msg = msg + ' ' + (data.error.detail || data.error.title);
									}
									console.error('ERROR: failed to publish site ' + siteName + ' : ' + msg);
									return resolve({
										err: 'err'
									});
								} else if (data.completed && data.progress === 'succeeded') {
									clearInterval(inter);
									process.stdout.write(' - publish in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									process.stdout.write(os.EOL);
									return resolve({});
								} else {
									process.stdout.write(' - publish in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							});
						}, 5000);
					}
				});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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
					console.error('ERROR: site ' + name + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.info(' - verify site');

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
						console.info(' - verify groups');

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
								console.error('ERROR: group ' + groupNames[i] + ' does not exist');
							}
						}
					}

					var usersPromises = [];
					for (let i = 0; i < userNames.length; i++) {
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
						console.info(' - verify users');
					}
					// verify users
					for (var k = 0; k < userNames.length; k++) {
						var found = false;
						for (let i = 0; i < allUsers.length; i++) {
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
							console.error('ERROR: user ' + userNames[k] + ' does not exist');
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

					for (let i = 0; i < groups.length; i++) {
						let newMember = true;
						for (let j = 0; j < existingMembers.length; j++) {
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
							console.error('ERROR: ' + results[i].title);
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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
					console.error('ERROR: site ' + name + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.info(' - verify site');

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
						console.info(' - verify groups');

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
								console.error('ERROR: group ' + groupNames[i] + ' does not exist');
							}
						}
					}

					var usersPromises = [];
					for (let i = 0; i < userNames.length; i++) {
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
						console.info(' - verify users');
					}
					// verify users
					for (var k = 0; k < userNames.length; k++) {
						var found = false;
						for (let i = 0; i < allUsers.length; i++) {
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
							console.error('ERROR: user ' + userNames[k] + ' does not exist');
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

					for (let i = 0; i < groups.length; i++) {
						let existingUser = false;
						for (let j = 0; j < existingMembers.length; j++) {
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
							console.error('ERROR: ' + results[i].title);
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
 * Delete a site
 */
module.exports.deleteSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;

	var permanent = typeof argv.permanent === 'string' && argv.permanent.toLowerCase() === 'true';

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var exitCode;

		sitesRest.getSite({
			server: server,
			name: name,
			includeDeleted: true
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var site = result;

			console.info(' - site GUID: ' + site.id);
			if (site.isDeleted) {
				console.log(' - site is already in the trash');

				if (!permanent) {
					console.log(' - run the command with parameter --permanent to delete permanently');
					exitCode = 2;
					return Promise.reject();
				}
			}

			return sitesRest.deleteSite({
				server: server,
				name: name,
				hard: permanent
			});
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (permanent) {
					console.log(' - site ' + name + ' deleted permanently');
				} else {
					console.log(' - site ' + name + ' deleted');
				}

				done(true);
			})
			.catch((error) => {
				done(exitCode);
			});

	}); // login
};


/**
 * export site
 */
module.exports.exportSite = function (argv, done) {
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
		var jobName = argv.jobname || argv.name;
		var includeunpublishedassets = argv.includeunpublishedassets;

		// folder path on the server
		var folder = argv.folder && argv.folder.toString();
		if (folder === '/') {
			folder = '';
		} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
			console.error('ERROR: invalid folder');
			done();
			return;
		}

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var promises = [];
			promises.push(sitesRest.getSite({
				server: server,
				name: siteName
			}));

			if (folder && folder.length > 0) {
				// Find info about the folder specified
				promises.push(serverRest.findFolderHierarchy({
					server: server,
					parentID: 'self',
					folderPath: folder
				}));
			} else {
				// If folder is not specified, then export site to user home folder.
				// Find user home folder info
				promises.push(serverRest.getFile({
					server: server,
					id: 'self'
				}));
			}

			Promise.all(promises)
				.then(function (results) {
					var siteInfo = results[0],
						folderInfo = results[1],
						folderId;

					// Handle site problem
					if (!siteInfo.id) {
						console.error('ERROR: Site ' + siteName + ' is not found');
						done();
						return;
					}

					// Handle export folder problem
					if (!folderInfo.id) {
						console.error('ERROR: Export folder is not found');
						done();
						return;
					}

					if (folderInfo.id === 'self') {
						// Export site to user home folder. Export API supports F:USER:<user-Id> format only.
						folderId = 'F:USER:' + folderInfo.name;
					} else {
						folderId = folderInfo.id;
					}

					sitesRest.exportSite({
						server: server,
						name: jobName,
						siteName: siteName,
						siteId: siteInfo.id,
						folderId: folderId,
						includeunpublishedassets: (includeunpublishedassets === true) || (includeunpublishedassets === 'true') || false
					}).then(function (data) {
						_downloadReports(data.reports, siteName, server).then(function () {

							if (data.job && data.job.progress === 'succeeded' && argv.download && data.job.target && data.job.target.docs && data.job.target.docs.result) {
								var exportFolderName = data.job.target.docs.result.folderName;

								// Download option
								// If no download path is specified, then save to src/siteExport/<siteName>
								// If download path is specified, then save to the specified path.

								// TODO: Use job name temporary. Might need to get the site name.
								var targetPath = path.join(projectDir, 'src', 'siteExport', data.job.name);

								// Remove target path if exists.
								if (fs.existsSync(targetPath)) {
									// TODO: Is warning necessary before removing existing folder?
									fileUtils.remove(targetPath);
								}

								// Create target path
								fs.mkdirSync(targetPath, {
									recursive: true
								});

								var folderId = data.job.target.docs.folderId;
								var downloadArgv = {
									parentId: folderId,
									path: exportFolderName,
									folder: targetPath
								};

								documentUtils.downloadFolder(downloadArgv, server, true, true, [], exportSiteFileGroupSize).then(function () {
									console.info(' - Downloaded export site files to ' + targetPath);
									done(true);
								});
							} else if (data.err) {
								done();
							} else {
								done(true);
							}
						});
					});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					done();
				})
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * import site
 */
module.exports.importSite = function (argv, done) {
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

		var siteName = argv.name,
			inputFolder = argv.folder,
			uploadPath = argv.path || path.join(projectDir, 'src', 'siteExport', siteName),
			folderName = uploadPath.split(path.sep).pop(),
			folderPathName = inputFolder || folderName,
			jobName = argv.jobname || argv.newsite || siteName,
			repository = argv.repository,
			localizationPolicy = argv.localizationPolicy,
			sitePrefix = argv.sitePrefix && argv.sitePrefix.toLowerCase(),
			policies = (['createSite', 'updateSite', 'duplicateSite'].indexOf(argv.sitepolicy) !== -1) ? argv.sitepolicy : 'createSite',
			assetspolicy = argv.assetpolicy,
			ignorewarnings = typeof argv.ignorewarnings === 'string' && argv.ignorewarnings.toLowerCase() === 'true',
			importRepo,
			importL10P;

		// Set default asset policy according to site policy.
		if (!assetspolicy) {
			if (policies === 'createSite') {
				assetspolicy = 'createOrUpdate'
			} else if (policies === 'updateSite') {
				assetspolicy = 'createOrUpdateIfOutdated';
			} else {
				assetspolicy = 'duplicate';
			}
		}
		var deleteExistingFolder = function () {
			return new Promise(function (resolve, reject) {
				var deleteArgv = {
					path: folderName,
					permanent: 'true'
				};

				documentUtils.deleteFolder(deleteArgv, server).then(function (result) {
					console.info('importSite deleteFolder ' + folderName);
					resolve();
				}).catch((error) => {
					resolve();
				})
			});
		}

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			Promise.resolve()
				.then(function () {
					var repositoryPromises = [];

					repositoryPromises.push(serverRest.getRepositoryWithName({
						server: server,
						name: repository,
						fields: 'id'
					}));

					return Promise.all(repositoryPromises);
				})
				.then(function (repos) {
					var repo = repos[0];
					if (!repo || repo.err) {
						return Promise.reject('ImportSite failed to get repository ' + repository);
					}
					if (!repo.data || !repo.data.id) {
						return Promise.reject('ImportSite: repository ' + repository + ' does not exist');
					} else {
						importRepo = repo.data;

						var l10NPolicyPromises = [];

						if (localizationPolicy) {
							l10NPolicyPromises.push(serverRest.getLocalizationPolicWithName({
								server: server,
								name: localizationPolicy,
								fields: 'id'
							}));
						}

						return Promise.all(l10NPolicyPromises);
					}
				})
				.then(function (l10Ps) {
					if (localizationPolicy) {
						var l10P = l10Ps[0][0];
						if (!l10P || l10P.err) {
							return Promise.reject('ImportSite failed to get localizationPolicy ' + localizationPolicy);
						}
						console.log('l10P.id ' + l10P.id + ' l10P.name ' + l10P.name);
						if (!l10P.id) {
							return Promise.reject('ImportSite: localizationPolicy ' + localizationPolicy + ' does not exist');
						}
						importL10P = l10P;
						console.log('localizationPolicy ' + localizationPolicy + ' id ' + importL10P.id);
					}
					var deletePromises = [];
					if (!inputFolder) {
						deletePromises.push(deleteExistingFolder());
					}
					return Promise.all(deletePromises);
				})
				.then(function () {
					var uploadPromises = [];

					if (!inputFolder) {
						console.log('ImportSite: Upload site files from ' + uploadPath);
						var uploadArgv = {
							path: uploadPath
						};
						uploadPromises.push(documentUtils.uploadFolder(uploadArgv, server));
					}

					return Promise.all(uploadPromises);
				})
				.then(function () {
					var findFolderPromises = [];

					findFolderPromises.push(serverRest.findFolderHierarchy({
						server: server,
						parentID: 'self',
						folderPath: folderPathName
					}));

					return Promise.all(findFolderPromises);
				})
				.then(function (folders) {
					if (!folders[0] || !folders[0].id) {
						return Promise.reject('ImportSite: import folder ' + folderPathName + ' not found');
					} else {
						var createArchivePromises = [];

						createArchivePromises.push(sitesRest.createArchive({
							server: server,
							folderId: folders[0].id
						}));

						return Promise.all(createArchivePromises);
					}
				})
				.then(function (archives) {
					var archivedata = archives[0];
					console.info(' - Import site archive id ' + archivedata.id);

					var importSitePromises = [];

					if (archivedata.id) {
						archivedata.entries.items.forEach((entry) => {
							var siteId = entry.site.id;

							// TODO: Irrelevant in multiple sites case
							if (entry.site.name !== siteName) {
								console.warn('WARNING: Given site name is not the same as the is site name in the site folder');
								console.warn('         site name in command: ' + siteName);
								console.warn('         site name in folder ' + entry.site.name);
							}
							importSitePromises.push(sitesRest.importSite({
								server: server,
								name: jobName,
								archiveId: archivedata.id,
								siteId: siteId,
								repositoryId: importRepo.id,
								localizationPolicyId: importL10P && importL10P.id,
								sitePrefix: sitePrefix,
								policies: policies,
								newsite: argv.newsite,
								assetspolicy: assetspolicy,
								ignorewarnings: ignorewarnings
							}));
						});
					}

					return Promise.all(importSitePromises);
				})
				.then(function (values) {
					var data = values[0];
					if (data) {
						// TODO: Comment out before removal
						// console.info('');
						// console.info('   ImportSite job ' + JSON.stringify(data.job));
						// console.info('');
						_downloadReports(data.reports, argv.newsite || siteName, server).then(function () {
							if (data.err) {
								done();
							} else {
								done(true);
							}
						});
					} else {
						done();
					}
				})
				.catch(function (error) {
					console.error('   ImportSite encountered ' + error);
					done();
				});

		}).catch(function (error) {
			console.error('   ImportSite encountered ' + error);
			done();
		})
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * unblock import job
 */
module.exports.unblockImportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var ignorewarnings = typeof argv.ignorewarnings === 'string' && argv.ignorewarnings.toLowerCase() === 'true',
				url = '/system/export/api/v1/imports/' + argv.id + '/unblock',
				body = {
					"action": "ignoreCurrentValidationWarnings",
					"ignoreCurrentValidationWarnings": {
						"reportETag": "",
						"import": {
							"policies": {
								"ignoreAllValidationWarnings": ignorewarnings
							}
						}
					}
				}

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				body: body,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to unblock import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Unblocked import job ' + argv.id);
					console.info('To monitor the job progress and download the report, run the following command:');
					console.info('cec describe-import-job ' + argv.id + ' -d -s ' + serverName);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * retry import job
 */
module.exports.retryImportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/imports/' + argv.id + '/retry';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to retry import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Retry import job ' + argv.id);
					console.info('To monitor the job progress and download the report, run the following command:');
					console.info('cec describe-import-job ' + argv.id + ' -d -s ' + serverName);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * cancel export job
 */
module.exports.cancelExportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/exports/' + argv.id + '/cancel';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to cancel export job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Canceled export job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * cancel import job
 */
module.exports.cancelImportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/imports/' + argv.id + '/cancel';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to cancel import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Canceled import job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * delete export job
 */
module.exports.deleteExportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/exports/' + argv.id;

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executeDelete({
				server: server,
				endpoint: url,
				headers: headers
			}).then(function (data) {
				if (data.err) {
					console.info('Failed to delete export job ' + argv.id + ' : ' + (data.data['o:errorCode'] ? data.data.title : data.data));
				} else {
					console.info('Deleted export job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * delete import job
 */
module.exports.deleteImportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/imports/' + argv.id;

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executeDelete({
				server: server,
				endpoint: url,
				headers: headers
			}).then(function (data) {
				if (data.err) {
					console.info('Failed to delete import job ' + argv.id + ' : ' + (data.data['o:errorCode'] ? data.data.title : data.data));
				} else {
					console.info('Deleted import job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * list export jobs
 */
module.exports.listExportJobs = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}
			var url = '/system/export/api/v1/exports';
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed';

			_executeGetExportService({
				server: server,
				endpoint: url,
				noMsg: true
			}).then(function (body) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					data = body;
				}
				if (!data.err && data.items) {

					var sitePromises = [];
					data.items.forEach(job => {
						sitePromises.push(_getSiteForExportJob(job.id, server));
					});

					Promise.all(sitePromises).then(sites => {
						data.items.forEach(function (job, index) {
							job.augmentedSiteName = sites.at(index).name;
						});
						var format = '%-28s  %-34s  %-12s  %-12s  %-26s  %-14s  %-28s';
						console.log('Site export jobs:');
						console.log(sprintf(format, 'Site Name', 'Id', 'Completed', 'Progress', 'Created At', 'Duration', 'Job Name'));
						data.items.forEach(function (job) {
							if (job.completed) {
								console.log(sprintf(format, job.augmentedSiteName || '', job.id, job.completed, job.progress, job.createdAt || '', duration(job.createdAt, job.completedAt), job.name));
							} else {
								console.log(sprintf(format, job.augmentedSiteName || '', job.id, job.completed, job.progress, job.createdAt || '', '', job.name));
							}
						});
					});
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * describe export job
 */
module.exports.describeExportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			sitesRest.describeExportJob({
				server: server,
				id: argv.id
			}).then(function (data) {
				if (data.err) {
					done();
					return;
				}
				// console.info(JSON.stringify(data.job));

				var jobFormat = '  %-28s  %-s',
					job = data.job;

				var promises = [];

				if (job.sources.length > 0) {
					// Support single site for now.
					var source = job.sources.at(0);
					promises.push(sitesRest.getSite({
						server: server,
						id: source.select.site.id,
						showInfo: false
					}));
				}
				if (job.target.provider === 'docs') {
					promises.push(_getFolder(job.target.docs.folderId, server));
				}

				Promise.all(promises).then(augmentedData => {
					var siteName,
						folderName;

					if (augmentedData.length > 0) {
						siteName = augmentedData.at(0).name;
					}
					if (augmentedData.length > 1) {
						folderName = augmentedData.at(1).name;
					}

					console.log('');
					console.log(sprintf(jobFormat, 'Id', job.id));
					console.log(sprintf(jobFormat, 'Job Name', job.name));
					job.sources.forEach((s) => {
						if (s.select.type === 'site') {
							if (siteName) {
								console.log(sprintf(jobFormat, 'Site Name', siteName));
							} else {
								console.log(sprintf(jobFormat, 'Site Id', s.select.site.id));
							}
							console.log(sprintf(jobFormat, 'Include unpublished assets', s.apply.exportSite.includeUnpublishedAssets));
						}
					});
					if (job.target.provider === 'docs') {
						if (folderName) {
							console.log(sprintf(jobFormat, 'Parent Folder', folderName));
						} else {
							console.log(sprintf(jobFormat, 'Parent Folder Id', job.target.docs.folderId));
						}
					}
					if (job.useDocsCheckInFromOSS) {
						console.log(sprintf(jobFormat, 'Use Docs Checkin from OSS', job.useDocsCheckInFromOSS));
					}
					if (job.progress) {
						console.log(sprintf(jobFormat, 'Progress', job.progress));
					}
					console.log(sprintf(jobFormat, 'Created At', job.createdAt || ''));
					if (job.completed) {
						console.log(sprintf(jobFormat, 'Completed At', job.completedAt || ''));
						console.log(sprintf(jobFormat, 'Duration', duration(job.createdAt, job.completedAt)));
					}

					if (argv.download) {
						var reportName = siteName || data.job.name;
						_downloadReports(data.reports, reportName, server).then(function () {

							if (data.job.progress === 'succeeded' && data.job.target && data.job.target.docs && data.job.target.docs.result) {
								var exportFolderName = data.job.target.docs.result.folderName;

								// Download option
								// If no download path is specified, then save to src/siteExport/<siteName>
								// If download path is specified, then save to the specified path.

								// TODO: Use job name temporary. Might need to get the site name.
								var targetPath = path.join(projectDir, 'src', 'siteExport', data.job.name);

								// Remove target path if exists.
								if (fs.existsSync(targetPath)) {
									// TODO: Is warning necessary before removing existing folder?
									fileUtils.remove(targetPath);
								}

								// Create target path
								fs.mkdirSync(targetPath, {
									recursive: true
								});

								var folderId = data.job.target.docs.folderId;
								var downloadArgv = {
									parentId: folderId,
									path: exportFolderName,
									folder: targetPath
								};

								documentUtils.downloadFolder(downloadArgv, server, true, true, [], exportSiteFileGroupSize).then(function () {
									console.info('Downloaded export site files to ' + targetPath);
									done(true);
								});
							} else {
								done(true);
							}
						});
					} else {
						done(true);
					}
				});
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * list import jobs
 */
module.exports.listImportJobs = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var url = '/system/export/api/v1/imports';

			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed';

			_executeGetExportService({
				server: server,
				endpoint: url,
				noMsg: true
			}).then(function (body) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					data = body;
				}
				if (!data.err && data.items) {
					var sitePromises = [];
					data.items.forEach(job => {
						sitePromises.push(_getSiteForImportJob(job.id, server));
					});

					Promise.all(sitePromises).then(sites => {
						if (Array.isArray(sites)) {
							data.items.forEach(function (job, index) {
								job.augmentedSiteName = sites.at(index) && sites.at(index).name;
							});
						}
						var format = '%-28s  %-34s  %-12s  %-12s  %-22s  %-26s  %-14s  %-28s';
						console.log('Site import jobs:');
						console.log(sprintf(format, 'Site Name', 'Id', 'Completed', 'Progress', 'State', 'Created At', 'Duration', 'Job Name'));
						data.items.forEach(function (job) {
							var state = job.state || '';
							if (job.completed) {
								console.log(sprintf(format, job.augmentedSiteName || '', job.id, job.completed, job.progress, state, job.createdAt || '', duration(job.createdAt, job.completedAt), job.name));
							} else {
								console.log(sprintf(format, job.augmentedSiteName || '', job.id, job.completed, job.progress, state, job.createdAt || '', '', job.name));
							}
						});
					});
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * describe import job
 */
module.exports.describeImportJob = function (argv, done) {
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			sitesRest.describeImportJob({
				server: server,
				id: argv.id
			}).then(function (data) {
				if (data.err) {
					done();
					return;
				}

				// console.info(JSON.stringify(data.job));

				var jobFormat = '  %-28s  %-s',
					v1Format = '    %-26s  %-s',
					v2Format = '      %-24s  %-s',
					v3Format = '        %-22s  %-s',
					job = data.job;

				var promises = [];

				if (job.targets.length > 0) {
					// Support single site for now.
					var target = job.targets.at(0);

					var repositoryId = target.apply[target.apply.policies].site.repository.id;

					promises.push(_getRepository(repositoryId, server));
				}

				Promise.all(promises).then(augmentedData => {
					var repositoryName;

					if (augmentedData.length > 0) {
						repositoryName = augmentedData.at(0).name;
					}
					console.log('');
					console.log(sprintf(jobFormat, 'Id', job.id));
					console.log(sprintf(jobFormat, 'Job Name', job.name));
					if (job.source.archive) {
						console.log(sprintf(jobFormat, 'Archive Id', job.source.archive.id));
					}

					job.targets.forEach((t) => {
						switch (t.apply.policies) {
							case 'createSite':
								console.log(sprintf(jobFormat, 'Import Policy', 'Create Site from Archive'));
								console.log(sprintf(jobFormat, 'Assets policy', t.apply.createSite.assetsPolicy));
								if (repositoryName) {
									console.log(sprintf(jobFormat, 'Target Asset Repository', repositoryName));
								} else {
									console.log(sprintf(jobFormat, 'Target Asset Repository Id', t.apply.createSite.site.repository.id));
								}
								break;
							case 'updateSite':
								console.log(sprintf(jobFormat, 'Import Policy', 'Update Site from Archive'));
								console.log(sprintf(jobFormat, 'Assets policy', t.apply.updateSite.assetsPolicy));
								if (repositoryName) {
									console.log(sprintf(jobFormat, 'Target Asset Repository', repositoryName));
								} else {
									console.log(sprintf(jobFormat, 'Target Asset Repository Id', t.apply.updateSite.site.repository.id));
								}
								break;
							case 'duplicateSite':
								console.log(sprintf(jobFormat, 'Import Policy', 'Duplicate Site from Archive'));
								console.log(sprintf(jobFormat, 'Assets policy', t.apply.duplicateSite.assetsPolicy));
								if (repositoryName) {
									console.log(sprintf(jobFormat, 'Target Asset Repository', repositoryName));
								} else {
									console.log(sprintf(jobFormat, 'Target Asset Repository Id', t.apply.duplicateSite.site.repository.id));
								}
								break;
							default:
						}

						if (t.select.type === 'site') {
							console.log(sprintf(jobFormat, 'Site Name', t.select.site.name));
							console.log(sprintf(jobFormat, 'Publishing Channel', t.select.site.channel.name));
							console.log(sprintf(jobFormat, 'Localization Policy', t.select.site.channel.localizationPolicy.name));
							console.log(sprintf(jobFormat, 'Default Language', t.select.site.defaultLanguage));
						}
					});

					console.log(sprintf(jobFormat, 'Progress', job.progress));
					if (job.state) {
						console.log(sprintf(jobFormat, 'State', job.state));
					}
					console.log(sprintf(jobFormat, 'Created At', job.createdAt));
					if (job.completed) {
						console.log(sprintf(jobFormat, 'Completed At', job.completedAt));
						console.log(sprintf(jobFormat, 'Duration', duration(job.createdAt, job.completedAt)));
					}

					console.log(sprintf(jobFormat, 'Validation', ''));
					if (job.validationSummary) {
						job.validationSummary.messagesByEntityTypes.forEach((entity) => {
							if (entity.countsByLevel.error > 0) {
								console.log(sprintf(v1Format, 'error count', entity.countsByLevel.error));
							}
							if (entity.countsByLevel.warning > 0) {
								console.log(sprintf(v1Format, 'warning count', entity.countsByLevel.warning));
							}
							if (entity.countsByLevel.info > 0) {
								console.log(sprintf(v1Format, 'info count', entity.countsByLevel.info));
							}
						})
					}

					if (job.validationResults) {
						job.validationResults.items.forEach((item) => {
							console.log(sprintf(v2Format, item.entityType, item.entityName));
							item.messages.items.forEach(function (message) {
								console.log(sprintf(v3Format, message.level, message.text));
							});
						});
					}

					var checkDownload = function (dataForDownload) {
						if (argv.download) {
							var siteName = dataForDownload.job.targets[0].select.site.name;
							_downloadReports(dataForDownload.reports, siteName, server).then(function () {
								done(true);
							});
						} else {
							done(true);
						}
					}

					if (job.progress === 'processing' && !job.completed) {
						sitesRest.pollImportJobStatus({
							server: server,
							id: argv.id
						}).then(function (polldata) {
							checkDownload(polldata);
						});
					} else {
						checkDownload(data);
					}
				});
			});
		});
	} catch (e) {
		console.error(e);
		done();
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

		var output = argv.file;
		if (output) {
			if (!path.isAbsolute(output)) {
				output = path.join(projectDir, output);
			}
			output = path.resolve(output);

			if (fs.existsSync(output)) {
				if (fs.statSync(output).isDirectory()) {
					output = path.join(output, 'vs_' + siteName + '.json');
				}
			} else {

				var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
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
		}

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			_validateSiteREST(server, siteName, output, done);

		}); // login
	} catch (e) {
		console.error(e);
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

var _displayAssetValidation = function (channelName, validations) {
	// console.log(JSON.stringify(validations, null, 4));
	var policyValidation;
	var error = '';
	for (var i = 0; i < validations.length; i++) {
		var val = validations[i];
		Object.keys(val).forEach(function (key) {
			if (key === 'policyValidation') {
				policyValidation = val[key];
			}
			if (key === 'error') {
				error = val[key];
			}
		});
	}

	var valid = policyValidation.hasOwnProperty('valid') ? policyValidation.valid : true;
	if (policyValidation.error) {
		error = error + ' ' + policyValidation.error;
	}

	var items = policyValidation.items;

	var translationItemsInDraft = [];
	var notReadyItems = [];
	var invalidLangItems = [];
	var otherItems = [];

	var itemNames = {};

	for (let i = 0; i < items.length; i++) {
		// save the item name
		itemNames[items[i].id] = items[i].name;

		let val = items[i].validations;

		for (let j = 0; j < val.length; j++) {
			if (!val[j].publishable) {
				valid = false;
				let results = val[j].results;
				for (let k = 0; k < results.length; k++) {
					if (!results[k].valid) {
						let errorItem = {
							id: items[i].id,
							name: items[i].name,
							type: items[i].type,
							language: items[i].language,
							message: results[k].message
						};

						if (results[k].code === 'cs_error' && results[k].value.indexOf('csAssetsCannotPublishTranslationInDraft') >= 0) {
							translationItemsInDraft.push(errorItem);
						} else if (results[k].code === 'cs_error' && results[k].value.indexOf('csAssetsCannotPublishNotReadyAsset') >= 0) {
							notReadyItems.push(errorItem);
						} else if (results[k].code === 'invalid_language') {
							invalidLangItems.push(errorItem);
						} else if (results[k].code !== 'dependency_unpublishable') {
							otherItems.push(errorItem);
						}
					}
				}
			}
		}
	}

	// console.log(itemNames);

	var _getItemName = function (id) {
		var name = '';
		Object.keys(itemNames).forEach(function (key) {
			if (key === id) {
				name = itemNames[key];
			}
		});
		return name;
	};
	var variationSets = policyValidation.variationSets;
	var missingTranslationItems = [];
	for (let i = 0; i < variationSets.length; i++) {
		let val = variationSets[i].validations;

		for (let j = 0; j < val.length; j++) {
			if (!val[j].publishable) {
				valid = false;
				let results = val[j].results;
				for (let k = 0; k < results.length; k++) {
					if (!results[k].valid) {
						let errorItem = {
							id: variationSets[i].masterItemId,
							name: _getItemName(variationSets[i].masterItemId),
							type: variationSets[i].type,
							language: '',
							message: results[k].message
						};
						if (results[k].code === 'missing_required') {
							errorItem.language = results[k].value;
							missingTranslationItems.push(errorItem);
						} else if (results[k].code !== 'unpublishable_required') {
							otherItems.push(errorItem);
						}
					}
				}
			}
		}
	}

	var format = '   %-38s %-38s %-20s %-s';
	var _display = function (displayItems) {
		for (let i = 0; i < displayItems.length; i++) {
			let item = displayItems[i];
			console.log(sprintf(format, item.type, item.id, item.language, item.name));
		}
	};

	if (notReadyItems.length > 0) {
		console.log(' - not-ready items (' + notReadyItems.length + ')');
		console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name'));
		_display(notReadyItems);
		console.log('');
	}
	if (translationItemsInDraft.length > 0) {
		console.log(' - non-master translatable items in draft (' + translationItemsInDraft.length + ')');
		console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name'));
		_display(translationItemsInDraft);
		console.log('   use command to fix: cec control-content set-translated -c ' + channelName);
		console.log('');
	}
	if (invalidLangItems.length > 0) {
		console.log(' - items whose language not an accepted language of policy (' + invalidLangItems.length + ')');
		console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name'));
		_display(invalidLangItems);
		console.log('');
	}
	if (missingTranslationItems.length > 0) {
		console.log(' - items missing required translations (' + missingTranslationItems.length + ')');
		console.log(sprintf(format, 'Type', 'Id', 'MissingLanguages', 'Name'));
		_display(missingTranslationItems);
		console.log('');
	}
	if (otherItems.length > 0) {
		console.log(' - other issues (' + otherItems.length + ')');
		let format = '  %-12s : %-s';
		otherItems.forEach(function (item) {
			console.log(sprintf(format, 'Id', item.id));
			console.log(sprintf(format, 'name', item.name));
			console.log(sprintf(format, 'type', item.type));
			console.log(sprintf(format, 'language', item.language));
			console.log(sprintf(format, 'message', item.message));
		});
	}

	if (valid) {
		console.log('  is valid: ' + valid);
	}
	if (error) {
		console.log('  is valid: ' + valid);
		console.error('ERROR: ' + error);
	}

};

var _validateSiteREST = function (server, siteName, output, done) {
	var siteId;
	var siteValidation;
	var contentValidation;
	var repositoryId, channelId, channelToken;
	var itemIds = [];
	var failed = false;
	sitesRest.getSite({
		server: server,
		name: siteName,
		expand: 'channel,repository'
	})
		.then(function (result) {
			if (!result || result.err) {
				failed = true;
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

			console.info(' - get site');
			console.info('   repository: ' + repositoryId);
			console.info('   channel: ' + channelId);
			console.info('   channelToken: ' + channelToken);
			console.info('   defaultLanguage: ' + site.defaultLanguage);

			return sitesRest.validateSite({
				server: server,
				name: siteName
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				// return Promise.reject();
				// continue to validate assets
				failed = true;
			} else {
				siteValidation = result;
			}

			// query channel items
			var q = 'channelToken eq "' + channelToken + '"';
			return serverRest.queryItems({
				server: server,
				q: q
			});
		})
		.then(function (result) {
			var items = result && result.data || [];
			if (items.length === 0) {
				if (siteValidation) {
					console.log('Site Validation:');
					_displaySiteValidation(siteValidation);
				}
				console.log('Assets Validation:');
				console.log('  no assets');
				return Promise.reject();
			}

			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				itemIds.push(item.id);
			}
			// console.log(' - total items: ' + itemIds.length);

			// validate assets
			return serverRest.validateChannelItems({
				server: server,
				channelId: channelId,
				itemIds: itemIds,
				async: 'true'
			});
		})
		.then(function (result) {
			if (result.err) {
				failed = true;
				return Promise.reject();
			}

			var statusId = result && result.statusId;
			if (!statusId) {
				console.error('ERROR: failed to submit validation');
				return Promise.reject();
			}

			console.info(' - submit validation job (' + statusId + ')');
			return _getValidateAssetsStatus(server, statusId);

		})
		.then(function (data) {

			contentValidation = data;

			//
			// Display result
			//
			if (siteValidation) {
				console.log('Site Validation:');
				_displaySiteValidation(siteValidation);
			}

			console.log('Assets Validation:');
			if (data.result && data.result.body && data.result.body.operations && data.result.body.operations.validatePublish && data.result.body.operations.validatePublish.validationResults) {
				let assetsValidation = data.result.body.operations.validatePublish.validationResults;
				_displayAssetValidation(siteName, assetsValidation);
			} else {
				console.log('  no result');
				// console.log(data);
				if (data.result.body.operations) {
					console.log(JSON.stringify(data.result.body.operations, null, 4));
				}
			}

			return Promise.reject();
		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			if (output) {
				let obj = {
					siteValidation: siteValidation || {},
					assetsValidation: contentValidation || {}
				};
				fs.writeFileSync(output, JSON.stringify(obj, null, 4));
				console.log('');
				console.log(' - validation result saved ' + output);
			}
			done(!failed);
		});
};

var _getValidateAssetsStatus = function (server, statusId) {
	return new Promise(function (resolve, reject) {
		var startTime = new Date();
		var needNewLine = false;
		var inter = setInterval(function () {
			var jobPromise = serverRest.getItemOperationStatus({
				server: server,
				statusId: statusId
			});
			jobPromise.then(function (data) {
				if (!data || data.error || data.progress === 'failed') {
					clearInterval(inter);
					if (needNewLine) {
						process.stdout.write(os.EOL);
					}
					var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
					console.error('ERROR: assets validation failed: ' + msg);
					return resolve({
						err: 'err'
					});
				}
				if (data.completed) {
					clearInterval(inter);
					if (console.showInfo()) {
						process.stdout.write(' - assets validation finished [' + serverUtils.timeUsed(startTime, new Date()) + ']        ');
						process.stdout.write(os.EOL);
					}
					return resolve(data);
				} else {
					if (console.showInfo()) {
						process.stdout.write(' - assets validation in progress [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
						readline.cursorTo(process.stdout, 0);
						needNewLine = true;
					}
				}
			});
		}, 5000);
	});
};

/**
 * Validate assets
 */
module.exports.validateAssets = function (argv, done) {
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

	var channelName = argv.channel;
	var query = argv.query;
	var assetGUIDS = argv.assets ? argv.assets.split(',') : [];

	var output = argv.file;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		if (fs.existsSync(output)) {
			if (fs.statSync(output).isDirectory()) {
				output = path.join(output, 'va_' + channelName + '.json');
			}
		} else {

			var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
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
	}

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var channel;
		var channelToken;
		var itemIds = [];

		serverRest.getChannelWithName({
			server: server,
			name: channelName,
			fields: 'channelTokens'
		})
			.then(function (result) {
				channel = result && result.data;
				if (!channel || !channel.id) {
					console.error('ERROR: channel ' + channelName + ' does not exist');
					return Promise.reject();
				}

				var tokens = channel && channel.channelTokens || [];
				for (var i = 0; i < tokens.length; i++) {
					if (tokens[i].name === 'defaultToken') {
						channelToken = tokens[i].token;
						break;
					}
				}
				if (!channelToken && tokens.length > 0) {
					channelToken = tokens[0].value;
				}
				console.info(' - validate channel (Id: ' + channel.id + ' token: ' + channelToken + ')');

				// query channel items
				var q = 'channelToken eq "' + channelToken + '"';
				if (query || assetGUIDS.length > 0) {
					q = '(' + q + ')';
				}
				if (query) {
					q = q + ' AND (' + query + ')';
				}
				var idQ = '';
				if (assetGUIDS.length > 0) {
					for (let i = 0; i < assetGUIDS.length; i++) {
						if (idQ) {
							idQ = idQ + ' or ';
						}
						idQ = idQ + 'id eq "' + assetGUIDS[i] + '"';
					}
					q = q + ' AND (' + idQ + ')';
				}
				console.info(' - query: ' + q);
				return serverRest.queryItems({
					server: server,
					q: q
				});
			})
			.then(function (result) {
				var items = result && result.data || [];
				if (items.length === 0) {
					console.log('Assets Validation:');
					console.log('  no assets');
					return Promise.reject();
				}

				for (var i = 0; i < items.length; i++) {
					var item = items[i];
					itemIds.push(item.id);
				}
				// console.log(' - total items: ' + itemIds.length);

				// validate assets
				return serverRest.validateChannelItems({
					server: server,
					channelId: channel.id,
					itemIds: itemIds,
					async: 'true'
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var statusId = result && result.statusId;
				if (!statusId) {
					console.error('ERROR: failed to submit validation');
					return Promise.reject();
				}

				console.info(' - submit validation job (' + statusId + ')');
				_getValidateAssetsStatus(server, statusId)
					.then(function (data) {
						//
						// Display result
						//
						console.log('Assets Validation:');
						if (data.result && data.result.body && data.result.body.operations && data.result.body.operations.validatePublish && data.result.body.operations.validatePublish.validationResults) {
							var assetsValidation = data.result.body.operations.validatePublish.validationResults;
							_displayAssetValidation(channelName, assetsValidation);
						} else {
							console.log('  no result');
							// console.log(data);
							if (data.result.body.operations) {
								console.log(JSON.stringify(data.result.body.operations, null, 4));
							}
						}

						if (output) {
							fs.writeFileSync(output, JSON.stringify(data, null, 4));
							console.log('');
							console.log(' - validation result saved ' + output);
						}
						done(true);
					});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

var _getPageLayouts = function (server, pages) {

	return new Promise(function (resolve, reject) {

		var total = pages.length;
		var groups = [];
		var limit = 30;
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

		var needNewLine = false;
		var startTime = new Date();

		var doGetPages = groups.reduce(function (pagePromise, param) {
			return pagePromise.then(function (result) {
				var pagePromises = [];
				for (let i = param.start; i <= param.end; i++) {
					if (pages[i].fileId) {
						pagePromises.push(serverRest.downloadFile({ server: server, fFileGUID: pages[i].fileId }));
					}
				}
				return Promise.all(pagePromises)
					.then(function (results) {
						/*
						if (console.showInfo()) {
							process.stdout.write(' - getting page layouts [' + param.start + ', ' + param.end + '] [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
						*/
						for (let i = 0; i < results.length; i++) {
							if (results[i].id && results[i].data) {
								try {
									let data = JSON.parse(results[i].data);
									let layout = data && data.properties && data.properties.pageLayout;
									if (layout) {
										// assign back to page
										for (let j = 0; j < pages.length; j++) {
											if (pages[j].fileId === results[i].id) {
												pages[j].pageLayout = layout;
												break;
											}
										}
									}
								} catch (e) {
									// inavlid result
								}
							}
						}
					})
			});
		},
			Promise.resolve({})
		);

		doGetPages.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve({});
		});
	})

};

/**
 * Describe a site
 */
module.exports.describeSite = function (argv, done) {
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

	var name = argv.name;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var site;
		var siteMetadata;
		var siteInfo;
		var siteinfoJson;
		var pages;
		var themeLayouts = [];
		var componentsUsed, contentItemsUsed, contentTypesUsed;
		var totalItems = 0;
		var totalMasterItems = 0;
		var pageTranslations = 0;
		var format1 = '%-38s  %-s';

		sitesRest.getSite({
			server: server,
			name: name,
			expand: 'ownedBy,createdBy,lastModifiedBy,members,repository,channel,vanityDomain,siteCategory'
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				if (output) {
					fs.writeFileSync(output, JSON.stringify(result, null, 4));
					console.log(' - site properties saved to ' + output);
				}

				site = result;
				// console.log(site);

				// find master items in the site channel
				var itemPromises = [];
				if (site.isEnterprise && site.channel && site.channel.id) {
					var q = 'channels co "' + site.channel.id + '" AND languageIsMaster eq "true"';
					itemPromises.push(serverRest.queryItems({
						server: server,
						q: q,
						limit: 1,
						showTotal: false
					}));
				}

				return Promise.all(itemPromises);
			})
			.then(function (results) {

				if (site.isEnterprise) {
					// console.log(results[0]);
					totalMasterItems = results && results[0] && results[0].limit;
				}

				// find items in the site channel
				var itemPromises = [];
				if (site.isEnterprise && site.channel && site.channel.id) {
					var q = 'channels co "' + site.channel.id + '"';
					itemPromises.push(serverRest.queryItems({
						server: server,
						q: q,
						limit: 1,
						showTotal: false
					}));
				}

				return Promise.all(itemPromises);
			})
			.then(function (results) {

				if (site.isEnterprise) {
					// console.log(results[0]);
					totalItems = results && results[0] && results[0].limit;
				}

				// get site metadata

				return serverUtils.getSiteMetadata(server, site.id, site.name);

			})
			.then(function (result) {

				siteMetadata = result && result.metadata;
				siteInfo = result && result.siteinfo;

				// console.log(siteMetadata);

				return serverUtils.getSiteUsedData(server, site.id);

			})
			.then(function (result) {

				componentsUsed = result && result.componentsUsed || [];
				contentItemsUsed = result && result.contentItemsUsed || [];
				contentTypesUsed = result && result.contentTypesUsed || [];

				var accValues = site.security && site.security.access || [];
				var signin = accValues.length === 0 || accValues.includes('everyone') ? 'no' : 'yes';

				var siteUrl = server.url + '/site/' + (signin === 'yes' ? 'authsite/' : '') + site.name;

				var managers = [];
				var contributors = [];
				var downloaders = [];
				var viewers = [];
				var members = site.members && site.members.items || [];
				members.forEach(function (member) {
					if (member.role === 'manager') {
						managers.push(member.displayName || member.name);
					} else if (member.role === 'contributor') {
						contributors.push(member.displayName || member.name);
					} else if (member.role === 'downloader') {
						downloaders.push(member.displayName || member.name);
					} else if (member.role === 'viewer') {
						viewers.push(member.displayName || member.name);
					}
				});

				var memberLabel = '';
				if (managers.length > 0) {
					memberLabel = 'Manager: ' + managers + ' ';
				}
				if (contributors.length > 0) {
					memberLabel = memberLabel + 'Contributor: ' + contributors + ' ';
				}
				if (downloaders.length > 0) {
					memberLabel = memberLabel + 'Downloader: ' + downloaders + ' ';
				}
				if (viewers.length > 0) {
					memberLabel = memberLabel + 'Viewer: ' + viewers;
				}

				var ownedBy = site.ownedBy ? (site.ownedBy.displayName || site.ownedBy.name) : '';
				if (!ownedBy && site.ownedBy._error && site.ownedBy._error.identity) {
					ownedBy = site.ownedBy._error.identity.id;
				}
				var createdBy = site.createdBy ? (site.createdBy.displayName || site.createdBy.name) : '';
				if (!createdBy && site.createdBy._error && site.createdBy._error.identity) {
					createdBy = site.createdBy._error.identity.id;
				}
				var lastModifiedBy = site.lastModifiedBy ? (site.lastModifiedBy.displayName || site.lastModifiedBy.name) : '';
				if (!lastModifiedBy && site.lastModifiedBy._error && site.lastModifiedBy._error.identity) {
					lastModifiedBy = site.lastModifiedBy._error.identity.id;
				}
				console.log('');
				console.log(sprintf(format1, 'Id', site.id));
				console.log(sprintf(format1, 'Name', site.name));
				console.log(sprintf(format1, 'Description', site.description || ''));
				console.log(sprintf(format1, 'Site URL', siteUrl));
				console.log(sprintf(format1, 'Vanity domain', site.vanityDomain && site.vanityDomain.name ? site.vanityDomain.name : ''));
				console.log(sprintf(format1, 'Embeddable site', site.isIframeEmbeddingAllowed));
				console.log(sprintf(format1, 'Owner', ownedBy));
				console.log(sprintf(format1, 'Members', memberLabel));
				console.log(sprintf(format1, 'Created', site.createdAt + ' by ' + createdBy));
				console.log(sprintf(format1, 'Updated', site.lastModifiedAt + ' by ' + lastModifiedBy));
				console.log(sprintf(format1, 'Type', (site.isEnterprise ? 'Enterprise' : 'Standard')));
				console.log(sprintf(format1, 'Template', site.templateName));
				console.log(sprintf(format1, 'Theme', site.themeName));
				console.log(sprintf(format1, 'Published', site.publishStatus !== 'unpublished' && site.publishedAt ? '√ (published at ' + site.publishedAt + ')' : ''));
				console.log(sprintf(format1, 'Online', site.runtimeStatus === 'online' && site.onlineAt ? '√ (online since ' + site.onlineAt + ')' : ''));

				if (site.isEnterprise) {
					var tokens = site.channel && site.channel.channelTokens || [];
					var channelToken = '';
					for (var i = 0; i < tokens.length; i++) {
						if (tokens[i].name === 'defaultToken') {
							channelToken = tokens[i].token;
							break;
						}
					}
					console.log(sprintf(format1, 'Site prefix', site.sitePrefix));
					console.log(sprintf(format1, 'Default language', site.defaultLanguage));
					console.log(sprintf(format1, 'Repository', site.repository ? site.repository.name : ''));
					console.log(sprintf(format1, 'Site channel token', channelToken));
					if (site.siteCategory && site.siteCategory.id) {
						console.log(sprintf(format1, 'Site Security category', site.siteCategory.namePath));
					}
				}

				console.log(sprintf(format1, 'Updates', site.numberOfUpdates));

				// get siteinfo.json
				return serverRest.findFile({
					server: server,
					parentID: site.id,
					filename: 'siteinfo.json',
					itemtype: 'file'
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				return serverRest.readFile({
					server: server,
					fFileGUID: result.id
				});

			})
			.then(function (result) {
				siteinfoJson = result && result.properties;

				// Get top level files
				return serverRest.getAllChildItems({
					server: server,
					parentID: site.id
				});

			})
			.then(function (result) {
				if (result && result.length > 0) {
					var localeFallbacks = siteinfoJson && siteinfoJson.localeFallbacks ? Object.keys(siteinfoJson.localeFallbacks) : [];
					// console.log(localeFallbacks);
					for (let i = 0; i < result.length; i++) {
						if (result[i].type === 'file' && serverUtils.endsWith(result[i].name, '_structure.json')) {
							pageTranslations += 1;
						}
					}
					// console.log('pageTranslations: ' + pageTranslations + ' localeFallbacks: ' + localeFallbacks.length);
					// remove local fallbacks
					// pageTranslations = pageTranslations - localeFallbacks.length;
				}

				// get the number of pages
				return serverRest.findFile({
					server: server,
					parentID: site.id,
					filename: 'structure.json',
					itemtype: 'file'
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				var structureFileId = result.id;

				return serverRest.readFile({
					server: server,
					fFileGUID: structureFileId
				});

			})
			.then(function (result) {

				pages = result && result.pages || [];

				console.log(sprintf(format1, 'Total pages', pages.length));
				console.log(sprintf(format1, 'Total page translations', pageTranslations));

				if (site.isEnterprise) {
					console.log(sprintf(format1, 'Total master items', totalMasterItems));
					console.log(sprintf(format1, 'Total items', totalItems));
				}

				if (siteMetadata) {
					console.log(sprintf(format1, 'Compile site after publish', siteMetadata.scsCompileSite === '1' ? '√' : ''));
					if (siteMetadata.scsCompileSite === '1') {
						console.log(sprintf(format1, 'Compile status', siteMetadata.scsCompileStatus));
					}
					console.log(sprintf(format1, 'Caching Response Headers', siteMetadata.scsStaticResponseHeaders));
					console.log(sprintf(format1, 'Mobile User-Agent', siteMetadata.scsMobileUserAgents));
				}

				if (siteInfo && siteInfo.JobID) {
					// console.log(siteInfo);
					console.log(sprintf(format1, 'Job action', siteInfo.JobAction));
					console.log(sprintf(format1, 'Job ID', siteInfo.JobID));
					console.log(sprintf(format1, 'Job status', siteInfo.JobStatus));
					console.log(sprintf(format1, 'Job percentage', siteInfo.JobPercentage));
					console.log(sprintf(format1, 'Job message', siteInfo.JobMessage));
				}

				let format2 = '  %-12s  %-s';

				console.log(sprintf(format1, 'Components used', ''));
				if (componentsUsed.length > 0) {
					console.log(sprintf(format2, 'Page Id', 'Components'));
					let componentsUsedPageIds = [];
					componentsUsed.forEach(function (comp) {
						if (comp.scsPageID && !componentsUsedPageIds.includes(comp.scsPageID)) {
							componentsUsedPageIds.push(comp.scsPageID);
						}
					});

					for (let i = 0; i < componentsUsedPageIds.length; i++) {
						let comps = [];
						componentsUsed.forEach(function (comp) {
							if (comp.scsPageID && comp.scsPageID === componentsUsedPageIds[i] && !comps.includes(comp.scsComponentName)) {
								comps.push(comp.scsComponentName);
							}
						});
						console.log(sprintf(format2, componentsUsedPageIds[i], comps.join(', ')));
					}
				}

				console.log(sprintf(format1, 'Content items used', ''));
				if (contentItemsUsed.length > 0) {
					console.log(sprintf(format2, 'Page Id', 'Content items'));
					let assetsUsedPageIds = [];
					contentItemsUsed.forEach(function (item) {
						if (item.scsPageID && !assetsUsedPageIds.includes(item.scsPageID)) {
							assetsUsedPageIds.push(item.scsPageID);
						}
					});

					for (let i = 0; i < assetsUsedPageIds.length; i++) {
						let items = [];
						contentItemsUsed.forEach(function (item) {
							if (item.scsPageID && item.scsPageID === assetsUsedPageIds[i] && !items.includes(item.scsContentItemID)) {
								items.push(item.scsContentItemID);
							}
						});
						console.log(sprintf(format2, assetsUsedPageIds[i], items.join(', ')));
					}
				}

				console.log(sprintf(format1, 'Content types used', ''));
				if (contentTypesUsed.length > 0) {
					console.log(sprintf(format2, 'Page Id', 'Content types'));
					let typesUsedPageIds = [];
					contentTypesUsed.forEach(function (type) {
						if (type.scsPageID && !typesUsedPageIds.includes(type.scsPageID)) {
							typesUsedPageIds.push(type.scsPageID);
						}
					});

					for (let i = 0; i < typesUsedPageIds.length; i++) {
						let types = [];
						contentTypesUsed.forEach(function (type) {
							if (type.scsPageID && type.scsPageID === typesUsedPageIds[i] && !types.includes(type.scsTypeName)) {
								types.push(type.scsTypeName);
							}
						});
						console.log(sprintf(format2, typesUsedPageIds[i], types.join(', ')));
					}
				}

				return serverUtils.getThemeLayouts(server, site.themeName);

			})
			.then(function (result) {

				themeLayouts = result.err ? [] : result;
				// console.log(themeLayouts);

				return serverRest.findFile({
					server: server,
					parentID: site.id,
					filename: 'pages',
					itemtype: 'folder'
				});
			})
			.then(function (result) {
				var pagesFileId = result && result.id;
				if (!pagesFileId) {
					return Promise.reject();
				}
				// get page file ids 
				return serverRest.getAllChildItems({
					server: server,
					parentID: pagesFileId
				});

			})
			.then(function (result) {

				let pageFiles = result || [];
				pages.forEach(function (page) {
					let fileId = undefined;
					for (let i = 0; i < pageFiles.length; i++) {
						if (pageFiles[i].name === page.id + '.json') {
							fileId = pageFiles[i].id;
							break;
						}
					}
					page.fileId = fileId || '';
				});

				return _getPageLayouts(server, pages);

			})
			.then(function (result) {
				// console.log(pages);

				let format2 = '  %-36s  %-s';
				console.log(sprintf(format1, 'Theme layouts used', ''));
				console.log(sprintf(format2, 'Layout', 'Pages'));
				themeLayouts.forEach(function (layout) {
					let usedbyPages = [];
					for (let i = 0; i < pages.length; i++) {
						if (layout === pages[i].pageLayout) {
							usedbyPages.push(pages[i].id);
						}
					}
					console.log(sprintf(format2, layout, usedbyPages));
				});

				console.log('');

				done(true);
			}).catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

/**
 * Describe a site page
 */
module.exports.describeSitePage = function (argv, done) {
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

	var name = argv.name;
	var pageIds = typeof argv.pages === 'number' ? [argv.pages] : argv.pages.split(',');
	for (let i = 0; i < pageIds.length; i++) {
		pageIds[i] = parseInt(pageIds[i]);
	}

	var includeSubPages = typeof argv.expand === 'string' && argv.expand.toLowerCase() === 'true';

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var site;
		var siteStructure;
		var validPageIds = [];
		var allPageIds = [];
		var componentsUsed, contentItemsUsed, contentTypesUsed;

		sitesRest.getSite({
			server: server,
			name: name,
			expand: 'ownedBy,createdBy,lastModifiedBy,members,repository,channel,vanityDomain,siteCategory'
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				site = result;

				// get site structure
				return serverRest.findFile({
					server: server,
					parentID: site.id,
					filename: 'structure.json',
					itemtype: 'file'
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				let structureFileId = result.id;

				return serverRest.readFile({
					server: server,
					fFileGUID: structureFileId
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: failed to get site structure');
					return Promise.reject();
				}
				siteStructure = result;
				let pages = siteStructure && siteStructure.pages || [];

				console.info(' - verify site (Id: ' + site.id + ' total pages: ' + pages.length + ')');

				// validate the pages
				for (let i = 0; i < pageIds.length; i++) {
					let found = false;
					for (let j = 0; j < siteStructure.pages.length; j++) {
						if (pageIds[i] == siteStructure.pages[j].id) {
							found = true;
							validPageIds.push(pageIds[i]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: invalid page ID ' + pageIds[i]);
					}
				}
				if (validPageIds.length === 0) {
					console.error('ERROR: no valid page is specified');
					return Promise.reject();
				}

				validPageIds.forEach(function (parentId) {
					if (!allPageIds.includes(parentId)) {
						allPageIds.push(parentId);
					}
					if (includeSubPages) {
						let childIds = [];
						_getChildPages(siteStructure, parentId, childIds);
						for (let i = 0; i < childIds.length; i++) {
							if (!allPageIds.includes(childIds[i])) {
								allPageIds.push(childIds[i]);
							}
						}
					}
				});
				console.info(' - pages: ' + allPageIds);

				return serverUtils.getSiteUsedData(server, site.id);

			})
			.then(function (result) {
				componentsUsed = result && result.componentsUsed || [];
				contentItemsUsed = result && result.contentItemsUsed || [];
				contentTypesUsed = result && result.contentTypesUsed || [];

				var pages = [];
				var allComponents = [];
				var allItems = [];
				var allTypes = [];
				allPageIds.forEach(function (id) {
					let obj = {};
					for (let i = 0; i < siteStructure.pages.length; i++) {
						if (id === siteStructure.pages[i].id) {
							obj = siteStructure.pages[i];
							break;
						}
					}

					let comps = [];
					componentsUsed.forEach(function (comp) {
						if (comp.scsPageID && comp.scsPageID === id.toString() && !comps.includes(comp.scsComponentName)) {
							comps.push(comp.scsComponentName);
							if (!allComponents.includes(comp.scsComponentName)) {
								allComponents.push(comp.scsComponentName);
							}
						}
					});
					obj.components = comps;

					let items = [];
					contentItemsUsed.forEach(function (item) {
						if (item.scsPageID && item.scsPageID === id.toString() && !items.includes(item.scsContentItemID)) {
							items.push(item.scsContentItemID);
							if (!allItems.includes(item.scsContentItemID)) {
								allItems.push(item.scsContentItemID);
							}
						}
					});
					obj.contentItems = items;

					let types = [];
					contentTypesUsed.forEach(function (type) {
						if (type.scsPageID && type.scsPageID === id.toString() && !types.includes(type.scsTypeName)) {
							types.push(type.scsTypeName);
							if (!allTypes.includes(type.scsTypeName)) {
								allTypes.push(type.scsTypeName);
							}
						}
					});
					obj.contentTypes = types;

					pages.push(obj);
				});
				// console.log(pages);

				var format1 = '%-20s  %-s';
				pages.forEach(function (page) {
					console.log(sprintf(format1, 'Id', page.id));
					console.log(sprintf(format1, 'Name', page.name));
					console.log(sprintf(format1, 'URL', page.pageUrl));
					console.log(sprintf(format1, 'Components', page.components));
					console.log(sprintf(format1, 'contentItems', page.contentItems));
					console.log(sprintf(format1, 'contentTypes', page.contentTypes));
				});
				console.log('');
				if (pages.length > 1) {
					console.log(sprintf(format1, 'All components', allComponents));
					console.log(sprintf(format1, 'All itemss', allItems));
					console.log(sprintf(format1, 'All types', allTypes));
					console.log('');
				}

				if (output) {
					let pagesJson = {
						pages: pages,
						allComponents: allComponents,
						allItems: allItems,
						allTypes: allTypes
					};
					fs.writeFileSync(output, JSON.stringify(pagesJson, null, 4));
					console.log(' - properties saved to ' + output);
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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

					access = 'Service users';
					checked = accValues.includes('service') ? '√' : '';
					console.log(sprintf(format2, checked, access));

					access = 'Specific users';
					checked = accValues.includes('named') ? '√' : '';
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
				console.error('ERROR: failed to get site security');
				if (error) {
					console.error(error);
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
					console.error('ERROR: user ' + deleteUserNames[i] + ' in both <addusers> and <deleteusers>');
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

		var exitCode;
		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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
					console.info(' - get site: runtimeStatus: ' + site.runtimeStatus + ' securityStatus: ' + (siteSecured ? 'secured' : 'public'));

					if (signin === 'no' && !siteSecured) {
						console.log(' - site is already publicly available to anyone');
						exitCode = 2;
						return Promise.reject();
					}
					if (siteOnline) {
						console.error('ERROR: site is currently online. In order to change the security setting you must first bring this site offline.');
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
						for (let i = 0; i < addUserNames.length; i++) {
							usersPromises.push(serverRest.getUser({
								server: server,
								name: addUserNames[i]
							}));
						}
						for (let i = 0; i < deleteUserNames.length; i++) {
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

							console.info(' - verify users');
							var err = false;
							// verify users
							for (var k = 0; k < addUserNames.length; k++) {
								var found = false;
								for (let i = 0; i < allUsers.length; i++) {
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
									console.error('ERROR: user ' + addUserNames[k] + ' does not exist');
									err = true;
								}
							}
							for (let k = 0; k < deleteUserNames.length; k++) {
								let found = false;
								for (let i = 0; i < allUsers.length; i++) {
									if (allUsers[i].loginName.toLowerCase() === deleteUserNames[k].toLowerCase()) {
										if (siteMembers.includes(allUsers[i].loginName)) {
											let user = allUsers[i];
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
									console.error('ERROR: user ' + deleteUserNames[k] + ' does not exist');
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
						name: name,
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
									name: name,
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
									name: name,
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

						access = 'Service users';
						checked = accValues.includes('service') ? '√' : '';
						console.log(sprintf(format2, checked, access));

						access = 'Specific users';
						checked = accValues.includes('named') ? '√' : '';
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
					done(exitCode);
				});
		});
	} catch (e) {
		console.error(e);
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

	var srcPath = argv.path;

	if (!path.isAbsolute(srcPath)) {
		srcPath = path.join(projectDir, srcPath);
	}
	srcPath = path.resolve(srcPath);

	if (!fs.existsSync(srcPath)) {
		console.error('ERROR: folder ' + srcPath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(srcPath).isDirectory()) {
		console.error('ERROR: ' + srcPath + ' is not a folder');
		done();
		return;
	}
	console.info(' - static site folder: ' + srcPath);

	var targetFolder = argv.folder;
	if (targetFolder) {
		if (!path.isAbsolute(targetFolder)) {
			targetFolder = path.join(projectDir, targetFolder);
		}
		targetFolder = path.resolve(targetFolder);

		if (!fs.existsSync(targetFolder)) {
			console.error('ERROR: folder ' + targetFolder + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(targetFolder).isDirectory()) {
			console.error('ERROR: ' + targetFolder + ' is not a folder');
			done();
			return;
		}
		_prepareStaticSite(srcPath, targetFolder)
			.then(function (result) {
				if (!result || result.err) {
					done();
				} else {
					console.log(' - static files saved to ' + targetFolder);
					done(true);
				}
			});
	} else {
		// prepare static files and upload to the server
		_uploadStaticSite(argv, srcPath)
			.then(function (result) {
				if (!result || result.err) {
					done();
				} else {
					done(true);
				}
			})
	}
};

var _uploadStaticSite = function (argv, srcPath) {
	return new Promise(function (resolve, reject) {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			return resolve({
				err: 'err'
			});
		}

		var zipfile = argv.zipfile;
		if (zipfile && !serverUtils.endsWith(zipfile, '.zip')) {
			zipfile = zipfile + '.zip';
		}

		var siteName = argv.site;

		var siteId;

		var targetPath;

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			var sitePromises = [];
			if (siteName) {
				sitePromises.push(sitesRest.getSite({
					server: server,
					name: siteName
				}));
			}
			Promise.all(sitePromises)
				.then(function (results) {
					if (siteName) {
						if (!results || !results[0] || results[0].err) {
							return Promise.reject();
						}
						if (!results[0].id) {
							console.error('ERROR: site ' + siteName + ' does not exist');
							return Promise.reject();
						}
						siteId = results[0].id;
						console.info(' - verify site ' + siteName + ' (' + siteId + ')');
					}

					// By default the processed static files are under build/static
					var buildDir = serverUtils.getBuildFolder(projectDir);
					if (!fs.existsSync(buildDir)) {
						fs.mkdirSync(buildDir);
					}
					var staticFolder = path.join(buildDir, 'static');
					fileUtils.remove(staticFolder);
					fs.mkdirSync(staticFolder);

					targetPath = staticFolder;

					return _prepareStaticSite(srcPath, targetPath);

				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					var zipPromises = [];
					if (zipfile) {
						zipPromises.push(_zipStaticFiles(targetPath, zipfile));
					}

					return Promise.all(zipPromises);

				})
				.then(function (result) {

					var zippath;
					if (zipfile) {
						zippath = path.join(projectDir, 'dist', zipfile);
						if (!fs.existsSync(zippath)) {
							console.log('ERROR: failed to create zip file');
							return Promise.reject();

						}
					}

					var uploadPromises = [];

					if (zippath) {
						var uploadFileArgv = {
							file: zippath,
							folder: 'site:' + siteName + '/static',
							createfolder: 'true'
						};
						uploadPromises.push(documentUtils.uploadFile(uploadFileArgv, server));
					} else {
						var uploadArgv = {
							path: targetPath + '/',
							folder: 'site:' + siteName + '/static'
						};
						uploadPromises.push(documentUtils.uploadFolder(uploadArgv, server));
					}

					return Promise.all(uploadPromises);
				})
				.then(function (result) {

					if (!zipfile) {
						console.log(' - static files uploaded');
					}

					return resolve({});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					return (resolve({
						err: 'err'
					}));
				});

		});
	});
};


var _prepareStaticSite = function (srcPath, targetPath) {
	return new Promise(function (resolve, reject) {
		serverUtils.paths(srcPath, function (err, paths) {
			if (err) {
				console.error(err);
				return resolve({
					err: 'err'
				});
			} else {
				try {
					if (paths.files.length === 0 && paths.dirs.length === 0) {
						console.error('ERROR: no file nor folder under ' + srcPath);
						return resolve({
							err: 'err'
						});
					}

					var staticFolder = targetPath;

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

					for (let i = 0; i < files.length; i++) {
						var fileFolder = files[i];
						fileFolder = fileFolder.substring(srcPath.length + 1);
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
					console.error(e);
					return resolve({
						err: 'err'
					});
				}
			}
		});
	});
};

var _zipStaticFiles = function (folderPath, zipFileName) {
	return new Promise(function (resolve, reject) {
		//
		// create the zip file
		// 
		gulp.src(folderPath + '/**', {
			base: folderPath
		})
			.pipe(zip(zipFileName, {
				buffer: false
			}))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', function () {
				var zippath = path.join(projectDir, 'dist', zipFileName);
				console.info(' - created file ' + zippath);
				return resolve({});
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
			console.error('ERROR: folder ' + targetPath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(targetPath).isDirectory()) {
			console.error('ERROR: ' + targetPath + ' is not a folder');
			done();
			return;
		}
	} else {
		targetPath = path.join(documentsSrcDir, siteName, 'static');
		saveToSrc = true;
	}
	console.info(' - local folder ' + targetPath);

	var siteId;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
					console.error('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.info(' - verify site');

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: siteId,
					folderPath: 'static'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: site ' + siteName + ' does not have static files');
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
				console.error(err);
				return resolve({
					err: 'err'
				});
			} else {
				try {
					if (paths.files.length === 0 && paths.dirs.length === 0) {
						console.error('ERROR: no file nor folder under ' + srcPath);
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
							fs.renameSync(filePath, path.join(parentFolder, fileName));
						}
					}

					var subdirs = paths.dirs;
					for (let i = 0; i < subdirs.length; i++) {
						var subdir = subdirs[i];
						if (serverUtils.endsWith(subdir, '_files')) {
							fileUtils.remove(subdir);
							// console.log('remove ' + subdir);
						}
					}

					return resolve({});
				} catch (e) {
					console.error(e);
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

	var siteId;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
					console.error('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}
				siteId = result.id;
				console.info(' - verify site');

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: siteId,
					folderPath: 'static'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: site ' + siteName + ' does not have static files');
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

	var siteId;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
					console.error('ERROR: Pre-render is not enabled');
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
							console.error('ERROR: site ' + siteName + ' does not exist');
							return Promise.reject();
						}
						siteId = result.id;
						console.info(' - verify site');

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
			})
			.catch((error) => {
				done();
			});
	});
};


var _migrateICGUID = function (templateName) {
	return new Promise(function (resolve, reject) {
		var tempSrc = path.join(templatesSrcDir, templateName);
		var digitalAssetPath = path.join(tempSrc, 'assets', 'contenttemplate',
			'Content Template of ' + templateName, 'ContentItems', 'DigitalAsset');
		if (!fs.existsSync(digitalAssetPath)) {
			console.info(' - template does not have digital assets');
			return resolve({});
		}

		var jsonFiles = fs.readdirSync(digitalAssetPath);
		if (!jsonFiles || jsonFiles.length === 0) {
			console.info(' - template does not have digital assets');
			return resolve({});
		}

		console.info(' - processing template digital assets');

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
				console.info('   rename file ' + file + ' => ' + newFile);
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
					fs.renameSync(folderPath, path.join(digitalAssetPath, 'files', newFolder));
					console.info(' - rename folder ' + folder + ' => ' + newFolder);
				}
			}
		});

		// update all site pages
		var pagesPath = path.join(tempSrc, 'pages');
		var pageFiles = fs.readdirSync(pagesPath);
		if (!pageFiles || pageFiles.length === 0) {
			console.info(' - template does not have pages');
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
						console.info(' - update ' + filePath.replace((projectDir + path.sep), '') + ' with new IDs');
					}
				}
			});
		}

		// update all json files under content assets
		var contenttemplatePath = path.join(tempSrc, 'assets', 'contenttemplate');
		serverUtils.paths(contenttemplatePath, function (err, paths) {
			if (err) {
				console.error(err);
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
							console.info(' - update ' + filePath.replace((projectDir + path.sep), '') + ' with new IDs');
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
			console.error('ERROR: server ' + server.url + ' is not a valid source to migrate site');
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
		console.error('ERROR: server ' + destServer.url + ' is not a valid destination to migrate site');
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
			console.error('ERROR: file ' + tempPath + ' does not exist');
			done();
			return;
		}
		if (fs.statSync(tempPath).isDirectory()) {
			console.error('ERROR: ' + tempPath + ' is not a file');
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


	var folderId = 'self';
	var repositoryId;
	var fileName, fileId;
	var cecVersion;

	var loginPromise = serverUtils.loginToServer(destServer);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage + ' ' + destServer.url);
			done();
			return;
		}

		var template, templateGUID;
		var srcSiteId;

		// verify site
		sitesRest.resourceExist({
			server: destServer,
			type: 'sites',
			name: siteName
		})
			.then(function (result) {
				if (result && result.id) {
					console.error('ERROR: site ' + siteName + ' already exists');
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
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				repositoryId = result.data && result.data.id;
				console.info(' - verify repository (Id: ' + repositoryId + ')');

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
					srcSiteId = results[0].siteId;
				}

				var templatePath;
				if (tempPath) {
					fileName = tempPath.substring(tempPath.lastIndexOf(path.sep) + 1);
					templateName = fileName.substring(0, fileName.indexOf('.'));
					templatePath = tempPath;
					console.info(' - template file ' + templatePath + ' name ' + templateName);
				} else {
					fileName = templateName + '.zip';
					var destdir = path.join(projectDir, 'dist');
					if (!fs.existsSync(destdir)) {
						fs.mkdirSync(destdir);
					}
					templatePath = path.join(destdir, fileName);
					if (!fs.existsSync(templatePath)) {
						console.error('ERROR: failed to download template ' + templateName);
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
				console.info(' - template file: ' + templatePath);

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
				console.info(' - file ' + fileName + ' uploaded to Home folder (Id: ' + result.id + ' version:' + result.version + ')');

				return sitesRest.importTemplate({
					server: destServer,
					name: templateName,
					fileId: fileId
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				// query the imported template
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

				return sitesRest.createSite({
					server: destServer,
					id: srcSiteId,
					name: siteName,
					descriptions: description,
					sitePrefix: sitePrefix,
					templateName: templateName,
					templateId: templateGUID,
					repositoryId: repositoryId,
					updateContent: true
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				// query the site
				return sitesRest.getSite({
					server: destServer,
					name: siteName
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.log(' - site ' + siteName + ' created on ' + destServer.url);
				console.log(' - site id: ' + result.id);

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
				_cmdEnd(done, true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				_cmdEnd(done);
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
	console.info(' - source server: ' + srcServer.url);

	var destServer = argv.destination;
	console.info(' - destination server: ' + destServer.url);

	var siteId = argv.id;
	var siteName = argv.name;
	var action = argv.action || 'publish';

	serverUtils.loginToServer(srcServer)
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + destServer.url);
				return Promise.reject();
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

					_controlSiteREST(destServer, action, siteName)
						.then(function (result) {
							if (result.err) {
								done();
							} else {
								done(true);
							}
						});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					done();
				});
		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			done();
		});

};

//////////////////////////////////////////////////////////////////////////
//    Refresh server event handlers
//////////////////////////////////////////////////////////////////////////

module.exports.refreshSitePrerenderCache = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	// console.log(' - source server: ' + srcServer.url);

	var server = argv.server;
	var channelId = argv.id;
	var siteName = argv.name;
	var items = argv.items;
	var typeDetailPages = argv.typeDetailPages;

	var urls = [];
	items.forEach(function (item) {
		if (item.slug) {
			var itemDetailPage;
			for (var i = 0; i < typeDetailPages.length; i++) {
				if (item.type === typeDetailPages[i].type && typeDetailPages[i].detailpage) {
					itemDetailPage = typeDetailPages[i].detailpage;
					break;
				}
			}
			if (itemDetailPage) {
				// console.log(' - item: ' + item.name + ' ' + item.slug);
				var url = (itemDetailPage.indexOf('http') < 0 ? server.url + itemDetailPage : itemDetailPage) + '/' + item.slug + '?_escaped_fragment_=';
				urls.push(url);
			}
		}
	});
	// console.log(urls);
	_refreshPrerenderCache(urls)
		.then(function (result) {
			done(true);
		});

};

var _refreshPrerenderCache = function (urls) {
	return new Promise(function (resolve, reject) {
		var total = urls.length;
		// console.log(' - total number of urls: ' + total);
		var groups = [];
		var limit = 5;
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
		// console.log(' - total number of groups: ' + groups.length);

		var doSendUrl = groups.reduce(function (urlPromise, param) {
			return urlPromise.then(function (result) {
				var urlPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					urlPromises.push(_doGet(urls[i]));
				}

				return Promise.all(urlPromises).then(function (results) { });

			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doSendUrl.then(function (result) {
			resolve({});
		});

	});
};

var _doGet = function (url) {
	return new Promise(function (resolve, reject) {
		var options = {
			url: url
		};

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.log(' - ' + url + ' : ERROR ' + err.toString());
				resolve({
					err: 'err'
				});
			}
			// console.log(' - status: ' + response.statusCode + ' (' + response.statusMessage + ')');
			if (response && response.statusCode === 200) {
				console.info('GET ' + url + ' : OK ');
				resolve({});
			} else {
				console.log(' - ' + url + ' : ' + (response.statusMessage | response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
	});
};

module.exports.compileSite = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var jobParams = {
		compileContentJob: false,
		compileOnly: '1',
		publishUsedContentOnly: '0',
		doForceActivate: '0',
		status: 'CREATED',
		progress: 0
	};
	jobParams.name = 'Compile' + argv.siteName;
	jobParams.siteName = argv.siteName;
	jobParams.serverEndpoint = argv.endpoint;
	jobParams.serverUser = argv.user;
	jobParams.serverPass = argv.password;
	jobParams.serverName = argv.server;
	jobParams.token = argv.token;

	console.info(jobParams);


	var persistenceStore = require('../test/job-manager/sampleFilePersistenceStore.js');
	var ps = persistenceStore();
	var jobManager = require('../test/job-manager/jobManager.js');
	var jm = jobManager({
		ps: ps
	});

	var jobId;
	ps.createJob(jobParams).then(function (config) {
		jobId = config.id;
		// we start from CREATE_TEMPLATE for compiling the site
		return jm.updateStatus(config, "CREATE_TEMPLATE").then(function (updatedConfig) {
			return jm.compileJob(updatedConfig).then(function (result) {
				_cmdEnd(done, true);
			});
		});
	}).catch(function (e) {
		_cmdEnd(done);
	});
};