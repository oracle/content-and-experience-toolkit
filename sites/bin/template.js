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
	serverUtils = require('../test/server/serverUtils.js'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	argv = require('yargs').argv,
	zip = require('gulp-zip');

var Client = require('node-rest-client').Client;

var cecDir = path.join(__dirname, ".."),
	templatesDataDir = path.join(cecDir, 'data', 'templates');

var projectDir,
	componentsSrcDir,
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
	serversSrcDir = path.join(srcfolder, 'servers');
	templatesSrcDir = path.join(srcfolder, 'templates');
	themesSrcDir = path.join(srcfolder, 'themes');

	var buildfolder = serverUtils.getBuildFolder(projectDir);
	templatesBuildDir = path.join(buildfolder, 'templates');

	return true;
}

var _getRequest = function () {
	var request = require('request');
	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		pool: {
			maxSockets: 50
		},
		jar: true,
		proxy: null
	});
	return request;
};

module.exports.createTemplate = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcTempName = argv.source,
		tempName = argv.name,
		template = '',
		seededTemplates = getContents(templatesDataDir);

	if (!srcTempName && !tempName) {
		console.error('ERROR: please run as npm run create-template -- --source <source template> --name <new template name>');
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

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (tempName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(templatesSrcDir + '/' + tempName)) {
			console.error('ERROR: A template with the name ' + tempName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	console.log('Create Template: creating new template ' + tempName + ' from ' + srcTempName);
	var unzipPromise = unzipTemplate(tempName, path.resolve(templatesDataDir + '/' + template), true);
	unzipPromise.then(function (result) {
		done(true);
	});
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

	var zipfile = _exportTemplate(name, optimize);
	// wait the zip file created
	var total = 0;
	var inter = setInterval(function () {
		// console.log(' - total = ' + total);
		if (fs.existsSync(zipfile)) {
			console.log('The template exported to ' + zipfile);
			clearInterval(inter);
			done(true);
			return;
		}
		total += 1;
	}, 2000);
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

	console.log(' *** template is ready to test: http://localhost:8085/templates/' + tempName);
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

	var zipfile = _exportTemplate(name, optimize, excludeContentTemplate);

	// wait the zip file created
	var total = 0;
	var inter = setInterval(function () {
		// console.log(' - total = ' + total);
		if (fs.existsSync(zipfile)) {
			console.log(' - template exported to ' + zipfile);
			clearInterval(inter);
			// import the template to the server
			_importTemplate(server, name, folder, zipfile, done);
			return;
		}
		total += 1;
		if (total >= 10) {
			clearInterval(inter);
			console.log('ERROR: file ' + zipfile + ' does not exist');
		}
	}, 2000);
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
	console.log('Components: ');
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
	console.log('Content Layout mappings:');
	var contentmapfile = path.join(tempSrcDir, 'caas_contenttypemap.json');
	if (fs.existsSync(contentmapfile)) {
		var contenttypes = JSON.parse(fs.readFileSync(contentmapfile));
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

			if (defaultLayout) {
				console.log('        ' + defaultLayout.categoryName + ' => ' + defaultLayout.layoutName);
			}
			if (conentListDefault) {
				console.log('        ' + conentListDefault.categoryName + ' => ' + conentListDefault.layoutName);
			}
			if (emptyListDefault) {
				console.log('        ' + emptyListDefault.categoryName + ' => ' + emptyListDefault.layoutName);
			}
			if (contentPlaceholderDefault) {
				console.log('        ' + contentPlaceholderDefault.categoryName + ' => ' + contentPlaceholderDefault.layoutName);
			}
			for (j = 0; j < mappings.length; j++) {
				console.log('        ' + mappings[j].categoryName + ' => ' + mappings[j].layoutName);
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

	var request = _getRequest();

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
		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

			var total = 0;
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

								return _downloadServerFile(server, templateZipFileGUID);

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
								_cmdEnd(done, localServer, true);
							})
							.catch((error) => {
								_cmdEnd(done, localServer);
							});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_cmdEnd(done, localServer);
					}
				});
			}, 1000);

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

	var request = _getRequest();

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
			if (req.url.indexOf('FLD_MOVE_TO_TRASH') > 0) {
				var url = server.url + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';
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

		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

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
											console.log(' - template deleted permanently')
										}
										_cmdEnd(done, localServer, true);
									})
									.catch((error) => {
										_cmdEnd(done, localServer);
									});
							})
							.catch((error) => {
								_cmdEnd(done, localServer, success);
							});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_cmdEnd(done, localServer);
					}
				});
			}, 1000);

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

		var site;

		_createTemplateFromSiteSCS(server, name, siteName, includeUnpublishedAssets, done);

		/**
		 * wait till sites management API released
		 *
		 *
		var request = serverUtils.getRequest();

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

				// verify template
				return serverUtils.getTemplateFromServer(request, server, name);
			})
			.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
				}

				if (result && result.data && result.data.id) {
					console.log('ERROR: template ' + name + ' already exists');
					_cmdEnd(done);
				}
				console.log(' - get template');

				// verify site
				return serverUtils.getSiteFromServer(request, server, siteName);
			})
			.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
				}

				if (!result || !result.data || !result.data.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					_cmdEnd(done);
				}
				site = result.data;
				console.log(' - get site');

				// create template (using IdcService for now)
				var exportPublishedAssets = includeUnpublishedAssets ? 0 : 1;
				return _IdcCopySites(request, server, name, site.id, 1, exportPublishedAssets);
			})
			.then(function (result) {

				_cmdEnd(done);

			});
			*/
	} catch (err) {
		console.log(err);
		_cmdEnd(done)
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
	if (appType === 'sectionlayout' || appType === 'contentlayout') {
		console.error('ERROR: The content layout cannot be added to the theme');
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
					console.log(' *** template is ready to test: http://localhost:8085/templates/' + tempName);
					return resolve({});
				});
			} else {
				console.log(' *** template is ready to test: http://localhost:8085/templates/' + tempName);
				return resolve({});
			}
		});
	});
	return unzipPromise;
};


/**
 * Private
 * Export a template
 */
var _exportTemplate = function (name, optimize, excludeContentTemplate) {
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
		return;
	}

	var themeSrcDir = path.join(themesSrcDir, themeName);
	if (!fs.existsSync(siteinfofile)) {
		console.error('ERROR: theme path does not exist ' + themeSrcDir);
		return;
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

	// create the components dir (required even the template doesn not have any custom component)
	fs.mkdirSync(path.join(tempBuildDir, 'components'));

	// copy customer components to buid dir: <template name>/components/
	for (var i = 0; i < comps.length; i++) {
		var compSrcDir = path.join(componentsSrcDir, comps[i]),
			compExist = fs.existsSync(compSrcDir);
		if (compExist) {
			fse.copySync(compSrcDir, path.join(tempBuildDir, 'components', comps[i]));
			console.log(' - component ' + comps[i]);
		}
	}

	// Optimize if requested
	if (optimize) {
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
		console.log(' - exluding content template');
		fse.removeSync(contentdir);
	}

	if (fs.existsSync(contentdir)) {
		templateName = name;
		templateBuildContentDirBase = dirbase;
		templateBuildContentDirName = dirname;

		var generateZip = gulp.series('create-template-export-zip', 'create-template-zip');
		generateZip();

	} else {
		gulp.src(tempBuildDir + '/**')
			.pipe(zip(name + '.zip'))
			.pipe(gulp.dest(path.join(projectDir, 'dist')));
	}

	return zipfile;
};
/**
 * Private
 * Import a template
 */
var _importTemplate = function (server, name, folder, zipfile, done) {
	console.log(' - deploy template ' + name);

	var request = require('request');
	request = request.defaults({
		jar: true,
		proxy: null
	});

	if (server.env !== 'dev_ec') {
		var loginPromise = server.env === 'dev_osso' ? serverUtils.loginToSSOServer(server) : serverUtils.loginToPODServer(server);

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
				if (importResult && importResult.err) {
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
						// console.log(importResult);
						var success = false;
						if (importResult.err) {
							console.log(' - failed to import: ' + importResult.err);
						} else if (importResult.LocalData && importResult.LocalData.StatusCode !== '0') {
							console.log(' - failed to import: ' + importResult.LocalData.StatusMessage);
						} else if (importResult.LocalData && importResult.LocalData.ImportConflicts) {
							console.log(' - failed to import: the template already exists and you do not have privilege to override it');
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

var _cmdEnd = function (done, localServer, success) {
	if (localServer) {
		localServer.close();
	}
	done(success);
};

var _getServerTemplate = function (request, localhost, name) {
	var sitesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_BROWSE_SITES';
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
			var sites = []
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
				if (sites[i]['fFolderName'] === name) {
					tempGUID = sites[i]['fFolderGUID'];
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

var _exportServerTemplate = function (request, localhost) {
	var exportPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_EXPORT_TEMPLATE_PACKAGE';

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
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE_PERSONAL&itemType=File';

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
			var files = []
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
				if (files[i]['fFileName'] === fileName) {
					fileGUID = files[i]['fFileGUID'];
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

var _downloadServerFile = function (server, fFileGUID) {
	var downloadPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve({
					data: data
				});
			} else {
				var result;
				try {
					result = JSON.parse(data);
				} catch (error) {};
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
				console.log('ERROR: failed to download job: ' + msg);
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
			var folders = []
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
				if (folders[i]['fRealItemGUID'] === realItemGUID) {
					folderGUIDInTrash = folders[i]['fFolderGUID'];
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

				}, 1000);
			}); // local 
		}); // login
	});
	return copyPromise;
};

/**
 * Create template with Idc Service APIs
 * @param {*} server 
 * @param {*} name 
 * @param {*} siteName 
 * @param {*} done 
 */
var _createTemplateFromSiteSCS = function (server, name, siteName, includeUnpublishedAssets, done) {
	var request = serverUtils.getRequest();

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
								return serverUtils.browseSitesOnServer(request, server);
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
								_cmdEnd(done, localServer, true);
							})
							.catch((error) => {
								_cmdEnd(done, localServer);
							});
					}

				}); // get idcToken

			}, 1000);
		}); // local 
	}); // login
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

	var compiler = require('./compiler/compiler');

	if (typeof compiler.compileSite === 'function') {
		compiler.compileSite({
			siteFolder: path.join(templatesSrcDir, tempName),
			outputFolder: path.join(templatesSrcDir, tempName, 'assets', 'pages'),
			themesFolder: themesSrcDir,
			sitesCloudRuntimeFolder: undefined,
			componentsFolder: componentsSrcDir,
			channelToken: channelToken,
			logLevel: 'log',
			outputURL: 'http://localhost:8085/templates/' + tempName + '/assets/pages/'
		});
	}


	console.log(' *** compiled template is ready to test');
	done(true);
};