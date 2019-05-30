/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	decompress = require('decompress'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;
var Client = require('node-rest-client').Client;

var projectDir,
	componentsSrcDir,
	serversSrcDir;


var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

var _cmdEnd = function (done) {
	done();
	process.exit(0);
};

/** 
 * private
 * unzip component zip file and copy to /src
 */
var unzipComponent = function (compName, compPath) {
	return new Promise(function (resolve, reject) {
		// create dir in src
		var compSrcDir = path.join(componentsSrcDir, compName);
		if (fs.existsSync(compSrcDir)) {
			fse.removeSync(compSrcDir);
		}

		// unzip /src/main/components/<comp name>/
		decompress(compPath, componentsSrcDir).then(() => {
			resolve({
				comp: compName
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
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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
		console.log('ERROR: file ' + compPath + ' does not exist');
		done();
		return;
	}

	var compName = compPath.substring(compPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	// console.log('Import Component: importing component name=' + compName + ' path=' + compPath);
	unzipComponent(compName, compPath).then(function (result) {
		console.log(' - import component to ' + path.join(componentsSrcDir, compName));
		console.log(' - component is ready to test: http://localhost:8085/components/' + compName);
		_cmdEnd(done);
	});
};

/**
 * Download components from server
 */
module.exports.downloadComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
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
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}

	// Support a list of components
	var components = argv.component.split(',');

	try {
		_downloadComponents(serverName, server, components, done);
	} catch (e) {
		console.log(e);
	}
};

var _downloadComponents = function (serverName, server, componentNames, done) {
	var isPod = server.env === 'pod_ec';

	var request = serverUtils.getRequest();

	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var components = [];
		var homeFolderGUID;
		var deleteFileGUIDs = [];

		var destdir = path.join(projectDir, 'dist');
		if (!fs.existsSync(destdir)) {
			fs.mkdirSync(destdir);
		}

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
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var compId = params.compId;
			var url = server.url + '/documents/web?IdcService=SCS_EXPORT_COMPONENT';
			var formData = {
				'idcToken': idcToken,
				'item': 'fFolderGUID:' + compId,
				'destination': 'fFolderGUID:' + homeFolderGUID
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
					console.log('ERROR: Failed to export component');
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

		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					homeFolderGUID = 'F:USER:' + dUser;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken + ' home folder: ' + homeFolderGUID);
						clearInterval(inter);
						console.log(' - establish user session');

						// verify components
						var compPromise = serverUtils.browseComponentsOnServer(request, server);
						compPromise.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								}

								var comps = result.data || [];

								for (var i = 0; i < componentNames.length; i++) {
									var compName = componentNames[i];
									var found = false;
									for (var j = 0; j < comps.length; j++) {
										if (compName.toLowerCase() === comps[j].fFolderName.toLowerCase()) {
											found = true;
											components.push({
												id: comps[j].fFolderGUID,
												name: compName,
												filename: compName + '.zip'
											});
											break;
										}
									}

									if (!found) {
										console.log('ERROR: component ' + compName + ' does not exist');
										_cmdEnd(done);
									}
								}

								console.log(' - get ' + (components.length > 1 ? 'components' : 'component'));

								var exportCompPromises = [];
								for (var i = 0; i < components.length; i++) {
									exportCompPromises.push(_exportComponentSCS(request, localhost, components[i].id, components[i].name));
								}

								// export components
								return Promise.all(exportCompPromises);
							})
							.then(function (results) {
								for (var i = 0; i < results.length; i++) {
									if (results[i].err) {
										_cmdEnd(done);
									}
								}

								var getCompZipPromises = [];
								for (var i = 0; i < components.length; i++) {
									console.log(' - export component ' + components[i].name);

									getCompZipPromises.push(serverRest.findFile({
										registeredServerName: serverName,
										currPath: projectDir,
										parentID: homeFolderGUID,
										filename: components[i].filename
									}));
								}

								// query the exported component zip files
								return Promise.all(getCompZipPromises);
							})
							.then(function (results) {
								var downloadFilePromises = [];
								for (var j = 0; j < components.length; j++) {
									var found = false;
									for (var i = 0; i < results.length; i++) {
										if (components[j].filename === results[i].name) {
											// will delete the zip file after download
											deleteFileGUIDs.push(results[i].id);
											components[j]['fileGUID'] = results[i].id;
											found = true;
											downloadFilePromises.push(_downloadComponentFile(
												server, components[j].name, components[j].filename, components[j].fileGUID
											));
										}
									}

									if (!found) {
										console.log('ERROR: failed to find zip fileGUID for ' + components[j].name);
									}
								}

								// download zip files
								return Promise.all(downloadFilePromises);
							})
							.then(function (results) {
								var unzipPromises = [];

								for (var i = 0; i < results.length; i++) {
									if (results[i].err) {
										console.log('ERROR: failed to download zip for ' + results[i].comp);
									} else {
										var targetFile = path.join(destdir, results[i].comp + '.zip');
										fs.writeFileSync(targetFile, results[i].data);
										console.log(' - save file ' + targetFile);
										unzipPromises.push(unzipComponent(results[i].comp, targetFile));
									}
								}

								// import components to local
								return Promise.all(unzipPromises);
							})
							.then(function (results) {
								for (var i = 0; i < results.length; i++) {
									if (results[i].comp) {
										console.log(' - import component to ' + path.join(componentsSrcDir, results[i].comp));
									}
								}

								var deleteFilePromises = [];
								for (var i = 0; i < deleteFileGUIDs.length; i++) {
									deleteFilePromises.push(serverRest.deleteFile({
										currPath: projectDir,
										registeredServerName: serverName,
										fFileGUID: deleteFileGUIDs[i]
									}));
								}

								// delete the zip file on the server
								return Promise.all(deleteFilePromises);
							})
							.then(function (results) {
								_cmdEnd(done);
							});
					}
				});
			}, 6000);

		}); // local

	}); // login

};

var _exportComponentSCS = function (request, localhost, compId, compName) {

	return new Promise(function (resolve, reject) {

		var url = localhost + '/documents/web?IdcService=SCS_EXPORT_COMPONENT&compId=' + compId;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to export component ' + compName);
				console.log(err);
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to export component ' + compName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			return resolve({});
		});
	});
};

var _downloadComponentFile = function (server, compName, fileName, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve({
					comp: compName,
					data: data
				});
			} else {
				var result;
				try {
					result = JSON.parse(data);
				} catch (error) {};
				var msg = response.statusCode;
				if (result && result.errorMessage) {
					msg = result.errorMessage;
				} else {
					if (response.statusCode === 403) {
						msg = 'No read permission';
					} else if (response.statusCode === 404) {
						msg = 'File id is not found';
					}
				}
				console.log('ERROR: failed to download file ' + fileName + ' - ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * control components on server
 */
module.exports.controlComponent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		_cmdEnd(done);
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
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}

	// Support a list of components
	var components = argv.components.split(',');
	var action = argv.action;

	try {
		_controlComponents(serverName, server, action, components, done);
	} catch (e) {
		console.log(e);
	}
};

var _controlComponents = function (serverName, server, action, componentNames, done) {

	var isPod = server.env === 'pod_ec';

	var request = serverUtils.getRequest();

	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var components = [];

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
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var compId = params.compId;
			var url = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
			var formData = {
				'idcToken': idcToken,
				'item': 'fFolderGUID:' + compId
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

		var localServer = app.listen(0, function () {
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

						// verify components
						var compPromise = serverUtils.browseComponentsOnServer(request, server);
						compPromise.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								}

								var comps = result.data || [];

								for (var i = 0; i < componentNames.length; i++) {
									var compName = componentNames[i];
									var found = false;
									for (var j = 0; j < comps.length; j++) {
										if (compName.toLowerCase() === comps[j].fFolderName.toLowerCase()) {
											found = true;
											components.push({
												id: comps[j].fFolderGUID,
												name: compName
											});
											break;
										}
									}

									if (!found) {
										console.log('ERROR: component ' + compName + ' does not exist');
										_cmdEnd(done);
									}
								}

								console.log(' - get ' + (components.length > 1 ? 'components' : 'component'));

								var compActionPromises = [];
								for (var i = 0; i < components.length; i++) {
									if (action === 'publish') {
										compActionPromises.push(_publishComponentSCS(request, localhost, components[i].id, components[i].name));
									}
								}
								
								return Promise.all(compActionPromises);
						})
						.then(function (results) {
							for (var i = 0; i < results.length; i++) {
								if (!results[i].err) {
									console.log(' - ' + action + ' ' + results[i].comp + ' finished');
								}
							}
							_cmdEnd(done);
						});
					}
				});
			}, 6000);
		}); // local
	}); // login
};

var _publishComponentSCS = function (request, localhost, compId, compName) {
	return new Promise(function (resolve, reject) {

		var url = localhost + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT&compId=' + compId;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to publish component ' + compName);
				console.log(err);
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to publish component ' + compName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					comp: compName,
					err: 'err'
				});
			}

			return resolve({comp: compName});
		});
	});
};
