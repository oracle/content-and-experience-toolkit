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

var styleClasses = ['left', 'right'];

var SectionLayout = function (componentId, componentInstanceObject, componentsFolder) {
	this.componentId = componentId;
	this.componentInstanceObject = componentInstanceObject;
	this.componentsFolder = componentsFolder;
};
SectionLayout.prototype = {
	compile: function () {
		var html = '';

		var idPrefix = 'sl-two-columns-' + this.componentId;
		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};
		var config = slData.customSettingsData || {};

		try {
			html += '<style>';

			if (typeof config.columnWidth1 === 'number') {
				html += '#' + idPrefix + ' > .sl-two-columns-left { flex: 0 0 ' + config.columnWidth1 + '%; } ';
			} else {
				html += '#' + idPrefix + ' > .sl-two-columns-left { flex: 1; } ';
			}

			if (typeof config.columnWidth2 === 'number') {
				html += '#' + idPrefix + ' > .sl-two-columns-right { flex: 0 0 ' + config.columnWidth2 + '%; } ';
			} else {
				html += '#' + idPrefix + ' > .sl-two-columns-right { flex: 1; } ';
			}

			if ((config.breakpoint > 0) && config.behavior) {
				html += '@media screen and (max-width: ' + config.breakpoint + 'px) {';

				switch (config.behavior) {
					case 'stack12':
						html += '#' + idPrefix + ' { flex-wrap: wrap; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-left { flex: 0 0 100%; order: 1; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-right { flex: 0 0 100%; order: 2; } ';
						break;

					case 'stack21':
						html += '#' + idPrefix + ' { flex-wrap: wrap; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-left { flex: 0 0 100%; order: 2; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-right { flex: 0 0 100%; order: 1; } ';
						break;

					case 'hide1':
						html += '#' + idPrefix + ' > .sl-two-columns-left { display: none; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-right { flex: 0 0 100%; } ';
						break;

					case 'hide2':
						html += '#' + idPrefix + ' > .sl-two-columns-left { flex: 0 0 100%; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-right { display: none; } ';
						break;

					case 'hide12':
						html += '#' + idPrefix + ' > .sl-two-columns-left { display: none; } ';
						html += '#' + idPrefix + ' > .sl-two-columns-right { display: none; } ';
						break;
				}

				html += '}';
			}
			html += '</style>';

			// Emit the columns and the components therein
			html += '<div class="sl-two-columns" id="' + idPrefix + '">';
			styleClasses.forEach(function (styleClass, styleIndex) {
				html += '<div id="' + idPrefix + styleClass + '" class="sl-two-columns-' + styleClass + '">';

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