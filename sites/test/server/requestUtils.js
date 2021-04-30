/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 8 */

/**
 * node-fetch wrapper
 */

const fetch = require('node-fetch');

var _get = function (options, callback) {
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			// console.log(response);
			return response.buffer().then(function (data) {
				var err = response.error;
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText
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
	// console.log(options);
	var url = options.url;
	return fetch(url, options)
		.then(function (response) {
			// console.log(response);
			// console.log(response.headers);
			return response.buffer().then(function (data) {
				var err = response.error;
				var location = response.headers.get('location');
				var res = {
					statusCode: response.status,
					statusMessage: response.statusText,
					url: response.url,
					headers: {
						location: location
					}
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