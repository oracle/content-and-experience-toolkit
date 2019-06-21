/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
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
			folderPromises.push(function (parentID) {
				return serverRest.findOrCreateFolder({
					registeredServerName: serverName,
					parentID: parentID,
					foldername: foldername
				});
			});
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
					} else {
						return Promise.reject();
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