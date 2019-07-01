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
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path');

var projectDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

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

	_createFolder(serverName, folderPath).then(function (result) {
			done();
		})
		.catch((error) => {
			done();
		});
};

var _createFolder = function (serverName, folderPath) {
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
							console.log(' - create folder ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
						} else if (folderDetails.id !== 'self') {
							console.log(' - find folder ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
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
					console.log(' - create folder ' + newFolder.name + ' (Id: ' + newFolder.id + ')');
				} else if (newFolder.id !== 'self') {
					console.log(' - find folder ' + newFolder.name + ' (Id: ' + newFolder.id + ')');
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