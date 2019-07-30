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
 * $Id: socialbar.js 166460 2018-12-17 21:50:21Z muralik $
 */

var fs = require('fs'),
	path = require('path'),
	constants = require('../common/component-constants'),
	Base = require('../base/base'),
	isNumeric = function(value) {
		return !isNaN(parseFloat(value)) && isFinite(value);
	};


var Socialbar = function (compId, compInstance) {
	this.init('scs-socialbar', compId, compInstance);
};
Socialbar.prototype = Object.create(Base.prototype);

Socialbar.prototype.compile = function () {
	// extend the model with any values specific to this component type
	this.imageId = 'scs-socialbar-' + this.id;
	this.computedStyle = this.encodeCSS(this.computeStyle());
	this.computedContentStyle = this.encodeCSS(this.computeContentStyle());
	this.computedImages = this.computeImages();
	this.hasVisualData = this.computedImages.length > 0;

    // render the content
	var content = ''; 
	
	if (this.hasVisualData) {
		content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'socialbar.html'), 'utf8'));
	}

	return Promise.resolve({
		hydrate: false,
		content: content
	});
};

// compute CSS for image
Socialbar.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

    if (viewModel.useStyleClass === 'false') {
        computedStyle += 'background-color:' + viewModel.backgroundColor + ';background-clip:content-box;';
    }

    computedStyle += viewModel.computeBorderStyle;

	return computedStyle;
};

Socialbar.prototype.computeContentStyle = function () {
	var computedContentStyle = '';

	return computedContentStyle;
};

Socialbar.prototype.computeIconSize = function () {
	var viewModel = this;

	// style property value only
	return (viewModel.iconSize && isNumeric(viewModel.iconSize) ? viewModel.iconSize + 'px' : '');
};

Socialbar.prototype.computeImagesLength = function () {
	var viewModel = this;

	return viewModel.images.length;
};

Socialbar.prototype.computeIconMargin = function () {
	var viewModel = this;

	// style property value only
	var spacing = '0px';

	spacing = (viewModel.iconSpacing && isNumeric(viewModel.iconSpacing) ? viewModel.iconSpacing + 'px' : '');

	// Note: Somehow browser writes '0px 0px 5px 0px' as '0px 0px 5px'. Therefore, it is necessary to omit the last part for vertical.
	return (viewModel.layout && viewModel.layout === 'horizontal' ? '0px ' + spacing + ' 0px 0px' : '0px 0px ' + spacing);
};

Socialbar.prototype.computeDisplayStyle = function () {
	var viewModel = this;

	return (viewModel.layout && viewModel.layout === 'horizontal' ? 'inline-block' : 'block');
};

Socialbar.prototype.computeImages = function () {
	var viewModel = this;

	return viewModel.images.map(function (img, i, images) {
		var image = Object.assign({}, img),
			rendition = image.rendition,
			options = {};

		// TODO: Keeping the following block for review only.
		//       I suppose the following should be done in hydrate.
		/*
		options.approvalState = compCtx.env.getCaaSVersion(image.contentViewing);

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

		image.imageURL = image.contentId ? compCtx.caasApi.getAssetUrl(image.contentId, options) : image.source;
		*/

		image.imageURL = image.source;

		if (!image.imageURL) {
			image.imageURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		}
		image.title = image.title || '';
		image.altText = image.altText || '';

		image.cssClass = image.class ? 'scs-socialbar-icon ' + image.class : '';

		{
			var width,
				height,
				display,
				margin;

			width = viewModel.encodeCSS(viewModel.computeIconSize());
			height = width;
			display = viewModel.encodeCSS(viewModel.computeDisplayStyle());
			margin = i < (images.length - 1) ? viewModel.encodeCSS(viewModel.computeIconMargin()) : '';

			image.style = 'width: ' + width + '; height: ' + height + '; display: ' + display + ';' +
			 (margin ? ' margin: ' + margin + ';' : '');
		}

		return image;
	});
};
module.exports = Socialbar;
