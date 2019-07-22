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


var Image = function (compId, compInstance) {
	this.init('scs-image', compId, compInstance);
};
Image.prototype = Object.create(Base.prototype);

Image.prototype.compile = function () {
	// extend the model with any divider specific values
	this.imageId = 'scs-image-' + this.id;
	this.computedStyle = this.encodeCSS(this.computeStyle());
	this.computedContentStyle = this.encodeCSS(this.computeContentStyle());
	this.computedImageUrl = this.computeImageUrl();
	this.computedTarget = ['scs-link-lightbox', 'scs-link-email'].indexOf(this.linkType) === -1 ? this.computeTarget(this.imageTarget) : '';
	this.computedLinkClass = this.linkType === 'scs-link-map' ? '' : 'scs-image-link';

	this.hrefAttr = 'href="' + (this.linkType === 'scs-link-lightbox' ? '#' : this.imageHref) + '"';

	if (this.linkType === 'scs-link-file') {
		this.downloadFileName = this.getNameFromURL(this.imageHref, this.imageHrefName);
	}

	// see if this image has a link (either click or href)
	// for gallyerGrid, it will pass in a click handler
	// this.linkHandler = !!(this.clickHandler || this.imageHref || this.linkType === 'scs-link-lightbox');
	this.linkHandler = !!(this.imageHref || this.linkType === 'scs-link-lightbox');

	// render the content
	var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'image.html'), 'utf8'));

	return Promise.resolve({
		hydrate: true,
		content: content
	});
};

// compute CSS for image
Image.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '',
		imageElem;

	computedStyle += viewModel.computeBorderStyle;

	return computedStyle;
};

Image.prototype.computeContentStyle = function () {
	var viewModel = this,
		computedContentStyle = '';

	// width
	if (!viewModel.inGallery) {
		computedContentStyle += viewModel.computedWidthStyle;
	}

	return computedContentStyle;
};
Image.prototype.computeImageUrl = function () {
	var viewModel = this,
		imageUrl = viewModel.imageUrl,
		contentId = viewModel.contentId,
		contentViewing = viewModel.contentViewing,
		rendition = viewModel.rendition,
		options = {};

	options.approvalState = contentViewing || 'draft';

	// add renditon type and format when available
	// 	rendion value may include format, needs to split the string with identifier('~')
	if (rendition) {
		var index = rendition.indexOf('~');

		options.type = rendition;

		if (index !== -1) {
			options.type = rendition.split('~')[0];
			options.format = rendition.split('~')[1];
		}
	}

	return contentId ? compCtx.caasApi.getAssetUrl(contentId, options) : imageUrl;
};
module.exports = Image;