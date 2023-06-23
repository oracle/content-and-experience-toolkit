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
	mustache = require('mustache'),
	compReg = require('../component-registration')['component-registration'],
	ComponentCommon = require('../common/component-common').ComponentCommon,
	constants = require('../common/component-constants').constants,
	serverUtils = require('../../../../test/server/serverUtils.js');

var compilationReporter = require('../../reporter.js');

var serverURL = 'http://localhost:8085',
	siteURLPrefix = serverURL + '/templates',
	SYSTEM_DEFAULT_LAYOUT = 'system-default-layout';


var Base = function () {};
Base.prototype = Object.create(ComponentCommon.prototype);

Base.prototype.init = function (compType, compId, compInstance) {
	// apply any NLS properties to the component instance
	this.applyNLS({
		scsComponent: compInstance
	}, compType, 'compile');

	var compConfig = compReg.definitions[compType].config,
		properties = compConfig.properties,
		defaults = compConfig.defaultValues || '';

	// store the passed in values
	this.compType = compType;
	this.type = compInstance.type;
	this.data = compInstance.data;
	this.id = this.data.parentId ? this.data.parentId + compId : compId;
	this.componentWrapperTag = this.data.parentId ? compType : 'div';
	this.nestedId = this.data.parentId ? ' data-scs-id="' + this.id + '"' : '';
	this.contentItemCache = this.data.contentItemCache;

	// to allow for hydration after rendering compiled content in the browser, add in the id (and any parent ID if it's nested)
	var hydrateData = {
		id: this.id
	};
	if (this.parentId) {
		hydrateData.parentId = this.parentId;
	}
	this.hydrate = JSON.stringify(hydrateData);


	// populate all the properties
	for (var i = 0; i < properties.length; i += 1) {
		var propName = properties[i],
			initialValue = '';

		// determine the initial value for the property
		if (typeof this.data[propName] !== 'undefined') {
			initialValue = this.data[propName];
		} else if (typeof defaults[propName] !== 'undefined') {
			initialValue = defaults[propName];
		}

		// create the property
		this[propName] = initialValue;
	}

	// add in any aria-label - encode the value
	this.ariaLabelValue = this.ariaLabel ? 'aria-label="' + mustache.render('{{ariaLabel}}', this) + '"' : '';

	// validation function for file extensions
	if (compConfig.supportedFileExtensions) {
		this.supportedFileExtensions = compConfig.supportedFileExtensions;
		this.validateFilename = function (filename) {
			var ext = filename ? filename.substr(filename.lastIndexOf('.') + 1).toLowerCase() : '';

			return (!filename || this.supportedFileExtensions.indexOf(ext) !== -1);
		};
	}
	// Is the link a hybrid link?
	this.isHybridLink = function (url) {
		// A hybrid link has the signature of a dLinkID parameter.
		return url.indexOf('dLinkID') >= 0;
	};

	this.computedStyleClass = this.createStyleClass(compType, this);

	// Return CSS for setting the component width
	// This CSS is typically applied to the "content" DIV.
	this.computedWidthStyle = this.encodeCSS(this.createWidthStyle(this));

	// Return CSS for margin on wrapper div.
	// TODO: use style binding (e.g. return {'marginTop': marginTop, ...})
	this.computedMarginStyle = this.encodeCSS(this.createMarginStyle(this));


	// Common function to compute CSS for wrapper for most types of components
	this.computedWrapperStyle = this.encodeCSS(this.createWrapperStyle(this));


	// Common function to compute custom border style.
	this.computeBorderStyle = this.encodeCSS(this.createBorderStyle(this));

	// Determine if the component can be seen and so can be compiled
	this.canCompile = this.computeVisibilty();
};

Base.prototype.validateFilename = function (filename) {
	var compConfig = compReg.definitions[this.compType].config || [],
		ext = filename ? filename.substr(filename.lastIndexOf('.') + 1).toLowerCase() : '';

	return (!filename || compConfig.supportedFileExtensions.indexOf(ext) !== -1);
};

Base.prototype.computeVisibilty = function () {
	var viewModel = this,
		isVisible = viewModel.visible; // default to desktop visibility

	// check if visible on mobile
	if (process.env.scsIsMobile) {
		if (typeof viewModel.visibleOnMobile === 'boolean') {
			// override with visibility on mobile device
			isVisible = viewModel.visibleOnMobile;
		}
	}

	// now check it has necessary visual attributes to render
	if (isVisible && typeof viewModel.hasVisualData === 'function') {
		isVisible = viewModel.hasVisualData();
	}

	return isVisible;
};

Base.prototype.getContentIdFromURL = function (href) {
	if (!href) {
		return '';
	}

	var regDigitalAsset   = /\[!--\$\s*SCS_DIGITAL_ASSET\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET\s*--\]/g;
	var contentId = href.replace(regDigitalAsset, function( match, parameters ) {
		return (parameters || '').split(',')[0];
	});

	return contentId !== href ? contentId : '';
};

Base.prototype.addAnalytics = function (args) {
	var analytics = '';
	if (args.view) {
		analytics = 'data-asset-operation="view:' + args.view + '"';
	}
	if (args.click) {
		analytics = 'data-asset-operation="click:' + args.click + (args.operation ? ':' + args.operation : '') + '"';
	}

	return analytics;
};

Base.prototype.renderMustacheTemplate = function (template) {
	var markup = '';
	// if we can compile this component
	if (this.canCompile) {
		try {
			markup = mustache.render(template, this);
		} catch (e) {
			compilationReporter.error({
				message: 'failed to expand template',
				error: e
			});
		}
	}
	return markup;
};

Base.prototype.getAssetUrl = function (caasGUID, options) {
	var approvalState = options && options.approvalState,
		type = options && options.type,
		format = options && options.format,
		params = {
			'itemGUID': caasGUID
		},
		contentClient;

	// ToDo:centralize content client entries
	//contentClient = ContentSDK.createContentClient({});

	// override state if required
	if (approvalState) {
		params.contentType = approvalState;
	}

	// rendition name
	if (type) {
		params.type = type;
	}

	// rendition format
	if (format) {
		params.format = format;
	}

	return contentClient.getRenditionURL(params);
};

Base.prototype.generateUUID = function (options) {
	var guid = "";
	var i;
	var str;

	// Create an array filled with random bytes
	var byteArray;
	var cryptLib = require('crypto');
	if (cryptLib && (typeof cryptLib.getRandomValues == "function")) {
		byteArray = new Uint8Array(16);
		cryptLib.getRandomValues(byteArray);
	} else {
		byteArray = new Array(16);
		for (i = 0; i < byteArray.length; i++) {
			byteArray[i] = Math.floor(Math.random() * 256); // [0..255] inclusive
		}
	}

	// Create a version 4 GUID
	byteArray[6] = 0x40 | (byteArray[6] & 0x0F);
	byteArray[8] = (byteArray[8] & 0xBF) | 0x80;

	if (!options || options.alphaFirstChar) {
		// Ensure the first character is an alpha character -- because these GUIDs will be used as IDs.
		byteArray[0] = (byteArray[0] | 0x80) | ((byteArray[0] & 0x60) || 0x20);
	}

	// Change the bytes into a string
	for (i = 0; i < byteArray.length; i++) {
		str = byteArray[i].toString(16);
		if (str.length == 1) {
			str = "0" + str;
		}
		guid += str;
	}

	if (!options || options.addDashes) {
		// Insert dashes at the traditional places
		// nnnnnnnn-nnnn-4nnn-vnnn-nnnnnnnnnnnn
		guid = guid.substring(0, 8) + "-" +
            guid.substring(8, 12) + "-" +
            guid.substring(12, 16) + "-" +
            guid.substring(16, 20) + "-" +
            guid.substring(20);
	}

	return guid;
};

Base.prototype.getDetailPageUrl = function (pageUrl, options) {
	var dotPos = pageUrl.lastIndexOf('.');
	var slashPos = pageUrl.lastIndexOf('/');

	var detailSuffix = options.contentType + '/' + options.contentId + '/';
	if (options.contentSlug && (typeof options.contentSlug === 'string')) {
		// slug only navigation:  <slug>          - "honda-civic-lx"
		detailSuffix = options.contentSlug;
	} else {
		// normal navigation:  <type>/<id>/<slug> - "Car/123456789/honda-civic-lx"
		//                or:  <type>/<id>        - "Car/123456789"
		detailSuffix = options.contentType + '/' + options.contentId + '/';
		if (options.contentName && (typeof options.contentName === 'string')) {
			detailSuffix += options.contentName;
		}
	}

	if (dotPos > slashPos + 1) {
		// "products/detail.html" --> "products/detail/Car/123456789/honda-civic-lx"
		pageUrl = pageUrl.substring(0, dotPos) + '/';
	} else if (dotPos === slashPos + 1) {
		// "detail/.html" --> "/detail/Car/123456789/honda-civic-lx"
		pageUrl = pageUrl.substring(0, dotPos);
	} else if (slashPos === pageUrl.length - 1) {
		// "detail/" --> "detail/Car/123456789/honda-civic-lx"
	} else if (slashPos < pageUrl.length) {
		pageUrl += '/';
	}

	pageUrl += detailSuffix;

	return pageUrl;
};

Base.prototype.getDetailPageLinkURL = function (SCSCompileAPI, args) {
	var self = this,
		href = args.href,
		contentId = args.contentId,
		contentType = args.contentType;

	return new Promise(function (resolve, reject) {
		// get the content item
		SCSCompileAPI.getContentClient().then(function (contentClient) {
			contentClient.getItem({
				id: contentId,
				template: SCSCompileAPI.getSiteId()
			}).then(function (content) {
				// method to parse string like [!--$SCS_PAGE--]201[/!--$SCS_PAGE--]
				var getIdFromPageLink = function (pageLink) {
					var pageId;
					if (pageLink && pageLink.indexOf(constants.LINK_PAGE_PREFIX) >= 0) {
						pageId = pageLink.split(constants.LINK_PAGE_PREFIX)[1].split(constants.LINK_PAGE_SUFFIX)[0];
					} else {
						pageId = pageLink || '';
					}
					return pageId;
				};

				// get the detail page URL
				var detailPageId = getIdFromPageLink(href) || SCSCompileAPI.getDetailPageId(),
					detailPageURL = self.getDetailPageUrl(SCSCompileAPI.getPageURL(detailPageId), {
						contentType: contentType,
						contentId: contentId
					});

				// compile the detail page with the content item
				SCSCompileAPI.compileDetailPage(detailPageId, content);

				resolve(detailPageURL);
			}).catch(function (e) {
				reject(e);
			});
		}).catch(function (e) {
			reject(e);
		});
	});
};



module.exports = Base;