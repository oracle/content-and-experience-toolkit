/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals browser */

var puppeteer = require('puppeteer'),
	chai = require('chai'),
	expect = chai.expect(),
	should = chai.should(),
	_ = require('lodash'),
	globalVariables = _.pick(global, ['browser', 'expect', 'should', 'serverConfig', 'testConfig']),
	testUtils = require('./utils/testUtils.js');

// Get test config values from the npm environment. e.g.:
// > npm run test --headless --remote
var testConfig = {
	headless: process.env.hasOwnProperty('npm_config_headless') ? process.env.npm_config_headless : false,
	remote: process.env.hasOwnProperty('npm_config_remote') ? process.env.npm_config_remote : false
};

// puppeteer options
const opts = {
	headless: testConfig.headless,
	slowMo: 100,
	timeout: 180000,
	ignoreHTTPSErrors: true,
	defaultViewport: {
		width: 1280,
		height: 960
	}
};

//
// global test setup
//
global.expect = expect;
global.should = should;
global.testConfig = testConfig;
global.serverConfig = testUtils.getServerConfig();

before(function (done) {
	this.timeout(180000);

	// bring up the browser to run the tests
	puppeteer
		.launch(opts)
		.then(function (browser) {
			global.browser = browser;
		}).then(function () {
			if (global.testConfig.remote) {
				// setup the server environment
				return testUtils.loginToServer(global.serverConfig);
			} else {
				// run with local test server
				global.serverConfig.url = "http://localhost:8085";
				return Promise.resolve();
			}
		}).then(function () {
			done();
		}).catch(function (e) {
			console.log(e);
			done(1);
		});
});

// global teardown
after(function () {
	// close the browser
	browser.close();

	// restore globals
	global.browser = globalVariables.browser;
	global.expect = globalVariables.expect;
	global.should = globalVariables.should;
	global.serverConfig = globalVariables.serverConfig;
	global.testConfig = globalVariables.testConfig;
});