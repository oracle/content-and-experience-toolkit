/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals define, console */
/* jshint esversion: 6*/
define(['knockout', 'jquery', 'css!./styles/design.css', 'text!./template.html'], function(ko, $, css, sampleComponentTemplate) {
	'use strict';
	// ----------------------------------------------
	// Define a Knockout Template for your component
	// ----------------------------------------------
	// ./template.html contains the template


	// ----------------------------------------------
	// Define a Knockout ViewModel for your template
	// ----------------------------------------------
	var SampleComponentViewModel = function(args) {
		var self = this,
			SitesSDK = args.SitesSDK;

		self.STORAGE_KEY = 'todo_sample_cec';    

		// store the args
		self.mode = args.viewMode;
		self.id = args.id;

		var ToDo = function(desc, completed) {
			this.desc = ko.observable(desc);
			this.completed = ko.observable(completed);

		};

		// create the observables
		self.title = ko.observable('To-Do');
		self.placeholder = ko.observable('Enter a task');
		self.alignImage = ko.observable();
		self.layout = ko.observable();

		// todo list
		self.todo = ko.observableArray((function() {
			var deserialized = JSON.parse(window.localStorage.getItem(self.STORAGE_KEY));
			var items = [];
			if (deserialized) {
				for (var i=0; i< deserialized.length; i++) {
					items.push(new ToDo(deserialized[i].desc, deserialized[i].completed));
				}
			}
			return items;
		})());

		// add a item to the todo list
		self.add = function(desc) {
			self.todo.push(new ToDo(desc, false));
		};

		self.delete = function(item) {
			self.todo.remove(item);
		};


		self.hasCompleted = ko.computed(function() {
			var completedItems = self.todo().filter(function(item) {
				return item.completed();
			});
			if (completedItems && completedItems.length > 0) {
				return true;
			}
			return false;
		});

		self.deleteCompleted = function() {
			self.todo.remove(function(item) {
				return item.completed();
			});
		};

		self.getItem = function(desc) {
			for (var i=0; i< self.todo().length; i++) {
				if(self.todo()[i].desc() === desc) {
					return self.todo()[i];
				}
			}
		};

		self.handleKeyPress = function (data, event) {
			if(event.key === 13 || event.which === 13) {
				var val = $('.to-do-container .new').val();
				self.add(val);
				$('.to-do-container .new').val('');
				return false;
			} else {
				return true;
			}
		};

		ko.computed(function() {
			window.localStorage.setItem(self.STORAGE_KEY, ko.toJSON(self.todo));
		});

		// handle initialization 
		self.componentLayoutInitialized = ko.observable(false);
		self.customSettingsDataInitialized = ko.observable(false);
		self.initialized = ko.computed(function() {
			return self.componentLayoutInitialized() && self.customSettingsDataInitialized();
		}, self);

		//
		// Raise the given trigger.
		//
		self.raiseTrigger = function(triggerName) {
			SitesSDK.publish(SitesSDK.MESSAGE_TYPES.TRIGGER_ACTIONS, {
				'triggerName': triggerName,
				'triggerPayload': {
					'payloadData': 'some data here'
				}
			});
		};

		// Handle property changes
		//
		self.updateComponentLayout = $.proxy(function(componentLayout) {
			var layout = componentLayout ? componentLayout : 'default';
			self.layout(layout);
			self.alignImage(layout === 'right' ? 'right' : 'left');
			self.componentLayoutInitialized(true);
		}, self);
		self.updateCustomSettingsData = $.proxy(function(customData) {
			var title = customData && customData.title;
			self.title(title ? title: 'To-Do');

			var placeholder = customData && customData.placeholder;
			self.placeholder(placeholder ? placeholder : 'Enter a task');

			self.customSettingsDataInitialized(true);
		}, self);
		self.updateSettings = function(settings) {
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


		// listen for COPY_CUSTOM_DATA request
		SitesSDK.subscribe(SitesSDK.MESSAGE_TYPES.COPY_CUSTOM_DATA, $.proxy(self.copyComponentCustomData, self));

		// listen for PASTE_CUSTOM_DATA request
		SitesSDK.subscribe(SitesSDK.MESSAGE_TYPES.PASTE_CUSTOM_DATA, $.proxy(self.pasteComponentCustomData, self));

		//
		// Initialize the componentLayout & customSettingsData values
		//
		SitesSDK.getProperty('componentLayout', self.updateComponentLayout);
		SitesSDK.getProperty('customSettingsData', self.updateCustomSettingsData);
	};


	// ----------------------------------------------
	// Create a knockout based component implemention
	// ----------------------------------------------
	var SampleComponentImpl = function(args) {
		// Initialze the custom component
		this.init(args);
	};
	// initialize all the values within the component from the given argument values
	SampleComponentImpl.prototype.init = function(args) {
		this.createViewModel(args);
		this.createTemplate(args);
		this.setupCallbacks();
	};
	// create the viewModel from the initial values
	SampleComponentImpl.prototype.createViewModel = function(args) {
		// create the viewModel
		this.viewModel = new SampleComponentViewModel(args);
	};
	// create the template based on the initial values
	SampleComponentImpl.prototype.createTemplate = function(args) {
		// create a unique ID for the div to add, this will be passed to the callback
		this.contentId = args.id + '_content_' + args.viewMode;
		// create a hidden custom component template that can be added to the DOM
		this.template = '<div id="' + this.contentId + '">' +
			sampleComponentTemplate +
			'</div>';
	};
	//
	// SDK Callbacks
	// setup the callbacks expected by the SDK API
	//
	SampleComponentImpl.prototype.setupCallbacks = function() {
		//
		// callback - render: add the component into the page
		//
		this.render = $.proxy(function(container) {
			var $container = $(container);
			// add the custom component template to the DOM
			$container.append(this.template);
			// apply the bindings
			ko.applyBindings(this.viewModel, $('#' + this.contentId)[0]);
		}, this);
		//
		// callback - dispose: cleanup after component when it is removed from the page
		//
		this.dispose = $.proxy(function() {
			// nothing required for this sample since knockout disposal will automatically clean up the node
		}, this);
	};
	// ----------------------------------------------
	// Create the factory object for your component
	// ----------------------------------------------
	var sampleComponentFactory = {
		createComponent: function(args, callback) {
			// return a new instance of the component
			return callback(new SampleComponentImpl(args));
		}
	};
	return sampleComponentFactory;
});
