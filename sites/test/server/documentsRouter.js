/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Router handling /documents requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router();

var console = require('./logger.js').console;

router.get('/*', (req, res) => {
	let location, app = req.app,
		request = app.locals.request,
		requestUrl = req.originalUrl;

	if (app.locals.server.env !== 'dev_ec' && !app.locals.server.oauthtoken) {
		console.error('No remote EC server access for remote traffic ' + requestUrl);
		res.end();
		return;
	} else if (!app.locals.connectToServer) {
		console.error('No remote server for remote traffic ' + requestUrl);
		res.end();
		return;
	}

	console.info('^^^ Document: ' + req.url);

	var options = {};
	if (app.locals.server.oauthtoken) {
		options['auth'] = {
			bearer: app.locals.server.oauthtoken
		};
	} else {
		options['auth'] = {
			user: app.locals.server.username,
			password: app.locals.server.password
		};
	}
	// For embedded pages, rewrite url
	if (requestUrl.indexOf('/documents/embed') > -1 || requestUrl.indexOf('/documents/ssoembed') > -1) {
		requestUrl = app.locals.serverURL + requestUrl;
		console.info('Remote traffic embed :' + requestUrl);
		options.url = requestUrl;

		req.pipe(request(options)).pipe(res);

	} else {
		if (requestUrl.indexOf('/content/published/api') > -1) {
			// change to not use the published APIs which require access token
			requestUrl = requestUrl.replace('/published/', '/management/');
		}
		location = app.locals.serverURL + requestUrl;

		if (app.locals.server.env === 'dev_ec') {
			location = location.replace('/web?', '/integration?');
			if (location.indexOf('IsJson=1') < 0) {
				location = location + '&IsJson=1';
			}
		}

		console.info('Remote traffic: ' + location);
		options.url = location;

		// console.log(options);
		request(options).on('response', function (response) {
			// fix headers for cross-domain and capitalization issues
			serverUtils.fixHeaders(response, res);
		}).pipe(res);
	}
});

router.post('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request,
		requestUrl = req.originalUrl;

	if (!app.locals.connectToServer) {
		console.error('No remote server for remote traffic ' + requestUrl);
		res.end();
		return;
	}
	console.info('^^^ Document: ' + req.url);

	// all POST requests are proxied to the remote server
	console.info('Remote traffic: POST ' + requestUrl);
	var body = '';

	req.on('error', function (err) {
		console.error('err: ' + err);
	});

	req.on('data', function (data) {
		body += data;
	});

	var authvalue = {
		user: app.locals.server.username,
		password: app.locals.server.password
	};
	if (app.locals.server.env !== 'dev_ec') {
		// external compute pod
		authvalue = {
			bearer: app.locals.server.oauthtoken
		};
	}

	req.on('end', function () {
		var url = require('url'),
			queryString = url.parse(requestUrl, true),
			postData = {
				method: 'POST',
				url: app.locals.serverURL + requestUrl,
				'auth': authvalue
			};

		if (requestUrl.indexOf('/documents/api/') >= 0) {
			var urlstr = requestUrl,
				params = queryString.query;
			console.info(' document api: url=' + urlstr + ' params=' + JSON.stringify(params));
		} else if (queryString.query && queryString.query.IsJson === '1') {
			// body contains json data
			postData.json = true;
			postData.body = JSON.parse(body);
		} else if (requestUrl.indexOf('/osn/fc/RemoteJSONBatch') >= 0) {
			postData.json = true;
			postData.body = JSON.parse(body);
		} else {
			// body contains URL-encoded form data
			postData.form = body;
		}

		if (typeof body == 'string' && typeof JSON.parse(body) == 'object') {
			postData.json = true
			postData.body = JSON.parse(body)
		}

		console.log(' postData=' + JSON.stringify(postData));
		request(postData).on('response', function (response) {
			// fix headers for cross-domain and capitalization issues
			serverUtils.fixHeaders(response, res);
		}).pipe(res);
	});
});

// Export the router
module.exports = router;
