/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals SCSRenderAPI, SCS */

define(['jquery', 'knockout'], function($, ko) {
	'use strict';
	var instance,
		Singleton = function() {};
   
	function getComponentName(url) {
		if (!url) {
			return;
		}
		//use anchro element to parse url
		var anchorEle = document.createElement('a'),
			//query parameters
			parameters = {},
			queries;
		// set the URL in the anchor, which will also parse it
		anchorEle.href = url;
		// anchorEle.search returns ?x=y&a=b... part of the url string
		queries = anchorEle.search.replace(/^\?/, '').split('&');
		for (var i = 0; i < queries.length; i++) {
			var split = queries[i].split('=');
			parameters[split[0]] = decodeURIComponent(split[1]);
		}

		var compNames = parameters.name ? parameters.name.split(',') : [];
		return compNames[0];
	}

	// Global for all components
	Singleton.prototype = {
		componentId: 'myUniqueComponentID',
		settingsURL: '../../components/' + getComponentName(location.href) + '/assets/settings.html',
		settingsHeight: '320',
		settingsWidth: '320',
		appSettingsHeight: '500',
		appSettingsWidth: '420',
		properties: {
			AssetsURL: '../../components/' + getComponentName(location.href) + '/assets',
			componentLayout: 'left',
			customSettingsData: {}
		}
	};

	return (instance = (instance || new Singleton()));
});
