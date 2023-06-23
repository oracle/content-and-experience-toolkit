/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 *
 * Copyright (c) 2019, 2021, Oracle and/or its affiliates.
 */

var fs = require('fs'),
	path = require('path'),
	mustache = require('mustache'),
	compReg = require('../component-registration')['component-registration'],
	Base = require('../base/base');

var compilationReporter = require('../../reporter.js');

var Gallery = function (compId, compInstance) {
	this.init('scs-gallery', compId, compInstance);
};
Gallery.prototype = Object.create(Base.prototype);

Gallery.prototype.compile = function (args) {
	var self = this;

	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	this.SCSCompileAPI = args && args.SCSCompileAPI;

	return new Promise(function (resolve, reject) {
		// extend the model with any values specific to this component type
		self.computedStyle = self.encodeCSS(self.computeStyle());
		self.computedContentStyle = self.encodeCSS(self.computeContentStyle());
		self.computedClass = self.computeClass();
		self.computedImages = self.computeImages();
		self.computedRatio = self.encodeCSS(self.computeRatio());

		self.sliderContainerId = 'slider_container_' + self.id;
		self.computedWidth = self.computeWidth();
		self.computedHeight = self.computeHeight();
		self.computedContainerHeight = self.computeContainerHeight();
		self.computedBackgroundColor = self.computeBackgroundColor();
		self.computedOptions = self.computeOptions();
		self.computedObjectFit = self.computeObjectFit();

		self.hasThumbnails = self.showThumbnails === 'true';
		self.hasIndexer = self.showIndexer === 'true';
		self.hasPrevNext = self.showPrevNext === 'true';
		self.useKeyboard = self.useKeyboard === 'true';

		// create an hydrate ID for adding handlers to the slider
		self.hydrateId = 'slider_hydrate_' + self.id;

		// wait until all the getHref promises are resolved
		Promise.all(self.computedImages.filter(function(image) {
			return image.hasLink;
		}).map(function(image) {
			return image.getHref;
		})).then(function () {
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

// compute the aspect ratio
Gallery.prototype.computeRatio = function() {
	return 'padding-top: 66.666%;';
};

Gallery.prototype.computeClass = function() {
	var computedClasses = [];
	if (this.showThumbnails === 'true') {
		computedClasses.push('scs-swiper-has-thumbs');
	}
	if (this.showCaption === 'true') {
		computedClasses.push('scs-swiper-has-caption');
	}
	return computedClasses.join(' ');
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
		image.hasLink = !!(image.link || (image.linkType === 'scs-link-item' && image.linkContentId));
		image.isMap = image.linkType === 'scs-link-map';
		image.isNotMap = !image.isMap;

		if (image.hasLink) {
			// if download file, add in the download entry
			if (image.linkType === 'scs-link-file') {
				image.downloadName = 'download="' + viewModel.getNameFromURL(image.link, image.linkName) + '"';
			}

			// if content item link, then asynchronously get the link
			if (image.linkType === 'scs-link-item' && image.linkContentId) {
				image.getHref = new Promise(function (resolve, reject) {
					viewModel.getDetailPageLinkURL(viewModel.SCSCompileAPI, {
						href: image.link,
						contentId: image.linkContentId,
						contentType: image.linkContentType
					}).then(function(url) {
						image.linkURL = url;
						resolve();
					});
				});
			} else {
				image.getHref = Promise.resolve();
			}
		} else {
			// if use lightbox, add in the index
			if (viewModel.useLightbox) {
				image.dataIndex = 'data-index="' + dataIndex + '"';
			}
		}

		image.dataAnalyticsView = viewModel.addAnalytics({
			'view': image.contentId
		});
		image.dataAnalyticsClick = viewModel.addAnalytics({
			'click': image.linkContentId,
			'operation': 'download'
		});

		image.showCaption = viewModel.showCaption === 'true' && (image.title || image.description);

		image.ariaLabelValue = image.ariaLabel ? 'aria-label="' + mustache.render('{{ariaLabel}}', image) + '"' : '';

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

Gallery.prototype.computeObjectFit = function() {
	switch (this.scaling) {
	case 'stretch':
		return 'fill';
	case 'fit':
		return 'contain';
	case 'crop':
		return 'cover';
	default:
		return 'none';
	}
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