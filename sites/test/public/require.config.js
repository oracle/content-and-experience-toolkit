/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

requirejs.config({
	'baseUrl': '.',

	paths: {
		'sitesMockAPI': './js/sites.mock',
		'sitesMockData': './js/sites.data',
		'sitesComponents': '../../components',
		'jquery': '/_sitescloud/renderer/app/apps/js/jquery.min',
		'knockout': '/_sitescloud/renderer/app/apps/js/knockout.min',
		'text': '../../../libs/requirejs-text/text',
		'css': '../../../libs/require-css/css.min'
	},
	config: {}
});



// kickoff rendering of the component
requirejs(['require', 'jquery', 'knockout', 'sitesMockAPI', 'sitesMockData'], function(require, $, ko, sitesMockAPI, sitesMockData) {
	"use strict";

	// settings pane setup handler
	ko.bindingHandlers.settingsPane = {
		init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {}
	};

	function getComponentName(url) {
	//use anchro element to parse url
		var anchorEle = document.createElement('a'),
			//query parameters
			parameters = {},
			queries;
		// set the URL in the anchor, which will also parse it
		anchorEle.href = url;
		// anchorEle.search returns ?x=y&a=b... part of the url string
		queries = anchorEle.search.replace(/^\?/, '').split('&');
		for (let i = 0; i < queries.length; i++) {
			var split = queries[i].split('=');
			parameters[split[0]] = decodeURIComponent(split[1]);
		}

		var compNames = parameters.name.split(',');
		return compNames[0];
	}

	var ViewModel = function(data) {
	// initialize the settings panel
		this.componentId = ko.observable(getComponentName(location.href));
		this.settingsUrl = ko.observable('../../components/' + this.componentId() + '/assets/settings.html');
		this.settingsHeight = ko.observable(data.settingsHeight);
		this.settingsWidth = ko.observable(data.settingsWidth);
		this.showSettings = ko.observable(true);
		this.sandboxComponentURL = ko.observable('');
		this.mainPage = function() {
			window.location = '/';
		};
		this.componentsPage = function() {
			window.location = '/public/components';
		};

		if (this.componentId() === 'Sample-Documents-Manager' || this.componentId() === 'Sample-Folder-List' ||
		this.componentId() === 'Sample-File-List' ||
		this.componentId() === 'Sample-Process-Start-Form' || this.componentId() === 'Sample-Process-Task-List' ||
		this.componentId() === 'Sample-Process-Task-Details') {
			this.sandboxComponentURL('../../components/' + this.componentId() + '/assets/render.html');
			this.settingsWidth(data.appSettingsWidth);
			this.settingsHeight(data.appSettingsHeight);
			console.log(this.sandboxComponentURL());
			return;
		}

		// require in the component factory
		require(['sitesComponents/' + this.componentId() + '/assets/render'], function(compFactory) {
			var compArgs = {
				SitesSDK: sitesMockAPI,
				mode: data.viewMode,
				id: data.componentId
			};

			// create a new component
			compFactory.createComponent(compArgs, function(newComp) {
			// render the component into the page
				newComp.render($('#componentsPane')[0]);
			});
		});
	};

	// kickoff rendering the page
	ko.applyBindings(new ViewModel(sitesMockData));
});
