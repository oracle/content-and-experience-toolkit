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

var SectionLayout = function (componentId, componentInstanceObject, componentsFolder) {
	this.componentId = componentId;
	this.componentInstanceObject = componentInstanceObject;
	this.componentsFolder = componentsFolder;
};
SectionLayout.prototype = {
	compile: function () {
		var html = '';

		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};

		try {
			// Add the child components to the section layout.  For each of the child 
			// components, add a <div> to the page.  The child components will be 
			// rendered into these <div>s.
			if (Array.isArray(slData.components) && (slData.components.length > 0)) {
				slData.components.forEach(function (componentId) {
					html += '<div id="' + componentId + '"></div>';
				});
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