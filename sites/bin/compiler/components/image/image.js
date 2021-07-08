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

var Image = function (compId, compInstance) {
	this.init('scs-image', compId, compInstance);
};
Image.prototype = Object.create(Base.prototype);

Image.prototype.compile = function (args) {
	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	this.SCSCompileAPI = args && args.SCSCompileAPI;

	// extend the model with any divider specific values
	this.imageId = 'scs-image-' + this.id;
	this.computedStyle = this.encodeCSS(this.computeStyle());
	this.computedContentStyle = this.encodeCSS(this.computeContentStyle());
	this.computedImageUrl = this.computeImageUrl();
	this.computedTarget = ['scs-link-lightbox', 'scs-link-email'].indexOf(this.linkType) === -1 ? this.computeTarget(this.imageTarget) : '';
	this.computedLinkClass = this.linkType === 'scs-link-map' ? '' : 'scs-image-link';
	this.computedImgClass = 'scs-image-image';
	// Override for gallerygrid
	if (this.data.inGallery) {
		this.componentWrapperTag = 'scs-image';
		this.componentTagAttribute = this.data.componentTagAttribute;
	}

	this.dataAnalyticsView = this.addAnalytics({
		'view': this.contentId
	});

	// for content item links, the href can only be found asynchronously,
	var getHref;
	if (this.linkType === 'scs-link-item' && this.linkContentId) {
		var self = this;
		getHref = new Promise(function (resolve, reject) {
			self.getDetailPageLinkURL(self.SCSCompileAPI, {
				href: self.imageHref,
				contentId: self.linkContentId,
				contentType: self.linkContentType
			}).then(function (url) {
				self.imageHref = url;
				resolve();
			});
		});
	} else {
		getHref = Promise.resolve();
	}

	// render the content after getHref resolves
	return getHref.then(function () {
		if (!(this.linkType === 'scs-link-lightbox' || this.imageHref)) {
			if (this.data.clickHandler) {
				this.hrefAttr = '';
				this.computedTarget = '';
			}
		} else {
			this.hrefAttr = 'href="' + (this.linkType === 'scs-link-lightbox' ? '#' : this.imageHref) + '"';
		}

		if (this.linkType === 'scs-link-file') {
			this.downloadFileName = 'download="' + encodeURI(this.getNameFromURL(this.imageHref, this.imageHrefName)) + '"';
			var downloadContentId = this.getContentIdFromURL(this.imageHref);
			if (downloadContentId) {
				this.dataAnalyticsClick = this.addAnalytics({
					'click': downloadContentId,
					'operation': 'download'
				});
			}
		}

		// see if this image has a link (either click or href)
		// for gallyerGrid, it will pass in a click handler
		this.linkHandler = !!(this.data.clickHandler || this.imageHref || this.linkType === 'scs-link-lightbox');

		// render the content
		var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'image.html'), 'utf8'));

		return Promise.resolve({
			hydrate: true,
			content: content
		});
	}.bind(this));
};

Image.prototype.hasVisualData = function () {
	return this.imageUrl && this.validateFilename(this.imageUrl) || this.contentId;
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
	if (!viewModel.data.inGallery) {
		computedContentStyle += viewModel.computedWidthStyle;
	}

	return computedContentStyle;
};
Image.prototype.computeImageUrl = function () {
	var viewModel = this,
		imageUrl = viewModel.imageUrl,
		contentId = viewModel.contentId,
		rendition = viewModel.rendition,
		digitalAsset = contentId + (rendition ? ',' + rendition : '');

	// turn any digital asset reference into a macro to be expanded by the compiler
	return contentId ? '[!--$SCS_DIGITAL_ASSET--]' + digitalAsset + '[/!--$SCS_DIGITAL_ASSET--]' : imageUrl;
};
module.exports = Image;