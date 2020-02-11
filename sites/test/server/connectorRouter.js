/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals app, module, __dirname */
/* jshint esversion: 6 */
/**
 * Router handling /pxysvs requests
 */
var express = require('express'),
	fs = require('fs'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	path = require('path');

var cecDir = path.resolve(__dirname).replace(path.join('test', 'server'), '');
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;
var connectionsSrcDir, connectorsSrcDir;

var _setupSourceDir = function () {
	var srcfolder = serverUtils.getSourceFolder(projectDir);
	connectionsSrcDir = path.join(srcfolder, 'connections');
	connectorsSrcDir = path.join(srcfolder, 'connectors');
};

router.get('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request;

	_setupSourceDir();

	console.log('$$$ Connector: GET: ' + req.url);

	var apiUrl;
	var params;
	if (req.url.indexOf('?') > 0) {
		apiUrl = req.url.substring(0, req.url.indexOf('?'));
		params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
	}
	apiUrl = apiUrl.replace('/connector/rest/api', '');

	var connectionName = params.connection;
	if (!connectionName) {
		console.log(' - no connection is specified');
		res.writeHead(404, {});
		res.end();
		return;
	}

	var connector;
	var connectionfile = path.join(connectionsSrcDir, connectionName, 'connection.json');
	if (fs.existsSync(connectionfile)) {
		var connectionstr = fs.readFileSync(connectionfile).toString();
		connector = connectionstr ? JSON.parse(connectionstr) : undefined;
	}
	if (!connector) {
		console.log(' - connection ' + connection + ' does not exist');
		res.writeHead(404, {});
		res.end();
		return;
	}
	
	var basicAuth = 'Basic ' + serverUtils.btoa(connector.user + ':' + connector.password);
	var headers = {};
	headers['Authorization'] = basicAuth;
	for (var i = 0; i < connector.fields.length; i++) {
		headers[connector.fields[i].name] = connector.fields[i].value;
	}

	var url = connector.url + apiUrl;
	console.log(' - call connector: ' + connector.url + apiUrl);

	var options = {
		method: 'GET',
		url: url,
		headers: headers
	};

	// console.log(options);
	if (req.url.indexOf('/connector/rest/api/v1/job/') === 0 && url.indexOf('/translation') > 0) {
		var targetFileName = 'translationBundle-translated.zip';
		var targetFile = path.join(projectDir, 'dist', targetFileName);
		if (!fs.existsSync(path.join(projectDir, 'dist'))) {
			fs.mkdirSync(path.join(projectDir, 'dist'));
		}
		var failed = false;
		var result = {};
		var responseHeaders = {}; 
		result['options'] = options;

		request(options).on('response', function (response) {
				// fix headers for cross-domain and capitalization issues
				serverUtils.fixHeaders(response, res);
				if (response && response.statusCode !== 200) {
					failed = true;
					result['err'] = 'err';
					result['data'] = {
						Error: 'Failed to get translated job: ' + response.statusCode
					};
					res.write(JSON.stringify(result));
					res.status(response.statusCode).end();
				}
				// get the headers
				if (response.headers['content-disposition']) {
					responseHeaders['content-disposition'] = response.headers['content-disposition'];
				}
				if (response.headers['content-type']) {
					responseHeaders['content-type'] = response.headers['content-type'];
				}
				if (response.headers['content-length']) {
					responseHeaders['content-length'] = response.headers['content-length'];
				}
				console.log(response.headers);
			})
			.on('error', function (err) {
				console.log(' - connector request error: ' + err);
				result['err'] = 'err';
				result['data'] = {
					Error: err
				};
				res.write(JSON.stringify(result));
				res.end();
			})
			.pipe(fs.createWriteStream(targetFile))
			.on('finish', function () {
				if (!failed) {
					responseHeaders.message = 'translation saved to ' + targetFile;
					result['data'] = responseHeaders;
					res.write(JSON.stringify(result));
					res.end();
				}
			});
	} else {
		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				result['err'] = 'err';
				result['data'] = error;
			}
			if (response && response.statusCode === 200) {
				result['data'] = body ? JSON.parse(body) : {};
			} else {
				result['err'] = 'Failed to get job: ' + (response ? (response.statusMessage || response.statusCode) : '');
			}
			result['options'] = options;

			res.write(JSON.stringify(result));
			res.end();
		});
	}
});

router.post('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request;

	_setupSourceDir();

	console.log('$$$ Connector: POST: ' + req.url);

	var apiUrl;
	var params;
	if (req.url.indexOf('?') > 0) {
		apiUrl = req.url.substring(0, req.url.indexOf('?'));
		params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
	}
	apiUrl = apiUrl.replace('/connector/rest/api', '');

	var connectionName = params.connection;
	if (!connectionName) {
		console.log(' - no connection is specified');
		res.writeHead(404, {});
		res.end();
		return;
	}

	var connector;
	var connectionfile = path.join(connectionsSrcDir, connectionName, 'connection.json');
	if (fs.existsSync(connectionfile)) {
		var connectionstr = fs.readFileSync(connectionfile).toString();
		connector = connectionstr ? JSON.parse(connectionstr) : undefined;
	}
	if (!connector) {
		console.log(' - connection ' + connection + ' does not exist');
		res.writeHead(404, {});
		res.end();
		return;
	}

	var formData = {};

	var basicAuth = 'Basic ' + serverUtils.btoa(connector.user + ':' + connector.password);
	var headers = {};
	headers['Authorization'] = basicAuth;
	for (var i = 0; i < connector.fields.length; i++) {
		headers[connector.fields[i].name] = connector.fields[i].value;
	}

	var url = connector.url + apiUrl;
	console.log(' - call connector: ' + url);

	var options = {
		method: 'POST',
		url: url,
		headers: headers
	};

	var filePath = path.join(connectorsSrcDir, connector.connector, 'data', 'translationBundle.zip');
	var sendTranslation = false;
	if (req.url.indexOf('/connector/rest/api/v1/job/') === 0) {
		// send translate
		sendTranslation = true;
		options['body'] = fs.readFileSync(filePath);
		console.log(' - send file: ' + filePath);
	} else if (req.url.indexOf('/connector/rest/api/v1/job') === 0) {
		// Create job
		//formData['name'] = params.jobName;
		//options['form'] = formData;
		options.json = true;
		options.body = {
			"name": params.jobName
		};
	}

	// console.log(options);
	request(options, function (error, response, body) {
		var result = {};
		if (error) {
			result['err'] = error;
			result['data'] = error;
		}
		if (response && response.statusCode === 200) {
			result['data'] = (body && typeof body === 'string') ? JSON.parse(body) : (body || {});
		} else {
			result['err'] = 'Failed to get job: ' + (response ? (response.statusMessage || response.statusCode) : '');
		}
		if (sendTranslation) {
			options['body'] = 'fs.readFileSync(\'' + filePath + '\')';
		}

		result['options'] = options;

		res.write(JSON.stringify(result));
		res.end();
	});
});

router.delete('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request;

	_setupSourceDir();

	console.log('$$$ Connector: DELETE: ' + req.url);

	var apiUrl;
	var params;
	if (req.url.indexOf('?') > 0) {
		apiUrl = req.url.substring(0, req.url.indexOf('?'));
		params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
	}
	apiUrl = apiUrl.replace('/connector/rest/api', '');
	
	var connectionName = params.connection;
	if (!connectionName) {
		console.log(' - no connection is specified');
		res.writeHead(404, {});
		res.end();
		return;
	}

	var connector;
	var connectionfile = path.join(connectionsSrcDir, connectionName, 'connection.json');
	if (fs.existsSync(connectionfile)) {
		var connectionstr = fs.readFileSync(connectionfile).toString();
		connector = connectionstr ? JSON.parse(connectionstr) : undefined;
	}
	if (!connector) {
		console.log(' - connection ' + connection + ' does not exist');
		res.writeHead(404, {});
		res.end();
		return;
	}

	var basicAuth = 'Basic ' + serverUtils.btoa(connector.user + ':' + connector.password);
	var headers = {};
	headers['Authorization'] = basicAuth;
	for (var i = 0; i < connector.fields.length; i++) {
		headers[connector.fields[i].name] = connector.fields[i].value;
	}

	var url = connector.url + apiUrl;
	console.log(' - call connector: ' + url);

	var options = {
		method: 'DELETE',
		url: url,
		headers: headers
	};

	request(options, function (error, response, body) {
		var result = {};

		if (error) {
			result['err'] = 'err';
			result['data'] = error;
		}
		if (response && response.statusCode === 200) {
			result['data'] = body ? JSON.parse(body) : {};
		} else {
			result['err'] = 'Failed to get job: ' + (response ? (response.statusMessage || response.statusCode) : '');
		}
		result['options'] = options;

		res.write(JSON.stringify(result));
		res.end();
	});
});

// Export the router
module.exports = router;