/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals define */
define(['knockout', 'jquery'], function (ko, $) {
	'use strict';
	// ----------------------------------------------
	// Define a Knockout Template for your component
	// ----------------------------------------------
	var sampleComponentTemplate = '<!-- ko if: initialized -->' +
		'<!-- ko if: showStoryLayout -->' +
		'<!-- ko if: alignImage() === \'right\' -->' +
		'<div style="display:flex;">' +
		'	<div data-bind="attr: {style: paragraphStyle}">' +
		'		<scs-title params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'titleId\', \'data\': titleData } }"></scs-title>' +
		'		<scs-paragraph params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'paragraphId\', \'data\': paragraphData } }"></scs-paragraph>' +
		'	</div>' +
		'	<div data-bind="attr: {style: imageStyle, \'data-layout\': alignImage()}">' +
		'		<scs-image params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'imageId\', \'data\': imageData } }"></scs-image>' +
		'	</div>' +
		'</div>' +
		'<!-- /ko -->' +
		'<!-- ko if: alignImage() !== \'right\' -->' +
		'<div style="display:flex;">' +
		'	<div data-bind="attr: {style: imageStyle, \'data-layout\': alignImage()}, click: imageClicked">' +
		'		<scs-image params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'imageId\', \'data\': imageData } }"></scs-image>' +
		'	</div>' +
		'	<div data-bind="attr: {style: paragraphStyle}">' +
		'		<scs-title params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'titleId\', \'data\': titleData } }"></scs-title>' +
		'		<scs-paragraph params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'paragraphId\', \'data\': paragraphData } }"></scs-paragraph>' +
		'	</div>' +
		'</div>' +
		'<!-- /ko -->' +
		'<!-- /ko -->' +
		'<!-- ko if: showTopLayout -->' +
		'<div>' +
		'	<div data-bind="attr: {style: imageStyle, \'data-layout\': \'top\'}">' +
		'		<scs-image params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'imageId\', \'data\': imageData } }"></scs-image>' +
		'	</div>' +
		'	<div data-bind="attr: {style: paragraphStyle}">' +
		'		<scs-title params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'titleId\', \'data\': titleData } }"></scs-title>' +
		'		<scs-paragraph params="{ scsComponent: { \'renderMode\': mode, \'parentId\': id, \'id\': \'paragraphId\', \'data\': paragraphData } }"></scs-paragraph>' +
		'	</div>' +
		'</div>' +
		'<!-- /ko -->' +
		'<!-- /ko -->';


	// ----------------------------------------------
	// Define a Knockout ViewModel for your template
	// ----------------------------------------------
	var SampleComponentViewModel = function (args) {
		var self = this,
			SitesSDK = args.SitesSDK;

		// store the args
		self.mode = args.viewMode;
		self.id = args.id;

		// create the observables
		self.imageWidth = ko.observable('200px');
		self.alignImage = ko.observable();
		self.layout = ko.observable();
		self.showTopLayout = ko.observable();
		self.showStoryLayout = ko.observable();

		// handle initialization 
		self.componentLayoutInitialized = ko.observable(false);
		self.customSettingsDataInitialized = ko.observable(false);
		self.initialized = ko.computed(function () {
			return self.componentLayoutInitialized() && self.customSettingsDataInitialized();
		}, self);

		// Style on left- or right-aligned image
		self.imageStyle = ko.pureComputed(function () {
			var style;
			if (self.showTopLayout()) {
				style = '';
			} else {
				style = 'flex-shrink:0;width:' + self.imageWidth() + ';';
			}
			return style;
		});

		// Style around paragraph component
		self.paragraphStyle = ko.pureComputed(function () {
			var style;
			if (self.showTopLayout()) {
				style = '';
			} else {
				style = 'flex-grow:1;';
			}
			return style;
		});

		//
		// Raise the given trigger.
		//
		self.raiseTrigger = function (triggerName) {
			SitesSDK.publish(SitesSDK.MESSAGE_TYPES.TRIGGER_ACTIONS, {
				'triggerName': triggerName,
				'triggerPayload': {
					'payloadData': 'some data here'
				}
			});
		};

		// click binding
		self.imageClicked = function (data, event) {
			self.raiseTrigger("imageClicked"); // matches appinfo.json
		};


		// execute action handler
		self.executeActionsListener = function (args) {
			// get action and payload
			var payload = args.payload,
				action = args.action;

			// handle 'setImageWidth' actions
			if (action && action.actionName === 'setImageWidth') {
				$.each(payload, function(index, data) {
					if (data.name === 'imageWidth') {
						self.imageWidth(data.value);
					}
				});
			}
		};

		//
		// Seed nested component data
		//
		self.imageData = {
		};
		self.titleData = {
		};
		self.paragraphData = {
		};

		// 
		// Handle property changes
		//
		self.updateComponentLayout = $.proxy(function (componentLayout) {
			var layout = componentLayout ? componentLayout : 'default';
			self.layout(layout);
			self.alignImage(layout === 'right' ? 'right' : 'left');
			self.showTopLayout(layout === 'top');
			self.showStoryLayout(layout === 'default' || layout === 'right');

			self.componentLayoutInitialized(true);
		}, self);
		self.updateCustomSettingsData = $.proxy(function (customData) {
			self.imageWidth(customData && customData.width);
			self.customSettingsDataInitialized(true);
		}, self);
		self.updateSettings = function (settings) {
			if (settings.property === 'componentLayout') {
				self.updateComponentLayout(settings.value);
			} else if (settings.property === 'customSettingsData') {
				self.updateCustomSettingsData(settings.value);
			}
		};

		// listen for the EXECUTE ACTION request to handle custom actions
		SitesSDK.subscribe(SitesSDK.MESSAGE_TYPES.EXECUTE_ACTION, $.proxy(self.executeActionsListener, self));
		// listen for settings update
		SitesSDK.subscribe(SitesSDK.MESSAGE_TYPES.SETTINGS_UPDATED, $.proxy(self.updateSettings, self));

		//
		// Initialize the componentLayout & customSettingsData values
		//
		SitesSDK.getProperty('componentLayout', self.updateComponentLayout);
		SitesSDK.getProperty('customSettingsData', self.updateCustomSettingsData);
	};


	// ----------------------------------------------
	// Create a knockout based component implemention
	// ----------------------------------------------
	var SampleComponentImpl = function (args) {
		// Initialze the custom component
		this.init(args);
	};
	// initialize all the values within the component from the given argument values
	SampleComponentImpl.prototype.init = function (args) {
		this.createViewModel(args);
		this.createTemplate(args);
		this.setupCallbacks();
	};
	// create the viewModel from the initial values
	SampleComponentImpl.prototype.createViewModel = function (args) {
		// create the viewModel
		this.viewModel = new SampleComponentViewModel(args);
	};
	// create the template based on the initial values
	SampleComponentImpl.prototype.createTemplate = function (args) {
		// create a unique ID for the div to add, this will be passed to the callback
		this.contentId = args.id + '_content_' + args.mode;
		// create a hidden custom component template that can be added to the DOM
		this.template = '<div id="' + this.contentId + '">' +
			sampleComponentTemplate +
			'</div>';
	};
	//
	// SDK Callbacks
	// setup the callbacks expected by the SDK API
	//
	SampleComponentImpl.prototype.setupCallbacks = function () {
		//
		// callback - render: add the component into the page
		//
		this.render = $.proxy(function (container) {
			var $container = $(container);
			// add the custom component template to the DOM
			$container.append(this.template);
			// apply the bindings
			ko.applyBindings(this.viewModel, $('#' + this.contentId)[0]);
		}, this);
		//
		// callback - update: handle property change event
		//
		this.update = $.proxy(function (args) {
			var self = this;
			// deal with each property changed
			$.each(args.properties, function (index, property) {
				if (property) {
					if (property.name === 'customSettingsData') {
						self.viewModel.updateComponentData(property.value);
					} else if (property.name === 'componentLayout') {
						self.viewModel.updateLayout(property.value);
					}
				}
			});
		}, this);
		//
		// callback - dispose: cleanup after component when it is removed from the page
		//
		this.dispose = $.proxy(function () {
			// nothing required for this sample since knockout disposal will automatically clean up the node
		}, this);
	};
	// ----------------------------------------------
	// Create the factory object for your component
	// ----------------------------------------------
	var sampleComponentFactory = {
		createComponent: function (args, callback) {
			// return a new instance of the component
			return callback(new SampleComponentImpl(args));
		}
	};
	return sampleComponentFactory;
});
