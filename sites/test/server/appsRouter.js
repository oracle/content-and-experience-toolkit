/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Router handling server side /renderer/app/apps/ requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	url = require('url');

router.get('/*', (req, res) => {
	let location, app = req.app,
		requestUrl = req.originalUrl;

	console.log('~~~ Apps GET: ' + req.url);

	if (!app.locals.connectToServer) {
		console.log('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	location = app.locals.serverURL + (requestUrl.indexOf('/_sitescloud') == 0 ? requestUrl : '/_sitescloud' + requestUrl);
	console.log('Apps Remote traffic: path=' + requestUrl + ' remote=' + location);

	var options = {
		url: location,
		headers: {
			Authorization: serverUtils.getRequestAuthorization(app.locals.server)
		},
		encoding: null
	};

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

router.post('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request,
		requestUrl = req.originalUrl;

	console.log('~~~ Apps POST: ' + req.url);

	if (!app.locals.connectToServer) {
		console.log('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	// all POST requests are proxied to the remote server
	console.log('Apps Remote traffic: POST ', requestUrl);
	var body = '';

	req.on('error', function (err) {
		console.log('err: ' + err);
	});

	req.on('data', function (data) {
		body += data;
	});

	req.on('end', function () {
		var url = require('url'),
			queryString = url.parse(requestUrl, true),
			postData = {
				method: 'POST',
				url: app.locals.serverURL + requestUrl
			};

		// if the query contains IsJson=1, then the body contains json data
		if (queryString.query && queryString.query.IsJson === '1') {
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