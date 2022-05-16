/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

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

var console = require('../test/server/logger.js').console;

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

	_createSiteREST(server, name, templateName, repositoryName, localizationPolicyName, defaultLanguage, description, sitePrefix, updateContent, reuseContent, done);

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
	defaultLanguage, description, sitePrefix, updateContent, reuseContent, done) {
	var template, templateGUID;
	var repositoryId, localizationPolicyId;
	var createEnterprise;
	var governanceEnabled;
	var localizationPolicyAllowed;
	var sitePrefixAllowed;

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

				if (governanceEnabled && (!template.policy || !template.policy.status || template.policy.status !== 'active')) {
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
						templateName: templateName
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
									console.error('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
									return Promise.reject();
								}
								console.info(' - get localization policy');
							} else {
								for (var i = 0; i < policies.length; i++) {
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

							//
							// create enterprise site
							//
							console.info(' - creating enterprise site ...');
							console.info(sprintf(format, 'name', name));
							console.info(sprintf(format, 'template', templateName));
							if (!governanceEnabled || sitePrefixAllowed) {
								console.info(sprintf(format, 'site prefix', sitePrefix));
							}
							console.info(sprintf(format, 'repository', repositoryName));
							if (!governanceEnabled && localizationPolicyAllowed) {
								console.info(sprintf(format, 'localization policy', policy.name));
							}
							console.info(sprintf(format, 'default language', defaultLanguage));

							return sitesRest.createSite({
								server: server,
								name: name,
								description: description,
								sitePrefix: !governanceEnabled || sitePrefixAllowed ? sitePrefix : '',
								templateName: templateName,
								templateId: template.id,
								repositoryId: repositoryId,
								localizationPolicyId: !governanceEnabled || localizationPolicyAllowed ? localizationPolicyId : '',
								defaultLanguage: defaultLanguage,
								updateContent: updateContent,
								reuseContent: reuseContent
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

var _transferStandardSite = function (argv, server, destServer, site, excludecomponents, excludetheme, suppressgovernance) {
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
				return templateUtils.createLocalTemplateFromSite(argv, templateName, siteName, server, excludecontent, enterprisetemplate, excludecomponents, excludetheme);
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
				var excludeSiteContent = false;

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
				_transferSiteTemplateId = templateId;

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
		console.error('ERROR: source and destination server are the same');
		done();
		return;
	}

	var excludecontent = typeof argv.excludecontent === 'string' && argv.excludecontent.toLowerCase() === 'true';
	var excludecomponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';
	var excludetheme = typeof argv.excludetheme === 'string' && argv.excludetheme.toLowerCase() === 'true';
	var excludetype = typeof argv.excludetype === 'string' && argv.excludetype.toLowerCase() === 'true';
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

					return serverUtils.getIdcToken(destServer);
				})
				.then(function (result) {
					// fetch token
					if (result && result.idcToken) {
						idcToken = result && result.idcToken;
					}

					if (!site.isEnterprise) {

						_transferStandardSite(argv, server, destServer, site, excludecomponents, excludetheme, suppressgovernance)
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
										console.error('ERROR: site prefix "' + (sitePrefix || site.sitePrefix) + '" is used by some content, please specify a different prefix');
										return Promise.reject();
									}
								}

								// create template on the source server and download
								var enterprisetemplate = true;
								return templateUtils.createLocalTemplateFromSite(
									argv, templateName, siteName, server, excludecontent, enterprisetemplate, excludecomponents, excludetheme, excludetype, publishedassets, referencedassets);

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
								if (includestaticfiles) {
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

		if (itemsUsedAdded.length === 0 && itemsUsedAdded.length === 0) {
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

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}
			// if (server.useRest) {
			_controlSiteREST(server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish)
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
var _controlSiteREST = function (server, action, siteName, usedContentOnly, compileSite, staticOnly, fullpublish) {

	return new Promise(function (resolve, reject) {
		var exitCode;
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
				console.info(' - get site: runtimeStatus: ' + runtimeStatus + '  publishStatus: ' + publishStatus);

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
				} else if (action === 'publish-internal') {
					console.log(' - publish site using Idc service');
					actionPromise = _publishSiteInternal(server, site.id, site.name, usedContentOnly, compileSite, staticOnly, fullpublish);

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
					console.error('ERROR: invalid action ' + action);
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
					console.error(error);
				}
				return resolve({
					err: 'err',
					exitCode: exitCode
				});
			});
	});
};


/**
 * Publish a site using IdcService (compile site workaround)
 */
var _publishSiteInternal = function (server, siteId, siteName, usedContentOnly, compileSite, staticOnly, fullpublish) {
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
				if (fullpublish) {
					body.LocalData.type = 'full';
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
				return ({
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
						console.info(' - verify users');
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
						console.info(' - verify users');
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			_validateSiteREST(server, siteName, done);

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

var _displayAssetValidation = function (validations) {
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

	var format = '  %-12s : %-s';

	var items = policyValidation.items;
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
	if (error) {
		console.log('  is valid: ' + valid);
		console.error('ERROR: ' + error);
	}

};

var _validateSiteREST = function (server, siteName, done) {
	var siteId;
	var siteValidation;
	var repositoryId, channelId, channelToken;
	var itemIds = [];
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
					if (siteValidation) {
						console.log('Site Validation:');
						_displaySiteValidation(siteValidation);
					}

					console.log('Assets Validation:');
					if (data.result && data.result.body && data.result.body.operations && data.result.body.operations.validatePublish && data.result.body.operations.validatePublish.validationResults) {
						var assetsValidation = data.result.body.operations.validatePublish.validationResults;
						_displayAssetValidation(assetsValidation);
					} else {
						console.log('  no assets');
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

							console.info(' - verify users');
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
									console.error('ERROR: user ' + addUserNames[k] + ' does not exist');
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
			.then(function (result) {

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


var _prepareStaticSite = function (srcPath) {
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
					fse.moveSync(folderPath, path.join(digitalAssetPath, 'files', newFolder));
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

	serverUtils.loginToServer(srcServer).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
				done();
			});
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
		doForceActivate: '0',
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