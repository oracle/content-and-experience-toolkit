/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	decompress = require('decompress'),
	fs = require('fs'),
	fse = require('fs-extra'),
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
										themeId = themes[j].fFolderGUID
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
			}, 2000);
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
				console.log(' - submit publish theme');
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

			return sitesRest.publishTheme({server: server, name: themeName});
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