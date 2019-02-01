/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global requirejs, console, mocha */

requirejs.config({
	'baseUrl': '.',

	paths: {
		'sitesMockAPI': '../public/js/sites.mock',
		'sitesMockData': '../public/js/sites.data',
		'jquery': '../sitescloud/renderer/app/apps/js/jquery.min',
		'knockout': '../sitescloud/renderer/app/apps/js/knockout.min',
		'text': '../../src/libs/requirejs-text/text',
		'css': '../../src/libs/require-css/css.min',
		'components': '../../src/main/components'
	},
	config: {}
});


requirejs(['Sample-To-Do-Test'], function() {
	"use strict";
	mocha.checkLeaks();
	mocha.globals(['jQuery']);
	mocha.run();
});


