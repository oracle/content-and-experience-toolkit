/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	decompress = require('decompress'),
	childProcess = require('child_process'),
	gulp = require('gulp'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var Client = require('node-rest-client').Client;

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

var _cmdEnd = function (done, localServer) {
	done();
	if (localServer) {
		localServer.close();
	}
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
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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
	decompress(path.join(componentsDataDir, componentZipName), componentDir, {
		strip: 1
	}).then(() => {

		// Fix the component id
		var filepath = path.join(componentDir, 'appinfo.json');
		if (fs.existsSync(filepath)) {
			var appinfostr = fse.readFileSync(filepath),
				appinfojson = JSON.parse(appinfostr),
				oldId = appinfojson.id,
				newId = compName;
			appinfojson.id = newId;
			if (appinfojson.initialData) {
				appinfojson.initialData.componentId = newId;
			}
			console.log(' - update component Id ' + oldId + ' to ' + newId);
			fs.writeFileSync(filepath, JSON.stringify(appinfojson));
		}

		// Fix the component itemGUID
		filepath = path.join(componentDir, '/_folder.json');
		if (fs.existsSync(filepath)) {
			var folderstr = fse.readFileSync(filepath),
				folderjson = JSON.parse(folderstr),
				oldGUID = folderjson.itemGUID,
				newGUID = serverUtils.createGUID();
			folderjson.itemGUID = newGUID;
			console.log(' - update component GUID ' + oldGUID + ' to ' + newGUID);
			fs.writeFileSync(filepath, JSON.stringify(folderjson));
		}

		console.log(` - component ${compName} created at ${componentDir}`);
		console.log(`To rename the component, rename the directory ${componentDir}`);

		done();
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
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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
		console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
		done();
	}
};

var _argv_component;

/**
 * Copy one component source to build folder, optimize if needed.
 */
gulp.task('dist', function (done) {
	'use strict';

	if (fs.existsSync(buildDir)) {
		// console.log(' - clean up folder ' + buildDir);
		fse.removeSync(buildDir);
	}

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
		done();
	});
};

var _exportComponent = function (argv) {
	'use strict';

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
				var exportSeries = gulp.series('dist', 'optimize', 'create-component-zip');
				exportSeries(function () {
					return resolve({});
				});
			} else {
				return resolve({});
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
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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

		if (server.env === 'pod_ec') {
			var loginPromise = serverUtils.loginToPODServer(server);

			loginPromise.then(function (result) {
				if (!result.status) {
					console.log(' - failed to connect to the server');
					done();
					return;
				}

				var imports = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";
					imports.push({
						name: name,
						zipfile: zipfile
					});
				}

				var importPromise = serverUtils.importToPODServer(server, 'component', folder, imports, publish);
				importPromise.then(function (importResult) {
					// result is processed in the API
					done();
				});
			});
		} else {
			var request = require('request');
			request = request.defaults({
				jar: true,
				proxy: null
			});

			var loginPromise = serverUtils.loginToDevServer(server, request);

			loginPromise.then(function (result) {
				if (!result.status) {
					console.log(' - failed to connect to the server');
					done();
					return;
				}

				var importsPromise = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";

					importsPromise[i] = _deployOneComponentToDevServer(request, server, folder, zipfile, name, publish);
				}
				Promise.all(importsPromise).then(function (values) {
					// All done
					done();
				});

			}); // login 
		} // dev server case
	}); // export
};

var _deployOneComponentToDevServer = function (request, server, folder, zipfile, name, publish) {
	var deployOneCompPromise = new Promise(function (resolve, reject) {
		// upload the zip file
		var uploadPromise = serverUtils.uploadFileToServer(request, server, folder, zipfile);

		uploadPromise.then(function (result) {
			if (result.err) {
				return resolve({});
			}

			var fileId = result && result.LocalData && result.LocalData.fFileGUID;
			var idcToken = result && result.LocalData && result.LocalData.idcToken;
			// console.log(' - name ' + name + ' file id ' + fileId + ' idcToken ' + idcToken);

			// import
			var importPromise = serverUtils.importComponentToServer(request, server, fileId, idcToken);
			importPromise.then(function (importResult) {
				// console.log(JSON.stringify(importResult));
				if (importResult.err) {
					console.log(' - failed to import: ' + importResult.err);
					return resolve({});
				} else {
					if (!importResult.LocalData || importResult.LocalData.StatusCode !== '0') {
						console.log(' - failed to import: ' + importResult.LocalData ? importResult.LocalData.StatusMessage : '');
						return resolve({});
					}

					console.log(' - component ' + name + ' imported');
					var compFolderId = serverUtils.getComponentAttribute(importResult, 'fFolderGUID');
					if (publish && compFolderId) {
						// publish the component
						var publishPromise = serverUtils.publishComponentOnServer(request, server, compFolderId, idcToken);
						publishPromise.then(function (publishResult) {
							// console.log(publishResult);
							if (publishResult.err) {
								console.log(' - failed to publish: ' + publishResult.err);
							} else if (!publishResult.LocalData || publishResult.LocalData.StatusCode !== '0') {
								console.log(' - failed to publish: ' + publishResult.LocalData ? publishResult.LocalData.StatusMessage : '');
							} else {
								console.log(' - component ' + name + ' published/republished');
							}
							return resolve({});
						});
					} else {
						return resolve({});
					}
				}
			}); // import
		}); // upload
	});

	return deployOneCompPromise;
};

/** 
 * private
 * unzip component zip file and copy to /src
 */
var unzipComponent = function (compName, compPath) {
	return new Promise(function (resolve, reject) {
		// create dir in src
		var compSrcDir = path.join(componentsSrcDir, compName);
		if (fs.existsSync(compSrcDir)) {
			fse.removeSync(compSrcDir);
		}

		// unzip /src/main/components/<comp name>/
		decompress(compPath, componentsSrcDir).then(() => {
			resolve({
				comp: compName
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
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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
		done();
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

	// Support a list of components
	var components = argv.component.split(',');

	try {
		_downloadComponents(serverName, server, components, done);
	} catch (e) {
		console.log(e);
	}
};

var _downloadComponents = function (serverName, server, componentNames, done) {
	var isPod = server.env === 'pod_ec';

	var request = serverUtils.getRequest();

	var localServer;

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

		var components = [];
		var homeFolderGUID;
		var deleteFileGUIDs = [];

		var destdir = path.join(projectDir, 'dist');
		if (!fs.existsSync(destdir)) {
			fs.mkdirSync(destdir);
		}

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
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var compId = params.compId;
			var url = server.url + '/documents/web?IdcService=SCS_EXPORT_COMPONENT';
			var formData = {
				'idcToken': idcToken,
				'item': 'fFolderGUID:' + compId,
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
					console.log('ERROR: Failed to export component');
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

		localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

			var inter = setInterval(function () {
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					homeFolderGUID = 'F:USER:' + dUser;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						clearInterval(inter);
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken + ' home folder: ' + homeFolderGUID);
						console.log(' - establish user session');

						// verify components
						var compPromise = serverUtils.browseComponentsOnServer(request, server);
						compPromise.then(function (result) {
								if (result.err) {
									return Promise.reject();
								}

								var comps = result.data || [];

								for (var i = 0; i < componentNames.length; i++) {
									var compName = componentNames[i];
									var found = false;
									for (var j = 0; j < comps.length; j++) {
										if (compName.toLowerCase() === comps[j].fFolderName.toLowerCase()) {
											found = true;
											components.push({
												id: comps[j].fFolderGUID,
												name: compName,
												filename: compName + '.zip'
											});
											break;
										}
									}

									if (!found) {
										console.log('ERROR: component ' + compName + ' does not exist');
										return Promise.reject();
									}
								}

								console.log(' - get ' + (components.length > 1 ? 'components' : 'component'));

								var exportCompPromises = [];
								for (var i = 0; i < components.length; i++) {
									exportCompPromises.push(_exportComponentSCS(request, localhost, components[i].id, components[i].name));
								}

								// export components
								return Promise.all(exportCompPromises);
							})
							.then(function (results) {
								for (var i = 0; i < results.length; i++) {
									if (results[i].err) {
										return Promise.reject();
									}
								}

								var getCompZipPromises = [];
								for (var i = 0; i < components.length; i++) {
									console.log(' - export component ' + components[i].name);

									getCompZipPromises.push(serverRest.findFile({
										registeredServerName: serverName,
										currPath: projectDir,
										parentID: homeFolderGUID,
										filename: components[i].filename
									}));
								}

								// query the exported component zip files
								return Promise.all(getCompZipPromises);
							})
							.then(function (results) {
								var downloadFilePromises = [];
								for (var j = 0; j < components.length; j++) {
									var found = false;
									for (var i = 0; i < results.length; i++) {
										if (components[j].filename === results[i].name) {
											// will delete the zip file after download
											deleteFileGUIDs.push(results[i].id);
											components[j]['fileGUID'] = results[i].id;
											found = true;
											downloadFilePromises.push(_downloadComponentFile(
												server, components[j].name, components[j].filename, components[j].fileGUID
											));
										}
									}

									if (!found) {
										console.log('ERROR: failed to find zip fileGUID for ' + components[j].name);
									}
								}

								// download zip files
								return Promise.all(downloadFilePromises);
							})
							.then(function (results) {
								var unzipPromises = [];

								for (var i = 0; i < results.length; i++) {
									if (results[i].err) {
										console.log('ERROR: failed to download zip for ' + results[i].comp);
									} else {
										var targetFile = path.join(destdir, results[i].comp + '.zip');
										fs.writeFileSync(targetFile, results[i].data);
										console.log(' - save file ' + targetFile);
										unzipPromises.push(unzipComponent(results[i].comp, targetFile));
									}
								}

								// import components to local
								return Promise.all(unzipPromises);
							})
							.then(function (results) {
								for (var i = 0; i < results.length; i++) {
									if (results[i].comp) {
										console.log(' - import component to ' + path.join(componentsSrcDir, results[i].comp));
									}
								}

								var deleteFilePromises = [];
								for (var i = 0; i < deleteFileGUIDs.length; i++) {
									deleteFilePromises.push(serverRest.deleteFile({
										currPath: projectDir,
										registeredServerName: serverName,
										fFileGUID: deleteFileGUIDs[i]
									}));
								}

								// delete the zip file on the server
								return Promise.all(deleteFilePromises);
							})
							.then(function (results) {
								_cmdEnd(done, localServer);
							})
							.catch((error) => {
								_cmdEnd(done, localServer);
							});
					}
				});
			}, 1000);

		}); // local

	}); // login
};

var _exportComponentSCS = function (request, localhost, compId, compName) {

	return new Promise(function (resolve, reject) {

		var url = localhost + '/documents/web?IdcService=SCS_EXPORT_COMPONENT&compId=' + compId;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to export component ' + compName);
				console.log(err);
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to export component ' + compName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			return resolve({});
		});
	});
};

var _downloadComponentFile = function (server, compName, fileName, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve({
					comp: compName,
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
				console.log('ERROR: failed to download file ' + fileName + ' - ' + msg);
				resolve({
					err: 'err'
				});
			}
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

	var isPod = server.env === 'pod_ec';

	var request = serverUtils.getRequest();
	var localServer;

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

		var components = [];

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
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var compId = params.compId;
			var url = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
			var formData = {
				'idcToken': idcToken,
				'item': 'fFolderGUID:' + compId
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
					console.log('ERROR: Failed to ' + action + ' component');
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

		localServer = app.listen(0, function () {
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
						clearInterval(inter);
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						console.log(' - establish user session');

						// verify components
						var compPromise = serverUtils.browseComponentsOnServer(request, server);
						compPromise.then(function (result) {
								if (result.err) {
									return Promise.reject();
								}

								var comps = result.data || [];

								for (var i = 0; i < componentNames.length; i++) {
									var compName = componentNames[i];
									var found = false;
									for (var j = 0; j < comps.length; j++) {
										if (compName.toLowerCase() === comps[j].fFolderName.toLowerCase()) {
											found = true;
											components.push({
												id: comps[j].fFolderGUID,
												name: compName
											});
											break;
										}
									}

									if (!found) {
										console.log('ERROR: component ' + compName + ' does not exist');
										return Promise.reject();
									}
								}

								console.log(' - get ' + (components.length > 1 ? 'components' : 'component'));

								var compActionPromises = [];
								for (var i = 0; i < components.length; i++) {
									if (action === 'publish') {
										compActionPromises.push(_publishComponentSCS(request, localhost, components[i].id, components[i].name));
									}
								}

								return Promise.all(compActionPromises);
							})
							.then(function (results) {
								for (var i = 0; i < results.length; i++) {
									if (!results[i].err) {
										console.log(' - ' + action + ' ' + results[i].comp + ' finished');
									}
								}
								_cmdEnd(done, localServer);
							})
							.catch((error) => {
								_cmdEnd(done, localServer);
							});
					}
				});
			}, 1000);
		}); // local
	}); // login
};

var _publishComponentSCS = function (request, localhost, compId, compName) {
	return new Promise(function (resolve, reject) {

		var url = localhost + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT&compId=' + compId;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to publish component ' + compName);
				console.log(err);
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to publish component ' + compName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			return resolve({
				comp: compName
			});
		});
	});
};