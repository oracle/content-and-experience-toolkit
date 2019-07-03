/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	request = require('request'),
	Client = require('node-rest-client').Client,
	dir = require('node-dir'),
	fs = require('fs'),
	fse = require('fs-extra'),
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
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var folderPath = name.split('/');

	_createFolder(serverName, folderPath, true).then(function (result) {
			done();
		})
		.catch((error) => {
			done();
		});
};

var _createFolder = function (serverName, folderPath, showMessage) {
	return new Promise(function (resolve, reject) {
		var folderPromises = [],
			parentGUID;
		folderPath.forEach(function (foldername) {
			if (foldername) {
				folderPromises.push(function (parentID) {
					return serverRest.findOrCreateFolder({
						currPath: projectDir,
						registeredServerName: serverName,
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
					if (folderDetails) {
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
				id: 'self'
			}));

		doFindFolder.then(function (newFolder) {
			if (newFolder) {
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
	console.log(' - server: ' + server.url);

	var filePath = argv.file;
	if (!path.isAbsolute(filePath)) {
		filePath = path.join(projectDir, filePath);
	}
	filePath = path.resolve(filePath);
	var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

	if (!fs.existsSync(filePath)) {
		console.log('ERROR: file ' + filePath + ' does not exist');
		done();
		return;
	}
	if (fs.statSync(filePath).isDirectory()) {
		console.log('ERROR: ' + filePath + ' is not a file');
		done();
		return;
	}

	var folderPath = argv.folder ? argv.folder.split('/') : [];

	_findFolder(serverName, folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.log('ERROR: invalid folder ' + argv.folder);
				return Promise.reject();
			}

			return serverRest.createFile({
				currPath: projectDir,
				registeredServerName: serverName,
				parentID: result.id,
				filename: fileName,
				contents: fs.readFileSync(filePath)
			});
		})
		.then(function (result) {
			if (result) {
				console.log(' - file ' + fileName + ' uploaded to ' +
					(argv.folder ? ('folder ' + argv.folder) : 'Home folder') +
					' (Id: ' + result.id + ' version:' + result.version + ')');
			}
			done();
		})
		.catch((error) => {
			done();
		});
};

var _findFolder = function (serverName, folderPath) {
	return new Promise(function (resolve, reject) {
		var folderPromises = [],
			parentGUID;
		folderPath.forEach(function (foldername) {
			if (foldername) {
				folderPromises.push(function (parentID) {
					return serverRest.findFile({
						currPath: projectDir,
						registeredServerName: serverName,
						parentID: parentID,
						filename: foldername,
						itemtype: 'folder'
					});
				});
			}
		});

		// get the folders in sequence
		var doFindFolder = folderPromises.reduce(function (previousPromise, nextPromise) {
				return previousPromise.then(function (folderDetails) {
					// store the parent
					if (folderDetails) {
						if (folderDetails.id !== 'self') {
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
				id: 'self'
			}));

		doFindFolder.then(function (parentFolder) {
			if (parentFolder) {
				if (parentFolder.id !== 'self') {
					console.log(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
				}
			}
			resolve(parentFolder);
		})
	});
};


module.exports.downloadFile = function (argv, done) {
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
	console.log(' - server: ' + server.url);

	var filePath = argv.file;
	var fileName = filePath;
	if (fileName.indexOf('/') > 0) {
		fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
	}

	var folderPathStr = filePath.indexOf('/') >= 0 ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
	var folderPath = folderPathStr.split('/');
	var folderId;

	if (!fs.existsSync(documentsSrcDir)) {
		fse.mkdirSync(documentsSrcDir);
	}
	var targetPath;
	if (argv.folder) {
		targetPath = argv.folder;
		if (!path.isAbsolute(targetPath)) {
			targetPath = path.join(projectDir, targetPath);
		}
		targetPath = path.resolve(targetPath);
		if (!fs.existsSync(targetPath)) {
			console.log('ERROR: file ' + targetPath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(targetPath).isDirectory()) {
			console.log('ERROR: ' + targetPath + ' is not a folder');
			done();
			return;
		}
	}

	_findFolder(serverName, folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.log('ERROR: invalid folder ' + folderPathStr);
				return Promise.reject();
			}
			folderId = result.id;

			return serverRest.findFile({
				currPath: projectDir,
				registeredServerName: serverName,
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
			return _readFile(server, result.id, fileName, folderPath);
		})
		.then(function (result) {
			if (!result || !result.data) {
				console.log('ERROR: failed to get file from server');
				return Promise.reject();
			}

			if (!argv.folder) {
				targetPath = documentsSrcDir;
				for (var i = 0; i < folderPath.length; i++) {
					targetPath = path.join(targetPath, folderPath[i]);
					if (!fs.existsSync(targetPath)) {
						fse.mkdirSync(targetPath);
					}
				}
			}

			var targetFile = path.join(targetPath, fileName);
			var fileContent = result.data;
			fs.writeFileSync(targetFile, fileContent);

			console.log(' - save file ' + targetFile);

			done();
		})
		.catch((error) => {
			done();
		});
};


module.exports.shareFolder = function (argv, done) {
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
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var folderPath = name.split('/');
	var folderId;

	var userNames = argv.users.split(',');
	var role = argv.role;

	var users = [];

	_findFolder(serverName, folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.log('ERROR: invalid folder ' + argv.folder);
				return Promise.reject();
			}
			folderId = result.id;

			var usersPromises = [];
			for (var i = 0; i < userNames.length; i++) {
				usersPromises.push(serverRest.getUser({
					currPath: projectDir,
					registeredServerName: serverName,
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

			return _getFolderMembers(server, folderId);
		})
		.then(function (result) {
			var existingMembers = result.items || [];

			var sharePromises = [];
			for (var i = 0; i < users.length; i++) {
				var newMember = true;
				for (var j = 0; j < existingMembers.length; j++) {
					if (existingMembers[j].user.id === users[i].id) {
						newMember = false;
						break;
					}
				}
				// console.log(' - user: ' + users[i].loginName + ' new grant: ' + newMember);
				sharePromises.push(_shareFolder(server, folderId, users[i].id, role, newMember));
			}
			return Promise.all(sharePromises);
		})
		.then(function (results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].errorCode === '0') {
					console.log(' - user ' + results[i].user.loginName + ' granted "' +
						results[i].role + '" on folder ' + name);
				} else {
					console.log('ERROR: ' + results[i].title);
				}
			}
			done();
		})
		.catch((error) => {
			done();
		});
};

var _shareFolder = function (server, folderId, userId, role, createNew) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId,
			args = {
				headers: {
					"Content-Type": "application/json"
				},
				data: {
					'userID': userId,
					'role': role
				}
			};

		if (createNew) {
			client.post(url, args, function (data, response) {
				resolve(data);
			});
		} else {
			url = url + '/role';
			client.put(url, args, function (data, response) {
				resolve(data);
			});
		}
	});
};

var _getFolderMembers = function (server, folderId) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId + '/items';

		var req = client.get(url, function (data, response) {
			resolve(data);
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve();
		});
	});
}

module.exports.unshareFolder = function (argv, done) {
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
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var folderPath = name.split('/');
	var folderId;

	var userNames = argv.users.split(',');
	var users = [];

	_findFolder(serverName, folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.log('ERROR: invalid folder ' + argv.folder);
				return Promise.reject();
			}
			folderId = result.id;

			var usersPromises = [];
			for (var i = 0; i < userNames.length; i++) {
				usersPromises.push(serverRest.getUser({
					currPath: projectDir,
					registeredServerName: serverName,
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

			return _getFolderMembers(server, folderId);
		})
		.then(function (result) {
			var existingMembers = result.items || [];
			var revokePromises = [];
			for (var i = 0; i < users.length; i++) {
				var existingUser = false;
				for (var j = 0; j < existingMembers.length; j++) {
					if (users[i].id === existingMembers[j].user.id) {
						existingUser = true;
						break;
					}
				}

				if (existingUser) {
					revokePromises.push(_unshareFolder(server, folderId, users[i].id));
				} else {
					console.log(' - user ' + users[i].loginName + ' has no access to the folder');
				}
			}

			return Promise.all(revokePromises);
		})
		.then(function (results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].errorCode === '0') {
					console.log(' - user ' + results[i].user.loginName + '\'s access to the folder removed');
				} else {
					console.log('ERROR: ' + results[i].title);
				}
			}
			done();
		})
		.catch((error) => {
			done();
		});
};


var _unshareFolder = function (server, folderId, userId) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId + '/user',
			args = {
				headers: {
					"Content-Type": "application/json"
				},
				data: {
					'userID': userId
				}
			};

		client.delete(url, args, function (data, response) {
			resolve(data);
		});

	});
};

// Read file from server
var _readFile = function (server, fFileGUID, fileName, folderPath) {
	return new Promise(function (resolve, reject) {

		var auth = {
			user: server.username,
			password: server.password
		};

		url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';

		var options = {
			url: url,
			auth: auth,
			encoding: null
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get file');
				console.log(error);
				resolve();
			}
			if (response && response.statusCode === 200) {
				resolve({
					id: fFileGUID,
					name: fileName,
					folderPath: folderPath,
					data: body
				});
			} else {
				console.log('ERROR: failed to get file: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve();
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
	console.log(' - server: ' + server.url);

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

	var inputPath = argv.path === '/' ? '' : serverUtils.trimString(argv.path, '/');
	var folderPath = argv.path === '/' ? [] : inputPath.split('/');
	// console.log('argv.path=' + argv.path + ' inputPath=' + inputPath + ' folderPath=' + folderPath);

	var folderId;

	_files = [];

	_findFolder(serverName, folderPath).then(function (result) {
			if (folderPath.length > 0 && !result) {
				return Promise.reject();
			}

			if (result.id !== 'self' && (!result.type || result.type !== 'folder')) {
				console.log('ERROR: invalid folder ' + argv.folder);
				return Promise.reject();
			}
			folderId = result.id;

			return _downloadFolder(server, serverName, folderId, inputPath);
		})
		.then(function (result) {
			var filePromises = [];
			for (var i = 0; i < _files.length; i++) {
				filePromises.push(_readFile(server, _files[i].id, _files[i].name, _files[i].folderPath));
			}

			return Promise.all(filePromises);
		})
		.then(function (results) {

			if (!argv.folder) {
				targetPath = documentsSrcDir;
				for (var i = 0; i < folderPath.length; i++) {
					targetPath = path.join(targetPath, folderPath[i]);
					if (!fs.existsSync(targetPath)) {
						fse.mkdirSync(targetPath);
					}
				}
			}

			for (var i = 0; i < results.length; i++) {
				var file = results[i];
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
						fse.mkdirSync(targetFile);
					}
				}
				targetFile = path.join(targetFile, file.name);

				fs.writeFileSync(targetFile, file.data);
				console.log(' - save file ' + targetFile);
			}

			done();
		})
		.catch((error) => {
			done();
		});
};

var _downloadFolder = function (server, serverName, parentId, parentPath) {
	// console.log(' - folder: id=' + parentId + ' path=' + parentPath);
	return new Promise(function (resolve, reject) {
		serverRest.getChildItems({
				registeredServerName: serverName,
				currPath: projectDir,
				parentID: parentId
			})
			.then(function (result) {
				if (!result) {
					resolve();
				}

				var items = result && result.items || [];
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
						subfolderPromises.push(_downloadFolder(server, serverName, items[i].id, parentPath + '/' + items[i].name));
					}
				}
				return Promise.all(subfolderPromises);
			})
			.then(function (results) {
				resolve(results);
			});
	});
};

module.exports.uploadFolder = function (argv, done) {
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
	console.log(' - server: ' + server.url);

	var srcPath = argv.path;
	var contentOnly = serverUtils.endsWith(srcPath, '/');

	if (!path.isAbsolute(srcPath)) {
		srcPath = path.join(projectDir, srcPath);
	}
	srcPath = path.resolve(srcPath);

	if (!fs.existsSync(srcPath)) {
		console.log('ERROR: file ' + srcPath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(srcPath).isDirectory()) {
		console.log('ERROR: ' + srcPath + ' is not a folder');
		done();
		return;
	}

	var folderName = contentOnly ? '' : srcPath.substring(srcPath.lastIndexOf('/') + 1);
	// console.log(' - path=' + argv.path + ' srcPath=' + srcPath + ' contentOnly=' + contentOnly + ' folderName=' + folderName);

	var inputPath = argv.folder === '/' ? '' : serverUtils.trimString(argv.folder, '/');
	var folderPath = !argv.folder || argv.folder === '/' ? [] : inputPath.split('/');
	if (folderName) {
		folderPath.push(folderName);
	}
	// console.log(' - target folder: Documents > ' + folderPath.join(' > '));

	// get all files to upload
	var folderContent = [];
	dir.files(srcPath, function (err, files) {
		if (err) {
			console.log(err);
			done();
		} else {
			// group files under the same folder
			for (var i = 0; i < files.length; i++) {
				var src = files[i];
				src = src.substring(srcPath.length + 1);
				var fileFolder = src.indexOf('/') > 0 ? src.substring(0, src.lastIndexOf('/')) : '';

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
			// console.log(folderContent);
			_createFolderUploadFiles(serverName, folderPath, folderContent).then(function (result) {
				done();
			});
		}
	});
};

var _createFolderUploadFiles = function (serverName, folderPath, folderContent) {
	return new Promise(function (resolve, reject) {
		format = '   %-48s  %-7s  %-s';
		var doCreateFolders = folderContent.reduce(function (createPromise, param) {
				return createPromise.then(function (result) {
					var folders = folderPath;
					if (param.fileFolder) {
						folders = folders.concat(param.fileFolder.split('/'));
					}

					return _createFolder(serverName, folders, false).then(function (parentFolder) {

						var filePromises = [];
						for (var i = 0; i < param.files.length; i++) {
							var filePath = param.files[i];
							var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
							filePromises.push(serverRest.createFile({
								currPath: projectDir,
								registeredServerName: serverName,
								parentID: parentFolder.id,
								filename: fileName,
								contents: fs.readFileSync(filePath)
							}));
						}

						return Promise.all(filePromises).then(function (results) {
							var folderStr = folders.length > 0 ? folders.join('/') : 'Home folder';
							for (var i = 0; i < results.length; i++) {
								var file = results[i];
								if (file) {
									console.log(sprintf(format, file.name, file.version, folderStr));
								}
							}
						});
					});
				});
			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));
		console.log(' - folder uploaded:');
		console.log(sprintf(format, 'File', 'Version', 'Folder'));
		doCreateFolders.then(function (result) {
			resolve();
		});
	});
};