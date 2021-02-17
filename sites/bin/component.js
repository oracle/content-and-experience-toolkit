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
	childProcess = require('child_process'),
	gulp = require('gulp'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	zip = require('gulp-zip');

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

var cecDir = path.join(__dirname, ".."),
	componentsDataDir = path.join(cecDir, 'data', 'components');

var projectDir,
	buildDir,
	componentsBuildDir,
	componentsSrcDir,
	serversSrcDir;

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	serversSrcDir = path.join(srcfolder, 'servers');

	buildDir = serverUtils.getBuildFolder(projectDir);
	componentsBuildDir = path.join(buildDir, 'components');

	return true;
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

/**
 * Create component
 */
module.exports.createComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcCompName = argv.source,
		compName = argv.name,
		comp = '',
		seededComponents = getContents(componentsDataDir);

	if (!srcCompName && !compName) {
		console.error('ERROR: please run as npm run create-component -- --source <source component> --name <new component name>');
		done();
		return;
	}
	if (!srcCompName) {
		console.error('ERROR: please use --source to specify the source component zip');
		done();
		return;
	}
	if (!compName) {
		console.error('ERROR: please use --name to specify the new component name');
		done();
		return;
	}

	// verify the source component zip
	for (var i = 0; i < seededComponents.length; i++) {
		if (srcCompName + '.zip' === seededComponents[i]) {
			comp = seededComponents[i];
			break;
		}
	}
	if (!comp) {
		console.error('ERROR: invalid source component ' + srcCompName);
		done();
		return;
	}

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (compName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(componentsSrcDir + '/' + compName)) {
			console.error('ERROR: A component with the name ' + compName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	console.log('Create Component: creating new component ' + compName + ' from ' + srcCompName);
	_createComponent(comp, compName, done);
};

/**
 * private
 * create a component from the zip file fixing the GUID and component id
 */
var _createComponent = function (componentZipName, compName, done) {

	// Create the directory
	var componentDir = path.join(componentsSrcDir, compName);
	fs.mkdirSync(componentDir);

	// Unzip the component and fix the id
	fileUtils.extractZip(path.join(componentsDataDir, componentZipName), componentDir)
		.then(function (err) {
			if (err) {
				reject(err);
			}

			// remove the extra directory caused by unzip
			serverUtils.stripTopDirectory(componentDir).then(() => {

				// Fix the component id
				var filepath = path.join(componentDir, 'appinfo.json');
				if (fs.existsSync(filepath)) {
					var appinfostr = fs.readFileSync(filepath),
						appinfojson = JSON.parse(appinfostr),
						oldId = appinfojson.id,
						newId = compName;
					appinfojson.id = newId;
					if (appinfojson.hasOwnProperty('name')) {
						appinfojson.name = compName;
					}
					if (appinfojson.initialData) {
						appinfojson.initialData.componentId = newId;
					}
					console.log(' - update component Id ' + oldId + ' to ' + newId);
					fs.writeFileSync(filepath, JSON.stringify(appinfojson));
				}

				// Fix the component itemGUID
				filepath = path.join(componentDir, '/_folder.json');
				if (fs.existsSync(filepath)) {
					var folderstr = fs.readFileSync(filepath),
						folderjson = JSON.parse(folderstr),
						oldGUID = folderjson.itemGUID,
						newGUID = serverUtils.createGUID();
					folderjson.itemGUID = newGUID;
					console.log(' - update component GUID ' + oldGUID + ' to ' + newGUID);
					fs.writeFileSync(filepath, JSON.stringify(folderjson));
				}

				console.log(` - component ${compName} created at ${componentDir}`);
				console.log(`To rename the component, rename the directory ${componentDir}`);

				done(true);
			});
		});
};

/**
 * Copy component
 */
module.exports.copyComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcCompName = argv.source,
		compName = argv.name,
		comp = '',
		existingComponents = getContents(componentsSrcDir);

	if (!srcCompName && !compName) {
		console.error('ERROR: please run as npm run copy-component -- --source <source component> --name <new component name>');
		done();
		return;
	}
	if (!srcCompName) {
		console.error('ERROR: please use --source to specify the source component name');
		done();
		return;
	}
	if (!compName) {
		console.error('ERROR: please use --name to specify the new component name');
		done();
		return;
	}

	// verify the source component
	for (var i = 0; i < existingComponents.length; i++) {
		if (srcCompName === existingComponents[i]) {
			comp = existingComponents[i];
			break;
		}
	}
	if (!comp) {
		console.error('ERROR: invalid source component ' + srcCompName);
		done();
		return;
	}

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (compName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(path.join(componentsSrcDir, compName))) {
			console.error('ERROR: A component with the name ' + compName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	// copy all files
	fse.copySync(path.join(componentsSrcDir, srcCompName), path.join(componentsSrcDir, compName));

	// update itemGUID
	if (serverUtils.updateItemFolderJson(projectDir, 'component', compName)) {
		// update appinfo.json 
		var appinfoPath = path.join(componentsSrcDir, compName, 'appinfo.json');
		if (fs.existsSync(appinfoPath)) {
			var appinfojson = JSON.parse(fs.readFileSync(appinfoPath));
			appinfojson.id = compName;
			console.log(' - update component id to ' + compName);
			fs.writeFileSync(appinfoPath, JSON.stringify(appinfojson));
			// fs.writeFileSync(appinfoPath, JSON.stringify(appinfojson, null, 4));
		}
		console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
		done(true);
	} else {
		done();
	}
};

var _argv_component;

/**
 * Copy one component source to build folder, optimize if needed.
 */
gulp.task('dist', function (done) {
	'use strict';

	// console.log(' - clean up folder ' + buildDir);
	fileUtils.remove(buildDir);

	if (_argv_component) {

		var components = _argv_component.split(',');
		for (var i = 0; i < components.length; i++) {
			if (fs.existsSync(componentsSrcDir + '/' + components[i])) {
				console.log(` - copying ${components[i]} component `);
				// Copy the components to the build folder
				fse.copySync(path.join(componentsSrcDir, components[i]), path.join(componentsBuildDir, components[i]));
			}
		}
	}

	done();
});

/**
 * Private
 * Optimize a component if needed
 */
var optimizeComponent = function (componentName) {
	'use strict';
	if (!componentName || typeof componentName !== 'string') {
		console.error('Error:  please specify the component name');
		return;
	}

	let compGulpFile = path.join(componentsSrcDir, componentName, 'gulpfile.js');
	if (fs.existsSync(compGulpFile)) {
		// Run 'gulp' under the components directory
		var compBuild = childProcess.spawnSync(npmCmd, ['run', 'gulp', compGulpFile], {
			stdio: 'inherit'
		});
		return compBuild.status;
	} else {
		console.log(`Optimization is not enabled for the component ${componentName}`);
		return 0;
	}
};

/**
 * Copy one component source to build folder, optimize if needed.
 */
gulp.task('optimize', function (done) {
	'use strict';

	if (_argv_component) {
		var components = _argv_component.split(',');
		for (var i = 0; i < components.length; i++) {
			if (fs.existsSync(path.join(componentsSrcDir, components[i]))) {
				console.log(` - optimizing component ${components[i]}`);
				optimizeComponent(components[i]);
			}
		}
	}
	done();
});

/**
 * Create a component zip file
 */
gulp.task('create-component-zip', function (done) {
	'use strict';

	var destDir = path.join(projectDir, 'dist');
	var components = _argv_component.split(',');
	var tasks = components.map(function (comp, idx) {
		if (fs.existsSync(path.join(componentsSrcDir, comp))) {
			return gulp.src(`${componentsBuildDir}/${comp}/**/*`, {
					base: componentsBuildDir
				})
				.pipe(zip(`${comp}.zip`))
				.pipe(gulp.dest(destDir))
				.on('end', function () {
					var zippath = path.join(destDir, comp + '.zip');
					console.log(' - created zip file ' + zippath);
					if (idx === components.length - 1) {
						done();
					}
				});
		}
	});
	return tasks;
});

/**
 * Export component
 */
module.exports.exportComponent = function (argv, done) {
	if (!verifyRun(argv)) {
		done();
		return;
	}

	_exportComponent(argv).then(function (result) {
		if (result && result.err) {
			done();
		} else {
			done(true);
		}
	});
};

var _exportComponent = function (argv) {
	'use strict';
	verifyRun(argv);
	return new Promise(function (resolve, reject) {

		if (!fs.existsSync(componentsSrcDir)) {
			console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
			return resolve({
				err: 'err'
			});
		}

		if (!argv.component || typeof argv.component !== 'string') {
			console.error('Usage: npm run export-component <componentName>');
			return resolve({
				err: 'err'
			});
		} else {
			var components = argv.component.split(',');
			var validCompNum = 0;
			for (var i = 0; i < components.length; i++) {
				if (!fs.existsSync(path.join(componentsSrcDir, components[i]))) {
					console.error(`Error: Component ${components[i]} doesn't exist`);
				} else {
					validCompNum += 1;
				}
			}

			if (validCompNum > 0) {
				_argv_component = argv.component;
				var exportSeries;
				if (argv.noOptimize) {
					exportSeries = gulp.series('dist', 'create-component-zip');
				} else {
					exportSeries = gulp.series('dist', 'optimize', 'create-component-zip');
				}
				exportSeries(function () {
					return resolve({});
				});
			} else {
				return resolve({
					err: 'err'
				});
			}
		}
	});
};


/**
 * Deploy component to server
 */
module.exports.deployComponent = function (argv, done) {
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

	if (!argv.component || typeof argv.component !== 'string') {
		console.error('Usage: npm run deploy <componentName>');
		done();
		return;
	}

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

	var folder = argv.folder && argv.folder.toString();
	if (folder === '/') {
		folder = '';
	} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
		console.log('ERROR: invalid folder');
		done();
		return;
	}

	// Support a list of components
	var components = argv.component.split(',');
	var allComps = [];

	for (var i = 0; i < components.length; i++) {
		if (!fs.existsSync(path.join(componentsSrcDir, components[i]))) {
			console.error(`Error: Component ${components[i]} doesn't exist`);
		} else {
			allComps.push(components[i]);
		}
	}
	if (allComps.length === 0) {
		done();
		return;
	}

	// Remove invalid component
	argv.component = allComps.join();

	var exportTask = _exportComponent(argv);
	exportTask.then(function (result) {
		if (result.err) {
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

			var folderPromises = [];
			if (folder) {
				folderPromises.push(serverRest.findFolderHierarchy({
					server: server,
					parentID: 'self',
					folderPath: folder
				}));
			}
			Promise.all(folderPromises).then(function (results) {
				if (folder && (!results || results.length === 0 || !results[0] || !results[0].id)) {
					done();
					return;
				}

				var folderId = folder ? results[0].id : 'self';

				var importsPromise = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";

					importsPromise[i] = _deployOneComponentREST(server, folder, folderId, zipfile, name, publish);
				}
				Promise.all(importsPromise).then(function (results) {
					// All done
					var success = false;
					if (results && results.length > 0) {
						for (var i = 0; i < results.length; i++) {
							if (!results[i].err) {
								success = true;
								break;
							}
						}
					}
					done(success);
				});
			});

		}); // login 

	}); // export
};

/** 
 * private
 * unzip component zip file and copy to /src
 */
var unzipComponent = function (compName, compPath) {
	return new Promise(function (resolve, reject) {
		// create dir in src
		var compSrcDir = path.join(componentsSrcDir, compName);
		fileUtils.remove(compSrcDir);

		// unzip /src/main/components/<comp name>/
		fileUtils.extractZip(compPath, componentsSrcDir)
			.then(function (err) {
				// if an error occured, report it
				if (err) {
					reject(err);
				}
				resolve({
					comp: compName
				});
			});
	});
};

var _deployOneComponentREST = function (server, folder, folderId, zipfile, name, publish) {
	return new Promise(function (resolve, reject) {
		var fileName = name + '.zip';
		// upload file
		var fileId;
		var startTime;
		serverRest.createFile({
				server: server,
				parentID: folderId,
				filename: fileName,
				contents: fs.readFileSync(zipfile)
			}).then(function (result) {
				if (!result || !result.id) {
					return Promise.reject();
				}
				console.log(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version);
				fileId = result.id;
				startTime = new Date();
				return sitesRest.importComponent({
					server: server,
					name: name,
					fileId: fileId
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// console.log(result);
				if (result.newName && result.newName !== name) {
					console.log(' - component imported and renamed to ' + result.newName + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					name = result.newName;
				} else {
					console.log(' - component ' + name + ' imported [' + serverUtils.timeUsed(startTime, new Date()) + ']');
				}
				var publishpromises = [];
				if (publish) {
					publishpromises.push(sitesRest.publishComponent({
						server: server,
						name: name
					}));
				}

				startTime = new Date();
				return Promise.all(publishpromises);
			})
			.then(function (results) {
				if (publish) {
					if (results && results[0] && results[0].err) {
						return Promise.reject();
					} else {
						console.log(' - component ' + name + ' published/republished [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						resolve({
							fileId: fileId
						});
					}
				} else {
					resolve({
						fileId: fileId
					});
				}
			})
			.catch((error) => {
				resolve({
					err: 'err',
					name: name
				});
			});
	});
};

/**
 * Import component
 */
module.exports.importComponent = function (argv, done) {
	'use strict';
	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (typeof argv.path !== 'string') {
		console.error('ERROR: please specify the component zip file');
		done();
		return;
	}
	var compPath = argv.path;
	if (!path.isAbsolute(compPath)) {
		compPath = path.join(projectDir, compPath);
	}
	compPath = path.resolve(compPath);

	if (!fs.existsSync(compPath)) {
		console.log('ERROR: file ' + compPath + ' does not exist');
		done();
		return;
	}

	var compName = compPath.substring(compPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	// console.log('Import Component: importing component name=' + compName + ' path=' + compPath);
	unzipComponent(compName, compPath).then(function (result) {
		console.log(' - import component to ' + path.join(componentsSrcDir, compName));
		console.log(' - component is ready to test: http://localhost:8085/components/' + compName);
		done(true);
	});
};

/**
 * Download components from server
 */
module.exports.downloadComponent = function (argv, done) {
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

	// Support a list of components
	var components = argv.component.split(',');

	try {
		_downloadComponents(serverName, server, components, done);
	} catch (e) {
		console.log(e);
		done();
	}
};

var _downloadComponents = function (serverName, server, componentNames, done) {
	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_downloadComponentsREST(server, componentNames)
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
				}
			});

	}); // login
};

var _downloadComponentsREST = function (server, componentNames, argv) {
	if (argv) {
		verifyRun(argv);
	}
	return new Promise(function (resolve, reject) {
		var compPromises = [];
		for (var i = 0; i < componentNames.length; i++) {
			compPromises.push(sitesRest.getComponent({
				server: server,
				name: componentNames[i]
			}));
		}

		var comps = [];
		var exportedComps = [];
		var exportSuccess = false;
		Promise.all(compPromises).then(function (results) {
				var allComps = results || [];
				for (var i = 0; i < componentNames.length; i++) {
					var found = false;
					var compName = componentNames[i];
					for (var j = 0; j < allComps.length; j++) {
						if (allComps[j].name && compName.toLowerCase() === allComps[j].name.toLowerCase()) {
							found = true;
							comps.push(allComps[j]);
							break;
						}
					}

					if (!found) {
						// console.log('ERROR: component ' + compName + ' does not exist');
						// return Promise.reject();
					}
				}
				// console.log(' - get components');
				var exportPromises = [];
				for (var i = 0; i < comps.length; i++) {
					exportPromises.push(sitesRest.exportComponent({
						server: server,
						id: comps[i].id
					}));
				}

				return Promise.all(exportPromises);

			})
			.then(function (results) {
				var exportFiles = results || [];
				var prefix = '/documents/api/1.2/files/';
				for (var i = 0; i < comps.length; i++) {
					var exported = false;
					for (var j = 0; j < exportFiles.length; j++) {
						if (comps[i].id === exportFiles[j].id && exportFiles[j].file) {
							exported = true;
							var fileId = exportFiles[j].file;
							fileId = fileId.substring(fileId.indexOf(prefix) + prefix.length);
							fileId = fileId.substring(0, fileId.lastIndexOf('/'));
							// console.log(' - comp ' + comps[i].name + ' export file id ' + fileId);
							exportedComps.push({
								id: comps[i].id,
								name: comps[i].name,
								fileId: fileId,
							});

						}
					}

					if (!exported) {
						console.log('ERROR: failed to export component ' + comps[i].name);
					}
				}
				if (exportedComps.length === 0) {
					return Promise.reject();
				}

				var downloadPromises = [];
				for (var i = 0; i < exportedComps.length; i++) {
					downloadPromises.push(serverRest.downloadFile({
						server: server,
						fFileGUID: exportedComps[i].fileId
					}));
				}

				return Promise.all(downloadPromises);
			})
			.then(function (results) {

				var destdir = path.join(projectDir, 'dist');
				if (!fs.existsSync(destdir)) {
					fs.mkdirSync(destdir);
				}

				var unzipPromises = [];
				for (var i = 0; i < exportedComps.length; i++) {
					for (var j = 0; j < results.length; j++) {
						if (exportedComps[i].fileId === results[j].id) {
							var targetFile = path.join(destdir, exportedComps[i].name + '.zip');
							fs.writeFileSync(targetFile, results[i].data);
							console.log(' - save file ' + targetFile);
							exportSuccess = true;
							unzipPromises.push(unzipComponent(exportedComps[i].name, targetFile));
						}
					}
				}
				return Promise.all(unzipPromises);
			})
			.then(function (results) {
				for (var i = 0; i < results.length; i++) {
					if (results[i].comp) {
						console.log(' - import component to ' + path.join(componentsSrcDir, results[i].comp));
					}
				}

				var deleteFilePromises = [];
				for (var i = 0; i < exportedComps.length; i++) {
					deleteFilePromises.push(serverRest.deleteFile({
						server: server,
						fFileGUID: exportedComps[i].fileId
					}));
				}
				// delete the zip file on the server
				return Promise.all(deleteFilePromises);
			})
			.then(function (results) {
				if (exportSuccess) {
					resolve({});
				} else {
					resolve({
						err: 'err'
					});
				}
			})
			.catch((error) => {
				resolve({
					err: 'err'
				});
			});
	});
};

/**
 * control components on server
 */
module.exports.controlComponent = function (argv, done) {
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

	// Support a list of components
	var components = argv.components.split(',');
	var action = argv.action;

	try {
		_controlComponents(serverName, server, action, components, done);
	} catch (e) {
		console.log(e);
		done();
	}
};

var _controlComponents = function (serverName, server, action, componentNames, done) {

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_controlComponentsREST(server, componentNames, done);

	}); // login
};

var _controlComponentsREST = function (server, componentNames, done) {

	var compPromises = [];
	for (var i = 0; i < componentNames.length; i++) {
		compPromises.push(sitesRest.getComponent({
			server: server,
			name: componentNames[i]
		}));
	}

	var comps = [];
	var publishedComps = [];
	var publishSuccess = false;
	Promise.all(compPromises).then(function (results) {
			var allComps = results || [];
			for (var i = 0; i < componentNames.length; i++) {
				var found = false;
				var compName = componentNames[i];
				for (var j = 0; j < allComps.length; j++) {
					if (allComps[j].name && compName.toLowerCase() === allComps[j].name.toLowerCase()) {
						found = true;
						comps.push(allComps[j]);
						break;
					}
				}

				if (!found) {
					// console.log('ERROR: component ' + compName + ' does not exist');
					// return Promise.reject();
				}
			}

			var publishPromises = [];
			for (var i = 0; i < comps.length; i++) {
				publishPromises.push(sitesRest.publishComponent({
					server: server,
					id: comps[i].id,
					name: comps[i].name
				}));
			}

			return Promise.all(publishPromises);
		})
		.then(function (results) {

			var success = false;
			for (var i = 0; i < results.length; i++) {
				if (results[i].id) {
					console.log(' - publish ' + results[i].name + ' finished');
					success = true;
				}
			}

			done(success);
		})
		.catch((error) => {
			done();
		});
};

/**
 * share component
 */
module.exports.shareComponent = function (argv, done) {
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

		// console.log('server: ' + server.url);
		var name = argv.name;
		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];
		var role = argv.role;

		var compId;
		var users = [];
		var groups = [];
		var osnConnection;

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var compPromise = sitesRest.getComponent({
				server: server,
				name: name
			});
			compPromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					compId = result.id;

					if (!compId) {
						console.log('ERROR: component ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify component');

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
				.then(function (results) {

					if (groupNames.length > 0) {
						console.log(' - verify groups');
						// verify groups
						var allGroups = results || [];
						for (i = 0; i < groupNames.length; i++) {
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
						id: compId
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
							id: compId,
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
							id: compId,
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
								results[i].role + '" on component ' + name);
						} else {
							console.log('ERROR: ' + results[i].title);
						}
					}
					done(shared);
				})
				.catch((error) => {
					done();
				});
		}); // login
	} catch (e) {
		done();
	}
};

/**
 * unshare component
 */
module.exports.unshareComponent = function (argv, done) {
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

		// console.log('server: ' + server.url);
		var name = argv.name;
		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];

		var compId;
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

			var compPromise = sitesRest.getComponent({
				server: server,
				name: name
			});
			compPromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					compId = result.id;

					if (!compId) {
						console.log('ERROR: component ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify component');

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
						id: compId
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
								id: compId,
								userId: users[i].id
							}));
						} else {
							console.log(' - user ' + users[i].loginName + ' has no access to the component');
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
								id: compId,
								userId: groups[i].groupID
							}));
						} else {
							console.log(' - group ' + (groups[i].displayName || groups[i].name) + ' has no access to the component');
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
							console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + '\'s access to the component removed');
						} else {
							console.log('ERROR: ' + results[i].title);
						}
					}
					done(unshared);
				})
				.catch((error) => {
					done();
				});
		}); // login
	} catch (e) {
		done();
	}
};

// export non "command line" utility functions
module.exports.utils = {
	downloadComponents: _downloadComponentsREST,
	uploadComponent: _deployOneComponentREST,
	exportComponents: _exportComponent
};