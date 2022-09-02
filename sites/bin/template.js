/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Template library
 */
var gulp = require('gulp'),
	documentUtils = require('./document.js').utils,
	contentUtils = require('./content.js').utils,
	fileUtils = require('../test/server/fileUtils.js'),
	serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	childProcess = require('child_process'),
	cleanCSS = require('gulp-clean-css'),
	fs = require('fs'),
	fse = require('fs-extra'),
	os = require('os'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf,
	path = require('path'),
	argv = require('yargs').argv,
	zip = require('gulp-zip');

var console = require('../test/server/logger.js').console;

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

var cecDir = path.join(__dirname, ".."),
	templatesDataDir = path.join(cecDir, 'data', 'templates'),
	serverURL = 'http://' + (process.env.CEC_TOOLKIT_SERVER || 'localhost') + ':' + (process.env.CEC_TOOLKIT_PORT || '8085');

var projectDir,
	componentsBuildDir,
	componentsSrcDir,
	contentSrcDir,
	serversSrcDir,
	templatesSrcDir,
	themesSrcDir,
	templatesBuildDir;

var templateBuildContentDirBase = '',
	templateBuildContentDirName = '',
	templateName = '';

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	contentSrcDir = path.join(srcfolder, 'content');
	serversSrcDir = path.join(srcfolder, 'servers');
	templatesSrcDir = path.join(srcfolder, 'templates');
	themesSrcDir = path.join(srcfolder, 'themes');

	var buildfolder = serverUtils.getBuildFolder(projectDir);
	templatesBuildDir = path.join(buildfolder, 'templates');
	componentsBuildDir = path.join(buildfolder, 'components');

	return true;
};

var localServer;
var _cmdEnd = function (done, success) {
	done(success);
	if (localServer) {
		localServer.close();
	}
};


var _createLocalTemplateFromSite = function (name, siteName, server, excludeContent, enterprisetemplate,
	excludeComponents, excludeTheme, excludeType,
	publishedassets, referencedassets, excludeFolders, publishedversion) {
	return new Promise(function (resolve, reject) {

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			// prepare local template folder
			var tempSrcPath = path.join(templatesSrcDir, name);

			fileUtils.remove(tempSrcPath);

			var themeSrcPath;

			var isEnterprise;
			var templateIsEnterprise = 'true';
			var themeName, themeId, themeInfo;
			var channelId;
			var channelName;
			var repositoryId;
			var repositoryName;
			var site;
			var contentTypeNames = [];
			var contentLayoutNames = [];
			var typePromises = [];
			var comps = [];
			var contentDownloaded = false;

			var otherAssets = [];
			var hasAssets = false;
			var referenceAssetIds = [];

			sitesRest.getSite({
				server: server,
				name: siteName,
				expand: 'channel,repository,staticSiteDeliveryOptions'
			})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						console.error('ERROR: site ' + siteName + ' does not exist');
						return Promise.reject();
					}
					site = result;
					// console.log(site);
					console.info(' - verify site (Id: ' + site.id + ')');

					if (publishedversion && site.publishStatus === 'unpublished') {
						console.error('ERROR: site ' + siteName + ' is not published');
						return Promise.reject();
					}

					// create local folder for the template

					fs.mkdirSync(tempSrcPath);

					repositoryName = site.repository && site.repository.name;
					repositoryId = site.repository && site.repository.id;

					if (site.isEnterprise && !repositoryId) {
						console.error('ERROR: could not find repository');
						if (site.repository) {
							console.error(site.repository);
						}
						return Promise.reject();
					}
					if (site.isEnterprise) {
						console.info(' - repository: ' + repositoryName + ' (Id: ' + repositoryId + ')');
					}

					// query to get the content types used in the site
					return sitesRest.getSiteContentTypes({
						server: server,
						id: site.id,
						name: siteName
					});

				})
				.then(function (result) {
					contentTypeNames = result && result.data || [];

					var repositoryTypes = site.repository && site.repository.contentTypes || [];
					repositoryTypes.forEach(function (type) {
						if (type.name !== 'DigitalAsset' && !contentTypeNames.includes(type.name)) {
							contentTypeNames.push(type.name);
						}
					});

					console.info(' - content types: ' + contentTypeNames);

					// query content layout mappings if needed
					if (!excludeType && contentTypeNames.length > 0) {
						contentTypeNames.forEach(function (typeName) {
							typePromises.push(serverRest.getContentType({
								server: server,
								name: typeName,
								expand: 'all'
							}));
						});
					}

					isEnterprise = site.isEnterprise;
					themeName = site.themeName;
					channelId = site.channel && site.channel.id;
					channelName = site.channel && site.channel.name;

					templateIsEnterprise = enterprisetemplate ? 'true' : (isEnterprise ? 'true' : 'false');

					console.info(' - theme ' + themeName);
					themeSrcPath = path.join(themesSrcDir, themeName);
					fileUtils.remove(themeSrcPath);
					fs.mkdirSync(themeSrcPath);

					// download site files
					var downloadArgv = {
						path: 'site:' + siteName,
						folder: tempSrcPath
					};
					console.info(' - downloading site files');
					var excludeFolder = ['/publish', '/variants', '/static'];
					if (excludeFolders && excludeFolders.length > 0) {
						excludeFolders.forEach(function (folder) {
							if (folder.indexOf('site:') === 0) {
								var folderPath = folder.substring(5);
								if (!folderPath.startsWith('/')) {
									folderPath = '/' + folderPath;
								}
								if (!excludeFolder.includes(folderPath)) {
									excludeFolder.push(folderPath);
								}
							}
						});
					}
					// console.log(' - exlcude folders: ' + excludeFolder);

					var showError = true;
					var showDetail = false;
					return _downloadResource(server, 'site', site.id, siteName, publishedversion, tempSrcPath, showError, showDetail, excludeFolder);

				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					console.info(' - download site files');
					// create _folder.json
					var folderStr = fs.readFileSync(path.join(templatesDataDir, '_folder.json'));
					var folderJson = JSON.parse(folderStr);
					folderJson.itemGUID = serverUtils.createGUID();
					folderJson.isEnterprise = templateIsEnterprise;
					folderJson.siteName = name;
					folderJson.siteLongDescription = 'Template ' + name;
					if (site.staticSiteDeliveryOptions && site.staticSiteDeliveryOptions.cachingResponseHeaders) {
						folderJson.staticResponseHeaders = site.staticSiteDeliveryOptions.cachingResponseHeaders;
					}
					if (site.staticSiteDeliveryOptions && site.staticSiteDeliveryOptions.mobileUserAgents) {
						folderJson.mobileUserAgents = site.staticSiteDeliveryOptions.mobileUserAgents;
					}
					fs.writeFileSync(path.join(tempSrcPath, '_folder.json'), JSON.stringify(folderJson));

					// update siteinfo.json
					var siteinfoStr = fs.readFileSync(path.join(tempSrcPath, 'siteinfo.json'));
					var siteinfoJson = JSON.parse(siteinfoStr);
					if (siteinfoJson && siteinfoJson.properties) {
						siteinfoJson.properties.themeName = themeName;
						siteinfoJson.properties.siteName = name;
						siteinfoJson.properties.siteRootPrefix = '/SCSTEMPLATE_' + name;
						siteinfoJson.properties.isEnterprise = templateIsEnterprise;
						fs.writeFileSync(path.join(tempSrcPath, 'siteinfo.json'), JSON.stringify(siteinfoJson));
					}

					var cleanupTemplatePromises = [];
					// correct structure and page json if downloaded from published version
					if (publishedversion) {
						var sitePages = fs.readdirSync(path.join(tempSrcPath, 'pages'));
						sitePages.forEach(function (pageName) {
							var pageFile = path.join(tempSrcPath, 'pages', pageName);
							try {
								var pageContent = JSON.parse(fs.readFileSync(pageFile));
								if (pageContent && pageContent.base) {
									fs.writeFileSync(pageFile, JSON.stringify(pageContent.base, null, 4));
								}
							} catch (e) { };
						});

						var structureFile = path.join(tempSrcPath, 'structure.json');
						try {
							var structureContent = JSON.parse(fs.readFileSync(structureFile));
							if (structureContent && structureContent.base && structureContent.base.pages) {
								fs.writeFileSync(structureFile, JSON.stringify(structureContent.base, null, 4));
							}
						} catch (e) { };

						cleanupTemplatePromises.push(_cleanupPublishedTemplate(name, tempSrcPath));
					}

					return Promise.all(cleanupTemplatePromises);

				})
				.then(function (result) {

					// get theme id
					return sitesRest.getTheme({
						server: server,
						name: themeName
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					themeId = result.id;

					var downloadThemePromises = excludeTheme ? [] : [_downloadTheme(server, themeName, themeId, themeSrcPath, excludeFolders, publishedversion)];

					return Promise.all(downloadThemePromises);

				})
				.then(function (results) {
					themeInfo = results && results[0] || {};

					// check if the site has any asset
					return contentUtils.siteHasAssets(server, channelId, repositoryId, publishedassets);

				})
				.then(function (result) {

					hasAssets = result && result.hasAssets;
					if (isEnterprise && !hasAssets) {
						console.info(' - site does not have any asset');
					}

					return contentUtils.getSiteAssetsFromOtherRepos(server, channelId, repositoryId);

				})
				.then(function (result) {

					otherAssets = result && result.data || [];
					if (otherAssets.length > 0) {
						console.log(' - site has assets from other repositories and they will not be included in the template');
					}

					if (referencedassets && !excludeContent) {
						// get all asset IDs on site pages
						referenceAssetIds = serverUtils.getReferencedAssets(path.join(tempSrcPath, 'pages'));
						console.info(' - referenced items: ' + referenceAssetIds.length);
						if (referenceAssetIds.length === 0) {
							// no content to include
							hasAssets = false;
						}
					}

					var downloadContentPromises = (!hasAssets || excludeContent || !isEnterprise) ? [] : [_downloadContent(server, name, channelName, channelId, repositoryName, repositoryId, excludeType, publishedassets, referenceAssetIds)];
					return Promise.all(downloadContentPromises);
				})
				.then(function (results) {
					if (!excludeContent && isEnterprise && hasAssets) {
						if (!results || !results[0] || results[0].err) {
							return Promise.reject();
						}
						contentDownloaded = true;
					}

					// query content layout mappings
					return Promise.all(typePromises);

				})
				.then(function (results) {
					var types = results || [];
					if (!contentDownloaded && !excludeType && types.length > 0) {
						var categoryLayoutMappings = [];
						types.forEach(function (type) {
							var mapping = type.layoutMapping;
							if (mapping.data && mapping.data.length > 0) {
								var typeMappings = mapping.data;
								// console.log(type.name);
								// console.log(JSON.stringify(typeMappings, null, 4));
								var categoryList = [];
								for (var j = 0; j < typeMappings.length; j++) {
									if (typeMappings[j].label) {
										var desktopLayout = typeMappings[j].formats && typeMappings[j].formats.desktop;
										var mobileLayout = typeMappings[j].formats && typeMappings[j].formats.mobile;
										if (desktopLayout) {
											categoryList.push({
												categoryName: typeMappings[j].label,
												layoutName: desktopLayout
											});
											if (!contentLayoutNames.includes(desktopLayout)) {
												contentLayoutNames.push(desktopLayout);
											}
										}
										if (mobileLayout) {
											categoryList.push({
												categoryName: typeMappings[j].label + '|mobile',
												layoutName: mobileLayout
											});
											if (!contentLayoutNames.includes(mobileLayout)) {
												contentLayoutNames.push(mobileLayout);
											}
										}
										if (!desktopLayout && !mobileLayout) {
											// default settings
											categoryList.push({
												categoryName: typeMappings[j].label,
												layoutName: ''
											});
										}
									}

								}
								categoryLayoutMappings.push({
									type: type.name,
									categoryList: categoryList
								});
							}
						});
						// console.log(' - content layouts: ' + contentLayoutNames);

						// create summary.json
						var summaryJson = {
							summary: {
								contentTypes: contentTypeNames,
								contentItems: []
							},
							categoryLayoutMappings: categoryLayoutMappings,
							layoutComponents: contentLayoutNames
						};
						if (!fs.existsSync(path.join(templatesSrcDir, name, 'assets'))) {
							fs.mkdirSync(path.join(templatesSrcDir, name, 'assets'));
						}
						if (!fs.existsSync(path.join(templatesSrcDir, name, 'assets', 'contenttemplate'))) {
							fs.mkdirSync(path.join(templatesSrcDir, name, 'assets', 'contenttemplate'));
						}
						var summaryPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate', 'summary.json');
						console.info(' - creating ' + summaryPath);
						fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));

						var folderPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate',
							'Content Template of ' + name);
						if (!fs.existsSync(folderPath)) {
							fs.mkdirSync(folderPath);
						}
						// create Summary.json
						var filePath = path.join(folderPath, 'Summary.json');
						var summaryJson = {
							'types': contentTypeNames.toString(),
							'template-name': 'Content Template of ' + name
						};
						fs.writeFileSync(filePath, JSON.stringify(summaryJson, null, 4));

						// create metadata.json
						filePath = path.join(folderPath, 'metadata.json');
						var metadataJson = {
							'template-name': 'Content Template of ' + name,
							'count': contentTypeNames.length,
							'varsetcount': 0,
							'groups': 1,
							'group0': contentTypeNames
						};
						fs.writeFileSync(filePath, JSON.stringify(metadataJson, null, 4));

						// create content types
						folderPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate',
							'Content Template of ' + name, 'ContentTypes');
						if (!fs.existsSync(folderPath)) {
							fs.mkdirSync(folderPath);
						}
						var customEditors = [];
						types.forEach(function (type) {
							var filePath = path.join(folderPath, type.name + '.json');
							// console.log(filePath);
							fs.writeFileSync(filePath, JSON.stringify(type, null, 4));

							var typeCustomEditors = type.properties && type.properties.customEditors || [];
							if (typeCustomEditors.length > 0) {
								customEditors = customEditors.concat(typeCustomEditors);
							}
						});

						if (customEditors.length > 0) {
							// save to summary.json
							var summaryPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate', 'summary.json');
							if (fs.existsSync(summaryPath)) {
								summaryJson = JSON.parse(fs.readFileSync(summaryPath));
								summaryJson.editorComponents = customEditors;
								fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));
							}
						}
					}

					// get components on template
					comps = serverUtils.getTemplateComponents(projectDir, name);

					// add content layouts
					contentLayoutNames.forEach(function (layoutName) {
						if (!comps.includes(layoutName)) {
							comps.push(layoutName);
						}
					});

					// get theme components
					var themeComps = serverUtils.getThemeComponents(projectDir, themeName);
					themeComps.forEach(function (comp) {
						if (!comps.includes(comp.id)) {
							comps.push(comp.id);
						}
					});

					console.info(' - ' + (excludeComponents ? 'exclude' : 'downloading') + ' components: ' + comps);

					var downloadCompsPromises = excludeComponents ? [] : [_downloadSiteComponents(server, comps, publishedversion)];

					return Promise.all(downloadCompsPromises);

				})
				.then(function (results) {
					var compsInfo = results && results[0] || [];

					return resolve({
						contentLayouts: contentLayoutNames,
						theme: themeInfo,
						components: compsInfo
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
	});
};

/**
 * If a template is created from a published site, theme and components, 
 * some files that originally from settings should be removed from the top folder
 */
var _cleanupPublishedTemplate = function (name, tempPath) {
	return new Promise(function (resolve, reject) {
		serverUtils.paths(tempPath, function (err, items) {
			var files = items.files;
			var folders = items.dirs;
			var idx = tempPath.length;
			files.forEach(function (file) {
				var fileName = file.substring(idx + 1);
				if (fileName.indexOf(path.sep) < 0) {
					// top level files
					// check if it's from settings / seo
					var settingsFile = false;
					for (var i = 0; i < folders.length; i++) {
						var folderName = folders[i].substring(idx + 1);
						var subfolders = folderName.split(path.sep);
						if (subfolders.includes('settings') && subfolders.includes('seo')) {
							// settings / seo folder
							if (files.includes(path.join(folders[i], fileName))) {
								settingsFile = true;
								break;
							}
						}
					}

					if (settingsFile) {
						// console.log(' - delete file ' + file);
						fileUtils.remove(file);
					}
				}
			});

			return resolve({});
		});
	});
};

var _downloadTheme = function (server, themeName, themeId, themeSrcPath, excludeFolders, publishedversion) {
	return new Promise(function (resolve, reject) {
		// download theme
		var downloadArgv = {
			path: 'theme:' + themeName,
			folder: themeSrcPath
		};
		console.info(' - downloading theme files');
		var excludeFolder = publishedversion ? [] : ['/publish'];
		if (excludeFolders && excludeFolders.length > 0) {
			excludeFolders.forEach(function (folder) {
				if (folder.indexOf('theme:') === 0) {
					var folderPath = folder.substring(6);
					if (!folderPath.startsWith('/')) {
						folderPath = '/' + folderPath;
					}
					if (!excludeFolder.includes(folderPath)) {
						excludeFolder.push(folderPath);
					}
				}
			});
		}
		var showError = true;
		var showDetail = false;
		_downloadResource(server, 'theme', themeId, themeName, publishedversion, themeSrcPath, showError, showDetail, excludeFolder)
			.then(function (result) {
				console.info(' - download theme files');

				return serverUtils.getThemeMetadata(server, themeId, themeName);

			}).then(function (result) {
				// get the theme identity in folder info
				var itemGUID = result && result.metadata && result.metadata.scsItemGUID || themeId;
				// console.log(' - theme ' + themeName + ' itemGUID: ' + itemGUID + ' id: ' + themeId);
				// create _folder.json for theme
				var folderJson = {
					themeName: themeName,
					itemGUID: itemGUID
				};
				fs.writeFileSync(path.join(themeSrcPath, '_folder.json'), JSON.stringify(folderJson));

				return resolve(folderJson);
			});
	});
};

var _downloadSiteComponents = function (server, compNames, publishedversion) {
	return new Promise(function (resolve, reject) {
		var comps = [];
		var downloadedComps = [];
		var returnComps = [];
		_downloadComponents(compNames, server, publishedversion)
			.then(function (result) {
				downloadedComps = result;

				// query components to get ids
				return _queryComponents(server, downloadedComps);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.info(' - query components');
				comps = result;

				var compFolderInfoPromises = [];
				for (var i = 0; i < comps.length; i++) {
					compFolderInfoPromises.push(serverUtils.getComponentMetadata(server, comps[i].id, comps[i].name));
				}

				return Promise.all(compFolderInfoPromises);

			})
			.then(function (results) {
				var compFolderInfo = results || [];

				// create _folder.json for all components
				for (var i = 0; i < comps.length; i++) {
					var itemGUID = comps[i].id;
					// get the component's identity 
					for (var j = 0; j < compFolderInfo.length; j++) {
						var compInfo = compFolderInfo[j];
						if (compInfo && compInfo.folderId === comps[i].id && compInfo.metadata.scsItemGUID) {
							itemGUID = compInfo.metadata.scsItemGUID;
							break;
						}
					}
					// console.log(' - component ' + comps[i].name + ' itemGUID: ' + itemGUID + ' id: ' + comps[i].id);

					// get the component's appType from appinfo.json
					// currently API /sites/management/api/v1/components does not return appType
					var appType = comps[i].appType;
					if (!appType && fs.existsSync(path.join(componentsSrcDir, comps[i].name, 'appinfo.json'))) {
						var appinfo;
						try {
							appinfo = JSON.parse(fs.readFileSync(path.join(componentsSrcDir, comps[i].name, 'appinfo.json')));
						} catch (e) {
							console.error('ERROR: component ' + comps[i].name + ' appinfo.json is invalid');
							// console.log(e);
						}
						if (appinfo && appinfo.type) {
							appType = appinfo.type;
						}
					}
					appType = appType || 'component';

					// console.log(' - name: ' + comps[i].name + ' type: ' + comps[i].type + ' appType: ' + appType);
					var folderJson = {
						itemGUID: itemGUID,
						appType: appType,
						appIconUrl: '',
						appIsHiddenInBuilder: comps[i].isHidden
					};
					// console.log(' - component ' + comps[i].name + ' itemGUID: ' + itemGUID);
					if (fs.existsSync(path.join(componentsSrcDir, comps[i].name))) {
						var folderPath = path.join(componentsSrcDir, comps[i].name, '_folder.json');
						fs.writeFileSync(folderPath, JSON.stringify(folderJson));
					} else {
						console.error('ERROR: component ' + comps[i].name + ' not downloaded');
					}
					returnComps.push({
						name: comps[i].name,
						itemGUID: itemGUID
					});
				}

				return resolve(returnComps);
			});
	});
};

var _createLocalTemplateFromSiteUtil = function (argv, name, siteName, server, excludeContent, enterprisetemplate,
	excludeComponents, excludeTheme, excludeType, publishedassets, referencedassets, excludeFolders, publishedversion) {
	verifyRun(argv);

	return _createLocalTemplateFromSite(name, siteName, server, excludeContent, enterprisetemplate,
		excludeComponents, excludeTheme, excludeType, publishedassets, referencedassets,
		excludeFolders, publishedversion);
};

var _downloadContent = function (server, name, channelName, channelId, repositoryName, repositoryId, excludeType, publishedassets, assetGUIDS) {
	return new Promise(function (resolve, reject) {
		var assetSummaryJson;
		var assetContentTypes = [];
		var tempContentPath;

		var tempAssetPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate');
		tempContentPath = path.join(tempAssetPath, 'Content Template of ' + name);

		// download all content from the site channel
		contentUtils.downloadContent({
			projectDir: projectDir,
			server: server,
			channel: channelName,
			repositoryName: repositoryName,
			name: name + '_content',
			assetGUIDS: assetGUIDS,
			publishedassets: publishedassets,
			requiredContentPath: tempAssetPath,
			requiredContentTemplateName: 'Content Template of ' + name
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				// query content layout mapping for each type
				var summaryStr = fs.readFileSync(path.join(tempContentPath, 'Summary.json'));
				assetSummaryJson = JSON.parse(summaryStr);
				var contentTypes = assetSummaryJson && assetSummaryJson.types ? assetSummaryJson.types.split(',') : [];

				var typePromises = [];
				if (!excludeType) {
					for (var i = 0; i < contentTypes.length; i++) {
						if (contentTypes[i] !== 'DigitalAsset' && contentTypes[i] !== 'Recommendation') {
							typePromises.push(serverRest.getContentType({
								server: server,
								name: contentTypes[i],
								expand: 'layoutMapping'
							}));
							assetContentTypes.push(contentTypes[i]);
						}
					}
				}

				return Promise.all(typePromises);
			})
			.then(function (results) {

				var items = assetSummaryJson && assetSummaryJson.items ? assetSummaryJson.items.split(',') : [];
				var layoutComponents = [];
				var categoryLayoutMappings = [];
				var customEditors = [];

				if (!excludeType) {
					var types = results || [];

					types.forEach(function (type) {
						var mapping = type.layoutMapping;
						if (mapping.data && mapping.data.length > 0) {
							var typeMappings = mapping.data;
							// console.log(type.name);
							// console.log(JSON.stringify(typeMappings, null, 4));
							var categoryList = [];
							for (var j = 0; j < typeMappings.length; j++) {
								if (typeMappings[j].label) {
									var desktopLayout = typeMappings[j].formats && typeMappings[j].formats.desktop;
									var mobileLayout = typeMappings[j].formats && typeMappings[j].formats.mobile;
									if (desktopLayout) {
										categoryList.push({
											categoryName: typeMappings[j].label,
											layoutName: desktopLayout
										});
										if (!layoutComponents.includes(desktopLayout)) {
											layoutComponents.push(desktopLayout);
										}
									}
									if (mobileLayout) {
										categoryList.push({
											categoryName: typeMappings[j].label + '|mobile',
											layoutName: mobileLayout
										});
										if (!layoutComponents.includes(mobileLayout)) {
											layoutComponents.push(mobileLayout);
										}
									}
									if (!desktopLayout && !mobileLayout) {
										// default settings
										categoryList.push({
											categoryName: typeMappings[j].label,
											layoutName: ''
										});
									}
								}
							}
							categoryLayoutMappings.push({
								type: type.name,
								categoryList: categoryList
							});
						}
					});

					customEditors = _getCustomEditors(tempContentPath);
				}

				// create summary.json
				var summaryJson = {
					summary: {
						contentTypes: assetContentTypes,
						contentItems: items
					},
					categoryLayoutMappings: categoryLayoutMappings,
					layoutComponents: layoutComponents,
					editorComponents: customEditors
				};
				var summaryPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate', 'summary.json');
				fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));

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

var _getCustomEditors = function (tempContentPath) {
	var editors = [];
	var typesPath = path.join(tempContentPath, 'ContentTypes');
	if (fs.existsSync(typesPath)) {
		var types = fs.readdirSync(typesPath);
		types.forEach(function (fileName) {
			if (serverUtils.endsWith(fileName, '.json')) {
				var typeObj = JSON.parse(fs.readFileSync(path.join(typesPath, fileName)));
				var typeCustomEditors = typeObj.properties && typeObj.properties.customEditors || [];
				if (typeCustomEditors.length > 0) {
					editors = editors.concat(typeCustomEditors);
				}
			}
		});
	}
	// console.log(' - template: ' + tempContentPath + ' editors: ' + editors);
	return editors;
};

var _getCustomForms = function (tempContentPath) {
	var forms = [];
	var typesPath = path.join(tempContentPath, 'ContentTypes');
	if (fs.existsSync(typesPath)) {
		var types = fs.readdirSync(typesPath);
		types.forEach(function (fileName) {
			if (serverUtils.endsWith(fileName, '.json')) {
				var typeObj = JSON.parse(fs.readFileSync(path.join(typesPath, fileName)));
				var typeCustomForms = typeObj.properties && typeObj.properties.customForms || [];
				if (typeCustomForms.length > 0) {
					forms.push({
						type: typeObj.name,
						customForms: typeCustomForms
					});
				}
			}
		});
	}
	return forms;
};


var _queryComponents = function (server, compNames) {
	return new Promise(function (resolve, reject) {
		var comps = [];
		var compsPromises = [];
		compNames.forEach(function (compName) {

			compsPromises.push(sitesRest.getComponent({
				server: server,
				name: compName,
				showInfo: false
			}));

		});
		Promise.all(compsPromises).then(function (results) {
			var allComps = results || [];

			for (var i = 0; i < compNames.length; i++) {
				for (var j = 0; j < allComps.length; j++) {

					if (compNames[i] === allComps[j].name) {
						comps.push({
							id: allComps[j].id,
							name: allComps[j].name,
							type: allComps[j].type,
							isHidden: allComps[j].isHidden ? '1' : '0'
						});
					}

				}
			}
			// console.log(JSON.stringify(comps, null, 4));
			return resolve(comps);
		})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
};

var _downloadComponents = function (comps, server, publishedversion) {
	return new Promise(function (resolve, reject) {
		var total = comps.length;
		console.info(' - total number of components: ' + total);
		var compData = [];

		var doDownloadComp = comps.reduce(function (compPromise, param) {
			return compPromise.then(function (result) {
				// console.log(' - downloading component ' + param);
				var compSrcPath = path.join(componentsSrcDir, param);
				if (!fs.existsSync(compSrcPath)) {
					fs.mkdirSync(compSrcPath);
				}

				var downloadArgv = {
					path: 'component:' + param,
					folder: compSrcPath
				};
				var excludeFolder = publishedversion ? [] : ['/publish'];
				var compId;
				var showError = false;
				var showDetail = false;
				return _downloadResource(server, 'component', compId, param, publishedversion, compSrcPath, showError, showDetail, excludeFolder)
					.then(function (result) {
						if (result && result.err) {
							fileUtils.remove(compSrcPath);
						} else {
							console.info(' - download component ' + param);
							compData.push(param);
						}
					})
					.catch((error) => {
						if (error) {
							console.log(error);
						}
						// the component does not exist or is seeded
						// console.log(' - component ' + param + ' not found');
						fileUtils.remove(compSrcPath);
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doDownloadComp.then(function (result) {
			// console.log(' - total number of downloaded files: ' + fileData.length);
			resolve(compData);
		});

	});
};

//
// Download artifacts for site, theme or components
//
var _downloadResource = function (server, type, id, name, publishedversion, targetPath, showError, showDetail, excludeFolder) {
	return new Promise(function (resolve, reject) {

		if (publishedversion) {
			var getCompPromises = [];
			if (type === 'component') {
				getCompPromises.push(sitesRest.getComponent({
					server: server,
					name: name,
					showError: false,
					showInfo: false
				}));
			}

			var resourceId = id;
			var settingsExist = false;

			Promise.all(getCompPromises)
				.then(function (results) {
					if (!id) {
						resourceId = results && results[0] && results[0].id;
					}
					if (!resourceId) {
						// console.log('ERROR: ' + type + ' ' + name + ' is not found');
						return Promise.reject();
					}

					// get top level files
					return serverRest.getChildItems({
						server: server,
						parentID: resourceId,
						limit: 9999
					});
				})
				.then(function (result) {
					var items = result && result.items || [];
					var downloadTopFilesPromises = [];

					items.forEach(function (item) {
						if (item.type === 'file') {
							var targetFile = path.join(targetPath, item.name);
							downloadTopFilesPromises.push(serverRest.downloadFileSave({
								server: server,
								fFileGUID: item.id,
								saveTo: targetFile
							}));
						} else if (item.type === 'folder') {
							if (item.name === 'settings') {
								settingsExist = true;
							}
						}
					});

					return Promise.all(downloadTopFilesPromises);
				})
				.then(function (results) {

					// download content and settings folder for site
					var downloadSettingsPromises = [];
					if (type === 'site') {
						if (settingsExist && !excludeFolder.includes('/settings')) {
							var settingsPath = path.join(targetPath, 'settings');
							if (!fs.existsSync(settingsPath)) {
								fs.mkdirSync(settingsPath);
							}

							var downloadSettingsArgv = {
								path: type + ':' + name + '/settings',
								folder: settingsPath
							};

							var settingsExcludeFolder = [];
							excludeFolder.forEach(function (folder) {
								if (folder.indexOf('/settings') === 0) {
									settingsExcludeFolder.push(folder.substring(1));
								}
							});

							downloadSettingsPromises.push(documentUtils.downloadFolder(downloadSettingsArgv, server, showError, false, settingsExcludeFolder));
						}
					}

					return Promise.all(downloadSettingsPromises);

				})
				.then(function (results) {

					// download publish folder and place at the top of the resource
					var downloadArgv = {
						path: type + ':' + name + '/publish',
						folder: targetPath
					};

					// If user specifies site:content, we will exclude publish/content
					var publishExcludeFolder = [];
					excludeFolder.forEach(function (folder) {
						publishExcludeFolder.push('publish' + folder);
					});
					return documentUtils.downloadFolder(downloadArgv, server, showError, showDetail, publishExcludeFolder);

				})
				.then(function (result) {

					resolve({});

				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					resolve({
						err: 'err'
					});
				});

		} else {
			var downloadArgv = {
				path: type + ':' + name,
				folder: targetPath
			};

			return documentUtils.downloadFolder(downloadArgv, server, showError, showDetail, excludeFolder)
				.then(function (result) {
					resolve(result);
				});
		}

	});
};

module.exports.createTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var tempName = argv.name;
	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (tempName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(path.join(templatesSrcDir, tempName))) {
			console.error('ERROR: A template with the name ' + tempName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	var siteName = argv.site;
	if (siteName) {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}
		var publishedversion = typeof argv.publishedversion === 'string' && argv.publishedversion.toLowerCase() === 'true';
		var publishedassets = typeof argv.publishedassets === 'string' && argv.publishedassets.toLowerCase() === 'true';
		var referencedassets = typeof argv.referencedassets === 'string' && argv.referencedassets.toLowerCase() === 'true';
		var excludeContent = typeof argv.excludecontent === 'string' && argv.excludecontent.toLowerCase() === 'true';
		var excludeComponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';
		var enterprisetemplate = typeof argv.enterprisetemplate === 'string' && argv.enterprisetemplate.toLowerCase() === 'true';
		var excludeTheme = false;
		var excludeType = false;
		var excludeFolders = argv.excludefolders ? argv.excludefolders.split(',') : [];

		_createLocalTemplateFromSite(argv.name, siteName, server, excludeContent, enterprisetemplate,
			excludeComponents, excludeTheme, excludeType, publishedassets, referencedassets, excludeFolders, publishedversion)
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					console.log(' - create template');
					console.log('*** template is ready to test: http://localhost:8085/templates/' + tempName);
					done(true);
				}
				return;
			});
	} else {

		var srcTempName = argv.source,
			template = '',
			seededTemplates = getContents(templatesDataDir);

		// verify the source template
		for (var i = 0; i < seededTemplates.length; i++) {
			// console.log('seeded template: ' + seededTemplates[i]);
			if (srcTempName + '.zip' === seededTemplates[i]) {
				template = seededTemplates[i];
				break;
			}
		}
		if (!template) {
			console.error('ERROR: invalid template ' + srcTempName);
			done();
			return;
		}

		console.info('Create Template: creating new template ' + tempName + ' from ' + srcTempName);
		var unzipPromise = unzipTemplate(tempName, path.resolve(templatesDataDir + '/' + template), true);
		unzipPromise.then(function (result) {
			// update _folder.json 
			var filePath = path.join(templatesSrcDir, tempName, '_folder.json');
			if (fs.existsSync(filePath)) {
				var infoJson = JSON.parse(fs.readFileSync(filePath));
				if (infoJson && infoJson.hasOwnProperty('isStarterTemplate')) {
					infoJson.isStarterTemplate = 'false';
					fs.writeFileSync(filePath, JSON.stringify(infoJson));
				}
			}
			done(true);
		});
	}
};

module.exports.importTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (typeof argv.path !== 'string') {
		console.error('ERROR: please specify the template zip file');
		done();
		return;
	}
	var tempPath = argv.path;
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join(projectDir, tempPath);
	}
	tempPath = path.resolve(tempPath);

	if (!fs.existsSync(tempPath)) {
		console.error('ERROR: file ' + tempPath + ' does not exist');
		done();
		return;
	}

	var tempName = tempPath.substring(tempPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	console.info('Import Template: importing template name=' + tempName + ' path=' + tempPath);
	var unzipPromise = unzipTemplate(tempName, tempPath, false);
	unzipPromise.then(function (result) {
		done(true);
	});
};

module.exports.exportTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please run as npm run export-template -- --template <template> [--minify <true|false>]');
		done();
		return;
	}

	var optimize = typeof argv.minify === 'string' && argv.minify.toLowerCase() === 'true';

	var name = argv.template,
		tempExist = false,
		templates = getContents(templatesSrcDir);
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

	_exportTemplate(name, optimize).then(function (result) {
		var zipfile = result && result.zipfile;
		if (fs.existsSync(zipfile)) {
			console.log('The template exported to ' + zipfile);
			done(true);
		} else {
			done();
		}
	});

};

gulp.task('minify-template-css', function (done) {
	'use strict';

	if (templateName) {
		var tempBuildDir = path.join(templatesBuildDir, templateName);
		console.info(' - minify CSS files');
		gulp.src(tempBuildDir + '/**/*.css', {
			base: tempBuildDir
		})
			.pipe(cleanCSS({
				debug: true
			}, (details) => {
				// console.log(details.name + ': ' + details.stats.originalSize + ' => ' + details.stats.minifiedSize);
			}))
			.pipe(gulp.dest(tempBuildDir))
			.on('end', done);
	}
});

gulp.task('create-no-content-template-zip', function (done) {
	'use strict';

	if (templateName) {
		var tempBuildDir = path.join(templatesBuildDir, templateName);

		gulp.src(tempBuildDir + '/**', {
			buffer: false
		})
			.pipe(zip(templateName + '.zip', {
				buffer: false
			}))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', done);
	}
});

gulp.task('create-template-zip', function (done) {
	'use strict';

	if (templateName && templateBuildContentDirBase && templateBuildContentDirName) {
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			tempBuildDir = path.join(templatesBuildDir, templateName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');

		gulp.src([tempBuildDir + '/**', '!' + contentdir, '!' + contentdir + '/**', '!' + metainfbuilddir, '!' + metainfbuilddir + '/**'], {
			buffer: false
		})
			.pipe(zip(templateName + '.zip', {
				buffer: false
			}))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', done);
	}
});

gulp.task('create-template-export-zip', function (done) {
	'use strict';

	if (templateBuildContentDirBase && templateBuildContentDirName) {
		console.info(' - content export.zip');
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');
		return gulp.src([contentdir + '/**', metainfbuilddir + '/**'], {
			base: templateBuildContentDirBase
		})
			.pipe(zip('export.zip', {
				buffer: false
			}))
			.pipe(gulp.dest(path.join(templateBuildContentDirBase)))
			.on('end', done);
	}
});

module.exports.copyTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var useserver = argv.server ? true : false;
	var serverName;
	var server;
	if (useserver) {
		serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
		server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}
	}

	var srcTempName = argv.source,
		tempName = argv.name,
		template = '',
		existingTemplates = getContents(templatesSrcDir);

	if (!srcTempName && !tempName) {
		console.error('ERROR: please run as npm run copy-template -- --source <source template> --name <new template name>');
		done();
		return;
	}
	if (!srcTempName) {
		console.error('ERROR: please use --source to specify the source template');
		done();
		return;
	}
	if (!tempName) {
		console.error('ERROR: please use --name to specify the new template name');
		done();
		return;
	}

	if (!useserver) {
		// verify the source template
		for (var i = 0; i < existingTemplates.length; i++) {
			if (srcTempName === existingTemplates[i]) {
				template = existingTemplates[i];
				break;
			}
		}
		if (!template) {
			console.error('ERROR: invalid local template ' + srcTempName);
			done();
			return;
		}

		var themeName = tempName + 'Theme';

		// verify the new template name 
		var re = /^[a-z0-9_-]+$/ig;
		if (tempName.search(re) === -1) {
			console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
			done();
			return;
		} else {
			if (fs.existsSync(path.join(templatesSrcDir, tempName))) {
				console.error('ERROR: A template with the name ' + tempName + ' already exists. Please specify a different name.');
				done();
				return;
			}
			// check theme name 
			if (fs.existsSync(path.join(themesSrcDir, themeName))) {
				console.error('ERROR: A theme with the name ' + themeName + ' already exists. Please specify a different template name.');
				done();
				return;
			}
		}

		console.info('Copy Template: creating new template ' + tempName + ' from ' + srcTempName);

		var siteinfofile = path.join(templatesSrcDir, srcTempName, 'siteinfo.json');
		if (!fs.existsSync(siteinfofile)) {
			console.error('ERROR: template file siteinfo.json is missing');
			done();
			return;
		}

		// get the theme
		var siteinfostr = fs.readFileSync(siteinfofile),
			siteinfojson = JSON.parse(siteinfostr),
			srcThemeName = '';
		if (siteinfojson && siteinfojson.properties) {
			srcThemeName = siteinfojson.properties.themeName;
		}

		if (!srcThemeName) {
			console.error('ERROR: no theme is defined for the source template ' + srcTempName);
			done();
			return;
		}

		// copy template files
		fse.copySync(path.join(templatesSrcDir, srcTempName), path.join(templatesSrcDir, tempName));

		// update itemGUID for the new template
		serverUtils.updateItemFolderJson(projectDir, 'template', tempName, 'siteName', tempName);

		// update the content dir if exists
		var contentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', 'Content Template of ' + srcTempName);
		if (fs.existsSync(contentdir)) {
			var newname = 'Content Template of ' + tempName,
				newcontentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', newname);
			fs.renameSync(contentdir, newcontentdir);
			console.info(' - update content dir to ' + newname);
		}

		// copy theme files
		fse.copySync(path.join(themesSrcDir, srcThemeName), path.join(themesSrcDir, themeName));

		// update itemGUID for the new theme
		serverUtils.updateItemFolderJson(projectDir, 'theme', themeName, 'themeName', themeName);

		// update the siteName and themeName in siteinfo.json for the new template
		siteinfofile = path.join(templatesSrcDir, tempName, 'siteinfo.json');
		if (fs.existsSync(siteinfofile)) {
			var siteinfostr = fs.readFileSync(siteinfofile),
				siteinfojson = JSON.parse(siteinfostr);
			if (siteinfojson && siteinfojson.properties) {
				console.info(' - update template themeName to ' + themeName + ' in siteinfo.json');
				siteinfojson.properties.themeName = themeName;
				siteinfojson.properties.siteName = tempName;
				fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
			}
		}

		console.log(' *** template is ready to test: ' + serverURL + '/templates/' + tempName);
		done(true);

	} else {
		console.info(' - copy template on OCM server');
		var description = argv.description;

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			sitesRest.getTemplate({
				server: server,
				name: srcTempName
			})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						return Promise.reject();
					}

					var srcTemplate = result;
					console.info(' - validate source template (Id: ' + srcTemplate.id + ')');

					return sitesRest.copyTemplate({
						server: server,
						srcId: srcTemplate.id,
						srcName: srcTemplate.name,
						name: tempName,
						description: description
					});

				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					return sitesRest.getTemplate({
						server: server,
						name: tempName
					});
				})
				.then(function (result) {
					if (result && result.id) {
						console.log(' - template copied (Id: ' + result.id + ' name: ' + result.name + ')');
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

	}
};

module.exports.deployTemplate = function (argv, done) {
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

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please run as npm run deploy-template -- --template <template> [--minify <true|false>]');
		done();
		return;
	}

	var optimize = typeof argv.minify === 'string' && argv.minify.toLowerCase() === 'true';
	var excludeContentTemplate = argv.excludecontenttemplate;
	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';
	var excludeComponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';
	var excludeTheme = typeof argv.excludetheme === 'string' && argv.excludetheme.toLowerCase() === 'true';

	var name = argv.template,
		tempExist = false,
		templates = getContents(templatesSrcDir);
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

	var folder = argv.folder && argv.folder.toString();
	if (folder === '/') {
		folder = '';
	} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
		console.error('ERROR: invalid folder');
		done();
		return;
	}

	// find out the theme
	var themeName = serverUtils.getTemplateTheme(projectDir, name);

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var newTheme;

		sitesRest.resourceExist({
			server: server,
			type: 'themes',
			name: themeName
		})
			.then(function (result) {
				if (result && result.id) {
					console.info(' - theme ' + themeName + ' exists on server');
				} else {
					if (excludeTheme) {
						console.info(' - theme does not exist on server and will not exclude the theme');
						excludeTheme = false;
					}
				}

				var createThemePromises = [];
				if (excludeTheme) {
					createThemePromises.push(serverUtils.createDefaultTheme(projectDir));
				}
				return Promise.all(createThemePromises);

			})
			.then(function (results) {

				if (excludeTheme) {
					newTheme = results && results[0];
				}

				console.info(' - exporting template ...');
				var extraComponents = [];
				var excludeSiteContent = false;
				return _exportTemplate(name, optimize, excludeContentTemplate, extraComponents, excludeSiteContent, excludeComponents, newTheme);

			})
			.then(function (result) {
				var zipfile = result && result.zipfile;
				if (!fs.existsSync(zipfile)) {
					console.error('ERROR: file ' + zipfile + ' does not exist');
					return Promise.reject();
				}
				console.info(' - template exported to ' + zipfile);

				// import the template to the server
				return _importTemplateToServerRest(server, name, folder, zipfile);

			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				// query the template
				return sitesRest.getTemplate({
					server: server,
					name: name
				});

			})
			.then(function (result) {
				if (result.err || !result.id) {
					return Promise.reject();
				}

				var template = result;
				console.info(' - template id: ' + template.id);

				var updateThemePromise = [];
				if (excludeTheme) {
					updateThemePromise.push(sitesRest.setSiteTheme(
						{
							server: server,
							site: template,
							themeName: themeName
						}));
				}

				return Promise.all(updateThemePromise);

			})
			.then(function (results) {
				var deleteThemePromises = [];
				if (excludeTheme) {
					if (results && results[0] && !results[0].err) {
						console.info(' - set template theme back to ' + themeName);
					}

					deleteThemePromises.push(sitesRest.deleteTheme({
						server: server,
						name: newTheme.name,
						hard: true,
						showError: false
					}));
				}

				return Promise.all(deleteThemePromises);

			})
			.then(function (result) {
				if (publish) {
					// get components on the pages and the components included in the theme
					var tempComps = serverUtils.getTemplateComponents(projectDir, name);
					var themeComps = serverUtils.getThemeComponents(projectDir, themeName);
					themeComps.forEach(function (comp) {
						if (!tempComps.includes(comp.id)) {
							tempComps.push(comp.id);
						}
					});

					// fileter out none-custom components
					var comps = [];
					tempComps.forEach(function (compName) {
						if (fs.existsSync(path.join(componentsSrcDir, compName, 'appinfo.json'))) {
							comps.push(compName);
						}
					});

					var publishThemePromises = [];
					if (themeName) {
						console.info(' - publishing theme ...');
						publishThemePromises.push(sitesRest.publishTheme({
							server: server,
							name: themeName
						}));
					}

					Promise.all(publishThemePromises)
						.then(function (results) {
							if (themeName && results && results[0] && !results[0].err) {
								console.log(' - theme ' + themeName + ' published');
							}

							// console.log(' - components ' + comps);
							_publishComponents(server, comps).then(function (result) {
								done(true);
							});
						});

				} else {
					done(true);
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

var _publishComponents = function (server, comps) {
	return new Promise(function (resolve, reject) {
		var startTime;
		var doPublishComps = comps.reduce(function (publishPromise, compName) {
			return publishPromise.then(function (result) {
				startTime = new Date();
				return sitesRest.publishComponent({
					server: server,
					name: compName,
					hideAPI: true,
					async: true
				})
					.then(function (result) {
						if (!result.err) {
							// console.log(' - component ' + compName + ' published [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							console.log(' - component ' + compName + ' published');
						}
						resolve(result);
					});
			});
		},
			Promise.resolve({})
		);

		doPublishComps.then(function (result) {
			resolve(result);
		});
	});
};

// Display the properties of a template on OCM server
var _displayServerTemplate = function (server, name, output) {
	return new Promise(function (resolve, reject) {
		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			sitesRest.getTemplate({
				server: server,
				name: name,
				expand: 'all'
			})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						return Promise.reject();
					}

					if (output) {
						fs.writeFileSync(output, JSON.stringify(result, null, 4));
						console.log(' - template properties saved to ' + output);
					}

					var temp = result;
					var managers = [];
					var contributors = [];
					var downloaders = [];
					var viewers = [];
					var members = temp.members && temp.members.items || [];
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

					var format1 = '%-38s  %-s';
					console.log('');
					console.log(sprintf(format1, 'Id', temp.id));
					console.log(sprintf(format1, 'Name', temp.name));
					console.log(sprintf(format1, 'Author', temp.author));
					console.log(sprintf(format1, 'Short description', temp.description || ''));
					console.log(sprintf(format1, 'Long description', temp.longDescription || ''));
					console.log(sprintf(format1, 'Owner', temp.ownedBy ? (temp.ownedBy.displayName || temp.ownedBy.name) : ''));
					console.log(sprintf(format1, 'Members', memberLabel));
					console.log(sprintf(format1, 'Created', temp.createdAt + ' by ' + (temp.createdBy ? (temp.createdBy.displayName || temp.createdBy.name) : '')));
					console.log(sprintf(format1, 'Updated', temp.lastModifiedAt + ' by ' + (temp.lastModifiedBy ? (temp.lastModifiedBy.displayName || temp.lastModifiedBy.name) : '')));
					console.log(sprintf(format1, 'Type', (temp.isEnterprise ? 'Enterprise' : 'Standard')));
					console.log(sprintf(format1, 'Localization policy', temp.localizationPolicy ? temp.localizationPolicy.name : ''));
					console.log(sprintf(format1, 'Default language', temp.defaultLanguage || ''));
					console.log(sprintf(format1, 'Theme', temp.themeName));

					console.log('');
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
	});
};

module.exports.describeTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please specify template');
		done();
		return;
	}

	var useserver = argv.server ? true : false;
	var serverName;
	var server;
	if (useserver) {
		//
		// server template
		//
		serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
		server = serverUtils.verifyServer(serverName, projectDir);
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

		_displayServerTemplate(server, argv.template, output)
			.then(function (result) {
				done(result && !result.err);
				return;
			});

	} else {

		// 
		// local template
		//

		var name = argv.template,
			tempExist = false,
			templates = getContents(templatesSrcDir);
		for (var i = 0; i < templates.length; i++) {
			if (name === templates[i]) {
				tempExist = true;
				break;
			}
		}
		if (!tempExist) {
			console.error('ERROR: local template ' + name + ' does not exist');
			done();
			return;
		}

		console.log('Name:  ' + name);

		var tempSrcDir = path.join(templatesSrcDir, name);

		// get the used theme
		var siteinfofile = path.join(tempSrcDir, 'siteinfo.json'),
			themeName = '';
		if (fs.existsSync(siteinfofile)) {
			var siteinfostr = fs.readFileSync(siteinfofile),
				siteinfojson = JSON.parse(siteinfostr);
			if (siteinfojson && siteinfojson.properties) {
				themeName = siteinfojson.properties.themeName;
			}
		}
		console.log('Theme: ' + themeName);

		// custom components
		var comps = serverUtils.getTemplateComponents(projectDir, name);
		console.log('Components used in the template:');
		if (comps) {
			comps.forEach(function (name) {
				if (fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
					console.log('    ' + name);
				}
			});
		}

		// theme components
		console.log('Theme components:');
		var themeComps = serverUtils.getThemeComponents(projectDir, themeName);
		themeComps.forEach(function (comp) {
			console.log('    ' + comp.id);
		});


		// Content types
		console.log('Content types:');
		var alltypes = serverUtils.getContentTypes(projectDir);
		for (var i = 0; i < alltypes.length; i++) {
			if (name === alltypes[i].template) {
				console.log('    ' + alltypes[i].type.name);
			}
		}

		// Content layout mapping
		console.log('Content Type mappings:');
		var contentmapfile = path.join(tempSrcDir, 'assets', 'contenttemplate', 'summary.json');
		if (fs.existsSync(contentmapfile)) {
			var summaryjson = JSON.parse(fs.readFileSync(contentmapfile));
			var contenttypes = summaryjson.categoryLayoutMappings || summaryjson.contentTypeMappings || [];
			for (var i = 0; i < contenttypes.length; i++) {
				var j;
				var ctype = contenttypes[i];
				console.log('    ' + ctype.type + ':');
				var mappings = [],
					defaultLayout,
					conentListDefault,
					emptyListDefault,
					contentPlaceholderDefault;
				for (j = 0; j < ctype.categoryList.length; j++) {
					var layoutName = ctype.categoryList[j].layoutName,
						categoryName = ctype.categoryList[j].categoryName;
					if (layoutName) {
						if (categoryName === 'Default') {
							defaultLayout = {
								'layoutName': layoutName,
								'categoryName': 'Content Item Default'
							};
						} else if (categoryName === 'Content List Default') {
							conentListDefault = {
								'layoutName': layoutName,
								'categoryName': categoryName
							};
						} else if (categoryName === 'Empty Content List Default') {
							emptyListDefault = {
								'layoutName': layoutName,
								'categoryName': categoryName
							};
						} else if (categoryName === 'Content Placeholder Default') {
							contentPlaceholderDefault = {
								'layoutName': layoutName,
								'categoryName': categoryName
							};
						} else {
							mappings[mappings.length] = {
								'layoutName': layoutName,
								'categoryName': categoryName
							};
						}
					}
				}

				if (mappings.length > 0) {
					var byName = mappings.slice(0);
					byName.sort(function (a, b) {
						var x = a.categoryName;
						var y = b.categoryName;
						return (x < y ? -1 : x > y ? 1 : 0);
					});
					mappings = byName;
				}

				console.log('        Content Layout:');
				if (defaultLayout) {
					console.log('            ' + defaultLayout.categoryName + ' => ' + defaultLayout.layoutName);
				}
				if (conentListDefault) {
					console.log('            ' + conentListDefault.categoryName + ' => ' + conentListDefault.layoutName);
				}
				if (emptyListDefault) {
					console.log('           ' + emptyListDefault.categoryName + ' => ' + emptyListDefault.layoutName);
				}
				if (contentPlaceholderDefault) {
					console.log('            ' + contentPlaceholderDefault.categoryName + ' => ' + contentPlaceholderDefault.layoutName);
				}
				for (j = 0; j < mappings.length; j++) {
					console.log('            ' + mappings[j].categoryName + ' => ' + mappings[j].layoutName);
				}

				var editorList = ctype.editorList || [];
				if (editorList.length > 0) {
					console.log('        Editors:');
					for (j = 0; j < editorList.length; j++) {
						console.log('            ' + editorList[j].editorName);
					}
				}
			}
		}

		// Content forms
		var typesRootPath = path.join(tempSrcDir, 'assets', 'contenttemplate', 'Content Template of ' + name);
		if (fs.existsSync(typesRootPath)) {
			var contentForms = _getCustomForms(typesRootPath);
			if (contentForms.length > 0) {
				console.log('Content Forms:');
				for (var j = 0; j < contentForms.length; j++) {
					console.log('    ' + contentForms[j].type + ': ' + contentForms[j].customForms);
				}
			}
		}

		done(true);
	}
};

module.exports.downloadTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}
	var name = argv.name;

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_downloadTemplateREST(server, name)
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
				}
				return;
			});

	}); // login
};

module.exports.deleteTemplate = function (argv, done) {
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

		_deleteTemplateREST(server, name, permanent, done);

	}); // login
};

module.exports.createTemplateFromSite = function (argv, done) {

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
		var name = argv.name;
		var siteName = argv.site;

		var includeUnpublishedAssets = typeof argv.includeunpublishedassets === 'string' && argv.includeunpublishedassets.toLowerCase() === 'true';
		var enterprisetemplate = typeof argv.enterprisetemplate === 'string' && argv.enterprisetemplate.toLowerCase() === 'true';

		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		_createTemplateFromSiteREST(server, name, siteName, includeUnpublishedAssets, enterprisetemplate)
			.then(function (result) {
				done(!result.err);
			});

	} catch (err) {
		console.error(err);
		_cmdEnd(done);
	}
};


module.exports.addThemeComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var component = argv.component,
		category = argv.category || '',
		theme = argv.theme;

	if (!component || !theme) {
		console.error('ERROR: please run as npm run add-theme-component -- --component <component> --theme <theme> [--category <category>]');
		done();
		return;
	}

	// Verify the component
	var compfolderfile = path.join(componentsSrcDir, component, '_folder.json');
	if (!fs.existsSync(compfolderfile)) {
		console.error('ERROR: Component ' + component + ' does not exist');
		done();
		return;
	}

	var compstr = fs.readFileSync(compfolderfile),
		compjson = JSON.parse(compstr),
		appType = compjson && compjson.appType;

	/* they are allowed in 20.3.1
	if (appType === 'sectionlayout') {
		console.error('ERROR: The section layout cannot be added to the theme');
		done();
		return;
	}
	if (appType === 'contentlayout') {
		console.error('ERROR: The content layout cannot be added to the theme');
		done();
		return;
	}
	if (appType === 'fieldeditor') {
		console.error('ERROR: The field editor cannot be added to the theme');
		done();
		return;
	}
	*/

	// Verify the theme
	var themefolderfile = path.join(themesSrcDir, theme, '_folder.json');
	if (!fs.existsSync(themefolderfile)) {
		console.error('ERROR: Theme ' + theme + ' does not exist');
		done();
		return;
	}

	var componentsjsonfile = path.join(themesSrcDir, theme, 'components.json'),
		comps = [];
	if (fs.existsSync(componentsjsonfile)) {
		var str = fs.readFileSync(componentsjsonfile).toString().trim(),
			filecontent = str ? JSON.parse(str) : [];
		if (filecontent && !Array.isArray(filecontent)) {
			comps = filecontent.components || [];
		} else {
			comps = filecontent;
		}
	}

	// Remove the component from the list
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			var newCompList = [];
			comp.list.forEach(function (listcomp) {
				if (listcomp.id !== component) {
					newCompList.push(listcomp);
				}
			});
			comp.list = newCompList;
		}
	});

	// Remove categories that do not have any component
	var newComps = [];
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			newComps.push(comp);
		}
	});

	// Add the component
	var added = false;
	newComps.forEach(function (comp) {
		var cate = comp.name;
		if (!cate && !category || cate && category && cate === category) {
			comp.list.push({
				type: appType,
				id: component,
				themed: true
			});
			added = true;
		}
	});

	if (!added) {
		// The category is new
		newComps.push({
			name: category,
			list: [{
				type: appType,
				id: component,
				themed: true
			}]
		});
	}
	// console.log(newComps);

	// Write to the file
	fs.writeFileSync(componentsjsonfile, JSON.stringify(newComps));

	console.log(' - Component ' + component + ' added to theme ' + theme);
	done(true);
};

module.exports.removeThemeComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var component = argv.component,
		theme = argv.theme;

	if (!component || !theme) {
		console.error('ERROR: please run as npm run remove-theme-component -- --component <component> --theme <theme>');
		done();
		return;
	}

	// Verify the component
	var compfolderfile = path.join(componentsSrcDir, component, '_folder.json');
	if (!fs.existsSync(compfolderfile)) {
		console.error('ERROR: Component ' + component + ' does not exist');
		done();
		return;
	}

	// Verify the theme
	var themefolderfile = path.join(themesSrcDir, theme, '_folder.json');
	if (!fs.existsSync(themefolderfile)) {
		console.error('ERROR: Theme ' + theme + ' does not exist');
		done();
		return;
	}

	var componentsjsonfile = path.join(themesSrcDir, theme, 'components.json');
	if (!fs.existsSync(componentsjsonfile)) {
		console.log(' - Component ' + component + ' is not associated with theme ' + theme);
		done();
		return;
	}

	var comps = [],
		str = fs.readFileSync(componentsjsonfile).toString().trim(),
		filecontent = str ? JSON.parse(str) : [];
	if (filecontent && !Array.isArray(filecontent)) {
		comps = filecontent.components || [];
	} else {
		comps = filecontent;
	}

	// Remove the component from the list
	var found = false;
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			var newCompList = [];
			comp.list.forEach(function (listcomp) {
				if (listcomp.id !== component) {
					newCompList.push(listcomp);
				} else {
					found = true;
				}
			});
			comp.list = newCompList;
		}
	});
	if (!found) {
		console.log(' - Component ' + component + ' is not associated with theme ' + theme);
		done();
		return;
	}

	// Remove categories that do not have any component
	var newComps = [];
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			newComps.push(comp);
		}
	});

	// Save to the file
	fs.writeFileSync(componentsjsonfile, JSON.stringify(newComps));

	console.log(' - Component ' + component + ' removed from theme ' + theme);
	done(true);
};

/** 
 * private
 * unzip template zip file and copy to /src
 */
var unzipTemplate = function (tempName, tempPath, useNewGUID) {
	var unzipPromise = new Promise(function (resolve, reject) {
		var createNew = tempPath.indexOf(tempName + '.zip') < 0;
		//console.log('name=' + tempName + ' path=' + tempPath + ' createNew=' + createNew);
		// create dirs in src
		var tempSrcDir = path.join(templatesSrcDir, tempName);
		console.info(' - the template will be at ' + tempSrcDir);
		fileUtils.remove(tempSrcDir);
		fs.mkdirSync(tempSrcDir);

		// unzip /src/templates/<temp name>/
		fileUtils.extractZip(tempPath, tempSrcDir)
			.then(function (err) {

				if (err) {
					console.error(err);
				}

				// get the theme name from theme/_folder.json 
				var themeName = '';
				if (createNew) {
					themeName = tempName + 'Theme';

				} else {
					if (fs.existsSync(path.join(tempSrcDir, 'theme', '_folder.json'))) {
						var themestr = fs.readFileSync(path.join(tempSrcDir, 'theme', '_folder.json')),
							themejson = JSON.parse(themestr),
							themeName = themejson && themejson.themeName || tempName + 'Theme';
					}
				}

				// create the theme dir
				var themeSrcDir = path.join(themesSrcDir, themeName);
				console.info(' - the theme for the template will be at ' + themeSrcDir);
				fileUtils.remove(themeSrcDir);

				// move theme to the themes dir
				fse.moveSync(path.join(tempSrcDir, 'theme'), themeSrcDir);

				// create soft links
				var currdir = process.cwd();
				try {
					if (fs.existsSync(path.join(themeSrcDir, 'layouts'))) {
						process.chdir(path.join(themeSrcDir, 'layouts'));
						fse.ensureSymlinkSync('..', '_scs_theme_root_');
						console.info(' - create link _scs_theme_root_');
					} else {
						console.info(' Path does not exist: ' + path.join(themeSrcDir, 'layouts'));
					}

					if (fs.existsSync(path.join(themeSrcDir, 'designs', 'default'))) {
						process.chdir(path.join(themeSrcDir, 'designs'));
						fse.ensureSymlinkSync('default', '_scs_design_name_');
						console.info(' - create link _scs_design_name_');
					} else {
						console.info(' Path does not exist: ' + path.join(themeSrcDir, 'designs', 'default'));
					}

					process.chdir(currdir);
				} catch (err) {
					console.error('ERROR: ' + err);
				}

				// move all files under /template up 
				var files = fs.readdirSync(path.join(tempSrcDir, 'template'));
				for (var i = 0; i < files.length; i++) {
					fse.moveSync(path.join(tempSrcDir, 'template', files[i]), path.join(tempSrcDir, files[i]), true);
				}
				fileUtils.remove(path.join(tempSrcDir, 'template'));

				if (fs.existsSync(path.join(tempSrcDir, 'components'))) {
					// move components to the components dir
					var comps = fs.readdirSync(path.join(tempSrcDir, 'components'));
					for (var i = 0; i < comps.length; i++) {
						if (fs.existsSync(path.join(componentsSrcDir, comps[i]))) {
							fileUtils.remove(path.join(componentsSrcDir, comps[i]));
							console.info(' - override component ' + componentsSrcDir + '/' + comps[i]);
						}
						fse.moveSync(path.join(tempSrcDir, 'components', comps[i]), path.join(componentsSrcDir, comps[i]), true);
					}
					fileUtils.remove(path.join(tempSrcDir, 'components'));
				}

				// make sure the correct theme name is set in siteinfo
				var siteinfofile = path.join(tempSrcDir, 'siteinfo.json');
				if (fs.existsSync(siteinfofile)) {
					var siteinfostr = fs.readFileSync(siteinfofile),
						siteinfojson = JSON.parse(siteinfostr);
					if (siteinfojson && siteinfojson.properties) {
						console.info(' - set themeName to ' + themeName + ' in siteinfo.json');
						siteinfojson.properties.themeName = themeName;
						siteinfojson.properties.siteName = tempName;
						fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
					}
				} else {
					// siteinfo.json does not exist (old templates), create one
					var siteinfojson = {
						properties: {
							themeName: themeName,
							siteName: tempName
						}
					};
					console.info(' - create siteinfo.json and set themeName to ' + themeName);
					fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
				}

				if (useNewGUID) {
					// update itemGUID for template and theme
					var templatefolderfile = path.join(tempSrcDir, '_folder.json'),
						themefolderfile = path.join(themeSrcDir, '_folder.json');

					// update template _folder.json
					if (fs.existsSync(templatefolderfile)) {
						var folderstr = fs.readFileSync(templatefolderfile),
							folderjson = JSON.parse(folderstr),
							oldGUID = folderjson.itemGUID,
							newGUID = serverUtils.createGUID();
						folderjson.itemGUID = newGUID;
						folderjson.siteName = tempName;
						console.info(' - update template GUID ' + oldGUID + ' to ' + newGUID);
						fs.writeFileSync(templatefolderfile, JSON.stringify(folderjson));
					}
					// update theme _folder.json
					if (fs.existsSync(themefolderfile)) {
						var folderstr = fs.readFileSync(themefolderfile),
							folderjson = JSON.parse(folderstr),
							oldGUID = folderjson.itemGUID,
							newGUID = serverUtils.createGUID();
						folderjson.itemGUID = newGUID;
						folderjson.themeName = themeName;
						console.info(' - update theme GUID ' + oldGUID + ' to ' + newGUID);
						fs.writeFileSync(themefolderfile, JSON.stringify(folderjson));
					}
				}

				// unzip content zip if exists
				var contentpath = path.join(tempSrcDir, 'assets', 'contenttemplate');
				var contentexportfile = path.join(contentpath, 'export.zip');
				if (fs.existsSync(contentexportfile)) {
					console.info(' - unzip template content file');
					fileUtils.extractZip(contentexportfile, contentpath)
						.then(function (err) {
							if (err) {
								console.error(err);
							}

							if (createNew) {
								// update the content dir if exists
								var items = fs.readdirSync(path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate'));
								for (var i = 0; i < items.length; i++) {
									if (items[i].indexOf('Content Template of ') === 0 && items[i] !== 'Content Template of ' + tempName) {
										// rename the dir
										var contentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', items[i]),
											newname = 'Content Template of ' + tempName,
											newcontentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', newname);
										fs.renameSync(contentdir, newcontentdir);
										// console.log(' - update content dir to ' + newname);
										break;
									}
								}
							}
							console.log(' *** template is ready to test: ' + serverURL + '/templates/' + tempName);
							return resolve({});
						});
				} else {
					console.log(' *** template is ready to test: ' + serverURL + '/templates/' + tempName);
					return resolve({});
				}
			});
	});
	return unzipPromise;
};

var unzipTemplateUtil = function (argv, tempName, tempPath, useNewGUID) {
	verifyRun(argv);
	return unzipTemplate(tempName, tempPath, useNewGUID);
};

/**
 * Private
 * Export a template
 */
var _exportTemplate = function (name, optimize, excludeContentTemplate, extraComponents,
	excludeSiteContent, excludeComponents, newTheme) {

	return new Promise(function (resolve, reject) {
		var tempSrcDir = path.join(templatesSrcDir, name),
			tempBuildDir = path.join(templatesBuildDir, name);

		fileUtils.remove(tempBuildDir);

		// copy template files to build dir: <template name>/template/
		fse.copySync(tempSrcDir, path.join(tempBuildDir, 'template'));
		console.info(' - template ' + name);

		// remove static folder 
		var staticBuidDir = path.join(tempBuildDir, 'template', 'static');
		if (fs.existsSync(staticBuidDir)) {
			console.log(' - exclude site static files');
			fileUtils.remove(staticBuidDir);
			// keep the empty folder
			fs.mkdirSync(staticBuidDir);
		}

		var exportfile = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate', 'export.zip');
		fileUtils.remove(exportfile);

		if (excludeSiteContent) {
			var siteContentBuidDir = path.join(tempBuildDir, 'template', 'content');
			if (fs.existsSync(siteContentBuidDir)) {
				console.info(' - exclude site content');
				fileUtils.remove(siteContentBuidDir);
			}
		}

		// get the used theme
		var siteinfofile = path.join(tempSrcDir, 'siteinfo.json'),
			siteinfojson;

		var themeName = '';
		var themeSrcDir;

		if (fs.existsSync(siteinfofile)) {
			var siteinfostr = fs.readFileSync(siteinfofile);
			siteinfojson = JSON.parse(siteinfostr);
			if (siteinfojson && siteinfojson.properties) {
				themeName = siteinfojson.properties.themeName;
			}
		}

		if (!themeName) {
			console.error('ERROR: no theme is found for template ' + name);
			return resolve({
				err: 'err'
			});
		}

		themeSrcDir = path.join(themesSrcDir, themeName);

		if (newTheme && newTheme.name && newTheme.srcPath) {
			themeName = newTheme.name;
			themeSrcDir = newTheme.srcPath;
		}

		if (!fs.existsSync(themeSrcDir)) {
			console.error('ERROR: theme path does not exist ' + themeSrcDir);
			return resolve({
				err: 'err'
			});
		}

		// copy theme files to build dir: <template name>/theme/
		fse.copySync(themeSrcDir, path.join(tempBuildDir, 'theme'));
		console.info(' - theme ' + themeName);

		// remove soft links
		try {
			fs.unlinkSync(path.join(tempBuildDir, 'theme', 'layouts', '_scs_theme_root_'));
		} catch (err) {
			if (err && err.code !== 'ENOENT') {
				console.error('ERROR: ' + err);
			}
		}
		try {
			fs.unlinkSync(path.join(tempBuildDir, 'theme', 'designs', '_scs_design_name_'));
		} catch (err) {
			if (err && err.code !== 'ENOENT') {
				console.error('ERROR: ' + err);
			}
		}

		// Optimize theme if requested
		if (optimize) {
			let themeBuildDir = path.join(tempBuildDir, 'theme'),
				themeGulpFile = path.join(themeBuildDir, 'gulpfile.js');

			if (fs.existsSync(themeGulpFile)) {
				// Run 'gulp' under the theme directory
				var themeBuild = childProcess.spawnSync(npmCmd, ['run', 'gulp', themeGulpFile], {
					stdio: 'inherit'
				});
				if (themeBuild.status) {
					// something went wrong with the build
					console.log(' - ERROR running theme gulp file: ' + themeGulpFile + ' status: ' + themeBuild.status);
				}
			} else {

				var files = getDirFiles(tempBuildDir);

				if (files) {
					var uglifyjs = require("uglify-js");
					files.forEach(function (name) {
						if (name.endsWith('.js')) {
							var orig = fs.readFileSync(name, {
								encoding: 'utf8'
							}),
								result = uglifyjs.minify(orig),
								uglified = result.code;
							if (result.error) {
								console.log(' - ERROR optiomizing JS File ' + name + result.error);
							} else {
								fs.writeFileSync(name, uglified);
								// console.log(' - Optimized JS File ' + name);
							}
						}
					});
				}
			}
		}

		if (excludeComponents) {
			console.info(' - exclude components');
		} else {
			// get all custom components used by the template
			var comps = serverUtils.getTemplateComponents(projectDir, name);

			// get the theme components
			var themeComps = serverUtils.getThemeComponents(projectDir, themeName);
			themeComps.forEach(function (comp) {
				if (!comps.includes(comp.id)) {
					comps[comps.length] = comp.id;
				}
			});

			if (extraComponents && extraComponents.length > 0) {
				extraComponents.forEach(function (comp) {
					if (!comps.includes(comp)) {
						comps.push(comp);
					}
				});
			}

			// create the components dir (required even the template doesn not have any custom component)
			fs.mkdirSync(path.join(tempBuildDir, 'components'));

			// Optimize components if requested
			if (optimize) {

				if (!fs.existsSync(componentsBuildDir)) {
					fse.mkdirpSync(componentsBuildDir);
				}

				// now run gulp on any component's gulp files
				for (var i = 0; i < comps.length; i++) {
					var compSrcDir = path.join(componentsSrcDir, comps[i]),
						compExist = fs.existsSync(compSrcDir) && fs.existsSync(path.join(compSrcDir, '_folder.json'));
					var componentsGulpFile = path.join(compSrcDir, 'gulpfile.js');
					if (compExist && fs.existsSync(componentsGulpFile)) {
						var compBuildSrc = path.join(componentsBuildDir, comps[i]);
						fileUtils.remove(compBuildSrc);

						fs.mkdirSync(compBuildSrc);

						fse.copySync(compSrcDir, compBuildSrc);

						console.info(' - optimize component ' + comps[i]);
						// Run 'gulp' under the theme directory
						var componentBuild = childProcess.spawnSync(npmCmd, ['run', 'gulp', componentsGulpFile], {
							stdio: 'inherit'
						});
						if (componentBuild.status) {
							// something went wrong with the build
							console.log(' - ERROR running component gulp file: ' + componentsGulpFile + ' status: ' + componentBuild.status);
						}
					}
				}

			}

			// copy customer components to buid dir: <template name>/components/
			for (var i = 0; i < comps.length; i++) {
				var compSrcDir = path.join(componentsSrcDir, comps[i]),
					compExist = fs.existsSync(compSrcDir) && fs.existsSync(path.join(compSrcDir, '_folder.json'));
				if (compExist) {
					var optimizePath = path.join(componentsBuildDir, comps[i]);
					var srcPath = optimize && fs.existsSync(optimizePath) ? optimizePath : compSrcDir;
					// console.log(' - copy component ' + comps[i] + ' from ' + srcPath);
					fse.copySync(srcPath, path.join(tempBuildDir, 'components', comps[i]));
					console.info(' - component ' + comps[i]);
				}
			}

		} // include components in the template

		// create the zip file
		var zipfile = path.join(projectDir, 'dist', name + '.zip');

		// delete the existing one
		fileUtils.remove(zipfile);

		var dirname = 'Content Template of ' + name,
			dirbase = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate'),
			contentdir = path.join(dirbase, dirname);

		// remove the content directory if it exists and should be excluded
		if (excludeContentTemplate && fs.existsSync(contentdir)) {
			console.info(' - exclude content template');
			fileUtils.remove(contentdir);
		}

		var generateZip;
		if (fs.existsSync(contentdir)) {
			templateName = name;
			templateBuildContentDirBase = dirbase;
			templateBuildContentDirName = dirname;

			generateZip = optimize ? gulp.series('minify-template-css', 'create-template-export-zip', 'create-template-zip') :
				gulp.series('create-template-export-zip', 'create-template-zip');
			generateZip(function () {
				return resolve({
					zipfile: zipfile
				});
			});

		} else {
			templateName = name;
			generateZip = optimize ? gulp.series('minify-template-css', 'create-no-content-template-zip') :
				gulp.series('create-no-content-template-zip');
			generateZip(function () {
				return resolve({
					zipfile: zipfile
				});
			});
		}

		return zipfile;
	});
};

var _exportTemplateUtil = function (argv, name, optimize, excludeContentTemplate, extraComponents,
	excludeSiteContent, excludeComponents, newTheme) {
	verifyRun(argv);
	return _exportTemplate(name, optimize, excludeContentTemplate, extraComponents, excludeSiteContent, excludeComponents, newTheme);
};

/**
 * Private
 * Import a template
 */
var _importTemplate = function (server, name, folder, zipfile, done) {

	return new Promise(function (resolve, reject) {

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			_importTemplateToServerRest(server, name, folder, zipfile).then(function (result) {
				if (result.err) {
					return resolve({
						err: 'err'
					});
				} else {
					return resolve({});
				}
			});
		});
	});
};


/**
 * Private
 * List all files in a dir
 */
var getDirFiles = function (dir, filelist) {
	var files = fs.readdirSync(dir);
	filelist = filelist || [];
	files.forEach(function (file) {
		if (fs.statSync(path.join(dir, file)).isDirectory()) {
			filelist = getDirFiles(path.join(dir, file), filelist);
		} else {
			filelist.push(path.join(dir, file));
		}
	});
	return filelist;
};

/**
 * Private
 * Get files/folders from given path
 */
var getContents = function (path) {
	"use strict";
	var contents = fs.readdirSync(path);
	return contents;
};

var _exportServerTemplate = function (server, idcToken, templateId, homeFolderGUID) {
	var exportPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_EXPORT_TEMPLATE_PACKAGE&IsJson=1';
		var formData = {
			'idcToken': idcToken,
			'LocalData': {
				'IdcService': 'SCS_EXPORT_TEMPLATE_PACKAGE',
				'item': 'fFolderGUID:' + templateId,
				'destination': 'fFolderGUID:' + homeFolderGUID
			}
		};

		var postData = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(formData)
		};
		if (server.cookies) {
			postData.headers.Cookie = server.cookies
		}

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to export template:');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) { }
			// console.log(JSON.stringify(data, null, 4));

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to export template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			} else {
				return resolve(data);
			}
		});
	});
	return exportPromise;
};


var _downloadServerFile = function (server, fFileGUID, fileName) {
	var downloadPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		var headers = {
			Authorization: serverUtils.getRequestAuthorization(server)
		};
		if (server.cookies) {
			headers.Cookie = server.cookies
		}
		var options = {
			method: 'GET',
			url: url,
			headers: headers,
			encoding: null
		};

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to download file ' + fileName);
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				resolve({
					data: body
				});
			} else {
				var result;
				try {
					result = JSON.parse(body);
				} catch (e) { }

				var msg = response.statusCode;
				if (result && result.errorMessage) {
					msg = result.errorMessage;
				} else {
					if (response.statusCode === 403) {
						msg = 'No read permission';
					} else if (response.statusCode === 404) {
						msg = 'File id is not found';
					}
				}
				console.error('ERROR: failed to download file ' + fileName + ' - ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return downloadPromise;
};


var _IdcCopySites2 = function (server, idcToken, name, fFolderGUID, exportPublishedAssets) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/documents/integration?IdcService=SCS_COPY_SITES&IsJson=1';

		var formData = {
			'idcToken': idcToken,
			'LocalData': {
				'IdcService': 'SCS_COPY_SITES',
				'names': name,
				'items': 'fFolderGUID:' + fFolderGUID,
				'doCopyToTemplate': 1,
				'useBackgroundThread': 1,
				'exportPublishedAssets': exportPublishedAssets
			}
		};

		var postData = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(formData),
			json: true
		};

		if (server.cookies) {
			postData.headers.Cookie = server.cookies
		}

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to create template');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) { }

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: failed to creat template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;
			console.log(' - creating template (JobID: ' + jobId + ')');
			// wait create to finish
			var startTime = new Date();
			var inter = setInterval(function () {
				var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, idcToken, jobId);
				jobPromise.then(function (data) {
					if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
						clearInterval(inter);
						process.stdout.write(os.EOL);
						// try to get error message
						var jobDataPromise = serverUtils.getBackgroundServiceJobData(server, idcToken, jobId);
						jobDataPromise.then(function (data) {
							console.error('ERROR: create template failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
							// console.log(data);
							return resolve({
								err: 'err'
							});
						});
					}
					if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
						clearInterval(inter);
						process.stdout.write(os.EOL);
						return resolve({});
					} else {
						process.stdout.write(' - creating template: percentage ' + data.JobPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						readline.cursorTo(process.stdout, 0);
					}
				});
			}, 5000);
		});
	});
};

module.exports.compileTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var pages = argv.pages,
		recurse = typeof argv.recurse === 'boolean' ? argv.recurse : argv.recurse === 'true',
		verbose = typeof argv.verbose === 'boolean' ? argv.verbose : argv.verbose === 'true',
		targetDevice = argv.targetDevice || '',
		siteName = argv.siteName || '',
		secureSite = typeof argv.secureSite === 'boolean' ? argv.secureSite : argv.secureSite === 'true',
		includeLocale = typeof argv.includeLocale === 'boolean' ? argv.includeLocale : argv.includeLocale === 'true',
		localeGroup = argv.localeGroup || '',
		noDetailPages = typeof argv.noDetailPages === 'boolean' ? argv.noDetailPages : argv.noDetailPages === 'true',
		noDefaultDetailPageLink = typeof argv.noDefaultDetailPageLink === 'boolean' ? argv.noDefaultDetailPageLink : argv.noDefaultDetailPageLink === 'true',
		contentLayoutSnippet = typeof argv.contentLayoutSnippet === 'boolean' ? argv.contentLayoutSnippet : argv.contentLayoutSnippet === 'true',
		contentType = argv.type,
		ignoreErrors = argv.ignoreErrors,
		server;

	if (argv.server) {
		server = serverUtils.verifyServer(argv.server, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}
	}

	var tempName = argv.source,
		template = '',
		channelToken = argv.channelToken,
		existingTemplates = getContents(templatesSrcDir);

	if (!tempName) {
		console.error('ERROR: please use --source to specify the name of the template to compile');
		done();
		return;
	}

	// verify the template to compile
	for (var i = 0; i < existingTemplates.length; i++) {
		if (tempName === existingTemplates[i]) {
			template = existingTemplates[i];
			break;
		}
	}
	if (!template) {
		console.error('ERROR: invalid template ' + tempName);
		done();
		return;
	}

	console.log('Compile Template: compiling template ' + tempName);

	var compiler = require('./compiler/compiler'),
		outputFolder = path.join(templatesSrcDir, tempName, 'static');

	compiler.compileSite({
		siteFolder: path.join(templatesSrcDir, tempName),
		outputFolder: outputFolder,
		themesFolder: themesSrcDir,
		sitesCloudRuntimeFolder: undefined,
		componentsFolder: componentsSrcDir,
		channelToken: channelToken,
		server: server,
		registeredServerName: argv.server,
		currPath: projectDir,
		type: contentType,
		pages: pages,
		recurse: recurse,
		verbose: verbose,
		targetDevice: targetDevice,
		siteName: siteName,
		secureSite: secureSite,
		noDetailPages: noDetailPages,
		noDefaultDetailPageLink: noDefaultDetailPageLink,
		contentLayoutSnippet: contentLayoutSnippet,
		includeLocale: includeLocale,
		localeGroup: localeGroup,
		logLevel: 'log',
		outputURL: serverURL + '/templates/' + tempName + '/'
	}).then(function (result) {
		console.log(' *** compiled template is ready to test');
		console.log(' *** to render non-compiled pages, remove compiled files from under: ' + outputFolder);
		done(true);
	}).catch(function (error) {
		if (ignoreErrors) {
			console.log(' *** compile template completed with errors');
			done(true);
		} else {
			console.log(' *** failed to compile template');
			done(false);
		}
	});
};

module.exports.compileContent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var verbose = typeof argv.verbose === 'boolean' ? argv.verbose : argv.verbose === 'true',
		targetDevice = argv.targetDevice || '',
		contentIds = argv.assets && argv.assets.split(','),
		contentType = argv.contenttype || '',
		publishingJobId = argv.source === 'undefined' ? undefined : argv.source,
		ignoreErrors = argv.ignoreErrors,
		server;
	if (argv.server) {
		server = serverUtils.verifyServer(argv.server, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}
	}


	if (!contentIds && !publishingJobId && !contentType) {
		console.error('ERROR: no publishing job ID, content IDs or content type defined');
		done();
		return;
	}

	console.log('Compile Content: compiling content: ' + (contentIds || publishingJobId || contentType));

	var compiler = require('./compiler/compiler'),
		outputFolder = path.join(templatesSrcDir, contentSrcDir, 'static', publishingJobId || 'ids');

	compiler.compileContent({
		outputFolder: outputFolder,
		componentsFolder: componentsSrcDir,
		channelToken: argv.channelToken,
		server: server,
		registeredServerName: argv.server,
		currPath: projectDir,
		contentIds: contentIds,
		contentType: contentType,
		verbose: verbose,
		targetDevice: targetDevice,
		publishingJobId: publishingJobId,
		renditionJobId: argv.renditionJobId,
		repositoryId: argv.repositoryId,
		logLevel: 'log',
		serverURL: serverURL
	}).then(function (result) {
		console.log(' *** compiled content is ready to test');
		done(true);
	}).catch(function (error) {
		if (ignoreErrors) {
			console.log(' *** compile content completed with errors');
			done(true);
		} else {
			console.log(' *** failed to compile content');
			done(false);
		}
	});
};


/**
 * Delete a template on server with REST APIs
 * 
 * @param {Delete} server 
 * @param {*} name 
 * @param {*} permanent 
 * @param {*} done 
 */
var _deleteTemplateREST = function (server, name, permanent, done) {

	var exitCode;
	sitesRest.getTemplate({
		server: server,
		name: name,
		includeDeleted: true
	}).then(function (result) {
		if (result.err) {
			return Promise.reject();
		}

		var template = result;
		console.info(' - template GUID: ' + template.id);
		if (template.isDeleted) {
			console.log(' - template is already in the trash');

			if (!permanent) {
				console.log(' - run the command with parameter --permanent to delete permanently');
				exitCode = 2;
				return Promise.reject();
			}
		}

		return sitesRest.deleteTemplate({
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
				console.info(' - template deleted permanently');
			} else {
				console.info(' - template deleted');
			}

			done(true);
		})
		.catch((error) => {
			done(exitCode);
		});
};

/**
 * Create template from a site with REST APIs
 * @param {*} server 
 * @param {*} name 
 * @param {*} siteName 
 * @param {*} includeUnpublishedAssets 
 * @param {*} done 
 */
var _createTemplateFromSiteREST = function (server, name, siteName, includeUnpublishedAssets, enterprisetemplate) {
	return new Promise(function (resolve, reject) {

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return Promise.reject();
			}

			var site;

			// verify template 
			sitesRest.resourceExist({
				server: server,
				type: 'templates',
				name: name
			}).then(function (result) {
				if (!result.err) {
					console.error('ERROR: template ' + name + ' already exists');
					return Promise.reject();
				}

				// verify site
				return sitesRest.getSite({
					server: server,
					name: siteName,
					expand: 'channel,repository'
				});
			})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}
					site = result;

					console.info(' - get site (Id: ' + site.id + ')');
					var channelId = site.channel && site.channel.id;
					var repositoryId = site.repository && site.repository.id;

					if (enterprisetemplate || site.isEnterprise) {
						console.info(' - will create enterprise template');
					} else {
						console.info(' - will create standard template');
					}

					var queryAssetPromises = site.isEnterprise ? [contentUtils.getSiteAssetsFromOtherRepos(server, channelId, repositoryId)] : [];

					return Promise.all(queryAssetPromises);

				})
				.then(function (results) {
					if (site.isEnterprise) {
						if (results && results[0] && results[0].data && results[0].data.length > 0) {
							console.error('ERROR: site has assets from other repositories, use command "cec create-template" to create');
							return Promise.reject();
						}
					}

					return sitesRest.createTemplateFromSite({
						server: server,
						name: name,
						siteName: siteName,
						includeUnpublishedAssets: includeUnpublishedAssets,
						enterprisetemplate: enterprisetemplate
					});
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					console.log(' - create template ' + name + ' finished');

					return sitesRest.getTemplate({
						server: server,
						name: name
					});
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					console.log(' - template id: ' + result.id);
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
	});
};

/**
 * Download a template from server
 * @param {*} server 
 * @param {*} name 
 * @param {*} done 
 */
var _downloadTemplateREST = function (server, name) {
	return new Promise(function (resolve, reject) {
		var fileId;
		var zippath;
		var startTime;
		// verify template
		sitesRest.getTemplate({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			return sitesRest.exportTemplate({
				server: server,
				name: name
			});

		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				return serverRest.findFile({
					server: server,
					parentID: 'self',
					filename: name + '.zip',
					itemtype: 'file'
				});

			})
			.then(function (result) {
				if (result.err || !result.id) {
					return Promise.reject();
				}
				// console.log(result);

				fileId = result.id;

				var destdir = path.join(projectDir, 'dist');
				if (!fs.existsSync(destdir)) {
					fs.mkdirSync(destdir);
				}

				zippath = path.join(destdir, name + '.zip');
				console.log(' - downloading template zip file (id: ' + fileId + ' size: ' + result.size + ') ...');
				startTime = new Date();
				return serverRest.downloadFileSave({
					server: server,
					fFileGUID: fileId,
					saveTo: zippath
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.log(' - template downloaded to ' + zippath + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				// delete the zip file on server

				return serverRest.deleteFile({
					server: server,
					fFileGUID: fileId
				});
			})
			.then(function (result) {
				return unzipTemplate(name, zippath, false);
			})
			.then(function (result) {
				resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};

var _importTemplateToServerRest = function (server, name, folder, zipfile) {
	var fileName = zipfile.substring(zipfile.lastIndexOf('/') + 1);
	return new Promise(function (resolve, reject) {
		var folderPromises = [];
		var startTime;
		if (folder) {
			folderPromises.push(serverRest.findFolderHierarchy({
				server: server,
				parentID: 'self',
				folderPath: folder
			}));
		}
		Promise.all(folderPromises)
			.then(function (results) {
				if (folder && (!results || results.length === 0 || !results[0] || !results[0].id)) {
					return Promise.reject();
				}

				var folderId = folder ? results[0].id : 'self';

				// upload file
				console.info(' - uploading file ' + fileName + ' ...');
				startTime = new Date();
				return serverRest.createFile({
					server: server,
					parentID: folderId,
					filename: fileName,
					contents: fs.createReadStream(zipfile)
				});

			}).then(function (result) {
				if (!result || !result.id) {
					return Promise.reject();
				}
				console.info(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
				var fileId = result.id;

				return sitesRest.importTemplate({
					server: server,
					name: name,
					fileId: fileId
				});
			})
			.then(function (result) {

				if (result.err) {
					return Promise.reject();
				}

				console.log(' - template ' + name + ' imported');

				resolve({});
			})
			.catch((error) => {
				resolve({
					err: 'err'
				});
			});
	});
};

/**
 * Create and download template with Idc Service APIs (IC)
 * @param {*} server 
 * @param {*} name 
 * @param {*} siteName 
 * @param {*} done 
 */
var _createTemplateFromSiteAndDownloadSCS = function (argv) {
	verifyRun(argv);
	var server = argv.server;
	var name = argv.name;
	var siteName = argv.siteName;
	var includeUnpublishedAssets = argv.includeUnpublishedAssets;

	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var templateId;
	var homeFolderGUID;
	var templateZipFile = name + '.zip';
	var templateZipFileGUID;
	var zippath = path.join(destdir, templateZipFile);
	return new Promise(function (resolve, reject) {

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			var idcToken;

			// the site id
			var fFolderGUID;
			var exportPublishedAssets = includeUnpublishedAssets ? 0 : 1;

			var startTime;

			// verify template
			serverUtils.getIdcToken(server)
				.then(function (result) {
					idcToken = result && result.idcToken;
					if (!idcToken) {
						console.error('ERROR: failed to get idcToken');
						return Promise.reject();
					}

					return serverUtils.browseSitesOnServer(server, 'framework.site.template');
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					var templates = result.data || [];
					var foundTemplate = false;
					for (var i = 0; i < templates.length; i++) {
						if (name.toLowerCase() === templates[i].fFolderName.toLowerCase()) {
							foundTemplate = true;
							break;
						}
					}
					if (foundTemplate) {
						console.error('ERROR: template ' + name + ' already exists');
						return Promise.reject();
					}

					//
					// verify site
					//
					return serverUtils.browseSitesOnServer(server, '');
				})
				.then(function (result) {
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
						console.error('ERROR: site ' + siteName + ' does not exist');
						return Promise.reject();
					}

					console.log(' - get site (Id: ' + site.fFolderGUID + ')');
					fFolderGUID = site.fFolderGUID;

					return _IdcCopySites2(server, idcToken, name, fFolderGUID, exportPublishedAssets);
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					return serverUtils.browseSitesOnServer(server, 'framework.site.template');
				})
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					var templates = result.data || [];
					for (var i = 0; i < templates.length; i++) {
						if (name.toLowerCase() === templates[i].fFolderName.toLowerCase()) {
							templateId = templates[i].fFolderGUID;
							break;
						}
					}
					if (!templateId) {
						console.error('ERROR: failed to get template ' + name);
						return Promise.reject();
					}
					console.log(' - create template ' + name + ' (Id: ' + templateId + ')');

					return serverRest.getUser({
						server: server,
						name: server.username
					});
				})
				.then(function (result) {
					// get personal home folder
					// console.log(result);
					if (result.err || !result.items || result.items.length === 0) {
						return Promise.reject();
					}

					homeFolderGUID = 'F:USER:' + result.items[0].id;
					// console.log(' - Home folder GUID: ' + homeFolderGUID);

					console.log(' - exporting template ...');
					startTime = new Date();
					return _exportServerTemplate(server, idcToken, templateId, homeFolderGUID);

				})
				.then(function (result) {
					// template exported
					if (result.err) {
						return Promise.reject();
					}
					console.log(' - template exported ' + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

					return serverRest.findFile({
						server: server,
						parentID: 'self',
						filename: templateZipFile,
						itemtype: 'file'
					});
				})
				.then(function (result) {
					// get template zip file GUID from the Home folder
					if (result.err || !result.id) {
						return Promise.reject();
					}

					templateZipFileGUID = result.id;
					console.log(' - downloading template zip file (id: ' + templateZipFileGUID + ' size: ' + result.size + ') ...');
					startTime = new Date();
					return _downloadServerFile(server, templateZipFileGUID, templateZipFile);

				})
				.then(function (result) {
					// zip file downloaded
					if (result.err) {
						return Promise.reject();
					}

					fs.writeFileSync(zippath, result.data);
					console.log(' - template download to ' + zippath + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

					var deleteArgv = {
						file: templateZipFile,
						permanent: 'true'
					};
					return documentUtils.deleteFile(deleteArgv, server, false);

				})
				.then(function (result) {

					return resolve({
						siteId: fFolderGUID
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


		}); // login
	});
};

/**
 * share template
 */
module.exports.shareTemplate = function (argv, done) {
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

		var tempId;
		var users = [];
		var groups = [];

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var tempPromise = sitesRest.getTemplate({
				server: server,
				name: name
			});
			tempPromise.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				tempId = result.id;

				if (!tempId) {
					console.error('ERROR: template ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify template');

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
						id: tempId
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
							id: tempId,
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
							id: tempId,
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
								results[i].role + '" on template ' + name);
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
 * unshare template
 */
module.exports.unshareTemplate = function (argv, done) {
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

		var tempId;
		var users = [];
		var groups = [];

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			var tempPromise = sitesRest.getTemplate({
				server: server,
				name: name
			});
			tempPromise.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				tempId = result.id;

				if (!tempId) {
					console.error('ERROR: template ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify template');

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
						id: tempId
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
								id: tempId,
								userId: users[i].id
							}));
						} else {
							console.log(' - user ' + users[i].loginName + ' has no access to the template');
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
								id: tempId,
								userId: groups[i].groupID
							}));
						} else {
							console.log(' - group ' + (groups[i].displayName || groups[i].name) + ' has no access to the template');
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
							console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + '\'s access to the template removed');
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


// export non "command line" utility functions
module.exports.utils = {
	createTemplateFromSiteAndDownloadSCS: _createTemplateFromSiteAndDownloadSCS,
	unzipTemplate: unzipTemplate,
	unzipTemplateUtil: unzipTemplateUtil,
	zipTemplate: _exportTemplateUtil,
	createLocalTemplateFromSite: _createLocalTemplateFromSiteUtil
};