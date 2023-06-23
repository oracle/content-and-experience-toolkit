/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 *
 * Copyright (c) 2014, 2023, Oracle and/or its affiliates.
 */
var SCSComponentAPI = require('./SCSComponentAPI.js').SCSComponentAPI;
var Marked = require('marked');
var Mustache = require('mustache');
var fs = require('fs');
var path = require('path');
var url = require('url');

var CompileComponentAPI = function (compileAPI) {

	//
	// implement the version of the _SCSComponentAPI for the builder
	//

	this.getRenderMode = function () {
		// compiler only supports 'compile'
		return this.RENDER_MODE.COMPILE;
	};

	this.checkRenderState = function (state) {
		// no other states supported during compile,
		// all components are already downloaded so there is no "DRAFT" or "PUBLISED" for accessing the components
		return false;
	};

	this.loadResource = async function (args) {
		var resource = args.resource;
		var fsPath = args.path;

		// if no resource defined, then error
		if (resource)  {
			var resourcePath = fsPath ? path.join(fsPath, resource) : resource;
			resourcePath = resourcePath.startsWith('file:') ? url.fileURLToPath(resourcePath) : resourcePath;

			try {
				var content = await fs.promises.readFile(resourcePath, {
					encoding: 'utf8'
				});
				return content;
			} catch (e) {
				console.log('loadResource: failed to read file', e);
				return '';
			}
		} else {
			console.warn('loadResource: no resource file requested');
			return '';
		}
	}

	this.getDeviceInfo = function () {
		return compileAPI.getDeviceInfo();
	};

	this.getContentClient = function () {
		return compileAPI.getContentClientSync();
	};

	this.getMustache = function () {
		return Mustache;
	};

	this.getMarked = function () {
		return Marked && Marked.marked || Marked;
	};

	this.getPageInfo = function () {
		return {
			id: compileAPI.pageInfo.id,
			languageCode: compileAPI.pageLocale,
			localeAlias: compileAPI.localeAlias,
			properties: compileAPI.pageModel && compileAPI.pageModel.properties || {}
		};
	};

	this.getSiteInfo = function () {
		return {
			languageCode: compileAPI.pageLocale,
			currentPageId: this.getPageInfo().id,
			navigationRoot: compileAPI.navigationRoot,
			structureMap: compileAPI.structureMap || {}
		};
	};

	this.getComponentInstanceData = function (componentId) {
		var compData = compileAPI.getComponentInstanceData(componentId);
		return compData && compData.data || compData;
	};

	this.getSiteProperty = function (propertyName) {
		return compileAPI.getSiteProperty(propertyName);
	};

	this.getCustomSiteProperty = function (propertyName) {
		return compileAPI.getCustomSiteProperty(propertyName);
	};

	this.getDefaultPageProperty = function (propertyName) {
		return compileAPI.getDefaultPageProperty(propertyName);
	};

	this.getCustomPageProperty = function (propertyName, pageId) {
		return compileAPI.getCustomPageProperty(propertyName, pageId);
	};

	this.getCacheKey = function (keyName) {
		// remap external name 'content' to 'caas', otherwise pass through
		return compileAPI.getCacheKey(keyName === this.CACHE_KEY.CONTENT ? 'caas' : keyName);
	};

	this.getURLPrefix = function (prefixName) {
		if (prefixName === this.URL_PREFIX.CDN) {
			return compileAPI.getCDNPrefix();
		} else if (prefixName === this.URL_PREFIX.CONTENT) {
			return compileAPI.getContentUrlPrefix();
		} else if (prefixName === this.URL_PREFIX.COMPONENT_CATALOG) {
			return compileAPI.getComponentCatalogUrlPrefix();
		} else if (prefixName === this.URL_PREFIX.DIST_DIR) {
			return compileAPI.getDistDirUrlPrefix();
		} else if (prefixName === this.URL_PREFIX.SITE_PATH) {
			return compileAPI.getSitePathPrefix();
		} else if (prefixName === this.URL_PREFIX.THEME_DESIGN) {
			return compileAPI.getThemeDesignUrlPrefix();
		} else if (prefixName === this.URL_PREFIX.THEME) {
			return compileAPI.getThemeUrlPrefix();
		} else {
			return '';
		}
	};

	this.createPageLink = function (pageId, options) {
		return compileAPI.getPageLinkInfo(pageId, options || {});
	};
};
CompileComponentAPI.prototype = Object.create(SCSComponentAPI.prototype);


module.exports = CompileComponentAPI;