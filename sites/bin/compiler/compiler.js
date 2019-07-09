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
 * Copyright (c) 2013 Oracle Corp.
 * All rights reserved.
 *
 * $Id: offline-publisher.js 141546 2016-03-24 23:23:28Z dpeterso $
 */

/*
Sample Invocation:

	node offline-publisher.js
			-siteDir Z:\sitespublish\Demo-Site
			-themesDir Z:\themespublish
			-componentsDir Z:\componentspublish
			-runtimeDir Z:\sitescloudruntime
			-outputDir Z:\OUTPUTDIR
			-loglevel trace
*/

//*********************************************
// Requires
//*********************************************
var fs = require('fs'),
	path = require('path');

var componentsEnabled = false;
if (componentsEnabled) {
	var cheerio = require('cheerio'),
		mustache = require('mustache');
}

//*********************************************
// Configuration
//*********************************************

var siteFolder, // Z:/sitespublish/SiteC/
	themesFolder, // Z:/themespublish/
	componentsFolder, // Z:/componentspublish/
	sitesCloudRuntimeFolder, // Z:/sitescloudruntime/
	outputFolder, // Z:/OUTPUT/SiteC
	outputURL; // http://server:port/{path to output folder}

var structure,
	navMap = {},
	navRoot;
var siteInfo;
var themeName;
var designName;
var styleShim = "";
var slotReuseData;
var layoutInfoRE = /<!--\s*SCS Layout Information:\s*(\{[\s\S]*?\})\s*-->/;
var logLevel = "log";

//*********************************************
// Other root vars
//*********************************************

// TODO: Figure out how to handle 404s.
//   - Missing page.json
//   - Missing Layout
// TODO: Figure out how to handle "pages" of type linkUrl.  Perhaps write a redirecting page?
// TODO: Consider how to handle the Map component, since it makes AJAX requests which are disallowed.

function trace(msg) {
	// ["log", "info", "warn", "error"]
	if (logLevel === "trace") {
		console.log(msg);
	}
}

// Read the structure.json
function readStructure() {
	var filePath = path.join(siteFolder, "structure.json");
	var structureJson = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	var structureObject = JSON.parse(structureJson);

	// Set site global variables here
	siteInfo = structureObject.siteInfo;
	if (!siteInfo) {
		var siteInfoFilePath = path.join(siteFolder, "siteinfo.json");
		siteInfo = {
			base: JSON.parse(fs.readFileSync(siteInfoFilePath, {
				encoding: 'utf8'
			}) || {})
		};
	}
	structure = structureObject.base || structureObject;
	themeName = siteInfo.base.properties.themeName;
	designName = siteInfo.base.properties.designName || 'default';
}

function readStyleShim() {
	/*
	NOTE: This is no longer used, because the jssor-slider paths have been corrected in the mainline code.

	var filePath = path.join( __dirname, "offline-stylefix.css" );
	try {
		styleShim = fs.readFileSync( filePath, { encoding: 'utf8' } );
	} catch( e ) {
		console.log("The style shim could not be loaded.");
	}
	*/
}

function readSlotReuseData() {
	var filePath = path.join(siteFolder, "slots.json");
	var slotReuseJson;

	if (fs.existsSync(filePath)) {
		slotReuseJson = fs.readFileSync(filePath, {
			encoding: 'utf8'
		});
		slotReuseData = JSON.parse(slotReuseJson);
	}
}

function produceSiteNavigationStructure() {
	// Build the site navigation object, setting the "navMap" and "navRoot" globals
	var navNode;
	var pages = structure.pages;
	for (var nodeIndex = 0; nodeIndex < pages.length; nodeIndex++) {
		navNode = pages[nodeIndex];
		navMap[navNode.id] = navNode;
		if (navNode.parentId === null) {
			navRoot = navNode.id;
		}
	}
}

function getPageData(pageId) {
	trace('getPageData: pageId=' + pageId);

	var filePath = path.join(siteFolder, "pages", pageId + ".json");
	trace('getPageData: filePath=' + filePath);

	var pageJson = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	trace('getPageData: pageJson=' + pageJson);

	var pageData = JSON.parse(pageJson);
	trace('getPageData: pageData=' + pageData);

	return pageData;
}

function getThemeLayout(themeName, layoutName) {
	trace('getThemeLayout: themeName=' + themeName + ', layoutName=' + layoutName);

	var filePath = path.join(themesFolder, themeName, "layouts", layoutName);
	trace('getThemeLayout: filePath=' + filePath);

	var layoutMarkup = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	trace('getThemeLayout: layoutMarkup=' + layoutMarkup);

	return layoutMarkup;
}

function resolveLinks(pageModel, sitePrefix) {
	trace('resolveLinks: pageModel=' + pageModel + ', sitePrefix=' + sitePrefix);

	var tempVar = pageModel;
	if (typeof pageModel === 'object') {
		tempVar = JSON.stringify(pageModel);
	}

	var regExpContentUrl = /(<!--\$\s*SCS_CONTENT_URL\s*-->)|(\[!--\$\s*SCS_CONTENT_URL\s*--\])/g;
	var regThemeName = /(<!--\$\s*SCS_THEME_NAME\s*-->)|(\[!--\$\s*SCS_THEME_NAME\s*--\])/g;
	var regDesignName = /(<!--\$\s*SCS_DESIGN_NAME\s*-->)|(\[!--\$\s*SCS_DESIGN_NAME\s*--\])/g;
	var regThemeRoot = /(_scs_theme_root_)/g;
	var regDesignName2 = /(_scs_design_name_)/g;

	tempVar = tempVar.replace(regExpContentUrl, function () {
		return sitePrefix + "content";
	});
	tempVar = tempVar.replace(regThemeRoot, function () {
		return sitePrefix + "_themesdelivery/" + encodeURIComponent(themeName);
	});
	tempVar = tempVar.replace(regDesignName2, function () {
		return encodeURIComponent(designName);
	});
	tempVar = tempVar.replace(regThemeName, function () {
		return encodeURIComponent(themeName);
	});
	tempVar = tempVar.replace(regDesignName, function () {
		return encodeURIComponent(designName);
	});

	if (typeof pageModel === 'object') {
		tempVar = JSON.parse(tempVar);
	}

	return tempVar;
}

function resolveTokens(layoutMarkup, pageModel, sitePrefix) {
	var pageMarkup = layoutMarkup;
	var value;

	// Fix up <!--$SCS_SITE_HEADER--> and <!--$SCS_SITE_FOOTER-->
	value = siteInfo.base.properties.header || '';
	pageMarkup = pageMarkup.replace(/(<!--\$\s*SCS_SITE_HEADER\s*-->)|(\[!--\$\s*SCS_SITE_HEADER\s*--\])/g, value);

	value = siteInfo.base.properties.footer || '';
	pageMarkup = pageMarkup.replace(/(<!--\$\s*SCS_SITE_FOOTER\s*-->)|(\[!--\$\s*SCS_SITE_FOOTER\s*--\])/g, value);

	// Fix up <!--$SCS_PAGE_HEADER--> and <!--$SCS_PAGE_FOOTER-->
	value = pageModel.properties.header || '';
	pageMarkup = pageMarkup.replace(/(<!--\$\s*SCS_PAGE_HEADER\s*-->)|(\[!--\$\s*SCS_PAGE_HEADER\s*--\])/g, value);

	value = pageModel.properties.footer || '';
	pageMarkup = pageMarkup.replace(/(<!--\$\s*SCS_PAGE_FOOTER\s*-->)|(\[!--\$\s*SCS_PAGE_FOOTER\s*--\])/g, value);

	// Because the runtime (compressed) renderer has a copy of require.js inside of it, we can swap out the traditional
	// <script> tag for the renderer and reduce the number of GETs.  (Note that the /_sitescloud/ prefix will be fixed
	// up just below this replace.)
	pageMarkup = pageMarkup.replace(
		/<script\s+data-main\s*=\s*(['"])\/_sitescloud\/renderer\/renderer.js\1\s+src\s*=\s*(['"])\/_sitescloud\/renderer\/require.js\2\s*>/ig,
		'<script src="/_sitescloud/renderer/renderer.js">');

	// Now do the path-based fixups and the token fixups
	pageMarkup = pageMarkup.replace(/(["'])\/_sitescloud\//g, "$1" + sitePrefix + "_sitesclouddelivery/");
	pageMarkup = pageMarkup.replace(/(["'])\/_themes\//g, "$1" + sitePrefix + "_themesdelivery/");
	pageMarkup = resolveLinks(pageMarkup, sitePrefix);

	// Remove the layout information comment
	pageMarkup = pageMarkup.replace(layoutInfoRE, function () {
		return "";
	});

	return pageMarkup;
}

var compiler = {
	setup: function (args) {
		var self = this;

		self.sitePrefix = args.sitePrefix;
		self.pageModel = args.pageModel;
		self.navigationRoot = args.navRoot;
		self.navigationCurr = args.navigationCurr;
		self.structureMap = args.navMap;
		self.siteInfo = args.siteInfo;

		// define the list of supported component compilers
		self.componentCompilers = {};

		// add in the compilers for any supported components
		var supportedComponents = [{
			type: 'scs-contentsearch',
			compiler: 'contentsearch/contentsearch'
		}];
		supportedComponents.forEach(function (componentCompiler) {
			self.componentCompilers[componentCompiler.type] = require('./components/' + componentCompiler.compiler);
		});

		// store the compiled components
		self.compiledComponents = {};
	},
	compileComponentInstance: function (compId, compInstance) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var ComponentCompiler = self.componentCompilers[compInstance.type];
			if (ComponentCompiler) {
				var component = new ComponentCompiler(compId, compInstance);
				component.compile().then(function (compiledComp) {
					// make sure the component can be parsed
					if (compiledComp.content) {
						var $ = cheerio.load('<div>');
						compiledComp.content = $('<div>' + compiledComp.content + '</div>').html();

						// not that this component was compiled by the controller
						compInstance.preRenderedByController = true;
					}
					// store the compiled component
					self.compiledComponents[compId] = compiledComp;
					resolve();
				});
			} else {
				console.log('No component compiler for: ' + compInstance.type);
				resolve();
			}
		});
	},
	compileComponents: function () {
		var self = this,
			compilePromises = [];

		if (componentsEnabled) {
			Object.keys(self.pageModel.componentInstances).forEach(function (compId) {
				compilePromises.push(self.compileComponentInstance(compId, self.pageModel.componentInstances[compId]));
			});
		}

		return Promise.all(compilePromises);
	},
	getSlotDataFromPageModel: function (id) {
		if (this.pageModel.slots && this.pageModel.slots[id]) {
			return this.pageModel.slots[id];
		}
		return null;
	},
	compileSlot: function (slotId) {
		var slotConfig;
		var self = this;
		var slotMarkup = '';

		//*********************************************
		// Get the slot configuration
		//*********************************************	
		slotConfig = this.getSlotDataFromPageModel(slotId);

		// enable this for slot compilation
		if (componentsEnabled && slotConfig) {
			//*********************************************
			// Add in the grid
			//*********************************************	
			if (slotConfig.grid && !slotConfig.preRenderedByController) {
				var $ = cheerio.load('<div/>'),
					$slotObj = $(slotConfig.grid),
					gridUpdated = false;

				// convert the grid to use mustache macros to insert the compiled component content
				// Note: this assumes the compiled component results is valid HTML
				$slotObj.find('div[id]').each(function (index) {
					var $divEle = $(this);
					var componentId = $divEle.attr('id');
					if (self.compiledComponents && self.compiledComponents[componentId] && self.compiledComponents[componentId].content) {
						$divEle.append('<div class="scs-component-bounding-box">{{{' + componentId + '.content}}}</div>');

						// note the grid was updated
						gridUpdated = true;
					}
				});

				if (gridUpdated) {
					// apply the compiled component results to the grid
					try {
						slotMarkup = mustache.render($slotObj.html(), self.compiledComponents);
					} catch (e) {
						console.log('Failed to render slot: ' + slotId);
						console.log(e);
					}

					// note that this slot is "pre-compiled" by the controller(?)
					slotConfig.preRenderedByController = true;
				}
			}
		}

		// return the result
		return slotMarkup;
	},
};

function resolveSlots(pageMarkup, pageModel, sitePrefix) {
	trace('resolveSlots');

	if (componentsEnabled) {
		// define slot macros
		// e.g.: <div id="mySlotId" class="scs-slot scs-responsive">{{#scs-slot}}mySlotId{{/scs-slot}}</div>
		var renderSlot = function (text, render) {
			var slotId = text;
			if (slotId) {
				// compile the components into the slot
				return compiler.compileSlot(slotId);
			} else {
				// can't identify the slot, just return what was there
				return text;
			}
		};
		var rendererModel = {
			'scs-slot': function () {
				return function (text, render) {
					return renderSlot.apply(null, arguments);
				};
			}
		};

		// expand the macros
		pageMarkup = mustache.render(pageMarkup, rendererModel);
	}

	return pageMarkup;
}

function fixupPage(pageId, pageUrl, layoutMarkup, pageModel, sitePrefix) {
	trace('fixupPage: pageUrl=' + pageUrl + ', layoutMarkup=' + layoutMarkup);

	// setup the compiler for this page
	compiler.setup({
		"sitePrefix": sitePrefix,
		"pageModel": pageModel,
		"navigationRoot": navRoot,
		"navigationCurr": (pageId && typeof pageId == 'string') ? parseInt(pageId) : pageId,
		"structureMap": navMap,
		"siteInfo": siteInfo
	});

	// compile all the components asynchronously
	return compiler.compileComponents().then(function () {
		// now we have the compiled components, resolve the page markup 
		var pageMarkup = layoutMarkup;

		pageMarkup = resolveSlots(pageMarkup, pageModel, sitePrefix);
		pageMarkup = resolveTokens(pageMarkup, pageModel, sitePrefix);
		pageMarkup = resolveRenderInfo(pageId, pageMarkup, pageModel, sitePrefix);

		return Promise.resolve(pageMarkup);
	});

}

function encodeHTML(textData) {
	var replacements = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"\'": "&#x27;",
		"/": "&#x2F;"
	};

	var encodedText = textData.replace(/[&"<>'\/]/g, function (m) {
		return replacements[m];
	});

	return encodedText;
}

function getStyleFixup(pageModel, sitePrefix) {
	var styleFix = (styleShim.length > 0) ? ("\n" + styleShim) : "";

	styleFix = resolveTokens(styleFix, pageModel, sitePrefix);

	return styleFix;
}

function resolveRenderInfo(pageId, pageMarkup, pageModel, sitePrefix) {
	trace('resolveRenderInfo');

	var SCSInfo = {
		"sitePrefix": sitePrefix,
		"pageModel": pageModel,
		"navigationRoot": navRoot,
		"navigationCurr": (pageId && typeof pageId == 'string') ? parseInt(pageId) : pageId,
		"structureMap": navMap,
		"siteInfo": siteInfo
	};

	var SCSInfoStr = JSON.stringify(SCSInfo);
	var renderInfo = '';
	renderInfo += '<script id="scsRenderInfo" type="application/json">';
	renderInfo += encodeHTML(SCSInfoStr);
	renderInfo += '</script>';
	renderInfo += '\n<script id="scsRenderObject" type="text/javascript">var require = {waitSeconds: 0};</script>'; // Defining this variable allows us to control the timeout for loading renderer.js
	renderInfo += getStyleFixup(pageModel, sitePrefix);
	renderInfo += getPageModelStyleMarkup(pageModel, sitePrefix);
	var regExp = /(<!--\$\s*SCS_RENDER_INFO\s*-->)|(\[!--\$\s*SCS_RENDER_INFO\s*--\])/g;
	pageMarkup = pageMarkup.replace(regExp, function () {
		return renderInfo;
	});

	return pageMarkup;
}

function getPageModelStyleMarkup(pageModel, sitePrefix) {
	var markup = "";
	var styleData,
		slotId;

	try {
		styleData = pageModel.properties.styles;
		markup += getStyleMarkup("scs-styles-body", "body", sitePrefix, styleData);

		for (slotId in pageModel.slots) {
			styleData = pageModel.slots[slotId].styles;
			markup += getStyleMarkup("scs-slot-styles-" + slotId, "#" + slotId, sitePrefix, styleData);
		}
	} catch (e) {
		markup = "";
	}

	if (markup.length > 0) {
		markup = '\n<style id="scsPageStyles" type="text/css">' + markup + "\n</style>";
	}

	return markup;
}

function getStyleMarkup(id, selector, sitePrefix, stylesArray) {
	var css = "";
	var property,
		i,
		index,
		name,
		value;

	if (Array.isArray(stylesArray) && (stylesArray.length > 0)) {
		// css += '\n<style id="' + encodeHTML(id) + '" type="text/css">';
		css += "\n" + encodeHTML(selector) + " {";

		for (i = 0; i < stylesArray.length; i++) {
			property = stylesArray[i];
			if (typeof property === "string") {
				index = property.indexOf(":");
				if (index >= 0) {
					name = property.substring(0, index).trim();
					value = property.substring(index + 1).trim();
					if ((name.indexOf(">") < 0) && (name.indexOf("<") < 0) &&
						(value.indexOf(">") < 0) && (value.indexOf("<") < 0)) {
						value = resolveLinks(value, sitePrefix);
						css += "\n\t" + name + ": " + value + ";";
					}
				}
			}
		}

		css += "\n}";
		// css += "\n</style>";
	}

	return css;
}

function fixupPageDataWithSlotReuseData(pageModel, layoutName, layoutMarkup) {
	var model,
		slotIds,
		slotId,
		slotData,
		componentId,
		componentInstance,
		componentObject,
		i;

	if (slotReuseData) {
		slotIds = getLayoutSlotIds(layoutName, layoutMarkup);
		for (i = 0; i < slotIds.length; i++) {
			slotId = slotIds[i];

			if ((typeof slotReuseData[slotId] === "object") &&
				(typeof slotReuseData[slotId].base === "object") &&

				// Determine if there is a site override for this slotId
				slotReuseData[slotId].base.site &&
				(typeof slotReuseData[slotId].base.site === "object")) {

				// Merge the slot reuse data into the page model, placing the componentInstances in the proper location
				slotData = JSON.parse(JSON.stringify(slotReuseData[slotId].base.site));

				pageModel.base.slots[slotId] = slotData;
				if (slotData.componentInstances) {
					for (componentId in slotData.componentInstances) {
						componentObject = JSON.parse(JSON.stringify(slotData.componentInstances[componentId]));
						pageModel.base.componentInstances[componentId] = componentObject;
					}
					delete slotData.componentInstances;
				}
			}
		}
	}

	return pageModel;
}

function getLayoutSlotIds(layoutName, layoutMarkup) {
	var slotIds,
		tagMatches,
		tagRE,
		idMatch,
		idRE,
		id,
		i;

	// Figure out what slots are present in this layout markup
	layoutMarkup = layoutMarkup.replace(layoutInfoRE, function (comment, json) {
		try {
			var layoutInfo = JSON.parse(json);
			slotIds = layoutInfo.slotIds;
		} catch (e) {}

		return "";
	});

	// If we're not explicitly told what slots are in the layout, try to discover
	// them using regular expressions.
	if (!Array.isArray(slotIds)) {
		slotIds = [];

		tagRE = /<\w+\s+[^>]+?[Cc][Ll][Aa][Ss][Ss]\s*=\s*(['"])(?:\s*|[^>'"]*?\s+)scs-slot(?:\s*\1|\s+[^>'"]*?\1)[^>]*?>/g;
		tagMatches = layoutMarkup.match(tagRE);
		if (tagMatches) {
			idRE = /\s+id\s*=\s*(['"])([^'">]+)\1(?:\s+|\/?>)/i;
			for (i = 0; i < tagMatches.length; i++) {
				idMatch = tagMatches[i].match(idRE);
				if (idMatch) {
					id = idMatch[2];
					if (id) {
						slotIds.push(id);
					}
				}
			}
		}
	}

	return slotIds;
}

function createDirectory(dirName) {
	trace('createDirectory: dirName=' + dirName);

	var stats,
		parentDirName;

	dirName = path.normalize(dirName);
	if (!fs.existsSync(dirName)) {
		parentDirName = path.dirname(dirName);
		createDirectory(parentDirName); // <<< RECURSION
		fs.mkdirSync(dirName);
	}
}

function writePage(pageUrl, pageMarkup) {
	trace('writePage: pageUrl=' + pageUrl + ', pageMarkup=' + pageMarkup);

	var filePath = path.join(outputFolder, pageUrl);
	trace('writePage: filePath=' + filePath);

	var dirName = path.dirname(filePath);
	createDirectory(dirName);

	fs.writeFileSync(filePath, pageMarkup, {
		encoding: 'utf8'
	});
}

function computeSitePrefix(pageUrl) {
	// Compute the site prefix (./ or ../../../../).  It must end with a /
	var sitePrefix = "./";
	var i;

	var slashes = pageUrl.split('/');
	if (slashes && (slashes.length > 1)) {
		sitePrefix = "";

		for (i = 1; i < slashes.length; i++) {
			sitePrefix += "../";
		}
	}

	trace('computeSitePrefix: pageUrl=' + pageUrl + ', sitePrefix=' + sitePrefix);

	return sitePrefix;
}

function createPage(pageInfo) {
	return new Promise(function (resolve, reject) {
		try {
			if ((typeof pageInfo.linkUrl === "string") && (pageInfo.linkUrl.trim().length > 0)) {
				// Don't emit a page for external links.
				console.log('createPage: Bypassing pageId ' + pageInfo.id + ' having external URL: ' + pageInfo.linkUrl);
				resolve();
			} else {
				console.log('createPage: Processing pageId ' + pageInfo.id + ' at the URL: ' + (outputURL ? outputURL : '') + pageInfo.pageUrl);

				var pageData = getPageData(pageInfo.id);
				var layoutName = (pageData.base || pageData).properties.pageLayout;
				var layoutMarkup = getThemeLayout(themeName, layoutName);
				var sitePrefix = computeSitePrefix(pageInfo.pageUrl);
				pageData = fixupPageDataWithSlotReuseData(pageData, layoutName, layoutMarkup);

				// now fixup the page
				fixupPage(pageInfo.id, pageInfo.pageUrl, layoutMarkup, (pageData.base || pageData), sitePrefix).then(function (pageMarkup) {
					writePage(pageInfo.pageUrl, pageMarkup);
					resolve();
				});
			}
		} catch (e) {
			console.log('Failed to create page: ' + pageInfo.id);
			console.log(e);

			// continue to the next page
			resolve({
				erorr: e
			});
		}
	});
}

function copyFileSync(source, target) {

	var targetFile = target;

	//if target is a directory a new file with the same name will be created
	if (fs.existsSync(target)) {
		if (fs.lstatSync(target).isDirectory()) {
			targetFile = path.join(target, path.basename(source));
		}
	}

	fs.createReadStream(source).pipe(fs.createWriteStream(targetFile));
}

function copyFolderRecursiveSync(source, target) {
	trace('copyFolderRecursiveSync: source=' + source + ', target=' + target);
	var files = [];

	//check if folder needs to be created or integrated
	var targetFolder = path.join(target, path.basename(source));
	if (!fs.existsSync(targetFolder)) {
		fs.mkdirSync(targetFolder);
	}

	//copy
	if (fs.lstatSync(source).isDirectory()) {
		files = fs.readdirSync(source);
		files.forEach(function (file) {
			var curSource = path.join(source, file);
			if (fs.lstatSync(curSource).isDirectory()) {
				copyFolderRecursiveSync(curSource, targetFolder);
			} else {
				copyFileSync(curSource, targetFolder);
			}
		});
	}
}

function copyDirectory(fromDir, toDir) {
	trace('copyDirectory: fromDir=' + fromDir + ', toDir=' + toDir);
	createDirectory(toDir);

	copyFolderRecursiveSync(fromDir, toDir);
}

function copySiteContentDirectory() {
	var srcFilePath = path.join(siteFolder, "content");
	var tgtFilePath = outputFolder;

	copyDirectory(srcFilePath, tgtFilePath);
}

function copySiteCloudDeliveryDirectory() {
	var srcFilePath = path.join(sitesCloudRuntimeFolder, "renderer");
	var tgtFilePath = path.join(outputFolder, "_sitesclouddelivery");
	copyDirectory(srcFilePath, tgtFilePath);
}

function copyThemesDeliveryDirectory() {
	var srcFilePath = path.join(themesFolder, themeName);
	var tgtFilePath = path.join(outputFolder, "_themesdelivery");

	copyDirectory(srcFilePath, tgtFilePath);
}

function copyComponentsDeliveryDirectory() {
	if (componentsFolder) {
		var files = [];
		var srcFilePath = path.join(componentsFolder);
		var tgtFilePath = path.join(outputFolder, "_compdelivery");

		if (fs.lstatSync(srcFilePath).isDirectory()) {
			createDirectory(tgtFilePath);

			files = fs.readdirSync(srcFilePath);
			files.forEach(function (file) {
				var curSource = path.join(srcFilePath, file);
				if (fs.lstatSync(curSource).isDirectory()) {
					copyFolderRecursiveSync(curSource, tgtFilePath);
				} else {
					copyFileSync(curSource, tgtFilePath);
				}
			});
		}
	}
}

var compileSite = function (args) {
	siteFolder = args.siteFolder;
	themesFolder = args.themesFolder;
	componentsFolder = args.componentsFolder;
	sitesCloudRuntimeFolder = args.sitesCloudRuntimeFolder;
	outputFolder = args.outputFolder;
	logLevel = args.logLevel;
	outputURL = args.outputURL;

	console.log("Oracle Content and Experience Site Compiler");
	console.log("Version 0.1");
	console.log("");
	console.log("Configuration:");
	console.log("    -siteFolder              = " + siteFolder);
	console.log("    -themesFolder            = " + themesFolder);
	console.log("    -componentsFolder        = " + componentsFolder);
	console.log("    -sitesCloudRuntimeFolder = " + sitesCloudRuntimeFolder);
	console.log("    -outputFolder            = " + outputFolder);
	console.log("    -outputURL               = " + outputURL);
	console.log("    -logLevel                = " + logLevel);
	console.log("");

	var i;
	var pageInfo;

	readStyleShim();
	readStructure();
	readSlotReuseData();
	produceSiteNavigationStructure();

	// create the array of functions that will execute the createPage promise when called
	var createPagePromises = [];
	structure.pages.forEach(function (pageInfo) {
		createPagePromises.push(function () {
			return createPage(pageInfo);
		});
	});

	// execute page promises serially
	var doCreatePages = createPagePromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function () {
				// wait for the previous promise to complete and then call the function to start executing the next promise
				return nextPromise();
			});
		},
		// Start with a previousPromise value that is a resolved promise 
		Promise.resolve());

	// wait until all pages have been created
	doCreatePages.then(function () {
		console.log('All page creation calls complete.');

		//copySiteContentDirectory();
		//copySiteCloudDeliveryDirectory();
		//copyThemesDeliveryDirectory();
		//copyComponentsDeliveryDirectory();
	});
};

module.exports.compileSite = compileSite;