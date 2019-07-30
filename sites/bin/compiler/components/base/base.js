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
	compReg = require(path.normalize('../component-registration'))['component-registration'],
	ComponentCommon = require(path.normalize('../common/component-common')).ComponentCommon,
	serverUtils = require('../../../../test/server/serverUtils.js');

var serverURL = 'http://localhost:8085',
	siteURLPrefix = serverURL + '/templates',
	SYSTEM_DEFAULT_LAYOUT = 'system-default-layout';


var Base = function () {};
Base.prototype = Object.create(ComponentCommon.prototype);

Base.prototype.init = function (compType, compId, compInstance) {
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
		propName = properties[i];
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
	this.canCompile = this.visible && ((typeof this.visibleOnMobile !== 'boolean') || this.visibleOnMobile);
};

Base.prototype.renderMustacheTemplate = function (template) {
	var markup = '';
	// if we can compile this component
	if (this.canCompile) {
		try {
			markup = mustache.render(template, this);
		} catch (e) {
			console.log('failed to expand template');
			console.log(e);
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


module.exports = Base;