/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	os = require('os'),
	readline = require('readline'),
	fs = require('fs'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var console = require('../test/server/logger.js').console;

var projectDir,
	documentsSrcDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done
 */
var verifyRun = function (argv) {

	if (process.shim) {
		return true;
	}
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	documentsSrcDir = path.join(srcfolder, 'documents');
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

module.exports.createFolder = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var name = argv.name;
		var folderPath = name.split('/');

		_createFolder(server, 'self', folderPath, true).then(function (result) {
			done(true);
		})
			.catch((error) => {
				done();
			});
	});
};

var _createFolder = function (server, rootParentId, folderPath, showMessage) {
	return new Promise(function (resolve, reject) {
		var folderPromises = [],
			parentGUID;

		folderPath.forEach(function (foldername) {
			if (foldername) {
				folderPromises.push(function (parentID) {
					return serverRest.findOrCreateFolder({
						server: server,
						parentID: parentID,
						foldername: foldername
					});
				});
			}
		});

		// get the folders in sequence
		var doFindFolder = folderPromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function (folderDetails) {
				// store the parent
				if (folderDetails && folderDetails.id) {
					if (folderDetails.__created) {
						if (showMessage) {
							console.log(' - create folder ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
						}
					} else if (folderDetails.id !== 'self') {
						if (showMessage) {
							console.info(' - find folder ' + (folderDetails.name || 'root') + ' (Id: ' + folderDetails.id + ')');
						}
					}
					parentGUID = folderDetails.id;

					// wait for the previous promise to complete and then return a new promise for the next
					return nextPromise(parentGUID);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise passing in the home folder id as the parentID
		Promise.resolve({
			id: rootParentId
		}));

		doFindFolder.then(function (newFolder) {
			if (newFolder && newFolder.id) {
				if (newFolder.__created) {
					if (showMessage) {
						console.log(' - create folder ' + newFolder.name + ' (Id: ' + newFolder.id + ')');
					}
				} else if (newFolder.id !== 'self') {
					if (showMessage) {
						console.info(' - find folder ' + (newFolder.name || 'root') + ' (Id: ' + newFolder.id + ')');
					}
				}
			}
			resolve(newFolder);
		});
	});
};

var _getResourceInfo = function (server, resourcePath) {
	var resourceName;
	var resourceType;
	var resourcePromises = [];
	if (resourcePath && (resourcePath.indexOf('site:') === 0 || resourcePath.indexOf('theme:') === 0 || resourcePath.indexOf('component:') === 0)) {
		// resourceFolder = true;
		if (resourcePath.indexOf('site:') === 0) {
			resourcePath = resourcePath.substring(5);
			resourceType = 'site';
		} else if (resourcePath.indexOf('theme:') === 0) {
			resourcePath = resourcePath.substring(6);
			resourceType = 'theme';
		} else {
			resourcePath = resourcePath.substring(10);
			resourceType = 'component';
		}
		if (resourcePath.indexOf('/') > 0) {
			resourceName = resourcePath.substring(0, resourcePath.indexOf('/'));
			resourcePath = resourcePath.substring(resourcePath.indexOf('/') + 1);
		} else {
			resourceName = resourcePath;
			resourcePath = '';
		}

		if (resourceType === 'site') {
			resourcePromises.push(sitesRest.getSite({
				server: server,
				name: resourceName
			}));
		} else if (resourceType === 'theme') {
			resourcePromises.push(sitesRest.getTheme({
				server: server,
				name: resourceName
			}));
		} else {
			resourcePromises.push(sitesRest.getComponent({
				server: server,
				name: resourceName
			}));
		}
	}
	var resInfo = {
		resourcePath: resourcePath,
		resourceName: resourceName,
		resourceType: resourceType,
		resourcePromises: resourcePromises
	};
	return resInfo;
};

module.exports.copyFolder = function (argv, done) {
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
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var srcPath = argv.name;
		var folderName = srcPath;
		if (folderName.indexOf('/') > 0) {
			folderName = folderName.substring(folderName.lastIndexOf('/') + 1);
		}

		var info = _getResourceInfo(server, srcPath);
		var resourceName = info.resourceName;
		var resourceType = info.resourceType;
		var folderResourcePromises = info.resourcePromises;
		var resourceFolder = resourceName && resourceType;
		if (resourceFolder) {
			srcPath = info.resourcePath;
		}
		// console.log(' - argv.name=' + argv.name + ' resource name=' + resourceName + ' type=' + resourceType + ' folder=' + srcPath);

		var sameFolder = argv.folder === undefined;

		var targetPath = argv.folder === '/' || argv.folder === undefined ? '' : serverUtils.trimString(argv.folder, '/');
		info = _getResourceInfo(server, targetPath);
		var targetResName = info.resourceName;
		var targetResType = info.resourceType;
		var targetResourcePromises = info.resourcePromises;
		var targetResFolder = targetResName && targetResType;
		if (targetResFolder) {
			targetPath = info.resourcePath;
		}
		// console.log(' - argv.folder=' + argv.folder + ' resource name=' + targetResName + ' type=' + targetResType + ' target folder=' + targetPath);

		if (resourceFolder && !targetResFolder) {
			console.error('ERROR: ' + resourceType + ' folder cannot be copied to Home folder');
			done();
			return;
		}
		if (!resourceFolder && targetResFolder) {
			console.error('ERROR: personal folder cannot be copied to ' + targetResType + ' folder');
			done();
			return;
		}
		if (resourceFolder && resourceFolder && resourceType !== targetResType) {
			console.error('ERROR: ' + resourceType + ' folder cannot be copied to ' + targetResType + ' folder');
			done();
			return;
		}

		var folderRootParentId = 'self';
		var srcFolder;
		var targetFolderId = 'self';

		Promise.all(folderResourcePromises)
			.then(function (results) {
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
						return Promise.reject();
					}
					folderRootParentId = resourceGUID;
				}
				// console.log(' - file parent ' + folderRootParentId);

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: folderRootParentId,
					folderPath: srcPath
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: folder ' + argv.name + ' does not exist');
					return Promise.reject();
				}
				if (result.type !== 'folder') {
					console.error('ERROR: ' + argv.name + ' is not a folder');
					return Promise.reject();
				}
				console.info(' - verify source folder ' + argv.name);
				srcFolder = result;

				return Promise.all(targetResourcePromises);

			})
			.then(function (results) {
				var targetFldRootParentId = 'self';
				if (targetResFolder) {
					var targetResGUID;
					if (results.length > 0 && results[0]) {
						targetResGUID = results[0].id;
					}

					if (!targetResGUID) {
						console.error('ERROR: invalid ' + targetResType + ' ' + targetResName);
						return Promise.reject();
					}
					targetFldRootParentId = targetResGUID;
				}
				// console.log(' - target folder root parent ' + targetFldRootParentId);

				var targetFolderPromises = [];
				if (!sameFolder) {
					targetFolderPromises.push(serverRest.findFolderHierarchy({
						server: server,
						parentID: targetFldRootParentId,
						folderPath: targetPath
					}));
				}

				return Promise.all(targetFolderPromises);
			})
			.then(function (results) {
				if (!sameFolder) {
					if (results.length > 0 && results[0]) {
						targetFolderId = results[0].id;
					}
				} else {
					targetFolderId = srcFolder.parentID || 'self';
				}

				var targetFolderLabel;
				if (targetFolderId === 'self') {
					targetFolderLabel = 'Home';
				} else if (!argv.folder) {
					// the same folder as the source file
					targetFolderLabel = argv.name.substring(0, argv.name.lastIndexOf('/'));
				} else {
					targetFolderLabel = argv.folder;
				}

				if (!targetFolderId) {
					console.error('ERROR: folder ' + targetFolderLabel + ' does not exist');
					return Promise.reject();
				}

				console.info(' - verify target folder: ' + targetFolderLabel);

				return serverRest.copyFolder({
					server: server,
					id: srcFolder.id,
					folderId: targetFolderId
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				console.log(' - folder copied (Id: ' + result.id + ')');
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


module.exports.copyFile = function (argv, done) {
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
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var filePath = argv.file;
		var fileName = filePath;
		if (fileName.indexOf('/') > 0) {
			fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
		}

		var folderPathStr = filePath.indexOf('/') >= 0 ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
		var resourceFolder = false;
		var resourceName;
		var resourceType;
		var fileResourcePromises = [];
		if (folderPathStr && (folderPathStr.indexOf('site:') === 0 || folderPathStr.indexOf('theme:') === 0 || folderPathStr.indexOf('component:') === 0)) {
			resourceFolder = true;
			if (folderPathStr.indexOf('site:') === 0) {
				folderPathStr = folderPathStr.substring(5);
				resourceType = 'site';
			} else if (folderPathStr.indexOf('theme:') === 0) {
				folderPathStr = folderPathStr.substring(6);
				resourceType = 'theme';
			} else {
				folderPathStr = folderPathStr.substring(10);
				resourceType = 'component';
			}
			if (folderPathStr.indexOf('/') > 0) {
				resourceName = folderPathStr.substring(0, folderPathStr.indexOf('/'));
				folderPathStr = folderPathStr.substring(folderPathStr.indexOf('/') + 1);
			} else {
				resourceName = folderPathStr;
				folderPathStr = '';
			}
			filePath = folderPathStr ? folderPathStr + '/' + fileName : fileName;

			if (resourceType === 'site') {
				fileResourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				fileResourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				fileResourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}
		// console.log(' - argv.file=' + argv.file + ' folderPathStr=' + folderPathStr + ' resourceName=' + resourceName);
		var folderPath = folderPathStr.split('/');

		var sameFolder = argv.folder === undefined;
		var targetPath = argv.folder === '/' ? '' : serverUtils.trimString(argv.folder, '/');
		var targetResFolder = false;
		var targetResName;
		var targetResType;
		var targetResourcePromises = [];
		if (targetPath && (targetPath.indexOf('site:') === 0 || targetPath.indexOf('theme:') === 0 || targetPath.indexOf('component:') === 0)) {
			targetResFolder = true;
			if (targetPath.indexOf('site:') === 0) {
				targetPath = targetPath.substring(5);
				targetResType = 'site';
			} else if (targetPath.indexOf('theme:') === 0) {
				targetPath = targetPath.substring(6);
				targetResType = 'theme';
			} else {
				targetPath = targetPath.substring(10);
				targetResType = 'component';
			}
			if (targetPath.indexOf('/') > 0) {
				targetResName = targetPath.substring(0, targetPath.indexOf('/'));
				targetPath = targetPath.substring(targetPath.indexOf('/') + 1);
			} else {
				targetResName = targetPath;
				targetPath = '';
			}
			if (targetResType === 'site') {
				targetResourcePromises.push(sitesRest.getSite({
					server: server,
					name: targetResName
				}));
			} else if (targetResType === 'theme') {
				targetResourcePromises.push(sitesRest.getTheme({
					server: server,
					name: targetResName
				}));
			} else {
				targetResourcePromises.push(sitesRest.getComponent({
					server: server,
					name: targetResName
				}));
			}
		}

		var fileRootParentId = 'self';
		var srcFile;
		var targetFolderId = 'self';

		Promise.all(fileResourcePromises)
			.then(function (results) {
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
						return Promise.reject();
					}
					fileRootParentId = resourceGUID;
				}
				// console.log(' - file parent ' + fileRootParentId);

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: fileRootParentId,
					folderPath: filePath
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: file ' + filePath + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify source file ' + argv.file);
				srcFile = result;

				return Promise.all(targetResourcePromises);

			})
			.then(function (results) {
				var targetFldRootParentId = 'self';
				if (targetResFolder) {
					var targetResGUID;
					if (results.length > 0 && results[0]) {
						targetResGUID = results[0].id;
					}

					if (!targetResGUID) {
						console.error('ERROR: invalid ' + targetResType + ' ' + targetResName);
						return Promise.reject();
					}
					targetFldRootParentId = targetResGUID;
				}

				// console.log(' - target folder root parent ' + targetFldRootParentId);
				var targetFolderPromises = [];
				if (!sameFolder) {
					targetFolderPromises.push(serverRest.findFolderHierarchy({
						server: server,
						parentID: targetFldRootParentId,
						folderPath: targetPath
					}));
				}

				return Promise.all(targetFolderPromises);
			})
			.then(function (results) {
				if (!sameFolder) {
					if (results.length > 0 && results[0]) {
						targetFolderId = results[0].id;
					}
				} else {
					targetFolderId = srcFile.parentID;
				}

				var targetFolderLabel;
				if (targetFolderId === 'self') {
					targetFolderLabel = 'Home';
				} else if (!argv.folder) {
					// the same folder as the source file
					targetFolderLabel = argv.file.substring(0, argv.file.lastIndexOf('/'));
				} else {
					targetFolderLabel = argv.folder;
				}

				if (!targetFolderId) {
					console.error('ERROR: folder ' + targetFolderLabel + ' does not exist');
					return Promise.reject();
				}

				console.info(' - verify target folder: ' + targetFolderLabel);

				return serverRest.copyFile({
					server: server,
					id: srcFile.id,
					folderId: targetFolderId
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				// console.log(result);
				console.log(' - file copied (Id: ' + result.id + ')');
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


module.exports.uploadFile = function (argv, done) {
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
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_uploadFile(argv, server).then(function () {
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _uploadFile = function (argv, server) {

	var filePath = argv.file;
	if (!path.isAbsolute(filePath)) {
		filePath = path.join(projectDir, filePath);
	}
	filePath = path.resolve(filePath);
	var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

	if (!fs.existsSync(filePath)) {
		console.error('ERROR: file ' + filePath + ' does not exist');
		return Promise.reject();
	}
	if (fs.statSync(filePath).isDirectory()) {
		console.error('ERROR: ' + filePath + ' is not a file');
		return Promise.reject();
	}

	var createFolder = typeof argv.createfolder === 'string' && argv.createfolder.toLowerCase() === 'true';

	var inputPath = argv.folder === '/' ? '' : serverUtils.trimString(argv.folder, '/');
	var resourceFolder = false;
	var resourceName;
	var resourceType;
	var resourceLabel;
	if (inputPath && (inputPath.indexOf('site:') === 0 || inputPath.indexOf('theme:') === 0 || inputPath.indexOf('component:') === 0)) {
		resourceFolder = true;
		if (inputPath.indexOf('site:') === 0) {
			inputPath = inputPath.substring(5);
			resourceType = 'site';
			resourceLabel = 'Sites';
		} else if (inputPath.indexOf('theme:') === 0) {
			inputPath = inputPath.substring(6);
			resourceType = 'theme';
			resourceLabel = 'Themes';
		} else {
			inputPath = inputPath.substring(10);
			resourceType = 'component';
			resourceLabel = 'Components';
		}
		if (inputPath.indexOf('/') > 0) {
			resourceName = inputPath.substring(0, inputPath.indexOf('/'));
			inputPath = inputPath.substring(inputPath.indexOf('/') + 1);
		} else {
			resourceName = inputPath;
			inputPath = '';
		}
	}
	var folderPath = inputPath ? inputPath.split('/') : [];
	console.info(' - target folder: ' + (resourceFolder ? (resourceLabel + ' > ' + resourceName) : 'Documents') + ' > ' + folderPath.join(' > '));

	var loginPromises = [];

	if (resourceFolder) {
		loginPromises.push(serverUtils.loginToServer(server));
	}

	return Promise.all(loginPromises).then(function (results) {
		if (resourceFolder && (!results || results.length === 0 || !results[0].status)) {
			console.error(results[0].statusMessage);
			return Promise.reject();
		}

		var resourcePromises = [];
		if (resourceFolder) {
			if (resourceType === 'site') {
				resourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				resourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				resourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}

		var startTime;

		return Promise.all(resourcePromises).then(function (results) {
			var rootParentId = 'self';
			if (resourceFolder) {
				var resourceGUID;
				if (results.length > 0 && results[0]) {
					resourceGUID = results[0].id;
				}

				if (!resourceGUID) {
					console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
					return Promise.reject();
				}
				rootParentId = resourceGUID;
			}

			var filePromise = createFolder ? _createFolder(server, rootParentId, folderPath, true) : _findFolder(server, rootParentId, folderPath);
			return filePromise;

		})
			.then(function (result) {
				if (folderPath.length > 0 && !result) {
					return Promise.reject();
				}

				if (resourceFolder && !result.id || !resourceFolder && result.id !== 'self' && (!result.type || result.type !== 'folder')) {
					console.error('ERROR: invalid folder ' + argv.folder);
					return Promise.reject();
				}

				startTime = new Date();

				return serverRest.createFile({
					server: server,
					parentID: result.id,
					filename: fileName,
					filepath: filePath,
					contents: fs.createReadStream(filePath)
				});
			})
			.then(function (result) {
				if (result && !result.err) {
					console.log(' - file ' + fileName + ' uploaded to ' +
						(argv.folder ? ('folder ' + argv.folder) : 'Home folder') +
						' (Id: ' + result.id + ' version:' + result.version + ' size: ' + result.size + ')' +
						' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					return Promise.resolve(true);
				} else {
					return Promise.reject();
				}
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return Promise.reject();
			});
	}); // login
};

var _findFolder = function (server, rootParentId, folderPath, showError, showDetail) {
	var showInfo = showDetail !== undefined ? showDetail : true;
	return new Promise(function (resolve, reject) {
		var folderPromises = [],
			parentGUID;
		folderPath.forEach(function (foldername) {
			if (foldername) {
				folderPromises.push(function (parentID) {
					return serverRest.findFile({
						server: server,
						parentID: parentID,
						filename: foldername,
						itemtype: 'folder',
						showError: showError
					});
				});
			}
		});

		// get the folders in sequence
		var doFindFolder = folderPromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function (folderDetails) {
				// store the parent
				if (folderDetails && folderDetails.id) {
					if (folderDetails.id !== rootParentId) {
						if (showInfo) {
							console.info(' - find ' + folderDetails.type + ' ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
						}
					}
					parentGUID = folderDetails.id;

					// wait for the previous promise to complete and then return a new promise for the next
					return nextPromise(parentGUID);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise passing in the home folder id as the parentID
		Promise.resolve({
			id: rootParentId
		}));

		doFindFolder.then(function (parentFolder) {
			if (parentFolder && parentFolder.id) {
				if (parentFolder.id !== rootParentId) {
					if (showInfo) {
						console.info(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
					}
				}
			}
			resolve(parentFolder);
		});
	});
};

var _downloadFile = function (argv, server) {
	return new Promise(function (resolve, reject) {
		var filePath = argv.file;
		var fileName = filePath;
		if (fileName.indexOf('/') > 0) {
			fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
		}

		var folderPathStr = filePath.indexOf('/') >= 0 ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
		var resourceFolder = false;
		var resourceName;
		var resourceType;
		var resourceLabel;
		if (folderPathStr && (folderPathStr.indexOf('site:') === 0 || folderPathStr.indexOf('theme:') === 0 || folderPathStr.indexOf('component:') === 0)) {
			resourceFolder = true;
			if (folderPathStr.indexOf('site:') === 0) {
				folderPathStr = folderPathStr.substring(5);
				resourceType = 'site';
				resourceLabel = 'Sites';
			} else if (folderPathStr.indexOf('theme:') === 0) {
				folderPathStr = folderPathStr.substring(6);
				resourceType = 'theme';
				resourceLabel = 'Themes';
			} else {
				folderPathStr = folderPathStr.substring(10);
				resourceType = 'component';
				resourceLabel = 'Components';
			}
			if (folderPathStr.indexOf('/') > 0) {
				resourceName = folderPathStr.substring(0, folderPathStr.indexOf('/'));
				folderPathStr = folderPathStr.substring(folderPathStr.indexOf('/') + 1);
			} else {
				resourceName = folderPathStr;
				folderPathStr = '';
			}
		}
		// console.log('argv.file=' + argv.file + ' folderPathStr=' + folderPathStr + ' resourceName=' + resourceName);

		var folderPath = folderPathStr.split('/');
		var folderId;

		if (!fs.existsSync(documentsSrcDir)) {
			fs.mkdirSync(documentsSrcDir, {
				recursive: true
			});
		}
		var targetPath;
		if (argv.folder) {
			targetPath = argv.folder;
			if (!path.isAbsolute(targetPath)) {
				targetPath = path.join(projectDir, targetPath);
			}
			targetPath = path.resolve(targetPath);
			if (!fs.existsSync(targetPath)) {
				console.error('ERROR: folder ' + targetPath + ' does not exist');
				return resolve({
					err: 'err'
				});
			}
			if (!fs.statSync(targetPath).isDirectory()) {
				console.error('ERROR: ' + targetPath + ' is not a folder');
				return resolve({
					err: 'err'
				});
			}
		}

		var resourcePromises = [];
		if (resourceFolder) {
			if (resourceType === 'site') {
				resourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				resourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				resourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}

		var fileVersion = argv.fileversion ? argv.fileversion.toString() : '';

		var startTime;
		var targetFile;
		var file;

		Promise.all(resourcePromises).then(function (results) {
			var rootParentId = 'self';
			if (resourceFolder) {
				var resourceGUID;
				if (results.length > 0 && results[0]) {
					resourceGUID = results[0].id;
				}

				if (!resourceGUID) {
					console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
					return Promise.reject();
				}
				rootParentId = resourceGUID;
			}
			return _findFolder(server, rootParentId, folderPath);

		}).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (resourceFolder && !result.id || !resourceFolder && result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.error('ERROR: invalid folder ' + folderPathStr);
				return Promise.reject();
			}
			folderId = result.id;

			return serverRest.findFile({
				server: server,
				parentID: result.id,
				filename: fileName,
				itemtype: 'file'
			});

		}).then(function (result) {
			if (!result || !result.id) {
				return Promise.reject();
			}
			file = result;

			if (file.type !== 'file') {
				console.error('ERROR: ' + fileName + ' is not a file');
				return Promise.reject();
			}

			var versionPromises = [];
			if (fileVersion) {
				versionPromises.push(_getFileVersions(server, file.id));
			}

			return Promise.all(versionPromises);

		}).then(function (results) {

			var versionSize;
			var i;
			if (fileVersion) {
				var versions = results && results[0] || [];
				var versionExist = false;
				for (i = 0; i < versions.length; i++) {
					if (versions[i].dRevisionID === fileVersion) {
						versionExist = true;
						versionSize = versions[i].dFileSize;
						break;
					}
				}
				if (!versionExist) {
					console.error('ERROR: file ' + file.name + ' does not have version ' + fileVersion);
					return Promise.reject();
				}
			}

			// console.log('folderId: ' + folderId + ' fileName: ' + fileName + ' fileId: ' + file.id);
			if (!argv.folder) {
				targetPath = documentsSrcDir;
				if (resourceFolder) {
					targetPath = path.join(documentsSrcDir, resourceName);
					if (!fs.existsSync(targetPath)) {
						fs.mkdirSync(targetPath, {
							recursive: true
						});
					}
				}
				for (i = 0; i < folderPath.length; i++) {
					targetPath = path.join(targetPath, folderPath[i]);
					if (!fs.existsSync(targetPath)) {
						fs.mkdirSync(targetPath, {
							recursive: true
						});
					}
				}
			}

			targetFile = path.join(targetPath, fileName);
			if (fileVersion) {
				console.info(' - downloading file (id: ' + file.id + ' version: ' + fileVersion + ' size: ' + versionSize + ') ...');
			} else {
				console.info(' - downloading file (id: ' + file.id + ' version: ' + file.version + ' size: ' + file.size + ') ...');
			}
			startTime = new Date();
			return serverRest.downloadFileSave({
				server: server,
				fFileGUID: file.id,
				version: fileVersion,
				saveTo: targetFile
			});

		}).then(function (result) {
			if (!result || result.err) {
				console.error('ERROR: failed to get file from server');
				return Promise.reject();
			}

			console.log(' - save file ' + targetFile + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

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

module.exports.downloadFile = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_downloadFile(argv, server)
			.then(function (result) {
				if (!result || result.err) {
					done();
				} else {
					done(true);
				}
			});
	}); // login
};

//
// argv.file = <file path> such docs/file1.json, site:site1/structure.json
//
var _getFileContent = function (argv, server) {
	return new Promise(function (resolve, reject) {
		var filePath = argv.file;
		var fileName = filePath;
		if (fileName.indexOf('/') > 0) {
			fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
		}

		var info = _getResourceInfo(server, filePath);
		var resourceName = info.resourceName;
		var resourceType = info.resourceType;
		var folderResourcePromises = info.resourcePromises;
		var resourceFolder = resourceName && resourceType;
		if (resourceFolder) {
			filePath = info.resourcePath;
		}

		var fileRootParentId = 'self';
		var file;

		Promise.all(folderResourcePromises)
			.then(function (results) {
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
						return Promise.reject();
					}
					fileRootParentId = resourceGUID;
				}
				// console.log(' - file root parent ' + fileRootParentId);

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: fileRootParentId,
					folderPath: filePath
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: file ' + filePath + ' does not exist');
					return Promise.reject();
				}
				file = result;

				console.info(' - verify source file ' + filePath + ' (Id: ' + file.id + ' version: ' + file.version + ')');

				return serverRest.downloadFile({
					server: server,
					fFileGUID: file.id
				});

			})
			.then(function (result) {

				return resolve(result);

			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({ err: 'err' });
			});
	});
};


module.exports.shareFolder = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		var name = argv.name;
		var folderPath = name.split('/');
		var folderId;

		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];
		var role = argv.role;

		var users = [];
		var groups = [];

		_findFolder(server, 'self', folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.error('ERROR: invalid folder ' + argv.name);
				return Promise.reject();
			}
			folderId = result.id;

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

				var i;
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
							return Promise.reject();
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
				var i;
				for (i = 0; i < results.length; i++) {
					if (results[i].items) {
						allUsers = allUsers.concat(results[i].items);
					}
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
						return Promise.reject();
					}
				}

				return serverRest.getFolderUsers({
					server: server,
					id: folderId
				});
			})
			.then(function (result) {
				var existingMembers = result.data || [];

				var sharePromises = [];
				var i, j;
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
						id: folderId,
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
						id: folderId,
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
							results[i].role + '" on folder ' + name);
					} else {
						console.error('ERROR: ' + results[i].title);
					}
				}
				done(shared);
			})
			.catch((error) => {
				done();
			});
	});
};


module.exports.unshareFolder = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		var name = argv.name;
		var folderPath = name.split('/');
		var folderId;

		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];
		var users = [];
		var groups = [];

		_findFolder(server, 'self', folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.error('ERROR: invalid folder ' + argv.name);
				return Promise.reject();
			}
			folderId = result.id;

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

				var i;
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
							return Promise.reject();
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
				var i;
				for (i = 0; i < results.length; i++) {
					if (results[i].items) {
						allUsers = allUsers.concat(results[i].items);
					}
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (i = 0; i < allUsers.length; i++) {
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
						return Promise.reject();
					}
				}

				return serverRest.getFolderUsers({
					server: server,
					id: folderId
				});
			})
			.then(function (result) {
				var existingMembers = result.data || [];
				var revokePromises = [];
				var i, j;
				var existingUser
				for (i = 0; i < users.length; i++) {
					existingUser = false;
					for (j = 0; j < existingMembers.length; j++) {
						if (users[i].id === existingMembers[j].id) {
							existingUser = true;
							break;
						}
					}

					if (existingUser) {
						revokePromises.push(serverRest.unshareFolder({
							server: server,
							id: folderId,
							userId: users[i].id
						}));
					} else {
						console.log(' - user ' + users[i].loginName + ' has no access to the folder');
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
							id: folderId,
							userId: groups[i].groupID
						}));
					} else {
						console.log(' - group ' + (groups[i].displayName || groups[i].name) + ' has no access to the folder');
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
						console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + '\'s access to the folder removed');
					} else {
						console.error('ERROR: ' + results[i].title);
					}
				}
				done(unshared);
			})
			.catch((error) => {
				done();
			});
	});
};


// Read file from server
var _readFile = function (server, fFileGUID, fileName, folderPath) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';

		var options = {
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			encoding: null
		};

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get file ' + fileName + (response.ecid ? ' (ecid: ' + response.ecid + ')' : ''));
				console.error(error);
				resolve({});
			}
			if (response && response.statusCode === 200) {
				resolve({
					id: fFileGUID,
					name: fileName,
					folderPath: folderPath,
					data: body
				});
			} else {
				var msg = '';
				if (response && response.statusMessage) {
					msg = response.statusMessage;
				}
				if (response && response.statusCode) {
					msg = msg + ' ' + response.statusCode;
				}
				if (response && response.ecid) {
					msg = msg + ' (ecid: ' + response.ecid + ')';
				}
				console.error('ERROR: failed to get file ' + fileName + ' : ' + msg);
				resolve({});
			}

		});
	});
};

module.exports.listFolder = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var inputPath = argv.path === '/' ? '' : serverUtils.trimString(argv.path, '/');
		var resourceFolder = false;
		var resourceName;
		var resourceType;
		var resourceLabel;
		if (inputPath && (inputPath.indexOf('site:') === 0 || inputPath.indexOf('theme:') === 0 || inputPath.indexOf('component:') === 0)) {
			resourceFolder = true;
			if (inputPath.indexOf('site:') === 0) {
				inputPath = inputPath.substring(5);
				resourceType = 'site';
				resourceLabel = 'Sites';
			} else if (inputPath.indexOf('theme:') === 0) {
				inputPath = inputPath.substring(6);
				resourceType = 'theme';
				resourceLabel = 'Themes';
			} else {
				inputPath = inputPath.substring(10);
				resourceType = 'component';
				resourceLabel = 'Components';
			}
			if (inputPath.indexOf('/') > 0) {
				resourceName = inputPath.substring(0, inputPath.indexOf('/'));
				inputPath = inputPath.substring(inputPath.indexOf('/') + 1);
			} else {
				resourceName = inputPath;
				inputPath = '';
			}
		}

		var resourcePromises = [];
		if (resourceFolder) {
			if (resourceType === 'site') {
				resourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				resourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				resourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}

		var folderPath = argv.path === '/' || !inputPath ? [] : inputPath.split('/');
		var folderId;

		Promise.all(resourcePromises).then(function (results) {
			var rootParentId = 'self';
			if (resourceFolder) {
				var resourceGUID;
				if (results.length > 0 && results[0]) {
					resourceGUID = results[0].id;
				}

				if (!resourceGUID) {
					console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
					return Promise.reject();
				}
				rootParentId = resourceGUID;
			}
			// console.log(folderPath);
			return _findFolder(server, rootParentId, folderPath);
		})
			.then(function (result) {
				if (folderPath.length > 0 && !result) {
					return Promise.reject();
				}

				if (resourceFolder && !result.id || !resourceFolder && result.id !== 'self' && (!result.type || result.type !== 'folder')) {
					console.error('ERROR: invalid folder ' + argv.path);
					return Promise.reject();
				}
				folderId = result.id;

				console.log(' - parent folder: ' + argv.path + ' (Id: ' + folderId + ')');

				return serverRest.findFolderItems({
					server: server,
					parentID: folderId
				});
			})
			.then(function (result) {
				var items = result || [];

				var byName = items.slice(0);
				byName.sort(function (a, b) {
					var x = a.path;
					var y = b.path;
					return (x < y ? -1 : x > y ? 1 : 0);
				});
				items = byName;

				console.log('');
				var format = '   %-6s  %-44s  %-20s  %-s';
				console.log(sprintf(format, 'Type', 'Id', 'Last Modified Date', 'Path'));
				items.forEach(function (item) {
					var itemPath = item.path;
					if (item.version) {
						itemPath = itemPath + ' (';
						if (item.size) {
							itemPath = itemPath + item.size + ' bytes ';
						}
						itemPath = itemPath + 'version ' + item.version;
						itemPath = itemPath + ')';
					}
					console.log(sprintf(format, item.type, item.id, item.lastModifiedDate ? item.lastModifiedDate : '', itemPath));
				});
				console.log('');
				console.log('Total: ' + items.length);

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


module.exports.downloadFolder = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_downloadFolder(argv, server, true, true).then(function (result) {
			if (!result || result.err) {
				done();
			} else {
				done(true);
			}
		}).catch(function (error) {
			done();
		});
	});
};

var _downloadFolder = function (argv, server, showError, showDetail, excludeFolder, fileGroupSize) {
	return new Promise(function (resolve, reject) {
		var targetPath;
		if (argv.folder) {
			targetPath = argv.folder;
			if (!path.isAbsolute(targetPath)) {
				targetPath = path.join(projectDir, targetPath);
			}
			targetPath = path.resolve(targetPath);
			if (!fs.existsSync(targetPath)) {
				console.error('ERROR: folder ' + targetPath + ' does not exist');
				return reject();
			}
			if (!fs.statSync(targetPath).isDirectory()) {
				console.error('ERROR: ' + targetPath + ' is not a folder');
				return reject();
			}
		}

		var groupSize = fileGroupSize === undefined ? 50 : fileGroupSize;

		var inputPath = argv.path === '/' ? '' : serverUtils.trimString(argv.path, '/');
		var resourceFolder = false;
		var resourceName;
		var resourceType;
		var resourceLabel;
		if (inputPath && (inputPath.indexOf('site:') === 0 || inputPath.indexOf('theme:') === 0 || inputPath.indexOf('component:') === 0)) {
			resourceFolder = true;
			if (inputPath.indexOf('site:') === 0) {
				inputPath = inputPath.substring(5);
				resourceType = 'site';
				resourceLabel = 'Sites';
			} else if (inputPath.indexOf('theme:') === 0) {
				inputPath = inputPath.substring(6);
				resourceType = 'theme';
				resourceLabel = 'Themes';
			} else {
				inputPath = inputPath.substring(10);
				resourceType = 'component';
				resourceLabel = 'Components';
			}
			if (inputPath.indexOf('/') > 0) {
				resourceName = inputPath.substring(0, inputPath.indexOf('/'));
				inputPath = inputPath.substring(inputPath.indexOf('/') + 1);
			} else {
				resourceName = inputPath;
				inputPath = '';
			}
		}

		var folderPath = argv.path === '/' || !inputPath ? [] : inputPath.split('/');
		// console.log('argv.path=' + argv.path + ' inputPath=' + inputPath + ' folderPath=' + folderPath);

		var folderId;

		// All files of the folder to download from server
		var _files = [];

		var loginPromises = [];

		if (resourceFolder) {
			loginPromises.push(serverUtils.loginToServer(server));
		}

		Promise.all(loginPromises).then(function (results) {
			if (resourceFolder && (!results || results.length === 0 || !results[0].status)) {
				console.error(results[0].statusMessage);
				return reject();
			}

			var resourcePromises = [];
			if (resourceFolder) {
				if (resourceType === 'site') {
					resourcePromises.push(sitesRest.getSite({
						server: server,
						name: resourceName
					}));
				} else if (resourceType === 'theme') {
					resourcePromises.push(sitesRest.getTheme({
						server: server,
						name: resourceName
					}));
				} else {
					resourcePromises.push(sitesRest.getComponent({
						server: server,
						name: resourceName,
						showInfo: showDetail,
						showError: showError
					}));
				}
			}

			Promise.all(resourcePromises).then(function (results) {
				var rootParentId = argv.parentId || 'self';
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						if (showError) {
							console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
						}
						return Promise.reject();
					}
					rootParentId = resourceGUID;
				}

				return _findFolder(server, rootParentId, folderPath, showError, showDetail);
			})
				.then(function (result) {
					if (folderPath.length > 0 && !result) {
						return Promise.reject();
					}

					if (resourceFolder && !result.id || !resourceFolder && result.id !== 'self' && (!result.type || result.type !== 'folder')) {
						console.error('ERROR: invalid folder ' + argv.path);
						return Promise.reject();
					}
					folderId = result.id;

					return _downloadFolderWithId(server, folderId, inputPath, excludeFolder, _files);
				})
				.then(function (result) {
					// console.log(' _files: ' + _files.length);

					// 50 per group
					return _readAllFiles(server, _files, showDetail, groupSize);
				})
				.then(function (results) {
					// check if there is any failed file
					var failedFiles = [];
					var i;
					_files.forEach(function (file) {
						var downloaded = false;
						for (i = 0; i < results.length; i++) {
							var downloadedFile = results[i];
							if (downloadedFile && downloadedFile.id && downloadedFile.name && downloadedFile.data && downloadedFile.id === file.id) {
								downloaded = true;
								break;
							}
						}
						if (!downloaded) {
							failedFiles.push(file);
						}
					});

					if (!argv.folder) {
						targetPath = documentsSrcDir;
						if (resourceFolder) {
							targetPath = path.join(documentsSrcDir, resourceName);
							if (!fs.existsSync(targetPath)) {
								fs.mkdirSync(targetPath, {
									recursive: true
								});
							}
						}
						for (i = 0; i < folderPath.length; i++) {
							targetPath = path.join(targetPath, folderPath[i]);
							if (!fs.existsSync(targetPath)) {
								fs.mkdirSync(targetPath, {
									recursive: true
								});
							}
						}
					}

					for (i = 0; i < results.length; i++) {
						var file = results[i];
						if (file && file.id && file.name && file.data) {
							var folderPathStr = serverUtils.trimString(file.folderPath, '/');

							// do not create folder hierarchy on the server when save to different local folder
							if (inputPath && folderPathStr.startsWith(inputPath)) {
								folderPathStr = folderPathStr.substring(inputPath.length);
							}

							var fileFolderPath = folderPathStr ? folderPathStr.split('/') : [];
							var targetFile = targetPath;
							for (var j = 0; j < fileFolderPath.length; j++) {
								targetFile = path.join(targetFile, fileFolderPath[j]);
								if (!fs.existsSync(targetFile)) {
									fs.mkdirSync(targetFile, {
										recursive: true
									});
								}
							}
							targetFile = path.join(targetFile, file.name);

							fs.writeFileSync(targetFile, file.data);
							if (showDetail) {
								console.log(' - save file ' + targetFile);
							}
						}
					}

					var readFilesRetryPromises = [];
					if (failedFiles.length > 0) {
						// console.log(failedFiles);
						console.info(' - try to download failed files again ...');
						let retryGroupSize = groupSize > 10 ? 10 : groupSize;
						readFilesRetryPromises.push(_readAllFiles(server, failedFiles, showDetail, retryGroupSize));
					}

					return Promise.all(readFilesRetryPromises);
				})
				.then(function (result) {
					var results = result && result[0] || [];
					for (var i = 0; i < results.length; i++) {
						var file = results[i];
						if (file && file.id && file.name && file.data) {
							var folderPathStr = serverUtils.trimString(file.folderPath, '/');

							// do not create folder hierarchy on the server when save to different local folder
							if (inputPath && folderPathStr.startsWith(inputPath)) {
								folderPathStr = folderPathStr.substring(inputPath.length);
							}

							var fileFolderPath = folderPathStr ? folderPathStr.split('/') : [];
							var targetFile = targetPath;
							for (var j = 0; j < fileFolderPath.length; j++) {
								targetFile = path.join(targetFile, fileFolderPath[j]);
								if (!fs.existsSync(targetFile)) {
									fs.mkdirSync(targetFile, {
										recursive: true
									});
								}
							}
							targetFile = path.join(targetFile, file.name);

							fs.writeFileSync(targetFile, file.data);

							console.log(' - save file ' + targetFile);

						}
					}

					return resolve({});
				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});
		}); // login
	});
};

var _readAllFiles = function (server, files, showDetail, groupSize) {
	var showInfo = showDetail !== undefined ? showDetail : true;
	return new Promise(function (resolve, reject) {
		var total = files.length;
		if (showInfo) {
			console.info(' - total number of files: ' + total);
		}
		var groups = [];
		var limit = groupSize === undefined ? 10 : groupSize;
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

		var fileData = [];
		var count = [];

		var needNewLine = false;
		var doReadFile = groups.reduce(function (filePromise, param) {
			return filePromise.then(function (result) {
				var filePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					filePromises.push(_readFile(server, files[i].id, files[i].name, files[i].folderPath));
				}

				count.push('.');
				if (console.showInfo()) {
					process.stdout.write(' - downloading files [' + param.start + ', ' + param.end + '] ...');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
				return Promise.all(filePromises).then(function (results) {
					fileData = fileData.concat(results);
				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doReadFile.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			// console.log(' - total number of downloaded files: ' + fileData.length);
			resolve(fileData);
		});

	});
};

var _downloadFolderWithId = function (server, parentId, parentPath, excludeFolder, _files) {
	// console.log(' - folder: id=' + parentId + ' path=' + parentPath + ' excludeFolder=' + excludeFolder);
	return new Promise(function (resolve, reject) {
		var doQuery = true;
		if (excludeFolder && excludeFolder.length > 0) {
			for (var j = 0; j < excludeFolder.length; j++) {
				if (excludeFolder[j] && parentPath.indexOf(excludeFolder[j]) === 0) {
					doQuery = false;
					break;
				}
			}
		}
		if (doQuery) {

			var items;
			var size = 10000;
			serverRest.getChildItems({
				server: server,
				parentID: parentId,
				limit: size
			})
				.then(function (result) {
					if (!result) {
						resolve();
					}

					items = result && result.items || [];
					// console.log(' - total ' + result.childItemsCount);
					// console.log(' - offset: ' + result.offset + ' count: ' + result.count);

					var remaining = result.childItemsCount - size;
					var queryAgainPromises = [];
					var extra = 1;
					while (remaining > 0) {
						var offset = size * extra;
						queryAgainPromises.push(serverRest.getChildItems({
							server: server,
							parentID: parentId,
							limit: size,
							offset: offset
						}));
						remaining = remaining - size;
						extra = extra + 1;
					}

					return Promise.all(queryAgainPromises);

				})
				.then(function (results) {

					var i;
					if (results && results.length > 0) {
						for (i = 0; i < results.length; i++) {
							// console.log(' - ' + i + ' offset: ' + results[i].offset + ' count: ' + results[i].count);
							var items2 = results[i] && results[i].items;
							if (items2.length > 0) {
								items = items.concat(items2);
							}
						}
					}

					var subfolderPromises = [];
					for (i = 0; i < items.length; i++) {
						if (items[i].type === 'file') {
							// console.log(' - file: id=' + items[i].id + ' path=' + parentPath + '/' + items[i].name);
							_files.push({
								id: items[i].id,
								name: items[i].name,
								folderPath: parentPath
							});
						} else {
							subfolderPromises.push(_downloadFolderWithId(server, items[i].id, parentPath + '/' + items[i].name, excludeFolder, _files));
						}
					}
					return Promise.all(subfolderPromises);

				})
				.then(function (results) {
					resolve(results);
				});
		} else {
			console.info(' - exclude ' + parentPath);
			resolve({});
		}
	});
};

module.exports.uploadFolder = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		_uploadFolder(argv, server).then(function () {
			console.log(' - folder uploaded');
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _uploadFolder = function (argv, server) {
	return new Promise(function (resolve, reject) {
		var srcPath = argv.path;
		var contentOnly = serverUtils.endsWith(srcPath, path.sep) || serverUtils.endsWith(srcPath, '/');

		var retry = argv.retry === undefined ? true : argv.retry;
		var excludeFiles = argv.excludeFiles || [];

		if (!path.isAbsolute(srcPath)) {
			srcPath = path.join(projectDir, srcPath);
		}
		srcPath = path.resolve(srcPath);

		if (!fs.existsSync(srcPath)) {
			console.error('ERROR: file ' + srcPath + ' does not exist');
			return reject();
		}
		if (!fs.statSync(srcPath).isDirectory()) {
			console.error('ERROR: ' + srcPath + ' is not a folder');
			return reject();
		}

		var showDetail = argv.noMsg ? false : true;

		var folderName = contentOnly ? '' : srcPath.substring(srcPath.lastIndexOf(path.sep) + 1);
		// console.log(' - path=' + argv.path + ' srcPath=' + srcPath + ' contentOnly=' + contentOnly + ' folderName=' + folderName);

		var inputPath = argv.folder === '/' ? '' : serverUtils.trimString(argv.folder, '/');
		var resourceFolder = false;
		var resourceName;
		var resourceType;
		var resourceLabel;
		if (inputPath && (inputPath.indexOf('site:') === 0 || inputPath.indexOf('theme:') === 0 || inputPath.indexOf('component:') === 0)) {
			resourceFolder = true;
			if (inputPath.indexOf('site:') === 0) {
				inputPath = inputPath.substring(5);
				resourceType = 'site';
				resourceLabel = 'Sites';
			} else if (inputPath.indexOf('theme:') === 0) {
				inputPath = inputPath.substring(6);
				resourceType = 'theme';
				resourceLabel = 'Themes';
			} else {
				inputPath = inputPath.substring(10);
				resourceType = 'component';
				resourceLabel = 'Components';
			}
			if (inputPath.indexOf('/') > 0) {
				resourceName = inputPath.substring(0, inputPath.indexOf('/'));
				inputPath = inputPath.substring(inputPath.indexOf('/') + 1);
			} else {
				resourceName = inputPath;
				inputPath = '';
			}
		}
		// console.log('argv.folder=' + argv.folder + ' inputPath=' + inputPath + ' resourceName=' + resourceName);
		var folderPath = !argv.folder || argv.folder === '/' || !inputPath ? [] : inputPath.split(path.sep);
		if (folderName) {
			folderPath.push(folderName);
		}
		if (showDetail) {
			console.info(' - target folder: ' + (resourceFolder ? (resourceLabel + ' > ' + resourceName) : 'Documents') + ' > ' + folderPath.join(' > '));
		}
		var rootParentFolderLabel = resourceFolder ? resourceName : 'Home folder';

		var rootParentId = 'self';

		// get all files to upload
		var folderContent = [];
		serverUtils.paths(srcPath, function (err, paths) {
			if (err) {
				console.error(err);
				return reject();
			} else {
				// the top level folder
				if (folderName) {
					folderContent.push({
						fileFolder: '',
						files: []
					});
				}
				// get all sub folders including empty ones
				var subdirs = paths.dirs;
				var i, j;
				for (i = 0; i < subdirs.length; i++) {
					var subdir = subdirs[i];
					if (subdir.indexOf('_scs_theme_root_') < 0 && subdir.indexOf('_scs_design_name_') < 0) {
						subdir = subdir.substring(srcPath.length + 1);
						folderContent.push({
							fileFolder: subdir,
							files: []
						});
					}
				}

				var files = paths.files;
				if (showDetail) {
					console.info(' - total files: ' + files.length);
				}
				// group files under the same folder
				for (i = 0; i < files.length; i++) {
					var src = files[i];
					var excluded = false;
					for (j = 0; j < excludeFiles.length; j++) {
						if (src.indexOf(excludeFiles[j]) >= 0) {
							excluded = true;
							break;
						}
					}
					if (!excluded && src.indexOf('_scs_theme_root_') < 0 && src.indexOf('_scs_design_name_') < 0) {
						src = src.substring(srcPath.length + 1);
						var fileFolder = src.indexOf(path.sep) > 0 ? src.substring(0, src.lastIndexOf(path.sep)) : '';

						var found = false;
						for (j = 0; j < folderContent.length; j++) {
							if (folderContent[j].fileFolder === fileFolder) {
								found = true;
								folderContent[j].files.push(files[i]);
								break;
							}
						}
						if (!found) {
							folderContent.push({
								fileFolder: fileFolder,
								files: [files[i]]
							});
						}
					}
				}
				// console.log(folderContent);

				var resourcePromises = [];
				if (resourceFolder) {
					if (resourceType === 'site') {
						resourcePromises.push(sitesRest.getSite({
							server: server,
							name: resourceName
						}));
					} else if (resourceType === 'theme') {
						resourcePromises.push(sitesRest.getTheme({
							server: server,
							name: resourceName
						}));
					} else {
						resourcePromises.push(sitesRest.getComponent({
							server: server,
							name: resourceName,
							showInfo: showDetail
						}));
					}
				}

				Promise.all(resourcePromises).then(function (results) {

					if (resourceFolder) {
						var resourceGUID;
						if (results.length > 0 && results[0]) {
							resourceGUID = results[0].id;
						}

						if (!resourceGUID) {
							console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
							return Promise.reject();
						}
						rootParentId = resourceGUID;
					}

					return _createFolderUploadFiles(server, rootParentId, folderPath, folderContent, rootParentFolderLabel, showDetail);
				})
					.then(function (results) {
						// console.log(results);
						// check if there are failures
						var failedFolderContent = [];
						folderContent.forEach(function (folder) {
							var files = folder.files;
							var failedFiles = [];
							for (var i = 0; i < files.length; i++) {
								var found = false;
								for (var j = 0; j < results.length; j++) {
									if (files[i] === results[j]) {
										found = true;
										break;
									}
								}
								if (!found) {
									failedFiles.push(files[i]);
								}
							}
							if (failedFiles.length > 0) {
								failedFolderContent.push({
									fileFolder: folder.fileFolder,
									files: failedFiles
								});
							}
						});
						if (failedFolderContent.length > 0 && retry) {
							console.info(' - try to upload failed files again ...');
							// console.log(failedFolderContent);
							_createFolderUploadFiles(server, rootParentId, folderPath, failedFolderContent, rootParentFolderLabel, showDetail).then(function (result) {
								return resolve(true);
							});

						} else {
							if (failedFolderContent.length > 0)
								return resolve(false);
							else
								return resolve(true);
						}
					})
					.catch((error) => {
						if (error) {
							console.error(error);
						}
						return reject();
					});
			}
		});
	});
};

var _createFolderUploadFiles = function (server, rootParentId, folderPath, folderContent, rootParentFolderLabel, showDetail) {
	return new Promise(function (resolve, reject) {
		var format = '   %-8s  %-s';
		var uploadedFiles = [];
		var doCreateFolders = folderContent.reduce(function (createPromise, param) {
			return createPromise.then(function (result) {
				var folders = folderPath;
				if (param.fileFolder) {
					folders = folders.concat(param.fileFolder.split(path.sep));
				}

				return _createFolder(server, rootParentId, folders, false).then(function (parentFolder) {

					if (parentFolder) {
						var folders2 = folders.slice(0);
						folders2.pop();
						var folderStr = rootParentFolderLabel + '/' + (folders2.length > 0 ? folders2.join('/') : '');

						if (parentFolder.name) {
							if (showDetail) {
								console.info(sprintf(format, 'Folder', folderStr + (folderStr.endsWith('/') ? '' : '/') + parentFolder.name));
							}
						} else {
							if (showDetail) {
								console.info(sprintf(format, 'Folder', folderStr));
							}
						}

						return _createAllFiles(server, rootParentFolderLabel, folders, parentFolder, param.files, format, showDetail).then(function (files) {
							uploadedFiles = uploadedFiles.concat(files);
						});
					}
				});
			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));
		if (showDetail) {
			console.info(' - folder uploaded:');
			console.info(sprintf(format, 'Type', 'Path'));
		}
		doCreateFolders.then(function (result) {
			resolve(uploadedFiles);
		});
	});
};

var _createAllFiles = function (server, rootParentFolderLabel, folders, parentFolder, files, format, showDetail) {
	return new Promise(function (resolve, reject) {
		var total = files.length;
		// console.log(' - total number of files to create: ' + total);
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
		// console.log(' - total number of groups: ' + groups.length);

		var uploadedFiles = [];
		var doWriteFile = groups.reduce(function (filePromise, param) {
			return filePromise.then(function (result) {
				var filePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					var filePath = files[i];
					var fileName = filePath.substring(filePath.lastIndexOf(path.sep) + 1);

					filePromises.push(serverRest.createFile({
						server: server,
						parentID: parentFolder.id,
						filename: fileName,
						filepath: filePath,
						contents: fs.createReadStream(filePath)
					}));
				}


				return Promise.all(filePromises).then(function (results) {
					var folderStr = rootParentFolderLabel + '/' + (folders.length > 0 ? folders.join('/') : '');
					for (var i = 0; i < results.length; i++) {
						var file = results[i];
						if (file && !file.err) {
							if (showDetail) {
								console.info(sprintf(format, 'File', folderStr + (folderStr.endsWith('/') ? '' : '/') + file.name + ' (Version: ' + file.version + ')'));
							}
							uploadedFiles.push(file.filepath);
						}
					}

				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doWriteFile.then(function (result) {

			resolve(uploadedFiles);
		});

	});
};



module.exports.deleteFolder = function (argv, done) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_deleteFolder(argv, server).then(function () {
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _deleteFolder = function (argv, server, noMsg) {

	var showDetail = noMsg ? false : true;

	var permanent = typeof argv.permanent === 'string' && argv.permanent.toLowerCase() === 'true';

	var inputPath = argv.path === '/' ? '' : serverUtils.trimString(argv.path, '/');
	var resourceFolder = false;
	var resourceName;
	var resourceType;
	var resourceLabel;
	if (inputPath && (inputPath.indexOf('site:') === 0 || inputPath.indexOf('theme:') === 0 || inputPath.indexOf('component:') === 0)) {
		resourceFolder = true;
		if (inputPath.indexOf('site:') === 0) {
			inputPath = inputPath.substring(5);
			resourceType = 'site';
			resourceLabel = 'Sites';
		} else if (inputPath.indexOf('theme:') === 0) {
			inputPath = inputPath.substring(6);
			resourceType = 'theme';
			resourceLabel = 'Themes';
		} else {
			inputPath = inputPath.substring(10);
			resourceType = 'component';
			resourceLabel = 'Components';
		}
		if (inputPath.indexOf('/') > 0) {
			resourceName = inputPath.substring(0, inputPath.indexOf('/'));
			inputPath = inputPath.substring(inputPath.indexOf('/') + 1);
		} else {
			resourceName = inputPath;
			inputPath = '';
		}
	}

	var folderPath = argv.path === '/' || !inputPath ? [] : inputPath.split('/');
	// console.log('argv.path=' + argv.path + ' inputPath=' + inputPath + ' folderPath=' + folderPath);

	if (folderPath.length === 0) {
		console.error('ERROR: no folder is specified');
		return Promise.reject();
	}

	var folderId;

	var loginPromises = [];

	if (resourceFolder || permanent) {
		loginPromises.push(serverUtils.loginToServer(server));
	}

	return Promise.all(loginPromises).then(function (results) {
		if ((resourceFolder || permanent) && (!results || results.length === 0 || !results[0].status)) {
			return Promise.reject();
		}

		var resourcePromises = [];
		if (resourceFolder) {
			if (resourceType === 'site') {
				resourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				resourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				resourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}

		return Promise.all(resourcePromises).then(function (results) {
			var rootParentId = 'self';
			if (resourceFolder) {
				var resourceGUID;
				if (results.length > 0 && results[0]) {
					resourceGUID = results[0].id;
				}

				if (!resourceGUID) {
					console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
					return Promise.reject();
				}
				rootParentId = resourceGUID;
			}

			return _findFolder(server, rootParentId, folderPath);
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				if (!resourceFolder) {
					let createdBy = result.createdBy && result.createdBy.loginName;
					let ownedBy = result.ownedBy && result.ownedBy.loginName;
					if (createdBy && createdBy.toLowerCase() !== server.username.toLowerCase() && ownedBy && ownedBy.toLowerCase() !== server.username.toLowerCase()) {
						console.error('ERROR: folder ' + inputPath + ' is created by ' + createdBy + ' owned by ' + ownedBy);
						return Promise.reject();
					}
				}
				folderId = result.id;

				var deletePromise = permanent ? serverUtils.deletePermanentSCS(server, folderId, false, _deleteDone) : serverRest.deleteFolder({
					server: server,
					fFolderGUID: folderId
				});
				return deletePromise;
			})
			.then(function (result) {
				if (result && result.err) {
					return Promise.reject();
				}

				if (showDetail) {
					console.log(' - folder ' + argv.path + ' deleted');
				}
				if (!permanent) {
					return Promise.resolve(true);
				} else {
					if (showDetail) {
						console.log(' - folder ' + argv.path + ' deleted permanently');
					}
					return Promise.resolve(true);
				}
			})
			.catch((error) => {
				return Promise.reject();
			});
	}); // login
};

var localServer;
var _deleteDone = function (success, resolve) {
	if (localServer) {
		localServer.close();
	}
	return success ? resolve({}) : resolve({
		err: 'err'
	});
};

module.exports.deleteFile = function (argv, done) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_deleteFile(argv, server, true, true).then(function () {
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _deleteFile = function (argv, server, toReject, showMsg) {

	var permanent = typeof argv.permanent === 'string' && argv.permanent.toLowerCase() === 'true';

	var filePath = argv.file;
	var fileName = filePath;
	if (fileName.indexOf('/') >= 0) {
		fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
	}
	// console.log('file: ' + filePath + ' fileName: ' + fileName);

	var folderPathStr = filePath.indexOf('/') >= 0 ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
	var resourceFolder = false;
	var resourceName;
	var resourceType;
	var resourceLabel;
	if (folderPathStr && (folderPathStr.indexOf('site:') === 0 || folderPathStr.indexOf('theme:') === 0 || folderPathStr.indexOf('component:') === 0)) {
		resourceFolder = true;
		if (folderPathStr.indexOf('site:') === 0) {
			folderPathStr = folderPathStr.substring(5);
			resourceType = 'site';
			resourceLabel = 'Sites';
		} else if (folderPathStr.indexOf('theme:') === 0) {
			folderPathStr = folderPathStr.substring(6);
			resourceType = 'theme';
			resourceLabel = 'Themes';
		} else {
			folderPathStr = folderPathStr.substring(10);
			resourceType = 'component';
			resourceLabel = 'Components';
		}
		if (folderPathStr.indexOf('/') > 0) {
			resourceName = folderPathStr.substring(0, folderPathStr.indexOf('/'));
			folderPathStr = folderPathStr.substring(folderPathStr.indexOf('/') + 1);
		} else {
			resourceName = folderPathStr;
			folderPathStr = '';
		}
	}

	// console.log('argv.file=' + argv.file + ' folderPathStr=' + folderPathStr + ' resourceName=' + resourceName);

	var folderPath = folderPathStr.split('/');

	var folderId, fileId;

	var loginPromises = [];

	if (resourceFolder || permanent) {
		loginPromises.push(serverUtils.loginToServer(server));
	}

	return Promise.all(loginPromises).then(function (results) {
		if ((resourceFolder || permanent) && (!results || results.length === 0 || !results[0].status)) {
			if (toReject) {
				return Promise.reject();
			} else {
				return Promise.resolve({
					err: 'err'
				});
			}
		}

		var resourcePromises = [];
		if (resourceFolder) {
			if (resourceType === 'site') {
				resourcePromises.push(sitesRest.getSite({
					server: server,
					name: resourceName
				}));
			} else if (resourceType === 'theme') {
				resourcePromises.push(sitesRest.getTheme({
					server: server,
					name: resourceName
				}));
			} else {
				resourcePromises.push(sitesRest.getComponent({
					server: server,
					name: resourceName
				}));
			}
		}

		return Promise.all(resourcePromises).then(function (results) {
			var rootParentId = 'self';
			if (resourceFolder) {
				var resourceGUID;
				if (results.length > 0 && results[0]) {
					resourceGUID = results[0].id;
				}

				if (!resourceGUID) {
					console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
					return Promise.reject();
				}
				rootParentId = resourceGUID;
			}

			return _findFolder(server, rootParentId, folderPath);
		})
			.then(function (result) {
				if (folderPath.length > 0 && !result) {
					return Promise.reject();
				}

				if (resourceFolder && !result.id || !resourceFolder && result.id !== 'self' && (!result.type || result.type !== 'folder')) {
					console.error('ERROR: invalid folder ' + folderPathStr);
					return Promise.reject();
				}
				folderId = result.id;

				return serverRest.findFile({
					server: server,
					parentID: result.id,
					filename: fileName,
					itemtype: 'file'
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				fileId = result.id;

				var deletePromise = permanent ? serverUtils.deletePermanentSCS(server, fileId, true, _deleteDone) : serverRest.deleteFile({
					server: server,
					fFileGUID: fileId
				});
				return deletePromise;
			})
			.then(function (result) {
				if (result && result.err) {
					return Promise.reject();
				}

				if (showMsg) {
					console.log(' - file ' + argv.file + ' deleted');
				}
				if (!permanent) {
					return Promise.resolve(true);
				} else {
					if (showMsg) {
						console.log(' - file ' + argv.file + ' deleted permanently');
					}
					return Promise.resolve(true);
				}
			})
			.catch((error) => {
				if (toReject) {
					return Promise.reject();
				} else {
					return Promise.resolve({
						err: 'err'
					});
				}
			});
	}); // login
};

var _getFileVersions = function (server, id) {
	return new Promise(function (resolve, reject) {
		var versions = [];
		var versionUrl = '/documents/integration?IdcService=FLD_FILE_REVISIONS&IsJson=1&item=fFileGUID:' + id;

		serverRest.executeGet({
			server: server,
			endpoint: versionUrl,
			noMsg: true
		}).then(function (result) {
			var data;
			try {
				data = JSON.parse(result);
			} catch (e) {
				data = result;
			}
			if (data && !data.err) {
				versions = serverUtils.getIDCServiceResults(data.ResultSets, 'REVISIONS');
			}
			return resolve(versions);
		});
	});
};

module.exports.describeFile = function (argv, done) {
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

	var filePath = argv.file;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var info = _getResourceInfo(server, filePath);
		var resourceName = info.resourceName;
		var resourceType = info.resourceType;
		var folderResourcePromises = info.resourcePromises;
		var resourceFolder = resourceName && resourceType;
		if (resourceFolder) {
			filePath = info.resourcePath;
		}

		var fileRootParentId = 'self';
		var file;
		var versions = [];
		var activities = [];

		Promise.all(folderResourcePromises)
			.then(function (results) {
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						console.error('ERROR: invalid ' + resourceType + ' ' + resourceName);
						return Promise.reject();
					}
					fileRootParentId = resourceGUID;
				}
				console.log(' - file root parent ' + fileRootParentId);

				return serverRest.findFolderHierarchy({
					server: server,
					parentID: fileRootParentId,
					folderPath: filePath
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: file ' + filePath + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify source file ' + filePath);

				file = result;

				return _getFileVersions(server, file.id);

			})
			.then(function (result) {
				versions = result || [];
				// console.log(versions);

				// get file activities
				var activityUrl = '/documents/integration?IdcService=GET_ACTIVITY_HISTORY&IsJson=1&item=fFileGUID:' + file.id;
				activityUrl = activityUrl + '&activityTypes=download&activityCount=1000';

				return serverRest.executeGet({
					server: server,
					endpoint: activityUrl,
					noMsg: true
				});

			})
			.then(function (result) {

				var data;
				try {
					data = JSON.parse(result);
				} catch (e) {
					data = result;
				}
				if (data && !data.err) {
					activities = serverUtils.getIDCServiceResults(data.ResultSets, 'ActivityHistory');
				}
				// console.log(activities);

				var format1 = '%-38s  %-s';
				var format3 = '  %-7s  %-10s  %-22s  %-s';

				var typeLabel = file.mimeType || '';
				if (typeLabel && typeLabel.indexOf('/') > 0) {
					typeLabel = typeLabel.substring(typeLabel.lastIndexOf('/') + 1);
				}
				console.log('');
				console.log(sprintf(format1, 'Id', file.id));
				console.log(sprintf(format1, 'Name', file.name));
				console.log(sprintf(format1, 'Description', file.description || ''));
				console.log(sprintf(format1, 'Size', file.size));
				console.log(sprintf(format1, 'Version', 'v' + file.version));
				console.log(sprintf(format1, 'Type', typeLabel));
				console.log(sprintf(format1, 'Owner', file.ownedBy ? (file.ownedBy.displayName || file.ownedBy.loginName) : ''));
				console.log(sprintf(format1, 'Created', file.createdTime + ' by ' + file.createdBy.displayName));
				console.log(sprintf(format1, 'Updated', file.modifiedTime + ' by ' + file.modifiedBy.displayName));

				if (activities.length > 0) {
					console.log(sprintf(format1, 'Access History (' + activities.length + ')', ''));
					console.log(sprintf(format3, 'Version', 'Action', 'Date', 'User'));
					activities.forEach(function (act) {
						console.log(sprintf(format3, 'v' + act.dRevLabel, act.dActivityType, act.dActivityTs, act.dNameFullName || act.dNameLoginName));
					});
				} else {
					console.log(sprintf(format1, 'Access History', ''));
				}

				var format2 = '  %-32s  %-10s  %-10s  %-s';
				if (versions.length > 0) {
					console.log(sprintf(format1, 'Versions (' + versions.length + ')', ''));
					console.log(sprintf(format2, 'Name', 'Version', 'Size', 'Date'));
					versions.forEach(function (ver) {
						var verLabel = file.createdTime === ver.fLastModifiedDate ? 'Created' : 'Updated';
						verLabel = verLabel + ' ' + ver.fLastModifiedDate + ' by ' + ver.fCreatorFullName;
						console.log(sprintf(format2, ver.fFileName, 'v' + ver.dRevLabel, ver.dFileSize, verLabel));
					});
				} else {
					console.log(sprintf(format1, 'Versions', ''));
				}

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

var _browseTrash = function (server, type) {
	return new Promise(function (resolve, reject) {
		var url = '/documents/integration?IdcService=FLD_BROWSE_TRASH&IsJson=1&fileCount=-1'
		if (type === 'documents') {
			url = url + 'filesFilterParams=fApplication&foldersFilterParams=fApplication&fApplication-=framework.site,framework.site.theme,framework.site.template,framework.site.app,framework.caas';
		} else if (type === 'sites') {
			url = url + 'filesFilterParams=fApplication&fApplication-=framework&foldersFilterParams=fApplication&fApplication=framework.site,framework.site.variant';
		} else if (type === 'components') {
			url = url + 'filesFilterParams=fApplication&fApplication-=framework&foldersFilterParams=fApplication&fApplication=framework.site.app';
		} else if (type === 'templates') {
			url = url + 'filesFilterParams=fApplication&fApplication-=framework&foldersFilterParams=fApplication&fApplication=framework.site.template';
		} else if (type === 'themes') {
			url = url + 'filesFilterParams=fApplication&fApplication-=framework&foldersFilterParams=fApplication&fApplication=framework.site.theme';
		}
		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (result) {
			var data;
			try {
				data = JSON.parse(result);
			} catch (e) {
				data = result;
			}
			return resolve(data);
		});
	});
};

module.exports.listTrash = function (argv, done) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		_browseTrash(server)
			.then(function (result) {
				if (!result || result.err || !result.LocalData) {
					return Promise.reject();
				}
				var childFiles = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFiles');
				var childFolders = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFolders');

				var fileFormat = '  %-44s  %-36s  %-7s  %-10s  %-8s  %-20s  %-s';
				console.log('Files:');
				if (childFiles.length > 0) {
					console.log(sprintf(fileFormat, 'Id', 'Name', 'Version', 'Size', 'Type', 'Date Deleted', 'Deleted By'));
					childFiles.forEach(function (file) {
						let name = file.fFileName;
						let version = file.dRevLabel;
						let deletedOn = file.fLastModifiedDate;
						let deletedBy = file.fLastModifierFullName;
						let size = file.dFileSize || '';
						let type = file.dExtension || '';
						let id = file.fFileGUID;
						console.log(sprintf(fileFormat, id, name, version, size, type, deletedOn, deletedBy));
					});
				}

				var folders = [];
				var sites = [];
				var components = [];
				var templates = [];
				var themes = [];
				var format = '  %-44s  %-67s  %-20s  %-s';
				var _display = function (objs) {
					console.log(sprintf(format, 'Id', 'Name', 'Date Deleted', 'Deleted By'));
					objs.forEach(function (obj) {
						let name = obj.name;
						let deletedOn = obj.deletedOn;
						let deletedBy = obj.deletedBy;
						let id = obj.id;
						console.log(sprintf(format, id, name, deletedOn, deletedBy));
					});
				};
				// console.log(childFolders);
				if (childFolders.length > 0) {
					childFolders.forEach(function (folder) {
						let obj = {
							id: folder.fFolderGUID,
							itemGUID: folder.fRealItemGUID,
							name: folder.fFolderName,
							deletedOn: folder.fLastModifiedDate,
							deletedBy: folder.fLastModifierFullName
						};
						if (folder.fApplication === 'framework') {
							folders.push(obj);
						} else if (folder.fApplication === 'framework.site.app') {
							components.push(obj);
						} else if (folder.fApplication === 'framework.site.template') {
							templates.push(obj);
						} else if (folder.fApplication === 'framework.site.theme') {
							themes.push(obj);
						} else if (folder.fApplication === 'framework.site' || folder.fApplication === 'framework.site.variant') {
							sites.push(obj);
						}
					});
				}
				console.log('');
				console.log('Folders:');
				if (folders.length > 0) {
					_display(folders);
				}
				console.log('');
				console.log('Sites:');
				if (sites.length > 0) {
					_display(sites);
				}
				console.log('');
				console.log('Components:');
				if (components.length > 0) {
					_display(components);
				}
				console.log('');
				console.log('Templates:');
				if (templates.length > 0) {
					_display(templates);
				}
				console.log('');
				console.log('Themes:');
				if (themes.length > 0) {
					_display(themes);
				}
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

/**
 * Delete from trash
 */
module.exports.deleteTrash = function (argv, done) {
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

	var name = argv.name.toString();
	var id = argv.id;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var toDelete;

		_browseTrash(server)
			.then(function (result) {
				if (!result || result.err || !result.LocalData) {
					return Promise.reject();
				}
				var idcToken = result.LocalData.idcToken;
				var childFiles = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFiles');
				var childFolders = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFolders');

				var nameMatched = [];
				var idMatched;

				if (childFiles.length > 0) {
					childFiles.forEach(function (file) {
						if (name === file.fFileName) {
							nameMatched.push({
								name: name,
								id: file.fFileGUID,
								type: 'file',
								deletedOn: file.fLastModifiedDate,
								deletedBy: file.fLastModifierFullName
							});
						}
						if (id && id === file.fFileGUID) {
							idMatched = {
								name: file.fFileName,
								id: file.fFileGUID,
								type: 'file',
								deletedOn: file.fLastModifiedDate,
								deletedBy: file.fLastModifierFullName
							}
						}
					});
				}
				if (childFolders.length > 0) {
					childFolders.forEach(function (folder) {
						let type;
						if (folder.fApplication === 'framework' || folder.fFolderType === 'soft') {
							type = 'folder';
						} else if (folder.fApplication === 'framework.site.app') {
							type = 'component';
						} else if (folder.fApplication === 'framework.site.template') {
							type = 'template';
						} else if (folder.fApplication === 'framework.site.theme') {
							type = 'theme';
						} else if (folder.fApplication === 'framework.site') {
							type = 'site';
						} else if (folder.fApplication === 'framework.site.variant') {
							type = 'site.variant';
						}
						if (name === folder.fFolderName) {
							nameMatched.push({
								id: folder.fFolderGUID,
								itemId: folder.fRealItemGUID,
								name: name,
								type: type,
								deletedOn: folder.fLastModifiedDate,
								deletedBy: folder.fLastModifierFullName
							});
						}
						if (id && id === folder.fFolderGUID) {
							idMatched = {
								id: folder.fFolderGUID,
								itemId: folder.fRealItemGUID,
								name: folder.fFolderName,
								type: type,
								deletedOn: folder.fLastModifiedDate,
								deletedBy: folder.fLastModifierFullName
							}
						}
					});
				}

				if (!idMatched && nameMatched.length === 0) {
					console.error('ERROR: resource ' + name + ' not found in Trash');
					return Promise.reject();
				}

				if (idMatched && idMatched.name !== name) {
					console.error('ERROR: the name of the resource with Id ' + id + ' is ' + idMatched.name + ' not ' + name);
					return Promise.reject();
				}

				if (id && !idMatched) {
					console.error('ERROR: resource with Id ' + id + ' not found in Trash');
					return Promise.reject();
				}

				if (!idMatched && nameMatched.length > 1) {
					console.error('ERROR: there are ' + nameMatched.length + ' resources with name ' + name + ':');
					var format = '  %-44s  %-10s  %-60s  %-20s  %-s';
					console.log(sprintf(format, 'Id', 'Type', 'Name', 'Date Deleted', 'Deleted By'));
					nameMatched.forEach(function (obj) {
						console.log(sprintf(format, obj.id, (obj.type === 'site.variant' ? 'siteUpdate' : obj.type), obj.name, obj.deletedOn, obj.deletedBy));

					});
					console.log('Please try again with the Id');
					return Promise.reject();
				}

				toDelete = idMatched || nameMatched[0];
				toDelete.typeLabel = toDelete.type === 'site.variant' ? 'siteUpdate' : toDelete.type;
				// console.log(toDelete);
				return _deleteFromTrash(server, idcToken, [toDelete], true);

			})
			.then(function (result) {
				var deleteItems = result || [];
				var found = false;
				for (let i = 0; i < deleteItems.length; i++) {
					if (deleteItems[i].name === toDelete.name) {
						found = true;
						break;
					}
				}
				if (!found) {
					console.error('ERROR: failed to delete ' + toDelete.typeLabel + ' ' + toDelete.name);
					return Promise.reject();
				} else {
					console.log(' - ' + toDelete.typeLabel + ' ' + toDelete.name + ' deleted from Trash');
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


var _restoreDocumentFromTrash = function (server, idcToken, id, name, type) {
	return new Promise(function (resolve, reject) {
		var service = type === 'file' || type === 'folder' ? 'FLD_RESTORE' : 'SCS_RESTORE_FROM_TRASH';
		var url = '/documents/integration?IdcService=' + service + '&IsJson=1';
		var formData = {
			'LocalData': {
				'IdcService': service,
				'items': (type === 'file' ? 'fFileGUID:' : 'fFolderGUID:') + id
			}
		};

		serverRest.executePost({
			server: server,
			endpoint: url,
			body: formData,
			noMsg: true
		}).then(function (data) {
			// console.log(JSON.stringify(data, null, 4));
			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.error('ERROR: failed to restore from trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					id: id,
					name: name,
					type: type,
					err: (data && data.LocalData && data.LocalData.StatusMessage || 'failed to restore from Trash')
				});
			} else {
				return resolve({
					id: id,
					name: name,
					type: type,
					err: ''
				});
			}
		});
	});
};
/**
 * restore from trash
 */
module.exports.restoreTrash = function (argv, done) {
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

	var name = argv.name.toString();
	var id = argv.id;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var toRestore;

		_browseTrash(server)
			.then(function (result) {
				if (!result || result.err || !result.LocalData) {
					return Promise.reject();
				}
				var idcToken = result.LocalData.idcToken;
				var childFiles = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFiles');
				var childFolders = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFolders');

				var nameMatched = [];
				var idMatched;

				if (childFiles.length > 0) {
					childFiles.forEach(function (file) {
						if (name === file.fFileName) {
							nameMatched.push({
								name: name,
								id: file.fFileGUID,
								type: 'file',
								deletedOn: file.fLastModifiedDate,
								deletedBy: file.fLastModifierFullName
							});
						}
						if (id && id === file.fFileGUID) {
							idMatched = {
								name: file.fFileName,
								id: file.fFileGUID,
								type: 'file',
								deletedOn: file.fLastModifiedDate,
								deletedBy: file.fLastModifierFullName
							}
						}
					});
				}
				if (childFolders.length > 0) {
					childFolders.forEach(function (folder) {
						let type;
						if (folder.fApplication === 'framework' || folder.fFolderType === 'soft') {
							type = 'folder';
						} else if (folder.fApplication === 'framework.site.app') {
							type = 'component';
						} else if (folder.fApplication === 'framework.site.template') {
							type = 'template';
						} else if (folder.fApplication === 'framework.site.theme') {
							type = 'theme';
						} else if (folder.fApplication === 'framework.site') {
							type = 'site';
						} else if (folder.fApplication === 'framework.site.variant') {
							type = 'site.variant';
						}
						if (name === folder.fFolderName) {
							nameMatched.push({
								id: folder.fFolderGUID,
								itemId: folder.fRealItemGUID,
								name: name,
								type: type,
								deletedOn: folder.fLastModifiedDate,
								deletedBy: folder.fLastModifierFullName
							});
						}
						if (id && id === folder.fFolderGUID) {
							idMatched = {
								id: folder.fFolderGUID,
								itemId: folder.fRealItemGUID,
								name: folder.fFolderName,
								type: type,
								deletedOn: folder.fLastModifiedDate,
								deletedBy: folder.fLastModifierFullName
							}
						}
					});
				}

				if (!idMatched && nameMatched.length === 0) {
					console.error('ERROR: resource ' + name + ' not found in Trash');
					return Promise.reject();
				}

				if (idMatched && idMatched.name !== name) {
					console.error('ERROR: the name of the resource with Id ' + id + ' is ' + idMatched.name + ' not ' + name);
					return Promise.reject();
				}

				if (id && !idMatched) {
					console.error('ERROR: resource with Id ' + id + ' not found in Trash');
					return Promise.reject();
				}

				if (!idMatched && nameMatched.length > 1) {
					console.error('ERROR: there are ' + nameMatched.length + ' resources with name ' + name + ':');
					var format = '  %-44s  %-10s  %-60s  %-20s  %-s';
					console.log(sprintf(format, 'Id', 'Type', 'Name', 'Date Deleted', 'Deleted By'));
					nameMatched.forEach(function (obj) {
						console.log(sprintf(format, obj.id, (obj.type === 'site.variant' ? 'siteUpdate' : obj.type), obj.name, obj.deletedOn, obj.deletedBy));

					});
					// console.log('Please try again with the Id');
					return Promise.reject();
				}

				toRestore = idMatched || nameMatched[0];
				toRestore.typeLabel = toRestore.type === 'site.variant' ? 'siteUpdate' : toRestore.type;
				// console.log(toRestore);

				var restorePromise;

				if (toRestore.type === 'file' || toRestore.type === 'folder' || toRestore.type === 'site.variant') {
					restorePromise = _restoreDocumentFromTrash(server, idcToken, toRestore.id, toRestore.name, toRestore.type);
				} else if (toRestore.type === 'site') {
					restorePromise = sitesRest.restoreSite({
						server: server,
						id: toRestore.itemId,
						name: toRestore.name,
						showInfo: false,
						showError: false,
					});
				} else if (toRestore.type === 'component') {
					restorePromise = sitesRest.restoreComponent({
						server: server,
						id: toRestore.itemId,
						name: toRestore.name,
						showInfo: false,
						showError: false,
					});
				} else if (toRestore.type === 'template') {
					restorePromise = sitesRest.restoreTemplate({
						server: server,
						id: toRestore.itemId,
						name: toRestore.name,
						showInfo: false,
						showError: false,
					});
				} else if (toRestore.type === 'theme') {
					restorePromise = sitesRest.restoreTheme({
						server: server,
						id: toRestore.itemId,
						name: toRestore.name,
						showInfo: false,
						showError: false,
					});
				}

				return restorePromise;
			})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: failed to restore ' + toRestore.typeLabel + ' ' + toRestore.name + ' from Trash');
					return Promise.reject();
				} else {
					console.log(' - ' + toRestore.typeLabel + ' ' + toRestore.name + ' restored from Trash');
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

var _emptyTrash = function (server, idcToken) {
	return new Promise(function (resolve, reject) {
		var url = '/documents/integration?IdcService=FLD_EMPTY_TRASH&IsJson=1';
		var formData = {
			'LocalData': {
				'IdcService': 'FLD_EMPTY_TRASH',
				'useBackgroundThread': 1
			}
		};
		serverRest.executePost({
			server: server,
			endpoint: url,
			body: formData,
			noMsg: true
		}).then(function (result) {
			var data;
			try {
				data = JSON.parse(result);
			} catch (e) {
				data = result;
			}

			var jobId = data && data.LocalData && data.LocalData.JobID;
			if (!jobId) {
				if (data && data.LocalData && data.LocalData.StatusCode === '0') {
					// trash is empty
					console.info(' - Trash is empty');
					return resolve({});
				} else {
					var errorMsg = data && data.LocalData ? data.LocalData.StatusMessage : '';
					console.error('ERROR: failed to empty Trash ' + errorMsg);
					return resolve({ err: 'err' });
				}
			} else {
				// wait job finishes
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					serverUtils.getBackgroundServiceJobStatus(server, idcToken, jobId).then(function (data) {
						// console.log(data);
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							// try to get error message
							serverUtils.getBackgroundServiceJobData(server, idcToken, jobId)
								.then(function (data) {
									console.error('ERROR: empty Trash failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
									// console.log(data);
									return resolve({
										err: 'err'
									});
								});
						} else if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							serverUtils.getBackgroundServiceJobData(server, idcToken, jobId)
								.then(function (data) {
									return resolve(data);
								});
						} else {
							process.stdout.write(' - empty Trash in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
					});
				}, 5000);
			}
		});
	});
};

var _deleteDocumentFromTrash = function (server, idcToken, id, name, type) {
	return new Promise(function (resolve, reject) {
		var url = '/documents/integration?IdcService=FLD_DELETE_FROM_TRASH&IsJson=1';
		var formData = {
			'LocalData': {
				'IdcService': 'FLD_DELETE_FROM_TRASH',
				'item': (type === 'file' ? 'fFileGUID:' : 'fFolderGUID:') + id
			}
		};

		serverRest.executePost({
			server: server,
			endpoint: url,
			body: formData,
			noMsg: true
		}).then(function (data) {
			// console.log(JSON.stringify(data, null, 4));
			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.error('ERROR: failed to delete from trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					id: id,
					name: name,
					type: type,
					err: (data && data.LocalData && data.LocalData.StatusMessage || 'failed to delete from Trash')
				});
			} else {
				return resolve({
					id: id,
					name: name,
					type: type,
					err: ''
				});
			}
		});
	});
};

var _deleteFromTrash = function (server, idcToken, items, noMsg) {
	return new Promise(function (resolve, reject) {
		// console.log(items);
		var total = items.length;
		// console.log(' - total number of files to create: ' + total);
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
		var needNewLine = false;
		var deletedItems = [];
		var doDelete = groups.reduce(function (deletePromise, param) {
			return deletePromise.then(function (result) {
				var deletePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					if (items[i].type === 'file' || items[i].type === 'folder' || items[i].type === 'site.variant') {
						deletePromises.push(_deleteDocumentFromTrash(server, idcToken, items[i].id, items[i].name, items[i].type));
					} else if (items[i].type === 'site') {
						deletePromises.push(sitesRest.deleteSite({
							server: server,
							id: items[i].itemId,
							name: items[i].name,
							hard: true,
							showInfo: false,
							showError: false,
						}));
					} else if (items[i].type === 'component') {
						deletePromises.push(sitesRest.deleteComponent({
							server: server,
							id: items[i].itemId,
							name: items[i].name,
							hard: true,
							showInfo: false,
							showError: false,
						}));
					} else if (items[i].type === 'template') {
						deletePromises.push(sitesRest.deleteTemplate({
							server: server,
							id: items[i].itemId,
							name: items[i].name,
							hard: true,
							showInfo: false,
							showError: false,
						}));
					} else if (items[i].type === 'theme') {
						deletePromises.push(sitesRest.deleteTheme({
							server: server,
							id: items[i].itemId,
							name: items[i].name,
							hard: true,
							showInfo: false,
							showError: false,
						}));
					}
				}

				if (console.showInfo() && (noMsg === undefined && !noMsg)) {
					process.stdout.write(' - deleting from Trash [' + param.start + ', ' + param.end + '] ...');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
				return Promise.all(deletePromises).then(function (results) {
					deletedItems = deletedItems.concat(results);
				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doDelete.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve(deletedItems);
		});
	});
};

var _emptyTrashForType = function (server, idcToken, type) {
	return new Promise(function (resolve, reject) {
		_browseTrash(server, type).then(function (result) {
			var childFiles = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFiles');
			var childFolders = serverUtils.getIDCServiceResults(result.ResultSets, 'ChildFolders');
			var toDelete = [];
			if (type === 'documents') {
				if (childFiles.length > 0) {
					childFiles.forEach(function (file) {
						toDelete.push({
							type: 'file',
							id: file.fFileGUID,
							name: file.fFileName
						});
					});
				}
				if (childFolders.length > 0) {
					childFolders.forEach(function (folder) {
						if (folder.fApplication === 'framework') {
							toDelete.push({
								type: 'folder',
								id: folder.fFolderGUID,
								name: folder.fFolderName
							});
						}
					});
				}
			} else {
				if (childFolders.length > 0) {
					childFolders.forEach(function (folder) {
						if (folder.fFolderType === 'soft') {
							// folders of the resource
							toDelete.push({
								type: 'folder',
								id: folder.fFolderGUID,
								name: folder.fFolderName
							});
						} else {
							if (type === 'components' && folder.fApplication === 'framework.site.app') {
								toDelete.push({
									type: 'component',
									id: folder.fFolderGUID,
									itemId: folder.fRealItemGUID,
									name: folder.fFolderName
								});
							} else if (type === 'templates' && folder.fApplication === 'framework.site.template') {
								toDelete.push({
									type: 'template',
									id: folder.fFolderGUID,
									itemId: folder.fRealItemGUID,
									name: folder.fFolderName
								});
							} else if (type === 'themes' && folder.fApplication === 'framework.site.theme') {
								toDelete.push({
									type: 'theme',
									id: folder.fFolderGUID,
									itemId: folder.fRealItemGUID,
									name: folder.fFolderName
								});
							} else if (type === 'sites' && (folder.fApplication === 'framework.site' || folder.fApplication === 'framework.site.variant')) {
								toDelete.push({
									type: serverUtils.replaceAll(folder.fApplication, 'framework.'),
									id: folder.fFolderGUID,
									itemId: folder.fRealItemGUID,
									name: folder.fFolderName
								});
							}
						}
					});
				}
			}

			if (toDelete.length === 0) {
				console.log(' - no ' + (type === 'documents' ? 'file/folder' : type.substring(0, type.length - 1)) + ' in the Trash');
				return resolve([]);
			} else {
				_deleteFromTrash(server, idcToken, toDelete).then(function (result) {
					return resolve(result);
				});
			}
		});
	});
};

module.exports.emptyTrash = function (argv, done) {
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

	var type = argv.type;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		serverUtils.getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					return Promise.reject();
				}
				var emptyPromise = type === 'all' ? _emptyTrash(server, idcToken) : _emptyTrashForType(server, idcToken, type);

				return emptyPromise;
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				var format = '   %-60s  %-10s  %-s';
				if (type === 'all') {
					// console.log(JSON.stringify(result, null, 4));
					var status = serverUtils.getIDCServiceResults(result.ResultSets, 'ActionStatus');
					if (status && status.length > 0) {
						console.log(' - Trash emptied');
						console.info(sprintf(format, 'Name', 'Deleted', 'Message'));
						status.forEach(function (item) {
							let deleted = item.isSuccessful === '1' ? '   √' : '';
							console.info(sprintf(format, item.fDisplayName, deleted, item.statusMessage));
						});
						console.info('');
					}
				} else {
					var deleteItems = result || [];
					if (deleteItems.length > 0) {
						console.log(' - ' + type + ' Trash emptied');
						console.info(sprintf(format, 'Name', 'Deleted', 'Message'));
						deleteItems.forEach(function (item) {
							let deleted = item.err ? '' : '   √';
							console.info(sprintf(format, item.name, deleted, item.err || ''));
						});
						console.info('');
					}
				}

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
	findFolder: _findFolder,
	uploadFolder: _uploadFolder,
	downloadFolder: _downloadFolder,
	deleteFolder: _deleteFolder,
	downloadFile: _downloadFile,
	getFile: _getFileContent,
	uploadFile: _uploadFile,
	deleteFile: _deleteFile
};