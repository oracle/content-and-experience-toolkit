/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals app, module */
/* jshint esversion: 6 */
/**
 * Router handling /documents requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	fs = require('fs'),
	FormData = require('form-data'),
	router = express.Router(),
	url = require('url');

router.get('/*', (req, res) => {
	let location, app = req.app,
		request = app.locals.request,
		requestUrl = req.originalUrl;

	if (app.locals.server.env === 'pod_ec' && !app.locals.server.oauthtoken) {
		console.log('No remote EC server access for remote traffic ', requestUrl);
		res.end();
		return;
	} else if (!app.locals.connectToServer) {
		console.log('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}


	// For embedded pages, rewrite url
	if (requestUrl.indexOf('/documents/embed') > -1 || requestUrl.indexOf('/documents/ssoembed') > -1) {
		requestUrl = app.locals.serverURL + requestUrl;
		console.log('Remote traffic embed :', requestUrl);
		var options = {
			url: requestUrl
		};
		if (app.locals.server.env === 'pod_ec') {
			options['auth'] = {
				bearer: app.locals.server.oauthtoken
			};
		}
		req.pipe(request(options)).pipe(res);
	} else {
		if (requestUrl.indexOf('/content/published/api') > -1) {
			// change to not use the published APIs which require access token
			requestUrl = requestUrl.replace('/published/', '/management/');
		}
		location = app.locals.serverURL + requestUrl;
		console.log('Remote traffic:', location);
		var options = {
			url: location
		};
		if (location.indexOf('8080') > 0) {
			// external compute gemini
			options['auth'] = {
				user: app.locals.server.username,
				password: app.locals.server.password
			};
		} else if (app.locals.server.env === 'pod_ec') {
			// external compute pod
			options['auth'] = {
				bearer: app.locals.server.oauthtoken
			};
		}

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
		console.log('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	// all POST requests are proxied to the remote server
	console.log('Remote traffic: POST ', requestUrl);
	var body = '';

	req.on('error', function (err) {
		console.log('err: ' + err);
	});

	req.on('data', function (data) {
		body += data;
	});

	var authvalue = {
		user: app.locals.server.username,
		password: app.locals.server.password
	};
	if (app.locals.server.env === 'pod_ec') {
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
			var url = requestUrl,
				params = queryString.query;
			console.log(' document api: url=' + url + ' params=' + JSON.stringify(params));
		} else if (queryString.query && queryString.query.IsJson === '1') {
			// body contains json data
			postData.json = true;
			postData.body = JSON.parse(body);
		} else {
			// body contains URL-encoded form data
			postData.form = body;
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
