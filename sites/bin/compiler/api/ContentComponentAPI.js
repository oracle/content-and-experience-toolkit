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

var ContentComponentAPI = function (compileAPI) {

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

	this.getContentClient = function () {
		return compileAPI.getContentClientSync();
	};

	this.getMustache = function () {
		return Mustache;
	};

	this.getMarked = function () {
		return Marked && Marked.marked || Marked;
	};
};
ContentComponentAPI.prototype = Object.create(SCSComponentAPI.prototype);


module.exports = ContentComponentAPI;