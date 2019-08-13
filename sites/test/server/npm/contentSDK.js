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
 * Copyright (c) 2017 Oracle Corp.
 * All rights reserved.
 *
 * $Id: content.js 167153 2019-01-25 21:29:15Z muralik $
 */
/* global JSON, console, define, module, exports, require, requirejs, Promise */
(function defineContentSDK(scope, factory) {
	// configure to run in various JS environments
	if (typeof define === 'function' && define.amd) {
		// RequireJS, pass in the factory and use the 'exports' empty object
		define(['exports'], factory);
	} else if (typeof exports === 'object' && exports && typeof exports.nodeName !== 'string') {
		// NodeJS (CommonJS), pass in the exports object and populate it
		factory(exports);
	} else {
		// Standard JS - add the contentSDK object to scope and populate it
		scope.contentSDK = {};
		factory(scope.contentSDK);
	}
}(this, function contentSDKFactory(contentSDK) {
	'use strict';

	// Default environment to browser. 
	// This gets changed in gulp for node version of the file.  
	var _scsIsNode = true;

	//
	// ------------------------------- Cross-browser Utility functions ---------------------
	//
	var _utils = {
		bind: function (func, owner) {
			return function () {
				return func.apply(owner, arguments);
			};
		},
		extend: function (dest, orig) {
			for (var prop in orig) {
				if (orig.hasOwnProperty(prop)) {
					dest[prop] = orig[prop];
				}
			}
			return dest;
		}
	};

	//
	// ------------------------------- Internal Logger -------------------------------------
	//
	var _logger = function () {
		var logger = {
				logLevel: 'none',
				logLevels: ['error', 'warn', 'info', 'debug', 'log']
			},
			dontLog = function (message) {}; // swallow messages - default

		logger.updateLogger = function (newLogger) {
			if (newLogger) {
				// setup loggers for each logLevel
				for (var i = 0; i < this.logLevels.length; i++) {
					var logLevel = logger.logLevels[i];
					logger[logLevel] = typeof newLogger[logLevel] === 'function' ? _utils.bind(newLogger[logLevel], newLogger) : dontLog;
				}
			}
		};
		logger.updateLogger({}); // setup with no logging

		return logger;
	}();

	//
	// ------------------------------- Internal Implementation -------------------------------------
	//

	// RequireJS config support 
	var _requireConfig = {
		requirePaths: {},
		getContentLayoutRequirePath: function (info) {
			var contentServer = info.contentServer,
				cacheBuster = typeof info.cacheBuster === 'object' ? info.cacheBuster : {
					layoutKey: info.cacheBuster,
					systemKey: info.cacheBuster
				},
				layoutCacheBuster = cacheBuster.layoutKey ? '/' + cacheBuster.layoutKey : '',
				systemCacheBuster = cacheBuster.systemKey ? '/' + cacheBuster.systemKey : '';

			// setup require config for this Content client's layouts if not already created
			if (!this.requirePaths[contentServer]) {
				// generate a unique require path to Content Layouts for this client
				var baseRequirePath = 'contentLayoutPath' + Math.floor(100000000 + Math.random() * 900000000),
					paths = {};

				// create paths for 'published' and 'draft'
				paths[baseRequirePath + 'published'] = contentServer + '/_compdelivery' + layoutCacheBuster;
				paths[baseRequirePath + 'draft'] = contentServer + '/_themes/_components' + layoutCacheBuster;
				paths[baseRequirePath + 'system'] = contentServer + '/_sitescloud' + systemCacheBuster + '/sitebuilder/contentlayouts';

				// cache the base requireJS path for re-use with this content server
				this.requirePaths[contentServer] = baseRequirePath;

				// configure require to support these paths
				requirejs.config({
					paths: paths
				});
			}

			return this.requirePaths[contentServer];
		},
		preloadContentLayout: function (requireLayout, resolve, reject) {
			// require in the content layout to populate the require cache but don't render the item
			require([requireLayout], function (ContentLayout) {
					// resolve the promise
					resolve();
				},
				function (err) {
					// note that can't find the layout and reject
					_logger.warn('ContentClient.renderLayout: Unable to render the layout.  Ensure you can access the layout: If running against published content, that the layout has been published. If draft, that you are logged onto the Sites server');
					reject('Failed to get layout: ' + requireLayout + ' with error: ' + err);
				});
		},
		renderContentLayout: function (requireLayout, layoutParams, container, resolve, reject) {
			// require in the render.js for the layout
			require([requireLayout], function (ContentLayout) {
					var renderLayout = new ContentLayout(layoutParams);

					// call render to add the component to the page
					var renderPromise = renderLayout.render(container);
					if (typeof renderPromise === 'object' && typeof renderPromise.then === 'function') {
						renderPromise.then(function (status) {
								// resolve the passed in Promise
								resolve();
							},
							function (errorStatus) {
								// failed to render, reject the passed in promise
								reject(errorStatus);
							});
					} else {
						// simply resolve the passed in promise
						resolve();
					}
				},
				function (err) {
					// note that can't find the layout and reject
					_logger.warn('ContentClient.renderLayout: Unable to render the layout.  Ensure you can access the layout: If published, that the layout has been published. If draft, that you are logged onto the Sites server');
					reject('failed to get layout: ' + requireLayout + ' with error: ' + err);
				});
		}
	};

	// Node specific API
	var _RestAPINode = function () {};
	_RestAPINode.prototype = {
		type: 'Node',
		extractServer: function (contentServerURL) {
			var url = require('url'),
				contentServer = contentServerURL || 'http://localhost',
				parsedURL = url.parse(contentServer);

			// extract the server part of the URL
			return parsedURL.protocol + '//' + parsedURL.hostname + (parsedURL.port ? ':' + parsedURL.port : '');
		},
		callRestServer: function (targetURL, restArgs) {
			var self = this;

			_logger.debug('_rest.callRestServer: Calling ' + restArgs.method + ' request with:');
			_logger.debug(targetURL);
			_logger.debug(restArgs);

			// require in the node REST call dependencies
			var protocolCalls = {
					'http:': require('http'),
					'https:': require('https')
				},
				url = require('url'),
				querystring = require('querystring');

			var nodePromise = new Promise(function (resolve, reject) {
				// parse the URL
				var options = url.parse(targetURL),
					protocolCall = protocolCalls[options.protocol || 'https:'],
					restRequest;

				var beforeSendOK = function (currentOptions) {
					try {
						if (typeof restArgs.beforeSend === 'function') {
							restArgs.beforeSend(currentOptions);
						}
						return true;
					} catch (e) {
						// error in user code, reject the call
						reject({
							status: e,
							statusText: 'Error in beforeSend() callback'
						});
					}
					return false;
				};

				// function to handle request response into JSON
				var requestResponse = function (response) {
					var body = '',
						responseStatus = response.statusCode;

					response.on('data', function (chunk) {
						body += chunk;
					});

					response.on('end', function () {
						if (responseStatus >= 200 && responseStatus < 300) {
							try {
								var jsonResponse = JSON.parse(body);
								resolve(jsonResponse);
							} catch (e) {
								reject({
									'error': body
								});
							}
						} else {
							// return the error response object to be handled by calling function
							reject(response);
						}
					});
				};


				// store the call type in options
				options.method = restArgs.method.toUpperCase() || '';

				if ((options.method === 'GET') && targetURL) {
					// handle 'GET' request

					// allow the user to update the "options"
					if (beforeSendOK(options)) {
						restRequest = protocolCall.get(options, requestResponse);
					}
				} else if (options.method === 'POST' && restArgs.noCSRFToken && restArgs.postData) {
					// handle 'POST' request

					// setup the JSON body
					var bodyString = JSON.stringify(restArgs.postData);
					options.headers = {
						'Content-Type': 'application/json',
						'X-Requested-With': 'XMLHttpRequest',
						'Content-Length': bodyString.length
					};

					// do http or https get writing the bodyString
					if (beforeSendOK(options)) {
						restRequest = protocolCall.request(options, requestResponse).write(bodyString);
					}
				} else {
					// unsupported method
					reject({
						'error': 'unsupported REST request: ' + JSON.stringify(restArgs)
					});
				}

				// set up common handling
				if (restRequest) {
					// handle errors
					restRequest.on('error', function (error) {
						reject({
							'error': error
						});
					});

					// handle timeout
					restRequest.on('socket', function (socket) {
						socket.setTimeout(restArgs.timeout);
						socket.on('timeout', function () {
							reject({
								'error': 'request timed out after: ' + restArgs.timeout
							});
						});
					});
				}
			});

			// return the promise
			return nodePromise.then(function (response) {
				if (typeof self.coerceData === 'function') {
					return self.coerceData(response);
				} else {
					return Promise.resolve(response);
				}
			});
		}
	};

	// Browser specific API
	var _RestAPIBrowser = function () {};
	_RestAPIBrowser.prototype = {
		type: 'Browser',
		extractServer: function (contentServerURL) {
			// use the server URL if given, or default to the window URL
			var contentServer = contentServerURL || (window.location && window.location.href),
				parsedURL = document.createElement('a');

			// parse the URL
			parsedURL.href = contentServer;

			// extract the server part of the URL
			return parsedURL.protocol + '//' + parsedURL.hostname + (parsedURL.port ? ':' + parsedURL.port : '');
		},
		callRestServer: function (targetURL, restArgs) {
			var self = this;

			_logger.debug('_rest.callRestServer: Calling ' + restArgs.method + ' request with:');
			_logger.debug(restArgs);

			var xmlHTTPPromise = new Promise(function (resolve, reject) {
				var beforeSendOK = function (currentXHR) {
					try {
						if (typeof restArgs.beforeSend === 'function') {
							restArgs.beforeSend(currentXHR);
						}
						return true;
					} catch (e) {
						// error in user code, reject the call
						reject({
							status: e,
							statusText: 'Error in beforeSend() callback'
						});
					}
					return false;
				};

				// create the XMLHttpRequest object and parameters
				var xhr = new XMLHttpRequest(),
					xhrParams = {
						'method': restArgs.method && restArgs.method.toUpperCase() || '',
						'url': targetURL,
						'timeout': restArgs.timeout
					},
					doRequest = true;

				// add authorization header, if provided
				if (restArgs.authorization) {
					// for /published API calls, only add header if not 'session' or 'anonymous' (e.g. Basic Auth in non-POD environments)
					if ((restArgs.contentType !== 'published') || (['session', 'anonymous'].indexOf(restArgs.authorization) === -1)) {
						xhrParams.headers = {
							'Authorization': restArgs.authorization
						};
					}
				}

				// add the individual request parameters
				if (xhrParams.method === 'GET' && xhrParams.url) {
					// 'GET' request
				} else if (xhrParams.method === 'POST' && xhrParams.url && restArgs.noCSRFToken && restArgs.postData) {
					// 'POST' request
					xhrParams.headers['Content-Type'] = 'application/json; charset=UTF-8';
					xhrParams.headers['X-Requested-With'] = 'XMLHttpRequest';
					xhrParams.data = restArgs.postData;
				} else if ((['POST', 'PUT'].indexOf(xhrParams.method) !== -1) && xhrParams.url && restArgs.postData) {
					// 'POST'/'PUT' request with X-CSRF-Token
					xhrParams.headers['Content-Type'] = 'application/json; charset=UTF-8';
					xhrParams.headers['X-Requested-With'] = 'XMLHttpRequest';
					xhrParams.headers['X-CSRF-Token'] = this.getCSRFToken(xhrParams.url);
					xhrParams.data = restArgs.postData;
				} else if (xhrParams.method === 'DELETE' && xhrParams.url) {
					// 'DELETE' request with X-CSRF-Token
					xhrParams.headers['X-CSRF-Token'] = this.getCSRFToken(xhrParams.url);
				} else {
					_logger.error('_rest.callRestServer: invalid arguments:');
					_logger.error(restArgs);

					reject({
						status: 400,
						statusText: 'Expected to see arguments: { "method": "GET/POST/PUT/DELETE", "url": url } but recieved: ' + JSON.stringify(restArgs)
					});

					// note that no request to make
					doRequest = false;
				}

				// execute the request
				if (doRequest) {
					// handle the promise actions for the responses
					xhr.onload = function () {
						if (this.status >= 200 && this.status < 300) {
							resolve(JSON.parse(xhr.response ? xhr.response : xhr.responseText));
						} else {
							reject({
								status: this.status,
								statusText: xhr.statusText
							});
						}
					};
					xhr.onerror = function () {
						reject({
							status: this.status,
							statusText: xhr.statusText
						});
					};
					xhr.ontimeout = function () {
						reject({
							status: this.status,
							statusText: xhr.statusText
						});
					};

					xhr.open(xhrParams.method, xhrParams.url);

					// add in the headers
					for (var header in xhrParams.headers) {
						if (xhrParams.headers.hasOwnProperty(header)) {
							xhr.setRequestHeader(header, xhrParams.headers[header]);
						}
					}

					xhr.timeout = xhrParams.timeout; // for IE, need to set timeout after open()

					// handle the beforeSend() callback and then make the request
					if (beforeSendOK(xhr)) {
						if (xhrParams.data) {
							xhr.send(JSON.stringify(xhrParams.data));
						} else {
							xhr.send();
						}
					}
				}
			});

			// return the promise
			return xmlHTTPPromise.then(function (response) {
				if (typeof self.coerceData === 'function') {
					return self.coerceData(response);
				} else {
					return Promise.resolve(response);
				}
			});
		}
	};


	// Content REST API handle '/content' prefix
	var _ContentAPI = function () {};
	if (_scsIsNode) {
		_ContentAPI.prototype = Object.create(_RestAPINode.prototype);
	} else {
		_ContentAPI.prototype = Object.create(_RestAPIBrowser.prototype);
	}
	_ContentAPI.prototype.contextRoot = '/content';
	_ContentAPI.prototype.defaultVersion = 'v1';
	_ContentAPI.prototype.supportedVersions = [{
			semanticVersion: '1.0.0',
			contentVersion: 'v1'
		},
		{
			semanticVersion: '1.1.0',
			contentVersion: 'v1.1'
		}
	];
	_ContentAPI.prototype.getContentVersion = function (caller, requestedVersion) {
		// get semantic version
		var regEx = /\s*((([<>]?=?)\s*(v)?([0-9]+)(\.([0-9]+))?(\.([0-9]+))?))\s*/g,
			parsedVersion = regEx.exec(requestedVersion || '0.0.0') || [],
			semanticVersion = (parsedVersion[5] || '0') + '.' + (parsedVersion[7] || '0') + '.' + (parsedVersion[9] || '0');

		// get the Supported Version based on the semantic version
		for (var i = 0; i < this.supportedVersions.length; i++) {
			if (this.supportedVersions[i].semanticVersion === semanticVersion) {
				return this.supportedVersions[i].contentVersion;
			}
		}

		// if we got to here, no version match
		// warn user that non-supported version requested
		_logger.warn('Content SDK: "' + caller + '" has unrecognized Content Version: "' + requestedVersion + '" - defaulting to: version="' + this.defaultVersion + '". To avoid this message, use one of the supported versions when creating a content client: ' + JSON.stringify(this.sOupportedVersions));

		// return the default version
		return this.defaultVersion;
	};
	_ContentAPI.prototype.state = {
		'published': 'published',
		'draft': 'management'
	};
	_ContentAPI.prototype.getCSRFToken = function (requestURL) {
		// Required for Management API
		return 'CSRFToken';
	};
	_ContentAPI.prototype.createPrefix = function (args) {
		// standard prefix is: "http://<server>:<port>/content/[management||publish]/api/[v1|v1.1]"
		return args.contentServer + this.contextRoot + '/' + this.state[args.contentType] + '/api/' + this.contentVersion;
	};
	_ContentAPI.prototype.createSuffix = function (args) {
		// standard suffix is: "{parameter driven search string}&[access-token|channelToken]={channelToken}&cb={cacheBuster}"
		var search = args.search || '',
			channelToken = args.channelToken ? this.properties.tokenName + '=' + args.channelToken : '',
			cacheBusterValue = typeof args.cacheBuster === 'object' ? args.cacheBuster.contentKey : args.cacheBuster,
			cacheBuster = cacheBusterValue ? 'cb=' + cacheBusterValue : '',
			suffix = '';


		// add in search
		suffix += search;

		// add in channelToken
		suffix += (suffix && channelToken ? '&' : '') + channelToken;

		// add in cacheBuster
		suffix += (suffix && cacheBuster ? '&' : '') + cacheBuster;


		return suffix;
	};
	// Format the fully qualified REST URL
	// path: section of the URL beyond the standard REST API
	// args: 
	//    contentServer: '<protocol>://<host>:<port>' of the content server
	//    contentType: [management|published]
	//    search: search string to add as query string
	//    channelToken: 'channelToken=<channelToken>' to be added
	//    cacheBuster: 'cb=<cacheBuster>' to be added
	_ContentAPI.prototype.formatURL = function (path, restArgs) {
		var prefix = this.createPrefix(restArgs),
			suffix = this.createSuffix(restArgs),
			url = prefix + path + (suffix ? (path.indexOf('?') === -1 ? '?' : '&') + suffix : '');

		_logger.info(url);

		return url;
	};
	_ContentAPI.prototype.resolveGetTypesPath = function (args) {
		return '/types';
	};
	// args.typeName: restrict aggregate query to specific types
	_ContentAPI.prototype.resolveGetTypePath = function (args) {
		return '/types/' + args.typeName;
	};
	_ContentAPI.prototype.makeGetFolderMetadataURL = function (args) {
		var prefix = args.contentServer + '/documents/web?IdcService=GET_METADATA&suppressHttpErrorCodes=1&items=fFolderGUID:',
			url = prefix + args.folderGUID.join(',');
		_logger.info(url);

		return url;
	};
	_ContentAPI.prototype.getLayouts = function (types, restArgs) {
		var self = this,
			typesURL = self.formatURL(
				self.resolveGetTypesAggregatePath({
					'types': types || []
				}), restArgs),
			layoutsPromise = new Promise(function (resolve, reject) {

				// get all the layouts from the server
				self.callRestServer(typesURL, restArgs).then(_utils.bind(function (contentTypes) {
						var typeFolderIDMap = {},
							folderGUIDURL;

						// store the type to folderID map
						// The folder containing the meta-data is stored in the externalFile property, 
						// if it exists, get the folder meta-data
						if (contentTypes.externalFile) {
							typeFolderIDMap[contentTypes.externalFile.folderId] = contentTypes.name;
							folderGUIDURL = self.makeGetFolderMetadataURL({
								'contentServer': restArgs.contentServer,
								'folderGUID': [contentTypes.externalFile.folderId]
							});

							self.callRestServer(folderGUIDURL, restArgs).then(_utils.bind(function (layouts) {
									var categoryNameFieldIndex,
										categoryLayoutFieldIndex,
										folderIdFieldIndex,
										layoutMappingData = layouts && layouts.ResultSets && layouts.ResultSets.xCaasTypeCategoryLayoutMappingCollection,
										fields,
										rows,
										layoutMap = {};

									if (!layoutMappingData) {
										// User might not have permission.
										reject(layouts.LocalData.StatusMessage);
										return;
									}

									fields = layoutMappingData.fields;
									rows = layoutMappingData.rows;

									// Find the field indexes
									for (var fldIndex = 0; fldIndex < fields.length; fldIndex++) {
										if (fields[fldIndex].name === 'xCaasCategoryName') {
											categoryNameFieldIndex = fldIndex;
										} else if (fields[fldIndex].name === 'xCaasLayoutName') {
											categoryLayoutFieldIndex = fldIndex;
										} else if (fields[fldIndex].name === 'dParentMetadataUnitID') {
											folderIdFieldIndex = fldIndex;
										}
									}

									// Create the category to layout map for each type
									rows.forEach(function (row) {
										var type = typeFolderIDMap[row[folderIdFieldIndex]],
											layoutMapEntry;

										// add the map to the type
										if (!layoutMap[type]) {
											layoutMap[type] = {};
										}
										layoutMap[type][row[categoryNameFieldIndex]] = row[categoryLayoutFieldIndex];
									});


									// return the layout map
									resolve(layoutMap);
								}, self),
								function (jqXHR, textStatus) {
									reject(textStatus);
								});
						} else {
							// no external file defined - return undefined
							resolve(undefined);
						}
					}, self),
					function (jqXHR, textStatus) {
						reject(textStatus);
					});
			});

		return layoutsPromise;
	};
	_ContentAPI.prototype.isDigitalAsset = function (id) {
		return /^DigitalAsset_/i.test(id) || (id.length === 36 && (/^CONT/.test(id) || /^CORE/.test(id)));
	};
	_ContentAPI.prototype.getRenditionURL = function (itemGUID, itemType, restArgs) {
		var url = '';

		if (itemGUID) {
			if (this.isDigitalAsset(itemGUID)) {
				// Content URL
				var type,
					digitalAssets,
					format = restArgs.format,
					download = restArgs.download,
					cacheBusterValue = typeof restArgs.cacheBuster === 'object' ? restArgs.cacheBuster.contentKey : restArgs.cacheBuster,
					joinChar = '?'; // character to use to join query parameters


				// secure and non-secure assets now use the same path
				digitalAssets = restArgs.secureContent ? this.properties.secureAssetURLName : this.properties.assetURLName;

				type = itemType || this.properties.digitalAssetDefault;
				url = this.createPrefix(restArgs) + '/' + digitalAssets + '/' + itemGUID + '/' + type;

				// add in any query parameters
				if (cacheBusterValue) {
					url += joinChar + 'cb=' + cacheBusterValue;
					joinChar = '&';
				}
				if (format) {
					url += joinChar + 'format=' + format;
					joinChar = '&';
				}
				if (download) {
					url += joinChar + 'download=true';
					joinChar = '&';
				}
				if ((restArgs.contentType === 'published') && (restArgs.channelToken)) {
					url += joinChar + this.properties.tokenName + '=' + restArgs.channelToken;
					joinChar = '&';
				}
			} else {
				// Documents URL
				url = restArgs.contentServer + '/documents/file/' + itemGUID;
			}
		}

		_logger.info(url);
		return url;
	};
	_ContentAPI.prototype.makeQueryParameters = function (args) {
		var queryParams = _utils.extend({}, args),
			searchParams = {
				postData: {},
				getData: ''
			},
			parameters = '',
			search = queryParams.search;

		// remove Content SDK arguments and old properties we don't want to add as query parameters
		delete queryParams.ids;
		delete queryParams.IDs;
		delete queryParams.id;
		delete queryParams.ID;
		delete queryParams.itemGUID;
		delete queryParams.itemGUIDs;
		delete queryParams.timeout;
		delete queryParams.search;
		delete queryParams.types;
		delete queryParams.beforeSend;
		delete queryParams.contentType;
		delete queryParams.language;

		// use POST if size of URL will be > 1800 - ensure size available for rest of URL (server, cachebuster, channelToken, ...)
		if (JSON.stringify(queryParams).length > 1800) {
			// note that POST call should be used and pass all the parameters as the body
			searchParams.method = 'POST';
			searchParams.postData = queryParams;
		} else {
			// define the string to separate each parameter on the URL
			var separator = '';

			// construct the URL query string from the properties passed in
			for (var property in queryParams) {
				if (queryParams.hasOwnProperty(property)) {
					// if it's a valid URL property, include it
					if (property === encodeURI(property)) {
						var propVal = queryParams[property];

						// convert the "orderBy" array property if required
						// CaaS only supports a single orderBy value, so just use the first item in the array
						if (property === 'orderBy' && Array.isArray(propVal) && propVal.length === 1) {
							var order = propVal[0].order && propVal[0].order.toLowerCase() || '',
								orderEntry = order ? ':' + (order === 'des' ? 'desc' : order) : '';

							propVal = propVal[0].name + orderEntry;
						}

						// we're only handling scalar parameters in GET requests
						if (typeof propVal !== 'object') {
							parameters += separator + property + '=' + encodeURI(propVal);
							separator = '&';
						}
					}
				}
			}

			// add in any old style 'search' properties
			parameters += search ? separator + search : '';

			// note that 'GET' call should be used and pass back the parameters
			searchParams.method = 'GET';
			searchParams.getData = parameters;

			// note if should use aggregate call
			// aggregate calls should be used for "itemDepth" != 0 and "expand" parameters
			searchParams.useAggregate = queryParams.itemDepth || queryParams.expand;
		}

		return searchParams;
	};

	// Content API v1: Inherit from base with v1 specific overrides
	var _ContentAPI_v1Impl = function () {};
	_ContentAPI_v1Impl.prototype = Object.create(_ContentAPI.prototype);
	_ContentAPI_v1Impl.prototype.contentVersion = 'v1';
	_ContentAPI_v1Impl.prototype.properties = {
		tokenName: 'access-token',
		digitalAssetDefault: 'default',
		assetURLName: 'digital-assets',
		secureAssetURLName: 'secure-digital-assets'
	};
	_ContentAPI_v1Impl.prototype.resolveGetItemListPath = function (args) {
		return '/items' + (args.useAggregate ? '/aggregate' : '') + (args.types ? '?field:type:equals=' + args.types : '');
	};
	_ContentAPI_v1Impl.prototype.resolveGetItemPath = function (args) {
		return '/items/' + args.itemGUID + (args.useAggregate ? '/aggregate' : '');
	};
	_ContentAPI_v1Impl.prototype.resolveSearchPath = function (args) {
		return '/items/queries';
	};
	_ContentAPI_v1Impl.prototype.resolveGetTypesAggregatePath = function (args) {
		var contentTypes = args.types.length > 0 ? '/' + args.types.join(',') : '';

		return '/aggregates/types' + contentTypes;
	};
	_ContentAPI_v1Impl.prototype.resolveGetBulkItemListPath = function (args) {
		// args.itemGUIDs: array of IDs to add to the URL
		return '/items/bulk' + (args.useAggregate ? '/aggregate' : '') + '?ids=' + args.itemGUIDs.join(',');
	};

	// Content API v1.1: Inherit from v1 with v1.1 specific overrides
	var _ContentAPI_v1_1Impl = function (contentVersion) {
		if (contentVersion) {
			this.requestedContentVersion = contentVersion;
		}
	};
	_ContentAPI_v1_1Impl.prototype = Object.create(_ContentAPI_v1Impl.prototype);
	_ContentAPI_v1_1Impl.prototype.contentVersion = 'v1.1';
	_ContentAPI_v1_1Impl.prototype.properties = {
		tokenName: 'channelToken',
		digitalAssetDefault: 'native',
		assetURLName: 'assets',
		secureAssetURLName: 'assets'
	};
	_ContentAPI_v1_1Impl.prototype.resolveGetItemListPath = function (args) {
		var itemListURL = '/items',
			joinChar = '?';

		// add in query
		if (args.types) {
			itemListURL += joinChar + 'field:type:equals=' + args.types;
			joinChar = '&';
		}
		// add in aggregate
		if (args.useAggregate) {
			itemListURL += joinChar + 'expand="all"';
			joinChar = '&';
		}

		return itemListURL;
	};
	_ContentAPI_v1_1Impl.prototype.resolveGetItemPath = function (args) {
		var language = args.language ? '/variations/language/' + args.language + '?fields=all' : '',
			nextParam = language ? '&' : '?',
			aggregate = args.useAggregate ? nextParam + 'expand=' + args.useAggregate : '';

		return '/items/' + args.itemGUID + language + aggregate;
	};
	_ContentAPI_v1_1Impl.prototype.resolveSearchPath = function (args) {
		return '/items';
	};
	_ContentAPI_v1_1Impl.prototype.resolveGetTypesAggregatePath = function (args) {
		var contentTypes = args.types.length > 0 ? '/' + args.types.join(',') : '';

		return '/types' + contentTypes;
	};
	_ContentAPI_v1_1Impl.prototype.resolveGetBulkItemListPath = function (args) {
		// args.itemGUIDs: array of IDs to add to the URL
		var idQuery = '(id eq "' + args.itemGUIDs.join('" or id eq "') + '")';
		var languageQuery = args.language ? '(language eq "' + args.language + '")' : '';

		return '/items?q=' + (languageQuery ? '(' + idQuery + ' and ' + languageQuery + ')' : idQuery);
	};
	_ContentAPI_v1_1Impl.prototype.coerceData = function (response) {
		var self = this;
		return new Promise(function (resolve, reject) {
			// if the requested content version is v1, coerce data from v1.1 to v1 format
			if (self.requestedContentVersion === 'v1') {
				if (typeof response.fields === 'object') {
					// coerce single item
					if (!response.data) {
						response.data = response.fields;
					}
				} else if (Array.isArray(response.items)) {
					// coerce array of items
					response.items.forEach(function (item) {
						if (typeof item.fields === 'object' && !item.data) {
							item.data = item.fields;
						}
					});
				}
			}

			// resolve with updated data
			return resolve(response);
		});
	};


	// setup the REST API, content version is handled within the underlying REST call
	var _restAPIFactory = {
		createRestAPI: function (contentVersion) {
			var validContentVersion = _ContentAPI.prototype.getContentVersion('ContentSDK create content client', contentVersion);
			if (validContentVersion === 'v1') {
				// only support v1.1 now, so create a v1.1 API and set the requestd content version to v1
				// we will coerce the data on fetch to be in the v1 format
				//if (window.localStorage && window.localStorage['scs.component.content.v1removal.enable'] === 'true') {
				if (true) {
					// ToDo: wait for deprecation and fix up tests that are expecting 'v1' in the URL before making this change
					return new _ContentAPI_v1_1Impl('v1');
				} else {
					return new _ContentAPI_v1Impl();
				}
			} else {
				return new _ContentAPI_v1_1Impl();
			}
		}
	};

	//
	// ------------------------------- Content Client SDK -------------------------------------
	//

	/**
	 * Client content SDK object to interact with content published in Oracle Content and Experience Cloud: 
	 * <ul>
	 * <li>Read the published content items</li>
	 * <li>Render published content using named content layouts</li>
	 * </ul>
	 * @constructor
	 * @alias ContentDeliveryClient
	 * @param {object} args - A JavaScript object containing the parameters to create the content delivery client instance.
	 * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle Content and Experience Cloud instance providing content.  The default assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
	 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the content delivery REST API to use.
	 * @param {string} args.channelToken - The Oracle Content and Experience Cloud instance token for accessing published content.
	 * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether or not content is fetched from the browser cache.
	 * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
	 * @param {string} [args.authorization] - Authorization header to include in the request.
	 * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @param {string} [args.timeout=0] - Timeout for the AJAX calls. Defaults to no timeout.
	 * @param {object} args.logger - An object that implements the standard log functions: ['error', 'warn', 'info', 'debug', 'log'].
	 * @returns {ContentDeliveryClient}
	 */
	var ContentDeliveryClientImpl = function (args) {
		// create the restAPI based on the content version
		this.restAPI = _restAPIFactory.createRestAPI(args.contentVersion);

		// update the logger entries
		_logger.updateLogger(args.logger);

		// store the given properties
		this.info = {
			'accessToken': args.channelToken || args.accessToken, // support accessToken backwards compatibilty
			'channelToken': args.channelToken || args.accessToken, // support accessToken backwards compatibilty
			'cacheBuster': args.cacheBuster,
			'beforeSend': args.beforeSend,
			'clientType': 'delivery',
			'contentServer': this.restAPI.extractServer(args.contentServer),
			'contentType': 'published',
			'secureContent': args.secureContent || false,
			'timeout': args.timeout || 0,
			'contentVersion': this.restAPI.requestedContentVersion || this.restAPI.contentVersion
		};

		// store if running in compiler
		this.isCompiler = args.isCompiler; 

		// set the authorization value
		this.info.authorization = args.authorization;

		// note supported content types
		this.validContentTypes = ['published'];
		this.validLayoutTypes = this.validContentTypes;

		// define the external API
		this.publicSDK = {
			getInfo: _utils.bind(this.getInfo, this),
			getItem: _utils.bind(this.getItem, this),
			getItems: _utils.bind(this.getItems, this),
			searchItems: _utils.bind(this.queryItems, this), // name changed to queryItems
			queryItems: _utils.bind(this.queryItems, this),
			getRenditionURL: _utils.bind(this.getRenditionURL, this),
			getLayoutInfo: _utils.bind(this.getLayoutInfo, this),
			loadContentLayout: _utils.bind(this.loadContentLayout, this),
			renderItem: _utils.bind(this.renderItem, this),
			expandMacros: _utils.bind(this.expandMacros, this)
		};

		_logger.debug('ContentClient.create: Content Info:');
		_logger.debug(this.info);
	};

	// common function for evaluating parameters to be used for the REST call
	ContentDeliveryClientImpl.prototype.resolveRESTArgs = function (method, args) {
		var searchParams = this.restAPI.makeQueryParameters(args),
			restArgs = _utils.extend({}, this.info); // start with the Client properties

		// add in the defaults
		restArgs.method = method;
		restArgs.contentType = this.getContentType(args.contentType);

		// add in authorization
		restArgs.authorization = this.getInfo().authorization;

		// add in the language locale
		restArgs.language = args.language;

		// override call specific properties
		restArgs.beforeSend = args.beforeSend || restArgs.beforeSend;
		restArgs.timeout = args.timeout || restArgs.timeout;

		//
		// add in the searchParam options
		//
		restArgs.postData = searchParams.postData;
		restArgs.useAggregate = searchParams.useAggregate;

		// getData passed in as 'search' parameter for URL construction
		restArgs.search = searchParams.getData;

		// rendition data may have format of the image
		if (args.format) {
			restArgs.format = args.format;
		}

		// links for download
		if (args.download) {
			restArgs.download = args.download;
		}

		// allow searchParams method override from GET to POST
		if (restArgs.method === 'GET') {
			restArgs.method = searchParams.method || restArgs.method;
		}

		return restArgs;
	};

	// Get Content Type based on allowed values
	ContentDeliveryClientImpl.prototype.getContentType = function (contentType) {
		var requestedType = typeof contentType === 'string' && contentType.toLowerCase() || this.info.contentType;

		if (this.validContentTypes.indexOf(requestedType) !== -1) {
			// return valid type
			return requestedType;
		} else {
			// warn of invalid type
			_logger.warn('Invalid value for content type request: ' + contentType + '. Allowed values are: ' + JSON.stringify(this.validContentTypes) + '. Defaulting to: ' + this.info.contentType);
		}

		// default the type
		return this.info.contentType;
	};

	// Get Layout Type based on allowed values
	ContentDeliveryClientImpl.prototype.getLayoutType = function (layoutType) {
		// default to the contentType if doesn't exist
		var requestedType = typeof layoutType === 'string' && layoutType.toLowerCase() || this.info.contentType;

		if (this.validLayoutTypes.indexOf(requestedType) !== -1) {
			// return valid type
			return requestedType;
		} else {
			_logger.warn('Invalid value for layout type request: ' + layoutType + '. Allowed values are: ' + JSON.stringify(this.validLayoutTypes) + '. Defaulting to: ' + this.info.contentType);
		}

		// default the type
		return this.info.contentType;
	};

	// Render the given render.js file with the data into the container
	ContentDeliveryClientImpl.prototype.renderLayout = function (requireLayout, data, container, preLoadLayout, resolve, reject) {
		// Rendering of layouts not supported on Node
		// Layouts have dependencies on RequireJS AMD structure rather than CommonJS
		if (_scsIsNode) {
			reject({
				error: 'renderLayout function not supported under NodeJS'
			});
		} else {
			// call appropriate render operation
			if (preLoadLayout) {
				_requireConfig.preloadContentLayout(requireLayout, resolve, reject);
			} else {
				// provide this contentClient to the layout and render it
				var layoutParams = _utils.extend({}, data);
				if (!layoutParams.contentClient) {
					layoutParams.contentClient = this.publicSDK;
				}
				_requireConfig.renderContentLayout(requireLayout, layoutParams, container, resolve, reject);
			}
		}
	};


	/**
	 * Retrieves the values stored as part of the client object and used on each call.<br/>
	 * Once created, these values are immutable for the client instance.
	 * @returns {ContentSDK.ContentInfo} The information the SDK is using to retrieve content from Oracle Content and Experience Cloud. 
	 * @example
	 * // get the information on the server and the state used by calls to this client
	 * console.log(contentClient.getInfo());
	 */
	ContentDeliveryClientImpl.prototype.getInfo = function () {
		// return a copy of the values
		return _utils.extend({}, this.info);
	};

	/**
	 * Get a single item given its ID. <br/>
	 * The ID can be found in the search results.
	 * @param {object} args - A JavaScript object containing the "getItem" parameters.
	 * @param {string} args.id - The ID of the content item to return.
	 * @param {string} args.language - The language locale variant of the content item to return.
	 * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data after the call has completed.
	 * @example
	 * contentPromise = contentClient.getItem({
	 *     'id': contentId
	 * });
	 *
	 * // handle the result
	 * contentPromise.then(
	 *     function (result) {
	 *         console.log(result);
	 *     },
	 *     function (error) {
	 *         console.log(error);
	 *     }
	 * );
	 */
	ContentDeliveryClientImpl.prototype.getItem = function (params) {
		var args = params || {},
			guid = args.id || args.ID || args.itemGUID,
			restCallArgs = this.resolveRESTArgs('GET', args);

		// create the URL
		var url = this.restAPI.formatURL(this.restAPI.resolveGetItemPath({
			'itemGUID': guid,
			'useAggregate': restCallArgs.useAggregate,
			'language': params.language
		}), restCallArgs);

		// make the rest call
		return this.restAPI.callRestServer(url, restCallArgs);
	};

	/**
	 * Get a list of items based on their IDs.
	 *
	 * @param {object} args - A JavaScript object containing the "getItems" parameters.
	 * @param {array} [args.ids=[]] - Restrict results to the list of requested items. 
	 * @param {string} args.language - The language locale variant of the content items to return.
	 * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @param {string} [args.fields='ALL'] - Any additional properties in the "args" object will be added to the query string parameters; for example, "fields".
	 * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data after the call has completed.
	 * @example
	 * // get all items
	 * contentClient.getItems().then(function (items) {
	 *     console.log(items);
	 * });
	 * 
	 * @example
	 * // get all items and order by type and name
	 * contentClient.getItems().then(function (data) {
	 *     // sort by type and then by name
	 *     console.log(data.items.sort(function (a, b) {
	 *         if (a.type.localeCompare(b.type) !== 0) {
	 *             return a.type.localeCompare(b.type);
	 *         } else {
	 *             return a.name.localeCompare(b.name);
	 *         }
	 *     }));
	 * });
	 */
	ContentDeliveryClientImpl.prototype.getItems = function (params) {
		var self = this,
			args = params || {},
			guids = args.ids || args.IDs || args.itemGUIDs,
			restCallArgs = self.resolveRESTArgs('GET', args),
			url;

		_logger.debug('ContentClient.getItems: arguments');
		_logger.debug(args);

		// if a list of items is supplied
		if (Array.isArray(guids) && guids.length > 0) {

			var length = guids.length,
				chunk = 10,
				chunkGUIDs,
				bulkChunks = [],
				bulkPromise = new Promise(function (resolve, reject) {
					// break array up into into groups of 10
					for (var i = 0; i < length; i += chunk) {
						// get this chunk of GUIDs
						chunkGUIDs = guids.slice(i, i + chunk);

						// use bulk API for this chunk of content item IDs
						url = self.restAPI.formatURL(self.restAPI.resolveGetBulkItemListPath({
							'itemGUIDs': chunkGUIDs,
							'types': args.types,
							'useAggregate': restCallArgs.useAggregate,
							'language': restCallArgs.language
						}), restCallArgs);

						bulkChunks.push(self.restAPI.callRestServer(url, restCallArgs));
					}

					// resolve bulkChunks Promises when all requests complete
					Promise.all(bulkChunks).then(function (arrayOfResults) {
						var allContentItems = {
							'items': []
						};

						// handle v1 format
						if (self.info.contentVersion === 'v1') {
							allContentItems.items = {};

							// combine all the results
							arrayOfResults.forEach(function (results) {
								if (results && results.items) {
									allContentItems.items = _utils.extend(allContentItems.items, results.items);
								}
							});
						} else {
							// combine all the results
							arrayOfResults.forEach(function (results) {
								allContentItems.items = allContentItems.items.concat(results.items);
							});
						}

						// resolve with all the items
						resolve(allContentItems);
					}, function (err) {
						reject(err);
					});
				});

			// return the outer promise object, which will be resolved after all the items return
			return bulkPromise;
		} else {
			// No list of IDs defined, get all the items based on the search query
			url = self.restAPI.formatURL(self.restAPI.resolveGetItemListPath({
				'itemGUID': args.itemGUID,
				'types': args.types,
				'useAggregate': restCallArgs.useAggregate
			}), restCallArgs);

			return self.restAPI.callRestServer(url, restCallArgs);
		}
	};

	/**
	 * Get a list of items based on SCIM search criteria.<br/>
	 * All arguments are passed through to the Content Delivery REST API call.
	 *
	 * @param {object} args - A JavaScript object containing the "queryItems" parameters.
	 * @param {string} [args.q=''] - An SCIM query string to restrict results.
	 * @param {string} [args.fields=''] - A list of fields to include for each item returned.
	 * @param {number} [args.offset] - Return results starting at this number in the results.
	 * @param {number} [args.limit] - Limit the number of items returned.
	 * @param {array|string} [args.orderBy=[]] - The order by which results should be returned.
	 * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data after the call has completed.
	 * @example
	 * // get all items and order by type and name
	 * contentClient.queryItems({
	 *     'q': '(type eq "' + contentType + '")',
	 *     'fields': 'ALL'
	 * }).then(function (items) {
	 *     console.log(items);
	 * });
	 */
	ContentDeliveryClientImpl.prototype.queryItems = function (params) {
		var self = this,
			parameters = '',
			args = params || {},
			restCallArgs = this.resolveRESTArgs('GET', args);

		_logger.debug('ContentClient.queryItems: arguments');
		_logger.debug(args);

		// setup the search specific arguments
		//  - search does not require management calls so the CSRF token should not be required for POST requests
		restCallArgs.noCSRFToken = true;

		// format the URL
		var url = self.restAPI.formatURL(self.restAPI.resolveSearchPath(), restCallArgs);

		return self.restAPI.callRestServer(url, restCallArgs);
	};


	/**
	 * Create the native URL to render an image asset into the page.<br/>
	 * @returns {string} A fully qualified URL to the published image asset.
	 * @param {object} args - A JavaScript object containing the "getRenditionURL" parameters.
	 * @param {string} args.id - The ID of the image asset.
	 * @example
	 * // get the rendition URL for this client
	 * console.log(contentClient.getRenditionURL({
	 *     'id': digitalAssetId
	 * }));
	 */
	ContentDeliveryClientImpl.prototype.getRenditionURL = function (params) {
		var self = this,
			args = params || {},
			guid = args.id || args.ID || args.itemGUID,
			restCallArgs = self.resolveRESTArgs('GET', args);

		if (this.isCompiler) {
			// encode into a macro and let the compiler expand
			return '[!--$SCS_DIGITAL_ASSET--]' + guid + '[/!--$SCS_DIGITAL_ASSET--]';
		} else {
			return self.restAPI.getRenditionURL(guid, args.type, restCallArgs);
		}
	};


	/**
	 * Retrieve metadata information about the content layout. <br/>
	 * <b>Note:</b> This method is isn't supported if the Content Delivery SDK is used in NodeJS.
	 * @param {object} args - A JavaScript object containing the "getLayoutInfo" parameters.
	 * @param {string} args.layout - Name of the layout in the component catalog for Oracle Content and Experience Cloud.
	 * @returns {Promise} JavaScript Promise object that is resolved when the metadata for the layout is retrieved.
	 * @example
	 * // get the Content REST API versions supported by the content layout
	 * contentClient.getLayoutInfo({
	 *     'layout': contentLayout
	 * }).then(
	 *     function (layoutInfo) {
	 *         // determine the content versions supported by the layout
	 *         console.log('Content versions supported: ' + layoutInfo.contentVersion)
	 *     },
	 *     function (error) {
	 *         console.log('Error getting data: ' + error);
	 *     }
	 * );
	 */
	ContentDeliveryClientImpl.prototype.getLayoutInfo = function (params) {
		var self = this,
			args = params || {},
			isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1,
			layoutType,
			layoutFactory;

		return new Promise(function (resolve, reject) {
			// validate required parameters passed
			if (args.layout) {
				// get the layout type and path to the content layout factory .js file
				if (isSystemLayout) {
					layoutType = 'system';
					layoutFactory = args.layout;
				} else {
					layoutType = self.getLayoutType(args.layoutType);
					layoutFactory = args.layout + '/assets/render';
				}

				// construct the require path to the content layout factory .js file
				var requireLayout = _requireConfig.getContentLayoutRequirePath(self.info) + layoutType + '/' + layoutFactory;
				_logger.debug('ContentClient.getLayoutInfo: require path: ' + requireLayout);

				// attempt to require in the layout
				require([requireLayout], function (ContentLayout) {
					var layoutContentVersion = ContentLayout.prototype.contentVersion;
					// default the version if not defined
					if (!layoutContentVersion) {
						// notify the user
						_logger.warn('Content Layout: "' + args.layout + '" does not have a contentVersion specified. Assuming data needs to be fetched in "v1.0" format for this Content Layout.  To avoid this message, add the prototype.contentVersion property to the Content Layout Factory object.');

						layoutContentVersion = '1.0.0';
					}

					// return information about the layout
					resolve({
						'name': args.layout,
						'layoutFactory': layoutFactory,
						'layoutType': layoutType,
						'requirePath': requireLayout,
						'contentVersion': layoutContentVersion
					});
				});
			} else {
				_logger.debug('ContentClient.getLayoutInfo: missing required parameters');

				// invalid parmaters
				reject('missing parameters in call to getLayoutInfo: ' + JSON.stringify(args));
			}
		});
	};

	/**
	 * Require in the requested content layout 
	 * <b>Note:</b> This method isn't supported if the Content Delivery SDK is used in NodeJS.
	 * @param {object} args - A JavaScript object containing the "renderItem" parameters.
	 * @param {string} args.layout - Name of the layout to use to render the component.
	 * @returns {Promise} JavaScript Promise object that is resolved when the layout JavaScript is loaded 
	 */
	ContentDeliveryClientImpl.prototype.loadContentLayout = function (params) {
		var self = this,
			args = params || {},
			isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1,
			layoutType,
			layoutFactory,
			loadItemPromise = new Promise(function (resolve, reject) {
				// validate required parameters passed
				if (args.layout) {
					// get the layout type and path to the content layout factory .js file
					if (isSystemLayout) {
						layoutType = 'system';
						layoutFactory = args.layout;
					} else {
						layoutType = self.getLayoutType(args.layoutType);
						layoutFactory = args.layout + '/assets/render';
					}

					// construct the require path to the content layout factory .js file
					var requireLayout = _requireConfig.getContentLayoutRequirePath(self.info) + layoutType + '/' + layoutFactory;
					_logger.debug('ContentClient.renderItem: require path: ' + requireLayout);

					require([requireLayout], function (ContentLayout) {
						resolve(ContentLayout);
					});
				} else {
					_logger.debug('ContentClient.renderItem: missing required parameters');

					// invalid parmaters
					reject('missing parameters in call to renderLayout: ' + JSON.stringify(args));
				}
			});

		return loadItemPromise;
	};

	/**
	 * Render the given data or content item using the named layout in the given container.<br>
	 * <b>Note:</b> This method isn't supported if the Content Delivery SDK is used in NodeJS.
	 * @param {object} args - A JavaScript object containing the "renderItem" parameters.
	 * @param {object} args.data - JSON data to use to render.
	 * @param {string} args.layout - Name of the layout to use to render the component.
	 * @param {DOMElement} args.container - Container DOMElement to append to.
	 * @returns {Promise} JavaScript Promise object that is resolved when the layout is loaded and rendered into the container.
	 * @example
	 * // render the item into the DOM element with a custom content layout expecting data compatible with Oracle Content and Experience Cloud Sites
	 * contentClient.getItem({
	 *     'id': contentId
	 * }).then(
	 *     function (contentItemData) {
	 *         // now the data is retrieved, render the layout
	 *         contentClient.renderItem({
	 *             'data': {
	 *                 contentItemData: contentItemData,
	 *                 scsData { 
	 *                     contentClient: contentClient
	 *                 }
	 *             },
	 *             'layout': contentLayout,
	 *             'container': document.getElementById(containerDivId)
	 *         }).then(
	 *             function () {
	 *                 // render complete
	 *                 console.log('layout added to the page');
	 *             },
	 *             function (error) {
	 *                 console.log('error rendering layout onto the page: ' + JSON.stringify(error));
	 *             }
	 *         );
	 *     },
	 *     function (error) {
	 *         console.log('Error getting data: ' + error);
	 *     }
	 * );
	 * @example
	 * // render the item into the DOM element with a custom content layout expecting custom data
	 * contentClient.getItem({
	 *     'id': contentId
	 * }).then(
	 *     function (data) {
	 *         // now the data is retrieved, render the layout
	 *         contentClient.renderItem({
	 *             'data': data,
	 *             'layout': contentLayout,
	 *             'container': document.getElementById(containerDivId)
	 *         }).then(
	 *             function () {
	 *                 // render complete
	 *                 console.log('layout added to the page');
	 *             },
	 *             function (error) {
	 *                 console.log('error rendering layout onto the page: ' + JSON.stringify(error));
	 *             }
	 *         );
	 *     },
	 *     function (error) {
	 *         console.log('Error getting data: ' + error);
	 *     }
	 * );
	 */
	ContentDeliveryClientImpl.prototype.renderItem = function (params) {
		var self = this,
			args = params || {},
			isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1,
			layoutType,
			layoutFactory,
			renderItemPromise = new Promise(function (resolve, reject) {
				// validate required parameters passed
				if (args.layout) {
					// get the layout type and path to the content layout factory .js file
					if (isSystemLayout) {
						layoutType = 'system';
						layoutFactory = args.layout;
					} else {
						layoutType = self.getLayoutType(args.layoutType);
						layoutFactory = args.layout + '/assets/render';
					}

					// construct the require path to the content layout factory .js file
					var requireLayout = _requireConfig.getContentLayoutRequirePath(self.info) + layoutType + '/' + layoutFactory;
					_logger.debug('ContentClient.renderItem: require path: ' + requireLayout);

					// dynamically require in the layout and add it to the page
					self.renderLayout(requireLayout, args.data, args.container, args.preloadLayout, resolve, reject);
				} else {
					_logger.debug('ContentClient.renderItem: missing required parameters');

					// invalid parmaters
					reject('missing parameters in call to renderLayout: ' + JSON.stringify(args));
				}
			});

		// return the JQuery deferrred object
		return renderItemPromise;
	};

	/**
	 * Expand Content Macros.<br/>
	 * Content item fields can contain macros that reference other content items. For example, a Rich Text field can have links to digital assets. <br/>
	 * If a field that you want to render can contain macros, you can use this utilty function to 
	 * expand the macros.
	 * @param {string} fieldValue - A field value that may contain macros.
	 * @returns {string} The "fieldValue" string with all macros expanded.
	 * @example
	 * // expand any macros
	 * console.log(contentClient.expandMacros('<img src="[!--$CEC_DIGITIAL_ASSET--]CONT21B61179DFA4424D942410573E8B5BCF[/!--$CEC_DIGITAL_ASSET--]"/>');
	 * 
	 */
	ContentDeliveryClientImpl.prototype.expandMacros = function (fieldValue) {
		var afterValue = fieldValue || '';
		_logger.log('expandMacros: beforeValue: ' + fieldValue);

		// supported macros
		var macros = [{
			'name': 'DIGITAL_ASSET',
			'macro': /\[!--\$CEC_DIGITAL_ASSET--\]*(.*?) *\[\/!--\$CEC_DIGITAL_ASSET--\]/g,
			'value': _utils.bind(function (matchString, digitalAssetIDStr) {
				var assetId = digitalAssetIDStr,
					isDownload = false,
					idStrParts;

				if (digitalAssetIDStr.indexOf(',')) {
					idStrParts = digitalAssetIDStr.split(',');
					assetId = idStrParts[0];
					isDownload = (idStrParts[1] === "true");
				}

				return this.getRenditionURL({
					'id': assetId,
					'download': isDownload
				});
			}, this)
		}, {
			'name': 'PAGE_LINK',
			'macro': /\[!--\$SCS_PAGE--\]*(.*?) *\[\/!--\$SCS_PAGE--\]/g,
			'value': _utils.bind(function (matchString, page) {
				var pageId,
					renderApi = (window && window.SCSRenderAPI) || {};
				if (typeof renderApi.getPageLinkData === 'function') {
					var pageLinkData = renderApi.getPageLinkData(page);
					pageId = pageLinkData && pageLinkData.href;
				} else if (typeof renderApi.getPageLinkUrl === 'function') {
					pageId = renderApi.getPageLinkUrl(page);
				}
				return pageId || '#';
			}, this)
		}];

		// if it's a compiler, remove macros that compiler will expand
		if (this.isCompiler) {
			// currently compiler can handle all macros
			macros = [];
		}

		// expand each of the supported macros
		macros.forEach(function (macroEntry) {
			afterValue = afterValue.replace(macroEntry.macro, macroEntry.value);
		});

		_logger.log('expandMacros: afterValue: ' + afterValue);

		return afterValue;
	};



	//
	// ------------------------ Content Client Preview SDK -----------------------------
	//

	/**
	 * Client content preview SDK object to interact with draft content in Oracle Content and Experience Cloud: 
	 * <ul>
	 * <li>Authenticated connection to the Content Server.</li>
	 * <li>Read content types.</li>
	 * <li>Read draft content items.</li>
	 * <li>Render draft content using named content layouts.</li>
	 * </ul>
	 * The content preview client SDK object uses the "/management/" Content REST API calls.  This requires the user to be logged in to the system. 
	 * @constructor
	 * @alias ContentPreviewClient
	 * @augments ContentDeliveryClient
	 * @param {object} args - A JavaScript object containing the parameters to create the content preview client instance.
	 * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle Content and Experience Cloud instance providing content.  The default assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
	 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the content preview REST API to use.
	 * @param {string} args.channelToken - The Oracle Content and Experience Cloud instance token for accessing published content.
	 * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether or not content is fetched from the browser cache.
	 * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
	 * @param {string} [args.authorization] - Authorization header to include in the request.
	 * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @param {string} [args.timeout=0] - Timeout for the AJAX calls. Defaults to no timeout.
	 * @param {object} args.logger - An object that implements the standard log functions: ['error', 'warn', 'info', 'debug', 'log'].
	 * @returns {ContentPreviewClient}
	 */
	var ContentPreviewClientImpl = function (args) {
		this.restAPI = _restAPIFactory.createRestAPI(args.contentVersion);

		// update the logger entries
		_logger.updateLogger(args.logger);

		// store the given properties
		this.info = {
			'accessToken': args.channelToken || args.accessToken, // support accessToken backwards compatibilty
			'channelToken': args.channelToken || args.accessToken, // support accessToken backwards compatibilty
			'beforeSend': args.beforeSend,
			'cacheBuster': args.cacheBuster,
			'clientType': 'preview',
			'contentServer': this.restAPI.extractServer(args.contentServer),
			'contentType': (args.contentType && args.contentType.toLowerCase() === 'published') ? 'published' : 'draft',
			'secureContent': args.secureContent || false,
			'timeout': args.timeout || 0,
			'contentVersion': this.restAPI.requestedContentVersion || this.restAPI.contentVersion
		};

		// store if running in compiler
		this.isCompiler = args.isCompiler; 

		// set the authorization value 
		this.info.authorization = args.authorization;

		// note supported content types
		this.validContentTypes = ['published', 'draft'];
		this.validLayoutTypes = this.validContentTypes;

		// define the external API
		this.publicSDK = {
			getInfo: _utils.bind(this.getInfo, this),
			getItem: _utils.bind(this.getItem, this),
			getItems: _utils.bind(this.getItems, this),
			searchItems: _utils.bind(this.queryItems, this), // name change to queryItems
			queryItems: _utils.bind(this.queryItems, this),
			getRenditionURL: _utils.bind(this.getRenditionURL, this),
			getLayoutInfo: _utils.bind(this.getLayoutInfo, this),
			loadContentLayout: _utils.bind(this.loadContentLayout, this),
			renderItem: _utils.bind(this.renderItem, this),
			expandMacros: _utils.bind(this.expandMacros, this),
			getTypes: _utils.bind(this.getTypes, this),
			getType: _utils.bind(this.getType, this),
			getCategoryToLayoutMapping: _utils.bind(this.getCategoryToLayoutMapping, this)
		};

		_logger.debug('ContentClient.create: Content Info:');
		_logger.debug(this.info);
	};

	// inherit from deliveryClient
	ContentPreviewClientImpl.prototype = Object.create(ContentDeliveryClientImpl.prototype);

	/**
	 * Get a list of item types based on the search criteria.
	 * @param {object} args A JavaScript object containing the "getTypes" parameters. If empty, it will return all content types. 
	 * @param {number} [args.limit] - Limit the number of content types returned.
	 * @param {number} [args.offset] - Return results starting at this number in the results.
	 * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data after the call has completed.
	 * @example
	 * contentClient.getTypes().then(
	 *     function (data) {
	 *         console.log(data);
	 *     }).catch(function (error) {
	 *         console.log(error);
	 *     });
	 * @example
	 * contentClient.getTypes({ 
	 *     limit: 10 
	 * }).then(
	 *     function (data) {
	 *         console.log(data);
	 *     }).catch(function (error) {
	 *         console.log(error);
	 *     });
	 */
	ContentPreviewClientImpl.prototype.getTypes = function (params) {
		var self = this,
			args = params || {},
			restCallArgs = self.resolveRESTArgs('GET', args);

		_logger.debug('ContentClient.getTypes: arguments');
		_logger.debug(args);

		var url = self.restAPI.formatURL(
			self.restAPI.resolveGetTypesPath(), restCallArgs);

		return self.restAPI.callRestServer(url, restCallArgs);
	};


	/**
	 * Get a single item type given it's name. <br/>
	 * The name can be found from the search results.
	 * @param {object} args A JavaScript object containing the "getType" parameters.
	 * @param {string} args.typeName The name of the content type to return.
	 * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data after the call has completed 
	 * @example
	 * contentClient.getType({
	 *     'typeName': 'Customer'
	 * }).then(
	 *     function (data) {
	 *         console.log(data);
	 *     }).catch(function (error) {
	 *         console.log(error);
	 *     });
	 */
	ContentPreviewClientImpl.prototype.getType = function (params) {
		var self = this,
			args = params || {},
			restCallArgs = self.resolveRESTArgs('GET', args);

		_logger.debug('ContentClient.getType: arguments');
		_logger.debug(args);

		var url = self.restAPI.formatURL(self.restAPI.resolveGetTypePath({
			'typeName': args.typeName
		}), restCallArgs);

		return self.restAPI.callRestServer(url, restCallArgs);
	};

	/**
	 * Get the content type category => layout mapping<br/>
	 * Each content type has a mapping from a "category" to a "layout".  <br/>
	 * Based on the selected category, you choose the corresponding layout. 
	 * @ignore
	 * @param {object} args arguments to use to return the item
	 * @param {array} [args.types=[]] - Array of types. Mappings are retrieved for each type.  If not supplied all types are retrieved.
	 * @param {string} [args.timeout=ContentPreviewClient.getInfo().timeout] - Timeout for the AJAX calls, defaults to value set for client
	 * @returns {Promise} JavaScript Promise object that is resolved to {@link ContentSDK.ContentCategoryToLayoutMapping}
	 * @example
	 * // Get all the category to layout mappings 
	 * contentClient.getCategoryToLayoutMapping().then(function (layouts) {
	 *     console.log(layouts);
	 * }, function (error) {
	 *     console.log('Error: ' + error);
	 * });
	 * @example
	 * // Get the category to layout mappings for 'Car'
	 * contentClient.getCategoryToLayoutMapping().then(function (layouts) {
	 *     console.log(layouts); 
	 * }, function (error) {
	 *     console.log('Error: ' + error);
	 * });
	 */
	ContentPreviewClientImpl.prototype.getCategoryToLayoutMapping = function (params) {
		var self = this,
			args = params || {},
			types = args.types || [],
			restCallArgs = self.resolveRESTArgs('GET', args),
			layoutsPromise = new Promise(function (resolve, reject) {

				// get all the layouts from the server
				self.restAPI.getLayouts(types, restCallArgs).then(function (categoryLayoutMap) {
						// return the layouts
						resolve(categoryLayoutMap);
					},
					function (error) {
						// report the error
						reject('Failed to retrieve layouts from the content server. Verify that you can connect to the content server. ' + error);
					});
			});

		return layoutsPromise;
	};

	//
	// ------------------------------- Content SDK -------------------------------------
	//

	/**
	 * @constructor
	 * @alias ContentSDK
	 */
	var ContentSDKFactoryImpl = function () {};

	// handle backwards compatibilty for obsolete functions
	// We extend the passed in object to support Node and Require
	contentSDK.enableLogging = function () {
		console.info('ContentSDK - enableLogging function obsolete, pass logger into the content client');
	};
	contentSDK.userLogging = function (logger) {
		console.info('ContentSDK - userLogging function deprecated, pass logger into the content client');
		_logger.updateLogger(logger);
	};

	/**
	 * Create a client content SDK object to interact with content published in Oracle Content and Experience Cloud: 
	 * <ul>
	 * <li>Read the published content items</li>
	 * <li>Render published content using named content layouts</li>
	 * </ul
	 * @memberof ContentSDK
	 * @param {object} args - A JavaScript object containing the parameters to create the content delivery client instance.
	 * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle Content and Experience Cloud instance providing content.  The default assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
	 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the content delivery REST API to use.
	 * @param {string} args.channelToken - The Oracle Content and Experience Cloud instance token for accessing published content.
	 * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether or not content is fetched from the browser cache.
	 * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
	 * @param {string} [args.authorization] - Authorization header to include in the request.
	 * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr (browser) or options (NodeJS) object before making the REST call.
	 * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
	 * @param {object} args.logger - An object that implements the standard log functions: ['error', 'warn', 'info', 'debug', 'log'].
	 * @returns {ContentDeliveryClient}
	 * 
	 * @example
	 * // create a ContentDeliveryClient and output logging 'info' messages to the console
	 * var contentClient = contentSDK.createDeliveryClient({
	 *     'contentServer': contentServer,
	 *     'channelToken': channelToken,
	 *     'logger': {
	 *         info: function (message) {
	 *             console.log(message);
	 *         }
	 *     }
	 * });
	 */
	contentSDK.createDeliveryClient = function (params) {
		// create the delivery client with the given args
		var newSDK = new ContentDeliveryClientImpl(typeof params === 'object' ? params : {});

		_logger.debug('ContentSDK.createDelivery: created new Content SDK client object:');
		_logger.debug(newSDK);

		// expose public SDK if it was created or undefined if it failed
		return newSDK ? newSDK.publicSDK : undefined;
	};

	/**
	 * Create a client content preview SDK object to interact with draft content in Oracle Content and Experience Cloud: 
	 * <ul>
	 * <li>Authenticated connection to the Content Server.</li>
	 * <li>Read content types.</li>
	 * <li>Read draft content items.</li>
	 * <li>Render draft content using named content layouts.</li>
	 * </ul>
	 * The content preview client SDK object uses the "/management/" Content REST API calls.  This requires the user to be logged in to the system. 
	 * @memberof ContentSDK
	 * @param {object} args - A JavaScript object containing the parameters to create the content delivery client instance.
	 * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle Content and Experience Cloud instance providing content.  The default assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
	 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the content delivery REST API to use.
	 * @param {string} args.channelToken - The Oracle Content and Experience Cloud instance token for accessing published content.
	 * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether or not content is fetched from the browser cache.
	 * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
	 * @param {string} [args.authorization] - Authorization header to include in the request.
	 * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr (browser) or options (NodeJS) object before making the REST call.
	 * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
	 * @param {object} args.logger - An object that implements the standard log functions: ['error', 'warn', 'info', 'debug', 'log'].
	 * @returns {ContentPreviewClient}
	 * 
	 * @example
	 * // create a ContentPreviewClient and output logging 'info' messages to the console
	 * var contentClient = contentSDK.createPreviewClient({
	 *     'contentServer': contentServer,
	 *     'channelToken': channelToken,
	 *     'logger': {
	 *         info: function (message) {
	 *             console.log(message);
	 *         }
	 *     }
	 * });
	 */
	contentSDK.createPreviewClient = function (params) {
		var newSDK = new ContentPreviewClientImpl(typeof params === 'object' ? params : {});

		_logger.debug('ContentSDK.createPreviewClient: created new Content SDK client object:');
		_logger.debug(newSDK);

		// expose public SDK if it was created or undefined if it failed
		return newSDK ? newSDK.publicSDK : undefined;
	};

	/**
	 * Content Client Information
	 * @typedef {Object} ContentInfo
	 * @memberof ContentSDK
	 * @property {string} contentServer - The URL to the server for content.
	 * @property {string} clientType - The type of content client ['delivery' | 'preview'].
	 * @property {string} contentType - Whether to access 'published' or 'draft' content.
	 * @property {string} contentVersion - The version of the Content Delivery REST API to use.
	 * @property {string} channelToken - The Oracle Content and Experience Cloud instance token for accessing published content.
	 * @property {boolean} secureContent - Content is secured and requires sign-in to view.
	 * @property {string} authorization - Authorization header to include in the request.
	 * @property {string} beforeSend - Callback passing in the xhr (browser) or options (node) object before making the REST call.
	 * @property {string} timeout - Default timeout for AJAX calls, which can be overridden on an individual call basis.
	 * @property {string} cacheBuster - Adds "cb={cacheBusterValue}" to the URL to enable distinct browser caching of GET requests.
	 */


	/**
	 * Content Category to Layout Mapping
	 * @ignore
	 * @typedef {Array} ContentCategoryToLayoutMapping
	 * @memberof ContentSDK
	 * @property {string} name of the content layout
	 * @property {string} category category name mapped to this layout
	 * @property {boolean} published true if the layout has been published
	 */


	// return the exports
	return contentSDK;
}));