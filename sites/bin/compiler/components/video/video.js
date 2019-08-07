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
	constants = require('../common/component-constants'),
	Base = require('../base/base');


var Video = function (compId, compInstance) {
	this.init('scs-video', compId, compInstance);
};
Video.prototype = Object.create(Base.prototype);

Video.prototype.compile = function () {
	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	// extend the model with any divider specific values
	this.computedStyle = this.computeBorderStyle;
	this.computedContentStyle = this.computedWidthStyle;
	this.computedHtml = this.computeHtml();

	// render the content
	var content = '';

	if (this.hasVisualData()) {
		content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'video.html'), 'utf8'));
	}

	return Promise.resolve({
		hydrate: false,
		content: content
	});
};

Video.prototype.hasVisualData = function () {
	return this.videoUrl && this.isHybridLink(this.videoUrl) || this.validateFilename(this.videoUrl);
};

Video.prototype.computeStyle = function () {
	return this.computeBorderStyle;
};

Video.prototype.computeHtml = function () {
		var viewModel = this;

		var t = '<video width="100%" src="';

		// Note: links will be resolved in the compiler.js code
		t += viewModel.videoUrl + '"';

		if (viewModel.controls === 'true') {
			t += ' controls';
		}
		if (viewModel.loop === 'true') {
			t += ' loop';
		}
		if (viewModel.muted === 'true') {
			t += ' muted';
		}
		if (viewModel.autoplay === 'true') {
			t += ' autoplay';
		}

		// add in the poster attribute
		if (viewModel.posterUrl) {
			// Note: links will be resolved in the compiler.js code
			t += ' poster="' + viewModel.posterUrl + '"';
		}

		// SCS-7506
		t += ' controlsList="nodownload"';

		t += '></video>';

		return t;
	},

	module.exports = Video;