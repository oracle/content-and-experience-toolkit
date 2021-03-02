/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fs = require('fs'),
	he = require('he'),
	htmllint = require('htmllint'),
	path = require('path'),
	os = require('os'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf;

var projectDir,
	componentsSrcDir,
	templatesSrcDir,
	themesSrcDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	serversSrcDir = path.join(srcfolder, 'servers');
	componentsSrcDir = path.join(srcfolder, 'components');
	templatesSrcDir = path.join(srcfolder, 'templates');
	themesSrcDir = path.join(srcfolder, 'themes');


	return true;
};


module.exports.createAssetReport = function (argv, done) {
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

	var output = argv.output;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output;
		if (serverUtils.endsWith(outputFolder, '.json')) {
			outputFolder = outputFolder.substring(0, outputFolder.lastIndexOf(path.sep));
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

var _displayObject = function (format, obj) {
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

var _createAssetReport = function (server, serverName, siteName, output, done) {

	var request = serverUtils.getRequest();

	var site, siteInfo;
	var isEnterprise;
	var templateName, template;
	var themeName, theme;
	var repositoryId, repository;
	var channelId, channel;

	var itemIds = [];
	var pageItems;
	var fileIds = [];

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
	var usedContentFiles = [];
	var usedContentFiles4Sure = [];
	var contentNotUsed = [];
	var contentHidden = [];
	var siteContent = [];
	var issues = [];

	var format = '  %-32s  %s';

	var _display = function () {
		console.log('');
		console.log('Site');
		_displayObject(format, sitejson);
		console.log('');

		console.log('Site Localization Policy');
		_displayObject(format, sitepolicyjson);
		console.log('');

		console.log('Template');
		_displayObject(format, templatejson);
		console.log('');

		console.log('Theme');
		_displayObject(format, themejson);
		console.log('');

		console.log('Repository');
		_displayObject(format, repositoryjson);
		console.log('');

		console.log('Channel');
		_displayObject(format, channeljson);
		console.log('');

		console.log('Channel Localization Policy');
		_displayObject(format, channelpolicyjson);
		console.log('');

		console.log('Content Type Permissions');
		pageContentTypes.forEach(function (pageContentType) {
			console.log(sprintf(format, pageContentType.name, _getMemberStr(pageContentType.members)));
		});
		console.log('');

		console.log('Component Permissions');
		pageComponents.forEach(function (pageComponent) {
			console.log(sprintf(format, pageComponent.name, _getMemberStr(pageComponent.members)));
		});
		console.log('');
		var i;

		// site pages
		for (i = 0; i < pagesOutput.length; i++) {
			var page = pagesOutput[i];
			var j;
			var msg;
			console.log('Page ' + page.id);
			console.log(sprintf(format, 'name', page.name));
			console.log(sprintf(format, 'version', page.version));
			if (page.contentlist && page.contentlist.length > 0) {
				var types = [];
				for (j = 0; j < page.contentlist.length; j++) {
					types.push(page.contentlist[j].contentType);
				}
				console.log(sprintf(format, 'contentlist', types.join(', ')));
			}
			if (page.contentitems && page.contentitems.length > 0) {
				for (j = 0; j < page.contentitems.length; j++) {
					var item = page.contentitems[j];
					msg = 'id:' + item.id + ' name:' + item.name + ' type:' + item.contentType;
					if (!item.exist) {
						msg = msg + ' ERROR: not exist';
					} else if (!item.existInChannel) {
						msg = msg + ' ERROR: not in channel';
					}
					console.log(sprintf(format, (j === 0 ? 'items' : ' '), msg));
				}
			}
			if (page.components && page.components.length > 0) {
				console.log(sprintf(format, 'components', page.components.join(', ')));
			}
			if (page.links && page.links.length > 0) {
				for (j = 0; j < page.links.length; j++) {
					var link = page.links[j];
					msg = 'URL: ' + link.url + '  status: ' + link.status;
					console.log(sprintf(format, (j === 0 ? 'links' : ' '), msg));
				}
			}
		}
		console.log('');

		// site content
		console.log('Site content');
		var contentFormat = '  %-60s  %s';
		if (siteContent.length > 0) {
			console.log(sprintf(contentFormat, 'Name', 'Size'));
			for (i = 0; i < siteContent.length; i++) {
				console.log(sprintf(contentFormat, siteContent[i].name, siteContent[i].size));
				if (i === 50) {
					console.log('  ...');
					console.log('  total documents: ' + siteContent.length);
					break;
				}
			}
		}
		console.log('');

		if (issues.length === 0) {
			console.log('Issues: none');
		} else {
			console.log('Issues:');
			for (i = 0; i < issues.length; i++) {
				console.log(' - ' + issues[i]);
			}
		}
		console.log('');
	};

	require('events').EventEmitter.prototype._maxListeners = 100;

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		server.login = true;

		var sitePromise = sitesRest.getSite({
			server: server,
			name: siteName,
			expand: 'ownedBy,repository,channel'
		});
		sitePromise.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				site = result;
				// console.log(site);
				site.fFolderGUID = site.id;

				sitejson.id = site.id;
				sitejson.name = site.name;
				sitejson.type = site.isEnterprise ? 'Enterprise' : 'Standard';
				sitejson.slug = site.sitePrefix;
				sitejson.defaultLanguage = site.defaultLanguage;
				sitejson.siteTemplate = site.templateName;
				sitejson.theme = site.themeName;
				sitejson.owner = site.ownedBy && site.ownedBy.userName;

				templateName = site.templateName;
				themeName = site.themeName;
				repositoryId = site.repository && site.repository.id;
				channelId = site.channel && site.channel.id;

				isEnterprise = site.isEnterprise;

				console.log(' - query site');

				return serverRest.getFolderUsers({
					server: server,
					id: site.fFolderGUID
				});
			})
			.then(function (result) {
				sitejson.members = result && result.data || [];
				console.log(' - query site members');

				var templatePromise = sitesRest.getTemplate({
					server: server,
					name: templateName,
					expand: 'ownedBy'
				});

				return templatePromise;
			})
			.then(function (result) {
				if (result && !result.err) {
					template = result;
					template.fFolderGUID = template.id;
					templatejson.id = template.id;
					templatejson.name = template.name;
					templatejson.owner = template.ownedBy && template.ownedBy.userName;
				}

				var tempUserPromises = [];
				if (template) {
					tempUserPromises.push(
						serverRest.getFolderUsers({
							server: server,
							id: template.fFolderGUID
						}));
				} else {
					issues.push('User "' + server.username + '" has no access to template ' + templateName);
				}
				return Promise.all(tempUserPromises);
			})
			.then(function (results) {
				if (templatejson.id) {
					console.log(' - query site template members');
					templatejson.members = results.length > 0 ? results[0].data : [];
				}

				var params = 'doBrowseStarterThemes=1';

				var themePromise = sitesRest.getTheme({
					server: server,
					name: themeName,
					expand: 'ownedBy'
				});

				return themePromise;

			})
			.then(function (result) {
				if (result && !result.err) {
					theme = result;
					theme.fFolderGUID = theme.id;
					themejson.id = theme.id;
					themejson.name = theme.name;
					themejson.owner = theme.ownedBy && theme.ownedBy.userName;
				}

				var themeUserPromises = theme && theme.fFolderGUID ? [serverRest.getFolderUsers({
					server: server,
					id: theme.fFolderGUID
				})] : [];

				return Promise.all(themeUserPromises);
			})
			.then(function (results) {
				if (theme && theme.fFolderGUID) {
					console.log(' - query theme member');
					themejson.members = results.length > 0 ? results[0].data : [];
				}

				var repoPromises = [];
				if (repositoryId) {
					repoPromises.push(serverRest.getRepository({
						server: server,
						id: repositoryId
					}));
				}

				return Promise.all(repoPromises);
			})
			.then(function (results) {
				console.log(' - query repository');
				repository = results.length > 0 && results[0].id ? results[0] : undefined;

				if (repository) {
					repositoryjson.id = repository.id;
					repositoryjson.name = repository.name;

					var contentTypes = [];
					for (var i = 0; i < repository.contentTypes.length; i++) {
						contentTypes.push(repository.contentTypes[i].name);
					}
					repositoryjson.contentTypes = contentTypes;
				}

				var repoPermissionPromises = [];
				if (repositoryId) {
					repoPermissionPromises.push(serverRest.getResourcePermissions({
						server: server,
						id: repositoryId,
						type: 'repository'
					}));
				}

				return Promise.all(repoPermissionPromises);
			})
			.then(function (results) {
				console.log(' - query repository members');
				if (repository && results.length > 0) {
					repositoryjson.members = results[0].permissions || [];
				}

				var channelPromises = [];
				if (channelId) {
					channelPromises.push(serverRest.getChannel({
						server: server,
						id: channelId
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

					channeljson.id = channel.id;
					channeljson.name = channel.name;
					channeljson.token = channelToken;
					channeljson.type = channel.channelType;
					channeljson.publishPolicy = channel.publishPolicy === 'anythingPublished' ? 'Anything can be published' :
						'Only approved items can be published';

					policyPromises.push(serverRest.getLocalizationPolicy({
						server: server,
						id: channel.localizationPolicy
					}));
				}

				return Promise.all(policyPromises);
			})
			.then(function (results) {
				console.log(' - query channel localization policy');
				var result = results.length > 0 ? results[0] : undefined;
				if (result && result.id) {
					channelpolicyjson.id = result.id;
					channelpolicyjson.name = result.name;
					channelpolicyjson.defaultLanguage = result.defaultValue;
					channelpolicyjson.requiredLanguages = result.requiredValues;
					channelpolicyjson.optionalLanguages = result.optionalValues;
				}

				return _getSitePages(server, sitejson.id);
			})
			.then(function (result) {
				structurePages = result.structurePages || [];
				pages = result.pages || [];
				// console.log(structurePages.length + ' ' + pages.length);
				// console.log(structurePages);
				// console.log(pages);

				var htmllintPromises = [];

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					var fileName = page.id + '.json';
					// console.log('page: id=' + page.id + ' name=' + page.name);
					var foundPage = false;
					for (var j = 0; j < pages.length; j++) {
						if (fileName === pages[j].name) {
							foundPage = true;
							page.version = pages[j].version;

							var triggerActions = [];
							var links = [];

							htmllintPromises.push(_runHTMLlint(page.id, page.name, 'page', fileName, pages[j].fileContent));

							// fs.writeFileSync(path.join(projectDir, 'dist', page.id + '.json'), JSON.stringify(pages[j].fileContent));
							var slots = pages[j].fileContent && pages[j].fileContent.slots;
							var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances;
							// console.log('Page: ' + fileName);
							// console.log(componentInstances);
							var pageResult = _examPageSource(slots, componentInstances, links, triggerActions, fileIds, itemIds, typeNames, compNames);

							page.contentlist = pageResult.contentlist;
							page.contentitems = pageResult.contentitems;
							page.components = pageResult.components;
							page.orphanComponents = pageResult.orphanComponents;
							page.orphanComponentDetails = pageResult.orphanComponentDetails;

							// page.orphanComponents = pageResult.orphanComponents;

							var pageLinks = _processLinks(server, links);

							for (var k = 0; k < pageLinks.length; k++) {
								var value = pageLinks[k].url;
								if (value && !value.startsWith('http')) {

									if (value.indexOf('SCS_PAGE') > 0) {
										value = _getMatchString(/\[!--\$\s*SCS_PAGE\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_PAGE\s*--\]/g, value);
										if (value) {
											var found = false;
											for (var m = 0; m < structurePages.length; m++) {
												if (parseInt(value) === structurePages[m].id) {
													found = true;
													break;
												}
											}
											pageLinks[k].status = found ? 'OK' : 'PAGE NOT FOUND';
										}
									} else if (value.indexOf('SCS_DIGITAL_ASSET') > 0) {
										value = _getMatchString(/\[!--\$\s*SCS_DIGITAL_ASSET\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET\s*--\]/g, value);
										if (value) {
											if (value.indexOf(',') > 0) {
												value = value.substring(0, value.indexOf(','));
											}
											itemIds.push(value);
										}
									} else if (value.startsWith('[!--$SCS_CONTENT_URL--]/')) {
										var file = value.substring(value.indexOf('/') + 1);

										if (!usedContentFiles.includes(file)) {
											usedContentFiles.push(file);
										}
									}

									// console.log(' - ' + pageLinks[k].url + ' : ' + value);
								}
							}

							page.links = pageLinks;
							page.triggerActions = triggerActions;

							// process page source to remove undisplayable document link
							// format is required to make match work
							var src = JSON.stringify(pages[j].fileContent, null, 4);
							var newSrc = _removeUndisplayableLink(src);
							try {
								pages[j].fileContent = JSON.parse(newSrc);
								// fs.writeFileSync(path.join(tempSrcDir, 'pages', page.id + '.json'), newSrc);
								// console.log(' - save file ' + page.id + '.json');
							} catch (e) {
								console.log(e);
							}

							var links2 = [];
							var triggerActions2 = [];
							var fileIds2 = [];
							var itemIds2 = [];
							var typeNames2 = [];
							var compNames2 = [];
							var componentInstances2 = pages[j].fileContent && pages[j].fileContent.componentInstances;
							var pageResult2 = _examPageSource(undefined, componentInstances2, links2, triggerActions2, fileIds2, itemIds2, typeNames2, compNames2);
							var pageLinks2 = _processLinks(undefined, links2);
							for (var k = 0; k < pageLinks2.length; k++) {
								var value = pageLinks2[k].url;
								if (value.startsWith('[!--$SCS_CONTENT_URL--]/')) {
									var file = value.substring(value.indexOf('/') + 1);

									if (!usedContentFiles4Sure.includes(file)) {
										usedContentFiles4Sure.push(file);
									}
								}
							}

						}
					}

					if (!foundPage) {
						issues.push('Page ' + page.name + ' does not have page JSON file ' + page.id + '.json');
					}

				}

				// check if there are any unused pages
				pages.forEach(function (page) {
					var pageName = page.name;
					var pageIdStr = pageName.substring(0, pageName.indexOf('.'));
					if (pageIdStr.indexOf('_') > 0) {
						pageIdStr = pageIdStr.substring(pageIdStr.indexOf('_') + 1);
					}
					var pageId = parseInt(pageIdStr);
					var found = false;
					for (var i = 0; i < structurePages.length; i++) {
						if (structurePages[i].id === pageId) {
							found = true;
							break;
						}
					}
					if (!found) {
						issues.push('Page ' + pageName + ' is not used (not in structure.json)');
					}
				});

				return Promise.all(htmllintPromises);
			})
			.then(function (results) {
				// HTMLlint to check self close tags for page source
				for (var i = 0; i < results.length; i++) {
					if (results[i].id) {
						for (var j = 0; j < structurePages.length; j++) {
							if (structurePages[j].id === results[i].id) {
								structurePages[j].tagCloseIssues = results[i].tagCloseIssues || [];
							}
						}
					}
				}

				return _getSiteContent(server, sitejson.id);

			})
			.then(function (result) {

				if (result && !result.err) {
					siteContent = result.siteContent;
				}

				if (compNames.length > 0) {
					console.log(' - query components ...');
				}
				return _getComponents(server, compNames);

			})
			.then(function (results) {

				allComponents = results;
				if (allComponents.length > 0 && compNames.length > 0) {
					for (var j = 0; j < compNames.length; j++) {
						var comp = undefined;
						for (var k = 0; k < allComponents.length; k++) {

							if (compNames[j].toLowerCase() === allComponents[k].name.toLowerCase()) {
								comp = allComponents[k];
								var id = allComponents[k].id;
								if (!compIds.includes(id)) {
									compIds.push(id);
								}
								break;
							}
						}
						pageComponents.push({
							name: compNames[j],
							id: comp ? comp.id : '',
							owner: comp ? comp.fCreatorFullName : '',
							members: []
						});
						if (!comp) {
							issues.push('Component \'' + compNames[j] + '\' does not exist or user ' + server.username + ' has no access');
						}
					}
				}

				// get the files under assets for all components
				return _getComponentsFiles(server, pageComponents);

			})
			.then(function (result) {

				pageComponents = result;

				var compHtmllintPromises = [];
				pageComponents.forEach(function (comp) {
					var compFiles = comp.files || [];
					for (var i = 0; i < compFiles.length; i++) {
						compHtmllintPromises.push(_runHTMLlint(comp.id, comp.name, 'component', compFiles[i].name, compFiles[i].content));
					}
				});

				// run HTMLlint to check close tags
				return Promise.all(compHtmllintPromises);

			})
			.then(function (results) {

				// HTMLlint to check self close tags for component files
				for (var i = 0; i < results.length; i++) {
					if (results[i] && results[i].id) {
						for (var j = 0; j < pageComponents.length; j++) {
							var comp = pageComponents[j];
							if (comp.id === results[i].id && comp.files && comp.files.length > 0) {
								for (var k = 0; k < comp.files.length; k++) {
									if (comp.files[k].name === results[i].fileName) {
										comp.files[k].tagCloseIssues = results[i].tagCloseIssues || [];
										if (results[i].err) {
											comp.files[k].err = results[i].err;
										}
									}
									// remove file content 
									comp.files[k].content = '';
								}
							}
						}
					}
				}
				// console.log(JSON.stringify(pageComponents, null, 4));

				// query component permissions
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
				// console.log(typeNames);
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

				if (results && results.length > 0) {
					for (var i = 0; i < pageContentTypes.length; i++) {
						for (var j = 0; j < results.length; j++) {
							if (pageContentTypes[i].name === results[j].resource) {
								pageContentTypes[i].members = results[j].permissions;
								break;
							}
						}
					}
				}

				return _queryItems(server, itemIds);
			})
			.then(function (result) {
				console.log(' - query items');
				pageItems = result || [];

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page.contentitems) {
						for (var j = 0; j < page.contentitems.length; j++) {
							var exist = false;
							var name;
							var contentType;
							var itemChannels = [];
							for (var k = 0; k < pageItems.length; k++) {
								if (page.contentitems[j].id === pageItems[k].id) {
									name = pageItems[k].name;
									contentType = pageItems[k].type;
									itemChannels = pageItems[k].channels && pageItems[k].channels.data;
									exist = true;
									break;
								}
							}

							var existInChannel = false;
							for (var k = 0; k < itemChannels.length; k++) {
								if (itemChannels[k].id === channel.id) {
									existInChannel = true;
								}
							}
							page.contentitems[j].name = name;
							page.contentitems[j].contentType = contentType;
							page.contentitems[j].exist = exist;
							page.contentitems[j].existInChannel = existInChannel;

							if (!exist) {
								var msg = 'Page \'' + page.name + '\'(' + page.id + ') : item ' + page.contentitems[j].id + ' does not exist';
								issues.push(msg);
							} else if (!existInChannel) {
								var msg = 'Page \'' + page.name + '\'(' + page.id + ') : item ' + page.contentitems[j].id + '(' + name + ') is not in site channel';
								issues.push(msg);
							}
						}
					}
				}

				// verify SCS_DIGITAL_ASSET
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page.links) {
						for (var j = 0; j < page.links.length; j++) {
							var link = page.links[j].url;
							if (link.indexOf('SCS_DIGITAL_ASSET') > 0) {
								var value = _getMatchString(/\[!--\$\s*SCS_DIGITAL_ASSET\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET\s*--\]/g, link);
								if (value) {
									value = value.indexOf(',') > 0 ? value.substring(0, value.indexOf(',')) : value;
									// console.log(link + ' => ' + value);
									for (var k = 0; k < pageItems.length; k++) {
										if (value === pageItems[k].id) {
											page.links[j].status = 'OK';
										}
									}
								}
							} else if (link.startsWith('[!--$SCS_CONTENT_URL--]/')) {
								var file = link.substring(link.indexOf('/') + 1);
								var found = false;
								for (var k = 0; k < siteContent.length; k++) {
									if (file === siteContent[k].name) {
										found = true;
										// console.log(' - page: ' + page.name + ' page doc: ' + file + ' found: ' + found);
										break;
									}
								}
								var status = !usedContentFiles4Sure.includes(file) ? 'HIDDEN' : (found ? 'OK' : 'Document NOT FOUND');
								page.links[j].status = status;
							}
						}
					}
				}

				var pageLinks = [];
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page.links) {
						for (var j = 0; j < page.links.length; j++) {
							if (!page.links[j].status && page.links[j].url && !pageLinks.includes(page.links[j].url)) {
								pageLinks.push(page.links[j].url);
							}
						}
					}
				}

				return _verifyHrefLinks(server, pageLinks);

			})
			.then(function (result) {
				var allLinks = result || [];
				// console.log(allLinks.length);
				// console.log(structurePages.length);
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					try {
						if (page && page.links) {
							// set the link status after ping (full url)
							for (var j = 0; j < page.links.length; j++) {
								if (page.links[j]) {

									for (var k = 0; k < allLinks.length; k++) {
										if (page.links[j].url === allLinks[k].url) {
											page.links[j].status = allLinks[k].status;
											break;
										}
									}

									if (page.links[j].status && (typeof page.links[j].status !== 'string' || page.links[j].status.toLowerCase() !== 'ok')) {
										var msg = 'Page: \'' + page.name + '\'(' + page.id + ') component: \'' + page.links[j].component.id +
											'\'(' + page.links[j].component.key + ') link: ' + page.links[j].url + ' status: ' + page.links[j].status;
										issues.push(msg);
									}
								}
							}
						}
					} catch (e) {
						console.log(e);
					}
				}

				return _queryFiles(server, fileIds);

			})
			.then(function (result) {
				var files = result || [];
				var msg;
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page) {
						// set status for trigger actions
						if (page.triggerActions) {
							for (var j = 0; j < page.triggerActions.length; j++) {
								var action = page.triggerActions[j];
								if (action.type === 'pageId' && action.value) {
									var found = false;
									for (var k = 0; k < structurePages.length; k++) {
										if (parseInt(action.value) === structurePages[k].id) {
											found = true;
											break;
										}
									}
									action.status = found ? 'OK' : 'Page NOT FOUND';
								} else if (action.type === 'fileId' && action.value) {
									var found = false;
									for (var k = 0; k < files.length; k++) {
										if (action.value === files[k].id) {
											found = true;
											break;
										}
									}
									action.status = found ? 'OK' : 'Document NOT FOUND';
								}

								if (!action.status || action.status.toLowerCase() !== 'ok') {
									msg = 'Page: \'' + page.name + '\'(' + page.id + ') component: \'' + action.component +
										'\' triggerAction: ' + action.action + ' ' + action.type + ': ' + action.value +
										' status: ' + action.status;
									issues.push(msg);
								}
							}
						}
					}
				}

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page && page.tagCloseIssues && page.tagCloseIssues.length > 0) {
						page.tagCloseIssues.forEach(function (issue) {
							msg = 'Page: \'' + page.name + '\' file: ' + page.id + '.json';
							msg = msg + ' line: ' + issue.line + ' column: ' + issue.column + ' HTML tag is not closed';
							issues.push(msg);
						});
					}
				}

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page && page.orphanComponents && page.orphanComponents.length > 0) {
						page.orphanComponents.forEach(function (orphan) {
							msg = 'Page: \'' + page.name + '\'(' + page.id + ') component: \'' + orphan.name + '\'(' + orphan.key + ') is not in any slot';
							issues.push(msg);
						});
					}
				}

				// generate issues for HTML close tags on component files
				pageComponents.forEach(function (comp) {
					if (comp.files && comp.files.length > 0) {
						for (var i = 0; i < comp.files.length; i++) {
							var compTagIssues = comp.files[i].tagCloseIssues || [];
							for (var j = 0; j < compTagIssues.length; j++) {
								var issue = compTagIssues[j];
								if (issue) {
									msg = 'Component: \'' + comp.name + '\' file: ' + comp.files[i].name;
									msg = msg + ' line: ' + issue.line + ' column: ' + issue.column + ' HTML tag is not closed';
									issues.push(msg);
								}
							}
						}
					}
				});

				siteContent.forEach(function (item) {
					if (!usedContentFiles.includes(item.name) && !usedContentFiles4Sure.includes(item.name)) {
						contentNotUsed.push(item.name);
						issues.push('Site content \'' + item.name + '\' is not used');
					}
				});
				siteContent.forEach(function (item) {
					if (usedContentFiles.includes(item.name) && !usedContentFiles4Sure.includes(item.name)) {
						contentHidden.push(item.name);
						issues.push('Site content \'' + item.name + '\' is hidden');
					}
				});

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page) {
						pagesOutput.push({
							id: page.id,
							name: page.name,
							pageUrl: page.pageUrl,
							version: page.version,
							contentlist: page.contentlist,
							contentitems: page.contentitems,
							components: page.components,
							orphanComponents: page.orphanComponentDetails,
							links: page.links,
							triggerActions: page.triggerActions
						});
					}
				}

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
						siteContent: siteContent,
						issues: issues
					};
					fs.writeFileSync(output, JSON.stringify(data, null, 4));
					console.log(' - report saved to ' + output);
				}

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done();
			});

	}); // login
};

var _getComponentInstance = function (componentInstances, guid) {
	var comp;
	if (componentInstances) {
		Object.keys(componentInstances).forEach(function (key) {
			if (key === guid) {
				comp = componentInstances[key];
			}
		});
	}
	return comp;
};

var _getChildComponents = function (componentInstances, comp, children) {
	if (comp) {
		if (comp.data && comp.data.components && comp.data.components.length > 0) {
			comp.data.components.forEach(function (childCompGUID) {
				children.push(childCompGUID);
				_getChildComponents(componentInstances, _getComponentInstance(componentInstances, childCompGUID), children);
			});
		}
		if (comp.data && comp.data.sectionLayoutInstanceId) {
			children.push(comp.data.sectionLayoutInstanceId);
			_getChildComponents(componentInstances, _getComponentInstance(componentInstances, comp.data.sectionLayoutInstanceId), children);
		}
	}
};

var _ootbComps = ['scs-sl-horizontal', 'scs-sl-slider', 'scs-sl-tabs', 'scs-sl-three-columns', 'scs-sl-two-columns', 'scs-sl-vertical', 'scs-contentplaceholder'];

var _examPageSource = function (slots, componentInstances, links, triggerActions, fileIds, itemIds, typeNames, compNames) {
	var contentlist = [];
	var contentitems = [];
	var components = [];
	var orphanComponents = [];
	var orphanComponentDetails = [];
	var slotComponentIds = [];
	var checkOrphan = false;
	if (slots) {
		Object.keys(slots).forEach(function (key) {
			var slot = slots[key];
			if (slot.components && slot.components.length > 0) {
				slotComponentIds = slotComponentIds.concat(slot.components);
			}
		});
		checkOrphan = true;
	}

	if (componentInstances) {

		Object.keys(componentInstances).forEach(function (key) {
			var comp = componentInstances[key];

			// console.log(comp);
			// collect links
			var compLinks = _getHrefLinks(JSON.stringify(comp));
			var aTags = _getATagHrefs(JSON.stringify(comp));
			for (var k = 0; k < aTags.length; k++) {
				if (!compLinks.includes(aTags[k])) {
					compLinks.push(aTags[k]);
				}
			}
			var urlLinks = _getUrlLinks(JSON.stringify(comp));
			for (var k = 0; k < urlLinks.length; k++) {
				if (!compLinks.includes(urlLinks[k])) {
					compLinks.push(urlLinks[k]);
				}
			}

			if (comp.data.href && !compLinks.includes(comp.data.href)) {
				compLinks.push(comp.data.href);
			}
			if (comp.data.imageUrl && !compLinks.includes(comp.data.imageUrl)) {
				compLinks.push(comp.data.imageUrl);
			}
			if (comp.data.imageHref && !compLinks.includes(comp.data.imageHref)) {
				compLinks.push(comp.data.imageHref);
			}
			if (comp.id === 'scs-gallery' && comp.data.images) {
				for (var k = 0; k < comp.data.images.length; k++) {
					if (comp.data.images[k].source && !compLinks.includes(comp.data.images[k].source)) {
						compLinks.push(comp.data.images[k].source);
					}
				}
			}

			// trigger actions
			if (comp.data.actions && comp.data.actions.length > 0) {
				for (var k = 0; k < comp.data.actions.length; k++) {
					var action = comp.data.actions[k];
					if (action.actionName === 'scsActionDownloadFile' || action.actionName === 'scsActionPreviewFile') {
						for (var m = 0; m < action.actionPayload.length; m++) {
							if (action.actionPayload[m].name === 'file' && action.actionPayload[m].value) {
								var value = action.actionPayload[m].value;
								// console.log(' - scsActionDownloadFile: ' + value);
								if (value.indexOf('/') < 0) {
									// file id 
									if (!fileIds.includes(value)) {
										fileIds.push(value);
									}
									triggerActions.push({
										action: action.actionName,
										type: 'fileId',
										value: value,
										component: comp.id
									});
								} else {
									if (!compLinks.includes(value)) {
										compLinks.push(value);
									}
								}
							}
						}
					} else if (action.actionName === 'scsActionNavigateToPage') {
						for (var m = 0; m < action.actionPayload.length; m++) {
							if (action.actionPayload[m].name === 'pageId' && action.actionPayload[m].value) {
								var value = action.actionPayload[m].value;
								// console.log(' - scsActionNavigateToPage: ' + value);
								triggerActions.push({
									action: action.actionName,
									type: 'pageId',
									value: value,
									component: comp.id
								});
							}
						}
					}
				}
			}

			for (var k = 0; k < compLinks.length; k++) {
				links.push({
					url: compLinks[k],
					component: {
						id: comp.id,
						key: key
					}
				});
			}

			// collect content items, content lists and components
			if (comp.id === 'scs-contentitem' || (comp.id === 'scsCaaSLayout' && comp.type === 'scs-component')) {
				if (comp.data.contentId) {
					itemIds.push(comp.data.contentId);
					contentitems.push({
						id: comp.data.contentId,
						contentType: comp.data.contentTypes && comp.data.contentTypes.length > 0 ? comp.data.contentTypes[0] : ''
					});
				}
				if (comp.data.contentTypes && comp.data.contentTypes.length > 0 && comp.data.contentTypes[0]) {
					if (!typeNames.includes(comp.data.contentTypes[0])) {
						typeNames.push(comp.data.contentTypes[0]);
					}
				}
			} else if (comp.id === 'scs-image' || comp.id === 'scs-gallery' || comp.id === 'scs-video') {
				if (comp.data.contentIds) {
					for (var k = 0; k < comp.data.contentIds.length; k++) {
						itemIds.push(comp.data.contentIds[k]);
						contentitems.push({
							id: comp.data.contentIds[k],
							contentType: 'DigitalAsset'
						});
					}
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
			} else if (!_ootbComps.includes(comp.id) && (comp.type === 'scs-component' || comp.type === 'scs-app')) {
				// custom component
				var name = comp.type === 'scs-component' ? (comp.data.componentName || comp.data.componentId || comp.id) : comp.data.appName;
				if (name && name !== comp.type) {
					if (!components.includes(name)) {
						components.push(name);
					}
					if (!compNames.includes(name)) {
						compNames.push(name);
					}
				}
			}

		});


		if (checkOrphan) {
			Object.keys(componentInstances).forEach(function (key) {
				var comp = componentInstances[key];
				var children = [];
				var childGrid = '';
				_getChildComponents(componentInstances, comp, children);
				// console.log('comp: ' + key + ' children: ' + children);
				if (slotComponentIds.includes(key)) {
					for (var i = 0; i < children.length; i++) {
						slotComponentIds.push(children[i]);
					}
				}
			});

			Object.keys(componentInstances).forEach(function (key) {
				var comp = componentInstances[key];
				if (comp.type !== 'scs-inline-text' && comp.type !== 'scs-inline-image') {
					if (!slotComponentIds.includes(key)) {
						var foundInGrid = false;
						for (var i = 0; i < slotComponentIds.length; i++) {
							var slotComp = _getComponentInstance(componentInstances, slotComponentIds[i]);
							var grid = slotComp && slotComp.data && slotComp.data.grid;
							if (grid && grid.indexOf(key) >= 0) {
								foundInGrid = true;
								break;
							}
						}

						if (!foundInGrid) {
							// console.log('Component ' + key + ' ' + comp.type + ' ' + comp.id + ' is NOT in a slot');
							var name = comp.type === 'scs-component' ? comp.data.componentId || comp.data.componentName : comp.data.appName;
							orphanComponents.push({
								name: name || comp.id,
								key: key
							});
							orphanComponentDetails.push({
								key: key,
								type: comp.type,
								name: name || comp.id
							});
						}
					}
				}
			});
		}
	}

	return {
		contentlist: contentlist,
		contentitems: contentitems,
		components: components,
		orphanComponents: orphanComponents,
		orphanComponentDetails: orphanComponentDetails
	};
};

var _getSitePages = function (server, siteId) {
	return new Promise(function (resolve, reject) {
		var pages = [];
		var structurePages = [];
		var pagesFolderId;
		var structureFileId;
		console.log(' - query site pages');
		serverRest.getChildItems({
				server: server,
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
					server: server,
					fFileGUID: structureFileId
				});
			})
			.then(function (fileContent) {
				var structureFileContent = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
				structurePages = structureFileContent && structureFileContent.pages || [];

				return serverRest.getChildItems({
					server: server,
					parentID: pagesFolderId,
					limit: 9999
				});
			})
			.then(function (result) {
				var items = result && result.items || [];
				console.log(' - site total pages: ' + items.length);
				for (var i = 0; i < items.length; i++) {
					// console.log('page ' + i + ' : ' + items[i].id + ' ' + items[i].name);
					pages.push({
						id: items[i].id,
						name: items[i].name,
						version: items[i].version,
						fileContent: {}
					});
				}

				return _getPageFiles(server, pages);
			})
			.then(function (result) {
				pages = result;
				resolve({
					id: siteId,
					pages: pages,
					structurePages: structurePages
				});
			})
			.catch((error) => {
				resolve({
					id: siteId,
					pages: pages,
					structure: structurePages
				});
			});
	});
};

var _startNewLine = false;
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

		var doGetFile = groups.reduce(function (filePromise, param) {
				return filePromise.then(function (result) {
					var filePromises = [];
					for (var i = param.start; i <= param.end; i++) {
						filePromises.push(_readFile(server, pages[i].id, pages[i].name));
					}

					process.stdout.write(' - getting page files [' + param.start + ', ' + param.end + '] ...');
					readline.cursorTo(process.stdout, 0);
					return Promise.all(filePromises).then(function (results) {
						if (results) {
							for (var i = 0; i < results.length; i++) {
								for (var j = 0; j < pages.length; j++) {
									if (results[i] && results[i].file === pages[j].name) {
										pages[j].fileContent = results[i].data;
										break;
									}
								}
							}
						}
					});
				});

			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doGetFile.then(function (result) {
			if (!_startNewLine) {
				process.stdout.write(os.EOL);
				_startNewLine = true;
			}
			resolve(pages);
		});

	});
};

var _readFile = function (server, id, fileName) {
	return new Promise(function (resolve, reject) {
		var auth = serverUtils.getRequestAuth(server);
		var url = server.url + '/documents/api/1.2/files/' + id + '/data/';
		var options = {
			method: 'GET',
			url: url,
			auth: auth
		};

		var request = serverUtils.getRequest();
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to download file ' + fileName);
				console.log(error);
				resolve();
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				// console.log(' - get file ' + fileName);
				// console.log(data);
				resolve({
					file: fileName,
					data: data
				});
			} else {
				console.log('ERROR: failed to download file: ' + fileName + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve();
			}

		});
	});
};

var _getComponents = function (server, compNames) {
	var comps = [];
	return new Promise(function (resolve, reject) {
		var total = compNames.length;
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

		var doGetComps = groups.reduce(function (compPromise, param) {
				return compPromise.then(function (result) {
					var compPromises = [];
					for (var i = param.start; i <= param.end; i++) {
						compPromises.push(sitesRest.getComponent({
							server: server,
							name: compNames[i],
							expand: 'ownedBy'
						}));
					}

					// process.stdout.write(' - getting component [' + param.start + ', ' + param.end + '] ...');
					// readline.cursorTo(process.stdout, 0);
					return Promise.all(compPromises).then(function (results) {
						if (results) {
							for (var i = 0; i < results.length; i++) {
								if (results[i].id) {
									comps.push(results[i]);
								}
							}
						}
					});
				});

			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doGetComps.then(function (result) {
			resolve(comps);
		});

	});
};

var _getComponentsFiles = function (server, comps) {
	return new Promise(function (resolve, reject) {
		var total = comps.length;
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
		var doGetCompFiles = groups.reduce(function (compFilePromise, param) {
				return compFilePromise.then(function (result) {
					var compFilePromises = [];
					for (var i = param.start; i <= param.end; i++) {
						if (comps[i].id) {
							compFilePromises.push(_getComponentFiles(server, comps[i].id, comps[i].name));
						}
					}
					count.push('.');
					process.stdout.write(' - getting component files ' + count.join(''));
					readline.cursorTo(process.stdout, 0);
					return Promise.all(compFilePromises).then(function (results) {
						if (results) {
							for (var i = 0; i < results.length; i++) {
								for (var j = 0; j < comps.length; j++) {
									if (results[i] && results[i].compId === comps[j].id) {
										comps[j].files = results[i].files;
										break;
									}
								}
							}
						}
					});
				});

			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doGetCompFiles.then(function (result) {
			if (!_startNewLine) {
				process.stdout.write(os.EOL);
				_startNewLine = true;
			}
			resolve(comps);
		});

	});
};

/**
 * get component's js files
 */
_getComponentFiles = function (server, compId, compName) {
	return new Promise(function (resolve, reject) {
		var files = [];
		serverRest.findFile({
				server: server,
				parentID: compId,
				filename: 'assets',
				itemtype: 'folder'
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var assetsFolderId = result.id;
				// console.log(' - comp ' + compName + ' assets folder ' + assetsFolderId);

				return serverRest.getChildItems({
					server: server,
					parentID: assetsFolderId
				});
			})
			.then(function (result) {
				var items = result && result.items || [];
				// console.log(items);
				var filePromises = [];
				items.forEach(function (item) {
					if (item.type === 'file' &&
						(item.mimeType === 'text/html' || item.name === 'render.js')) {
						// console.log(' - comp ' + compName + ' file ' + item.name);
						files.push({
							id: item.id,
							name: item.name
						});
						filePromises.push(serverRest.downloadFile({
							server: server,
							fFileGUID: item.id
						}));
					}
				});

				return Promise.all(filePromises);
			})
			.then(function (results) {
				var items = results || [];
				items.forEach(function (item) {
					for (var i = 0; i < files.length; i++) {
						if (item.id === files[i].id) {
							files[i].content = item.data ? item.data.toString() : '';
						}
					}
				});

				// console.log(' - comp ' + compName);
				// console.log(files);
				return resolve({
					compId: compId,
					files: files
				});
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
};

var _queryItems = function (server, itemIds, itemLabel) {
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
			console.log(' - total ' + (itemLabel ? itemLabel : '') + ' items: ' + total);

			var doGetItem = groups.reduce(function (itemPromise, param) {
					return itemPromise.then(function (result) {
						var itemPromises = [];
						for (var i = param.start; i <= param.end; i++) {
							itemPromises.push(serverRest.getItem({
								server: server,
								id: itemIds[i],
								expand: 'all'
							}));
						}

						process.stdout.write(' - querying items [' + param.start + ', ' + param.end + '] ...');
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

var _queryFiles = function (server, fileIds) {
	return new Promise(function (resolve, reject) {
		var files = [];
		if (fileIds.length === 0) {
			resolve(files);
		} else {
			var total = fileIds.length;
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
			console.log(' - total files: ' + total);
			var count = [];
			var doGetFile = groups.reduce(function (filePromise, param) {
					return filePromise.then(function (result) {
						var filePromises = [];
						for (var i = param.start; i <= param.end; i++) {
							filePromises.push(serverRest.getFile({
								server: server,
								id: fileIds[i]
							}));
						}
						count.push('.');
						process.stdout.write(' - querying files ' + count.join(''));
						readline.cursorTo(process.stdout, 0);
						return Promise.all(filePromises).then(function (results) {
							for (var i = 0; i < results.length; i++) {
								files.push(results[i]);
							}
						});
					});

				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doGetFile.then(function (result) {
				process.stdout.write(os.EOL);
				resolve(files);
			});
		}
	});
};

var _unescapeHTML = function (str) {
	return he.decode(str);
};

var _runHTMLlint = function (id, name, type, fileName, source) {
	return new Promise(function (resolve, reject) {
		var tagCloseIssues = [];
		var src = typeof source === 'object' ? JSON.stringify(source) : source;

		htmllint(src).then(function (result) {
				var issues = result || [];

				for (var i = 0; i < issues.length; i++) {
					if (issues[i].rule === 'tag-close') {
						tagCloseIssues.push(issues[i]);
					}
				}

				// console.log(' - ' + type + ' id: ' + id + ' name: ' + name + ' file: ' + fileName + ' ' + JSON.stringify(tagCloseIssues));

				return resolve({
					id: id,
					fileName: fileName,
					tagCloseIssues: tagCloseIssues
				});
			})
			.catch((error) => {
				var msg = '';
				if (error) {
					// console.log(error);
					msg = error.toString();
				}

				console.log('ERROR: HTMLlint failed for ' + type + ' ' + name + ' file ' + fileName + ' : ' + msg);
				return resolve({
					id: id,
					fileName: fileName,
					tagCloseIssues: tagCloseIssues,
					err: 'HTMLlint failed ' + (msg ? (': ' + msg) : '')
				});
			});
	});
};

var _getHrefLinks = function (fileSource) {
	const regex = /(?:ht)tps?:\/\/[-a-zA-Z0-9.]+\.[a-zA-Z]{2,3}(?:\/(?:[^"<=]|=)*)?/g;
	var urls = [];
	var src = fileSource.replace(/\\/g, '');
	var m;
	while ((m = regex.exec(src)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		m.forEach((match, groupIndex) => {
			var link = _unescapeHTML(match);
			if (link.indexOf("'") > 0) {
				link = link.substring(0, link.indexOf("'"));
			}
			link = serverUtils.trimString(link, ' ');
			if (link && !urls.includes(link)) {
				urls.push(link);
			}
		});
	}
	return urls;
};

var _getUrlLinks = function (fileSource) {
	const regex = /url\((.*)\)/g;
	var urls = [];
	var src = fileSource.replace(/\\/g, '');
	var m;

	while ((m = regex.exec(src)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		m.forEach((match, groupIndex) => {
			// console.log(match);
			var link = _unescapeHTML(match);
			if (link.indexOf("'") > 0) {
				link = link.substring(0, link.indexOf("'"));
			}
			link = serverUtils.trimString(link, ' ');

			if (link && link.indexOf('url(') === 0) {
				link = link.substring(4);
				if (serverUtils.endsWith(link, ')')) {
					link = link.substring(0, link.length - 2);
				}
			}
			link = serverUtils.trimString(link, '"');

			if (link && !urls.includes(link)) {
				urls.push(link);
			}
		});
	}

	return urls;
};

var _getATagHrefs = function (fileSource) {
	const regex = /<a[\s]+([^>]+)>((?:.(?!\<\/a\>))*.)<\/a>/g;
	var urls = [];
	var src = fileSource.replace(/\\/g, '');
	var m;
	while ((m = regex.exec(src)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		m.forEach((match, groupIndex) => {
			var link = _unescapeHTML(match);
			if (link && link.startsWith('<a ')) {
				var href;
				if (link.indexOf('data-mfp-src=') > 0) {
					href = link.substring(link.indexOf('data-mfp-src="') + 'data-mfp-src="'.length);
					href = href.substring(0, href.indexOf('"'));
				} else {
					href = link.substring(link.indexOf('href="') + 6);
					href = href.substring(0, href.indexOf('"'));
				}
				href = serverUtils.trimString(href, ' ');
				// console.log(link + '  =>  "' + href + '"');

				if (href && !urls.includes(href)) {
					urls.push(href);
				}
			}
		});
	}
	return urls;
};

var _removeUndisplayableLink = function (fileSource) {
	const regex = /<a target=\\"_blank\\" linktype=\\"scs-link-file\\" download=\\".*" href=\\".*"><span style=\\".*"><\/span><\/a>/g;
	var m;
	// var src = fileSource.replace(/\\/g, '');
	var src = fileSource;
	var newSrc = src;
	while ((m = regex.exec(src)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		m.forEach((match, groupIndex) => {
			newSrc = newSrc.replace(match, '');
		});
	}
	return newSrc;
};

var _getMatchString = function (regex, src) {
	var m;
	var value;
	while ((m = regex.exec(src)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		m.forEach((match, groupIndex) => {
			value = match;
		});
	}
	// console.log(' - regex: ' + regex + ' src: ' + src + ' value: ' + value);
	return value;
};

var _verifyHrefLink = function (server, request, httpsProxy, httpProxy, url) {
	return new Promise(function (resolve, reject) {
		if (!url.startsWith('http')) {
			return resolve({
				url: url,
				status: ''
			});
		}
		var status;
		var options = {
			url: url
		};
		var proxy = url.indexOf('https') >= 0 ? (httpsProxy || httpProxy) : (httpProxy || httpsProxy);
		if (proxy && (!server || url.indexOf(server.url) < 0)) {
			options.proxy = proxy;
		}

		request.head(options)
			.on('response', function (response) {
				status = response.statusMessage || response.statusCode;
				return resolve({
					url: url,
					status: status
				});
			})
			.on('error', function (err) {
				var errStr;
				try {
					errStr = JSON.stringify(err);
				} catch (e) {}
				status = err && (err.errno || err.code) ? (err.errno || err.code) : (errStr ? errStr : 'error');

				return resolve({
					url: url,
					status: status
				});
			});
	});
};

var _verifyHrefLinks = function (server, pageLinks) {
	var httpsProxy = process.env.HTTPS_PROXY;
	var httpProxy = process.env.HTTP_PROXY;
	return new Promise(function (resolve, reject) {
		var request = serverUtils.getRequest();
		var links = [];
		if (pageLinks.length === 0) {
			resolve(links);
		} else {
			var total = pageLinks.length;
			console.log(' - total links: ' + total);
			var timestamp = (new Date()).toISOString().substring(0, 19);
			console.log(' - ' + timestamp);
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

			var doVerifyLinks = groups.reduce(function (linkPromise, param) {
					return linkPromise.then(function (result) {
						var linkPromises = [];
						for (var i = param.start; i <= param.end; i++) {
							linkPromises.push(_verifyHrefLink(server, request, httpsProxy, httpProxy,
								pageLinks[i]));
						}

						process.stdout.write(' - verifying page links [' + param.start + ', ' + param.end + '] ...');
						readline.cursorTo(process.stdout, 0);
						return Promise.all(linkPromises).then(function (results) {
							if (results) {
								if (Array.isArray(results)) {
									for (var i = 0; i < results.length; i++) {
										if (results[i]) {
											links.push(results[i]);
										}
									}
								} else {
									links.push(results);
								}
							}
						});
					});

				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doVerifyLinks.then(function (result) {
				process.stdout.write(os.EOL);
				timestamp = (new Date()).toISOString().substring(0, 19);
				console.log(' - ' + timestamp);
				resolve(links);
			});
		}
	});
};

var _processLinks = function (server, links) {
	var processedLinks = [];
	for (var i = 0; i < links.length; i++) {
		var url = links[i].url;
		var fullUrl = url;
		if (server && server.url) {
			if (!url.startsWith('http')) {
				if (url.startsWith('/documents/')) {
					fullUrl = server.url + url;
				}
			} else {
				if (server.url.startsWith(url)) {
					// the port is not picked by the reg expression
					fullUrl = server.url;
				}
			}
		}
		processedLinks.push({
			url: fullUrl,
			component: links[i].component,
			status: ''
		});
	}
	return processedLinks;
};

var _getSiteContent = function (server, siteId) {
	return new Promise(function (resolve, reject) {
		serverRest.findFolderHierarchy({
				server: server,
				parentID: siteId,
				folderPath: 'content'
			}).then(function (result) {
				if (!result || !result.id) {
					return Promise.reject();
				}
				var contentFolderId = result.id;

				return serverRest.getChildItems({
					server: server,
					parentID: contentFolderId,
					limit: 9999
				});
			}).then(function (result) {
				var items = result && result.items || [];
				// console.log(items);
				var siteContent = [];
				items.forEach(function (item) {
					siteContent.push({
						name: item.name,
						id: item.id,
						mimeType: item.mimeType,
						size: item.size
					});
				});

				// sort by content size (large ones on the top)
				if (siteContent.length > 0) {
					var bySize = siteContent.slice(0);
					bySize.sort(function (a, b) {
						var x = parseInt(a.size);
						var y = parseInt(b.size);
						return (x < y ? 1 : x > y ? -1 : 0);
					});
					siteContent = bySize;
				}

				resolve({
					siteContent: siteContent,
				});
			})
			.catch((error) => {
				resolve({
					err: 'err'
				});
			});
	});
};


module.exports.createTemplateReport = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name,
		tempExist = false,
		templates = fs.readdirSync(templatesSrcDir);
	for (var i = 0; i < templates.length; i++) {
		if (name === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		console.error('ERROR: template ' + name + ' does not exist');
		done();
		return;
	}

	var tempSrcDir = path.join(templatesSrcDir, name);

	var output = argv.output;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output;
		if (serverUtils.endsWith(outputFolder, '.json')) {
			outputFolder = outputFolder.substring(0, outputFolder.lastIndexOf(path.sep));
		} else {
			output = path.join(output, argv.name + 'AssetUsage.json');
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

	var includePageLinks = typeof argv.includepagelinks === 'string' && argv.includepagelinks.toLowerCase() === 'true';

	var request = serverUtils.getRequest();

	var structurePages;
	var pages = [];
	var fileIds = [];
	var itemIds = [];
	var typeNames = [];
	var compNames = [];
	var pageComponents = [];
	var siteContent = [];
	var contentNotUsed = [];
	var contentHidden = [];
	var templateJson = {};
	var pagesOutput = [];
	var issues = [];
	var cleanups = {};

	var format = '  %-32s  %s';

	var _display = function () {
		console.log('');
		console.log('Template');
		_displayObject(format, templateJson);
		console.log('');
		var i, j;
		var msg;
		var format2;
		// site pages
		for (i = 0; i < pagesOutput.length; i++) {
			var page = pagesOutput[i];
			console.log('Page ' + page.id);
			console.log(sprintf(format, 'name', page.name));
			if (page.contentlist && page.contentlist.length > 0) {
				var types = [];
				for (j = 0; j < page.contentlist.length; j++) {
					types.push(page.contentlist[j].contentType);
				}
				console.log(sprintf(format, 'contentlist', types.join(', ')));
			}
			if (page.contentitems && page.contentitems.length > 0) {
				format2 = 'id:%-32s  type:%-12s  name:%-s';
				for (j = 0; j < page.contentitems.length; j++) {
					var item = page.contentitems[j];
					msg = sprintf(format2, item.id, item.contentType, item.name);
					if (!item.exist) {
						msg = msg + ' ERROR: not exist';
					}
					console.log(sprintf(format, (j === 0 ? 'items' : ' '), msg));
				}
			}
			if (page.components && page.components.length > 0) {
				console.log(sprintf(format, 'components', page.components.join(', ')));
			}
			if (page.links && page.links.length > 0) {
				for (j = 0; j < page.links.length; j++) {
					var link = page.links[j];
					msg = 'URL: ' + link.url + '  status: ' + link.status;
					console.log(sprintf(format, (j === 0 ? 'links' : ' '), msg));
				}
			}
		}
		console.log('');

		// site content
		console.log('Site content');
		var contentFormat = '  %-60s  %s';
		if (siteContent.length > 0) {
			console.log(sprintf(contentFormat, 'Name', 'Size'));
			for (i = 0; i < siteContent.length; i++) {
				console.log(sprintf(contentFormat, siteContent[i].name, siteContent[i].size));
				if (i === 50) {
					console.log('  ...');
					console.log('  total documents: ' + siteContent.length);
					break;
				}
			}
			if (contentNotUsed.length > 0) {
				console.log(' - total unused site content: ' + contentNotUsed.length);
			}
			if (contentHidden.length > 0) {
				console.log(' - total hidden site content: ' + contentHidden.length);
			}
		}
		console.log('');

		if (issues.length === 0) {
			console.log('Issues: none');
		} else {
			console.log('Issues:');
			for (i = 0; i < issues.length; i++) {
				console.log(' - ' + issues[i]);
			}
		}
		console.log('');
	};

	try {

		// The component files to check HTML close tags
		var COMPFILES = ['settings.html', 'render.js'];

		var folderStr = fs.readFileSync(path.join(tempSrcDir, '_folder.json'));
		var folderJson = JSON.parse(folderStr);
		var siteinfoStr = fs.readFileSync(path.join(tempSrcDir, 'siteinfo.json'));
		var siteinfoJson = JSON.parse(siteinfoStr);
		if (!folderJson || !folderJson.itemGUID || !siteinfoJson || !siteinfoJson.properties) {
			console.log('ERROR: invalid template');
			done();
			return;
		}

		templateJson = {
			id: folderJson.itemGUID,
			name: folderJson.siteName,
			type: folderJson.isEnterprise ? 'Enterprise' : 'standard',
			theme: siteinfoJson.properties.themeName
		};

		// 
		// get site content
		//
		var contentPath = path.join(tempSrcDir, 'content');
		var files = fs.existsSync(contentPath) ? fs.readdirSync(contentPath) : [];
		files.forEach(function (fileName) {
			var stat = fs.statSync(path.join(contentPath, fileName));
			if (stat.isFile()) {
				siteContent.push({
					name: fileName,
					size: stat.size
				});
			}
		});
		if (siteContent.length > 0) {
			var bySize = siteContent.slice(0);
			bySize.sort(function (a, b) {
				var x = parseInt(a.size);
				var y = parseInt(b.size);
				return (x < y ? 1 : x > y ? -1 : 0);
			});
			siteContent = bySize;
		}

		structurePages = JSON.parse(fs.readFileSync(path.join(tempSrcDir, 'structure.json')));
		// console.log(structurePages);

		var _pages = structurePages.pages || [];
		_pages.forEach(function (page) {
			var fileName = page.id + '.json';
			if (fs.existsSync(path.join(tempSrcDir, 'pages', fileName))) {

				pages.push({
					id: page.id,
					name: page.name,
					pageUrl: page.pageUrl,
					fileContent: JSON.parse(fs.readFileSync(path.join(tempSrcDir, 'pages', fileName)))
				});
			} else {
				issues.push('Page ' + fileName + ' does not exist');
			}

		});
		structurePages = _pages;

		var allPages = fs.readdirSync(path.join(tempSrcDir, 'pages'));
		allPages.forEach(function (pageFile) {
			var pageIdStr = pageFile.substring(0, pageFile.indexOf('.'));
			if (pageIdStr.indexOf('_') > 0) {
				pageIdStr = pageIdStr.substring(pageIdStr.indexOf('_') + 1);
			}
			var pageId = parseInt(pageIdStr);
			var found = false;
			for (var i = 0; i < structurePages.length; i++) {
				if (structurePages[i].id === pageId) {
					found = true;
					break;
				}
			}
			if (!found) {
				issues.push('Page ' + pageFile + ' is not used (not in structure.json)');
			}
		});

		var usedContentFiles = [];
		var usedContentFiles4Sure = [];
		var otherLinks = [];

		var htmllintPromises = [];
		var compHtmllintPromises = [];
		pages.forEach(function (page) {
			var triggerActions = [];
			var links = [];
			var slots = page.fileContent && page.fileContent.slots;
			var componentInstances = page.fileContent && page.fileContent.componentInstances;

			htmllintPromises.push(_runHTMLlint(page.id, page.name, 'page', page.id + '.json', page.fileContent));

			// console.log(' - page: ' + page.id + ' ' + page.name);
			var pageResult = _examPageSource(slots, componentInstances, links, triggerActions, fileIds, itemIds, typeNames, compNames);
			page.contentlist = pageResult.contentlist;
			page.contentitems = pageResult.contentitems;
			page.components = pageResult.components;
			page.orphanComponents = pageResult.orphanComponents;
			page.orphanComponentDetails = pageResult.orphanComponentDetails;

			var pageLinks = _processLinks(undefined, links);

			for (var i = 0; i < pageLinks.length; i++) {
				var value = pageLinks[i].url;
				if (value && !value.startsWith('http')) {

					if (value.indexOf('SCS_PAGE') > 0) {
						value = _getMatchString(/\[!--\$\s*SCS_PAGE\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_PAGE\s*--\]/g, value);
						if (value) {
							var found = false;
							for (var m = 0; m < structurePages.length; m++) {
								if (parseInt(value) === structurePages[m].id) {
									found = true;
									break;
								}
							}
							pageLinks[i].status = found ? 'OK' : 'PAGE NOT FOUND';
						}
					} else if (value.indexOf('SCS_DIGITAL_ASSET') > 0) {
						value = _getMatchString(/\[!--\$\s*SCS_DIGITAL_ASSET\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET\s*--\]/g, value);
						if (value) {
							if (value.indexOf(',') > 0) {
								value = value.substring(0, value.indexOf(','));
							}
							itemIds.push(value);
						}
					} else if (value.startsWith('[!--$SCS_CONTENT_URL--]/')) {
						var file = value.substring(value.indexOf('/') + 1);

						if (!usedContentFiles.includes(file)) {
							usedContentFiles.push(file);
						}
					}
					// console.log(' - ' + pageLinks[k].url + ' : ' + value);
				} else if (value && value.startsWith('http')) {
					if (!otherLinks.includes(value)) {
						otherLinks.push(value);
					}
				}
			}
			// fs.writeFileSync(path.join(projectDir, 'usedContentFiles.json'), JSON.stringify(usedContentFiles, null, 4));

			page.links = pageLinks;
			page.triggerActions = triggerActions;

			// process page source to remove undisplayable document link
			// format is required to make match work
			var src = JSON.stringify(page.fileContent, null, 4);
			var newSrc = _removeUndisplayableLink(src);
			try {
				page.fileContent = JSON.parse(newSrc);
				// fs.writeFileSync(path.join(tempSrcDir, 'pages', page.id + '.json'), newSrc);
				// console.log(' - save file ' + page.id + '.json');
			} catch (e) {
				console.log(e);
			}

			var links2 = [];
			var triggerActions2 = [];
			var fileIds2 = [];
			var itemIds2 = [];
			var typeNames2 = [];
			var compNames2 = [];
			var componentInstances2 = page.fileContent && page.fileContent.componentInstances;
			var pageResult2 = _examPageSource(undefined, componentInstances2, links2, triggerActions2, fileIds2, itemIds2, typeNames2, compNames2);
			var pageLinks2 = _processLinks(undefined, links2);
			for (var i = 0; i < pageLinks2.length; i++) {
				var value = pageLinks2[i].url;
				if (value.startsWith('[!--$SCS_CONTENT_URL--]/')) {
					var file = value.substring(value.indexOf('/') + 1);

					if (!usedContentFiles4Sure.includes(file)) {
						usedContentFiles4Sure.push(file);
					}
				}
			}
			// fs.writeFileSync(path.join(projectDir, 'usedContentFiles4Sure.json'), JSON.stringify(usedContentFiles4Sure, null, 4));

			// finally set the content link status
			for (var i = 0; i < page.links.length; i++) {
				var value = page.links[i].url;
				if (value.startsWith('[!--$SCS_CONTENT_URL--]/')) {
					var file = value.substring(value.indexOf('/') + 1);
					var found = false;
					for (var k = 0; k < siteContent.length; k++) {
						if (file === siteContent[k].name) {
							// console.log(' - page: ' + pages[i].name + ' page doc: ' + file);
							found = true;
							break;
						}
					}
					var status = !usedContentFiles4Sure.includes(file) ? 'HIDDEN' : (found ? 'OK' : 'Document NOT FOUND');
					page.links[i].status = status;
				}
			}

			// console.log(page);

		});
		// console.log('usedContentFiles: ' + usedContentFiles.length);
		// console.log('usedContentFiles4Sure: ' + usedContentFiles4Sure.length);

		// get component assets files
		compNames.forEach(function (compName) {
			var files = [];
			var compAssetsPath = path.join(componentsSrcDir, compName, 'assets');
			if (fs.existsSync(compAssetsPath)) {
				var fileNames = fs.readdirSync(compAssetsPath);
				if (fileNames && fileNames.length > 0) {
					for (var j = 0; j < fileNames.length; j++) {
						var filePath = path.join(compAssetsPath, fileNames[j]);
						if (fs.statSync(filePath).isFile() &&
							(COMPFILES.includes(fileNames[j]) || serverUtils.endsWith(fileNames[j], '.html'))) {
							var fileContent = fs.readFileSync(filePath);
							compHtmllintPromises.push(_runHTMLlint(compName, compName, 'component', fileNames[j], fileContent.toString()));
							files.push({
								name: fileNames[j]
							});
						}
					}
				}
			}
			pageComponents.push({
				name: compName,
				files: files
			});
		});
		// console.log(JSON.stringify(pageComponents, null, 4));

		siteContent.forEach(function (item) {
			if (!usedContentFiles.includes(item.name) && !usedContentFiles4Sure.includes(item.name)) {
				contentNotUsed.push(item.name);
				issues.push('Site content \'' + item.name + '\' is not used');
			}
		});
		siteContent.forEach(function (item) {
			if (usedContentFiles.includes(item.name) && !usedContentFiles4Sure.includes(item.name)) {
				contentHidden.push(item.name);
				issues.push('Site content \'' + item.name + '\' is hidden');
			}
		});
		/*
		if (otherLinks && otherLinks.length > 0) {
			var byName = otherLinks.slice(0);
			byName.sort(function (x, y) {
				return (x < y ? -1 : x > y ? 1 : 0);
			});
			otherLinks = byName;
		}
		console.log(otherLinks);
		*/

		Promise.all(htmllintPromises)
			.then(function (results) {
				// console.log(results);
				// HTMLlint to check self close tags for page source
				for (var i = 0; i < results.length; i++) {
					if (results[i].id) {
						for (var j = 0; j < pages.length; j++) {
							if (pages[j].id === results[i].id) {
								pages[j].tagCloseIssues = results[i].tagCloseIssues || [];
							}
						}
					}
				}

				return Promise.all(compHtmllintPromises);

			})
			.then(function (results) {
				// console.log(results);
				// HTMLlint to check self close tags for component files
				for (var i = 0; i < results.length; i++) {
					if (results[i].id) {
						for (var j = 0; j < pageComponents.length; j++) {
							var comp = pageComponents[j];
							if (comp.name === results[i].id && comp.files && comp.files.length > 0) {
								for (var k = 0; k < comp.files.length; k++) {
									if (comp.files[k].name === results[i].fileName) {
										comp.files[k].tagCloseIssues = results[i].tagCloseIssues || [];
									}
								}
							}
						}
					}
				}
				// console.log(JSON.stringify(pageComponents, null, 4));

				var verifyLinksPromises = includePageLinks ? [_verifyHrefLinks(undefined, otherLinks)] : [];

				return Promise.all(verifyLinksPromises);
			})
			.then(function (results) {

				if (includePageLinks) {
					var allLinks = results && results[0] || [];

					pages.forEach(function (page) {
						try {
							if (page.links) {
								// set the link status after ping (full url)
								for (var j = 0; j < page.links.length; j++) {
									if (page.links[j]) {

										for (var k = 0; k < allLinks.length; k++) {
											if (page.links[j].url === allLinks[k].url) {
												page.links[j].status = allLinks[k].status;
												break;
											}
										}

										if (page.links[j].status && (typeof page.links[j].status !== 'string' || page.links[j].status.toLowerCase() !== 'ok')) {
											var msg = 'Page: \'' + page.name + '\'(' + page.id + ') component: \'' + page.links[j].component.id +
												'\'(' + page.links[j].component.key + ') link: ' + page.links[j].url + ' status: ' + page.links[j].status;
											issues.push(msg);
										}
									}
								}
							}
						} catch (e) {
							console.log(e);
						}
					});
				}

				// generate issues for orphan components
				pages.forEach(function (page) {
					if (page.orphanComponentDetails && page.orphanComponentDetails.length > 0) {
						for (var i = 0; i < page.orphanComponentDetails.length; i++) {
							var orphan = page.orphanComponentDetails[i];
							var msg = 'Page: \'' + page.name + '\' orphan component: ' + orphan.name +
								'(key: ' + orphan.key + ' type: ' + orphan.type + ')';
							issues.push(msg);
						}
					}
				});



				// generate issues for HTML close tags on site pages
				var msg;
				pages.forEach(function (page) {
					if (page && page.tagCloseIssues && page.tagCloseIssues.length > 0) {
						page.tagCloseIssues.forEach(function (issue) {
							msg = 'Page: \'' + page.name + '\' file: ' + page.id + '.json';
							msg = msg + ' line: ' + issue.line + ' column: ' + issue.column + ' HTML tag is not closed';
							issues.push(msg);
						});
					}
				});

				// generate issues for HTML close tags on component files
				pageComponents.forEach(function (comp) {
					if (comp.files && comp.files.length > 0) {
						for (var i = 0; i < comp.files.length; i++) {
							var compTagIssues = comp.files[i].tagCloseIssues || [];
							for (var j = 0; j < compTagIssues.length; j++) {
								var issue = compTagIssues[j];
								if (issue) {
									msg = 'Component: \'' + comp.name + '\' file: ' + comp.files[i].name;
									msg = msg + ' line: ' + issue.line + ' column: ' + issue.column + ' HTML tag is not closed';
									issues.push(msg);
								}
							}
						}
					}
				});

				// validate items
				var contentFolder = path.join(templatesSrcDir, name, 'assets', 'contenttemplate',
					'Content Template of ' + name, 'ContentItems');
				if (fs.existsSync(contentFolder)) {
					pages.forEach(function (page) {
						var items = page.contentitems || [];
						for (var i = 0; i < items.length; i++) {
							var types = fs.readdirSync(contentFolder);
							var itemPath;
							for (var j = 0; j < types.length; j++) {
								itemPath = path.join(contentFolder, types[j], items[i].id + '.json');
								if (types[j] !== 'VariationSets' && fs.existsSync(itemPath)) {
									items[i].exist = true;
									items[i].contentType = types[j];
									break;
								}
							}

							if (items[i].exist) {
								var itemjson = JSON.parse(fs.readFileSync(itemPath));
								items[i].name = itemjson && itemjson.name;
								items[i].contentType = itemjson && itemjson.type;
							}
						}
					});
				}

				pages.forEach(function (page) {
					pagesOutput.push({
						id: page.id,
						name: page.name,
						pageUrl: page.pageUrl,
						version: page.version,
						contentlist: page.contentlist,
						contentitems: page.contentitems,
						components: page.components,
						orphanComponents: page.orphanComponentDetails,
						links: page.links,
						triggerActions: page.triggerActions
					});
				});

				_display();

				if (output) {
					// save to file
					var data = {
						template: templateJson,
						sitePages: pagesOutput,
						siteContent: siteContent,
						issues: issues
					};
					fs.writeFileSync(output, JSON.stringify(data, null, 4));
					console.log(' - report saved to ' + output);
				}
				cleanups.name = name;
				cleanups.type = 'template';

				cleanups.unusedSiteContent = contentNotUsed;
				cleanups.hiddenSiteContent = contentHidden;

				if (cleanups.unusedSiteContent.length > 0 || cleanups.hiddenSiteContent.length > 0) {
					var cleanupFile = name + '_cleanup.json';
					fs.writeFileSync(path.join(projectDir, name + '_cleanup.json'), JSON.stringify(cleanups, null, 4));
					console.log('Run "cec cleanup-template ' + cleanupFile + '" to cleanup the template');
				}

				done(true);
			});

	} catch (e) {
		if (e) {
			console.log(e);
		}
		done();
	}
};

var _readFileInLines = function (filePath) {
	var src = '';
	try {
		var data = fs.readFileSync(filePath, 'UTF-8');
		console.log(data);
		var lines = data.split(/\r?\n/);
		lines.forEach((line) => {
			src = src + line + escape.EOL;
		});
	} catch (e) {

	}
	return src;
};

module.exports.cleanupTemplate = function (argv, done) {
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

	if (!fs.existsSync(file)) {
		console.log('ERROR: file ' + file + ' does not exist');
		done();
		return;
	}

	if (!fs.statSync(file).isFile()) {
		console.log('ERROR: ' + file + ' is not a file');
		done();
		return;
	}

	if (!serverUtils.endsWith(file, '.json')) {
		console.log('ERROR: ' + file + ' is not a JSON file');
		done();
		return;
	}

	var cleanup;

	try {
		cleanup = JSON.parse(fs.readFileSync(file));
	} catch (e) {}

	if (!cleanup || !cleanup.name || !cleanup.type || cleanup.type !== 'template') {
		console.log('ERROR: ' + file + ' is not valid template cleanup file');
		done();
		return;
	}

	var tempName = cleanup.name;

	var tempExist = false,
		templates = fs.readdirSync(templatesSrcDir);
	for (var i = 0; i < templates.length; i++) {
		if (tempName === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		console.error('ERROR: template ' + tempName + ' does not exist');
		done();
		return;
	}

	console.log(' - cleanup template ' + tempName);

	var unusedSiteContent = cleanup.unusedSiteContent || [];
	console.log(' - total unused site content: ' + unusedSiteContent.length);
	var deleted = 0;
	unusedSiteContent.forEach(function (name) {
		var filePath = path.join(templatesSrcDir, tempName, 'content', name);
		if (!fs.existsSync(filePath)) {
			console.log('ERROR: file ' + filePath + ' does not exist');
		} else {
			fileUtils.remove(filePath);
			deleted += 1;
		}
	});

	var hiddenSiteContent = cleanup.hiddenSiteContent || [];
	console.log(' - total hidden site content: ' + hiddenSiteContent.length);
	hiddenSiteContent.forEach(function (name) {
		var filePath = path.join(templatesSrcDir, tempName, 'content', name);
		if (!fs.existsSync(filePath)) {
			console.log('ERROR: file ' + filePath + ' does not exist');
		} else {
			fileUtils.remove(filePath);
			deleted += 1;
		}
	});
	console.log(' - total deleted files: ' + deleted);

	done(true);
};


module.exports.createAssetUsageReport = function (argv, done) {
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

	var itemIds = argv.assets.split(',');

	var output = argv.output;
	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output;
		if (serverUtils.endsWith(outputFolder, '.json')) {
			outputFolder = outputFolder.substring(0, outputFolder.lastIndexOf(path.sep));
		} else {
			output = path.join(output, itemIds.join('_') + 'AssetUsage.json');
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
		// console.log(' - output to ' + output);
	}

	var items = [];
	var itemRelationships = [];
	var refItems = [];
	var itemsjson = [];
	var channelIds = [];
	var sites = [];
	var sitesInfo = [];

	var request = serverUtils.getRequest();
	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		server.login = true;
		_queryItems(server, itemIds).then(function (result) {
				items = result || [];
				for (var j = 0; j < itemIds.length; j++) {
					var found = false;
					for (var i = 0; i < items.length; i++) {
						if (itemIds[j] === items[i].id) {
							found = true;
							break;
						}
					}
					if (!found) {
						done();
						return;
					}
				}

				// console.log(' - verify items');

				return _getItemValues(server, itemIds, 'relationships');
			})
			.then(function (result) {
				itemRelationships = result;
				var i, j;
				for (i = 0; i < items.length; i++) {
					var item = items[i];
					for (j = 0; j < itemRelationships.length; j++) {
						if (item.id === itemRelationships[j].id) {
							item.references = itemRelationships[j].references;
							item.referencedBy = itemRelationships[j].referencedBy;
						}
					}
				}

				var refIds = [];
				for (i = 0; i < itemRelationships.length; i++) {
					for (j = 0; j < itemRelationships[i].references.length; j++) {
						var id = itemRelationships[i].references[j];
						if (!refIds.includes(id)) {
							refIds.push(id);
						}
					}
				}

				for (i = 0; i < itemRelationships.length; i++) {
					for (j = 0; j < itemRelationships[i].referencedBy.length; j++) {
						var id = itemRelationships[i].referencedBy[j];
						if (!refIds.includes(id)) {
							refIds.push(id);
						}
					}
				}

				return _queryItems(server, refIds, 'reference/referenceBy');
			})
			.then(function (result) {
				refItems = result;

				return _getItemValues(server, itemIds, 'variations');

			})
			.then(function (result) {
				var variationSet = result || [];
				var i;
				for (i = 0; i < items.length; i++) {
					for (var j = 0; j < variationSet.length; j++) {
						if (items[i].id === variationSet[j].id) {
							items[i].variations = variationSet[j].data;
							break;
						}
					}
				}

				var repositoryPromises = [];
				for (i = 0; i < items.length; i++) {
					if (items[i].repositoryId) {
						repositoryPromises.push(serverRest.getRepository({
							server: server,
							id: items[i].repositoryId
						}));
					}
				}

				return Promise.all(repositoryPromises);

			})
			.then(function (results) {
				var repositories = results || [];
				var i, j;
				for (i = 0; i < items.length; i++) {
					for (j = 0; j < repositories.length; j++) {
						if (items[i].repositoryId === repositories[j].id) {
							items[i].repository = {
								id: repositories[j].id,
								name: repositories[j].name
							};
						}
					}
				}

				for (i = 0; i < items.length; i++) {
					var channels = items[i].channels && items[i].channels.data || [];
					var itemChannelIds = [];
					for (j = 0; j < channels.length; j++) {
						if (channels[j].id) {
							itemChannelIds.push(channels[j].id);
							if (!channelIds.includes(channels[j].id)) {
								channelIds.push(channels[j].id);
							}
						}
					}
					items[i].channelIds = itemChannelIds;

					// console.log(' - item: ' + items[i].name + ' channels: ' + itemChannelIds);
				}

				var channelPromises = [];
				for (i = 0; i < channelIds.length; i++) {
					channelPromises.push(serverRest.getChannel({
						server: server,
						id: channelIds[i]
					}));
				}

				return Promise.all(channelPromises);

			})
			.then(function (results) {
				var channels = results || [];

				for (var i = 0; i < items.length; i++) {
					var item = items[i];
					var itemChannels = [];
					// console.log(' - item ' + item.name + ' channelIds: ' + item.channelIds);
					for (var j = 0; j < item.channelIds.length; j++) {
						for (var k = 0; k < channels.length; k++) {
							if (item.channelIds[j] === channels[k].id) {
								var tokens = channels[k].channelTokens;
								var channelToken;
								for (var m = 0; m < tokens.length; m++) {
									if (tokens[m].name === 'defaultToken') {
										channelToken = tokens[m].token;
										break;
									}
								}
								if (!channelToken && tokens.length > 0) {
									channelToken = tokens[0].token;
								}
								itemChannels.push({
									id: channels[k].id,
									name: channels[k].name,
									channelToken: channelToken,
									isSiteChannel: channels[k].isSiteChannel
								});
							}
						}
					}
					items[i].channels = itemChannels;
				}

				return sitesRest.getSites({
					server: server,
					expand: 'template,theme,channel'
				});

			})
			.then(function (result) {
				if (result && !result.err) {
					sites = result || [];
				}

				var siteIds = [];
				for (var i = 0; i < items.length; i++) {
					items[i].sites = [];
					var itemSiteIds = [];
					for (var j = 0; j < items[i].channels.length; j++) {
						if (items[i].channels[j].isSiteChannel) {
							for (var k = 0; k < sites.length; k++) {
								if (sites[k].channel && items[i].channels[j].id === sites[k].channel.id) {
									if (!siteIds.includes(sites[k].id)) {
										siteIds.push(sites[k].id);
									}
									if (!itemSiteIds.includes(sites[k].id)) {
										var site = {
											id: sites[k].id,
											name: sites[k].name,
											template: sites[k].templateName,
											theme: sites[k].themeName,
											channelId: sites[k].channel.id
										};
										items[i].sites.push(site);
										itemSiteIds.push(sites[k].id);
									}
								}
							} // site channels
						} // item's channels
					}
					// console.log(' - item ' + items[i].name + ' sites: ' + itemSiteIds);
				}

				var sitePagePromises = [];
				for (i = 0; i < siteIds.length; i++) {
					sitePagePromises.push(_getSitePages(server, siteIds[i]));
				}

				return Promise.all(sitePagePromises);

			})
			.then(function (results) {
				var sitePages = results || [];

				var contentListData = [];

				items.forEach(function (item) {
					var channels = item.channels;
					for (var k = 0; k < item.sites.length; k++) {
						var itemSite = item.sites[k];
						// the the channel token 
						var channelToken;
						for (var j = 0; j < channels.length; j++) {
							if (channels[j].id === itemSite.channelId) {
								channelToken = channels[j].channelToken;
								break;
							}
						}
						for (j = 0; j < sitePages.length; j++) {
							if (itemSite.id == sitePages[j].id) {
								var structurePages = sitePages[j].structurePages || [];
								var pages = sitePages[j].pages || [];
								var itemPages = _getItemPages(item.id, item.type, structurePages, pages);
								var contentListPages = _getContentListPages(itemSite.id, channelToken,
									item.id, item.type, item.language, structurePages, pages);
								if (contentListPages && contentListPages.length > 0) {
									contentListData = contentListData.concat(contentListPages);
								}
								itemSite.pages = itemPages;
							}
						}
					}
				});


				return _contentListQuery(server, contentListData);

			})
			.then(function (result) {
				var contentListPages = result || [];

				if (contentListPages.length > 0) {
					// Add pages with content list to pages the item is on
					for (var i = 0; i < items.length; i++) {
						var item = items[i];
						for (var k = 0; k < item.sites.length; k++) {
							var itemSite = item.sites[k];

							for (var j = 0; j < contentListPages.length; j++) {
								if (itemSite.id === contentListPages[j].siteId) {
									var foundPage = false;
									var itemPages = itemSite.pages || [];
									for (var m = 0; m < itemPages.length; m++) {
										if (itemPages[m].id === contentListPages[j].pageId) {
											foundPage = true;
											if (!itemPages[m].contentlist) {
												itemPages[m].contentlist = item.type;
												break;
											}
										}
									}
									if (!foundPage) {
										itemPages.push({
											id: contentListPages[j].pageId,
											name: contentListPages[j].pageName,
											contentlist: item.type
										});
									}
								}
							}
						}
					}
				}

				items.forEach(function (item) {
					itemsjson.push(_createItemData(item, refItems));
				});

				_displayAssetReport(itemsjson);

				if (output) {
					fs.writeFileSync(output, JSON.stringify(itemsjson, null, 4));
					console.log(' - report saved to ' + output);
				}

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done();
			});
	});
};

var _contentListQuery = function (server, contentListData) {
	// console.log(contentListData);
	return new Promise(function (resolve, reject) {
		if (!contentListData || contentListData.length === 0) {
			resolve([]);
		} else {
			var contentListItems = [];
			var doGetContentListValues = contentListData.reduce(function (itemPromise, param) {
					return itemPromise.then(function (result) {
						var channelToken = param.channelToken,
							orderBy = param.orderBy,
							limit = param.limit,
							offset = param.offset,
							type = param.contentType,
							language = param.language,
							queryString = param.queryString;
						var q = '';
						if (type) {
							q = '(type eq "' + type + '")';
							if (queryString) {
								q = q + ' and (' + queryString + ')';
							}
							if (language) {
								q = q + ' and (language eq "' + language + '" or translatable eq "false")';
							}
						}
						if (orderBy && orderBy.indexOf('updateddate') >= 0) {
							orderBy = serverUtils.replaceAll(orderBy, 'updateddate', 'updatedDate');
						}
						var contentListPromise = serverRest.queryItems({
							server: server,
							q: q,
							channelToken: channelToken,
							orderBy: orderBy,
							limit: limit,
							offset: offset
						});
						return contentListPromise.then(function (result) {
							if (result.query) {
								console.log(' - content list query: ' + result.query);
							}
							var items = result && result.data || [];
							for (var i = 0; i < items.length; i++) {
								if (items[i].id === param.itemId) {
									contentListItems.push(param);
								}
							}

						});
					});

				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doGetContentListValues.then(function (result) {
				resolve(contentListItems);
			});
		}
	});
};

var _getItemPages = function (itemId, itemType, structurePages, pages) {
	var itemPages = [];
	for (var i = 0; i < structurePages.length; i++) {
		var page = structurePages[i];
		var fileName = page.id + '.json';
		// console.log('page: id=' + page.id + ' name=' + page.name);
		for (var j = 0; j < pages.length; j++) {
			if (fileName === pages[j].name) {
				var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances;
				// console.log(componentInstances);
				// console.log('Page: ' + fileName);
				var itemOnPage = false;
				if (componentInstances) {
					Object.keys(componentInstances).forEach(function (key) {
						var comp = componentInstances[key];
						if (comp.id === 'scs-contentitem' || (comp.id === 'scsCaaSLayout' && comp.type === 'scs-component')) {
							if (comp.data.contentId && itemId === comp.data.contentId) {
								itemOnPage = true;
							}
						}
					});
				}
				if (itemOnPage) {
					itemPages.push({
						id: page.id,
						name: page.name,
						contentitem: itemId
					});
				}
			}
		}
	}
	return itemPages;
};

var _getContentListPages = function (siteId, channelToken, itemId, itemType, language, structurePages, pages) {
	var contentListPages = [];
	for (var i = 0; i < structurePages.length; i++) {
		var page = structurePages[i];
		var fileName = page.id + '.json';
		for (var j = 0; j < pages.length; j++) {
			if (fileName === pages[j].name) {
				var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances;
				var contentListOnPage = false;
				var orderBy, limit, offset, queryString;
				if (componentInstances) {
					Object.keys(componentInstances).forEach(function (key) {
						var comp = componentInstances[key];
						if (comp.id === 'scs-contentlist') {
							// console.log(comp.data);
							if (comp.data.contentTypes && comp.data.contentTypes.includes(itemType)) {
								// console.log(' - content list: page: ' +  pages[j].name + ' type: ' + itemType + ' sort: ' + comp.data.sortOrder + ' limit: ' + comp.data.maxResults);
								contentListOnPage = true;
								queryString = comp.data.queryString;
								orderBy = comp.data.sortOrder;
								limit = comp.data.maxResults;
								offset = comp.data.firstItem;
							}
						}
					});
				}
				if (contentListOnPage) {
					contentListPages.push({
						siteId: siteId,
						channelToken: channelToken,
						pageId: page.id,
						pageName: page.name,
						itemId: itemId,
						contentType: itemType,
						language: language,
						queryString: queryString,
						orderBy: orderBy,
						limit: limit,
						offset: offset
					});
				}
			}
		}
	}
	return contentListPages;
};

var _createItemData = function (item, refItems) {
	var _findItem = function (id) {
		for (var i = 0; i < refItems.length; i++) {
			if (refItems[i].id === id) {
				return refItems[i];
			}
		}
		return undefined;
	};
	var data = {
		item: {
			id: item.id,
			name: item.name,
			type: item.type,
			slug: item.slug,
			language: item.language,
			languageIsMaster: item.languageIsMaster,
			status: item.status,
			owner: item.createdBy
		},
		repository: item.repository,
		channels: item.channels,
		sites: item.sites
	};

	var referenceItems = [];
	var i;
	if (item.references.length > 0) {
		for (i = 0; i < item.references.length; i++) {
			var refItem = _findItem(item.references[i]);
			if (refItem) {
				referenceItems.push({
					id: refItem.id,
					name: refItem.name,
					type: refItem.type,
					status: refItem.status
				});
			}
		}
	}

	var referencedByItems = [];
	if (item.referencedBy.length > 0) {
		for (i = 0; i < item.referencedBy.length; i++) {
			var refByItem = _findItem(item.referencedBy[i]);
			if (refByItem) {
				referencedByItems.push({
					id: refByItem.id,
					name: refByItem.name,
					type: refByItem.type,
					status: refByItem.status
				});
			}
		}
	}

	data.referenceItems = referenceItems;
	data.referencedByItems = referencedByItems;

	var variations = [];
	if (item.variations.length > 0) {
		for (i = 0; i < item.variations.length; i++) {
			var variation = item.variations[i];
			if (variation.varType === 'language') {
				var items = variation.items || [];
				for (var j = 0; j < items.length; j++) {
					variations.push({
						id: items[j].id,
						isMaster: (variation.masterItem && variation.masterItem === items[j].id),
						language: items[j].value,
						status: items[i].status,
						isPublished: items[j].isPublished
					});
				}
			}
		}
	}

	data.variations = variations;

	return data;
};

var _getItemValues = function (server, itemIds, action) {
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

			var count = [];
			var doGetItemValues = groups.reduce(function (itemPromise, param) {
					return itemPromise.then(function (result) {
						var itemPromises = [];
						for (var i = param.start; i <= param.end; i++) {
							if (action === 'relationships') {
								itemPromises.push(serverRest.getItemRelationships({
									server: server,
									id: itemIds[i]
								}));
							} else if (action === 'variations') {
								itemPromises.push(serverRest.getItemVariations({
									server: server,
									id: itemIds[i]
								}));
							}
						}
						count.push('.');
						process.stdout.write(' - querying ' + action + ' for the items ' + count.join(''));
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

			doGetItemValues.then(function (result) {
				process.stdout.write(os.EOL);
				resolve(items);
			});
		}
	});
};


var _displayAssetReport = function (itemsjson) {
	var format = '  %-32s  %s';
	var formatPage = '  %-32s  %-18s %s';
	var i, j;
	for (i = 0; i < itemsjson.length; i++) {
		var item = itemsjson[i].item;
		console.log('Item');
		console.log(sprintf(format, 'id', item.id));
		console.log(sprintf(format, 'name', item.name));
		console.log(sprintf(format, 'type', item.type));
		console.log(sprintf(format, 'slug', item.slug));
		console.log(sprintf(format, 'language', item.language));
		console.log(sprintf(format, 'master', item.languageIsMaster));
		console.log(sprintf(format, 'status', item.status));
		console.log(sprintf(format, 'owner', item.owner));

		console.log('Repository');
		var repo = itemsjson[i].repository;
		console.log(sprintf(format, 'id', repo.id));
		console.log(sprintf(format, 'name', repo.name));

		console.log('Channels');
		var channels = itemsjson[i].channels;
		for (j = 0; j < channels.length; j++) {
			console.log(sprintf(format, 'id', channels[j].id));
			console.log(sprintf(format, 'name', channels[j].name));
			console.log(sprintf(format, 'channelToken', channels[j].channelToken));
		}

		console.log('Sites');
		var sites = itemsjson[i].sites;
		for (j = 0; j < sites.length; j++) {
			console.log(sprintf(format, 'id', sites[j].id));
			console.log(sprintf(format, 'name', sites[j].name));
			console.log(sprintf(format, 'template', sites[j].template));
			console.log(sprintf(format, 'theme', sites[j].theme));
			var pages = sites[j].pages;
			for (var k = 0; k < pages.length; k++) {
				console.log(sprintf(formatPage, (k === 0 ? 'pages' : ''), 'Id: ' + pages[k].id, 'Name: ' + pages[k].name));
			}
		}

		console.log('Reference Items');
		var referenceItems = itemsjson[i].referenceItems;
		for (j = 0; j < referenceItems.length; j++) {
			console.log(sprintf(format, 'id', referenceItems[j].id));
			console.log(sprintf(format, 'name', referenceItems[j].name));
			console.log(sprintf(format, 'type', referenceItems[j].type));
			console.log(sprintf(format, 'status', referenceItems[j].status));
		}

		console.log('Referenced By Items');
		var referencedByItems = itemsjson[i].referencedByItems;
		for (j = 0; j < referencedByItems.length; j++) {
			console.log(sprintf(format, 'id', referencedByItems[j].id));
			console.log(sprintf(format, 'name', referencedByItems[j].name));
			console.log(sprintf(format, 'type', referencedByItems[j].type));
			console.log(sprintf(format, 'status', referencedByItems[j].status));
		}

		console.log('Variations');
		var variations = itemsjson[i].variations;
		for (j = 0; j < variations.length; j++) {
			console.log(sprintf(format, 'id', variations[j].id));
			console.log(sprintf(format, 'master', variations[j].isMaster));
			console.log(sprintf(format, 'language', variations[j].language));
			console.log(sprintf(format, 'status', variations[j].status));
		}

		if (i < itemsjson.length - 1) {
			console.log('---------------');
		}
	}
};