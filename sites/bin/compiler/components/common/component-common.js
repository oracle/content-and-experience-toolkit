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
/* global exports */
(function defineComponentCommon(scope, factory) {
	// configure to run in various JS environments
	if (typeof define === 'function' && define.amd) {
		// RequireJS, pass in the factory and use the 'exports' empty object
		//  define(['exports', 'mustache'], factory); // if you wanted to require in another moule
		define(['exports',
			'jquery',
			'./component-constants',
			'../component-registration'
		], factory);
	} else if (typeof exports === 'object' && exports && typeof exports.nodeName !== 'string') {
		// NodeJS (CommonJS), pass in the exports object and populate it
		factory(exports,
			require('cheerio').load('<div></div>'),
			require('./component-constants').constants,
			require('../component-registration')['component-registration']);
	} else {
		// not supported
	}
}(this, function componentCommonFactory(exports, $, compConstants, compReg) {
	'use strict';

	var ComponentCommon = function () {};

	// For XSS, we need to encode all strings on output.
	//
	// Most encoding will be handled by $('<div></div>').text() and encodeURI().
	// Anything we want to handle in addition to these should be entered
	// in the corresponding array below.
	// These arrays are used within encodeURL() & encodeHTML()
	ComponentCommon.prototype.xssEncoding = {
		'urlTags': [{
			'regex': /javascript:/ig,
			'value': 'java-script:'
		},
		{
			'regex': /vbscript:/ig,
			'value': 'vb-script:'
		}
		],
		'htmlTags': [{
			'regex': /"/g,
			'value': '&quot;'
		}],
		'cssTags': [{
			'regex': /javascript/g,
			'value': 'java-script'
		},
		{
			'regex': /vbscript/g,
			'value': 'vb-script'
		},
		{
			'regex': /expression/g,
			'value': 'Xpression'
		},
		{
			'regex': /\\/g, // don't allow CSS escaping
			'value': ''
		}
		]
	};

	ComponentCommon.prototype.isNumeric = function (val) {
		// When your value is "" or null you will always get parseFloat result as NaN
		return (typeof val === 'number' || typeof val === 'string') && !isNaN(val - parseFloat(val));
	};

	// View model styleClass
	ComponentCommon.prototype.createStyleClass = function (compType, viewModel) {
		var styleClass = (compType === 'scs-component' ? 'scs-custom-component' : compType) + ' scs-component';

		if (viewModel.useStyleClass === 'true') {
			// Use default style if no styleClass is given
			if (compType === compReg.types.GALLERYGRID) {
				// Don't add the styleClass for gallerygrid
			} else if (viewModel.styleClass) {
				// use the defined style class
				styleClass += ' ' + viewModel.styleClass;
			} else {
				var defaultStyle = ((typeof viewModel.getStyleClassName === 'function' && viewModel.getStyleClassName()) || compType) + '-default-style';

				// use the default style for the component
				styleClass += ' ' + defaultStyle;
			}
		}

		return styleClass;
	};

	// Return CSS for setting the component width
	// This CSS is typically applied to the "content" DIV.
	ComponentCommon.prototype.createWidthStyle = function (viewModel) {
		var computedWidthStyle;

		if (viewModel.hasOwnProperty('alignment') && viewModel.alignment === compConstants.ALIGNMENT_FILL) {
			computedWidthStyle = 'width:100%;';
		} else {
			if (viewModel.hasOwnProperty('width')) {
				if (viewModel.width !== null) {
					computedWidthStyle = 'width:' + viewModel.getDimensionValue(viewModel.width) + ';';
				} else {
					computedWidthStyle = ''; // or 'width:auto'
				}
			} else {
				computedWidthStyle = 'width:100%;';
			}
		}
		return computedWidthStyle;
	};

	// Return CSS for margin on wrapper div.
	// TODO: use style binding (e.g. return {'marginTop': marginTop, ...})
	ComponentCommon.prototype.createMarginStyle = function (viewModel) {
		var computedMarginStyle = '';

		var marginTop = viewModel.marginTop;
		var marginRight = viewModel.marginRight;
		var marginBottom = viewModel.marginBottom;
		var marginLeft = viewModel.marginLeft;

		// Assume pixels if only a numerical value is given
		if (this.isNumeric(marginTop))
			marginTop = marginTop + 'px';
		if (this.isNumeric(marginRight))
			marginRight = marginRight + 'px';
		if (this.isNumeric(marginBottom))
			marginBottom = marginBottom + 'px';
		if (this.isNumeric(marginLeft))
			marginLeft = marginLeft + 'px';

		// Generate CSS for margin
		if (marginTop)
			computedMarginStyle += 'margin-top:' + viewModel.encodeHTML(marginTop) + ';';
		if (marginRight)
			computedMarginStyle += 'margin-right:' + viewModel.encodeHTML(marginRight) + ';';
		if (marginBottom)
			computedMarginStyle += 'margin-bottom:' + viewModel.encodeHTML(marginBottom) + ';';
		if (marginLeft)
			computedMarginStyle += 'margin-left:' + viewModel.encodeHTML(marginLeft) + ';';

		return computedMarginStyle;
	};


	// Common function to compute custom border style.
	ComponentCommon.prototype.createBorderStyle = function (viewModel) {
		var computedStyle = '';

		if (viewModel.useStyleClass === 'false') {

			// border
			if (viewModel.borderStyle != 'none') {

				// use box-sizing:border-box
				computedStyle += 'box-sizing:border-box;';

				// border style/width/color
				computedStyle += 'border-style:' + viewModel.borderStyle + ';';

				if (this.isNumeric(viewModel.borderWidth)) {
					computedStyle += 'border-width:' + viewModel.borderWidth + 'px;';
				} else {
					computedStyle += 'border-width:' + viewModel.borderWidth + ';';
				}
				computedStyle += 'border-color:' + viewModel.borderColor + ';';
			}

			// border radius (square, radius, or number of pixels)
			if (viewModel.borderRadius === 'rounded') {
				computedStyle += 'border-radius:5px;';
			} else if (viewModel.borderRadius === 'square') {
				computedStyle += 'border-radius:0px;';
			} else {
				computedStyle += 'border-radius:' + viewModel.borderRadius + 'px;';
			}
		}

		return computedStyle;
	};

	// Common function to compute CSS for wrapper for most types of components
	ComponentCommon.prototype.createWrapperStyle = function (viewModel) {
		var computedWrapperStyle = '';

		if (viewModel.hasOwnProperty('alignment')) {
			var alignment = viewModel.alignment;

			if (alignment === compConstants.ALIGNMENT_LEFT ||
                alignment === compConstants.ALIGNMENT_CENTER ||
                alignment === compConstants.ALIGNMENT_RIGHT) {
				computedWrapperStyle += 'text-align:' + alignment + ';';
			}
		}

		return computedWrapperStyle + viewModel.computedMarginStyle;
	};

	// Stylesheet used in customize case
	ComponentCommon.prototype.createContentSearchStyle = function (viewModel) {
		var computedStyle = '';

		// Custom Style
		if (viewModel.useStyleClass === 'false') {
			var iconSize = viewModel.fontSize + 2,
				height = viewModel.fontSize * 2,
				paddingRight = (viewModel.showSearchIcon ? iconSize : 0) + 10,
				widthDeduction = (viewModel.showSearchIcon ? paddingRight : 10) + 10,
				top = (height - iconSize) / 2;

			// Customize properties
			computedStyle += '#' + viewModel.searchId + ' .scs-search-input' + ' {';
			computedStyle += 'background-color:' + viewModel.backgroundColor + ';';
			computedStyle += 'color:' + viewModel.fontColor + ';';
			computedStyle += 'font-size:' + viewModel.fontSize + 'px;';
			computedStyle += 'font-family:' + viewModel.fontFamily + ';';
			computedStyle += 'width: calc((100% - ' + widthDeduction + 'px));';
			computedStyle += 'padding-right:' + paddingRight + 'px;';
			computedStyle += 'height:' + height + 'px;';
			computedStyle += '} ';
			computedStyle += '#' + viewModel.searchId + ' .scs-search-button' + ' {';
			computedStyle += 'color:' + viewModel.fontColor + ';';
			computedStyle += 'font-size:' + viewModel.fontSize + 'px;';
			computedStyle += 'font-family:' + viewModel.fontFamily + ';';
			computedStyle += 'width:' + iconSize + 'px;';
			computedStyle += 'height:' + iconSize + 'px;';
			computedStyle += 'background-size:' + iconSize + 'px auto;';
			computedStyle += 'top:' + top + 'px;';
			computedStyle += '} ';
		}

		return computedStyle;
	};



	ComponentCommon.prototype.applyNLS = function (params, compType, compMode) {
		// apply the "nlsImages" array to the "images" array parameter values
		var imagesData = params.scsComponent && params.scsComponent.data && params.scsComponent.data.images,
			nlsImagesData = params.scsComponent && params.scsComponent.data && params.scsComponent.data.nlsImages;

		this.applyNLSToArray(imagesData, nlsImagesData);

		// apply the "nlsNestedComponents" array to the "nestedComponents" array parameter values
		var nestedComponents = params.scsComponent && params.scsComponent.data && params.scsComponent.data.nestedComponents,
			nlsNestedComponents = params.scsComponent && params.scsComponent.data && params.scsComponent.data.nlsNestedComponents;
		this.applyNLSToArray(nestedComponents, nlsNestedComponents);
	};

	ComponentCommon.prototype.applyNLSToArray = function (srcArray, nlsArray) {

		if (Array.isArray(srcArray) && Array.isArray(nlsArray)) {
			// try to match with ID
			var idMatchFound = false;
			srcArray.forEach(function (item) {
				if (item.id) {
					// apply any NLS match
					for (var i = 0; i < nlsArray.length; i++) {
						if (item.id && (item.id === nlsArray[i].id)) {
							if (typeof $.extend === 'function') {
								$.extend(true, item, nlsArray[i]);
							} else {
								// NOTE: doesn't do a deep merge
								// not currently required but if that changes, this needs to be updated
								Object.assign(item, nlsArray[i]);
							}
							// note that at least one "id" match was found
							idMatchFound = true;
							break;
						}
					}
				}
			});

			// if no ID match found, then go with position if array sizes are the same
			if (!idMatchFound && (srcArray.length === nlsArray.length)) {
				for (var pos = 0; pos < srcArray.length; pos++) {
					if (nlsArray[pos] && typeof nlsArray[pos] === 'object') {
						if (typeof $.extend === 'function') {
							$.extend(true, srcArray[pos], nlsArray[pos]);
						} else {
							// NOTE: doesn't do a deep merge
							// not currently required but if that changes, this needs to be updated
							Object.assign(srcArray[pos], nlsArray[pos]);
						}
					}
				}
			}
		}
	};

	//
	// Appends "px" to value if it is a number
	//
	ComponentCommon.prototype.getDimensionValue = function (value) {
		var cssDimension;

		if (this.isNumeric(value)) {
			cssDimension = (parseFloat(value) === 0 ? 'auto' : value + 'px');
		} else {
			cssDimension = value;
		}

		return cssDimension;
	};

	ComponentCommon.prototype.encodeHTML = function (val) {
		// encode all HTML tags by setting the <div> text attribute then extract the encoded HTML
		var viewModel = this,
			origVal = val ? (typeof val === 'function' ? val().toString() : val.toString()) : '',
			htmlEncoded = $('<div></div>').text(origVal).html();

		// follow up by encoding any additional non-encoded attributes (e.g.: ")
		return viewModel.encodeString(htmlEncoded, this.xssEncoding.htmlTags);
	};

	ComponentCommon.prototype.encodeCSS = function (val) {
		var viewModel = this,
			origVal = val ? (typeof val === 'function' ? val().toString() : val.toString()) : '';

		// encode any CSS attributes (e.g.: don't allow CSS escaping - '\')
		return viewModel.encodeString(origVal, this.xssEncoding.cssTags);
	};

	ComponentCommon.prototype.encodeString = function (val, encodeOptions) {
		var encodedVal = val;

		if (val) {
			// remove requested values
			for (var i = 0; i < encodeOptions.length; i++) {
				encodedVal = encodedVal.replace(encodeOptions[i].regex, encodeOptions[i].value);
			}
		}

		return encodedVal;
	};

	ComponentCommon.prototype.parseURL = function (parseURL) {
		var domAnchor = $('<a></a>')[0],
			searchObject = {},
			queries, i;

		// set the URL in the anchor, which will also parse it
		domAnchor.href = parseURL;
		queries = domAnchor.search.replace(/^\?/, '').split('&');
		for (i = 0; i < queries.length; i++) {
			var split = queries[i].split('=');
			searchObject[split[0]] = split[1];
		}

		return {
			protocol: domAnchor.protocol,
			host: domAnchor.host,
			hostname: domAnchor.hostname,
			port: domAnchor.port,
			pathname: domAnchor.pathname,
			search: domAnchor.search,
			searchObject: searchObject,
			hash: domAnchor.hash
		};
	};

	// Is it a caasGUID?
	ComponentCommon.prototype.isCaaSGUID = function (href) {
		// For Digital Asset, the caasGUID is stored rather than a URL.
		// In case of a link, e.g. href property, the value could be a URL or a CaaS GUID.
		// This helper function determines if the given value is a CaaS GUID or not.
		return href && href.indexOf('DigitalAsset') >= 0;
	};

	ComponentCommon.prototype.getNameFromURL = function (url, hrefName) {
		var name,
			ext;

		if (url) {
			if (hrefName) {
				return hrefName;
			} else if (this.isHybridLink(url)) {
				// Parse the URL and find the scsOriginalFileName parameter from URL like
				// /documents/link/web?IdcService=GET_FILE&dLinkID=...&item=fFileGUID:...&scsOriginalFileName=...
				var parsedURL = this.parseURL(url);
				return decodeURIComponent(parsedURL.searchObject.scsOriginalFileName);
			} else {
				// Remove path from URL
				name = url.split('/').pop();
				//Grab extension
				ext = url.split('.').pop();

				// Remove the unique number identifier from username:
				// file-1234567891011.jpg -> file.jpg
				name = name.replace(/(-[0-9]+)?\.[a-zA-Z0-9]{3,4}$/, '.');

				// Add name plus the extension
				return name + ext;
			}
		}
		return '';
	};

	ComponentCommon.prototype.getYoutubeSrcUrl = function (url) {
		var videoIdFormatHost = 'youtu.be',
			otherFormatsHost1 = 'youtube.com',
			otherFormatsHost2 = 'youtube-nocookie.com',
			embedPathname = 'embed/',
			watchPathname = 'watch',
			srcUrl = '',
			videoId = '',
			uo = {};

		if (!url) {
			return '';
		}

		uo = this.parseURL(url);

		// Lower case strings are for comparison only
		var hostname = uo.hostname.toLowerCase();

		// Handle 4 forms of youtube URL
		// 1. https://youtu.be/<VIDEO_ID>
		//    This form has youtu.be hostname.
		// 2. https://www.youtube.com/embed/<VIDEO_ID>
		//    This form has youtube.com hostname and /embed in the pathname.
		// 3. https://www.youtube.com/watch?v=<VIDEO_ID>
		//    This form has youtube.com hostname and /watch in the pathname
		//    and v query parameter.
		// 4. Accept youtube-nocookie.com hostnames for 2 and 3.

		// Handle pathname with or without leading '/'. IE has no leading '/'.

		if (hostname === videoIdFormatHost) {
			if (uo.pathname) {
				// video ID case
				videoId = uo.pathname[0] === '/' ? uo.pathname.substring(1) : uo.pathname;
			}

			hostname = 'www.youtube.com';
		} else if (hostname.lastIndexOf(otherFormatsHost1) !== -1 || hostname.lastIndexOf(otherFormatsHost2) !== -1) {
			var pathname = (uo.pathname && uo.pathname[0] === '/' ? uo.pathname.substring(1).toLowerCase() : uo.pathname.toLowerCase());

			if (pathname.indexOf(embedPathname) === 0) {
				// embed case
				videoId = uo.pathname.substring(embedPathname.length);
			} else if (pathname.indexOf(watchPathname) === 0 && uo.searchObject.v) {
				// watch case
				videoId = uo.searchObject.v;
			}
		}

		if (videoId === '') {
			return srcUrl;
		}

		srcUrl = '//' + hostname + '/embed/' + videoId;

		return srcUrl;
	};

	// -----------------------
	// Links utility functions
	// -----------------------

	// Get parameter value from Map link
	ComponentCommon.prototype.getMapLinkParam = function (href) {
		var p = null;

		if (href) {
			p = /\[!--\$SCS_GOOGLE_MAPS--\]*(.*?) *\[\/!--\$SCS_GOOGLE_MAPS--\]/.exec(href);
		}
		return p !== null ? p[1] : '';
	};

	// Get Google Map Embed Link by parameter
	ComponentCommon.prototype.getGoogleMapEmbedLinkByParam = function (param) {
		return 'https://www.google.com/maps/embed/v1/place?q=' + encodeURIComponent(param) + '&key=';
	};

	// Get Goolge Map Embed Link by href which consists of a macro
	ComponentCommon.prototype.getGoogleMapEmbedLinkByHref = function (href) {
		return this.getGoogleMapEmbedLinkByParam(this.getMapLinkParam(href));
	};

	//
	// Array utilities
	//

	// Return values in the input string or array.
	// This is primarily used for handling the value in the target property.
	// The value should be a string, but some components store it as an array.
	// The check in here is for robustness.
	ComponentCommon.prototype.getValuesFromStringOrArray = function (input) {
		// Check if the input is a string or a string within an array
		var str = Array.isArray(input) ? input[0] : input;

		return str ? str.split(',') : [];
	};

	// Get an array of values within the given set.
	ComponentCommon.prototype.getValuesBySet = function (set, str) {
		var values = this.getValuesFromStringOrArray(str);

		// Include values that belong to the set
		return values.filter(function (item) {
			return set.indexOf(item) !== -1;
		});
	};

	// Return an array of values after replacing the value within the given set.
	ComponentCommon.prototype.updateValuesBySet = function (set, str, newValue) {
		var values = this.getValuesFromStringOrArray(str);

		// Include values that do NOT belong to the set
		var newValues = values.filter(function (item) {
			return set.indexOf(item) === -1;
		});
		// Add the new value
		newValues.push(newValue);

		return newValues;
	};

	//
	// 'target' property utilities
	//

	// Return _blank|_self. Ignore other custom values.
	ComponentCommon.prototype.computeTarget = function (target) {
		var standardValues = ['_blank', '_self'],
			t = Array.isArray(target) ? target[0] : target,
			r = this.getValuesBySet(standardValues, t);

		return r.length > 0 ? r[0] : '_blank';
	};

	ComponentCommon.prototype.useFullScreenOnMobile = function (target) {
		return this.getValuesFromStringOrArray(target).indexOf('_fullscreen_mobile') !== -1;
	};

	ComponentCommon.prototype.useFullScreenOnDesktop = function (target) {
		return this.getValuesFromStringOrArray(target).indexOf('_fullscreen_desktop') !== -1;
	};

	ComponentCommon.prototype.useFullScreenAnywhere = function (target) {
		return this.useFullScreenOnMobile(target) || this.useFullScreenOnDesktop(target);
	};

	exports.ComponentCommon = ComponentCommon;
	return ComponentCommon;
}));