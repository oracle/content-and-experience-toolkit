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
 * $Id: document.js 166460 2018-12-17 21:50:21Z muralik $
 */

var fs = require('fs'),
	path = require('path'),
	compReg = require('../component-registration')['component-registration'],
	Base = require('../base/base');

var compilationReporter = require('../../reporter.js');


var Document = function (compId, compInstance) {
	this.init('scs-document', compId, compInstance);
};
Document.prototype = Object.create(Base.prototype);

Document.prototype.compile = function () {
	var self = this;

	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	return new Promise(function (resolve, reject) {
		// extend the model with any values specific to this component type
		self.computedStyle = self.encodeCSS(self.computeStyle());
		self.computedContentStyle = self.encodeCSS(self.computeContentStyle());
		self.computedImages = self.computeImages();

		self.sliderContainerId = 'slider_container_' + self.id;
		self.computedWidth = self.computeWidth();
		self.computedHeight = self.computeHeight();
		self.computedContainerHeight = self.computeContainerHeight();
		self.computedBackgroundColor = self.computeBackgroundColor();
		self.computedOptions = self.computeOptions();

		if (self.documentRatio !== '' && self.documentRatio > 1) {
			self.thumbHeight = '100%';
			self.thumbWidth = 100 / self.documentRatio;
			self.thumbPL = (100 - self.thumbWidth) / 2;
			self.thumbWidth += '%';
			self.thumbPT = '0%';
			self.thumbPL += '%';
		} else if (self.documentRatio !== '') {
			self.thumbHeight = 100 * self.documentRatio;
			self.thumbPT = (100 - self.thumbHeight) / 2;
			self.thumbHeight += '%';
			self.thumbWidth = '100%';
			self.thumbPT += '%';
			self.thumbPL = '0%';
		} else {
			self.thumbWidth = '100%';
			self.thumbHeight = '100%';
			self.thumbPL = '0%';
			self.thumbPT = '0%';
		}
		self.showThumbPT = self.thumbPT !== '0%';
		self.showThumbPL = self.thumbPL !== '0%';
		self.showNoThumb = !self.showThumbPT && !self.showThumbPL;

		// create an hydrate ID for adding handlers to the slider
		self.hydrateId = 'slider_hydrate_' + self.id;

		// render the content
		var content = '';
		try {
			content = self.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'document.html'), 'utf8'));
		} catch (e) {
			compilationReporter.error({
				message: 'failed to render document component',
				error: e
			});
		}

		resolve({
			hydrate: true,
			content: content
		});
	});
};

Document.prototype.hasVisualData = function () {
	return (this.images.length > 0) && this.validateFilename(this.documentUrl);
};

Document.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

	computedStyle += viewModel.computeBorderStyle;

	return computedStyle;
};

// compute CSS for content
Document.prototype.computeContentStyle = function () {
	var viewModel = this,
		computedContentStyle = '';

	computedContentStyle += viewModel.computedWidthStyle;

	return computedContentStyle;
};
Document.prototype.computeImages = function () {
	var viewModel = this,
		imageIdRoot = 'document-' + viewModel.id + '-page';

	return viewModel.images.map(function (img, dataIndex) {
		var image = JSON.parse(JSON.stringify(img));

		image.documentRenditionURL = viewModel.getDocumentRenditionURL(image.source);
		image.tabIndex = viewModel.hasScrollbar ? '0' : '-1';
		image.position = viewModel.hasScrollbar ? 'static;' : 'absolute;';
		image.title = viewModel.documentTitle || image.title;
		image.altText = viewModel.documentTitle + ' ' + (dataIndex + 1);
		image.showCaption = image.title || viewModel.showPages;
		image.showPages = typeof viewModel.showPages === 'boolean' ? viewModel.showPages : viewModel.showPages === 'true';
		image.pageDescription = (dataIndex + 1) + ' / ' + viewModel.images.length;
		image.id = imageIdRoot + dataIndex;

		return image;
	});
};

// "published" runtime: the images live in the folder named for the "<documentName>~preview/" and use GET_CONTENT
Document.prototype.getDocumentRenditionURL = function (pageId) {
	return this.documentUrl + '~preview/page' + pageId + '.png';
};

// compute Height (in future, this will depend on aspect ratio)
Document.prototype.computeHeight = function () {
	var self = this,
		computedHeight;

	if (self.aspectRatio !== 'auto') {
		computedHeight = 600 * (self.aspectRatio.split(':')[1] / self.aspectRatio.split(':')[0]);
	} else {
		if (typeof self.documentRatio === 'number' && self.documentRatio !== 0) {
			computedHeight = 600 * self.documentRatio;
		} else {
			computedHeight = 600;
		}
	}

	return computedHeight + "px";
};

// compute Width (doesn't matter, other than for aspect ratio with height)
Document.prototype.computeWidth = function () {
	return '600px';
};

// compute Height (in future, this will depend on aspect ratio)
Document.prototype.computeContainerHeight = function () {
	var self = this,
		computedHeight;

	if (self.aspectRatio !== 'auto') {
		computedHeight = 600 * (self.aspectRatio.split(':')[1] / self.aspectRatio.split(':')[0]);
	} else {
		if (typeof self.documentRatio === 'number' && self.documentRatio !== 0) {
			computedHeight = 600 * self.documentRatio;
		} else {
			computedHeight = 600;
		}
	}

	// add extra height for thumbnails (72 + spacing -- see CSS)
	if (self.showThumbnails === 'true')
		computedHeight += 88;

	return computedHeight + "px";
};

Document.prototype.computeOptions = function () {
	var self = this,
		options = {
			$FillMode: self.hasScrollbar ? 2 : 1,
			$AutoPlay: false,
			$Loop: 0,
			$HWA: false,
			$ArrowKeyNavigation: true,
			$BulletNavigatorOptions: {
				$ChanceToShow: self.showIndexer === 'true' ? 1 : 0,
				$AutoCenter: 1,
				$SpacingX: 5
			},
			$ArrowNavigatorOptions: {
				//$ChanceToShow: self.showPrevNext === 'true' && !compCtx.isMobile() ? 1 : 0, // ToDo: handle mobile
				$ChanceToShow: self.showPrevNext === 'true' ? 1 : 0,
				$AutoCenter: 2,
				$Steps: 1
			},
			$ThumbnailNavigatorOptions: {
				$ChanceToShow: self.showThumbnails === 'true' ? 2 : 0,
				$DisplayPieces: 7,
				$Loop: 2,
				$SpacingX: 8,
				$ParkingPosition: 240
			}
		};

	return JSON.stringify(options);
};


// compute the background color
Document.prototype.computeBackgroundColor = function () {
	if (this.useStyleClass === 'true') {
		var compConfig = compReg.definitions[this.type].config;
		return compConfig.defaultValues.backgroundColor;
	} else {
		return this.backgroundColor;
	}
};

module.exports = Document;