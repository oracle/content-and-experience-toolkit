/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 8 */

/**
 * node-fetch wrapper
 */

const fs = require('fs');
const fetch = require('node-fetch');
const process = require('process');

var logRequest = function(request) {
	if (process.env.FETCH_LOG) {
		fs.appendFileSync(process.env.FETCH_LOG, '\n-------------------------------------------\n');
		fs.appendFileSync(process.env.FETCH_LOG, new Date().toLocaleString() + '\n\n');
		fs.appendFileSync(process.env.FETCH_LOG, 'Request: ' + JSON.stringify(request, null, '  ')+ '\n');
	}
}

var logResponseHeaders = function(response) {
	if (process.env.FETCH_LOG) {
		fs.appendFileSync(process.env.FETCH_LOG, 'Response Headers: ' + JSON.stringify(response.headers.raw(), null, '  ') + '\n');
	}
}

var logResponseBody = function(response, body) {
	if (process.env.FETCH_LOG) {
		if (response.headers.get('content-type') === 'application/json') {
			fs.appendFileSync(process.env.FETCH_LOG, 'Response Body: ' + JSON.stringify(JSON.parse(body), null, '  ') + '\n');
		}
		else {
			fs.appendFileSync(process.env.FETCH_LOG, 'Response Body: ' + body.toString() + '\n');
		}
	}
}

var _get = function (options, callback) {
	logRequest(options);
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			logResponseHeaders(response);
			return response.buffer().then(function (data) {
				logResponseBody(response, data);
				var err = response.error;
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText,
					headers: response.headers
				};
				return callback(err, res, data);
			});
		})
		.catch(error => {
			// console.log(error);
			return callback(error, {}, '');
		});
};

var _post = function (options, callback) {
	logRequest(options);
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			logResponseHeaders(response);
			return response.buffer().then(function (data) {
				logResponseBody(response, data);
				var err = response.error;
				var location = response.headers.get('location');
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText,
					url: response.url,
					location: location,
					headers: response.headers
				};
				return callback(err, res, data);
			});
		})
		.catch(error => {
			// console.log(error);
			return callback(error, {}, '');
		});
};

module.exports.request = {
	get: _get,
	post: _post,
	put: _post,
	patch: _post,
	delete: _post
};