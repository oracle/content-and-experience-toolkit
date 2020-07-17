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

var localServer;
var _cmdEnd = function (done, sucess) {
	done(sucess);
	if (localServer) {
		localServer.close();
	}
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

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		if (server.useRest) {
			_controlThemeREST(server, action, themeName, done);
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		var auth = serverUtils.getRequestAuth(server);

		var themeId;

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
				};

				options.auth = auth;

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
			var url = server.url + '/documents/web?IdcService=SCS_ACTIVATE_THEME';
			var formData = {
				'idcToken': idcToken,
				'item': 'fFolderGUID:' + themeId,
				'useBackgroundThread': 'true'
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
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						console.log(' - establish user session');

						// verify theme
						var params = 'doBrowseStarterThemes=1';
						var themePromise = serverUtils.browseThemesOnServer(request, server, params);
						themePromise.then(function (result) {
								if (result.err) {
									return Promise.reject();
								}

								var themes = result.data || [];

								var found = false;
								for (var j = 0; j < themes.length; j++) {
									if (themeName.toLowerCase() === themes[j].fFolderName.toLowerCase()) {
										found = true;
										themeId = themes[j].fFolderGUID;
										break;
									}
								}

								if (!found) {
									console.log('ERROR: theme ' + themeName + ' does not exist');
									return Promise.reject();
								}

								console.log(' - get theme');

								return _publishThemeSCS(request, localhost, server, themeName, idcToken);
							})
							.then(function (result) {
								if (result.err) {
									return Promise.reject();
								}

								console.log(' - publish theme ' + themeName + ' finished');
								_cmdEnd(done, true);
							})
							.catch((error) => {
								_cmdEnd(done);
							});
					}
				});
			}, 5000);
		}); // local
	}); // login
};

var _publishThemeSCS = function (request, localhost, server, themeName, idcToken) {
	return new Promise(function (resolve, reject) {

		var url = localhost + '/documents/web?IdcService=SCS_ACTIVATE_THEME';

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to publish theme ' + themeName);
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
				console.log('ERROR: failed to publish theme ' + themeName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var jobId = data.LocalData.JobID;
			if (jobId) {
				console.log(' - submit publish theme (JobID: ' + jobId + ')');
				// wait action to finish
				var inter = setInterval(function () {
					var jobPromise = serverUtils.getBackgroundServiceJobStatus(server, request, idcToken, jobId);
					jobPromise.then(function (data) {
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							console.log(data);
							// try to get error message
							console.log('ERROR: publish theme failed: ' + (data && data.JobMessage));
							return resolve({
								err: 'err'
							});

						}
						if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);

							return resolve({});

						} else {
							console.log(' - publish in process: percentage ' + data.JobPercentage);
						}
					});
				}, 6000);
			} else {
				console.log('ERROR: failed to submit publish theme');
				return resolve({
					err: 'err'
				});
			}
		});
	});
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
		_cmdEnd(done);
		return;
	}

	try {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			_cmdEnd(done);
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

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var themePromise = server.useRest ? sitesRest.getTheme({
				server: server,
				name: name
			}) : serverUtils.browseThemesOnServer(request, server, 'doBrowseStarterThemes=1');
			themePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (server.useRest) {
						themeId = result.id;
					} else {
						var themes = result.data || [];
						for (var i = 0; i < themes.length; i++) {
							if (themes[i].fFolderName.toLowerCase() === name.toLowerCase()) {
								themeId = themes[i].fFolderGUID;
								break;
							}
						}
					}
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
					_cmdEnd(done, shared);
				})
				.catch((error) => {
					_cmdEnd(done);
				});
		}); // login
	} catch (e) {
		_cmdEnd(done);
	}
};

/**
 * unshare theme
 */
module.exports.unshareTheme = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
		return;
	}

	try {
		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			_cmdEnd(done);
			return;
		}

		// console.log('server: ' + server.url);
		var name = argv.name;
		var userNames = argv.users ? argv.users.split(',') : [];
		var groupNames = argv.groups ? argv.groups.split(',') : [];

		var themeId;
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

			var themePromise = server.useRest ? sitesRest.getTheme({
				server: server,
				name: name
			}) : serverUtils.browseThemesOnServer(request, server, 'doBrowseStarterThemes=1');
			themePromise.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}
					if (server.useRest) {
						themeId = result.id;
					} else {
						var themes = result.data || [];
						for (var i = 0; i < themes.length; i++) {
							if (themes[i].fFolderName.toLowerCase() === name.toLowerCase()) {
								themeId = themes[i].fFolderGUID;
								break;
							}
						}
					}
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
					_cmdEnd(done, unshared);
				})
				.catch((error) => {
					_cmdEnd(done);
				});
		}); // login
	} catch (e) {
		_cmdEnd(done);
	}
};