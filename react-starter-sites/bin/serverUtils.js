/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */

/**
 * Utilities for Local Server
 */

var express = require('express'),
	app = express(),
	os = require('os'),
	fs = require('fs'),
	path = require('path'),
	Client = require('node-rest-client').Client;

var projectDir = path.join(__dirname, '../');


/**
 * Get server and credentials from gradle properties
 */
module.exports.getConfiguredServer = function () {
	var configFile = process.env.CEC_PROPERTIES || path.join(os.homedir(), '.cec_properties');
	return _getConfiguredServer(configFile);
};
var _getConfiguredServer = function (configFile) {
	// console.log('CEC configure file: ' + configFile);
	var server = {
		url: '',
		username: '',
		password: '',
		oauthtoken: '',
		env: '',
		content: 'local',
		channelToken: ''
	};
	if (!fs.existsSync(configFile)) {
		// console.log(' - file ' + configFile + ' does not exist');
		return server;
	}
	try {
		var cecurl,
			username,
			password,
			env,
			content,
			channelToken;
		fs.readFileSync(configFile).toString().split('\n').forEach(function (line) {
			if (line.indexOf('cec_url=') === 0) {
				cecurl = line.substring('cec_url='.length);
				cecurl = cecurl.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_username=') === 0) {
				username = line.substring('cec_username='.length);
				username = username.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_password=') === 0) {
				password = line.substring('cec_password='.length);
				password = password.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_env=') === 0) {
				env = line.substring('cec_env='.length);
				env = env.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_content=') === 0) {
				content = line.substring('cec_content='.length);
				content = content.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_channel_token=') === 0) {
				channelToken = line.substring('cec_channel_token='.length);
				channelToken = channelToken.replace(/(\r\n|\n|\r)/gm, '').trim();
			}
		});
		if (cecurl && username && password) {
			server.source = configFile;
			server.url = cecurl;
			server.username = username;
			server.password = password;
			server.env = env || 'pod_ec';
			server.oauthtoken = '';
			server.content = content || server.content;
			server.channelToken = channelToken;
		}
		// console.log('configured server=' + JSON.stringify(server));
	} catch (e) {
		console.log('Failed to read config: ' + e);
	}
	return server;
};


/**
 * Utility check if a string ends with 
 */
module.exports.endsWith = (str, end) => {
	return str.lastIndexOf(end) === str.length - end.length;
};

/**
 * Utility replace all occurrences of a string
 */
module.exports.replaceAll = (str, search, replacement) => {
	var re = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
	return str.replace(re, replacement || '');
};

module.exports.fixHeaders = (origResponse, response) => {
	_fixHeaders(origResponse, response);
};
var _fixHeaders = function (origResponse, response) {
	var headers = origResponse.rawHeaders, // array [name1, value1, name2, value2, ...]
		i = 0,
		headerNames = [],
		headerName;

	for (i = 0; i < headers.length; i = i + 2) {
		headerName = headers[i];
		// collect header name
		headerNames.push(headerName);

		// regarding capitalization, we're only taking care of SCS 'ETag-something' headers
		if (headerName.indexOf('ETag-') === 0) {
			// remove the corresponding lower case header from the proxied response object
			// (it otherwise takes precedence when piped to the actual response)
			delete origResponse.headers[headerName.toLowerCase()];
			// set the capitalized header name in the new response object
			response.setHeader(headerName, headers[i + 1]);
		}
	}

	// explicitly declare headers for cross-domain requests
	response.setHeader('Access-Control-Expose-Headers', headerNames.join(','));
};

module.exports.getURLParameters = function (queryString) {
	var params = {};

	if (!queryString || queryString.indexOf('=') < 0) {
		console.log(' queryString ' + queryString + ' is empty or not valid');
		return params;
	}
	parts = queryString.split('&');
	for (var i = 0; i < parts.length; i++) {
		var nameval = parts[i].split('='),
			name = nameval[0],
			val = nameval[1] || '';
		params[name] = decodeURIComponent(val);
	}
	// console.log(params);
	return params;
};



/**
 * Get content types from server
 */
module.exports.getContentTypesFromServer = function (server) {
	var typesPromise = new Promise(function (resolve, reject) {
		if (!server || !server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1/types?limit=9999';
		client.get(url, function (data, response) {
			var types = [];
			if (response && response.statusCode === 200) {
				types = data && data.items;
				return resolve({
					types: types
				});
			} else {
				// console.log('status=' + response.statusCode + ' err=' + err);
				console.log('ERROR: failed to query content types');
				return resolve({});
			}
		});
	});
	return typesPromise;
};

/**
 * Get all fields of a content types from server
 */
module.exports.getContentTypeFieldsFromServer = function (server, typename) {
	var fieldsPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/types/' + typename;
		client.get(url, function (data, response) {
			var fields = [];
			if (response && response.statusCode === 200 && data && data.fields) {
				fields = data.fields;
				return resolve({
					type: typename,
					fields: fields
				});
			} else {
				console.log('status=' + response && response.statusCode);
				return resolve({});
			}
		});
	});
	return fieldsPromise;
};

/**
 * Get channels from server
 */
module.exports.getChannelsFromServer = function (server) {
	var channelsPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/channels';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200 && data) {
				var channels = [];
				if (data.channels) {
					for (var i = 0; i < data.channels.length; i++) {
						var channel = data.channels[i];
						var tokens = channel.tokens;
						var token;
						if (tokens && tokens.length > 0) {
							if (tokens.length === 1) {
								token = tokens[0].channelToken;
							} else if (tokens.length > 0)
								for (var j = 0; j < tokens.length; j++) {
									if (tokens[j].tokenName === 'defaultToken') {
										token = tokens[j].channelToken;
										break;
									}
								}
							if (!token) {
								token = tokens[0].channelToken;
							}
						}
						channels.push({
							'id': channel.id,
							'name': channel.name,
							'token': token
						});
					}
					return resolve({
						channels
					});
				} else if (data.items) {
					var channelPromises = [];
					for (var i = 0; i < data.items.length; i++) {
						channelPromises[i] = _getChannelDetailsFromServer(server, data.items[i].id);
					}
					Promise.all(channelPromises).then(function (values) {
						for (var i = 0; i < values.length; i++) {
							var channel = values[i];
							if (channel && channel.channelTokens) {
								var token;
								var tokens = channel.channelTokens;
								if (tokens && tokens.length === 1) {
									token = tokens[0].token;
								} else if (tokens && tokens.length > 0) {
									for (var j = 0; j < tokens.length; j++) {
										if (tokens[j].name === 'defaultToken') {
											token = tokens[j].token;
											break;
										}
									}
									if (!token) {
										token = tokens[0].channelToken;
									}
								}

								channels.push({
									'id': channel.id,
									'name': channel.name,
									'token': token
								});
							}
						}

						return resolve({
							channels
						});
					});
				}

			} else {
				console.log('status=' + response && response.statusCode);
				return resolve({});
			}
		});

	});
	return channelsPromise;
};



var _getChannelDetailsFromServer = function (server, channelId) {
	var channelPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/channels/' + channelId;
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200 && data) {
				return resolve(data);
			} else {
				// console.log(' - ' + (data ? (data.detail || data.title) : 'failed to get channel: id=' + channelId));
				return resolve({});
			}
		});
	});
	return channelPromise;
};

/**
 * Call CAAS to create and export content template
 * @param {*} channelId 
 */
module.exports.exportChannelContent = function (request, server, channelId, channelName, destdir) {
	var exportPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}

		var auth = {
			user: server.username,
			password: server.password
		};
		// Get CSRF token
		var csrfTokenPromise = new Promise(function (resolve, reject) {
			var tokenUrl = server.url + '/content/management/api/v1.1/token';

			var options = {
				url: tokenUrl,
				'auth': auth
			};
			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get CSRF token');
					console.log(err);
					return resolve({});
				}
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					return resolve(data);
				} else {
					console.log('ERROR: Failed to get CSRF token, status=' + response.statusCode);
					return resolve({});
				}
			});
		});

		csrfTokenPromise.then(function (result) {
			var csrfToken = result && result.token;
			if (!csrfToken) {
				// console.log('ERROR: Failed to get CSRF token');
				return resolve({});
			}
			console.log(' - get CSRF token');

			var url = server.url + '/content/management/api/v1.1/content-templates/exportjobs';
			var contentTemplateName = 'contentexport';
			var postData = {
				'name': contentTemplateName,
				'channelIds': [{
					'id': channelId
				}],
				'exportPublishedItems': "true"
			};

			var options = {
				method: 'POST',
				url: url,
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest'
				},
				auth: auth,
				body: JSON.stringify(postData)
			};
			// console.log(JSON.stringify(options));

			request(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to export');
					console.log(err);
					resolve({});
				}
				if (response && (response.statusCode === 200 || response.statusCode === 201)) {
					var data = JSON.parse(body);
					var jobId = data && data.jobId;
					if (!jobId) {
						return resolve({});
					}
					console.log(' - submit export job');

					// Wait for job to finish
					var total = 0;
					var inter = setInterval(function () {
						var checkExportStatusPromise = _checkExportStatus(request, server, jobId);
						checkExportStatusPromise.then(function (result) {
							if (result.status !== 'success') {
								return resolve({});
							}

							var data = result.data;
							var status = data.status;
							// console.log(data);
							if (status && status === 'SUCCESS') {
								clearInterval(inter);
								var downloadLink = data.downloadLink[0].href;
								if (downloadLink) {
									options = {
										url: downloadLink,
										auth: auth,
										headers: {
											'Content-Type': 'application/zip'
										},
										encoding: null
									};
									//
									// Download the export zip
									request.get(options, function (err, response, body) {
										if (err) {
											console.log('ERROR: Failed to download');
											console.log(err);
											return resolve({});
										}
										if (response && response.statusCode === 200) {
											console.log(' - download export file');
											var exportfilepath = path.join(destdir, channelName + '_export.zip');
											fs.writeFileSync(exportfilepath, body);
											console.log(' - save export to ' + exportfilepath);

											return resolve({});
										} else {
											console.log('ERROR: Failed to download, status=' + response.statusCode);
											return resolve({});
										}
									});
								}
							} else if (status && status === 'FAILED') {
								console.log('ERROR: export failed');
								return resolve({});
							} else if (status && status === 'INPROGRESS') {
								console.log(' - export job in progress...');
							}

						});

					}, 5000);

				} else {
					console.log(' - failed to export: ' + response.statusCode);
					console.log(body);
					return resolve({});
				}
			});
		});
	});
	return exportPromise;
};

/**
 * private
 */
var _checkExportStatus = function (request, server, jobId) {
	var checkExportStatusPromise = new Promise(function (resolve, reject) {
		var statusUrl = server.url + '/content/management/api/v1.1/content-templates/exportjobs/' + jobId;
		var auth = {
			user: server.username,
			password: server.password
		};
		var options = {
			url: statusUrl,
			'auth': auth
		};
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get export job status');
				console.log(err);
				return resolve({
					status: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				return resolve({
					status: 'success',
					data: data
				});
			} else {
				console.log('ERROR: Failed to get export job status: ' + response.statusCode);
				return resolve({
					status: response.statusCode
				});
			}
		});
	});
	return checkExportStatusPromise;
};