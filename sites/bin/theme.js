/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	path = require('path');


var projectDir,
	serversSrcDir;

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};


/**
 * control theme on server
 */
module.exports.controlTheme = function (argv, done) {
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

	var theme = argv.theme;
	var action = argv.action;

	try {
		_controlTheme(serverName, server, action, theme, done);
	} catch (e) {
		console.log(e);
	}
};

var _controlTheme = function (serverName, server, action, themeName, done) {

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_controlThemeREST(server, action, themeName, done);

	}); // login
};

/**
 * Publish a theme on server using REST APIs
 * 
 * @param {*} server 
 * @param {*} action 
 * @param {*} themeName 
 * @param {*} done 
 */
var _controlThemeREST = function (server, action, themeName, done) {

	sitesRest.getTheme({
			server: server,
			name: themeName
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			return sitesRest.publishTheme({
				server: server,
				name: themeName
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			console.log(' - publish theme ' + themeName + ' finished');
			done(true);
		})
		.catch((error) => {
			done();
		});
};

/**
 * share theme
 */
module.exports.shareTheme = function (argv, done) {
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

		var themeId;
		var users = [];
		var groups = [];

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var themePromise = sitesRest.getTheme({
				server: server,
				name: name
			});
			themePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					themeId = result.id;

					if (!themeId) {
						console.log('ERROR: theme ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify theme');

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
					if (!result || result.err) {
						return Promise.reject();
					}
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
						id: themeId
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
							id: themeId,
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
							id: themeId,
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
								results[i].role + '" on theme ' + name);
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
 * unshare theme
 */
module.exports.unshareTheme = function (argv, done) {
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

		var themeId;
		var users = [];
		var groups = [];

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var themePromise = sitesRest.getTheme({
				server: server,
				name: name
			});
			themePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					themeId = result.id;

					if (!themeId) {
						console.log('ERROR: theme ' + name + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify theme');

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
					if (!result || result.err) {
						return Promise.reject();
					}
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
						id: themeId
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
								id: themeId,
								userId: users[i].id
							}));
						} else {
							console.log(' - user ' + users[i].loginName + ' has no access to the theme');
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
								id: themeId,
								userId: groups[i].groupID
							}));
						} else {
							console.log(' - group ' + (groups[i].displayName || groups[i].name) + ' has no access to the theme');
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
							console.log(' - ' + typeLabel + ' ' + (results[i].user.loginName || results[i].user.displayName) + '\'s access to the theme removed');
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