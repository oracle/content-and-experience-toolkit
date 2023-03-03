/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	documentUtils = require('./document.js').utils,
	fileUtils = require('../test/server/fileUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	childProcess = require('child_process'),
	gulp = require('gulp'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	os = require('os'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var console = require('../test/server/logger.js').console;

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

	console.info('Create Component: creating new component ' + compName + ' from ' + srcCompName);
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
				done();
				return;
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
					console.info(' - update component Id ' + oldId + ' to ' + newId);
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
					console.info(' - update component GUID ' + oldGUID + ' to ' + newGUID);
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

	if (!useserver) {
		// verify the source component
		for (var i = 0; i < existingComponents.length; i++) {
			if (srcCompName === existingComponents[i]) {
				comp = existingComponents[i];
				break;
			}
		}
		if (!comp) {
			console.error('ERROR: invalid local source component ' + srcCompName);
			done();
			return;
		}

		// verify the new component name 
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
				console.info(' - update component id to ' + compName);
				fs.writeFileSync(appinfoPath, JSON.stringify(appinfojson));
				// fs.writeFileSync(appinfoPath, JSON.stringify(appinfojson, null, 4));
			}
			console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
			done(true);
		} else {
			done();
		}
	} else {
		// console.log(' - copy component on the server');
		var description = argv.description;

		serverUtils.loginToServer(server).then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
				done();
				return;
			}

			sitesRest.getComponent({
				server: server,
				name: srcCompName
			}).then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				var srcComp = result;
				// console.log(srcComp);
				console.info(' - verify component (Id: ' + srcComp.id + ' type: ' + srcComp.type + ')');

				return sitesRest.copyComponent({
					server: server,
					srcId: srcComp.id,
					srcName: srcComp.name,
					name: compName,
					description: description
				});
			})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					return sitesRest.getComponent({
						server: server,
						name: compName
					});
				})
				.then(function (result) {
					if (result && result.id) {
						console.log(' - component copied (Id: ' + result.id + ' name: ' + compName + ')');
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

var _argv_component;
var _argv_noMsg;

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
				if (_argv_noMsg === undefined || !_argv_noMsg) {
					console.info(' - copying ' + components[i] + ' component');
				}
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
		console.info('Optimization is not enabled for the component ' + componentName);
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
				if (_argv_noMsg === undefined || !_argv_noMsg) {
					console.info(' - optimizing component ' + components[i]);
				}
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
	var total = components.length;
	var count = 0;
	var tasks = components.map(function (comp, idx) {
		if (fs.existsSync(path.join(componentsSrcDir, comp))) {
			return gulp.src(`${componentsBuildDir}/${comp}/**/*`, {
				base: componentsBuildDir
			})
				.pipe(zip(`${comp}.zip`), {
					buffer: false
				})
				.pipe(gulp.dest(destDir))
				.on('end', function () {
					var zippath = path.join(destDir, comp + '.zip');
					if (_argv_noMsg === undefined || !_argv_noMsg) {
						console.info(' - created zip file ' + zippath);
					}
					count = count + 1;
					if (count === total) {
						// finish
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
	return new Promise(function (resolve, reject) {

		if (!fs.existsSync(componentsSrcDir)) {
			console.error('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
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
					console.error('Error: Component ' + components[i] + ' does not exist');
				} else {
					validCompNum += 1;
				}
			}

			if (validCompNum > 0) {
				_argv_component = argv.component;
				_argv_noMsg = argv.noMsg;
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
		console.error('ERROR: invalid folder');
		done();
		return;
	}

	// Support a list of components
	var components = argv.component.split(',');
	var allComps = [];

	for (var i = 0; i < components.length; i++) {
		if (!fs.existsSync(path.join(componentsSrcDir, components[i]))) {
			console.error('Error: Component ' + components[i] + ' does not exist');
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

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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

				var comps = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";
					if (fs.existsSync(zipfile)) {
						comps.push({
							name: name,
							zipfile: zipfile
						});
					}
				}

				_uploadComponents(server, folder, folderId, comps, publish)
					.then(function (result) {
						if (result.err) {
							done();
						} else {
							done(true);
						}
					});
			});

		}); // login 

	}); // export
};

var _uploadComponents = function (server, folder, folderId, comps, publish, noMsg, noDocMsg) {
	return new Promise(function (resolve, reject) {
		var err;
		var doUploadComp = comps.reduce(function (compPromise, comp) {
			return compPromise.then(function (result) {
				let noMsg;
				return _deployOneComponentREST(server, folder, folderId, comp.zipfile, comp.name, publish, noMsg, noDocMsg)
					.then(function (result) {
						if (!result || result.err) {
							err = 'err';
						}
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doUploadComp.then(function (result) {
			resolve({
				err: err
			});
		});
	});
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

var _deployOneComponentREST = function (server, folder, folderId, zipfile, name, publish, noMsg, noDocMsg) {
	return new Promise(function (resolve, reject) {
		var fileId;
		var fileName = name + '.zip';
		var startTime;
		var componentId;

		var showDetail = noMsg ? false : true;

		// check if component exist on the server
		var compExist = false;
		sitesRest.resourceExist({
			server: server,
			type: 'components',
			name: name,
			showInfo: noMsg ? false : true
		})
			.then(function (result) {
				if (!result || result.err) {
					compExist = false;
				} else {
					compExist = true;
				}
				componentId = result && result.id;

				var createFilePromises = [];
				if (!compExist) {
					createFilePromises.push(serverRest.createFile({
						server: server,
						parentID: folderId,
						filename: fileName,
						contents: fs.createReadStream(zipfile)
					}));
				}

				return Promise.all(createFilePromises);

			})
			.then(function (results) {

				if (!compExist) {
					if (!results || !results[0] || !results[0].id) {
						return Promise.reject();
					}
					console.info(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + results[0].version);
					fileId = results[0].id;
				}

				startTime = new Date();
				var uploadPromise;
				if (!compExist) {
					uploadPromise = sitesRest.importComponent({
						server: server,
						name: name,
						fileId: fileId
					});
				} else {
					// Do not upload file _folder.json, otherwise will fail to export
					var uploadArgv = {
						path: path.join(componentsBuildDir, name) + path.sep,
						folder: 'component:' + name,
						retry: false,
						excludeFiles: ['_folder.json'],
						noMsg: noDocMsg
					};
					uploadPromise = documentUtils.uploadFolder(uploadArgv, server);
				}

				return uploadPromise;

			})
			.then(function (result) {
				if (result.err || !result) {
					if (compExist) {
						console.error('ERROR: failed to update component ' + name);
					}
					return Promise.reject();
				}
				// console.log(result);
				if (!compExist) {
					if (result.newName && result.newName !== name) {
						if (showDetail) {
							console.log(' - component imported and renamed to ' + result.newName + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						}
						name = result.newName;
					} else {
						if (showDetail) {
							console.log(' - component ' + name + ' imported [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						}
					}
					componentId = result && result.id;
				} else {
					if (showDetail) {
						console.log(' - component ' + name + ' updated');
					}
				}

				// console.log(' - component id: ' + componentId);
				var publishpromises = [];
				if (publish) {
					publishpromises.push(sitesRest.publishComponent({
						server: server,
						id: componentId,
						name: name,
						async: true
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
						// console.log(' - component ' + name + ' published/republished [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						if (showDetail) {
							console.log(' - component ' + name + ' published/republished');
						}
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
				if (error) {
					console.error(error);
				}
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
		console.error('ERROR: file ' + compPath + ' does not exist');
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
	var publishedversion = typeof argv.publishedversion === 'string' && argv.publishedversion.toLowerCase() === 'true';

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var downloadPromise = publishedversion ? _downloadPublishedComponents(server, components) :
			_downloadComponentsREST(server, components, argv);

		downloadPromise
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
				}
			});

	}); // login
};

var _downloadPublishedComponents = function (server, componentNames) {
	return new Promise(function (resolve, reject) {
		var err;
		var doDownloadComp = componentNames.reduce(function (compPromise, param) {
			return compPromise.then(function (result) {
				// the component local path
				var targetPath = path.join(componentsSrcDir, param);

				return sitesRest.getComponent({
					server: server,
					name: param,
					showError: false,
					showInfo: false
				})
					.then(function (result) {
						if (!result || !result.id) {
							// component does not exist
							err = 'err';
						} else if (result.publishStatus !== 'published') {
							console.log('ERROR: component ' + param + ' is not published');
							err = 'err';
						} else {
							var comp = result;

							// prepare the local folder for the component
							fileUtils.remove(targetPath);
							fs.mkdirSync(targetPath);

							// get top level files
							return serverRest.getChildItems({
								server: server,
								parentID: comp.id,
								limit: 9999
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
										}
									});

									return Promise.all(downloadTopFilesPromises)
										.then(function (result) {

											// download publish folder and place at the top of the resource
											var downloadArgv = {
												path: 'component:' + param + '/publish',
												folder: targetPath
											};

											var showError = true;
											var showDetail = false;
											return documentUtils.downloadFolder(downloadArgv, server, showError, showDetail)
												.then(function (result) {

													// get component metadata to get itemGUID
													return serverUtils.getComponentMetadata(server, comp.id, comp.name)
														.then(function (result) {
															var itemGUID = comp.id;
															if (result && result.folderId === comp.id && result.metadata.scsItemGUID) {
																itemGUID = result.metadata.scsItemGUID;
															}
															// get the component's appType from appinfo.json
															var appType;
															if (fs.existsSync(path.join(targetPath, 'appinfo.json'))) {
																var appinfo;
																try {
																	appinfo = JSON.parse(fs.readFileSync(path.join(targetPath, 'appinfo.json')));
																} catch (e) {
																	console.error('ERROR: component ' + comp.name + ' appinfo.json is invalid');
																	// console.log(e);
																}
																if (appinfo && appinfo.type) {
																	appType = appinfo.type;
																}
															}
															appType = appType || 'component';

															// create _folder.json for the component
															var folderJson = {
																itemGUID: itemGUID,
																appType: appType,
																appIconUrl: '',
																appIsHiddenInBuilder: comp.isHidden ? '1' : '0'
															};
															// console.log(' - component ' + comps[i].name + ' itemGUID: ' + itemGUID);
															if (fs.existsSync(path.join(componentsSrcDir, comp.name))) {
																var folderPath = path.join(componentsSrcDir, comp.name, '_folder.json');
																fs.writeFileSync(folderPath, JSON.stringify(folderJson));
																console.log(' - download published component ' + comp.name);
															} else {
																console.error('ERROR: component ' + comp.name + ' not downloaded');
															}
														})
												});
										});
								});
						}
					});

			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doDownloadComp.then(function (result) {
			resolve({
				err: err
			});
		});
	});
};

var _downloadComponentsREST = function (server, componentNames, argv, noMsg) {
	if (argv) {
		verifyRun(argv);
	}
	var showDetail = noMsg ? false : true;
	var i;
	return new Promise(function (resolve, reject) {
		var compPromises = [];
		for (i = 0; i < componentNames.length; i++) {
			compPromises.push(sitesRest.getComponent({
				server: server,
				name: componentNames[i],
				showInfo: noMsg ? false : true
			}));
		}

		var comps = [];
		var exportedComps = [];
		var exportSuccess = false;
		Promise.all(compPromises).then(function (results) {
			var allComps = results || [];
			for (i = 0; i < componentNames.length; i++) {
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
			for (i = 0; i < comps.length; i++) {
				exportPromises.push(sitesRest.exportComponent({
					server: server,
					id: comps[i].id,
					showInfo: noMsg ? false : true
				}));
			}

			return Promise.all(exportPromises);

		})
			.then(function (results) {
				var exportFiles = results || [];
				var prefix = '/documents/api/1.2/files/';
				for (i = 0; i < comps.length; i++) {
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
						console.error('ERROR: failed to export component ' + comps[i].name);
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
				for (i = 0; i < exportedComps.length; i++) {
					for (var j = 0; j < results.length; j++) {
						if (exportedComps[i].fileId === results[j].id) {
							var targetFile = path.join(destdir, exportedComps[i].name + '.zip');
							fs.writeFileSync(targetFile, results[i].data);
							if (showDetail) {
								console.info(' - save file ' + targetFile);
							}
							exportSuccess = true;
							unzipPromises.push(unzipComponent(exportedComps[i].name, targetFile));
						}
					}
				}
				return Promise.all(unzipPromises);
			})
			.then(function (results) {
				for (i = 0; i < results.length; i++) {
					if (results[i].comp) {
						console.log(' - import component to ' + path.join(componentsSrcDir, results[i].comp));
					}
				}

				var deleteFilePromises = [];
				for (i = 0; i < exportedComps.length; i++) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_controlComponentsREST(server, components)
			.then(function (result) {
				if (!result || result.err) {
					done();
				} else {
					done(true);
				}
			});

	}); // login
};

var _controlComponentsREST = function (server, componentNames) {
	return new Promise(function (resolve, reject) {
		var err;
		var total = componentNames.length;
		var groups = [];
		var limit = 1;
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
		console.info(' - publishing ' + total + (total === 1 ? ' component ...' : ' components ...'));
		var doPublishComps = groups.reduce(function (compPromise, param) {
			return compPromise.then(function (result) {
				var publishPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					publishPromises.push(sitesRest.publishComponent({
						server: server,
						name: componentNames[i],
						hideAPI: true,
						async: true
					}));
				}

				return Promise.all(publishPromises).then(function (results) {
					for (var i = 0; i < results.length; i++) {
						if (!results[i] || results[i].err) {
							err = 'err';
						} else {
							// console.log(' - publish ' + results[i].name + ' finished  [' + results[i].timeUsed + ']');
							console.log(' - publish ' + results[i].name + ' finished');
						}
					}
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doPublishComps.then(function (result) {
			resolve({
				err: err
			});
		});

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

		var i, j;

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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
					console.error('ERROR: component ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify component');

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
						console.info(' - verify groups');
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
								console.error('ERROR: group ' + groupNames[i] + ' does not exist');
							}
						}
					}

					var usersPromises = [];
					for (i = 0; i < userNames.length; i++) {
						usersPromises.push(serverRest.getUser({
							server: server,
							name: userNames[i]
						}));
					}

					return Promise.all(usersPromises);
				})
				.then(function (results) {
					var allUsers = [];
					for (i = 0; i < results.length; i++) {
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
						for (i = 0; i < allUsers.length; i++) {
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
						id: compId
					});
				})
				.then(function (result) {
					var existingMembers = result.data || [];

					var sharePromises = [];
					var newMember;
					for (i = 0; i < users.length; i++) {
						newMember = true;
						for (j = 0; j < existingMembers.length; j++) {
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

					for (i = 0; i < groups.length; i++) {
						newMember = true;
						for (j = 0; j < existingMembers.length; j++) {
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
					for (i = 0; i < results.length; i++) {
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

		var i, j;

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage);
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
					console.error('ERROR: component ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify component');

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
					for (i = 0; i < results.length; i++) {
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
						id: compId
					});
				})
				.then(function (result) {
					var existingMembers = result.data || [];
					var revokePromises = [];
					var existingUser;
					for (var i = 0; i < users.length; i++) {
						existingUser = false;
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

					for (i = 0; i < groups.length; i++) {
						existingUser = false;
						for (j = 0; j < existingMembers.length; j++) {
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
							console.error('ERROR: ' + results[i].title);
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

var _getSitesUsedComponents = function (server, sites) {
	return new Promise(function (resolve, reject) {
		var total = sites.length;
		var groups = [];
		var limit = 10;
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
		var sitesData = [];
		var needNewLine = false;
		var startTime = new Date();
		var doGetSiteData = groups.reduce(function (sitePromise, param) {
			return sitePromise.then(function (result) {
				var sitePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					sitePromises.push(serverUtils.getSiteUsedData(server, sites[i].id));
				}

				if (console.showInfo()) {
					process.stdout.write(' - querying component in sites [' + param.start + ', ' + param.end + '] [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
				return Promise.all(sitePromises).then(function (results) {
					sitesData = sitesData.concat(results);
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

		doGetSiteData.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}

			resolve(sitesData);
		});
	});
};

var _getTypesUsedComponents = function (server, types) {
	return new Promise(function (resolve, reject) {
		var total = types.length;
		var groups = [];
		var limit = 10;
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
		var typesData = [];
		var needNewLine = false;
		var startTime = new Date();
		var doGetTypeData = groups.reduce(function (typePromise, param) {
			return typePromise.then(function (result) {
				var typePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					typePromises.push(serverRest.getContentType({
						server: server,
						name: types[i].name,
						expand: 'layoutMapping'
					}));
				}

				if (console.showInfo()) {
					process.stdout.write(' - querying component in types [' + param.start + ', ' + param.end + '] [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
				return Promise.all(typePromises).then(function (results) {
					typesData = typesData.concat(results);
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

		doGetTypeData.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}

			resolve(typesData);
		});
	});
};

/**
 * describe component
 */
module.exports.describeComponent = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var comp;
		var compMetadata;
		var sites = [];
		var sitesData = [];
		var types = [];
		var typesData = [];

		sitesRest.getComponent({
			server: server,
			name: name,
			expand: 'all'
		}).then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			if (output) {
				fs.writeFileSync(output, JSON.stringify(result, null, 4));
				console.log(' - component properties saved to ' + output);
			}

			comp = result;

			return serverUtils.getComponentMetadata(server, comp.id);

		})
			.then(function (result) {

				compMetadata = result && result.metadata;

				// get the sites that use the component
				var sitePromises = [];
				if (comp.type !== 'contentLayout' && comp.type !== 'contentForm' && comp.type !== 'fieldEditor') {
					sitePromises.push(sitesRest.getSites({ server: server }));
				}

				return Promise.all(sitePromises);
			})
			.then(function (results) {
				sites = results && results[0] || [];
				if (sites.length > 0) {
					console.info(' - total sites: ' + sites.length);
				}

				return _getSitesUsedComponents(server, sites);

			})
			.then(function (result) {
				sitesData = result || [];

				var typePromises = [];
				if (comp.type === 'contentLayout' || comp.type === 'contentForm' || comp.type === 'fieldEditor') {
					typePromises.push(serverRest.getContentTypes({ server: server }));
				}

				return Promise.all(typePromises);

			})
			.then(function (results) {
				types = results && results[0] || [];
				if (types.length > 0) {
					console.info(' - total types: ' + types.length);
				}

				return _getTypesUsedComponents(server, types);

			})
			.then(function (result) {
				typesData = result || [];
				// console.log(typesData);

				var managers = [];
				var contributors = [];
				var downloaders = [];
				var viewers = [];
				var members = comp.members && comp.members.items || [];
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

				var format1 = '%-41s %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', comp.id));
				console.log(sprintf(format1, 'Type', comp.type));
				console.log(sprintf(format1, 'Name', comp.name));
				console.log(sprintf(format1, 'Description', comp.description || ''));
				console.log(sprintf(format1, 'Owner', comp.ownedBy ? (comp.ownedBy.displayName || comp.ownedBy.name) : ''));
				console.log(sprintf(format1, 'Members', memberLabel));
				console.log(sprintf(format1, 'Created', comp.createdAt + ' by ' + (comp.createdBy ? (comp.createdBy.displayName || comp.createdBy.name) : '')));
				console.log(sprintf(format1, 'Updated', comp.lastModifiedAt + ' by ' + (comp.lastModifiedBy ? (comp.lastModifiedBy.displayName || comp.lastModifiedBy.name) : '')));
				console.log(sprintf(format1, 'Status', comp.publishStatus));
				console.log(sprintf(format1, 'Hide on custom palette in the site editor', comp.isHidden));
				console.log(sprintf(format1, 'itemGUID', (compMetadata && compMetadata.scsItemGUID || '')));

				console.log(sprintf(format1, 'Used in Sites', ''));

				var format2 = '  %-38s  %-s';

				var titleShown = false;
				sitesData.forEach(function (siteData) {
					let siteName;
					for (let i = 0; i < sites.length; i++) {
						if (siteData.siteId === sites[i].id) {
							siteName = sites[i].name;
							break;
						}
					}

					var pages = [];
					if (siteData.componentsUsed && siteData.componentsUsed.length > 0) {
						for (let i = 0; i < siteData.componentsUsed.length; i++) {
							if (name === siteData.componentsUsed[i].scsComponentName) {
								pages.push(siteData.componentsUsed[i].scsPageID);
							}
						}
					}
					if (siteName && pages.length > 0) {
						if (!titleShown) {
							console.log(sprintf(format2, 'Site', 'Pages'));
							titleShown = true;
						}
						console.log(sprintf(format2, siteName, pages));
					}
				});

				var typeNames = [];
				typesData.forEach(function (typeObj) {
					let properties = typeObj.properties;
					if (properties) {
						if (properties.customEditors && properties.customEditors.includes(name) && !typeNames.includes(name)) {
							typeNames.push(typeObj.name);
						}
						if (properties.customForms && properties.customForms.includes(name) && !typeNames.includes(name)) {
							typeNames.push(typeObj.name);
						}
					}
					let mapping = typeObj.layoutMapping;
					if (mapping && mapping.data && mapping.data.length > 0) {
						var typeMappings = mapping.data;
						for (let j = 0; j < typeMappings.length; j++) {
							if (typeMappings[j].formats && typeMappings[j].formats.desktop && typeMappings[j].formats.desktop === name && !typeNames.includes(name)) {
								typeNames.push(typeObj.name);
							}
							if (typeMappings[j].formats && typeMappings[j].formats.mobile && typeMappings[j].formats.mobile === name && !typeNames.includes(name)) {
								typeNames.push(typeObj.name);
							}
						}
					}
				});
				console.log(sprintf(format1, 'Used in Types', typeNames));
				console.log('');

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

// export non "command line" utility functions
module.exports.utils = {
	downloadComponents: _downloadComponentsREST,
	uploadComponent: _deployOneComponentREST,
	uploadComponents: _uploadComponents,
	exportComponents: _exportComponent
};