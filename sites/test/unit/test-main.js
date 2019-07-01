/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global requirejs, console, mocha */

$.getJSON('/getsrcfolder', function (data) {
	'use strict';

	var srcfolder = data.srcfolder;
	var libfolder = data.libsfolder;

	requirejs.config({
		'baseUrl': '.',

		paths: {
			'sitesMockAPI': '../public/js/sites.mock',
			'sitesMockData': '../public/js/sites.data',
			'jquery': '../sitescloud/renderer/app/apps/js/jquery.min',
			'knockout': '../sitescloud/renderer/app/apps/js/knockout.min',
			'text': '../../' + libfolder + '/requirejs-text/text',
			'css': '../../' + libfolder + '/require-css/css.min',
			'components': '../../' + srcfolder + '/components'
		},
		config: {}
	});

	requirejs(['Sample-To-Do-Test'], function () {
		mocha.checkLeaks();
		mocha.globals(['jQuery']);
		mocha.run();
	});

});