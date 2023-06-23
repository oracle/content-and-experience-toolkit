/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
// mockup the Sites SDK messaging and API
define(['knockout', 'jquery', 'sitesMockData'],
	function (ko, $, sitesMockData) {
		'use strict';

		var getPropertyEvent = 'scsMockGetProperty',
			setPropertyEvent = 'scsMockSetProperty',
			subscriptions = {},
			MESSAGE_TYPES = {
				TRIGGER_ACTIONS: 'TRIGGER_ACTIONS',
				EXECUTE_ACTION: 'EXECUTE_ACTION',
				SETTINGS_UPDATED: 'SETTINGS_UPDATED',
				COPY_CUSTOM_DATA: 'COPY_CUSTOM_DATA',
				PASTE_CUSTOM_DATA: 'PASTE_CUSTOM_DATA'
			};

		// mock the Sites SDK messages
		var receiveMessage = function (event) {
			try {
				var data = JSON.parse(event.data);

				// Mock the getProperty Event
				if (data && data.eventName === getPropertyEvent) {
					console.log('Sites received event: ' + event.data);

					var getPropertyData = JSON.stringify({
						eventName: 'scsMockGetPropertyResponse',
						eventPayload: {
							propertyName: data.eventPayload.propertyName,
							propertyValue: sitesMockData.properties[data.eventPayload.propertyName] || ''
						}
					});

					// send back the property
					console.log('Sites responded with event: ' + getPropertyData);
					event.source.postMessage(getPropertyData, '*');
				}

				// Mock the setProperty Event
				if (data && data.eventName === setPropertyEvent) {
					console.log('Sites received event: ' + event.data);

					// store the data
					sitesMockData.properties[data.eventPayload.propertyName] = data.eventPayload.propertyValue;

					// handle callback noting that settings have changed
					if (typeof subscriptions[MESSAGE_TYPES.SETTINGS_UPDATED] === 'function') {
						console.log('Sites responded with: callback');
						subscriptions[MESSAGE_TYPES.SETTINGS_UPDATED]({
							property: data.eventPayload.propertyName,
							value: data.eventPayload.propertyValue
						});
					} else {
						var iframe = $('#sandbox1')[0],
							iframewindow = iframe.contentWindow || iframe.contentDocument.defaultView;
						if (iframewindow) {
							var settingsData = JSON.stringify({
								eventName: 'scsMockSettingsUpdatedResponse',
								eventPayload: {
									propertyName: data.eventPayload.propertyName,
									propertyValue: sitesMockData.properties[data.eventPayload.propertyName] || ''
								}
							});
							// posting to component
							iframewindow.postMessage(settingsData, '*');
						} else {
							console.log('Sites responded with: no callback');
						}
					}
				}
			} catch (e) {
				console.log('Sites ignored event: ' + e);
				console.log(event);
			}
		};
		window.addEventListener("message", receiveMessage, false);


		return {
			MESSAGE_TYPES: MESSAGE_TYPES,
			getProperty: function (propertyName, callback) {
				callback(sitesMockData.properties[propertyName]);
			},
			setProperty: function (propertyName, propertyValue) {
				sitesMockData.properties[propertyName] = propertyValue;
			},
			subscribe: function (name, callback) {
				subscriptions[name] = callback;
			},
			publish: function (args) {
				console.log('publish:');
				console.log(args);
			}
		};
	});
