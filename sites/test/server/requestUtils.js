/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * node-fetch wrapper
 */

const fs = require('fs');
const fetch = require('node-fetch');
const process = require('process');

const CEC_OCM_APP_KEY = 'o:5a64a808220a4b1295fd80bc70531382';

var fetchLog = function (message) {
	if (process.env.FETCH_LOG === 'console') {
		console.log(message);
	} else if (process.env.FETCH_LOG) {
		fs.appendFileSync(process.env.FETCH_LOG, message, { flag: 'a+' });
	}
}

let requestNumber = 0;
var logRequest = function (request) {
	if (process.env.FETCH_LOG) {
		fetchLog('\n-------------------------------------------\n');
		fetchLog(new Date().toLocaleString() + '\n\n');
		fetchLog('Request #' + requestNumber + ': ' + JSON.stringify(request, null, '  ') + '\n');
		request._requestNumber = requestNumber;
		requestNumber++;
	}
}

var logResponseHeaders = function (request, response) {
	if (process.env.FETCH_LOG) {
		fetchLog('Response #' + request._requestNumber + ' Status: ' + response.status + ': ' + response.statusText + '\n');
		fetchLog('Response #' + request._requestNumber + ' Headers: ' + JSON.stringify(response.headers.raw(), null, '  ') + '\n');
	}
}

var logResponseBody = function (request, response, body) {
	if (process.env.FETCH_LOG) {
		if (response.headers.get('content-type') === 'application/json') {
			fetchLog('Response #' + request._requestNumber + ' Body: ' + JSON.stringify(JSON.parse(body), null, '  ') + '\n');
		} else {
			fetchLog('Response #' + request._requestNumber + ' Body: ' + body.toString() + '\n');
		}
	}
}

var _getAppKey = function () {
	let key = process.env.CEC_LCM_COMPILE_APP_KEY || CEC_OCM_APP_KEY;
	// console.log(key);
	return key;
};

var _get = function (options, callback) {
	if (options.headers) {
		options.headers['X-Oracle-Ocm-App-Key'] = _getAppKey();
	}
	logRequest(options);
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			logResponseHeaders(options, response);
			const responseData = process.shim ? response.text() : response.buffer();
			return responseData.then(function (data) {
				logResponseBody(options, response, data);
				var err = response.error;
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText,
					headers: response.headers,
					ecid: response.headers.get('x-oracle-dms-ecid')
				};
				return callback(err, res, data);
			});
		})
		.catch(error => {
			// console.log(error);
			return callback(error, {}, '');
		});
};

var _getStream = function (options, callback) {
	if (options.headers) {
		options.headers['X-Oracle-Ocm-App-Key'] = _getAppKey();
	}
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			var err = response.error;
			var res = {
				statusCode: response.status,
				statusMessage: response.statusText,
				headers: response.headers,
				ecid: response.headers.get('x-oracle-dms-ecid')
			};
			return callback(err, res, response.body);
		})
		.catch(error => {
			// console.log(error);
			return callback(error, {}, '');
		});
};

var _post = function (options, callback) {
	if (options.headers) {
		options.headers['X-Oracle-Ocm-App-Key'] = _getAppKey();
	}
	logRequest(options);
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			logResponseHeaders(options, response);
			//fix request error under browser
			let req = process.shim ? response.text() : response.buffer();
			return req.then(function (data) {
				logResponseBody(options, response, data);
				var err = response.error;
				var location = response.headers.get('location');
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText,
					url: response.url,
					location: location,
					headers: response.headers,
					ecid: response.headers.get('x-oracle-dms-ecid')
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
	getStream: _getStream,
	post: _post,
	put: _post,
	patch: _post,
	delete: _post
};