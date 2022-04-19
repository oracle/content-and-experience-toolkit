/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 * This unpublished work by Oracle is protected by the laws
 * of the United States and other countries. If publication
 * of this computer program should occur, the following notice
 * shall apply:
 *
 * Copyright (c) 2019 Oracle Corp.
 * All rights reserved.
 *
 * $Id: componentgroup.js 167153 2019-01-25 21:29:15Z dpeterso $
 */
var fs = require('fs'),
	path = require('path'),
	cheerio = require('cheerio');

var compilationReporter = require('../../reporter.js');

var applyStyles = function ($div, cgData) {
	var settings = cgData;
	var css = {};
	var name,
		value;

	// For numeric css values (only), ensure they have the suffix "px"
	var toPixelValue = function (value) {
		value = "" + value;
		if (value.match(/^[0-9]+$/)) {
			value += "px";
		}

		return value;
	};

	if (settings) {
		if ((settings.useStyleClass === true) ||
			((typeof settings.useStyleClass === 'string') && ('TRUE' === settings.useStyleClass.toUpperCase()))) {
			if (settings.styleClass && (typeof settings.styleClass === 'string')) {
				$div.addClass(settings.styleClass);
			}
		} else {
			for (name in settings) {
				if (name && (typeof name === 'string') &&
					Object.prototype.hasOwnProperty.call(settings, name) &&
					(0 === name.indexOf('border'))) {
					value = settings[name];
					name = ('border-' + name.substring('border'.length)).toLowerCase();
					css[name] = toPixelValue(value);
				}
			}

			$div.css(css);
		}
	}
};

var ComponentGroup = function (componentId, componentInstanceObject, filePath) {
	this.componentId = componentId;
	this.data = (componentInstanceObject && componentInstanceObject.data) || {};

	this.grid = this.data.grid;
	this.components = this.data.components || [];
	this.className = this.data.className;
};

ComponentGroup.prototype = {
	compile: function () {
		var content;

		// Set the class style for the component group
		var parentClasses = ['scs-componentgroup'];

		if (this.className && (typeof this.className === 'string')) {
			parentClasses.push(this.className);
		}

		if (this.grid && (typeof this.grid === 'string')) {
			var $ = cheerio.load('<div>');

			// Add the grid to the DOM - Add an extra <div> here so we can successfully call .html() in a few moments
			var $grid = $('<div><div class="scs-container-styles"><div class="scs-component-content"></div></div><div>');
			applyStyles($grid.find('.scs-container-styles'), this.data);

			// Provide a viewModel to handle show/hide page actions from other components
			var isMobile = false; // renderAPI.getDeviceInfo().isMobile;
			var visibleIsFalse = (this.data.visible === false);
			var isVisible = (isMobile && (typeof this.data.visibleOnMobile === 'boolean')) ?
				this.data.visibleOnMobile :
				!visibleIsFalse;
			if (!isVisible) {
				$grid.find('.scs-container-styles').css('display', 'none');
			}

			$grid.find('.scs-component-content').append($(this.grid));
			content = $grid.html();
		}

		return Promise.resolve({
			hydrate: false,
			componentIds: this.components,
			parentClasses: parentClasses,
			omitBoundingBox: true,
			content: content
		});
	}
};

module.exports = ComponentGroup;
