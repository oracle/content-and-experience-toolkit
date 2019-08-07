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


var Button = function (compId, compInstance) {
	this.init('scs-button', compId, compInstance);
};
Button.prototype = Object.create(Base.prototype);

Button.prototype.compile = function () {
	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	// extend the model with any component specific values
	this.computedStyle = this.encodeCSS(this.computeStyle());
	this.computedContentStyle = this.encodeCSS(this.computeContentStyle());
	this.computedStyleSheet = this.computeStyleSheet();
	this.computedTarget = this.computeTarget(this.target);

	this.viewId = this.isCobrowse ? 'cec-start-cobrowse' : ('scs-button-' + this.id);

	// Text to display for the button
	this.computedText = this.computeText();

	// note whether component has any text
	this.hasButtonText = !!(this.text);


	// Helpers for link types
	this.linkTypeAction = (this.linkType === 'scs-link-action') && (this.actions && this.actions.length > 0);
	this.linkTypeFile = (this.linkType === 'scs-link-file') && this.encodeString(this.href, this.xssEncoding.urlTags);
	this.linkTypeFilePreview = (this.linkType === 'scs-link-file-preview') && this.encodeString(this.href, this.xssEncoding.urlTags);
	this.linkTypeMap = (this.linkType === 'scs-link-map') && this.encodeString(this.href, this.xssEncoding.urlTags);
	this.linkTypeOther = (this.linkType !== 'scs-link-no-link') && this.encodeString(this.href, this.xssEncoding.urlTags) && !(this.linkTypeFile || this.linkTypeFilePreview || this.linkTypeAction || this.linkTypeMap);

	this.hasLink = this.linkTypeAction || this.linkTypeFile || this.linkTypeFilePreview || this.linkTypeOther || this.linkTypeMap;
	this.notHasLink = !this.hasLink;

	if (this.linkType === 'scs-link-file') {
		this.downloadAttr = 'download="' + this.getNameFromURL(this.href, this.hrefName) + '"';
	}

	// adjust href and target for in-page links
	if (['scs-link-file-preview', 'scs-link-map', 'scs-link-action'].indexOf(this.linkType) !== -1 || this.isCobrowse) {
		this.href = '#';
	}
	if (['scs-link-file-preview', 'scs-link-action', 'scs-link-email'].indexOf(this.linkType) !== -1) {
		this.computedTarget = '';
	}

	// render the content
	var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'button.html'), 'utf8'));

	return Promise.resolve({
		hydrate: true,
		content: content
	});
};

Button.prototype.hasVisualData = function () {
	// has visual attributes if has button text
	return !!(this.text);
};

var nbspChar = String.fromCharCode(65279);
Button.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

	if (viewModel.height) {
		computedStyle += 'height:' + viewModel.getDimensionValue(viewModel.height) + '; line-height:' + viewModel.getDimensionValue(viewModel.height) + ';';
	}

	// Custom Style
	if (viewModel.useStyleClass === 'false') {
		computedStyle += 'border-radius:' + viewModel.borderRadius + 'px;';
		computedStyle += 'font-size:' + viewModel.fontSize + 'px;';
		computedStyle += 'font-family:' + viewModel.fontFamily + ';';
		computedStyle += 'border-width:' + viewModel.borderWidth + 'px;';
		computedStyle += 'border-style:' + viewModel.borderStyle + ';';
	}

	return computedStyle;
};

// compute CSS for content
Button.prototype.computeContentStyle = function () {
	var viewModel = this,
		computedContentStyle = '';

	computedContentStyle += viewModel.computedWidthStyle;

	return computedContentStyle;
};

//Compute Hover CSS
Button.prototype.computeStyleSheet = function () {
	var viewModel = this,
		computedStyle = '';

	// Custom Style
	if (viewModel.useStyleClass === 'false') {

		computedStyle += '#' + viewModel.viewId + '{';
		computedStyle += 'background-color:' + viewModel.backgroundColor + ';';
		computedStyle += 'color:' + viewModel.fontColor + ';';
		computedStyle += 'border-color:' + viewModel.borderColor + ';';

		computedStyle += '} ';

		// Hover Properties
		computedStyle += '#' + viewModel.viewId + ':hover {';
		computedStyle += 'background-color:' + viewModel.backgroundColorHover + ';';
		computedStyle += 'color:' + viewModel.fontColorHover + ';';
		computedStyle += 'border-color:' + viewModel.borderColorHover + ';';
		computedStyle += '} ';
	}

	return computedStyle;
};

Button.prototype.computeText = function () {
	var viewModel = this,
		updatedText = viewModel.text,
		newText = updatedText.indexOf(' ') === 0 ? updatedText.replace(' ', nbspChar) : updatedText;
	return newText;
};

module.exports = Button;