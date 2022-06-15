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
							console.info(' - find folder ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
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
						console.info(' - find folder ' + newFolder.name + ' (Id: ' + newFolder.id + ')');
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
		var targetPath = argv.folder === '/' ? '' : serverUtils.trimString(argv.folder, '/');
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
					targetFolderId = srcFolder.parentID;
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
				// console.log(result);
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
			console.error(result.statusMessage);
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

			return _findFolder(server, rootParentId, folderPath);
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

var _findFolder = function (server, rootParentId, folderPath, showError) {
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
						console.info(' - find ' + folderDetails.type + ' ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
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
					console.info(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
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
				done();
				return;
			}
			if (!fs.statSync(targetPath).isDirectory()) {
				console.error('ERROR: ' + targetPath + ' is not a folder');
				done();
				return;
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

		var startTime;
		var targetFile;

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
		})
			.then(function (result) {
				if (!result || !result.id) {
					return Promise.reject();
				}

				// console.log('folderId: ' + folderId + ' fileName: ' + fileName + ' fileId: ' + result.id);
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
					for (var i = 0; i < folderPath.length; i++) {
						targetPath = path.join(targetPath, folderPath[i]);
						if (!fs.existsSync(targetPath)) {
							fs.mkdirSync(targetPath, {
								recursive: true
							});
						}
					}
				}

				targetFile = path.join(targetPath, fileName);
				console.info(' - downloading file (id: ' + result.id + ' size: ' + result.size + ') ...');
				startTime = new Date();
				return serverRest.downloadFileSave({
					server: server,
					fFileGUID: result.id,
					saveTo: targetFile
				});

			})
			.then(function (result) {
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
							return Promise.reject();
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
						id: folderId,
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
							return Promise.reject();
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
							id: folderId,
							userId: users[i].id
						}));
					} else {
						console.log(' - user ' + users[i].loginName + ' has no access to the folder');
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

		url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';

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
				console.error('ERROR: failed to get file ' + fileName);
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
				console.error('ERROR: failed to get file ' + fileName + ' : ' + (response ? (response.statusMessage + ' ' + response.statusCode) : ''));
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
				var format = '   %-6s  %-44s  %-s';
				console.log(sprintf(format, 'Type', 'Id', 'Path'));
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
					console.log(sprintf(format, item.type, item.id, itemPath));
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

var _downloadFolder = function (argv, server, showError, showDetail, excludeFolder) {
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
				console.error(result.statusMessage);
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
						showError: showError
					}));
				}
			}

			Promise.all(resourcePromises).then(function (results) {
				var rootParentId = 'self';
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

					return _downloadFolderWithId(server, folderId, inputPath, excludeFolder, _files);
				})
				.then(function (result) {
					// console.log(' _files: ' + _files.length);

					return _readAllFiles(server, _files);
				})
				.then(function (results) {
					// check if there is any failed file
					var failedFiles = [];
					_files.forEach(function (file) {
						var downloaded = false;
						for (var i = 0; i < results.length; i++) {
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
						for (var i = 0; i < folderPath.length; i++) {
							targetPath = path.join(targetPath, folderPath[i]);
							if (!fs.existsSync(targetPath)) {
								fs.mkdirSync(targetPath, {
									recursive: true
								});
							}
						}
					}

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
								var targetFile = path.join(targetFile, fileFolderPath[j]);
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
						readFilesRetryPromises.push(_readAllFiles(server, failedFiles));
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
								var targetFile = path.join(targetFile, fileFolderPath[j]);
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

var _readAllFiles = function (server, files) {
	return new Promise(function (resolve, reject) {
		var total = files.length;
		console.info(' - total number of files: ' + total);
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

					if (results && results.length > 0) {
						for (var i = 0; i < results.length; i++) {
							// console.log(' - ' + i + ' offset: ' + results[i].offset + ' count: ' + results[i].count);
							var items2 = results[i] && results[i].items;
							if (items2.length > 0) {
								items = items.concat(items2);
							}
						}
					}

					var subfolderPromises = [];
					for (var i = 0; i < items.length; i++) {
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
		console.info(' - target folder: ' + (resourceFolder ? (resourceLabel + ' > ' + resourceName) : 'Documents') + ' > ' + folderPath.join(' > '));

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
				for (var i = 0; i < subdirs.length; i++) {
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
				console.info(' - total files: ' + files.length);
				// group files under the same folder
				for (var i = 0; i < files.length; i++) {
					var src = files[i];
					var excluded = false;
					for (var j = 0; j < excludeFiles.length; j++) {
						if (src.indexOf(excludeFiles[j]) >= 0) {
							excluded = true;
							break;
						}
					}
					if (!excluded && src.indexOf('_scs_theme_root_') < 0 && src.indexOf('_scs_design_name_') < 0) {
						src = src.substring(srcPath.length + 1);
						var fileFolder = src.indexOf(path.sep) > 0 ? src.substring(0, src.lastIndexOf(path.sep)) : '';

						var found = false;
						for (var j = 0; j < folderContent.length; j++) {
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
							name: resourceName
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

					return _createFolderUploadFiles(server, rootParentId, folderPath, folderContent, rootParentFolderLabel);
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
							_createFolderUploadFiles(server, rootParentId, folderPath, failedFolderContent, rootParentFolderLabel).then(function (result) {
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

var _createFolderUploadFiles = function (server, rootParentId, folderPath, folderContent, rootParentFolderLabel) {
	return new Promise(function (resolve, reject) {
		format = '   %-8s  %-s';
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
							console.info(sprintf(format, 'Folder', folderStr + (folderStr.endsWith('/') ? '' : '/') + parentFolder.name));
						} else {
							console.info(sprintf(format, 'Folder', folderStr));
						}

						return _createAllFiles(server, rootParentFolderLabel, folders, parentFolder, param.files).then(function (files) {
							uploadedFiles = uploadedFiles.concat(files);
						});
					}
				});
			});
		},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));
		console.info(' - folder uploaded:');
		console.info(sprintf(format, 'Type', 'Path'));
		doCreateFolders.then(function (result) {
			resolve(uploadedFiles);
		});
	});
};

var _createAllFiles = function (server, rootParentFolderLabel, folders, parentFolder, files) {
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
							console.info(sprintf(format, 'File', folderStr + (folderStr.endsWith('/') ? '' : '/') + file.name + ' (Version: ' + file.version + ')'));
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
			console.error(result.statusMessage);
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
			console.error(result.statusMessage);
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

// export non "command line" utility functions
module.exports.utils = {
	findFolder: _findFolder,
	uploadFolder: _uploadFolder,
	downloadFolder: _downloadFolder,
	deleteFolder: _deleteFolder,
	downloadFile: _downloadFile,
	uploadFile: _uploadFile,
	deleteFile: _deleteFile
};