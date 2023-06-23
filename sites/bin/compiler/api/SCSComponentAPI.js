/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 *
 * Copyright (c) 2014, 2023, Oracle and/or its affiliates.
 */
// eslint-disable-next-line no-redeclare
/* global exports */
(function defineSCSComponentAPI(scope, factory) {
	// configure to run in various JS environments
	if (typeof define === 'function' && define.amd) {
		// RequireJS, pass in the factory and use the 'exports' empty object
		define(['exports'], factory);
	} else {
		// NodeJS (CommonJS), pass in the exports object and populate it
		factory(exports);
	}
}(this, function SCSComponentAPIFactory(exports) {
	/**
	 * @constructor
	 * @alias SCSComponentAPI
	 * @namespace {Object} SCSComponentAPI
	 */
	var SCSComponentAPI = function (args) {
		this.$ = args.$;
		this.Mustache = args.Mustache;
		this.marked = args.marked;
		this.contentClient = args.contentClient;
	}
	SCSComponentAPI.prototype = {
		/**
		 * @typedef {Object} SCSComponentAPI.RENDER_MODE
		 * @memberof SCSComponentAPI
		 * @type {object}
		 * @property {string} EDIT - 'edit' page is rendering in the site builder in edit mode.
		 * @property {string} NAVIGATE - 'navigate' page is rendering in the site builder in navigate (view) mode'.
		 * @property {string} RUNTIME - 'runtime' page is rendering in a published site or in preview.
		 * @property {string} COMPILE - 'compile' page is being compiled.
		 */
		RENDER_MODE: {
			'EDIT': 'edit',
			'NAVIGATE': 'navigate',
			'RUNTIME': 'runtime',
			'COMPILE': 'compile'
		},

		/**
		 * @typedef {Object} SCSComponentAPI.RENDER_STATE
		 * @memberof SCSComponentAPI
		 * @type {object}
		 * @property {string} ANNOTATION - 'annotation' user is annotating the site page. Available in both  "NAVIGATE" and "EDIT" modes
		 * @property {string} PREVIEW - 'preview' user is previewing the site page. Available in "RUNTIME" mode
		 * @property {string} THUMBNAIL - 'thumbnail' user is viewing a content layout in the settings panel. The thumbnail is rendered in an iFrame.
		 */
		RENDER_STATE: {
			'ANNOTATION': 'annotation',
			'PREVIEW': 'preview',
			'THUMBNAIL': 'thumbnail'
		},

		/**
		 * @typedef {Object} SCSComponentAPI.CACHE_KEY
		 * @memberof SCSComponentAPI
		 * @type {object}
		 * @property {string} PRODUCT - 'product' product release version
		 * @property {string} SITE - 'site' site resources, changed whenever site is republished
		 * @property {string} THEME - 'theme' theme resources, changed whenever the theme is republished
		 * @property {string} COMPONENT - 'component' component resources, changed whenever any component is republished
		 * @property {string} CONTENT - 'content' content resources, changed whenever any item is republished to the site's publishing channel
		 */
		CACHE_KEY: {
			'PRODUCT': 'product',
			'SITE': 'site',
			'THEME': 'theme',
			'COMPONENT': 'component',
			'CONTENT': 'content' // this is actually the 'caas' cache key value but is re-mapped by the API
		},

		/**
		 * @typedef {Object} SCSComponentAPI.URL_PREFIX
		 * @memberof SCSComponentAPI
		 * @type {object}
		 * @property {string} CDN - 'cdn' the sitesCloudCDN value, if present.
		 * @property {string} CONTENT - 'content' the content URL prefix with siteId, variantId and filename.
		 * @property {string} COMPONENT_CATALOG - 'componentCatalog' the URL prefix to the component folder.
		 * @property {string} DIST_DIR - 'distDir' the distribution directory prefix.
		 * @property {string} SITE_PATH - 'sitePath' the site path prefix including a cache key.
		 * @property {string} THEME_DESIGN - 'themeDesign' the theme's design URL prefix.
		 * @property {string} THEME - 'theme' the theme URL prefix.
		 */
		URL_PREFIX: {
			'CDN': 'cdn',
			'CONTENT': 'content',
			'COMPONENT_CATALOG': 'componentCatalog',
			'DIST_DIR': 'distDir',
			'SITE_PATH': 'sitePath',
			'THEME_DESIGN': 'themeDesign',
			'THEME': 'theme'
		},

		/**
		 * Defines the set of Mustache tags beneath an "scs" object.  This also includes all the SCSMacros values.
		 * @typedef {Object} SCSComponentAPI.mustacheTags
		 * @memberof SCSComponentAPI
		 * @type {object}
		 * @property {lambda} getRenditionURL - {{#scs.getRenditionURL}}{{id}}{{/scs.getRenditionURL}}, takes "id,format,type,download" comma separated values.
		 * @property {lambda} expandMacros - {{#scs.expandMacros}}{{{aRichTextField}}}{{/scs.expandMacros}}, expands any recognized macros withing "aRichTextField" value.
		 * @property {lambda} processMarked - {{#scs.processMarked}}{{{aMarkDownField}}}{{/scs.processMarked}}, processes the markdown text into HTML.
		 * @property {lambda} expandMarked - {{#scs.expandMarked}}{{{aMarkDownField}}}{{/scs.expandMarked}}, combines expandMacros with processMarked.
		 * @property {object} formatDate - {{#scs.formatDate.toDateString}}{{dateValue}}{{/scs.formatDate.toDateString}}, allow for basic built-in date formatting functions
		 * @property {lambda} formatDate.toDateString - e.g. 'Thu Mar 23 2023'
		 * @property {lambda} formatDate.toISOString - e.g. '2023-03-23T16:57:25.488Z'
		 * @property {lambda} formatDate.toLocaleDateString - e.g. '3/23/2023'
		 * @property {lambda} formatDate.toLocaleString - e.g. '3/23/2023, 9:57:52 AM'
		 * @property {lambda} formatDate.toLocaleTimeString - e.g. '9:58:06 AM'
		 */

		/**
		 * Gets the current rendering mode.
		 * @memberof SCSComponentAPI
		 * @returns {SCSComponentAPI.RENDER_MODE} The current rendering mode.
		 * @example
		 * SCSComponentAPI.getRenderMode();
		 * // => 'edit'
		 * // Possible return values: SCSComponentAPI.RENDER_MODE.EDIT | SCSComponentAPI.RENDER_MODE.NAVIGATE | SCSComponentAPI.RENDER_MODE.RUNTIME | SCSComponentAPI.RENDER_MODE.COMPILE
		 * @instance
		 */
		getRenderMode: function () {
			// always in runtime
			return this.RENDER_MODE.RUNTIME;
		},

		/**
		 * Checks whether the current rendering state matches the requested value. The "state" is a modifier of the "mode" value. <br>
		 * For example, the render "mode" may be SCSComponentAPI.RENDER_MODE.RUNTIME but the "state" may be that the site is in preview or viewing a published page.<br>
		 * In most cases, you will not need to be concerned about the state value. However, you may wish the component to render differently if, for example, it is rendering as a small thumbnail.
		 * @memberof SCSComponentAPI
         * @param {SCSComponentAPI.RENDER_STATE} state value to check for
		 * @returns {boolean} true if the requested render state is applicable
		 * @instance
		 */
		checkRenderState: function (state) {
			if (state === this.RENDER_STATE.THUMBNAIL) {
				return true;
			}

			if (state === this.RENDER_STATE.DRAFT) {
				// always in draft when rendering in thumbnail
				return true;
			}

			// no other states supported in the thumbnail
			return false;
		},

		/**
		 * Gets info about current device.<br><br>
		 *
		 * Customizations to the controller code will not take effect in design time, only runtime.
		 * @memberof SCSComponentAPI
		 * @returns {Object} An object with device info.<br><br>
		 * Default return object: { isMobile: [true | false], isIOS: [true | false] }
		 * @instance
		 */
		getDeviceInfo: function () {
			return {};
		},

		/**
		 * Returns a ContentClient instance, which can be used to obtain information from content REST calls.
		 * @memberof SCSComponentAPI
		 * @returns {Object} A ContentClient object.
		 * @instance
		 */
		getContentClient: function () {
			return this.contentClient;
		},

		/**
		 * Gets the page's Mustache object.
		 * @memberof SCSComponentAPI
		 * @returns {Object} The Mustache object reference.
		 * @instance
		 */
		getMustache: function () {
			return this.Mustache;
		},
		/**
		 * Gets the page's marked object, used for Markdown parsing.
		 * @memberof SCSComponentAPI
		 * @returns {Object} The marked object reference.
		 * @instance
		 */
		getMarked: function () {
			return this.marked;
		},

		/**
		 * Gets the detailed information about the page.
		 * @memberof SCSComponentAPI
		 * @returns {SCSComponentAPI.PageInfo} all the details about the page.
		 * @instance
		 */
		getPageInfo: function () {
			return {
				id: 100,
				languageCode: '',
				localeAlias: '',
				properties: {}
			};
		},

		/**
		 * Gets the detailed information about the site.
		 * @memberof SCSComponentAPI
		 * @returns {SCSComponentAPI.SiteInfo} all the details about the site.
		 * @instance
		 */
		getSiteInfo: function () {
			return {
				languageCode: '',
				currentPageId: 100,
				navigationRoot: 100,
				structureMap: {}
			};
		},

		/**
		 * Gets the component's stored data.
		 * @memberof SCSComponentAPI
		 * @param {String} componentId The component ID.
		 * @returns {(Object|undefined)} Returns the component's stored data object or undefined.
		 * @instance
		 */
		getComponentInstanceData: function (componentId) {
			return {};
		},

		/**
		 * Gets a site property value given a property name.
		 * @memberof SCSComponentAPI
		 * @param {String} propertyName Property name.
		 * @returns {(String|undefined)} The property value.
		 * @instance
		 */
		getSiteProperty: function  (propertyName) {
			return '';
		},

		/**
		 * Gets a custom site property value given a property name.
		 * @memberof SCSComponentAPI
		 * @param {String} propertyName Property name.
		 * @returns {(String|undefined)} The property value.
		 * @instance
		 */
		getCustomSiteProperty: function  (propertyName) {
			return '';
		},

		/**
		 * Gets a default page property value given a property name.
		 * @memberof SCSComponentAPI
		 * @param {String} propertyName Property name.
		 * @returns {(String|undefined)} The property value.
		 * @instance
		 */
		getDefaultPageProperty: function  (propertyName) {
			return '';
		},

		/**
		 * Gets a page property value given a page ID and property name.
		 * @memberof SCSComponentAPI
		 * @param {String} propertyName Property name.
		 * @param {String} [pageId] The page ID.
		 * @returns {(String|undefined)} The property value.
		 * @instance
		 */
		getCustomPageProperty: function  (propertyName, pageId) {
			return '';
		},

		/**
		 * Gets the cache key for the given section.<br><br>
		 * @memberof SCSComponentAPI
		 * @param {SCSComponentAPI.CACHE_KEY} keyName
		 * @returns {String} The cache key for the given section.
		 * @instance
		 */
		getCacheKey: function (keyName) {
			// simply return a hard-coded value regardless when rendering in thumbnail
			return '_cache_34ab35e';
		},

		/**
		 * Gets the prefix to the requested resource.<br><br>
		 * @memberof SCSComponentAPI
		 * @param {SCSComponentAPI.URL_PREFIX} prefixName
		 * @returns {String} The URL prefix for the given key.
		 * @instance
		 */
		getURLPrefix: function (prefixName) {
			return '';
		},

		/**
		 * Gets the link data for a given page.
		 * @memberof SCSComponentAPI
		 * @param {String} pageId The target page ID.
		 * @param {Object} [options] The options object.
		 * @param {String} [options.context] The page context.  This is only available in the design environment.
		 * @param {String} [options.contentType The target content type.
		 * @param {String} [options.contentId] The target content ID.
		 * @param {String} [options.contentName] The target content name.
		 * @returns {Object} The link data, including href, target, and hideInNavigation properties.
		 * @instance
		 */
		createPageLink: function  ( pageId, options ) {
			return {};
		},

		/**
		 * Loads the requested resource into the page. <br>
		 * If the resource is of type "text", the resource is loaded and returned. </br>
		 * If the resource is of type "css", when rendering in the browser, it inserts the CSS into the HEAD of the page. While, during compile, the resource is returned.
		 * @memberof SCSComponentAPI
		 * @param {Object} args parameters to load the resource.
		 * @param {String} args.resource name of the resource to load.
		 * @param {String} args.path the path to the resource.
		 * @param {('text'|'css')} args.type the type of resource to load.
		 * @returns {Promise} the loaded resource or undefined if resource is automatically added to the page.
		 * @instance
		 */
		loadResource: function (args) {
			var resource = args.resource;
			var path = args.path;
			var type = args.type;

			// if no resource defined, then error
			if (resource)  {
				var resourcePath = path || '/';
				if (resourcePath.substring(resourcePath.length - 1) !== '/') {
					resourcePath += '/';
				}
				var resourceURL = resourcePath + resource;

				var cssSuffix = '.css';
				var resourceType = type || (resource.substring(resource.length - cssSuffix.length) === cssSuffix ? 'css' : 'text');

				var contentClient = this.getContentClient();
				return resourceType === 'text' ? contentClient.importText(resourceURL) : contentClient.importCSS(resourceURL);
			} else {
				console.warn('SCSComponentAPI.loadResource: called with no resource defined');
				return Promise.resolve('');
			}
		},

		/**
		 * Returns the combined list of useful Mustache tags including those defined with the SCSMacro object.
		 * @memberof SCSComponentAPI
		 * @returns {SCSComponentAPI.mustacheTags} a object containing a top-level "scs" object that can be used to access all OCM Mustache tags.
		 * @instance
		 */
		getMustacheTags: function () {
			var parseMarkedown = (mdText) => {
				if (mdText && /^<!---mde-->\n\r/i.test(mdText)) {
					mdText = mdText.replace("<!---mde-->\n\r", "");

					mdText = this.getMarked()(mdText);
				}

				return mdText;
			};

			// define custom macros - may want to just put these into SCSMacros
			var contentClient = this.getContentClient();
			var apiMacros = {
				getRenditionURL: () => {
					return (text, render) => {
						var entry = render(text).split(',');
						return contentClient.getRenditionURL({
							id: entry[0],
							type: entry[1],
							format: entry[2],
							download: entry[3]
						});
					};
				},
				expandMacros: () => {
					return (text, render) => {
						var content = render(text);
						return contentClient.expandMacros(content);
					};
				},
				processMarkdown: () => {
					return (text, render) => {
						var content = render(text);
						return parseMarkedown(content);
					};
				},
				expandMarkdown: () => {
					return (text, render) => {
						var content = render(text);
						return contentClient.expandMacros(parseMarkedown(content));
					};
				},
				formatDate: {
					// e.g. 'Thu Mar 23 2023'
					toDateString: () => {
						return (text, render) => {
							var content = render(text);
							return new Date(content).toDateString();
						};
					},
					// e.g. '2023-03-23T16:57:25.488Z'
					toISOString: () => {
						return (text, render) => {
							var content = render(text);
							return new Date(content).toISOString();
						};
					},
					// e.g. '3/23/2023'
					toLocaleDateString: () => {
						return (text, render) => {
							var content = render(text);
							return new Date(content).toLocaleDateString();
						};
					},
					// e.g. '3/23/2023, 9:57:52 AM'
					toLocaleString: () => {
						return (text, render) => {
							var content = render(text);
							return new Date(content).toLocaleString();
						};
					},
					// e.g. '9:58:06 AM'
					toLocaleTimeString: () => {
						return (text, render) => {
							var content = render(text);
							return new Date(content).toLocaleTimeString();
						};
					}
				},
				SCSMacros: (typeof window !== 'undefined') ? window.SCSMacros || {} : {}
			};

			return {
				scs: apiMacros
			};
		}
	};

	exports.SCSComponentAPI = SCSComponentAPI;
	return SCSComponentAPI;
}));