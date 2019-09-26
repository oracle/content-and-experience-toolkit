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

var Spacer = function (compId, compInstance) {
	this.init('scs-spacer', compId, compInstance);
};
Spacer.prototype = Object.create(Base.prototype);

Spacer.prototype.compile = function () {
	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	// extend the model with any divider specific values
	this.computedStyle = this.encodeCSS(this.computeStyle());

	// render the content
	var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'spacer.html'), 'utf8'));

	return Promise.resolve({
		hydrate: false,
		content: content
	});
};

Spacer.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

	computedStyle += 'height:' + viewModel.getDimensionValue(viewModel.height) + ';';

	return computedStyle;
};

module.exports = Spacer;