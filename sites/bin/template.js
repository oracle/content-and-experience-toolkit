/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Template library
 */
var gulp = require('gulp'),
	documentUtils = require('./document.js').utils,
	contentUtils = require('./content.js').utils,
	serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	childProcess = require('child_process'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	argv = require('yargs').argv,
	zip = require('gulp-zip');

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


var _createLocalTemplateFromSite = function (name, siteName, server, excludeContent) {
	return new Promise(function (resolve, reject) {
		var request = serverUtils.getRequest();

		serverUtils.loginToServer(server, request).then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return resolve({
					err: 'err'
				});
			}

			// prepare local template folder
			var tempSrcPath = path.join(templatesSrcDir, name);
			if (fs.existsSync(tempSrcPath)) {
				fse.removeSync(tempSrcPath);
			}
			fs.mkdirSync(tempSrcPath);

			var themeSrcPath;

			var isEnterprise;
			var themeName, themeId;
			var channelId, channelName;
			var assetSummaryJson;
			var assetContentTypes = [];
			var downloadedComps = [];
			var site;
			var contentTypeNames = [];
			var contentLayoutNames = [];
			var typePromises = [];

			sitesRest.getSite({
					server: server,
					name: siteName,
					expand: 'channel,repository'
				})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						console.log('ERROR: site ' + siteName + ' does not exist');
						return Promise.reject();
					}
					site = result;
					console.log(' - verify site');
					// console.log(site);

					return serverUtils.getSiteContentTypes(request, server, site.id);

				})
				.then(function (result) {
					contentTypeNames = result && result.data || [];

					var repositoryTypes = site.repository && site.repository.contentTypes || [];
					repositoryTypes.forEach(function (type) {
						if (!contentTypeNames.includes(type.name)) {
							contentTypeNames.push(type.name);
						}
					});

					console.log(' - content types: ' + contentTypeNames);

					// query content layout mappings if needed
					if (excludeContent && contentTypeNames.length > 0) {
						contentTypeNames.forEach(function (typeName) {
							typePromises.push(serverUtils.getContentTypeLayoutMapping(request, server, typeName));
						});
					}

					isEnterprise = site.isEnterprise;
					themeName = site.themeName;
					channelId = site.channel && site.channel.id;

					console.log(' - theme ' + themeName);
					themeSrcPath = path.join(themesSrcDir, themeName);
					if (fs.existsSync(themeSrcPath)) {
						fse.removeSync(themeSrcPath);
					}
					fs.mkdirSync(themeSrcPath);

					// download site files
					var downloadArgv = {
						path: 'site:' + siteName,
						folder: tempSrcPath
					};
					console.log(' - downloading site files');
					var excludeFolder = '/publish';
					return documentUtils.downloadFolder(downloadArgv, server, true, false, excludeFolder);
				})
				.then(function (result) {
					if (!result) {
						return Promise.reject();
					}
					console.log(' - download site files');
					// create _folder.json
					var folderStr = fs.readFileSync(path.join(templatesDataDir, '_folder.json'));
					var folderJson = JSON.parse(folderStr);
					folderJson.itemGUID = serverUtils.createGUID();
					folderJson.isEnterprise = isEnterprise ? 'true' : 'false';
					folderJson.siteName = name;
					folderJson.siteLongDescription = 'Template ' + name;
					fs.writeFileSync(path.join(tempSrcPath, '_folder.json'), JSON.stringify(folderJson));

					// update siteinfo.json
					var siteinfoStr = fs.readFileSync(path.join(tempSrcPath, 'siteinfo.json'));
					var siteinfoJson = JSON.parse(siteinfoStr);
					if (siteinfoJson && siteinfoJson.properties) {
						siteinfoJson.properties.themeName = themeName;
						siteinfoJson.properties.siteName = name;
						siteinfoJson.properties.siteRootPrefix = '/SCSTEMPLATE_' + name;
						fs.writeFileSync(path.join(tempSrcPath, 'siteinfo.json'), JSON.stringify(siteinfoJson));
					}

					// get theme id
					return serverUtils.getTheme(request, server, themeName);
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					themeId = result.id;

					// download theme
					var downloadArgv = {
						path: 'theme:' + themeName,
						folder: themeSrcPath
					};
					console.log(' - downloading theme files');
					return documentUtils.downloadFolder(downloadArgv, server, true, false);
				})
				.then(function (result) {
					console.log(' - download theme files');
					// create _folder.json for theme
					var folderJson = {
						themeName: themeName,
						itemGUID: themeId
					};
					fs.writeFileSync(path.join(themeSrcPath, '_folder.json'), JSON.stringify(folderJson));

					var downloadContentPromises = (excludeContent || !isEnterprise) ? [] : [_downloadContent(request, server, name, channelId)];

					return Promise.all(downloadContentPromises);
				})
				.then(function (results) {
					if (!excludeContent && isEnterprise) {
						if (!results || !results[0] || results[0].err) {
							return Promise.reject();
						}
					}

					// query content layout mappings
					return Promise.all(typePromises);

				})
				.then(function (results) {
					if (excludeContent) {
						var mappings = results || [];
						var categoryLayoutMappings = [];
						mappings.forEach(function (mapping) {
							// console.log(mapping);
							if (mapping.data && mapping.data.length > 0) {
								var typeMappings = mapping.data;
								var categoryList = [];
								for (var j = 0; j < typeMappings.length; j++) {
									if (typeMappings[j].xCaasLayoutName && !contentLayoutNames.includes(typeMappings[j].xCaasLayoutName)) {
										contentLayoutNames.push(typeMappings[j].xCaasLayoutName);
									}
									categoryList.push({
										categoryName: typeMappings[j].xCaasCategoryName,
										layoutName: typeMappings[j].xCaasLayoutName
									});
								}
								categoryLayoutMappings.push({
									type: mapping.type,
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
						fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));
					}

					var contentTypePromises = [];
					if (excludeContent && contentTypeNames.length > 0) {
						contentTypeNames.forEach(function (typeName) {
							contentTypePromises.push(serverRest.getContentType({
								server: server,
								name: typeName
							}));
						});
					}

					return Promise.all(contentTypePromises);

				})
				.then(function (results) {
					if (excludeContent) {
						var types = results || [];

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
						types.forEach(function (type) {
							var filePath = path.join(folderPath, type.name + '.json');
							// console.log(filePath);
							fs.writeFileSync(filePath, JSON.stringify(type, null, 4));
						});
					}

					// get components on template
					var comps = serverUtils.getTemplateComponents(projectDir, name);

					contentLayoutNames.forEach(function (layoutName) {
						if (!comps.includes(layoutName)) {
							comps.push(layoutName);
						}
					});

					return _downloadComponents(comps, server);
				})
				.then(function (result) {
					downloadedComps = result;

					// query components to get ids
					return _queryComponents(request, server, downloadedComps);
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					// create _folder.json for all components
					console.log(' - query components');
					var comps = result;
					for (var i = 0; i < comps.length; i++) {
						var folderJson = {
							itemGUID: comps[i].id,
							appType: comps[i].type,
							appIconUrl: '',
							appIsHiddenInBuilder: comps[i].isHidden
						};

						if (fs.existsSync(path.join(componentsSrcDir, comps[i].name))) {
							var folderPath = path.join(componentsSrcDir, comps[i].name, '_folder.json');
							fs.writeFileSync(folderPath, JSON.stringify(folderJson));
						}
					}

					console.log('*** template is ready to test: http://localhost:8085/templates/' + name);
					return resolve({
						contentLayouts: contentLayoutNames
					});

				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});

		});
	});
};

var _createLocalTemplateFromSiteUtil = function (argv, name, siteName, server, excludeContent) {
	verifyRun(argv);
	return _createLocalTemplateFromSite(name, siteName, server, excludeContent);
};

var _downloadContent = function (request, server, name, channelId) {
	return new Promise(function (resolve, reject) {
		var channelName;
		var assetSummaryJson;
		var assetContentTypes = [];
		serverRest.getChannel({
				server: server,
				id: channelId
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				channelName = result.name;

				// download all content from the site channel
				return contentUtils.downloadContent({
					projectDir: projectDir,
					server: server,
					channel: channelName,
					name: name + '_content',
					publishedassets: false
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				// move content to template folder
				var tempAssetPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate');
				var contentPath = path.join(contentSrcDir, name + '_content');
				fse.moveSync(contentPath, tempAssetPath);
				var contentexportPath = path.join(tempAssetPath, 'contentexport');
				var tempContentPath = path.join(tempAssetPath, 'Content Template of ' + name);
				fse.moveSync(contentexportPath, tempContentPath);

				var summaryStr = fs.readFileSync(path.join(tempContentPath, 'Summary.json'));
				assetSummaryJson = JSON.parse(summaryStr);
				var contentTypes = assetSummaryJson && assetSummaryJson.types ? assetSummaryJson.types.split(',') : [];
				var typePromises = [];

				for (var i = 0; i < contentTypes.length; i++) {
					if (contentTypes[i] !== 'DigitalAsset') {
						typePromises.push(serverUtils.getContentTypeLayoutMapping(request, server, contentTypes[i]));
						assetContentTypes.push(contentTypes[i]);
					}
				}

				return Promise.all(typePromises);
			})
			.then(function (results) {
				var mappings = results || [];

				var items = assetSummaryJson && assetSummaryJson.items ? assetSummaryJson.items.split(',') : [];

				var layoutComponents = [];
				var categoryLayoutMappings = [];
				var typeName = assetContentTypes[i];
				for (var i = 0; i < mappings.length; i++) {
					if (mappings[i].data && mappings[i].data.length > 0) {
						var typeMappings = mappings[i].data;
						var categoryList = [];
						for (var j = 0; j < typeMappings.length; j++) {
							if (!layoutComponents.includes(typeMappings[j].xCaasLayoutName)) {
								layoutComponents.push(typeMappings[j].xCaasLayoutName);
							}
							categoryList.push({
								categoryName: typeMappings[j].xCaasCategoryName,
								layoutName: typeMappings[j].xCaasLayoutName
							});
						}
						categoryLayoutMappings.push({
							type: mappings[i].type,
							categoryList: categoryList
						});
					}
				}
				// create summary.json
				var summaryJson = {
					summary: {
						contentTypes: assetContentTypes,
						contentItems: items
					},
					categoryLayoutMappings: categoryLayoutMappings,
					layoutComponents: layoutComponents
				};
				var summaryPath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate', 'summary.json');
				fs.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 4));

				return resolve({});
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
};

var _queryComponents = function (request, server, compNames) {
	return new Promise(function (resolve, reject) {
		var comps = [];
		if (server.useRest) {
			sitesRest.getComponents({
					server: server
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					var allComps = result;
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
					return resolve(comps);
				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});
		} else {
			serverUtils.browseComponentsOnServer(request, server)
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					var allComps = result.data || [];
					for (var i = 0; i < compNames.length; i++) {
						for (var j = 0; j < allComps.length; j++) {
							if (compNames[i] === allComps[j].fFolderName) {
								comps.push({
									id: allComps[j].fFolderGUID,
									name: allComps[j].fFolderName,
									type: allComps[j].xScsAppType,
									isHidden: allComps[j].xScsAppIsHiddenInBuilder ? '1' : '0'
								});
							}
						}
					}
					return resolve(comps);
				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});
		}
	});
};

var _downloadComponents = function (comps, server) {
	return new Promise(function (resolve, reject) {
		var total = comps.length;
		console.log(' - total number of components: ' + total);
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
					return documentUtils.downloadFolder(downloadArgv, server, false, false).then(function (result) {
							console.log(' - download component ' + param);
							compData.push(param);
						})
						.catch((error) => {
							// the component does not exist or is seeded
							// console.log(' - component ' + param + ' not found');
							fs.rmdirSync(compSrcPath);
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
		var excludeContent = typeof argv.excludecontent === 'string' && argv.excludecontent.toLowerCase() === 'true';
		_createLocalTemplateFromSite(argv.name, siteName, server, excludeContent)
			.then(function (result) {
				if (result.err) {
					done();
				} else {
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

		console.log('Create Template: creating new template ' + tempName + ' from ' + srcTempName);
		var unzipPromise = unzipTemplate(tempName, path.resolve(templatesDataDir + '/' + template), true);
		unzipPromise.then(function (result) {
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
		console.log('ERROR: file ' + tempPath + ' does not exist');
		done();
		return;
	}

	var tempName = tempPath.substring(tempPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	console.log('Import Template: importing template name=' + tempName + ' path=' + tempPath);
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

gulp.task('create-template-zip', function (done) {
	'use strict';

	if (templateName && templateBuildContentDirBase && templateBuildContentDirName) {
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			tempBuildDir = path.join(templatesBuildDir, templateName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');

		gulp.src([tempBuildDir + '/**', '!' + contentdir, '!' + contentdir + '/**', '!' + metainfbuilddir, '!' + metainfbuilddir + '/**'])
			.pipe(zip(templateName + '.zip'))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', done);
	}
});

gulp.task('create-template-export-zip', function (done) {
	'use strict';

	if (templateBuildContentDirBase && templateBuildContentDirName) {
		console.log(' - content export.zip');
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');
		return gulp.src([contentdir + '/**', metainfbuilddir + '/**'], {
				base: templateBuildContentDirBase
			})
			.pipe(zip('export.zip'))
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

	// verify the source template
	for (var i = 0; i < existingTemplates.length; i++) {
		if (srcTempName === existingTemplates[i]) {
			template = existingTemplates[i];
			break;
		}
	}
	if (!template) {
		console.error('ERROR: invalid template ' + srcTempName);
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

	console.log('Copy Template: creating new template ' + tempName + ' from ' + srcTempName);

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
		console.log(' - update content dir to ' + newname);
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
			console.log(' - update template themeName to ' + themeName + ' in siteinfo.json');
			siteinfojson.properties.themeName = themeName;
			siteinfojson.properties.siteName = tempName;
			fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
		}
	}

	console.log(' *** template is ready to test: ' + serverURL + '/templates/' + tempName);
	done(true);
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
		console.log('ERROR: invalid folder');
		done();
		return;
	}

	_exportTemplate(name, optimize, excludeContentTemplate).then(function (result) {
		var zipfile = result && result.zipfile;
		if (fs.existsSync(zipfile)) {
			console.log(' - template exported to ' + zipfile);

			// import the template to the server
			_importTemplate(server, name, folder, zipfile, done);

		} else {
			console.log('ERROR: file ' + zipfile + ' does not exist');
			done();
		}
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
	done(true);
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

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		if (server.useRest) {
			_downloadTemplateREST(server, name)
				.then(function (result) {
					if (result.err) {
						done();
					} else {
						done(true);
					}
					return;
				});
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;
		var templateGUID;
		var homeFolderGUID;
		var templateZipFile = name + '.zip';
		var templateZipFileGUID;
		var zippath = path.join(destdir, templateZipFile);

		var auth = serverUtils.getRequestAuth(server);

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
			if (req.url.indexOf('SCS_EXPORT_TEMPLATE_PACKAGE') > 0) {
				var url = server.url + '/documents/web?IdcService=SCS_EXPORT_TEMPLATE_PACKAGE';
				var formData = {
					'idcToken': idcToken,
					'item': 'fFolderGUID:' + templateGUID,
					'destination': 'fFolderGUID:' + homeFolderGUID
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
						console.log('ERROR: Failed to export template:');
						console.log(error);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res)
					.on('finish', function (err) {
						res.end();
					});
			} else if (req.url.indexOf('FLD_MOVE_TO_TRASH') > 0) {
				var url = server.url + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';
				var formData = {
					'idcToken': idcToken,
					'items': 'fFileGUID:' + templateZipFileGUID
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
						console.log('ERROR: Failed to delete template zip:');
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

			var total = 0;
			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					if (!response || response.statusCode !== 200) {
						clearInterval(inter);
						console.log('ERROR: failed to connect to server: ' + (response ? response.statusMessage : ''));
						_cmdEnd(done);
					} else {
						var data = JSON.parse(body);
						dUser = data && data.LocalData && data.LocalData.dUser;
						idcToken = data && data.LocalData && data.LocalData.idcToken;
						if (dUser && dUser !== 'anonymous' && idcToken) {
							// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
							clearInterval(inter);
							console.log(' - establish user session');

							var templatePromise = _getServerTemplate(request, localhost, name);
							templatePromise.then(function (result) {
									if (result.err) {
										return Promise.reject();
									}

									if (!result.templateGUID) {
										console.log('ERROR: template ' + name + ' does not exist');
										return Promise.reject();
									}

									templateGUID = result.templateGUID;
									// console.log(' - template GUID: ' + templateGUID);
									console.log(' - get template');

									return serverUtils.queryFolderId(request, server, localhost);
								})
								.then(function (result) {
									// get personal home folder
									if (result.err) {
										return Promise.reject();
									}
									homeFolderGUID = result.folderId;
									// console.log(' - Home folder GUID: ' + homeFolderGUID);

									return _exportServerTemplate(request, localhost);

								})
								.then(function (result) {
									// template exported
									if (result.err) {
										return Promise.reject();
									}
									console.log(' - export template');

									return _getHomeFolderFile(request, localhost, templateZipFile);
								})
								.then(function (result) {
									// get template zip file GUID from the Home folder
									if (result.err) {
										return Promise.reject();
									}
									templateZipFileGUID = result.fileGUID;

									// console.log(' - template zip file ' + templateZipFile);
									// console.log(' - template zip file GUID: ' + templateZipFileGUID);

									return _downloadServerFile(request, server, templateZipFileGUID, templateZipFile);

								})
								.then(function (result) {
									// zip file downloaded
									if (result.err) {
										return Promise.reject();
									}

									fs.writeFileSync(zippath, result.data);
									console.log(' - template download to ' + zippath);

									return _moveToTrash(request, localhost);

								})
								.then(function (result) {
									// delete the template zip on the server
									// console.log(' - delete ' + templateZipFile + ' on the server');

									return unzipTemplate(name, zippath, false);
								})
								.then(function (results) {
									_cmdEnd(done, true);
								})
								.catch((error) => {
									_cmdEnd(done);
								});
						}
						total += 1;
						if (total >= 10) {
							clearInterval(inter);
							console.log('ERROR: disconnect from the server, try again');
							_cmdEnd(done);
						}
					}
				});
			}, 5000);

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

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		if (server.useRest) {
			_deleteTemplateREST(server, name, permanent, done);
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;
		var templateGUID;
		var templateGUIDInTrash;

		var auth = serverUtils.getRequestAuth(server);

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
			if (req.url.indexOf('FLD_MOVE_TO_TRASH') > 0) {
				var url = server.url + '/documents/web?IdcService=SCS_MOVE_TO_TRASH';
				var formData = {
					'idcToken': idcToken,
					'items': 'fFolderGUID:' + templateGUID
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
						console.log('ERROR: Failed to delete template:');
						console.log(error);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res)
					.on('finish', function (err) {
						res.end();
					});
			} else if (req.url.indexOf('FLD_DELETE_FROM_TRASH') > 0) {
				var url = server.url + '/documents/web?IdcService=FLD_DELETE_FROM_TRASH';
				var formData = {
					'idcToken': idcToken,
					'items': 'fFolderGUID:' + templateGUIDInTrash
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
						console.log('ERROR: Failed to delete template from trash:');
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

			var total = 0;
			var success = false;
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

						_getServerTemplateFromTrash(request, localhost, name)
							.then(function (result) {
								if (result && result.templateGUID) {
									if (!permanent) {
										console.log(' - template is in Trash, please run \'cec delete-template ' + name + ' --permanent\' to delete it permanently');
										_cmdEnd(done);
										return;
									} else {
										templateGUIDInTrash = result.templateFolderGUID;
										_deleteFromTrash(request, localhost).then(function (result) {
											if (!result.err) {
												console.log(' - template deleted permanently');
												_cmdEnd(done, true);
												return;
											} else {
												_cmdEnd(done);
												return;
											}
										});
									}
								} else {

									var templatePromise = _getServerTemplate(request, localhost, name);
									templatePromise.then(function (result) {
											if (result.err) {
												return Promise.reject();
											}

											if (!result.templateGUID) {
												console.log('ERROR: template ' + name + ' does not exist');
												return Promise.reject();
											}

											templateGUID = result.templateGUID;
											console.log(' - template GUID: ' + templateGUID);

											return _moveToTrash(request, localhost);
										})
										.then(function (result) {
											if (result.err) {
												return Promise.reject();
											}
											console.log(' - template deleted');
											if (!permanent) {
												success = true;
												return Promise.reject();
											}

											// remove from trash
											var transItemPromise = _getFolderFromTrash(request, localhost, templateGUID);
											transItemPromise.then(function (result) {
													if (result.err) {
														return Promise.reject();
													}

													templateGUIDInTrash = result.folderGUIDInTrash;
													return _deleteFromTrash(request, localhost);
												})
												.then(function (result) {
													if (!result.err) {
														console.log(' - template deleted permanently');
													}
													_cmdEnd(done, true);
												})
												.catch((error) => {
													_cmdEnd(done);
												});
										})
										.catch((error) => {
											_cmdEnd(done, success);
										});
								}
							});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_cmdEnd(done);
					}
				});
			}, 5000);

		});

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

		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		console.log(' - server: ' + server.url);

		if (server.useRest) {
			_createTemplateFromSiteREST(server, name, siteName, includeUnpublishedAssets, done);
		} else {

			_createTemplateFromSiteSCS(server, name, siteName, includeUnpublishedAssets)
				.then(function (result) {
					if (result.err) {
						_cmdEnd(done);
					} else {
						_cmdEnd(done, true);
					}
				});
		}

	} catch (err) {
		console.log(err);
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
		console.log(' - the template will be at ' + tempSrcDir);
		if (fs.existsSync(tempSrcDir)) {
			fse.removeSync(tempSrcDir);
		}
		fs.mkdirSync(tempSrcDir);

		// unzip /src/templates/<temp name>/
		// decompress(tempPath, tempSrcDir).then(() => {
		// decompress does not work with empty directories on unix
		extract(tempPath, {
			dir: tempSrcDir
		}, function (err) {
			if (err) {
				console.log(err);
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
			console.log(' - the theme for the template will be at ' + themeSrcDir);
			if (fs.existsSync(themeSrcDir)) {
				fse.removeSync(themeSrcDir);
			}

			// move theme to the themes dir
			fse.moveSync(path.join(tempSrcDir, 'theme'), themeSrcDir);

			// create soft links
			var currdir = process.cwd();
			try {
				if (fs.existsSync(path.join(themeSrcDir, 'layouts'))) {
					process.chdir(path.join(themeSrcDir, 'layouts'));
					fse.ensureSymlinkSync('..', '_scs_theme_root_');
					console.log(' - create link _scs_theme_root_');
				} else {
					console.log(' Path does not exist: ' + path.join(themeSrcDir, 'layouts'));
				}

				if (fs.existsSync(path.join(themeSrcDir, 'designs', 'default'))) {
					process.chdir(path.join(themeSrcDir, 'designs'));
					fse.ensureSymlinkSync('default', '_scs_design_name_');
					console.log(' - create link _scs_design_name_');
				} else {
					console.log(' Path does not exist: ' + path.join(themeSrcDir, 'designs', 'default'));
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
			fse.removeSync(path.join(tempSrcDir, 'template'));

			if (fs.existsSync(path.join(tempSrcDir, 'components'))) {
				// move components to the components dir
				var comps = fs.readdirSync(path.join(tempSrcDir, 'components'));
				for (var i = 0; i < comps.length; i++) {
					if (fs.existsSync(path.join(componentsSrcDir, comps[i]))) {
						fse.removeSync(path.join(componentsSrcDir, comps[i]));
						console.log(' - override component ' + componentsSrcDir + '/' + comps[i]);
					}
					fse.moveSync(path.join(tempSrcDir, 'components', comps[i]), path.join(componentsSrcDir, comps[i]), true);
				}
				fse.removeSync(path.join(tempSrcDir, 'components'));
			}

			// make sure the correct theme name is set in siteinfo
			var siteinfofile = path.join(tempSrcDir, 'siteinfo.json');
			if (fs.existsSync(siteinfofile)) {
				var siteinfostr = fs.readFileSync(siteinfofile),
					siteinfojson = JSON.parse(siteinfostr);
				if (siteinfojson && siteinfojson.properties) {
					console.log(' - set themeName to ' + themeName + ' in siteinfo.json');
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
				console.log(' - create siteinfo.json and set themeName to ' + themeName);
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
					console.log(' - update template GUID ' + oldGUID + ' to ' + newGUID);
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
					console.log(' - update theme GUID ' + oldGUID + ' to ' + newGUID);
					fs.writeFileSync(themefolderfile, JSON.stringify(folderjson));
				}
			}

			// unzip content zip if exists
			var contentpath = path.join(tempSrcDir, 'assets', 'contenttemplate');
			var contentexportfile = path.join(contentpath, 'export.zip');
			if (fs.existsSync(contentexportfile)) {
				console.log(' - unzip template content file');
				extract(contentexportfile, {
					dir: contentpath
				}, function (err) {
					if (err) {
						console.log(err);
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
var _exportTemplate = function (name, optimize, excludeContentTemplate, extraComponents) {
	return new Promise(function (resolve, reject) {
		var tempSrcDir = path.join(templatesSrcDir, name),
			tempBuildDir = path.join(templatesBuildDir, name);

		if (fs.existsSync(tempBuildDir)) {
			fse.removeSync(tempBuildDir);
		}

		// copy template files to build dir: <template name>/template/
		fse.copySync(tempSrcDir, path.join(tempBuildDir, 'template'));
		console.log(' - template ' + name);

		var exportfile = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate', 'export.zip');
		if (fs.existsSync(exportfile)) {
			fse.removeSync(exportfile);
		}
		/*
		var metainfbuilddir = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate', 'META-INF');
		if (fs.existsSync(metainfbuilddir)) {
			fse.removeSync(metainfbuilddir);
		}
		*/

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

		if (!themeName) {
			console.error('ERROR: no theme is found for template ' + name);
			return resolve({
				err: 'err'
			});
		}

		var themeSrcDir = path.join(themesSrcDir, themeName);
		if (!fs.existsSync(siteinfofile)) {
			console.error('ERROR: theme path does not exist ' + themeSrcDir);
			return resolve({
				err: 'err'
			});
		}

		// copy theme files to build dir: <template name>/theme/
		fse.copySync(themeSrcDir, path.join(tempBuildDir, 'theme'));
		console.log(' - theme ' + themeName);

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

		// Optimize if requested
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
					var uglifycss = require('uglifycss'),
						uglifyjs = require("uglify-js");
					files.forEach(function (name) {
						if (name.endsWith('.css')) {
							var uglified = uglifycss.processFiles([name]);
							fs.writeFileSync(name, uglified);
							// console.log(' - Optimized CSS File ' + name);
						} else if (name.endsWith('.js')) {
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

			if (!fs.existsSync(componentsBuildDir)) {
				fse.mkdirpSync(componentsBuildDir);
			}

			// now run gulp on any component's gulp files
			for (var i = 0; i < comps.length; i++) {
				var compSrcDir = path.join(componentsSrcDir, comps[i]),
					compExist = fs.existsSync(compSrcDir);
				var componentsGulpFile = path.join(compSrcDir, 'gulpfile.js');
				if (compExist && fs.existsSync(componentsGulpFile)) {
					var compBuildSrc = path.join(componentsBuildDir, comps[i]);
					if (fs.existsSync(compBuildSrc)) {
						fse.removeSync(compBuildSrc);
					}
					fse.mkdirSync(compBuildSrc);

					fse.copySync(compSrcDir, compBuildSrc);

					console.log(' - optiomize component ' + comps[i]);
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
				compExist = fs.existsSync(compSrcDir);
			if (compExist) {
				var optimizePath = path.join(componentsBuildDir, comps[i]);
				var srcPath = optimize && fs.existsSync(optimizePath) ? optimizePath : compSrcDir;
				// console.log(' - copy component ' + comps[i] + ' from ' + srcPath);
				fse.copySync(srcPath, path.join(tempBuildDir, 'components', comps[i]));
				console.log(' - component ' + comps[i]);
			}
		}

		// create the zip file
		var zipfile = path.join(projectDir, 'dist', name + '.zip');
		if (fs.existsSync(zipfile)) {
			fse.removeSync(zipfile);
		}

		var dirname = 'Content Template of ' + name,
			dirbase = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate'),
			contentdir = path.join(dirbase, dirname);

		// remove the content directory if it exists and should be excluded
		if (excludeContentTemplate && fs.existsSync(contentdir)) {
			console.log(' - excluding content template');
			fse.removeSync(contentdir);
		}

		if (fs.existsSync(contentdir)) {
			templateName = name;
			templateBuildContentDirBase = dirbase;
			templateBuildContentDirName = dirname;

			var generateZip = gulp.series('create-template-export-zip', 'create-template-zip');
			generateZip(function () {
				return resolve({
					zipfile: zipfile
				});
			});

		} else {
			gulp.src(tempBuildDir + '/**')
				.pipe(zip(name + '.zip'))
				.pipe(gulp.dest(path.join(projectDir, 'dist')))
				.on('end', function () {
					return resolve({
						zipfile: zipfile
					});
				});
		}

		return zipfile;
	});
};

var _exportTemplateUtil = function (argv, name, optimize, excludeContentTemplate, extraComponents) {
	verifyRun(argv);
	return _exportTemplate(name, optimize, excludeContentTemplate, extraComponents);
};

/**
 * Private
 * Import a template
 */
var _importTemplate = function (server, name, folder, zipfile, done) {
	console.log(' - deploy template ' + name);

	var request = serverUtils.getRequest();

	if (server.useRest) {
		serverUtils.loginToServer(server, request).then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			_importTemplateToServerRest(server, name, folder, zipfile).then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
				}
			});
		});
	} else if (server.env !== 'dev_ec') {
		var loginPromise = serverUtils.loginToServer(server, request);

		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var imports = [{
				name: name,
				zipfile: zipfile

			}];
			var importPromise = serverUtils.importToPODServer(server, 'template', folder, imports);
			importPromise.then(function (importResult) {
				// The result processed in the API
				if (importResult && importResult.err || importResult && importResult[0] && importResult[0].err) {
					done();
				} else {
					done(true);
				}
			});
		});
	} else {
		var loginPromise = serverUtils.loginToDevServer(server, request);

		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			// upload the zip file
			var uploadPromise = serverUtils.uploadFileToServer(request, server, folder, zipfile);

			uploadPromise.then(function (result) {
				if (result.err) {
					done();
					return;
				}

				var fileId = result && result.LocalData && result.LocalData.fFileGUID;
				var idcToken = result && result.LocalData && result.LocalData.idcToken;
				// console.log(' - file id ' + fileId + ' idcToken ' + idcToken);

				// import
				if (fileId && idcToken) {
					var importPromise = serverUtils.importTemplateToServer(request, server, fileId, idcToken);
					importPromise.then(function (importResult) {
						var success = false;
						// console.log(importResult);
						if (importResult.err) {
							console.log(' - failed to import: ' + importResult.err);
						} else if (importResult.LocalData && importResult.LocalData.StatusCode !== '0') {
							console.log(' - failed to import: ' + importResult.LocalData.StatusMessage);
						} else if (importResult.LocalData && importResult.LocalData.ImportConflicts) {
							console.log(' - failed to import: the template already exists and you do not have privilege to override it');
						} else if (importResult.JobInfo && importResult.JobInfo.JobStatus && importResult.JobInfo.JobStatus === 'FAILED') {
							console.log(' - failed to import: ' + importResult.JobInfo.JobMessage);
						} else {
							success = true;
							console.log(' - template ' + name + ' imported');
						}
						done(success);
					});
				}
			});
		});
	}
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

var _getServerTemplate = function (request, localhost, name) {
	var sitesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_BROWSE_SITES&siteCount=-1';
		url = url + '&fApplication=framework.site.template';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get template');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
			var sites = [];
			for (var j = 0; j < rows.length; j++) {
				sites.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					sites[j][attr] = rows[j][i];
				}
			}
			var tempGUID;
			for (var i = 0; i < sites.length; i++) {
				if (sites[i].fFolderName === name) {
					tempGUID = sites[i].fFolderGUID;
					break;
				}
			}
			return resolve({
				templateGUID: tempGUID
			});
		});
	});
	return sitesPromise;
};

var _getServerTemplateFromTrash = function (request, localhost, name) {
	return new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE_TRASH';
		url = url + '&fApplication=framework.site.template';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get template from trash');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get template from trash' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.fields || [];
			var rows = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
			var sites = [];
			for (var j = 0; j < rows.length; j++) {
				sites.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					sites[j][attr] = rows[j][i];
				}
			}
			var tempGUID, tempFolderGUID;
			for (var i = 0; i < sites.length; i++) {
				if (sites[i].fFolderName === name) {
					tempGUID = sites[i].fRealItemGUID;
					tempFolderGUID = sites[i].fFolderGUID;
					break;
				}
			}
			return resolve({
				templateGUID: tempGUID,
				templateFolderGUID: tempFolderGUID
			});
		});
	});
};

var _exportServerTemplate = function (request, localhost) {
	var exportPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_EXPORT_TEMPLATE_PACKAGE';

		var options = {
			url: url
		};
		request.post(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to export template:');
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
				console.log('ERROR: Failed to export template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
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

var _getHomeFolderFile = function (request, localhost, fileName) {
	var filesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE_PERSONAL&itemType=File&combinedCount=-1';

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get template zip file');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get template zip file ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.fields || [];
			var rows = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.rows;
			var files = [];
			for (var j = 0; j < rows.length; j++) {
				files.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					files[j][attr] = rows[j][i];
				}
			}
			var fileGUID;
			for (var i = 0; i < files.length; i++) {
				if (files[i].fFileName === fileName) {
					fileGUID = files[i].fFileGUID;
					break;
				}
			}
			return resolve({
				fileGUID: fileGUID
			});
		});
	});
	return filesPromise;
};

var _downloadServerFile = function (request, server, fFileGUID, fileName) {
	var downloadPromise = new Promise(function (resolve, reject) {
		var auth = serverUtils.getRequestAuth(server);
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		var options = {
			url: url,
			auth: auth,
			encoding: null
		};

		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to download file ' + fileName);
				console.log(error);
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
				} catch (e) {}

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
				console.log('ERROR: failed to download file ' + fileName + ' - ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return downloadPromise;
};

var _moveToTrash = function (request, localhost) {
	var deletePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';

		request.post(url, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to delete file ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			} else {
				return resolve(data);
			}
		});
	});
	return deletePromise;
};

var _getFolderFromTrash = function (request, localhost, realItemGUID) {
	var trashPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE_TRASH&itemType=Folder';

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to browse trash');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to browse trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.fields || [];
			var rows = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
			var folders = [];
			for (var j = 0; j < rows.length; j++) {
				folders.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					folders[j][attr] = rows[j][i];
				}
			}
			var folderGUIDInTrash;
			for (var i = 0; i < folders.length; i++) {
				if (folders[i].fRealItemGUID === realItemGUID) {
					folderGUIDInTrash = folders[i].fFolderGUID;
					break;
				}
			}

			return resolve({
				folderGUIDInTrash: folderGUIDInTrash
			});
		});
	});
	return trashPromise;
};

var _deleteFromTrash = function (request, localhost) {
	var deletePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_DELETE_FROM_TRASH';

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to delete from trash');
				console.log(err);
				return resolve({
					'err': err
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to delete from trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			} else {
				return resolve(data);
			}
		});
	});
	return deletePromise;
};

var _IdcCopySites = function (request, server, name, fFolderGUID, doCopyToTemplate, exportPublishedAssets) {
	var copyPromise = new Promise(function (resolve, reject) {

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return resolve({
					err: 'err'
				});
			}

			var express = require('express');
			var app = express();

			var port = '9191';
			var localhost = 'http://localhost:' + port;

			var dUser = '';
			var idcToken;

			var auth = serverUtils.getRequestAuth(server);

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
				if (req.url.indexOf('SCS_COPY_SITES') > 0) {
					var url = server.url + '/documents/web?IdcService=SCS_COPY_SITES';
					var formData = {
						'idcToken': idcToken,
						'names': name,
						'items': 'fFolderGUID:' + fFolderGUID,
						'doCopyToTemplate': doCopyToTemplate,
						'useBackgroundThread': 1,
						'exportPublishedAssets': exportPublishedAssets
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
							console.log('ERROR: Failed to create template:');
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

							url = localhost + '/documents/web?IdcService=SCS_COPY_SITES';

							request.post(url, function (err, response, body) {
								if (err) {
									console.log('ERROR: Failed to create template');
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
									console.log('ERROR: failed to creat template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
									return resolve({
										err: 'err'
									});
								}

								var jobId = data.LocalData.JobID;

								// wait create to finish
								var inter = setInterval(function () {
									var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
									jobPromise.then(function (data) {
										if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
											clearInterval(inter);
											// try to get error message
											var jobDataPromise = serverUtils.getBackgroundServiceJobData(server, request, idcToken, jobId);
											jobDataPromise.then(function (data) {
												console.log('ERROR: create template failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
												return resolve({
													err: 'err'
												});
											});
										}
										if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
											clearInterval(inter);
											console.log(' - create template ' + name + ' finished');

											return resolve({});

										} else {
											console.log(' - creating template: percentage ' + data.JobPercentage);
										}
									});
								}, 5000);
							});
						}
					});

				}, 5000);
			}); // local 
		}); // login
	});
	return copyPromise;
};

var __createTemplateFromSiteSCSUtil = function (argv) {
	verifyRun(argv);
	return _createTemplateFromSiteSCS(argv.server, argv.name, argv.siteName, argv.includeUnpublishedAssets);
};

/**
 * Create template with Idc Service APIs
 * @param {*} server 
 * @param {*} name 
 * @param {*} siteName 
 * @param {*} done 
 */
var _createTemplateFromSiteSCS = function (server, name, siteName, includeUnpublishedAssets) {
	return new Promise(function (resolve, reject) {
		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return resolve({
					err: 'err'
				});
			}

			var express = require('express');
			var app = express();

			var port = '9191';
			var localhost = 'http://localhost:' + port;

			var dUser = '';
			var idcToken;

			var auth = serverUtils.getRequestAuth(server);

			// the site id
			var fFolderGUID;
			var exportPublishedAssets = includeUnpublishedAssets ? 0 : 1;

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options.auth = auth;
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
				if (req.url.indexOf('SCS_COPY_SITES') > 0) {
					var url = server.url + '/documents/web?IdcService=SCS_COPY_SITES';

					var formData = {
						'idcToken': idcToken,
						'names': name,
						'items': 'fFolderGUID:' + fFolderGUID,
						'doCopyToTemplate': 1,
						'useBackgroundThread': 1,
						'exportPublishedAssets': exportPublishedAssets
					};

					var postData = {
						method: 'POST',
						url: url,
						'auth': auth,
						'formData': formData
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
							console.log('ERROR: Failed to create template:');
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

							// verify template
							var templatesPromise = serverUtils.browseSitesOnServer(request, server, 'framework.site.template');
							templatesPromise.then(function (result) {
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
										console.log('ERROR: template ' + name + ' already exists');
										return Promise.reject();
									}

									//
									// verify site
									//
									return serverUtils.browseSitesOnServer(request, server, '', siteName);
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
										console.log('ERROR: site ' + siteName + ' does not exist');
										return Promise.reject();
									}

									console.log(' - get site ');
									fFolderGUID = site.fFolderGUID;

									return _IdcCopySites2(request, localhost, server, idcToken);
								})
								.then(function (result) {
									if (!result.err) {
										console.log(' - create template ' + name + ' finished');
									}
									if (localServer) {
										localServer.close();
									}
									return resolve({});
								})
								.catch((error) => {
									if (localServer) {
										localServer.close();
									}
									return resolve({
										err: 'err'
									});
								});
						}

					}); // get idcToken

				}, 5000);
			}); // local 
		}); // login
	});
};

var _IdcCopySites2 = function (request, localhost, server, idcToken) {
	return new Promise(function (resolve, reject) {
		url = localhost + '/documents/web?IdcService=SCS_COPY_SITES';

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create template');
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
				console.log('ERROR: failed to creat template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;

			// wait create to finish
			var inter = setInterval(function () {
				var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
				jobPromise.then(function (data) {
					if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
						clearInterval(inter);
						// try to get error message
						var jobDataPromise = serverUtils.getBackgroundServiceJobData(server, request, idcToken, jobId);
						jobDataPromise.then(function (data) {
							console.log('ERROR: create template failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
							return resolve({
								err: 'err'
							});
						});
					}
					if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
						clearInterval(inter);
						return resolve({});
					} else {
						console.log(' - creating template: percentage ' + data.JobPercentage);
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
		includeLocale = typeof argv.includeLocale === 'boolean' ? argv.includeLocale : argv.includeLocale === 'true',
		noDetailPages = typeof argv.noDetailPages === 'boolean' ? argv.noDetailPages : argv.noDetailPages === 'true',
		noDefaultDetailPageLink = typeof argv.noDefaultDetailPageLink === 'boolean' ? argv.noDefaultDetailPageLink : argv.noDefaultDetailPageLink === 'true',
		contentLayoutSnippet = typeof argv.contentLayoutSnippet === 'boolean' ? argv.contentLayoutSnippet : argv.contentLayoutSnippet === 'true',
		contentType = argv.type,
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
		noDetailPages: noDetailPages,
		noDefaultDetailPageLink: noDefaultDetailPageLink,
		contentLayoutSnippet: contentLayoutSnippet,
		includeLocale: includeLocale,
		logLevel: 'log',
		outputURL: serverURL + '/templates/' + tempName + '/'
	}).then(function (result) {
		console.log(' *** compiled template is ready to test');
		console.log(' *** to render non-compiled pages, remove compiled files from under: ' + outputFolder);
		done(true);
	}).catch(function (error) {
		console.log(' *** failed to compile template');
		done(false);
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

	sitesRest.getTemplate({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var template = result;
			console.log(' - template GUID: ' + template.id);

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
				console.log(' - template deleted permanently');
			} else {
				console.log(' - template deleted');
			}

			done(true);
		})
		.catch((error) => {
			done();
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
var _createTemplateFromSiteREST = function (server, name, siteName, includeUnpublishedAssets, done) {
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			return Promise.reject();
		}

		// verify template 
		sitesRest.resourceExist({
				server: server,
				type: 'templates',
				name: name
			}).then(function (result) {
				if (!result.err) {
					console.log('ERROR: template ' + name + ' already exists');
					return Promise.reject();
				}

				// verify site
				return sitesRest.getSite({
					server: server,
					name: siteName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				return sitesRest.createTemplateFromSite({
					server: server,
					name: name,
					siteName: siteName,
					includeUnpublishedAssets: includeUnpublishedAssets
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.log(' - create template ' + name + ' finished');

				done(true);
			})
			.catch((error) => {
				done();
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

				console.log(' - export template');

				var prefix = '/documents/api/1.2/files/';
				fileId = result.file;
				fileId = fileId.substring(fileId.indexOf(prefix) + prefix.length);
				fileId = fileId.substring(0, fileId.lastIndexOf('/'));
				// console.log(' - template ' + name + ' export file id ' + fileId);

				return serverRest.downloadFile({
					server: server,
					fFileGUID: fileId
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var destdir = path.join(projectDir, 'dist');
				if (!fs.existsSync(destdir)) {
					fs.mkdirSync(destdir);
				}

				zippath = path.join(destdir, name + '.zip');
				fs.writeFileSync(zippath, result.data);
				console.log(' - template download to ' + zippath);

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
				console.log(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version);
				var fileId = result.id;

				return sitesRest.importTemplate({
					server: server,
					name: name,
					fileId: fileId
				});
			})
			.then(function (results) {
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
 * Create and download template with Idc Service APIs
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
		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return resolve({
					err: 'err'
				});
			}

			var express = require('express');
			var app = express();

			var port = '9191';
			var localhost = 'http://localhost:' + port;

			var dUser = '';
			var idcToken;

			var auth = serverUtils.getRequestAuth(server);

			// the site id
			var fFolderGUID;
			var exportPublishedAssets = includeUnpublishedAssets ? 0 : 1;

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};

					options.auth = auth;
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
				if (req.url.indexOf('SCS_COPY_SITES') > 0) {
					var url = server.url + '/documents/web?IdcService=SCS_COPY_SITES';

					var formData = {
						'idcToken': idcToken,
						'names': name,
						'items': 'fFolderGUID:' + fFolderGUID,
						'doCopyToTemplate': 1,
						'useBackgroundThread': 1,
						'exportPublishedAssets': exportPublishedAssets
					};

					var postData = {
						method: 'POST',
						url: url,
						'auth': auth,
						'formData': formData
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
							console.log('ERROR: Failed to create template:');
							console.log(error);
							return resolve({
								err: 'err'
							});
						})
						.pipe(res)
						.on('finish', function (err) {
							res.end();
						});

				} else if (req.url.indexOf('SCS_EXPORT_TEMPLATE_PACKAGE') > 0) {
					var url = server.url + '/documents/web?IdcService=SCS_EXPORT_TEMPLATE_PACKAGE';
					var formData = {
						'idcToken': idcToken,
						'item': 'fFolderGUID:' + templateId,
						'destination': 'fFolderGUID:' + homeFolderGUID
					};

					var postData = {
						method: 'POST',
						url: url,
						'auth': auth,
						'formData': formData
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
							console.log('ERROR: Failed to export template:');
							console.log(error);
							return resolve({
								err: 'err'
							});
						})
						.pipe(res)
						.on('finish', function (err) {
							res.end();
						});
				} else if (req.url.indexOf('FLD_MOVE_TO_TRASH') > 0) {
					var url = server.url + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';
					var formData = {
						'idcToken': idcToken,
						'items': 'fFileGUID:' + templateZipFileGUID
					};

					var postData = {
						method: 'POST',
						url: url,
						'auth': auth,
						'formData': formData
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
							console.log('ERROR: Failed to delete template zip:');
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

							// verify template
							var templatesPromise = serverUtils.browseSitesOnServer(request, server, 'framework.site.template');
							templatesPromise.then(function (result) {
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
										console.log('ERROR: template ' + name + ' already exists');
										return Promise.reject();
									}

									//
									// verify site
									//
									return serverUtils.browseSitesOnServer(request, server, '');
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
										console.log('ERROR: site ' + siteName + ' does not exist');
										return Promise.reject();
									}

									console.log(' - get site ');
									fFolderGUID = site.fFolderGUID;

									return _IdcCopySites2(request, localhost, server, idcToken);
								})
								.then(function (result) {
									if (result.err) {
										return Promise.reject();
									}

									return serverUtils.browseSitesOnServer(request, server, 'framework.site.template');
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
										console.log('ERROR: failed to get template ' + name);
										return Promise.reject();
									}
									console.log(' - create template ' + name + ' (Id: ' + templateId + ')');

									return serverUtils.queryFolderId(request, server, localhost);
								})
								.then(function (result) {
									// get personal home folder
									if (result.err) {
										return Promise.reject();
									}
									homeFolderGUID = result.folderId;
									// console.log(' - Home folder GUID: ' + homeFolderGUID);

									return _exportServerTemplate(request, localhost);

								})
								.then(function (result) {
									// template exported
									if (result.err) {
										return Promise.reject();
									}
									console.log(' - export template');

									return _getHomeFolderFile(request, localhost, templateZipFile);
								})
								.then(function (result) {
									// get template zip file GUID from the Home folder
									if (result.err) {
										return Promise.reject();
									}

									templateZipFileGUID = result.fileGUID;
									return _downloadServerFile(request, server, templateZipFileGUID, templateZipFile);

								})
								.then(function (result) {
									// zip file downloaded
									if (result.err) {
										return Promise.reject();
									}

									fs.writeFileSync(zippath, result.data);
									console.log(' - template download to ' + zippath);

									var deleteArgv = {
										file: templateZipFile,
										permanent: 'true'
									};
									return documentUtils.deleteFile(deleteArgv, server, false);

								})
								.then(function (result) {

									if (localServer) {
										localServer.close();
									}
									return resolve({});
								})
								.catch((error) => {
									if (error) {
										console.log(error);
									}
									if (localServer) {
										localServer.close();
									}
									return resolve({
										err: 'err'
									});
								});
						}

					}); // get idcToken

				}, 10000);
			}); // local 
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

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var tempPromise = server.useRest ? sitesRest.getTemplate({
				server: server,
				name: name
			}) : serverUtils.browseSitesOnServer(request, server, 'framework.site.template', name);
			tempPromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (server.useRest) {
						tempId = result.id;
					} else {
						var temps = result.data || [];
						for (var i = 0; i < temps.length; i++) {
							if (temps[i].fFolderName.toLowerCase() === name.toLowerCase()) {
								tempId = temps[i].fFolderGUID;
								break;
							}
						}
					}
					if (!tempId) {
						console.log('ERROR: template ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify template');

					return serverRest.getGroups({
						server: server
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (groupNames.length > 0) {
						console.log(' - verify groups');
					}
					// verify groups
					var allGroups = result || [];
					for (var i = 0; i < groupNames.length; i++) {
						var found = false;
						for (var j = 0; j < allGroups.length; j++) {
							if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
								found = true;
								groups.push(allGroups[j]);
								break;
							}
						}
						if (!found) {
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
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

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var tempPromise = server.useRest ? sitesRest.getTemplate({
				server: server,
				name: name
			}) : serverUtils.browseSitesOnServer(request, server, 'framework.site.template', name);
			tempPromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (server.useRest) {
						tempId = result.id;
					} else {
						var temps = result.data || [];
						for (var i = 0; i < temps.length; i++) {
							if (temps[i].fFolderName.toLowerCase() === name.toLowerCase()) {
								tempId = temps[i].fFolderGUID;
								break;
							}
						}
					}
					if (!tempId) {
						console.log('ERROR: template ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify template');

					return serverRest.getGroups({
						server: server
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (groupNames.length > 0) {
						console.log(' - verify groups');
					}
					// verify groups
					var allGroups = result || [];
					for (var i = 0; i < groupNames.length; i++) {
						var found = false;
						for (var j = 0; j < allGroups.length; j++) {
							if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
								found = true;
								groups.push(allGroups[j]);
								break;
							}
						}
						if (!found) {
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
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


// export non "command line" utility functions
module.exports.utils = {
	createTemplateFromSiteAndDownloadSCS: _createTemplateFromSiteAndDownloadSCS,
	unzipTemplate: unzipTemplate,
	unzipTemplateUtil: unzipTemplateUtil,
	zipTemplate: _exportTemplateUtil,
	createLocalTemplateFromSite: _createLocalTemplateFromSiteUtil
};