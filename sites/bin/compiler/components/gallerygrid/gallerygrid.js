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
	Base = require('../base/base'),
	Image = require('../image/image');

var compilationReporter = require('../../reporter.js');

var Gallerygrid = function (compId, compInstance) {
	this.init('scs-gallerygrid', compId, compInstance);
};
Gallerygrid.prototype = Object.create(Base.prototype);

Gallerygrid.prototype.compile = function () {
	var self = this;

	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	return new Promise(function (resolve, reject) {
		var render = function () {
			// render the content
			var content = '';

			content = self.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'gallerygrid.html'), 'utf8'));

			resolve({
				hydrate: true,
				content: content
			});
		};

		// extend the model with any values specific to this component type
		self.gridId = self.id + 'grid';
		self.galleryClass = self.computeGalleryClass();
		self.galleryStyle = self.computeGalleryStyle();
		self.galleryImageStyle = self.computeGalleryImageStyle();
		self.columnStyleSheet = self.computeColumnStyleSheet();
		self.columnslayout = self.layout === 'columns';

		self.computedContentStyle = self.encodeCSS(self.computeContentStyle());

		self.computeImages().then(function (images) {
			self.galleryImages = images;
			render();
		}, function () {
			self.galleryImages = '';
			render();
		});
	});
};

Gallerygrid.prototype.hasVisualData = function () {
	return this.images.length > 0;
};

Gallerygrid.prototype.computeContentStyle = function () {
	var viewModel = this;
	var computedWidthStyle;
	var imageSpacing = viewModel.hasVisualData() ? viewModel.imageSpacing : 0;

	if (viewModel.hasOwnProperty('alignment') && viewModel.alignment === constants.constants.ALIGNMENT_FILL) {
		computedWidthStyle = 'width:calc(100% + ' + imageSpacing + 'px);';
	} else {
		if (viewModel.hasOwnProperty('width')) {
			if (viewModel.width !== null) {
				computedWidthStyle = 'width:calc(' + viewModel.getDimensionValue(viewModel.width) + ' + ' + viewModel.imageSpacing + 'px);';
			} else {
				computedWidthStyle = ''; // or 'width:auto'
			}
		} else {
			computedWidthStyle = 'width:calc(100% + ' + imageSpacing + 'px);';
		}
	}

	// negative margin since width was increased (22834586)
	computedWidthStyle += 'overflow:hidden;max-width:calc(100% + ' + imageSpacing + 'px);margin-left:-' + imageSpacing + 'px;margin-top:-' + imageSpacing + 'px;';

	return computedWidthStyle;
};

Gallerygrid.prototype.computeImages = function () {
	var viewModel = this;

	return new Promise(function (resolve, reject) {
		var imageContent = '';
		var imagePromises = [];

		viewModel.images.map(function (image) {

			var imageObj = {
				id: image.id,
				type: 'scs-image',
				renderMode: viewModel.renderMode,
				data: {
					alignment: 'center',
					borderColor: viewModel.borderColor,
					borderRadius: viewModel.borderRadius,
					borderStyle: viewModel.borderStyle,
					borderWidth: viewModel.borderWidth,
					marginRight: 0,
					marginBottom: 0,
					marginLeft: 0,
					marginTop: 0,
					useStyleClass: viewModel.useStyleClass,
					styleClass: viewModel.styleClass,
					imageUrl: image.source,
					contentId: image.contentId,
					contentViewing: image.contentViewing,
					rendition: image.rendition || '',
					title: image.title || '',
					caption: image.description || '',
					linkType: image.linkType,
					altText: image.altText || '',
					imageHref: image.link,
					imageHrefName: image.linkName,
					imageTarget: image.target, // ###
					// width: viewModel.imageWidth || 100,
					// height: viewModel.imageHeight || 100,
					scaling: viewModel.scaling,
					layout: viewModel.layout,
					inGallery: true,
					componentTagAttribute: 'style="' + viewModel.galleryImageStyle + '"',
					clickHandler: viewModel.useLightbox // inform the compiler in the way runtime code does
				}
			};

			var imageComp = new Image(image.id, imageObj);

			imagePromises.push(imageComp.compile());
		});

		Promise.all(imagePromises).then(function (responses) {
			responses.map(function (compiledImage) {
				imageContent += compiledImage.content;
			});
			resolve(imageContent);
		}).catch(function (error) {
			compilationReporter.error({
				message: 'computeImages failed',
				error: error
			});
			reject(error);
		});
	});
};

// Compute the style on the actual <scs-image> tag
Gallerygrid.prototype.computeGalleryImageStyle = function () {
	var viewModel = this;

	var style = '';
	if (viewModel.layout === 'custom') {
		style += 'flex-basis:' + viewModel.imageWidth + 'px;';
		style += 'height:' + viewModel.imageHeight + 'px;';
	} else if (viewModel.layout === 'flowing') {
		style += 'height:' + viewModel.imageHeight + 'px;';
	} else if (viewModel.layout === 'columns') {
		style += 'flex-basis:calc(' + 100 / viewModel.columns + '% - ' + viewModel.imageSpacing + 'px);';
		style += 'max-width:calc(' + 100 / viewModel.columns + '% - ' + viewModel.imageSpacing + 'px);';
	}

	style += 'margin-top:' + viewModel.imageSpacing + 'px;';
	style += 'margin-left:' + viewModel.imageSpacing + 'px;'; // BIDI

	return style;
};

// For column layouts, we have to generate an inline stylesheet, because the height
// of each image depends on the width and the aspect ratio, and the width is proportional
// to the (variable) size of the element.  The only way to create a DIV with a variable
// width and a fixed aspect ratio is to use padding-top.  And because custom border styles
// are applied to the same element (scs-image-container), we have to reduce this padding
// by an amount equal to the total left/right padding.
Gallerygrid.prototype.computeColumnStyleSheet = function () {
	var viewModel = this;

	var styleSheet = '';
	if (viewModel.layout === 'columns') {
		var ratio = viewModel.imageRatio.split(':')[1] / viewModel.imageRatio.split(':')[0];
		var id = viewModel.id + 'grid';

		styleSheet += '#' + id + ' .scs-gallerygrid-columns .scs-image .scs-image-container {';
		if (viewModel.useStyleClass === 'false' && viewModel.borderStyle !== 'none') {
			styleSheet += ' padding-top:calc(' + ratio * 100 + '% - 2 * ' + viewModel.borderWidth + 'px);';
		} else {
			styleSheet += ' padding-top: ' + ratio * 100 + '%;';
		}
		styleSheet += '}';

		// If responsive is enabled, then add the @media query
		if (viewModel.responsive) {
			styleSheet +=
				// TODO: we can remove the !important if we blend galleryImageStyle() into this method
				'@media screen and (max-width: 767px) {' +
				' #' + id + ' .scs-gallerygrid-container scs-image {' +
				'  flex-basis:calc(100% - ' + viewModel.imageSpacing + 'px) !important;' +
				'  max-width:calc(100% - ' + viewModel.imageSpacing + 'px) !important;' +
				' }' +
				'}';
		}
	}
	return styleSheet;
};

// This is the outermost class, containing the layout as well as crop/fit
Gallerygrid.prototype.computeGalleryClass = function () {
	var viewModel = this;

	return 'scs-gallerygrid-container scs-gallerygrid-' + viewModel.layout + ' scs-gallerygrid-' + viewModel.scaling;
};

// The alignment within the flex layout should match the overall component alignment
Gallerygrid.prototype.computeGalleryStyle = function () {
	var viewModel = this;

	var galleryStyle = '';
	var alignment = viewModel.alignment;

	if (alignment === constants.constants.ALIGNMENT_LEFT ||
		alignment === constants.constants.ALIGNMENT_CENTER ||
		alignment === constants.constants.ALIGNMENT_RIGHT) {
		galleryStyle += 'justify-content:' + alignment + ';';
	}

	return galleryStyle;
};

module.exports = Gallerygrid;