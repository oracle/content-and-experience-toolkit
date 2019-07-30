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

var componentsEnabled = true;
if (componentsEnabled) {
	var cheerio = require('cheerio');
}

//*********************************************
// Configuration
//*********************************************

// Configured Variables
var siteFolder, // Z:/sitespublish/SiteC/
	themesFolder, // Z:/themespublish/
	componentsFolder, // Z:/componentspublish/
	sitesCloudRuntimeFolder, // Z:/sitescloudruntime/
	outputFolder, // Z:/OUTPUT/SiteC
	outputURL, // http://server:port/{path to output folder}
	logLevel = "log",
	sitesCloudCDN = '', // 'https://cdn.cec.oraclecorp.com/cdn/cec/v19.3.2.31';
	channelAccessToken = ''; // channel access token for the site

// Global Variables
var layoutInfoRE = /<!--\s*SCS Layout Information:\s*(\{[\s\S]*?\})\s*-->/;
var styleShim = "";
var cacheKeys = {};
var useSharedRequireJS = false;
var useOriginalRequireJS = false;
var rootStructure;
var rootSiteInfo;

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

// Determine the available languages from the aggregated structure.json OR by enumerating the file system
// for language code prefixes.
function getAvailableLanguages() {
	var languages = [''];
	var filePath = path.join(siteFolder, '');
	var entries = fs.readdirSync(filePath);
	(entries || []).forEach(function (entry) {
		var index = entry.indexOf('_structure.json');
		if (index > 0) {
			var language = entry.substring(0, index);
			languages.push(language);
		}
	});

	trace("Available Languages: " + languages);
	return languages;
}

function readRootStructure() {
	var filePath = path.join(siteFolder, "structure.json");
	var structureJson = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	var structureObject = JSON.parse(structureJson);

	// Set site global variables here
	rootSiteInfo = structureObject.siteInfo && structureObject.siteInfo.base;
	if (!rootSiteInfo) {
		var siteInfoFilePath = path.join(siteFolder, "siteinfo.json");
		rootSiteInfo = JSON.parse(fs.readFileSync(siteInfoFilePath, {
			encoding: 'utf8'
		})) || {};
	}
	rootStructure = structureObject.base || structureObject;
}

// Read the structure.json
function readStructure(locale) {
	var prefix = locale ? (locale + '_') : '';

	var filePath = path.join(siteFolder, prefix + "structure.json");
	var structureJson = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	var structureObject = JSON.parse(structureJson) || {};

	// Set site global variables here
	var tempSiteInfo = structureObject.siteInfo && structureObject.siteInfo.base;
	if (!tempSiteInfo) {
		var siteInfoFilePath = path.join(siteFolder, prefix + "siteinfo.json");
		tempSiteInfo = JSON.parse(fs.readFileSync(siteInfoFilePath, {
			encoding: 'utf8'
		})) || {};
	}
	var tempStructure = structureObject.base || structureObject;

	// Merge the locale siteInfo and structure into the root
	var siteInfo = mergeObjects(rootSiteInfo, tempSiteInfo);
	var structure = mergeStructure(rootStructure, tempStructure);

	var themeName = siteInfo.properties.themeName;
	var designName = siteInfo.properties.designName || 'default';

	// Configure the channel access token in the siteInfo with the supplied one
	if (channelAccessToken && siteInfo && siteInfo.properties) {
		siteInfo.properties.channelAccessTokens = siteInfo.properties.channelAccessTokens || [];

		// Remove the previous "defaultToken"
		siteInfo.properties.channelAccessTokens = siteInfo.properties.channelAccessTokens.filter(function (element) {
			return element && element.name && (element.name !== 'defaultToken');
		});

		// Add in the new "defaultToken"
		siteInfo.properties.channelAccessTokens.push({
			name: "defaultToken",
			value: channelAccessToken,
			expirationDate: "01\/01\/2099"
		});
	}

	return {
		siteInfo: siteInfo,
		structure: structure,
		themeName: themeName,
		designName: designName
	};
}

function mergeObjects(baseObject, tempObject, destructive) {
	// Make a copy of the objects before proceeding
	var object1 = destructive ? baseObject : JSON.parse(JSON.stringify(baseObject));
	var object2 = destructive ? tempObject : JSON.parse(JSON.stringify(tempObject));

	var recursiveAssign = function (o1, o2) {
		var keys = Object.keys(o1);
		keys.forEach(function (key) {
			if ((typeof o1[key] === 'object') && !Array.isArray(o1[key]) &&
				(typeof o2[key] === 'object') && !Array.isArray(o2[key]) && (o2[key] !== null)) {
				recursiveAssign(o1[key], o2[key]);
			} else if (typeof o2[key] !== 'undefined') {
				o1[key] = o2[key];
			}
		});
	};

	recursiveAssign(object1, object2);

	return object1;
}

function mergeStructure(baseStructure, tempStructure, destructive) {
	baseStructure = destructive ? baseStructure : JSON.parse(JSON.stringify(baseStructure));
	tempStructure = destructive ? tempStructure : JSON.parse(JSON.stringify(tempStructure));

	var basePages = baseStructure.pages;
	var tempPages = tempStructure.pages;

	var tempPagesMap = {};

	if (basePages && Array.isArray(basePages) && tempPages && Array.isArray(tempPages)) {
		// Add the temp pages into a map for faster lookup
		tempPages.forEach(function (page) {
			tempPagesMap[page.id] = page;
		});

		basePages.forEach(function (baseEntry) {
			var id = baseEntry.id;

			// Find the corresponding entry in the tempStructure, if any
			var tempEntry = tempPagesMap[id];
			if (tempEntry) {
				mergeObjects(baseEntry, tempEntry, true);
			}
		});
	}

	return baseStructure;
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

function readSlotReuseData(context) {
	var filePath = path.join(siteFolder, "slots.json");
	var slotReuseJson;
	var slotReuseData;

	if (fs.existsSync(filePath)) {
		slotReuseJson = fs.readFileSync(filePath, {
			encoding: 'utf8'
		});
		slotReuseData = JSON.parse(slotReuseJson);
	}

	context.slotReuseData = slotReuseData;
}

function produceSiteNavigationStructure(context) {
	var navMap = {};
	var navRoot;

	// Build the site navigation object, setting the "navMap" and "navRoot" globals
	var navNode;
	var pages = context.structure.pages;
	for (var nodeIndex = 0; nodeIndex < pages.length; nodeIndex++) {
		navNode = pages[nodeIndex];
		navMap[navNode.id] = navNode;
		if (navNode.parentId === null) {
			navRoot = navNode.id;
		}
	}

	context.navMap = navMap;
	context.navRoot = navRoot;
}

function getPageData(context, pageId) {
	trace('getPageData: pageId=' + pageId + ', locale=' + context.locale);

	var filePath = path.join(siteFolder, "pages", pageId + ".json");
	trace('getPageData: filePath=' + filePath);

	var pageJson = fs.readFileSync(filePath, {
		encoding: 'utf8'
	});
	trace('getPageData: pageJson=' + pageJson);

	var pageData = JSON.parse(pageJson);
	trace('getPageData: pageData=' + pageData);

	// Load the locale page data, if any
	var localePageData;
	if (context.locale) {
		filePath = path.join(siteFolder, "pages", context.locale + "_" + pageId + ".json");
		pageJson = fs.readFileSync(filePath, {
			encoding: 'utf8'
		});
		localePageData = JSON.parse(pageJson);
		localePageData = (localePageData && localePageData.base) || localePageData;

		// Layer the properties of the localePageData into the pageData
		if (pageData.properties && localePageData.properties) {
			mergeObjects(pageData.properties, localePageData.properties, true);
		}
	}

	return {
		pageData: pageData,
		localePageData: localePageData
	};
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

function resolveLinks(pageModel, context, sitePrefix) {
	trace('resolveLinks: pageModel=' + pageModel + ', sitePrefix=' + sitePrefix);

	var tempVar = pageModel;
	if (typeof pageModel === 'object') {
		tempVar = JSON.stringify(pageModel);
	}

	var regExpContentUrl = /(<!--\$\s*SCS_CONTENT_URL\s*-->)|(\[!--\$\s*SCS_CONTENT_URL\s*--\])/g;
	var regExpCatalogUrl = /(<!--\$\s*SCS_COMP_CATALOG_URL\s*-->)|(\[!--\$\s*SCS_COMP_CATALOG_URL\s*--\])/g;
	var regExpDistFolder = /(<!--\$\s*SCS_DIST_FOLDER\s*-->)|(\[!--\$\s*SCS_DIST_FOLDER\s*--\])/g;
	var regExpDistImgFldr = /(<!--\$\s*SCS_DIST_IMG_FOLDER\s*-->)|(\[!--\$\s*SCS_DIST_IMG_FOLDER\s*--\])/g;
	var regThemeName = /(<!--\$\s*SCS_THEME_NAME\s*-->)|(\[!--\$\s*SCS_THEME_NAME\s*--\])/g;
	var regDesignName = /(<!--\$\s*SCS_DESIGN_NAME\s*-->)|(\[!--\$\s*SCS_DESIGN_NAME\s*--\])/g;
	var regRendererPath = /(<!--\$\s*SCS_RENDERER_PATH\s*-->)|(\[!--\$\s*SCS_RENDERER_PATH\s*--\])/g;
	var regSitePath = /(<!--\$\s*SCS_SITE_PATH\s*-->)|(\[!--\$\s*SCS_SITE_PATH\s*--\])/g;
	var regPageLink = /\[!--\$\s*SCS_PAGE\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_PAGE\s*--\]/g;
	var regDigitalAsset = /\[!--\$\s*SCS_DIGITAL_ASSET\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET\s*--\]/g;
	var regDigitalAssetPublished = /\[!--\$\s*SCS_DIGITAL_ASSET_PUBLISHED\s*--\]\s*(.*?)\s*\[\/!--\$\s*SCS_DIGITAL_ASSET_PUBLISHED\s*--\]/g;
	var regThemeRoot = /(_scs_theme_root_)/g;
	var regDesignName2 = /(_scs_design_name_)/g;
	var regTel = /\[!--\$SCS_TEL--\]*(.*?) *\[\/!--\$SCS_TEL--\]/g;
	var regViewModeOnly = /<!--\s*SCS View Mode:([\s\S]*?)-->/g;

	var productCacheKey = cacheKeys.product ? (cacheKeys.product + '/') : '';
	var siteCacheKey = cacheKeys.site ? (cacheKeys.site + '/') : '';
	var themeCacheKey = cacheKeys.theme ? (cacheKeys.theme + '/') : '';
	var componentCacheKey = cacheKeys.component ? (cacheKeys.component + '/') : '';
	var caasCacheKey = cacheKeys.caas ? ('?cb=' + cacheKeys.caas) : '';
	var accessTokens = context.siteInfo.properties.channelAccessTokens || [];
	var channelToken = '';

	// find the access token
	for (var i = 0; i < accessTokens.length; i++) {
		var tokenEntry = accessTokens[i];
		if (tokenEntry.name === 'defaultToken') {
			channelToken = (caasCacheKey ? '&' : '?') + 'channelToken=' + tokenEntry.value;
			break;
		}
	}

	var omitFinalSlash = function (str) {
		var ret = str.replace(/\/+$/, function () { return ''; });
		return ret;
	};

	// tempVar = tempVar.replace(regExpContentUrl2, function(){ return SCS.sitePrefix + "content"; });
	tempVar = tempVar.replace(regExpContentUrl, function () { return sitePrefix + siteCacheKey + "content"; });
	tempVar = tempVar.replace(regExpCatalogUrl, function () { return sitePrefix + componentCacheKey + '_compdelivery'; });
	tempVar = tempVar.replace(regExpDistFolder, function () { return getProductUrl({ sitePrefix: sitePrefix }); });
	tempVar = tempVar.replace(regExpDistImgFldr, function () { return getProductUrl({ sitePrefix: sitePrefix }) + '/renderer'; });
	tempVar = tempVar.replace(regRendererPath, function () { return getProductUrl({ sitePrefix: sitePrefix }) + '/renderer'; });

	tempVar = tempVar.replace(regSitePath, function () { return omitFinalSlash(sitePrefix + siteCacheKey); });

	tempVar = tempVar.replace(regThemeRoot, function () { return sitePrefix + themeCacheKey + "_themesdelivery/" + encodeURIComponent(context.siteInfo.properties.themeName); });
	tempVar = tempVar.replace(regDesignName2, function () { return encodeURIComponent(context.siteInfo.properties.designName || 'default'); });

	tempVar = tempVar.replace(regThemeName, function () { return encodeURIComponent(context.siteInfo.properties.themeName); });
	tempVar = tempVar.replace(regDesignName, function () { return encodeURIComponent(context.siteInfo.properties.designName || 'default'); });

	// Also fix up [!--$SCS_PAGE--]42[/!--$SCS_PAGE--] links that might appear in inline component data
	// Also handle params [!--$SCS_PAGE--]42|param1=firstParam&amp;param2=secondParam[/!--$SCS_PAGE--] 
	tempVar = tempVar.replace(regPageLink, function (match, pageId) {
		var replacement;
		var linkData = getPageLinkData(pageId, sitePrefix, context.navMap, context.pageLocale);
		if (linkData && (typeof linkData.href === 'string')) {
			replacement = linkData.href;
		}

		return replacement;
	});

	var generateDigitalAssetLink = function (parameters) {
		// Account for rendition parameters, if present
		var params = parameters.split(',');

		var contentId = params[0].trim();
		var renditionId = (params.length > 1) ? params[1].trim() : '';
		var format = (params.length > 2) ? params[2].trim() : '';
		var separator = (caasCacheKey || channelToken) ? '&' : '?';

		var url = (renditionId && format) ?
			(contentId + '/' + renditionId + caasCacheKey + channelToken + separator + 'format=' + format) :
			(contentId + '/native' + caasCacheKey + channelToken);

		if ((params.length > 3) && /^(true|1)/i.test(params[3].trim())) {
			url += (url.indexOf('?') < 0) ? '?' : '&';
			url += 'download=true';
		}

		return url;
	};

	// fix up [!--$SCS_DIGITAL_ASSET--]contentId[/!--$SCS_DIGITAL_ASSET--] links that might appear in inline component data
	tempVar = tempVar.replace(regDigitalAsset, function (match, parameters) {
		return '/content/published/api/v1.1/assets/' + generateDigitalAssetLink(parameters);
	});

	// fix up [!--$SCS_DIGITAL_ASSET_PUBLISHED--]contentId[/!--$SCS_DIGITAL_ASSET_PUBLISHED--] links that might appear in inline component data
	tempVar = tempVar.replace(regDigitalAssetPublished, function (match, parameters) {
		return '/content/published/api/v1.1/assets/' + generateDigitalAssetLink(parameters);
	});

	// fix up [!--$SCS_TEL--]location[!--\$SCS_TEL--]
	tempVar = tempVar.replace(regTel, function (matchString, fieldName) {
		return 'tel:' + encodeURI(fieldName);
	});

	// fix up <!-- SCS View Mode: -->
	tempVar = tempVar.replace(regViewModeOnly, function (matchString, viewModeScript) {
		return viewModeScript;
	});

	if (typeof pageModel === 'object') {
		tempVar = JSON.parse(tempVar);
	}

	return tempVar;
}

function parsePageIdAndParams(linkText) {
	// CKEditor encodes "&" to "&amp;" in page links, decode the entry
	var pageLink = linkText.replace(/\&amp\;/g, '&');

	// default the values (pageId === pageLink)
	var pageValues = {
		pageId: pageLink,
		pageParams: ''
	};

	// check for additional parameters
	// "100|a=b&c=d" or "|a=b&c=d" so extract the page ID (may be an empty string)
	if (pageLink && pageLink.indexOf('|') !== -1) {
		// get the pageId (may be empty)
		pageValues.pageId = pageLink.substr(0, pageLink.indexOf('|'));

		// add in anything else
		pageValues.pageParams = pageLink.substr(pageLink.indexOf('|') + 1) || '';
	}

	return pageValues;
}

function getPageLinkData(pageEntry, sitePrefix, structureMap, pageLocale) {
	var pageValues = parsePageIdAndParams(pageEntry),
		url = '',
		pageId = pageValues.pageId,
		data,
		hideInNavigation = false,
		pageUrl = null,
		target = "";


	// Find the supplied pageId in the navigation, and obtain the pageUrl
	if (structureMap &&
		(
			(typeof pageId === "number") ||
			((typeof pageId === "string") && pageId)
		)) {
		var navNode = structureMap[pageId];
		if (navNode) {
			if ((typeof navNode.linkUrl === "string") && (navNode.linkUrl.trim().length > 0)) {
				url = navNode.linkUrl.trim();

				if (typeof navNode.linkTarget === "string") {
					target = navNode.linkTarget.trim();
				}
			} else {
				pageUrl = navNode.pageUrl;
				if (pageUrl) {
					// maintain locale for navigation between pages
					var locale = pageLocale; // this.data.locale;
					if (locale) {
						var siteLocalePrefix = combineUrlSegments(sitePrefix, locale);
						url = combineUrlSegments(siteLocalePrefix, pageUrl);
					} else {
						url = combineUrlSegments(sitePrefix, pageUrl);
					}
				}
			}

			hideInNavigation = (true === navNode.hideInNavigation);
		}
	}

	// add in any parameters
	if (pageValues.pageParams) {
		var joinChar = url.indexOf('?') === -1 ? '?' : '&';
		url += (joinChar + pageValues.pageParams);
	}

	if (url) {
		data = {
			href: url,
			target: target,
			hideInNavigation: hideInNavigation
		};
	}

	return data;
}

// return first "isDetail" or "isSearch" page in the hierarchy
function getDefaultPage(structureMap, navigationRoot, pageOption) {
	var getFirstDetailPage = function (page, childFunction) {
		var firstDetailPage = '';

		// Look for the first page marked as detailPage in the site hierarchy.
		if (page !== null) {
			if (page[pageOption]) {
				return page.id.toString();
			}

			// handle any child pages
			if (page.children && page.children.length > 0) {
				// Once a detail page is found, break out of the loop.
				page.children.some(function (child) {
					firstDetailPage = getFirstDetailPage(childFunction(child), childFunction);
					return firstDetailPage !== '';
				});
			}
		}
		return firstDetailPage;
	};
	return getFirstDetailPage(structureMap[navigationRoot], function (child) {
		return structureMap[child];
	});
}


function combineUrlSegments(segment1, segment2) {
	var url = "";

	if ((typeof segment1 == "string") &&
		(typeof segment2 == "string") &&
		(segment1.length > 0) &&
		(segment2.length > 0)) {
		if (((segment1.charAt(segment1.length - 1) == '/') && (segment2.charAt(0) == '/'))) {
			url = segment1 + segment2.substring(1);
		} else if (((segment1.charAt(segment1.length - 1) == '/') && (segment2.charAt(0) != '/')) ||
			((segment1.charAt(segment1.length - 1) != '/') && (segment2.charAt(0) == '/'))) {
			url = segment1 + segment2;
		} else {
			url = segment1 + '/' + segment2;
		}
	}

	return url;
}

function resolveTokens(layoutMarkup, pageModel, context, sitePrefix) {
	var pageMarkup = layoutMarkup;
	var value;

	// Fix up <!--$SCS_SITE_HEADER--> and <!--$SCS_SITE_FOOTER-->
	value = context.siteInfo.properties.header || '';
	pageMarkup = pageMarkup.replace(/(<!--\$\s*SCS_SITE_HEADER\s*-->)|(\[!--\$\s*SCS_SITE_HEADER\s*--\])/g, value);

	value = context.siteInfo.properties.footer || '';
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

	// Chrome has an "intervention" that will issue a warning and may block a load of
	// our require.js from a different domain -- even if that other domain is a CDN.
	// See https://www.chromestatus.com/feature/5718547946799104
	// So, add a special fixup for require.js to allow the user to control the behavior.
	pageMarkup = pageMarkup.replace(/(["'])\/_sitescloud(\/renderer\/require\.js)/g,
		"$1" + getProductUrl({
			sitePrefix: sitePrefix,
			useCDN: !useSharedRequireJS && !useOriginalRequireJS,
			useSharedUrl: useSharedRequireJS
		}) + "$2");

	// Now do the path-based fixups and the token fixups
	pageMarkup = pageMarkup.replace(/(["'])\/_sitescloud\//g, "$1" + getProductUrl({ sitePrefix: sitePrefix }) + "/");
	pageMarkup = pageMarkup.replace(/(["'])\/_themes\//g, "$1" + sitePrefix + "_themesdelivery/");
	pageMarkup = resolveLinks(pageMarkup, context, sitePrefix);

	var styleMarkup = getPageModelStyleMarkup(pageModel, context, sitePrefix);
	if (styleMarkup) {
		pageMarkup = pageMarkup.replace(/(\s+|>)(<\/head\s*>(?:\s+|<))/i, function (arg1, arg2, arg3) {
			var replacement = arg2 + styleMarkup + arg3;
			styleMarkup = ''; // If we successfully added the styles before the </head>, reset this so it is not added in the SCS_RENDER_INFO token
			return replacement;
		});
	}

	// Fix up the page layout with the Web Analytics script
	var regExpAnalyticsScript = /(<!--\$\s*SCS_WEB_ANALYTICS_SCRIPT\s*-->)|(\[!--\$\s*SCS_WEB_ANALYTICS_SCRIPT\s*--\])/g;
	var analyticsMarkup = getWebAnalyticsMarkup(pageModel, context) || '';
	var analyticsTagReplaced = false;
	pageMarkup = pageMarkup.replace(regExpAnalyticsScript, function (arg1, arg2, arg3) {
		analyticsTagReplaced = true;
		return analyticsMarkup;
	});
	if (analyticsMarkup && !analyticsTagReplaced) {
		pageMarkup = pageMarkup.replace(/(\s+|>)(<\/head\s*>(?:\s+|<))/i, function (arg1, arg2, arg3) {
			return (arg2 + analyticsMarkup + arg3);
		});
	}

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
		self.navigationRoot = args.navigationRoot;
		self.navigationCurr = args.navigationCurr;
		self.structureMap = args.structureMap;
		self.siteInfo = args.siteInfo;
		self.reportedMessages = {}; 

		// define the list of supported component compilers
		self.componentCompilers = {};

		// add in the compilers for any supported components
		var componentCompilers = require('./components/component-compilers');
		componentCompilers.forEach(function (componentCompiler) {
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
				var component = new ComponentCompiler(compId, compInstance, componentsFolder);
				// ToDo: pass SCSRenderAPI equivalent through
				var SCSCompileAPI = {
					channelAccessToken: channelAccessToken,
					getComponentInstanceData: function (instanceId) {
						return self.pageModel.componentInstances[instanceId];
					},
					getChannelAccessToken: function () {
						return channelAccessToken;
					},
					getSiteId: function () {
						return path.basename(siteFolder);
					},
					getDetailPageId: function () {
						return getDefaultPage(self.structureMap, self.navigationRoot, 'isDetailPage');
					},
					getPageURL: function (pageId) {
						var linkData = getPageLinkData(pageId, self.sitePrefix, self.structureMap, self.localePageModel),
							pageURL = '';

						if (linkData && (typeof linkData.href === 'string')) {
							pageURL = linkData.href;
						}

						return pageURL;
					}
				};
				component.compile({
					SCSCompileAPI: SCSCompileAPI
				}).then(function (compiledComp) {
					// make sure the component can be parsed
					if (compiledComp.content) {
						var $ = cheerio.load('<div>');
						compiledComp.content = $('<div>' + compiledComp.content + '</div>').html();
					}
					// store the compiled component
					self.compiledComponents[compId] = compiledComp;
					resolve();
				});
			} else {
				var message = 'No component compiler for: ' + compInstance.type;
				if (!self.reportedMessages[message]) {
					self.reportedMessages[message] = 'done';
					console.log(message);
				}
				resolve();
			}
		});
	},
	compileComponents: function () {
		var self = this,
			compilePromises = [];

		if (componentsEnabled && self.pageModel.componentInstances) {
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

		var compiledComponentIds = [];

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
					$slotObj = $('<div>' + slotConfig.grid + '</div>'),
					tempSlotMarkup = slotConfig.grid,
					gridUpdated = false,
					componentIds = [],
					index;
				var content,
					tempMarkup,
					componentId,
					parentClasses;

				// convert the grid to use mustache macros to insert the compiled component content
				// Note: this assumes the compiled component results is valid HTML
				$slotObj.find('div[id]').each(function (index) {
					var id = $(this).attr('id');
					componentIds.push(id);
				});

				for (index = 0; index < componentIds.length; index++) {
					componentId = componentIds[index];
					if (self.compiledComponents && self.compiledComponents[componentId] && self.compiledComponents[componentId].content) {
						content = self.compiledComponents[componentId].content;

						// Some container components, like Component Groups and Section Layouts, do not use the bounding box div
						if (!self.compiledComponents[componentId].omitBoundingBox) {
							content = '<div class="scs-component-bounding-box">' + content + '</div>';
						}

						// Write the component markup into the component's div
						tempMarkup = replaceTagContent(tempSlotMarkup, componentId, content, { append: true });
						if (typeof tempMarkup === 'string') {
							compiledComponentIds.push(componentId);
							tempSlotMarkup = tempMarkup;
							gridUpdated = true;

							// If the component added markup having sub-components, add those to the list of components to process
							if (Array.isArray(self.compiledComponents[componentId].componentIds)) {
								Array.prototype.push.apply(componentIds, self.compiledComponents[componentId].componentIds);
							}

							// Some components, like Component Groups, want to set class names into the component div tag
							parentClasses = self.compiledComponents[componentId].parentClasses;
							if (Array.isArray(parentClasses) && (parentClasses.length > 0)) {
								tempMarkup = replaceTagAttributes(tempSlotMarkup, componentId, { class: parentClasses.join(' ') });
								if (typeof tempMarkup === 'string') {
									tempSlotMarkup = tempMarkup;
								}
							}
						}
					}
				}

				if (gridUpdated) {
					slotMarkup = tempSlotMarkup;
				}
			}
		}

		// return the result
		return slotMarkup && {
			slotMarkup: slotMarkup,
			compiledComponentIds: compiledComponentIds
		};
	},
};

function resolveSlots(pageMarkup, pageModel, sitePrefix) {
	trace('resolveSlots');
	var slotId,
		slotInfo,
		slotConfig,
		tempPageLayout,
		newPageLayout = pageMarkup,
		id,
		i;

	if (componentsEnabled) {
		if (pageModel && pageModel.slots) {
			for (slotId in pageModel.slots) {
				if (Object.prototype.hasOwnProperty.call(pageModel.slots, slotId) &&
					(slotConfig = pageModel.slots[slotId]) &&
					slotConfig.grid && (typeof slotConfig.grid === 'string')) {

					slotInfo = compiler.compileSlot(slotId);
					if (slotInfo) {
						tempPageLayout = replaceTagContent(newPageLayout, slotId, slotInfo.slotMarkup, { append: true, verifyClass: 'scs-slot' });
						if (typeof tempPageLayout === 'string') {
							newPageLayout = tempPageLayout;

							slotConfig.preRenderedByController = true;

							// Also mark the rendered components
							for (i = 0; i < slotInfo.compiledComponentIds.length; i++) {
								id = slotInfo.compiledComponentIds[i];
								if (pageModel.componentInstances && pageModel.componentInstances[id]) {
									pageModel.componentInstances[id].preRenderedByController = true;
								}
							}
						}
					}
				}
			}
		}

		pageMarkup = newPageLayout;
	}

	return pageMarkup;
}

function fixupPage(pageId, pageUrl, layoutMarkup, pageModel, localePageModel, context, sitePrefix) {
	trace('fixupPage: pageUrl=' + pageUrl + ', layoutMarkup=' + layoutMarkup);

	// Fill in the inline components
	var pageMarkup = preFillPageLayout(layoutMarkup, pageModel, localePageModel, context);

	// setup the compiler for this page
	compiler.setup({
		"sitePrefix": sitePrefix,
		"pageModel": pageModel,
		"localePageModel": localePageModel,
		"navigationRoot": context.navRoot,
		"navigationCurr": (pageId && typeof pageId == 'string') ? parseInt(pageId) : pageId,
		"structureMap": context.navMap,
		"siteInfo": context.siteInfo
	});

	// compile all the components asynchronously
	return compiler.compileComponents().then(function () {
		// now we have the compiled components, resolve the page markup 
		pageMarkup = resolveSlots(pageMarkup, pageModel, sitePrefix);
		pageMarkup = resolveTokens(pageMarkup, pageModel, context, sitePrefix);
		pageMarkup = resolveRenderInfo(pageId, pageMarkup, pageModel, localePageModel, context, sitePrefix);

		return Promise.resolve(pageMarkup);
	});
}

// Returns the product URL, including cache key, if any.  Uses the CDN if available.
// The returned URL will not have a trailing slash.
function getProductUrl(params) {
	params = params || {};
	// Available Parameters:
	// - params.useCDN       (true)
	// - params.useCacheKeys (true)
	// - params.useSharedUrl (false)
	// - params.sitePrefix   (String)

	var useCacheKeysIsFalse = (params.useCacheKeys === false);
	var productCacheKey = (!useCacheKeysIsFalse && cacheKeys.product) ? cacheKeys.product : '';
	var productCacheKey1 = productCacheKey ? ('/' + cacheKeys.product) : '';
	var productCacheKey2 = productCacheKey ? (cacheKeys.product + '/') : '';
	var productUrl = params.useSharedUrl ?
		('/_sitesclouddelivery' + productCacheKey1) :
		(params.sitePrefix + productCacheKey2 + "_sitesclouddelivery");

	var useCDNIsFalse = (params.useCDN === false);
	if (sitesCloudCDN && (typeof sitesCloudCDN === 'string') && !useCDNIsFalse) {
		productUrl = sitesCloudCDN + '/_sitesclouddelivery';
	}

	return productUrl;
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

function getStyleFixup(pageModel, context, sitePrefix) {
	var styleFix = (styleShim.length > 0) ? ("\n" + styleShim) : "";

	styleFix = resolveTokens(styleFix, pageModel, context, sitePrefix);

	return styleFix;
}

function resolveRenderInfo(pageId, pageMarkup, pageModel, localePageModel, context, sitePrefix) {
	trace('resolveRenderInfo');

	var SCSInfo = {
		"siteId": (context.siteInfo && context.siteInfo.properties && context.siteInfo.properties.siteName) ? context.siteInfo.properties.siteName : null,
		"sitePrefix": sitePrefix,
		"pageModel": pageModel,
		"localePageModel": localePageModel,
		"pageLanguageCode": context.pageLocale,
		"navigationRoot": context.navRoot,
		"navigationCurr": (pageId && typeof pageId == 'string') ? parseInt(pageId) : pageId,
		"structureMap": context.navMap,
		"siteInfo": context.siteInfo,
		"pageState": 'compiled',
		//    "placeholderContent": this.data.placeholderContent,
		//    "deviceInfo": SCS.getDeviceInfo(),
		"sitesCloudCDN": ((typeof sitesCloudCDN === 'string') && sitesCloudCDN) || '',
		"cacheKeys": cacheKeys || null,
	};

	var SCSInfoStr = JSON.stringify(SCSInfo);
	var renderInfo = '';
	renderInfo += '<script id="scsRenderInfo" type="application/json">';
	renderInfo += encodeHTML(SCSInfoStr);
	renderInfo += '</script>';
	renderInfo += '\n<script id="scsRenderObject" type="text/javascript">var require = {waitSeconds: 0};</script>'; // Defining this variable allows us to control the timeout for loading renderer.js
	renderInfo += getStyleFixup(pageModel, context, sitePrefix);
	var regExp = /(<!--\$\s*SCS_RENDER_INFO\s*-->)|(\[!--\$\s*SCS_RENDER_INFO\s*--\])/g;
	pageMarkup = pageMarkup.replace(regExp, function () {
		return renderInfo;
	});

	return pageMarkup;
}

function preFillPageLayout(pageLayout, pageModel, localePageModel, context) {
	var newPageLayout = pageLayout;
	var tempPageLayout,
		contentPrefix,
		contentSuffix,
		isInlineComponent,
		componentInstances,
		componentInstanceObject,
		componentInstanceData,
		localeInstanceObject,
		localeInstanceData,
		componentId,
		componentAttributes;

	localePageModel = localePageModel || {};

	// Iterate through the slots, prefilling them with the grids
	/*
	if( pageModel && pageModel.slots )
	{
		for( slotId in pageModel.slots )
		{
			slotData = pageModel.slots[slotId];
			if( slotData && slotData.grid &&
				( typeof slotData.grid === 'string' ) )
			{
				tempPageLayout = replaceTagContent( newPageLayout, slotId, slotData.grid, {append: true} );
				if( typeof tempPageLayout === 'string' )
				{
					newPageLayout = tempPageLayout;
					slotData.preRenderedByController = true;
				}
			}
		}
	}
	*/

	// Iterate through the components, prefilling them if they have "innerHTML" declared
	if (pageModel && pageModel.componentInstances) {
		componentInstances = pageModel.componentInstances;
		for (componentId in componentInstances) {
			if (componentInstances.hasOwnProperty(componentId) &&
				(typeof componentInstances[componentId] === 'object')) {
				componentInstanceObject = componentInstances[componentId];
				localeInstanceObject = localePageModel.componentInstances && localePageModel.componentInstances[componentId] || {};

				if (componentInstanceObject) {
					componentInstanceData = componentInstanceObject.data;
					localeInstanceData = localeInstanceObject.data || {};

					isInlineComponent = (typeof componentInstanceObject.type === 'string') && (componentInstanceObject.type.indexOf('scs-inline-') === 0);
					if (isInlineComponent) {
						if (componentInstanceData && (typeof componentInstanceData.innerHTML === 'string')) {
							var innerHTML = localeInstanceData.innerHTML || componentInstanceData.innerHTML;
							contentPrefix = isInlineComponent ? '' : '<div class="scs-component-bounding-box">';
							contentSuffix = isInlineComponent ? '' : '</div>';
							tempPageLayout = replaceTagContent(newPageLayout, componentId, contentPrefix + innerHTML + contentSuffix);
							if (typeof tempPageLayout === 'string') {
								newPageLayout = tempPageLayout;
								componentInstanceObject.preRenderedByController = true;
							}
						}

						componentAttributes = getComponentAttributes(componentInstanceData, localeInstanceData);
						if (componentAttributes && (typeof componentAttributes === 'object')) {
							newPageLayout = replaceTagAttributes(newPageLayout, componentId, componentAttributes);
							componentInstanceObject.preRenderedByController = true;
						}
					}
				}
			}
		}
	}

	return newPageLayout;
}

function getComponentAttributes(componentInstanceData, localeInstanceData) {
	var response,
		property,
		attribute,
		attributes = {},
		attr_prefix = "attr_",
		localeData = localeInstanceData || {};

	if (componentInstanceData && (typeof componentInstanceData === 'object')) {
		for (property in componentInstanceData) {
			if (property.substring(0, attr_prefix.length) == attr_prefix) {
				attribute = property.substring(attr_prefix.length);
				if (attribute) {
					attributes[attribute] = localeData[property] || componentInstanceData[property];
					response = attributes;
				}
			}
		}
	}

	return response;
}

function replaceTagAttributes(layout, id, attributes) {
	var tempLayout = layout;
	var reString = '(<\\w+\\s+)[^>]*[Ii][Dd]=(["\']?)' + id + '\\2(>|[^>]*)>';
	var startTagPos,
		startContentPos,
		reStartTag,
		tag,
		tagStart,
		tagEnd,
		tagAttributes,
		isEmptyElementTag,
		matchResult,
		mergedAttributes = {},
		mergedAttributeString = "",
		attribute = "";

	try {
		if (layout && id && Object.keys(attributes).length > 0) {

			// Find the opening tag
			reStartTag = new RegExp(reString, 'g');
			matchResult = reStartTag.exec(layout);

			if (matchResult) {
				startTagPos = matchResult.index;
				startContentPos = reStartTag.lastIndex;

				tag = layout.substring(startTagPos, startContentPos);
				isEmptyElementTag = (tag[tag.length - 2] == '/');
				tagStart = matchResult[1];
				tagEnd = isEmptyElementTag ? '/>' : '>';

				tagAttributes = tag.substring(tagStart.length, tag.length - tagEnd.length);

				mergedAttributes = parseTagAttributes(tagAttributes);

				// then merge the new attribute set into/over the original
				for (attribute in attributes) {
					if (Object.prototype.hasOwnProperty.call(attributes, attribute)) {
						mergedAttributes[attribute] = attributes[attribute];
					}
				}

				mergedAttributeString = "";

				for (attribute in mergedAttributes) {
					if (mergedAttributes[attribute] === undefined) {
						mergedAttributeString += attribute + ' ';
					} else {
						mergedAttributeString += attribute + '="' + mergedAttributes[attribute] + '" ';
					}
				}

				// Now, do the replacement
				tempLayout = layout.substring(0, startTagPos + tagStart.length);
				tempLayout += mergedAttributeString;
				tempLayout += layout.substring(startTagPos + tagStart.length + tagAttributes.length);
			}
		}
	}
	catch (e) {
		trace('Failed to replace attributes: ' + e.message);
	}

	return tempLayout;
}

function parseTagAttributes(attString) {
	var parsedAttributes = {},
		name = "",
		value = "",
		char = "",
		delim = "",
		limit = attString.length,
		start = 0,
		pos = 0;

	while (pos >= 0 && pos < limit) {

		// look for the start of the name...
		for (; pos < limit; pos++) {
			char = attString.charAt(pos);
			if (char != " ") {
				break;
			}
		}

		if (pos == limit) {
			break;
		}

		start = pos;

		// look for the end of the name...
		for (; pos < limit; pos++) {
			char = attString.charAt(pos);
			if (char == " " || char == "=") {
				break;
			}
		}

		name = attString.substr(start, pos - start);

		// look for the "="
		for (; pos < limit; pos++) {
			char = attString.charAt(pos);
			if (char != " ") {
				break;
			}
		}

		if (char != "=") {
			parsedAttributes[name] = undefined;
			start = pos;
			continue;	// this was an attribute with no value
		}

		pos += 1;	// skip past the "="

		// look for the start of the value...
		for (; pos < limit; pos++) {
			char = attString.charAt(pos);
			if (char != " ") {
				break;
			}
		}

		if (char == "'" || char == '"') {
			delim = char;
			pos += 1;
		}
		else {
			delim = " ";
		}

		start = pos;

		for (; pos < limit; pos++) {
			char = attString.charAt(pos);
			if (char == delim) {
				break;
			}
		}

		value = attString.substr(start, pos - start);

		parsedAttributes[name] = value;

		pos++;	// skip past the delim
	}

	return parsedAttributes;
}

function replaceTagContent(layout, id, value, options) {
	var tempLayout = null;
	var startTagPos,
		startContentPos,
		endTagPos,
		tagName,
		reStartTag,
		matchResult;

	options = options || {};

	var verifyFunction = options.verifyClass ? function () {
		var ok = false;

		var tag = layout.substring(startTagPos, startContentPos);
		var isEmptyElementTag = (tag[tag.length - 2] === '/');
		var tagStart = matchResult[1];
		var tagEnd = isEmptyElementTag ? '/>' : '>';
		var tagAttributes = tag.substring(tagStart.length, tag.length - tagEnd.length);
		var attributes = parseTagAttributes(tagAttributes);
		if (attributes.class) {
			ok = attributes.class.search('(^|\\s+)' + options.verifyClass + '($|\\s+)') >= 0;
		}

		return ok;
	} : function () {
		return true;
	};

	try {
		reStartTag = new RegExp('(<(\\w+)\\s+)[^>]*[Ii][Dd]=(["\']?)' + id + '\\3(>|[^>]*)>', 'g');
		// Find the opening tag
		matchResult = reStartTag.exec(layout);

		if (matchResult) {
			startTagPos = matchResult.index;
			startContentPos = reStartTag.lastIndex;
			tagName = matchResult[2];

			if (verifyFunction()) {
				// Find closing tag, skipping over other tags with the same name (nested DIVs)
				endTagPos = findEndTag(layout, tagName, startContentPos);
				if (endTagPos >= 0) {
					// Now, do the replacement
					tempLayout = layout.substring(0, (options.append ? endTagPos : startContentPos));
					tempLayout += value;
					tempLayout += layout.substring(endTagPos);
				}
			}
		}
	}
	catch (e) {
		trace('Failed to replace content: ' + e.message);
	}

	return tempLayout;
}

function findEndTag(layout, tagName, startPos) {
	var endTagPos = -1,
		reEndTag,
		matchEndResult,
		startTagPos = -1,
		reStartTag,
		matchStartResult;

	try {
		reEndTag = new RegExp('<\/' + tagName + '\\s*>', 'gi');
		reEndTag.lastIndex = startPos;

		// Find the first closing tag
		matchEndResult = reEndTag.exec(layout);

		if (matchEndResult) {
			endTagPos = matchEndResult.index;

			reStartTag = new RegExp('<' + tagName + '\\s*>', 'gi');
			reStartTag.lastIndex = startPos;

			do {	// Look for another instance of our start tag
				matchStartResult = reStartTag.exec(layout);
				if (matchStartResult) {
					startTagPos = matchStartResult.index;

					if (startTagPos > endTagPos) {
						break;
					}

					// found a nested start tag, so need to find the **next** closing tag...
					matchEndResult = reEndTag.exec(layout);
					if (matchEndResult) {
						endTagPos = matchEndResult.index;
					}
				}
			} while (matchStartResult && matchEndResult);
		}
	}
	catch (e) {
		trace('Failed to find end tag: ' + e.message);
	}

	return endTagPos;
}

function getPageModelStyleMarkup(pageModel, context, sitePrefix) {
	var markup = "";
	var styleData,
		slotData,
		slotId,
		componentInstances;

	try {
		styleData = pageModel.properties.styles;
		markup += getStyleMarkup("scs-styles-body", "body", context, sitePrefix, styleData);

		for (slotId in pageModel.slots) {
			if (Object.prototype.hasOwnProperty.call(pageModel.slots, slotId)) {
				slotData = pageModel.slots[slotId];
				componentInstances = pageModel.componentInstances;

				markup += getContainerStyleMarkup(slotId, slotData, componentInstances, true, context, sitePrefix);
			}
		}
	} catch (e) {
		markup = "";
	}

	if (markup.length > 0) {
		markup = '\n<style id="scsPageStyles" type="text/css">' + markup + "\n</style>";
	}

	return markup;
}

function getContainerStyleMarkup(id, slotData, componentInstances, isSlot, context, sitePrefix) {
	var markup = "",
		styleData,
		componentId,
		componentInstanceData,
		prefix,
		selector,
		i;

	if (slotData) {
		styleData = slotData.styles;
		prefix = isSlot ? 'scs-slot-styles-' : 'scs-container-styles-';
		selector = encodeHTML('#' + id) + (isSlot ? '' : ' > .scs-container-styles > .scs-component-content');
		markup += getStyleMarkup(prefix + id, selector, context, sitePrefix, styleData);

		if (slotData.components && Array.isArray(slotData.components)) {
			for (i = 0; i < slotData.components.length; i++) {
				componentId = slotData.components[i];
				if (typeof componentInstances[componentId] === 'object') {
					componentInstanceData = componentInstances[componentId];
					if ((componentInstanceData.type === 'scs-componentgroup') ||
						(componentInstanceData.type === 'scs-sectionlayout')) {
						markup += getContainerStyleMarkup(componentId, componentInstanceData.data, componentInstances, false, context, sitePrefix); // <<< RECURSION
					}
				}
			}
		}
	}

	return markup;
}

function getStyleMarkup(id, selector, context, sitePrefix, stylesArray) {
	var css = "";
	var property,
		i,
		index,
		name,
		value;

	if (Array.isArray(stylesArray) && (stylesArray.length > 0)) {
		// css += '\n<style id="' + encodeHTML(id) + '" type="text/css">';
		css += "\n" + selector + " {";

		for (i = 0; i < stylesArray.length; i++) {
			property = stylesArray[i];
			if (typeof property === "string") {
				index = property.indexOf(":");
				if (index >= 0) {
					name = property.substring(0, index).trim();
					value = property.substring(index + 1).trim();
					if ((name.indexOf(">") < 0) && (name.indexOf("<") < 0) &&
						(value.indexOf(">") < 0) && (value.indexOf("<") < 0)) {
						value = resolveLinks(value, context, sitePrefix);
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

function getWebAnalyticsMarkup(pageModel, context) {
	var markup = null;

	pageModel = pageModel || {};

	// If this page has the "overrideWebAnalytics" flag set, then use the page's webAnalyticsScript
	if (pageModel && pageModel.properties && (pageModel.properties['overrideWebAnalytics'] === true)) {
		markup = pageModel.properties['webAnalyticsScript'];
	} else if (context.siteInfo && context.siteInfo.properties && (context.siteInfo.properties['isWebAnalyticsEnabled'] === true)) {
		markup = context.siteInfo.properties['webAnalyticsScript'];
	}

	return markup;
}

function fixupPageDataWithSlotReuseData(context, pageModel, layoutName, layoutMarkup) {
	var model,
		slotIds,
		slotId,
		slotData,
		componentId,
		componentInstance,
		componentObject,
		slotReuseData = context.slotReuseData,
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
						if (Object.prototype.hasOwnProperty.call(slotData.componentInstances, componentId)) {
							componentObject = JSON.parse(JSON.stringify(slotData.componentInstances[componentId]));
							pageModel.base.componentInstances[componentId] = componentObject;
						}
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
		} catch (e) {
		}

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

function computeSitePrefix(context, pageUrl) {
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

	if (context.pageLocale) {
		sitePrefix = '../' + sitePrefix;
	}

	trace('computeSitePrefix: pageUrl=' + pageUrl + ', sitePrefix=' + sitePrefix);

	return sitePrefix;
}

function createPage(context, pageInfo) {
	return new Promise(function (resolve, reject) {
		try {
			if ((typeof pageInfo.linkUrl === "string") && (pageInfo.linkUrl.trim().length > 0)) {
				// Don't emit a page for external links.
				console.log('createPage: Bypassing pageId ' + pageInfo.id + ' having external URL: ' + pageInfo.linkUrl);
				resolve();
			} else {
				console.log('createPage: Processing pageId ' + pageInfo.id + ' at the URL: ' + (outputURL ? outputURL : '') + pageInfo.pageUrl + ": CONTEXT: " + context.locale);

				var pageDatas = getPageData(context, pageInfo.id);
				var pageData = pageDatas.pageData;
				var layoutName = (pageData.base || pageData).properties.pageLayout;
				var layoutMarkup = getThemeLayout(context.themeName, layoutName);
				var sitePrefix = computeSitePrefix(context, pageInfo.pageUrl);
				pageData = fixupPageDataWithSlotReuseData(context, pageData, layoutName, layoutMarkup);

				// now fixup the page
				fixupPage(pageInfo.id, pageInfo.pageUrl, layoutMarkup, (pageData.base || pageData), pageDatas.localePageData, context, sitePrefix).then(function (pageMarkup) {
					var pagePrefix = context.locale ? (context.locale + '/') : '';
					writePage(pagePrefix + pageInfo.pageUrl, pageMarkup);
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

function copyThemesDeliveryDirectory(themeName) {
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
	sitesCloudCDN = args.sitesCloudCDN || '';
	outputURL = args.outputURL;
	channelAccessToken = args.channelToken || '';

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
	console.log("    -channelAccessToken      = " + channelAccessToken);
	console.log("    -sitesCloudCDN           = " + sitesCloudCDN);
	console.log("    -logLevel                = " + logLevel);
	console.log("");

	readStyleShim();
	readRootStructure();

	var createPagePromises = [];

	var languages = getAvailableLanguages();
	languages.forEach(function (language) {
		// Initialize the context for this set of pages
		var context = readStructure(language);
		readSlotReuseData(context);
		produceSiteNavigationStructure(context);

		// update the context with the locale
		context.locale = language;
		context.pageLocale = language;

		// include the default channelAccessToken entry if provided
		if (channelAccessToken && context.siteInfo.properties) {
			context.siteInfo.properties.channelAccessTokens = context.siteInfo.properties.channelAccessTokens || [];
			context.siteInfo.properties.channelAccessTokens.push({
				'name': 'defaultToken',
				'value': channelAccessToken
			});
		}

		// create the array of functions that will execute the createPage promise when called
		context.structure.pages.forEach(function (pageInfo) {
			createPagePromises.push(function () {
				return createPage(context, pageInfo);
			});
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
	}).catch(function (e) {
		console.log(e);
	});
};

module.exports.compileSite = compileSite;