/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Router handling /sites requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router();

var console = require('./logger.js').console;

router.get('/*', (req, res) => {
	let location, app = req.app,
		requestUrl = req.originalUrl;

	console.info('>>> sites GET: ' + requestUrl);

	if (app.locals.server.env !== 'dev_ec' && !app.locals.server.oauthtoken) {
		console.error('No remote EC server access for remote traffic ', requestUrl);
		res.end();
		return;
	} else if (!app.locals.connectToServer) {
		console.error('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	location = app.locals.serverURL + requestUrl;
	console.info('Site Remote traffic:' + location);

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
			console.error('ERROR: request failed:');
			console.error(error);
			res.writeHead(response.statusCode, {});
			res.end();
			return;
		}

		var data;
		try {
			data = JSON.parse(body);
		} catch (e) {
			// error
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
			console.error('ERROR: request failed : ' + msg);
			if (data) {
				console.error(data);
			} else {
				console.error(body);
			}
			res.writeHead(response.statusCode, {});
			res.end();
			return;
		}
	});

});

//
// POST requests
//
router.post('/*', (req, res) => {
	console.log('>>> sites POST: ' + req.originalUrl + ' Not supported');
	res.writeHead(200, {});
	res.end();
});

// Export the router
module.exports = router;