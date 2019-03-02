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
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	fs = require('fs'),
	argv = require('yargs').argv,
	path = require('path'),
	url = require('url');

var projectDir = path.resolve(__dirname).replace(path.join('test', 'server'), '');

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

	console.log('@@@ Proxy Service: ' + req.url);

	if (req.url === '/') {
		console.log(' - no proxy service specified');
		res.end();
		return;
	}

	location = app.locals.serverURL + requestUrl;
	console.log('Remote traffic:', location);
	var options = {
		url: location
	};
	if (app.locals.server.env === 'pod_ec') {
		options['auth'] = {
			bearer: app.locals.server.oauthtoken
		};
	} else {
		options['auth'] = {
			user: app.locals.server.username,
			password: app.locals.server.password
		};
	}
	
	request(options).on('response', function (response) {
		// fix headers for cross-domain and capitalization issues
		serverUtils.fixHeaders(response, res);
	})
	.on('error', function (err) {
		console.log(' - proxy request error: ' + err);
		res.write({
			err: err
		});
		res.end();
	})
	.pipe(res)
	.on('finish', function () {
		// console.log(' - proxy request finished');
		res.end();
	});

});

// Export the router
module.exports = router;