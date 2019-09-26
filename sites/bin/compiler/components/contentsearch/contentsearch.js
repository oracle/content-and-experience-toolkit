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
 * Copyright (c) 2014 Oracle Corp.
 * All rights reserved.
 *
 * $Id: base-vm.js 167153 2019-01-25 21:29:15Z muralik $
 */
var fs = require('fs'),
	path = require('path'),
	Base = require(path.normalize('../base/base'));

var compilationReporter = require('../../reporter.js');


var ContentSearch = function (compId, compInstance) {
	this.init('scs-contentsearch', compId, compInstance);
};
ContentSearch.prototype = Object.create(Base.prototype);

ContentSearch.prototype.compile = function () {
	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	// extend the model with any contentsearch specific values
	this.searchId = 'scs-search-' + this.id;
	this.queryString = ''; // need to get from URL so need some inline script tag

	var contentSearchStyle = this.createContentSearchStyle(this);
	this.computedStyleSheet = contentSearchStyle ? '<style>' + contentSearchStyle + '</style>' : '';
	this.searchIconStyle = this.showSearchIcon ? '' : 'display: none;';
	this.showSearchIconValue = this.showSearchIcon ? true : '';
	this.computedStyle = this.computeBorderStyle + ((this.computeBorderStyle || '').indexOf('border-style:') >= 0 ? 'width: 100%' : '');


	// compute CSS for content
	this.computeContentStyle = this.computedWidthStyle;

	var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'contentsearch.html'), 'utf8'));

	return Promise.resolve({
		hydrate: true,
		content: content
	});
};


module.exports = ContentSearch;