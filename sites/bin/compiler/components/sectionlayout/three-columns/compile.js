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

var styleClasses = ['left', 'center', 'right'];

var SectionLayout = function (componentId, componentInstanceObject, componentsFolder) {
	this.componentId = componentId;
	this.componentInstanceObject = componentInstanceObject;
	this.componentsFolder = componentsFolder;
};
SectionLayout.prototype = {
	compile: function () {
		var html = '';

		var idPrefix = 'sl-three-columns-' + this.componentId;
		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};
		var config = slData.customSettingsData || {};

		try {
			html += '<style>';

			if (typeof config.columnWidth1 === 'number') {
				html += '#' + idPrefix + ' > .sl-three-columns-left { flex: 0 0 ' + config.columnWidth1 + '%; } ';
			} else {
				html += '#' + idPrefix + ' > .sl-three-columns-left { flex: 1; } ';
			}

			if (typeof config.columnWidth2 === 'number') {
				html += '#' + idPrefix + ' > .sl-three-columns-center { flex: 0 0 ' + config.columnWidth2 + '%; } ';
			} else {
				html += '#' + idPrefix + ' > .sl-three-columns-center { flex: 1; } ';
			}

			if (typeof config.columnWidth3 === 'number') {
				html += '#' + idPrefix + ' > .sl-three-columns-right { flex: 0 0 ' + config.columnWidth3 + '%; } ';
			} else {
				html += '#' + idPrefix + ' > .sl-three-columns-right { flex: 1; } ';
			}

			if (config.breakpoint > 0) {
				html += '@media screen and (max-width: ' + config.breakpoint + 'px) {';

				if (config.stackColumns) {
					html += '#' + idPrefix + ' { flex-wrap: wrap; } ';
					html += '#' + idPrefix + ' > .sl-three-columns-left { flex: 0 0 100%; } ';
					html += '#' + idPrefix + ' > .sl-three-columns-center { flex: 0 0 100%; } ';
					html += '#' + idPrefix + ' > .sl-three-columns-right { flex: 0 0 100%; } ';
				}
				if (config.hideColumn1) {
					html += '#' + idPrefix + ' > .sl-three-columns-left { display: none; } ';
				}
				if (config.hideColumn2) {
					html += '#' + idPrefix + ' > .sl-three-columns-center { display: none; } ';
				}
				if (config.hideColumn3) {
					html += '#' + idPrefix + ' > .sl-three-columns-right { display: none; } ';
				}

				html += '}';
			}
			html += '</style>';

			// Emit the columns and the components therein
			html += '<div class="sl-three-columns" id="' + idPrefix + '">';
			styleClasses.forEach(function (styleClass, styleIndex) {
				html += '<div id="' + idPrefix + styleClass + '" class="sl-three-columns-' + styleClass + '">';

				// Add in the child components that belong to this column
				(slData.components || []).forEach(function (childComponentId, childComponentIndex) {
					if ((childComponentIndex % styleClasses.length) === styleIndex) {
						html += '<div id="' + childComponentId + '"></div>';
					}
				});

				html += '</div>';
			});
			html += '</div>';

		} catch (e) {
			console.error(e);
			html = '';
		}

		return Promise.resolve({
			content: html,
			componentIds: (html && slData.components && (slData.components.length > 0)) ? slData.components : null
		});
	}
};

module.exports = SectionLayout;