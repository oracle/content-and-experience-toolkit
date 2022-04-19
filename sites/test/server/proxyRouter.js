/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Router handling /pxysvs requests
 * Used in PCS components
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	path = require('path');


router.get('/*', (req, res) => {
	let location, app = req.app,
		requestUrl = req.originalUrl;

	if (app.locals.server.env !== 'dev_ec' && !app.locals.server.oauthtoken) {
		console.log('No remote EC server access for remote traffic ', requestUrl);
		res.end();
		return;
	} else if (!app.locals.connectToServer) {
		console.log('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	console.log('@@@ Proxy Service: ' + req.url);

	if (req.url === '/') {
		console.log(' - no proxy service specified');
		res.end();
		return;
	}

	location = app.locals.serverURL + requestUrl;
	console.log('Remote traffic:', location);

	var options = {
		method: 'GET',
		url: location,
		encoding: null,
		headers: {
			Authorization: serverUtils.getRequestAuthorization(app.locals.server)
		}
	};
	// console.log(options);

	var request = require('./requestUtils.js').request;

	request.get(options, function (error, response, body) {
		if (error) {
			console.log('ERROR: request failed:');
			console.log(error);
			res.writeHead(response.statusCode, {});
			res.end();
			return;
		}

		if (response && response.statusCode === 200) {
			var contentType = response.headers.get('Content-Type');
			if (contentType) {
				// console.log(' - content type: ' + contentType);
				res.set('Content-Type', contentType);
			}
			res.write(body);
			res.end();
			return;
		} else {
			var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
			console.log('ERROR: request failed : ' + msg);
			res.writeHead(response.statusCode, {});
			res.end();
			return;
		}
	});
});

// Export the router
module.exports = router;