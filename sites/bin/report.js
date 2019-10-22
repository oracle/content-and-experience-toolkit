/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	he = require('he'),
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
			if (page.links.length > 0) {
				for (var j = 0; j < page.links.length; j++) {
					var link = page.links[j];
					var msg = 'URL: ' + link.url + '  status: ' + link.status;
					console.log(sprintf(format, (j === 0 ? 'links' : ' '), msg));
				}
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

	require('events').EventEmitter.prototype._maxListeners = 100;

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		server['login'] = true;

		var sitePromise = server.useRest ? sitesRest.getSite({
			server: server,
			name: siteName,
			expand: 'ownedBy,repository,channel'
		}) : serverUtils.browseSitesOnServer(request, server);
		sitePromise.then(function (result) {
				if (server.useRest) {
					if (result.err) {
						return Promise.reject();
					}
					site = result;
					// console.log(site);
					site['fFolderGUID'] = site.id;

					sitejson['id'] = site.id;
					sitejson['name'] = site.name;
					sitejson['type'] = site.isEnterprise ? 'Enterprise' : 'Standard';
					sitejson['slug'] = site.sitePrefix;
					sitejson['defaultLanguage'] = site.defaultLanguage;
					sitejson['siteTemplate'] = site.templateName;
					sitejson['theme'] = site.themeName;
					sitejson['owner'] = site.ownedBy && site.ownedBy.userName;

					templateName = site.templateName;
					themeName = site.themeName;
					repositoryId = site.repository && site.repository.id;
					channelId = site.channel && site.channel.id;

					isEnterprise = site.isEnterprise;
				} else {
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
				}
				var siteInfoPromises = [];
				if (!server.useRest) {
					siteInfoPromises.push(serverUtils.getSiteInfoWithToken(server, siteName));
				}

				return Promise.all(siteInfoPromises);
			})
			.then(function (results) {
				if (!server.useRest) {
					if (!results || results.length < 1 || results[0].err) {
						return Promise.reject();
					}

					siteInfo = results[0] && results[0].siteInfo;
					// console.log(siteInfo);
					if (siteInfo) {
						sitejson['theme'] = siteInfo.themeName;
						themeName = siteInfo.themeName;
						repositoryId = siteInfo.repositoryId;
						channelId = siteInfo.channelId;
					}
				}
				console.log(' - query site');

				return serverRest.getFolderUsers({
					server: server,
					id: site.fFolderGUID
				});
			})
			.then(function (result) {
				sitejson['members'] = result && result.data || [];
				console.log(' - query site members');

				var templatePromise = server.useRest ? sitesRest.getTemplate({
					server: server,
					name: templateName,
					expand: 'ownedBy'
				}) : serverUtils.browseSitesOnServer(request, server, 'framework.site.template');

				return templatePromise;
			})
			.then(function (result) {
				if (server.useRest) {
					if (result && !result.err) {
						template = result;
						template['fFolderGUID'] = template.id;
						templatejson['id'] = template.id;
						templatejson['name'] = template.name;
						templatejson['owner'] = template.ownedBy && template.ownedBy.userName;
					}
				} else {
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
				console.log(' - query site template members');
				if (templatejson.id) {
					templatejson['members'] = results.length > 0 ? results[0].data : [];
				}

				var params = 'doBrowseStarterThemes=1';

				var themePromise = server.useRest ? sitesRest.getTheme({
					server: server,
					name: themeName,
					expand: 'ownedBy'
				}) : serverUtils.browseThemesOnServer(request, server, params);

				return themePromise;

			})
			.then(function (result) {
				if (server.useRest) {
					if (result && !result.err) {
						theme = result;
						theme['fFolderGUID'] = template.id;
						themejson['id'] = theme.id;
						themejson['name'] = theme.name;
						themejson['owner'] = theme.ownedBy && theme.ownedBy.userName;
					}
				} else {
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
				}
				return serverRest.getFolderUsers({
					server: server,
					id: theme.fFolderGUID
				});
			})
			.then(function (result) {
				console.log(' - query theme member');
				themejson['members'] = result && result.data || [];

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
					repositoryjson['id'] = repository.id;
					repositoryjson['name'] = repository.name;

					var contentTypes = [];
					for (var i = 0; i < repository.contentTypes.length; i++) {
						contentTypes.push(repository.contentTypes[i].name);
					}
					repositoryjson['contentTypes'] = contentTypes;
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
					repositoryjson['members'] = results[0].permissions || [];
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

					channeljson['id'] = channel.id;
					channeljson['name'] = channel.name;
					channeljson['token'] = channelToken;
					channeljson['type'] = channel.channelType;
					channeljson['publishPolicy'] = channel.publishPolicy === 'anythingPublished' ? 'Anything can be published' :
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
					channelpolicyjson['id'] = result.id;
					channelpolicyjson['name'] = result.name;
					channelpolicyjson['defaultLanguage'] = result.defaultValue;
					channelpolicyjson['requiredLanguages'] = result.requiredValues;
					channelpolicyjson['optionalLanguages'] = result.optionalValues;
				}

				return _getSitePages(server, sitejson.id);
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

							var triggerActions = [];
							var links = [];

							// fs.writeFileSync(path.join(projectDir, 'dist', page.id + '.json'), JSON.stringify(pages[j].fileContent));


							var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances
							// console.log(componentInstances);
							// console.log('Page: ' + fileName);
							var contentlist = [];
							var contentitems = [];
							var components = [];

							if (componentInstances) {
								Object.keys(componentInstances).forEach(function (key) {
									var comp = componentInstances[key];

									// collect links
									var compLinks = _getHrefLinks(JSON.stringify(comp));
									var aTags = _getATagHrefs(JSON.stringify(comp));
									for (var k = 0; k < aTags.length; k++) {
										if (!compLinks.includes(aTags[k])) {
											compLinks.push(aTags[k]);
										}
									}
									if (comp.data.href && !compLinks.includes(comp.data.href)) {
										compLinks.push(comp.data.href);
									}
									if (comp.data.imageUrl && !compLinks.includes(comp.data.imageUrl)) {
										compLinks.push(comp.data.imageUrl);
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
										var found = false;
										for (var m = 0; m < links.length; m++) {
											if (compLinks[k] === links[m].url) {
												found = true;
												if (!links[m].components.includes(comp.id)) {
													links[m].components.push(comp.id);
												}
												break;
											}
										}
										if (!found) {
											links.push({
												url: compLinks[k],
												components: [comp.id]
											});
										}
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
									} else if (comp.id === 'scs-image' || comp.id === 'scs-gallery') {
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
									}

									// console.log(' - ' + pageLinks[k].url + ' : ' + value);
								}
							}

							page['links'] = pageLinks;
							page['triggerActions'] = triggerActions;

						}
					}
				}

				return _verifyPageDocs(server, sitejson.id, structurePages);

			})
			.then(function (result) {

				if (result && !result.err) {
					structurePages = result;
				}

				var compPromises = [];
				if (compNames.length > 0) {
					if (server.useRest) {
						compPromises.push(sitesRest.getComponents({
							server: server,
							expand: 'ownedBy'
						}));
					} else {
						compPromises.push(serverUtils.browseComponentsOnServer(request, server));
					}
				}

				return Promise.all(compPromises);

			})
			.then(function (results) {
				console.log(' - query components');
				if (server.useRest) {
					allComponents = results.length > 0 && results[0] ? results[0] : [];
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
				} else {
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
								owner: comp ? (comp.ownedBy && comp.ownedBy.userName) : '',
								members: []
							});
							if (!comp) {
								issues.push('Component \'' + compNames[j] + '\' does not exist or user ' + server.username + ' has no access');
							}
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
					for (var j = 0; j < page.contentitems.length; j++) {
						var exist = false;
						var name;
						var itemChannels = [];
						for (var k = 0; k < pageItems.length; k++) {
							if (page.contentitems[j].id === pageItems[k].id) {
								name = pageItems[k].name;
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
						page.contentitems[j]['name'] = name;
						page.contentitems[j]['exist'] = exist;
						page.contentitems[j]['existInChannel'] = existInChannel;

						if (!exist) {
							var msg = 'Page \'' + page.name + '\' : item ' + page.contentitems[j].id + ' does not exist';
							issues.push(msg);
						} else if (!existInChannel) {
							var msg = 'Page \'' + page.name + '\' : item ' + page.contentitems[j].id + '(' + name + ') is not in site channel';
							issues.push(msg);
						}
					}
				}

				// verify SCS_DIGITAL_ASSET
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
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
						}
					}
				}

				var pageLinks = [];
				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					for (var j = 0; j < page.links.length; j++) {
						if (!page.links[j].status) {
							var found = false;
							for (var k = 0; k < pageLinks.length; k++) {
								if (page.links[j].url === pageLinks[k].url) {
									found = true;
									break;
								}
							}
							if (!found) {
								pageLinks.push({
									pageId: page.id,
									url: page.links[j].url
								});
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

									if (page.links[j].status && page.links[j].status.toLowerCase() !== 'ok') {
										var msg = 'Page: \'' + page.name + '\' component: \'' + page.links[j].components +
											'\' link: ' + page.links[j].url + ' status: ' + page.links[j].status;
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

				for (var i = 0; i < structurePages.length; i++) {
					var page = structurePages[i];
					if (page) {
						// set status for trigger actions
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
								var msg = 'Page: \'' + page.name + '\' component: \'' + action.component +
									'\' triggerAction: ' + action.action + ' ' + action.type + ': ' + action.value +
									' status: ' + action.status;
								issues.push(msg);
							}
						}

						pagesOutput.push({
							id: page.id,
							name: page.name,
							pageUrl: page.pageUrl,
							version: page.version,
							contentlist: page.contentlist,
							contentitems: page.contentitems,
							components: page.components,
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
						issues: issues
					};
					fs.writeFileSync(output, JSON.stringify(data, null, 4));
					console.log(' - report saved to ' + output);
				}

				done(true);
			})
			.catch((error) => {
				done();
			});

	}); // login
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

				return _getPageFiles(server, pages)
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
			};
			if (response && response.statusCode === 200) {
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
			var count = [];
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

var _verifyHrefLink = function (server, request, httpsProxy, httpProxy, pageId, url) {
	return new Promise(function (resolve, reject) {
		if (!url.startsWith('http')) {
			return resolve({
				pageId: pageId,
				url: url,
				status: ''
			})
		}
		var status;
		var options = {
			url: url
		}
		var proxy = url.indexOf('https') >= 0 ? (httpsProxy || httpProxy) : (httpProxy || httpsProxy);
		if (proxy && url.indexOf(server.url) < 0) {
			options['proxy'] = proxy;
		}
		request.head(options)
			.on('response', function (response) {
				status = response.statusMessage || response.statusCode;
				return resolve({
					pageId: pageId,
					url: url,
					status: status
				})
			})
			.on('error', function (err) {
				var errStr;
				try {
					errStr = JSON.stringify(err);
				} catch (e) {}
				status = err && (err.errno || err.code) ? (err.errno || err.code) : (errStr ? errStr : 'error');

				return resolve({
					pageId: pageId,
					url: url,
					status: status
				})
			})
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
			var doVerifyLinks = groups.reduce(function (linkPromise, param) {
					return linkPromise.then(function (result) {
						var linkPromises = [];
						for (var i = param.start; i <= param.end; i++) {
							linkPromises.push(_verifyHrefLink(server, request, httpsProxy, httpProxy,
								pageLinks[i].pageId, pageLinks[i].url));
						}
						count.push('.');
						process.stdout.write(' - verify page links [' + param.start + ', ' + param.end + ']' + count.join(''));
						// process.stdout.write(' - verify page links ' + count.join(''));
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

		processedLinks.push({
			url: fullUrl,
			components: links[i].components,
			status: ''
		});
	}
	return processedLinks;
};

var _verifyPageDocs = function (server, siteId, pages) {
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
				for (var i = 0; i < pages.length; i++) {
					for (var j = 0; j < pages[i].links.length; j++) {
						var link = pages[i].links[j];
						var url = link.url;
						var found = false;
						if (url.startsWith('[!--$SCS_CONTENT_URL--]/')) {
							var file = url.substring(url.indexOf('/') + 1);
							for (var k = 0; k < items.length; k++) {
								if (file === items[k].name) {
									// console.log(' - page: ' + pages[i].name + ' page doc: ' + file);
									found = true;
									link.status = 'OK';
									break;
								}
							}
							link.status = found ? 'OK' : 'Document NOT FOUND';
						}
					}
				}
				resolve(pages);
			})
			.catch((error) => {
				resolve({
					err: 'err'
				});
			});
	});
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
		server['login'] = true;
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

				for (var i = 0; i < items.length; i++) {
					var item = items[i];
					for (var j = 0; j < itemRelationships.length; j++) {
						if (item.id === itemRelationships[j].id) {
							item['references'] = itemRelationships[j].references;
							item['referencedBy'] = itemRelationships[j].referencedBy;
						}
					}
				}

				var refIds = [];
				for (var i = 0; i < itemRelationships.length; i++) {
					for (var j = 0; j < itemRelationships[i].references.length; j++) {
						var id = itemRelationships[i].references[j];
						if (!refIds.includes(id)) {
							refIds.push(id);
						}
					}
				}

				for (var i = 0; i < itemRelationships.length; i++) {
					for (var j = 0; j < itemRelationships[i].referencedBy.length; j++) {
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
				for (var i = 0; i < items.length; i++) {
					for (var j = 0; j < variationSet.length; j++) {
						if (items[i].id === variationSet[j].id) {
							items[i]['variations'] = variationSet[j].data;
							break;
						}
					}
				}

				var repositoryPromises = [];
				for (var i = 0; i < items.length; i++) {
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
				for (var i = 0; i < items.length; i++) {
					for (var j = 0; j < repositories.length; j++) {
						if (items[i].repositoryId === repositories[j].id) {
							items[i]['repository'] = {
								id: repositories[j].id,
								name: repositories[j].name
							}
						}
					}
				}

				for (var i = 0; i < items.length; i++) {
					var channels = items[i].channels && items[i].channels.data || [];
					var itemChannelIds = [];
					for (var j = 0; j < channels.length; j++) {
						if (channels[j].id) {
							itemChannelIds.push(channels[j].id);
							if (!channelIds.includes(channels[j].id)) {
								channelIds.push(channels[j].id);
							}
						}
					}
					items[i]['channelIds'] = itemChannelIds;

					// console.log(' - item: ' + items[i].name + ' channels: ' + itemChannelIds);
				}

				var channelPromises = [];
				for (var i = 0; i < channelIds.length; i++) {
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
					items[i]['channels'] = itemChannels;
				}

				return serverUtils.browseSitesOnServer(request, server);

			})
			.then(function (result) {

				sites = result.data || [];

				var siteInfoPromises = [];
				for (var i = 0; i < sites.length; i++) {
					siteInfoPromises.push(serverUtils.getSiteInfoWithToken(server, sites[i].fFolderName));
				}

				return Promise.all(siteInfoPromises);

			})
			.then(function (results) {
				var info = results || [];
				for (var i = 0; i < info.length; i++) {
					for (var j = 0; j < sites.length; j++) {
						if (sites[j].fFolderName === info[i].siteInfo.siteName) {
							var siteInfo = info[i].siteInfo;
							siteInfo.id = sites[i].fFolderGUID;
							siteInfo.siteTemplate = sites[i].xScsSiteTemplate;
							sitesInfo.push(siteInfo);
						}
					}
				}

				var siteIds = [];
				for (var i = 0; i < items.length; i++) {
					items[i]['sites'] = [];
					var itemSiteIds = [];
					for (var j = 0; j < items[i].channels.length; j++) {
						if (items[i].channels[j].isSiteChannel) {
							for (var k = 0; k < sitesInfo.length; k++) {
								if (items[i].channels[j].id === sitesInfo[k].channelId) {
									if (!siteIds.includes(sitesInfo[k].id)) {
										siteIds.push(sitesInfo[k].id);
									}
									if (!itemSiteIds.includes(sitesInfo[k].id)) {
										var site = {
											id: sitesInfo[k].id,
											name: sitesInfo[k].siteName,
											template: sitesInfo[k].siteTemplate,
											theme: sitesInfo[k].themeName,
											channelId: sitesInfo[k].channelId
										};
										items[i].sites.push(site);
										itemSiteIds.push(sitesInfo[k].id);
									}
								}
							}
						}
					}
					// console.log(' - item ' + items[i].name + ' sites: ' + itemSiteIds);
				}

				var sitePagePromises = [];
				for (var i = 0; i < siteIds.length; i++) {
					sitePagePromises.push(_getSitePages(server, siteIds[i]));
				}

				return Promise.all(sitePagePromises);

			})
			.then(function (results) {
				var sitePages = results || [];

				var contentListData = [];

				for (var i = 0; i < items.length; i++) {
					var item = items[i];
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
						for (var j = 0; j < sitePages.length; j++) {
							if (itemSite.id == sitePages[j].id) {
								var structurePages = sitePages[j].structurePages || [];
								var pages = sitePages[j].pages || [];
								var itemPages = _getItemPages(item.id, item.type, structurePages, pages);
								var contentListPages = _getContentListPages(itemSite.id, channelToken,
									item.id, item.type, item.language, structurePages, pages);
								if (contentListPages && contentListPages.length > 0) {
									contentListData = contentListData.concat(contentListPages);
								}
								itemSite['pages'] = itemPages;
							}
						}
					}
				}

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

				for (var i = 0; i < items.length; i++) {
					itemsjson.push(_createItemData(items[i], refItems));
				}

				_displayAssetReport(itemsjson);

				if (output) {
					fs.writeFileSync(output, JSON.stringify(itemsjson, null, 4));
					console.log(' - report saved to ' + output);
				}

				done(true);
			})
			.catch((error) => {
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
				var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances
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
				var componentInstances = pages[j].fileContent && pages[j].fileContent.componentInstances
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
	}
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
	if (item.references.length > 0) {
		for (var i = 0; i < item.references.length; i++) {
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
		for (var i = 0; i < item.referencedBy.length; i++) {
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

	data['referenceItems'] = referenceItems;
	data['referencedByItems'] = referencedByItems;

	var variations = [];
	if (item.variations.length > 0) {
		for (var i = 0; i < item.variations.length; i++) {
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

	data['variations'] = variations;

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
	for (var i = 0; i < itemsjson.length; i++) {
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
		for (var j = 0; j < channels.length; j++) {
			console.log(sprintf(format, 'id', channels[j].id));
			console.log(sprintf(format, 'name', channels[j].name));
			console.log(sprintf(format, 'channelToken', channels[j].channelToken));
		}

		console.log('Sites');
		var sites = itemsjson[i].sites;
		for (var j = 0; j < sites.length; j++) {
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
		for (var j = 0; j < referenceItems.length; j++) {
			console.log(sprintf(format, 'id', referenceItems[j].id));
			console.log(sprintf(format, 'name', referenceItems[j].name));
			console.log(sprintf(format, 'type', referenceItems[j].type));
			console.log(sprintf(format, 'status', referenceItems[j].status));
		}

		console.log('Referenced By Items');
		var referencedByItems = itemsjson[i].referencedByItems;
		for (var j = 0; j < referencedByItems.length; j++) {
			console.log(sprintf(format, 'id', referencedByItems[j].id));
			console.log(sprintf(format, 'name', referencedByItems[j].name));
			console.log(sprintf(format, 'type', referencedByItems[j].type));
			console.log(sprintf(format, 'status', referencedByItems[j].status));
		}

		console.log('Variations');
		var variations = itemsjson[i].variations;
		for (var j = 0; j < variations.length; j++) {
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