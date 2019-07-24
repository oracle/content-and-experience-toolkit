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
 * $Id: compile.js 167153 2019-01-25 21:29:15Z dpeterso $
 */
var fs = require('fs'),
	path = require('path');

var isValidWidth = function (value) {
	var widthRegEx = /^\\s*(([+-]?([0-9]+|[0-9]*\\.[0-9]+)(cap|ch|em|ex|ic|lh|rem|rlh|vh|vw|vi|vb|vmin|vmax|px|cm|mm|Q|in|pc|pt))|auto|0|([+]?([0-9]+|[0-9]*\\.[0-9]+)%))\\s*$/;
	var isValid = (typeof value === 'string') && widthRegEx.test(value);
	return isValid;
};

var SectionLayout = function (componentId, componentInstanceObject, componentsFolder) {
	this.componentId = componentId;
	this.componentInstanceObject = componentInstanceObject;
	this.componentsFolder = componentsFolder;
};
SectionLayout.prototype = {
	compile: function (compileData) {
		var html = '';
		var itemWidth;
		var alignment;

		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};
		var config = slData.customSettingsData || {};

		try {
			// Add the child components to the section layout.  For each of the child 
			// components, add a <div> to the page.  The child components will be 
			// rendered into these <div>s.
			if (Array.isArray(slData.components) && (slData.components.length > 0)) {

				// Add <style> tags for the standard and  responsive settings
				html += '<style>';
				alignment = config.itemAlignment || 'left';
				if (isValidWidth(itemWidth = config.itemWidth)) {
					html += '#' + this.componentId + ' > .scs-container-styles > .scs-component-content > .sl-horizontal-row { display: block; text-align: ' + alignment + '; } ';
					html += '#' + this.componentId + ' > .scs-container-styles > .scs-component-content > .sl-horizontal-row > .sl-horizontal-item { display: inline-block; vertical-align: top; width: ' + itemWidth + '; }';
				}

				if (config.breakpoint > 0) {
					html += '@media screen and (max-width: ' + config.breakpoint + 'px) {';

					alignment = config.responsiveItemAlignment || config.itemAlignment || 'left';
					if (isValidWidth(itemWidth = config.responsiveItemWidth)) {
						html += '#' + this.componentId + ' > .scs-container-styles > .scs-component-content > .sl-horizontal-row { display: block; text-align: ' + alignment + '; } ';
						html += '#' + this.componentId + ' > .scs-container-styles > .scs-component-content > .sl-horizontal-row > .sl-horizontal-item { display: inline-block; vertical-align: top; width: ' + itemWidth + '; }';
					}

					html += '}';
				}
				html += '</style>';


				html += '<div class="sl-horizontal-row">';

				slData.components.forEach(function (componentId) {
					html += '<div class="sl-horizontal-item"><div id="' + componentId + '"></div></div>';
				});

				html += '</div>';
			}
		} catch (e) {
			console.error(e);
			html = '';
		}

		return Promise.resolve({
			content: html
		});
	}
};

module.exports = SectionLayout;


