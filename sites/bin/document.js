/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	os = require('os'),
	readline = require('readline'),
	fs = require('fs'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

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
	console.log(' - server: ' + server.url);

	var request = serverUtils.getRequest();

	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
								console.log(' - find folder ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
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
						console.log(' - find folder ' + newFolder.name + ' (Id: ' + newFolder.id + ')');
					}
				}
			}
			resolve(newFolder);
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
	serverUtils.loginToServer(server, serverUtils.getRequest(), true).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
		console.log('ERROR: file ' + filePath + ' does not exist');
		return Promise.reject();
	}
	if (fs.statSync(filePath).isDirectory()) {
		console.log('ERROR: ' + filePath + ' is not a file');
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
	console.log(' - target folder: ' + (resourceFolder ? (resourceLabel + ' > ' + resourceName) : 'Documents') + ' > ' + folderPath.join(' > '));

	var request = serverUtils.getRequest();
	var loginPromises = [];

	if (resourceFolder) {
		loginPromises.push(serverUtils.loginToServer(server, request));
	}

	return Promise.all(loginPromises).then(function (results) {
		if (resourceFolder && (!results || results.length === 0 || !results[0].status)) {
			console.log(' - failed to connect to the server');
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
						console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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
					console.log('ERROR: invalid folder ' + argv.folder);
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
							console.log(' - find ' + folderDetails.type + ' ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
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
					console.log(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
				}
			}
			resolve(parentFolder);
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
	var request = serverUtils.getRequest();
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
				console.log('ERROR: folder ' + targetPath + ' does not exist');
				done();
				return;
			}
			if (!fs.statSync(targetPath).isDirectory()) {
				console.log('ERROR: ' + targetPath + ' is not a folder');
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

		Promise.all(resourcePromises).then(function (results) {
				var rootParentId = 'self';
				if (resourceFolder) {
					var resourceGUID;
					if (results.length > 0 && results[0]) {
						resourceGUID = results[0].id;
					}

					if (!resourceGUID) {
						console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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
					console.log('ERROR: invalid folder ' + folderPathStr);
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
				console.log(' - downloading file (id: ' + result.id + ' size: ' + result.size + ') ...');
				startTime = new Date();
				return _readFile(server, result.id, fileName, folderPath);
			})
			.then(function (result) {
				if (!result || !result.data) {
					console.log('ERROR: failed to get file from server');
					return Promise.reject();
				}

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

				var targetFile = path.join(targetPath, fileName);
				var fileContent = result.data;
				fs.writeFileSync(targetFile, fileContent);

				console.log(' - save file ' + targetFile + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				done(true);
			})
			.catch((error) => {
				done();
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
	console.log(' - server: ' + server.url);

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
					console.log('ERROR: invalid folder ' + argv.name);
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
						console.log('ERROR: ' + results[i].title);
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
	console.log(' - server: ' + server.url);

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
					console.log('ERROR: invalid folder ' + argv.name);
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
						console.log('ERROR: ' + results[i].title);
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

		var auth = serverUtils.getRequestAuth(server);

		url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';

		var options = {
			url: url,
			auth: auth,
			encoding: null
		};
		var request = serverUtils.getRequest();
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get file ' + fileName);
				console.log(error);
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
				console.log('ERROR: failed to get file ' + fileName + ' : ' + (response ? (response.statusMessage + ' ' + response.statusCode) : ''));
				resolve({});
			}

		});
	});
};

// All files to download from server
var _files = [];

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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_downloadFolder(argv, server, true, true).then(function () {
			done(true);
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
				console.log('ERROR: folder ' + targetPath + ' does not exist');
				return reject();
			}
			if (!fs.statSync(targetPath).isDirectory()) {
				console.log('ERROR: ' + targetPath + ' is not a folder');
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

		_files = [];

		var request = serverUtils.getRequest();
		var loginPromises = [];

		if (resourceFolder) {
			loginPromises.push(serverUtils.loginToServer(server, request));
		}

		Promise.all(loginPromises).then(function (results) {
			if (resourceFolder && (!results || results.length === 0 || !results[0].status)) {
				console.log(' - failed to connect to the server');
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
								console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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
						console.log('ERROR: invalid folder ' + argv.path);
						return Promise.reject();
					}
					folderId = result.id;

					return _downloadFolderWithId(server, folderId, inputPath, excludeFolder);
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
						console.log(' - try to download failed files again ...');
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

					return resolve(true);
				})
				.catch((error) => {
					return reject();
				});
		}); // login
	});
};

var _readAllFiles = function (server, files) {
	return new Promise(function (resolve, reject) {
		var total = files.length;
		console.log(' - total number of files: ' + total);
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

		var doReadFile = groups.reduce(function (filePromise, param) {
				return filePromise.then(function (result) {
					var filePromises = [];
					for (var i = param.start; i <= param.end; i++) {
						filePromises.push(_readFile(server, files[i].id, files[i].name, files[i].folderPath));
					}

					count.push('.');
					process.stdout.write(' - downloading files [' + param.start + ', ' + param.end + '] ...');
					readline.cursorTo(process.stdout, 0);
					return Promise.all(filePromises).then(function (results) {
						fileData = fileData.concat(results);
					});

				});
			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doReadFile.then(function (result) {
			process.stdout.write(os.EOL);
			// console.log(' - total number of downloaded files: ' + fileData.length);
			resolve(fileData);
		});

	});
};

var _downloadFolderWithId = function (server, parentId, parentPath, excludeFolder) {
	// console.log(' - folder: id=' + parentId + ' path=' + parentPath);
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
							subfolderPromises.push(_downloadFolderWithId(server, items[i].id, parentPath + '/' + items[i].name, excludeFolder));
						}
					}
					return Promise.all(subfolderPromises);

				})
				.then(function (results) {
					resolve(results);
				});
		} else {
			console.log(' - exclude ' + parentPath);
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

	serverUtils.loginToServer(server, serverUtils.getRequest(), true).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		_uploadFolder(argv, server).then(function () {
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _uploadFolder = function (argv, server) {
	return new Promise(function (resolve, reject) {
		var srcPath = argv.path;
		var contentOnly = serverUtils.endsWith(srcPath, path.sep);

		if (!path.isAbsolute(srcPath)) {
			srcPath = path.join(projectDir, srcPath);
		}
		srcPath = path.resolve(srcPath);

		if (!fs.existsSync(srcPath)) {
			console.log('ERROR: file ' + srcPath + ' does not exist');
			return reject();
		}
		if (!fs.statSync(srcPath).isDirectory()) {
			console.log('ERROR: ' + srcPath + ' is not a folder');
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
		console.log(' - target folder: ' + (resourceFolder ? (resourceLabel + ' > ' + resourceName) : 'Documents') + ' > ' + folderPath.join(' > '));

		var rootParentFolderLabel = resourceFolder ? resourceName : 'Home folder';

		var rootParentId = 'self';

		// get all files to upload
		var folderContent = [];
		serverUtils.paths(srcPath, function (err, paths) {
			if (err) {
				console.log(err);
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
				console.log(' - total files: ' + files.length);
				// group files under the same folder
				for (var i = 0; i < files.length; i++) {
					var src = files[i];
					if (src.indexOf('_scs_theme_root_') < 0 && src.indexOf('_scs_design_name_') < 0) {
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

				var request = serverUtils.getRequest();

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
								console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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
						if (failedFolderContent.length > 0) {
							console.log(' - try to upload failed files again ...');
							// console.log(failedFolderContent);
							_createFolderUploadFiles(server, rootParentId, folderPath, failedFolderContent, rootParentFolderLabel).then(function (result) {
								return resolve(true);
							});

						} else {
							// no failure
							return resolve(true);
						}
					})
					.catch((error) => {
						if (error) {
							console.log(error);
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
								console.log(sprintf(format, 'Folder', folderStr + (folderStr.endsWith('/') ? '' : '/') + parentFolder.name));
							} else {
								console.log(sprintf(format, 'Folder', folderStr));
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
		console.log(' - folder uploaded:');
		console.log(sprintf(format, 'Type', 'Path'));
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
								console.log(sprintf(format, 'File', folderStr + (folderStr.endsWith('/') ? '' : '/') + file.name + ' (Version: ' + file.version + ')'));
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
	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

var _deleteFolder = function (argv, server) {

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
		console.log('ERROR: no folder is specified');
		return Promise.reject();
	}

	var folderId;

	var request = serverUtils.getRequest();
	var loginPromises = [];

	if (resourceFolder || permanent) {
		loginPromises.push(serverUtils.loginToServer(server, request));
	}

	return Promise.all(loginPromises).then(function (results) {
		if ((resourceFolder || permanent) && (!results || results.length === 0 || !results[0].status)) {
			console.log(' - failed to connect to the server');
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
						console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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

				var deletePromise = permanent ? _deletePermanentSCS(request, server, folderId, false) : serverRest.deleteFolder({
					server: server,
					fFolderGUID: folderId
				});
				return deletePromise;
			})
			.then(function (result) {
				if (result && result.err) {
					return Promise.reject();
				}

				console.log(' - folder ' + argv.path + ' deleted');
				if (!permanent) {
					return Promise.resolve(true);
				} else {
					console.log(' - folder ' + argv.path + ' deleted permanently');
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
var _deletePermanentSCS = function (request, server, id, isFile) {
	return new Promise(function (resolve, reject) {
		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		var auth = serverUtils.getRequestAuth(server);

		var idInTrash;

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
				};

				options['auth'] = auth;
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
			var url;
			var action;
			var formData;
			if (req.url.indexOf('FLD_MOVE_TO_TRASH') > 0) {
				url = server.url + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';
				action = 'delete';
				formData = {
					'idcToken': idcToken,
					'items': (isFile ? 'fFileGUID:' : 'fFolderGUID:') + id
				};
			} else {
				url = server.url + '/documents/web?IdcService=FLD_DELETE_FROM_TRASH';
				action = 'delete from trash';
				formData = {
					'idcToken': idcToken,
					'items': (isFile ? 'fFileGUID:' : 'fFolderGUID:') + idInTrash
				};
			}

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
					console.log('ERROR: Failed to ' + action);
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

						url = localhost + '/documents/web?IdcService=FLD_MOVE_TO_TRASH';

						request.post(url, function (err, response, body) {
							if (err) {
								console.log('ERROR: Failed to delete');
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
								console.log('ERROR: failed to delete  ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
								_deleteDone(false, resolve);
							} else {
								// query the GUID in the trash folder
								url = localhost + '/documents/web?IdcService=FLD_BROWSE_TRASH&fileCount=-1';
								request.get(url, function (err, response, body) {
									var data = JSON.parse(body);
									if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
										console.log('ERROR: failed to browse trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
										_deleteDone(false, resolve);
									} else {
										var fields;
										var rows;
										if (isFile) {
											fields = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.fields || [];
											rows = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.rows;
										} else {
											fields = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.fields || [];
											rows = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
										}
										var items = [];
										for (var j = 0; j < rows.length; j++) {
											items.push({});
										}
										for (var i = 0; i < fields.length; i++) {
											var attr = fields[i].name;
											for (var j = 0; j < rows.length; j++) {
												items[j][attr] = rows[j][i];
											}
										}

										for (var i = 0; i < items.length; i++) {
											if (items[i]['fRealItemGUID'] === id) {
												idInTrash = isFile ? items[i]['fFileGUID'] : items[i]['fFolderGUID'];
												break;
											}
										}
										console.log(' - find ' + (isFile ? 'file' : 'folder ') + ' in trash ' + idInTrash);

										url = localhost + '/documents/web?IdcService=FLD_DELETE_FROM_TRASH';

										request.post(url, function (err, response, body) {
											if (err) {
												console.log('ERROR: Failed to delete from trash');
												console.log(err);
												_deleteDone(false, resolve);
											}

											var data;
											try {
												data = JSON.parse(body);
											} catch (e) {}

											if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
												console.log('ERROR: failed to delete from trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
												_deleteDone(false, resolve);
											} else {
												_deleteDone(true, resolve);
											}
										}); // delete from trash
									}
								}); // browse trash
							}
						}); // delete
					}
				}); // idc token request

			}, 6000);
		});
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

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_deleteFile(argv, server, true).then(function () {
			done(true);
		}).catch(function (error) {
			done();
		});
	});
};

var _deleteFile = function (argv, server, toReject) {

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

	var request = serverUtils.getRequest();
	var loginPromises = [];

	if (resourceFolder || permanent) {
		loginPromises.push(serverUtils.loginToServer(server, request));
	}

	return Promise.all(loginPromises).then(function (results) {
		if ((resourceFolder || permanent) && (!results || results.length === 0 || !results[0].status)) {
			console.log(' - failed to connect to the server');
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
						console.log('ERROR: invalid ' + resourceType + ' ' + resourceName);
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
					console.log('ERROR: invalid folder ' + folderPathStr);
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

				var deletePromise = permanent ? _deletePermanentSCS(request, server, fileId, true) : serverRest.deleteFile({
					server: server,
					fFileGUID: fileId
				});
				return deletePromise;
			})
			.then(function (result) {
				if (result && result.err) {
					return Promise.reject();
				}

				console.log(' - file ' + argv.file + ' deleted');
				if (!permanent) {
					return Promise.resolve(true);
				} else {
					console.log(' - file ' + argv.file + ' deleted permanently');
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
	uploadFile: _uploadFile,
	deleteFile: _deleteFile
};