/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	Client = require('node-rest-client').Client,
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	os = require('os'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf;

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


module.exports.createAssetReport = function (argv, done) {
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
	// console.log(' - server: ' + server.url);

	var output = argv.output;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output;
		if (serverUtils.endsWith(outputFolder, '.json')) {
			outputFolder = outputFolder.substring(0, outputFolder.lastIndexOf('/'));
		} else {
			output = path.join(output, argv.site + 'AssetUsage.json');
		}
		if (!fs.existsSync(outputFolder)) {
			console.log('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.log('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	_createAssetReport(server, serverName, argv.site, output, done);
};

var _createAssetReport = function (server, serverName, siteName, output, done) {

	var request = serverUtils.getRequest();

	var site, siteInfo;
	var isEnterprise;
	var templateName, template;
	var themeName, theme;
	var repository, channel;

	var itemIds = [];
	var pageItems;
	var channelItems;

	var typeNames = [];
	var pageContentTypes = [];

	var allComponents = [];
	var hasComp = false;
	var compIds = [];
	var compNames = [];
	var pageComponents = [];

	var sitejson = {};
	var sitepolicyjson = {};
	var templatejson = {};
	var themejson = {};
	var repositoryjson = {};
	var channeljson = {};
	var channelpolicyjson = {};

	var structurePages;
	var pages;
	var pagesOutput = [];

	var issues = [];

	var format = '  %-32s  %s';
	var _getMemberStr = function (val) {
		var str = '';
		if (!val) {
			return str;
		}
		var managers = [];
		var contributors = [];
		var downloaders = [];
		var viewers = [];
		for (var i = 0; i < val.length; i++) {
			// support both folders and caas resources
			var name = val[i].name || val[i].id || val[i].fullName;
			var role = val[i].role || val[i].roleName;

			if (role === 'manager') {
				managers.push(name);
			} else if (role === 'contributor') {
				contributors.push(name);
			} else if (role === 'downloader') {
				downloaders.push(name);
			} else {
				viewers.push(name);
			}
		}

		if (managers.length > 0) {
			str = str + 'Manager: ' + managers.join(', ');
		}
		if (contributors.length > 0) {
			str = str + ' Contributor: ' + contributors.join(', ');
		}
		if (downloaders.length > 0) {
			str = str + ' Downloader: ' + downloaders.join(', ');
		}
		if (viewers.length > 0) {
			str = str + ' Viewer: ' + viewers.join(', ');
		}
		return str;
	};
	var _displayObject = function (obj) {
		Object.keys(obj).forEach(function (key) {
			val = obj[key];
			if (key === 'members') {
				console.log(sprintf(format, key, _getMemberStr(val)));
			} else {
				if (Array.isArray(val)) {
					console.log(sprintf(format, key, val.join(', ')));
				} else {
					console.log(sprintf(format, key, val));
				}
			}
		});
	};
	var _display = function () {
		console.log('');
		console.log('Site');
		_displayObject(sitejson);
		console.log('');

		console.log('Site Localization Policy');
		_displayObject(sitepolicyjson);
		console.log('');

		console.log('Template');
		_displayObject(templatejson);
		console.log('');

		console.log('Theme');
		_displayObject(themejson);
		console.log('');

		console.log('Repository');
		_displayObject(repositoryjson);
		console.log('');

		console.log('Channel');
		_displayObject(channeljson);
		console.log('');

		console.log('Channel Localization Policy');
		_displayObject(channelpolicyjson);
		console.log('');

		console.log('Content Type Permissions');
		for (var i = 0; i < pageContentTypes.length; i++) {
			console.log(sprintf(format, pageContentTypes[i].name, _getMemberStr(pageContentTypes[i].members)));
		}
		console.log('');

		console.log('Component Permissions');
		for (var i = 0; i < pageComponents.length; i++) {
			console.log(sprintf(format, pageComponents[i].name, _getMemberStr(pageComponents[i].members)));
		}
		console.log('');

		// site pages
		for (var i = 0; i < pagesOutput.length; i++) {
			var page = pagesOutput[i];
			console.log('Page ' + page.id);
			console.log(sprintf(format, 'name', page.name));
			console.log(sprintf(format, 'version', page.version));
			if (page.contentlist.length > 0) {
				var types = [];
				for (var j = 0; j < page.contentlist.length; j++) {
					types.push(page.contentlist[j].contentType);
				}
				console.log(sprintf(format, 'contentlist', types.join(', ')));
			}
			if (page.contentitems.length > 0) {
				for (var j = 0; j < page.contentitems.length; j++) {
					var item = page.contentitems[j];
					var msg = 'id:' + item.id + ' name:' + item.name + ' type:' + item.contentType;
					if (!item.exist) {
						msg = msg + ' ERROR: not exist';
					} else if (!item.existInChannel) {
						msg = msg + ' ERROR: not in channel';
					}
					console.log(sprintf(format, (j === 0 ? 'items' : ' '), msg));
				}
			}
			if (page.components.length > 0) {
				console.log(sprintf(format, 'components', page.components.join(', ')));
			}
		}
		console.log('');

		if (issues.length === 0) {
			console.log('Issues: none');
		} else {
			console.log('Issues:');
			for (var i = 0; i < issues.length; i++) {
				console.log(' - ' + issues[i]);
			}
		}
		console.log('');
	};

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		server['login'] = true;

		serverUtils.browseSitesOnServer(request, server).then(function (result) {
				var sites = result.data || [];
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

				// console.log(site);
				sitejson['id'] = site.fFolderGUID;
				sitejson['name'] = site.fFolderName;
				sitejson['type'] = site.xScsIsEnterprise === '1' ? 'Enterprise' : 'Standard';
				sitejson['slug'] = site.xScsSlugPrefix;
				sitejson['defaultLanguage'] = site.xScsSiteDefaultLanguage;
				sitejson['siteTemplate'] = site.xScsSiteTemplate;
				sitejson['owner'] = site.fCreatorFullName;
				templateName = site.xScsSiteTemplate;

				isEnterprise = site.xScsIsEnterprise === '1';

				return serverUtils.getSiteInfoWithToken(server, siteName);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				siteInfo = result && result.siteInfo;
				// console.log(siteInfo);
				if (siteInfo) {
					sitejson['theme'] = siteInfo.themeName;
					themeName = siteInfo.themeName;
				}
				console.log(' - query site');

				return serverRest.getFolderUsers({
					registeredServerName: serverName,
					currPath: projectDir,
					id: site.fFolderGUID
				});
			})
			.then(function (result) {
				sitejson['members'] = result && result.data || [];
				console.log(' - query site members');

				var policyPromises = [];
				if (siteInfo && siteInfo.localizationPolicy) {
					policyPromises.push(serverRest.getLocalizationPolicy({
						registeredServerName: serverName,
						currPath: projectDir,
						id: siteInfo.localizationPolicy
					}));
				}
				return Promise.all(policyPromises);
			})
			.then(function (results) {
				console.log(' - query site localization policy');
				var policy = results.length > 0 ? results[0] : undefined;
				if (policy && policy.id) {
					sitepolicyjson['id'] = policy.id;
					sitepolicyjson['name'] = policy.name;
					sitepolicyjson['defaultLanguage'] = policy.defaultValue;
					sitepolicyjson['requiredLanguages'] = policy.requiredValues;
					sitepolicyjson['optionalLanguages'] = policy.optionalValues;

					if (!policy.defaultValue) {
						issues.push('Localization policy ' + policy.name + ' does not have default language');
					}
				}

				return serverUtils.browseSitesOnServer(request, server, 'framework.site.template');
			})
			.then(function (result) {
				//
				// list templates
				//
				console.log(' - query site template');

				var templates = result.data || [];

				for (var i = 0; i < templates.length; i++) {
					var temp = templates[i];
					if (temp.fFolderName.toLowerCase() === templateName.toLowerCase()) {
						template = temp;
						templatejson['id'] = temp.fFolderGUID;
						templatejson['name'] = temp.fFolderName;
						templatejson['owner'] = temp.fCreatorFullName;
						break;
					}
				}

				var tempUserPromises = [];
				if (template) {
					tempUserPromises.push(
						serverRest.getFolderUsers({
							registeredServerName: serverName,
							currPath: projectDir,
							id: template.fFolderGUID
						}));
				} else {
					issues.push('User ' + server.username + ' has no access to template ' + templateName);
				}
				return Promise.all(tempUserPromises);
			})
			.then(function (results) {
				console.log(' - query site template members');
				if (templatejson.id) {
					templatejson['members'] = results.length > 0 ? results[0].data : [];
				}

				var params = 'doBrowseStarterThemes=1';
				return serverUtils.browseThemesOnServer(request, server, params);

			})
			.then(function (result) {
				//
				// list themes
				//
				console.log(' - query theme');
				var themes = result.data || [];

				for (var i = 0; i < themes.length; i++) {
					if (themes[i].fFolderName.toLowerCase() === themeName.toLowerCase()) {
						theme = themes[i];
						// console.log(theme);
						themejson['id'] = theme.fFolderGUID;
						themejson['name'] = theme.fFolderName;
						themejson['owner'] = theme.fCreatorFullName;
						break;
					}
				}

				return serverRest.getFolderUsers({
					registeredServerName: serverName,
					currPath: projectDir,
					id: theme.fFolderGUID
				});
			})
			.then(function (result) {
				console.log(' - query theme member');
				themejson['members'] = result && result.data || [];

				var repoPromises = [];
				if (siteInfo.repositoryId) {
					repoPromises.push(serverRest.getRepository({
						registeredServerName: serverName,
						currPath: projectDir,
						id: siteInfo.repositoryId
					}));
				}

				return Promise.all(repoPromises);
			})
			.then(function (results) {
				console.log(' - query repository');
				repository = results.length > 0 ? results[0] : undefined;

				if (repository) {
					repositoryjson['id'] = repository.id;
					repositoryjson['name'] = repository.name;

					var contentTypes = [];
					for (var i = 0; i < repository.contentTypes.length; i++) {
						contentTypes.push(repository.contentTypes[i].name);
					}
					repositoryjson['contentTypes'] = contentTypes;
				}

				var repoPermissionPromises = [];
				if (siteInfo.repositoryId) {
					repoPermissionPromises.push(serverRest.getResourcePermissions({
						registeredServerName: serverName,
						currPath: projectDir,
						id: siteInfo.repositoryId,
						type: 'repository'
					}));
				}

				return Promise.all(repoPermissionPromises);
			})
			.then(function (results) {
				console.log(' - query repository members');
				if (repository && results.length > 0) {
					repositoryjson['members'] = results[0].permissions || [];
				}

				var channelPromises = [];
				if (siteInfo.channelId) {
					channelPromises.push(serverRest.getChannel({
						registeredServerName: serverName,
						currPath: projectDir,
						id: siteInfo.channelId
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
				console.log(' - query channel');
				channel = results.length > 0 ? results[0] : undefined;

				var policyPromises = [];
				if (channel) {
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

					channeljson['id'] = channel.id;
					channeljson['name'] = channel.name;
					channeljson['token'] = channelToken;
					channeljson['type'] = channel.channelType;
					channeljson['publishPolicy'] = channel.publishPolicy === 'anythingPublished' ? 'Anything can be published' :
						'Only approved items can be published';

					policyPromises.push(serverRest.getLocalizationPolicy({
						registeredServerName: serverName,
						currPath: projectDir,
						id: channel.localizationPolicy
					}));
				}

				return Promise.all(policyPromises);
			})
			.then(function (results) {
				console.log(' - query channel localization policy');
				var result = results.length > 0 ? results[0] : undefined;
				if (result && result.id) {
					channelpolicyjson['id'] = result.id;
					channelpolicyjson['name'] = result.name;
					channelpolicyjson['defaultLanguage'] = result.defaultValue;
					channelpolicyjson['requiredLanguages'] = result.requiredValues;
					channelpolicyjson['optionalLanguages'] = result.optionalValues;
				}

				return _getSitePages(server, serverName, sitejson.id);
			})
			.then(function (result) {
				structurePages = result.structurePages || [];
				pages = result.pages || [];
				// console.log(structurePages);

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					var fileName = page.id + '.json';
					// console.log('page: id=' + page.id + ' name=' + page.name);
					for (var j = 0; j < pages.length; j++) {
						if (fileName === pages[j].name) {
							page['version'] = pages[j].version;
							var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances
							// console.log(componentInstances);
							var contentlist = [];
							var contentitems = [];
							var components = [];
							if (componentInstances) {
								Object.keys(componentInstances).forEach(function (key) {
									var comp = componentInstances[key];
									if (comp.id === 'scs-contentitem') {
										if (comp.data.contentId) {
											itemIds.push(comp.data.contentId);
											contentitems.push({
												id: comp.data.contentId,
												contentType: comp.data.contentTypes && comp.data.contentTypes.length > 0 ? comp.data.contentTypes[0] : ''
											});
										}
									} else if (comp.id === 'scs-contentlist') {
										if (comp.data.contentTypes[0]) {
											if (!typeNames.includes(comp.data.contentTypes[0])) {
												typeNames.push(comp.data.contentTypes[0]);
											}
											contentlist.push({
												contentType: comp.data.contentTypes[0]
											});
										}
									} else if (comp.type === 'scs-component' || comp.type === 'scs-app') {
										// custom component
										var name = comp.type === 'scs-component' ? comp.data.componentId || comp.data.componentName : comp.data.appName;
										if (name) {
											if (!components.includes(name)) {
												components.push(name);
											}
											if (!compNames.includes(name)) {
												compNames.push(name);
											}
										}
									}
								});
							}

							page['contentlist'] = contentlist;
							page['contentitems'] = contentitems;
							page['components'] = components;
						}
					}
				}

				var compPromises = [];
				if (compNames.length > 0) {
					compPromises.push(serverUtils.browseComponentsOnServer(request, server));
				}

				return Promise.all(compPromises);

			})
			.then(function (results) {
				console.log(' - query components');
				allComponents = results.length > 0 && results[0] ? results[0].data : [];
				if (allComponents.length > 0 && compNames.length > 0) {
					for (var j = 0; j < compNames.length; j++) {
						var comp = undefined;
						for (var k = 0; k < allComponents.length; k++) {

							if (compNames[j].toLowerCase() === allComponents[k].fFolderName.toLowerCase()) {
								comp = allComponents[k];
								var id = allComponents[k].fFolderGUID;
								if (!compIds.includes(id)) {
									compIds.push(id);
								}
								break;
							}
						}
						pageComponents.push({
							name: compNames[j],
							id: comp ? comp.fFolderGUID : '',
							owner: comp ? comp.fCreatorFullName : '',
							members: []
						});
						if (!comp) {
							issues.push('Component ' + compNames[j] + ' does not exist or user ' + server.username + ' has no access');
						}
					}
				}

				var compPermissionPromises = [];
				if (compIds.length > 0) {
					for (var i = 0; i < compIds.length; i++) {
						compPermissionPromises.push(serverRest.getFolderUsers({
							server: server,
							id: compIds[i]
						}));
					}
				}

				return Promise.all(compPermissionPromises);

			})
			.then(function (results) {
				console.log(' - query component permissions');
				var compUsers = results;
				if (compUsers.length > 0) {
					for (var j = 0; j < pageComponents.length; j++) {
						var comp = pageComponents[j];
						for (var k = 0; k < compUsers.length; k++) {
							if (comp.id === compUsers[k].id) {
								comp.members = compUsers[k].data;
							}
						}
					}
				}

				var typePermissionPromises = [];
				for (var i = 0; i < typeNames.length; i++) {
					pageContentTypes.push({
						name: typeNames[i],
						members: {}
					});
					typePermissionPromises.push(serverRest.getResourcePermissions({
						server: server,
						id: typeNames[i],
						type: 'type'
					}));
				}

				return Promise.all(typePermissionPromises);
			})
			.then(function (results) {
				console.log(' - query content type permissions');

				for (var i = 0; i < pageContentTypes.length; i++) {
					for (var j = 0; j < results.length; j++) {
						if (pageContentTypes[i].name === results[j].resource) {
							pageContentTypes[i].members = results[j].permissions;
							break;
						}
					}
				}

				return _getPageItems(server, itemIds);
			})
			.then(function (result) {
				pageItems = result || [];

				var channelItemPromises = [];
				if (channeljson && channeljson.id && channeljson.token) {
					channelItemPromises.push(serverRest.getChannelItems({
						server: server,
						channelToken: channeljson.token
					}));
				}

				return Promise.all(channelItemPromises);
			})
			.then(function (results) {
				channelItems = results && results.length > 0 ? results[0] : [];

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					for (var j = 0; j < page.contentitems.length; j++) {
						var exist = false;
						var name;
						for (var k = 0; k < pageItems.length; k++) {
							if (page.contentitems[j].id === pageItems[k].id) {
								name = pageItems[k].name;
								exist = true;
								break;
							}
						}

						var existInChannel = false;
						for (var k = 0; k < channelItems.length; k++) {
							if (page.contentitems[j].id === channelItems[k].id) {
								if (!name) {
									name = channelItems[k].name;
								}
								existInChannel = true;
								break;
							}
						}
						page.contentitems[j]['name'] = name;
						page.contentitems[j]['exist'] = exist;
						page.contentitems[j]['existInChannel'] = existInChannel;

						if (!exist) {
							var msg = 'Page ' + page.name + ': item ' + page.contentitems[j].id + ' does not exist';
							issues.push(msg);
						} else if (!existInChannel) {
							var msg = 'Page ' + page.name + ': item ' + page.contentitems[j].id + '(' + name + ') is not in site channel';
							issues.push(msg);
						}
					}
				}

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (!page.isDetailPage) {
						pagesOutput.push({
							id: page.id,
							name: page.name,
							pageUrl: page.pageUrl,
							version: page.version,
							contentlist: page.contentlist,
							contentitems: page.contentitems,
							components: page.components
						});
					}
				}
				// console.log(pagesOutput);

				_display();

				if (output) {
					// save to file
					var data = {
						site: sitejson,
						siteLocalizationPolicy: sitepolicyjson,
						template: templatejson,
						theme: themejson,
						repository: repositoryjson,
						channel: channeljson,
						channelLocalizationPolicy: channelpolicyjson,
						contentTypes: pageContentTypes,
						components: pageComponents,
						sitePages: pagesOutput,
						issues: issues
					};
					fs.writeFileSync(output, JSON.stringify(data, null, 4));
					console.log(' - report saved to ' + output);
				}

				done();
			})
			.catch((error) => {
				done();
			});

	}); // login
};

var _getSitePages = function (server, serverName, siteId) {
	return new Promise(function (resolve, reject) {
		var pages = [];
		var structurePages = [];
		var pagesFolderId;
		var structureFileId;
		console.log(' - query site pages');
		serverRest.getChildItems({
				registeredServerName: serverName,
				currPath: projectDir,
				parentID: siteId
			}).then(function (result) {
				var items = result && result.items || [];
				for (var i = 0; i < items.length; i++) {
					if (items[i].name === 'pages' && items[i].type === 'folder') {
						pagesFolderId = items[i].id;
					} else if (items[i].name === 'structure.json' && items[i].type === 'file') {
						structureFileId = items[i].id;
					}
					if (pagesFolderId && structureFileId) {
						break;
					}
				}
				if (!pagesFolderId || !structureFileId) {
					return Promise.reject();
				}

				return serverRest.readFile({
					registeredServerName: serverName,
					currPath: projectDir,
					fFileGUID: structureFileId
				});
			})
			.then(function (fileContent) {
				var structureFileContent = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
				structurePages = structureFileContent && structureFileContent.pages || [];
				// console.log(structurePages);

				return serverRest.getChildItems({
					registeredServerName: serverName,
					currPath: projectDir,
					parentID: pagesFolderId,
					limit: 9999
				});
			})
			.then(function (result) {
				var items = result && result.items || [];
				console.log(' - site total pages: ' + items.length);
				for (var i = 0; i < items.length; i++) {
					pages.push({
						id: items[i].id,
						name: items[i].name,
						version: items[i].version,
						fileContent: {}
					});
				}

				return _getPageFiles(server, pages)
			})
			.then(function (result) {
				pages = result;
				// console.log(pages);
				resolve({
					pages: pages,
					structurePages: structurePages
				});
			})
			.catch((error) => {
				resolve({
					pages: pages,
					structure: structureFileContent
				});
			});
	});
};

var _getPageFiles = function (server, pages) {
	return new Promise(function (resolve, reject) {
		var total = pages.length;
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

		var count = [];
		var doGetFile = groups.reduce(function (filePromise, param) {
				return filePromise.then(function (result) {
					var filePromises = [];
					for (var i = param.start; i <= param.end; i++) {
						filePromises.push(_readFile(server, pages[i].id, pages[i].name));
					}
					count.push('.');
					process.stdout.write(' - getting page files ' + count.join(''));
					readline.cursorTo(process.stdout, 0);
					return Promise.all(filePromises).then(function (results) {
						for (var i = 0; i < results.length; i++) {
							for (var j = 0; j < pages.length; j++) {
								if (results[i].file === pages[j].name) {
									pages[j].fileContent = results[i].data;
									break;
								}
							}
						}
					});
				});

			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doGetFile.then(function (result) {
			process.stdout.write(os.EOL);
			resolve(pages);
		});

	});
};

var _readFile = function (server, id, fileName) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/files/' + id + '/data/';

		client.get(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve({
					file: fileName,
					data: data
				});
			} else {
				// continue 
				resolve();
			}
		});
	});
};

var _getPageItems = function (server, itemIds) {
	return new Promise(function (resolve, reject) {
		var items = [];
		if (itemIds.length === 0) {
			resolve(items);
		} else {
			var total = itemIds.length;
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
			console.log(' - total items: ' + total);
			var count = [];
			var doGetItem = groups.reduce(function (itemPromise, param) {
					return itemPromise.then(function (result) {
						var itemPromises = [];
						for (var i = param.start; i <= param.end; i++) {
							itemPromises.push(serverRest.getItem({
								server: server,
								id: itemIds[i]
							}));
						}
						count.push('.');
						process.stdout.write(' - querying items ' + count.join(''));
						readline.cursorTo(process.stdout, 0);
						return Promise.all(itemPromises).then(function (results) {
							for (var i = 0; i < results.length; i++) {
								items.push(results[i]);
							}
						});
					});

				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doGetItem.then(function (result) {
				process.stdout.write(os.EOL);
				resolve(items);
			});
		}
	});
};