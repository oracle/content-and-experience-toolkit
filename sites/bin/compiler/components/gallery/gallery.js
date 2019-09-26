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
 * $Id: gallerygrid.js 166460 2018-12-17 21:50:21Z muralik $
 */

var fs = require('fs'),
	path = require('path'),
	constants = require('../common/component-constants'),
	compReg = require('../component-registration')['component-registration'],
	Base = require('../base/base'),
	Image = require('../image/image');

var compilationReporter = require('../../reporter.js');

var Gallery = function (compId, compInstance) {
	this.init('scs-gallery', compId, compInstance);
};
Gallery.prototype = Object.create(Base.prototype);

Gallery.prototype.compile = function () {
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

		// create an hydrate ID for adding handlers to the slider
		self.hydrateId = 'slider_hydrate_' + self.id;

		// render the content
		var content = '';
		try {
			content = self.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'gallery.html'), 'utf8'));
		} catch (e) {
			compilationReporter.error({
				message: 'failed to render gallery component',
				error: e
			});
		}

		resolve({
			hydrate: true,
			content: content
		});
	});
};

Gallery.prototype.hasVisualData = function () {
	return this.images.length > 0;
};

Gallery.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

	computedStyle += viewModel.computeBorderStyle;

	return computedStyle;
};

// compute CSS for content
Gallery.prototype.computeContentStyle = function () {
	var viewModel = this,
		computedContentStyle = '';

	computedContentStyle += viewModel.computedWidthStyle;

	return computedContentStyle;
};
Gallery.prototype.computeImages = function () {
	var viewModel = this;

	return viewModel.images.map(function (img, dataIndex) {
		var image = JSON.parse(JSON.stringify(img)),
			rendition = image.rendition,
			imageUrl = image.source,
			contentId = image.contentId,
			digitalAsset = contentId + (rendition ? ',' + rendition : '');

		image.imageURL = contentId ? '[!--$SCS_DIGITAL_ASSET--]' + digitalAsset + '[/!--$SCS_DIGITAL_ASSET--]' : imageUrl;
		image.linkURL = image.link;
		image.hasLink = !!(image.link);
		image.isMap = image.linkType === 'scs-link-map';
		image.isNotMap = !image.isMap;

		if (image.hasLink) {
			// if download file, add in the download entry
			if (image.linkType === 'scs-link-file') {
				image.downloadName = 'download="' + viewModel.getNameFromURL(image.linkURL, image.linkName) + '"';
			}
		} else {
			// if use lightbox, add in the index
			if (viewModel.useLightbox) {
				image.dataIndex = 'data-index="' + dataIndex + '"';
			}
		}

		image.showCaption = viewModel.showCaption === 'true' && (image.title || image.description);

		return image;
	});
};

// compute Height (in future, this will depend on aspect ratio)
Gallery.prototype.computeHeight = function () {
	return '400px';
};

// compute Width (doesn't matter, other than for aspect ratio with height)
Gallery.prototype.computeWidth = function () {
	return '600px';
};

// compute Height (in future, this will depend on aspect ratio)
Gallery.prototype.computeContainerHeight = function () {
	var computedHeight = 400;

	// add extra height for thumbnails (72 + spacing -- see CSS)
	if (this.showThumbnails === 'true')
		computedHeight += 88;

	return computedHeight + "px";
};

Gallery.prototype.computeOptions = function () {
	var self = this,
		options = {
			$FillMode: self.scaling === 'stretch' ? 0 : self.scaling === 'fit' ? 1 : self.scaling === 'crop' ? 2 : 4,
			$AutoPlay: self.autoPlay === 'true',
			$AutoPlayInterval: 1000 * self.displayTime,
			$SlideDuration: 1000 * self.transitionTime,
			$ArrowKeyNavigation: true,
			$HWA: false,
			$BulletNavigatorOptions: {
				$ChanceToShow: self.showIndexer === 'true' ? 1 : 0,
				$AutoCenter: 1,
				$SpacingX: 5
			},
			$ArrowNavigatorOptions: {
				//$ChanceToShow: self.showPrevNext === 'true' && !compCtx.isMobile() ? 1 : 0,   //ToDo: Handle mobile
				$ChanceToShow: self.showPrevNext === 'true' ? 1 : 0,
				$AutoCenter: 2,
				$Steps: 1
			},
			$ThumbnailNavigatorOptions: {
				$ChanceToShow: self.showThumbnails === 'true' ? 2 : 0,
				$DisplayPieces: 7,
				$SpacingX: 8,
				$ParkingPosition: 240
			}
		};

	return JSON.stringify(options);
};


// compute the background color
Gallery.prototype.computeBackgroundColor = function () {
	if (this.useStyleClass === 'true') {
		var compConfig = compReg.definitions[this.type].config;
		return compConfig.defaultValues.backgroundColor;
	} else {
		return this.backgroundColor;
	}
};

module.exports = Gallery;