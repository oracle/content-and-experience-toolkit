/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global requirejs, SCSRenderAPI */
(function () {

	'use strict';

	// main entry point into the JET app
	// This sets up the JET require.js configuration and then runs the JET code on the page
	var runApp = function () {

		// Identify the Theme URL for theme assets and the JET CDN version & URL
		var renderAPI = SCSRenderAPI,
			themeURLprefix = renderAPI.getThemeUrlPrefix(),
			JETVersion = 'v4.0.0', 
			CDNPrefix = 'https://static.oracle.com/cdn/jet/' + JETVersion;

		// Define the Require.js config entries to:
		// - include access to JS files from the theme
		// - include JET from CDN
		var JETConfig = {
				paths: {
					'context': 'JET' + JETVersion,

					// app specific end points
					'appController': themeURLprefix + '/assets/js/appController',

					// JET & dependencies
					'ojs': CDNPrefix + '/default/js/min',
					'ojL10n': CDNPrefix + '/default/js/ojL10n',
					'ojtranslations': CDNPrefix + '/default/js/resources',
					'signals': CDNPrefix + '/3rdparty/js-signals/signals.min',
					'promise': CDNPrefix + '/3rdparty/es6-promise/es6-promise.min',
					'ojdnd': CDNPrefix + '/3rdparty/dnd-polyfill/dnd-polyfill-1.0.0.min',
					'customElements': CDNPrefix + '/3rdparty/webcomponents/custom-elements.min',
					'hammerjs': CDNPrefix + '/3rdparty/hammer/hammer-2.0.8.min',
					'proj4js': CDNPrefix + '/3rdparty/proj4js/dist/proj4',
					'jqueryui-amd': CDNPrefix + '/3rdparty/jquery/jqueryui-amd-1.12.0.min'
				}
			},
			AltaCSS = CDNPrefix + '/default/css/alta/oj-alta-min.css'; // This is the main css file for the default Alta theme

		// create a JET require config context
		var jetRequireCtx = requirejs.config(JETConfig),
			requireModules = ['require',
				'knockout',
				'jquery',
				'appController',
				'ojs/ojcore',
				'ojs/ojknockout',
				'ojs/ojmodule',
				'ojs/ojnavigationlist',
				'ojs/ojbutton',
				'ojs/ojtoolbar',
				'css!' + AltaCSS
			];


		// require in all the dependencies and run the JET code
		jetRequireCtx(requireModules, function (require, ko, $, app, oj) {
			var init = function () {
				// NB: Content Management slots within the page will also want to call Knockout applyBindings() so only
				// apply the knockout bindings to your JET elements in the page layout
				// The corollary of this is that you can't have Content Management scs-slots within JET DOM elements
				var jetElementIDs = [
					/*
					'navDrawer',
					'pageNavigation',
					'pageFooter'
					*/
				];

				// apply bindings to the specific JET elements within the page layout
				jetElementIDs.forEach(function (elementID) {
					var domElement = document.getElementById(elementID);
					if (domElement) {
						ko.applyBindings(app, domElement);
					} else {
						console.log('Unable to apply bindings to element: ' + elementID);
					}
				});

				// since we're pulling in the Alta CSS dynamically, only fade in the body once it's loaded to avoid FOUC
				// this can be changed to statically add the CSS to the template and remove this step
				$('body').fadeTo('fast', 100);
			};

			// If running in a hybrid (e.g. Cordova) environment, we need to wait for the deviceready 
			// event before executing any code that might interact with Cordova APIs or plugins.
			if ($(document.body).hasClass('oj-hybrid')) {
				document.addEventListener("deviceready", init);
			} else {
				init();
			}
		});
	};



	// listen for when the renderer is about to start rendering the page and then run the JET app
	var START_RENDERING_EVENT = 'scsrenderstart';
	if (document.addEventListener) {
		document.addEventListener(START_RENDERING_EVENT, runApp, false);
	} else if (document.attachEvent) {
		document.documentElement.scsrenderstart = 0;
		document.documentElement.attachEvent('onpropertychange', function (event) {
			if (event && (event.propertyName === START_RENDERING_EVENT)) {
				runApp();
			}
		});
	}
}());
