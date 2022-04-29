/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var path = require('path'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	url = require('url'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var projectDir,
	serversSrcDir;

/**
 * Global variable used by the node server
 */
/**
 * Global variable used by the node server
 */

var _siteId;
var _pagesFolderId;
var _SiteInfo;
var _siteChannelToken;
var _requiredLangs = [],
	_optionalLangs = [];
var _validLocales = [];
var _languages = [];
var _hasDetailPage = false;
var _defaultDetailPage;
var _masterSiteStructure;
var _masterPageData = [];
var _contentTypesOnPages = [];
var _pageContentIds = [];
var _detailPages = [];
var _typesToQuery = [];

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

var _cmdEnd = function (done, success) {
	done(success);
};

var _getSiteInfoFile = function (server, locale, isMaster) {
	// console.log(' - siteId: ' + _siteId);
	var siteInfoFilePromise = new Promise(function (resolve, reject) {
		serverRest.getChildItems({
			server: server,
			parentID: _siteId
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			var items = result && result.items || [];
			var name = (isMaster || !locale) ? 'siteinfo.json' : locale + '_siteinfo.json';
			var fileId;
			for (var i = 0; i < items.length; i++) {
				if (items[i].name === name) {
					fileId = items[i].id;
					break;
				}
			}

			if (!fileId) {
				return Promise.reject();
			}

			return serverRest.readFile({
				server: server,
				fFileGUID: fileId
			});
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var siteInfoFileContent = typeof result === 'string' ? JSON.parse(result) : result;
				return resolve({
					'locale': locale || 'master',
					'data': siteInfoFileContent
				});
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
	return siteInfoFilePromise;
};

var _getSiteStructure = function (server, locale, isMaster) {
	var siteStructurePromise = new Promise(function (resolve, reject) {
		serverRest.getChildItems({
			server: server,
			parentID: _siteId
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			var items = result && result.items || [];
			var name = (isMaster || !locale) ? 'structure.json' : locale + '_structure.json';
			var fileId;
			for (var i = 0; i < items.length; i++) {
				if (items[i].name === name) {
					fileId = items[i].id;
					break;
				}
			}

			if (!fileId) {
				return Promise.reject();
			}

			return serverRest.readFile({
				server: server,
				fFileGUID: fileId
			});
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var structureFileContent = typeof result === 'string' ? JSON.parse(result) : result;
				return resolve(structureFileContent);
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
	return siteStructurePromise;
};


var _getDefaultDetailPageId = function () {
	var getFirstDetailPage = function (page, childFunction) {
		var childPage,
			pageOption = 'isDetailPage',
			firstDetailPage = '';

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

	var root;
	var pages = _masterSiteStructure && _masterSiteStructure.pages;
	for (var i = 0; i < pages.length; i++) {
		if (!pages[i].parentId) {
			root = pages[i];
		}
	}
	return getFirstDetailPage(root, function (child) {
		for (var i = 0; i < pages.length; i++) {
			if (pages[i].id === child) {
				return pages[i];
			}
		}
	});
};

/**
 * Get an array of promises to get the page data for all site pages
 * 
 */
var _getPageData = function (server, locale, isMaster) {
	// console.log(' isMaster: ' + isMaster + ' locale: ' + locale);
	return new Promise(function (resolve, reject) {
		serverRest.getChildItems({
			server: server,
			parentID: _pagesFolderId,
			limit: 9999
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				var items = result && result.items || [];
				var files = [];
				for (var i = 0; i < items.length; i++) {
					var name = items[i].name;
					if (isMaster && name.indexOf('_') < 0) {
						files.push({
							id: items[i].id,
							name: items[i].name
						});
					} else if (name.indexOf('_') > 0) {
						var localeStr = name.substring(0, name.indexOf('_'));
						if (localeStr === locale) {
							files.push({
								id: items[i].id,
								name: items[i].name
							});
						}
					}
				}

				return _readPageFiles(server, files);
			})
			.then(function (result) {
				return resolve(result);
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
};

var _readFile = function (server, id, fileName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + id + '/data/';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to download file ' + fileName);
				console.error(error);
				resolve();
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve({
					id: fileName.substring(0, fileName.indexOf('.')),
					data: data
				});
			} else {
				console.error('ERROR: failed to download file: ' + fileName + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve();
			}

		});
	});
};
var _readPageFiles = function (server, files) {
	return new Promise(function (resolve, reject) {
		var total = files.length;
		console.info(' - total number of files: ' + total);
		var groups = [];
		var limit = 12;
		var start, end;
		for (var i = 0; i < total / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= total) {
				end = total - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < total - 1) {
			groups.push({
				start: end + 1,
				end: total - 1
			});
		}
		// console.log(' - total number of groups: ' + groups.length);

		var fileData = [];
		var count = [];
		var needNewLine = false;
		var doReadFile = groups.reduce(function (filePromise, param) {
			return filePromise.then(function (result) {
				var filePromises = [];
				for (var i = param.start; i <= param.end; i++) {
					filePromises.push(_readFile(server, files[i].id, files[i].name));
				}

				if (console.showInfo()) {
					needNewLine = true;
					process.stdout.write(' - downloading files [' + param.start + ', ' + param.end + '] ...');
				}
				readline.cursorTo(process.stdout, 0);
				return Promise.all(filePromises).then(function (results) {
					fileData = fileData.concat(results);
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doReadFile.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}

			// console.log(' - total number of downloaded files: ' + fileData.length);
			resolve(fileData);
		});

	});
};

/**
 * Get all content types used on the pages
 * @param {*} pageData 
 */
var _getPageContentTypes = function (pageData) {
	var pageContentTypes = [];
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var componentInstances = pageData[i].data.componentInstances || {};
		Object.keys(componentInstances).forEach(key => {
			var data = componentInstances[key].data;

			if (data && data.contentTypes && data.contentTypes.length > 0) {
				for (var j = 0; j < data.contentTypes.length; j++) {
					if (!pageContentTypes.includes(data.contentTypes[j])) {
						pageContentTypes.push(data.contentTypes[j]);
					}
				}
			}
		});
	}
	return pageContentTypes;
};

/**
 * Get content types for the detail page
 * @param {*} pageData 
 */
var _getDetailPageContentTypes = function (pageData) {

	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var detailPageIdx = undefined;
		for (var j = 0; j < _detailPages.length; j++) {
			if (pageId === _detailPages[j].page.id.toString()) {
				detailPageIdx = j;
				break;
			}
		}

		if (detailPageIdx >= 0) {
			var pageContentTypes = [];
			var componentInstances = pageData[i].data.componentInstances || {};
			Object.keys(componentInstances).forEach(key => {
				var type = componentInstances[key].type;
				var data = componentInstances[key].data;
				if (data && (data.contentPlaceholder || type === 'scs-contentlist') && data.contentTypes && data.contentTypes.length > 0) {
					for (var j = 0; j < data.contentTypes.length; j++) {
						if (!pageContentTypes.includes(data.contentTypes[j])) {
							pageContentTypes.push(data.contentTypes[j]);
						}
					}
				}
			});
			_detailPages[detailPageIdx]['contentTypes'] = pageContentTypes;
		}
	}
};


/**
 * Get the id of all content item on the pages
 * @param {*} pageData 
 */
var _getPageContentItemIds = function (pageData) {
	var pageContentIds = [];
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var componentInstances = pageData[i].data.componentInstances || {};

		// find out all detail page used
		var detailPages = [];
		Object.keys(componentInstances).forEach(key => {
			var data = componentInstances[key].data;
			if (data && data.contentIds && data.contentIds.length > 0) {
				if (data.detailPageId && !detailPages.includes(data.detailPageId)) {
					detailPages.push(data.detailPageId);
				}
			}
		});

		var itemIds = [];
		// all items without specific detail page
		Object.keys(componentInstances).forEach(key => {
			var data = componentInstances[key].data;
			if (data && !data.detailPageId && data.contentIds && data.contentIds.length > 0) {
				itemIds = itemIds.concat(data.contentIds);
			}
		});
		if (itemIds.length > 0) {
			pageContentIds.push({
				id: pageId,
				detailPageId: '',
				contentIds: itemIds
			});
		}

		for (var j = 0; j < detailPages.length; j++) {
			var itemIds = [];
			// all items with a specific detail page
			Object.keys(componentInstances).forEach(key => {
				var data = componentInstances[key].data;
				if (data && data.detailPageId && data.detailPageId === detailPages[j] && data.contentIds && data.contentIds.length > 0) {
					itemIds = itemIds.concat(data.contentIds);
				}
			});
			if (itemIds.length > 0) {
				pageContentIds.push({
					id: pageId,
					detailPageId: detailPages[j],
					contentIds: itemIds
				});
			}
		}
	}

	return pageContentIds;
};

var _getSiteChannelToken = function (siteInfo) {
	var tokens = siteInfo.channelAccessTokens || [];
	var token;
	for (var i = 0; i < tokens.length; i++) {
		if (tokens[i].name === 'defaultToken') {
			token = tokens[i].value;
			break;
		}
	}
	if (!token && tokens.length > 0) {
		token = tokens[0].value;
	}
	return token;
};


var _getContentListQueryString = function (type, limit, offset, orderBy, locale) {
	var str = 'fields=ALL';
	var q = '';
	if (orderBy) {
		if (orderBy.indexOf('updateddate') >= 0) {
			orderBy = serverUtils.replaceAll(orderBy, 'updateddate', 'updatedDate');
		}
		str = str + '&orderBy=' + orderBy;
	}
	if (limit) {
		str = str + '&limit=' + limit;
	}
	if (offset) {
		str = str + '&offset=' + offset;
	}
	if (type) {
		if (locale) {
			q = 'type eq "' + type + '" and (language eq "' + locale + '" or translatable eq "false")';
		} else {
			q = 'type eq "' + type + '"';
		}
	}
	if (q) {
		str = str + '&q=(' + q + ')';
	}
	return str;
};

/**
 * set the query string for all content list items on the page
 * @param {*} pageData 
 */
var _getPageContentListQuery = function (pageData, locale) {
	var pageContentListQueries = [];
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var componentInstances = pageData[i].data.componentInstances || {};

		Object.keys(componentInstances).forEach(key => {
			var compType = componentInstances[key].type;
			var data = componentInstances[key].data;
			if (data && compType === 'scs-contentlist') {
				var type = data.contentTypes && data.contentTypes[0];
				var offset = data.firstItem;
				var limit = data.maxResults;
				var orderBy = data.sortOrder;
				var str = _getContentListQueryString(type, limit, offset, orderBy, locale);
				pageContentListQueries.push({
					pageId: pageId,
					type: type,
					queryString: str,
					detailPageId: data.detailPageId
				});
			}
		});
	}
	return pageContentListQueries;
};

var _getPageContent = function (server, channelToken, locale, q, pageId, detailPageId, queryType) {
	var pageContentPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/published/api/v1.1/items';
		if (queryType === 'item') {
			url = url + '?q=' + q + '&channelToken=' + channelToken;
		} else {
			// content list query
			url = url + '?' + q + '&channelToken=' + channelToken;
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to get content: url: ' + url.replace(server.url, ''));
				console.error(err);
				return resolve({});
			}
			if (!response || response.statusCode !== 200) {
				return resolve({});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.error('ERROR: Failed to get content: url: ' + url.replace(server.url, ''));
					return resolve({});
				}
				// handle both 1 item or multiple items
				resolve({
					locale: locale,
					pageId: pageId,
					detailPageId: detailPageId,
					data: data.items ? data.items : [data]
				});
			} catch (error) {
				console.error('ERROR: Failed to get page data');
				return resolve({});
			}
		});
	});
	return pageContentPromise;

};

var _getPageContentPromise = function (server, channelToken, pageContentIds, pageContentListQueries, locale) {
	var promises = [];
	var limit = 30;
	var num = 0;

	// Content items queries
	for (var i = 0; i < pageContentIds.length; i++) {
		var pageId = pageContentIds[i].id;
		var detailPageId = pageContentIds[i].detailPageId;
		q = '';
		for (var j = 0; j < pageContentIds[i].contentIds.length; j++) {
			if (q) {
				q += ' or ';
			}
			q += 'id eq "' + pageContentIds[i].contentIds[j] + '"';

			num += 1;
			if (num >= limit && (num % limit === 0)) {
				if (locale) {
					q = '((' + q + ') and (language eq "' + locale + '"))';
				} else {
					q = '(' + q + ')';
				}

				promises.push(_getPageContent(server, channelToken, locale, q, pageId, detailPageId, 'item'));

				// another batch
				q = '';
			}
		}

		if (q) {
			if (locale) {
				q = '((' + q + ') and (language eq "' + locale + '"))';
			} else {
				q = '(' + q + ')';
			}
			promises.push(_getPageContent(server, channelToken, locale, q, pageId, detailPageId, 'item'));
		}
	}

	// Content list queries
	for (var i = 0; i < pageContentListQueries.length; i++) {
		promises.push(_getPageContent(server, channelToken, locale,
			pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, pageContentListQueries[i].detailPageId, 'list'));
	}

	return promises;
};

var _getTypeItems = function (server, channelToken, locale) {
	return new Promise(function (resolve, reject) {
		var items = [];
		var doQuery = _typesToQuery.reduce(function (typePromise, typeName) {
			return typePromise.then(function (result) {
				var q = 'type eq "' + typeName + '"';
				if (locale) {
					q = '((' + q + ') and (language eq "' + locale + '"))';
				}
				return serverRest.queryItems({
					useDelivery: true,
					server: server,
					q: q,
					channelToken: channelToken,
					showTotal: false
				})
					.then(function (result) {
						if (result && result.data && result.data.length > 0) {
							console.info(' - total items of type ' + typeName + ' (' + locale + '): ' + result.data.length);
							items.push({
								type: typeName,
								locale: locale,
								items: result.data
							});
						}
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQuery.then(function (result) {
			resolve(items);
		});

	});
};

var _getLastmod = function (isodate) {
	var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
	var lastModifiedDate = new Date(isodate);
	var year = lastModifiedDate.getFullYear(),
		month = months[lastModifiedDate.getMonth()],
		day = lastModifiedDate.getDate();
	var lastmod = year + '-' + month + '-' + (day < 10 ? ('0' + day) : day);
	return lastmod;
};

var _getPage = function (pageid) {
	var pages = _masterSiteStructure && _masterSiteStructure.pages || [];
	var page;
	for (var i = 0; i < pages.length; i++) {
		if (pages[i].id && pages[i].id.toString() === pageid) {
			page = pages[i];
			break;
		}
	}
	return page;
};

/**
 * 
 * @param {*} pageid <locale>_<page id>
 */
var _getMasterPageData = function (pageid) {
	var id = pageid.toString();
	if (id.indexOf('_') > 0) {
		id = id.substring(id.lastIndexOf('_') + 1);
	}
	var pagedata;
	for (var i = 0; i < _masterPageData.length; i++) {
		if (id === _masterPageData[i].id) {
			pagedata = _masterPageData[i].data;
		}
	}
	return pagedata;
};

/**
 * Generate site map XML file
 * 
 * @param {*} siteInfo 
 * @param {*} pages 
 */
var _generateSiteMapXML = function (server, siteUrl, pages, pageFiles, items, typeItems, changefreq, toppagepriority,
	siteMapFile, newlink, noDefaultDetailPageLink) {

	var prefix = siteUrl;
	if (prefix.substring(prefix.length - 1) === '/') {
		prefix = prefix.substring(0, prefix.length - 1);
	}

	var detailPageUrl;
	var urls = [];
	var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
	//
	// page urls
	//
	var pagePriority = [];

	for (var i = 0; i < pages.length; i++) {
		var pageId = pages[i].id;
		var masterPageData = _getMasterPageData(pageId);
		var properties = masterPageData && masterPageData.properties;
		var noIndex = properties && properties.noIndex;
		var isExternalLink = pages[i].linkUrl && pages[i].linkUrl.indexOf(server.url) < 0;
		if (!pages[i].isDetailPage && !noIndex && !isExternalLink) {

			var includeLocale = pages[i].locale && pages[i].locale !== _SiteInfo.defaultLanguage;

			// find out last modified date
			// var fileName = (includeLocale ? (pages[i].locale + '_') : '') + pages[i].id.toString() + '.json';
			var fileName = pages[i].id.toString() + '.json';

			var lastmod;
			var pageChangefreq = changefreq === 'auto' ? 'monthly' : changefreq;
			var found = false;
			for (var j = 0; j < pageFiles.length; j++) {
				if (fileName === pageFiles[j].name) {
					lastmod = _getLastmod(pageFiles[j].lastModifiedDate);
					pageChangefreq = pageFiles[j].changefreq || pageChangefreq;
					found = true;
					break;
				}
			}
			if (!found) {
				console.info('*** page ' + fileName);
			}
			// calculate priority
			var priority;
			if (!pages[i].parentId) {
				// root always is 1
				priority = 1;
			} else {
				priority = toppagepriority || 1;
				var levels = pages[i].pageUrl.split('/');
				for (var j = 1; j < levels.length; j++) {
					priority = priority / 2;
				}
			}

			// console.log('page: ' + pages[i].id + ' parent: ' + pages[i].parentId + ' url: ' + pages[i].pageUrl + ' priority: ' + priority + ' lastmod: ' + lastmod);
			var loc = pages[i].linkUrl || (prefix + '/' + (includeLocale ? (pages[i].locale + '/') : '') + pages[i].pageUrl);
			urls.push({
				loc: loc,
				lastmod: lastmod,
				priority: priority,
				changefreq: pageChangefreq
			});

			pagePriority.push({
				id: pages[i].id.toString(),
				priority: priority,
				changefreq: pageChangefreq
			});

		}
	}

	var totalPageUrls = urls.length;

	//
	// detail page urls for items
	//
	// console.log(_detailPages);
	var addedUrls = [];
	if (_hasDetailPage) {
		for (var i = 0; i < items.length; i++) {
			if (!noDefaultDetailPageLink || items[i].detailPageId) {
				// get page's priority
				var pageId = items[i].pageId;
				var itemPriority;
				var itemChangefreq;
				for (var j = 0; j < pagePriority.length; j++) {
					if (pageId === pagePriority[j].id) {
						itemPriority = pagePriority[j].priority;
						itemChangefreq = pagePriority[j].changefreq;
						break;
					}
				}

				var detailPage = _getPage(items[i].detailPageId) || _defaultDetailPage;
				var detailPageUrl = detailPage.pageUrl;

				var pageItems = items[i].data || [];
				for (var j = 0; j < pageItems.length; j++) {
					var item = pageItems[j];
					if (item && item.id) {

						// verify if the detail page allows the content type
						var detailPageAllowed = false;
						for (var k = 0; k < _detailPages.length; k++) {
							if (_detailPages[k].page.id.toString() === detailPage.id.toString() &&
								(_detailPages[k].contentTypes.length === 0 || _detailPages[k].contentTypes.includes(item.type))) {
								detailPageAllowed = true;
								break;
							}
						}

						if (detailPageAllowed && detailPageUrl) {
							var detailPagePrefix = detailPageUrl.replace('.html', '');
							var itemlanguage = item.language || items[i].locale;
							var locale = itemlanguage && itemlanguage !== _SiteInfo.defaultLanguage ? (itemlanguage + '/') : '';
							// trailing / is required
							var url;
							if (newlink) {
								url = prefix + '/' + locale + detailPagePrefix + '/' + item.slug;
							} else {
								url = prefix + '/' + locale + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
							}
							// console.log(item);
							var lastmod = _getLastmod(item.updatedDate.value);

							// no duplicate url
							if (!addedUrls.includes(url)) {
								// console.log('item: ' + item.name + ' page: ' + pageId + ' priority: ' + itemPriority + ' lastmod: ' + lastmod);
								urls.push({
									loc: url,
									lastmod: lastmod,
									priority: itemPriority,
									changefreq: itemChangefreq
								});

								addedUrls.push(url);
							}
						} // has detail for the item
					}
				} // all items on the page
			}
		} // all items

		// items from type query
		typeItems.forEach(function (typeItem) {
			// find the detail page for this type
			var detailPageUrl;
			for (var i = 0; i < _detailPages.length; i++) {
				if (_detailPages[i].contentTypes && _detailPages[i].contentTypes.includes(typeItem.type)) {
					detailPageUrl = _detailPages[i].page && _detailPages[i].page.pageUrl;
					break;
				}
			}

			if (detailPageUrl) {
				for (var i = 0; i < typeItem.items.length; i++) {
					var item = typeItem.items[i];
					var detailPagePrefix = detailPageUrl.replace('.html', '');
					var itemlanguage = typeItem.locale;
					var locale = itemlanguage && itemlanguage !== _SiteInfo.defaultLanguage ? (itemlanguage + '/') : '';
					// trailing / is required
					var url;
					if (newlink) {
						url = prefix + '/' + locale + detailPagePrefix + '/' + item.slug;
					} else {
						url = prefix + '/' + locale + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
					}
					// console.log(item);
					var lastmod = _getLastmod(item.updatedDate.value);

					// no duplicate url
					if (!addedUrls.includes(url)) {
						// console.log('item: ' + item.name + ' page: ' + pageId + ' priority: ' + itemPriority + ' lastmod: ' + lastmod);
						urls.push({
							loc: url,
							lastmod: lastmod,
							priority: itemPriority,
							changefreq: itemChangefreq
						});

						addedUrls.push(url);
					}
				}
			}
		});

	} // has detail page

	console.info(' - total page URLs: ' + totalPageUrls + '  total asset URLs: ' + addedUrls.length);

	var buf = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + os.EOL;

	var ident = '    ',
		ident2 = ident + ident,
		ident3 = ident2 + ident;
	for (var i = 0; i < urls.length; i++) {
		buf = buf + ident + '<url>' + os.EOL;
		buf = buf + ident2 + '<loc>' + urls[i].loc + '</loc>' + os.EOL;
		buf = buf + ident2 + '<lastmod>' + urls[i].lastmod + '</lastmod>' + os.EOL;
		buf = buf + ident2 + '<changefreq>' + urls[i].changefreq + '</changefreq>' + os.EOL;
		buf = buf + ident2 + '<priority>' + urls[i].priority + '</priority>' + os.EOL;
		buf = buf + ident + '</url>' + os.EOL;
	}

	buf = buf + '</urlset>' + os.EOL;

	// save to file
	fs.writeFileSync(siteMapFile, buf);
	console.log(' - generate file ' + siteMapFile);
};


var _getSitePageFiles = function (server) {
	return new Promise(function (resolve, reject) {
		serverRest.getChildItems({
			server: server,
			parentID: _pagesFolderId,
			limit: 9999
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				var items = result && result.items || [];
				var files = [];
				for (var i = 0; i < items.length; i++) {
					files.push({
						id: items[i].id,
						name: items[i].name,
						lastModifiedDate: items[i].modifiedTime
					});
				}
				// console.log(files);
				return resolve({
					'files': files
				});
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
};


var _uploadSiteMapToServer = function (server, localFilePath) {
	var uploadPromise = new Promise(function (resolve, reject) {
		var fileName = localFilePath;
		if (fileName.indexOf('/') >= 0) {
			fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
		}
		serverRest.findFolderHierarchy({
			server: server,
			parentID: _siteId,
			folderPath: 'settings/seo'
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				var seoFolderId = result.id;

				return serverRest.createFile({
					server: server,
					parentID: seoFolderId,
					filename: fileName,
					contents: fs.createReadStream(localFilePath)
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				console.info(' - file ' + fileName + ' uploaded to server, version ' + result.version);
				return resolve(result);
			})
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});
	});
	return uploadPromise;
};

var _prepareData = function (server, site, languages, allTypes, wantedTypes, done) {
	var dataPromise = new Promise(function (resolve, reject) {

		var siteInfo, defaultLanguage, siteChannelToken, siteRepositoryId;
		var siteStructure, pages, pageData = [];

		//
		// Get site id
		//
		sitesRest.getSite({
			server: server,
			name: site
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: site ' + site + ' does not exist');
					return Promise.reject();
				}
				_siteId = result.id;

				//
				// Get pages folder id
				//
				return serverRest.findFolderHierarchy({
					server: server,
					parentID: _siteId,
					folderPath: 'pages'
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				_pagesFolderId = result.id;

				//
				// Get site info
				//
				var siteInfoPromise = _getSiteInfoFile(server);
				return siteInfoPromise;
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				siteInfo = result.data.properties;
				_SiteInfo = siteInfo;
				defaultLanguage = siteInfo.defaultLanguage;
				siteRepositoryId = siteInfo.repositoryId;
				siteChannelId = siteInfo.channelId;
				_siteChannelToken = _getSiteChannelToken(siteInfo);
				console.info(' - site: ' + site + ', default language: ' + defaultLanguage + ', channel: ' + siteInfo.channelId);

				//
				// get channel
				//
				var channelPromises = [];
				if (siteInfo.channelId) {
					channelPromises.push(serverRest.getChannel({
						server: server,
						id: siteInfo.channelId
					}));
				}
				return Promise.all(channelPromises);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				console.info(' - query site channel');
				var policyId = result && result.length > 0 ? result[0].localizationPolicy : undefined;
				//
				// Get Localization policy
				//
				var policyPromise = [];
				if (policyId) {
					policyPromise.push(serverRest.getLocalizationPolicy({
						server: server,
						id: policyId
					}));
				}
				return Promise.all(policyPromise);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var policy = result && result[0] || {};
				if (policy && policy.id) {
					console.info(' - site localization policy: ' + policy.name);
				}
				_requiredLangs = policy.requiredValues || [];
				_optionalLangs = policy.optionalValues || [];

				var locales = [];

				for (var i = 0; i < _requiredLangs.length; i++) {
					if (_requiredLangs[i] !== _SiteInfo.defaultLanguage) {
						locales.push(_requiredLangs[i]);
					}
				}
				for (var i = 0; i < _optionalLangs.length; i++) {
					if (_optionalLangs[i] !== _SiteInfo.defaultLanguage) {
						locales.push(_optionalLangs[i]);
					}
				}
				// console.log(locales);

				//
				// verify the site has the translation
				//
				var siteinfoPromises = [];
				for (var i = 0; i < locales.length; i++) {
					siteinfoPromises[i] = _getSiteInfoFile(server, locales[i], false);
				}

				return Promise.all(siteinfoPromises);
			})
			.then(function (values) {
				_validLocales = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i].locale) {
						_validLocales.push(values[i].locale);
					}
				}
				// console.log('valid site languages: ' + _validLocales + ' param languages: ' + languages);

				//
				// validate languages parameter
				//
				for (var i = 0; i < languages.length; i++) {
					if (languages[i] !== _SiteInfo.defaultLanguage && !_validLocales.includes(languages[i])) {
						console.error('ERROR: site does not have translation for ' + languages[i]);
						return Promise.reject();
					}
				}
				if (languages.length > 0) {
					// use this param
					_languages = languages;
				} else {
					_languages = _validLocales;
				}
				if (_languages.length > 0) {
					console.info(' - site translation: ' + _languages);
				}

				return serverRest.getRepository({
					server: server,
					id: siteRepositoryId
				});

			})
			.then(function (result) {
				//
				// Get repository 
				// 
				if (result.err) {
					return Promise.reject();
				}
				repository = result;
				console.info(' - query site repository');

				return _getSiteStructure(server);
			})
			.then(function (result) {
				// 
				// Get site structure
				//
				if (result.err) {
					return Promise.reject();
				}
				siteStructure = result;
				_masterSiteStructure = siteStructure;
				console.info(' - query site structure');
				pages = siteStructure && siteStructure.pages;
				if (!pages || pages.length === 0) {
					console.error('ERROR: no page found');
					return Promise.reject();
				}
				// find the detail pages
				_hasDetailPage = false;
				for (var i = 0; i < pages.length; i++) {
					if (pages[i].isDetailPage) {
						_hasDetailPage = true;
						_detailPages.push({
							page: pages[i]
						});
					}
				}
				if (_hasDetailPage) {
					var detailpageid = _getDefaultDetailPageId();
					_defaultDetailPage = _getPage(detailpageid);
					console.info(' - default detail page: ' + _defaultDetailPage.name);
				}

				return _getPageData(server, '', true);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - query page data');
				var pages = result;
				for (var i = 0; i < pages.length; i++) {
					pageData.push({
						id: pages[i].id,
						data: pages[i].data
					});
				}
				_masterPageData = pageData;

				//
				// Get all content types on the pages
				//
				var contentTypes = _getPageContentTypes(pageData);
				var contentTypeNames = [];
				var contentTypesPromise = [];
				if (contentTypes.length > 0) {
					for (var i = 0; i < contentTypes.length; i++) {
						contentTypeNames.push(contentTypes[i]);
						contentTypesPromise.push(serverRest.getContentType({
							server: server,
							name: contentTypes[i]
						}));
					}
				}

				//
				// Get content types on the detail pages
				//
				_getDetailPageContentTypes(pageData);
				// console.log(_detailPages);

				if (contentTypeNames.length > 0) {
					console.info(' - content types used in the site: ' + contentTypeNames);
				}

				// Display detail pages
				_detailPages.forEach(function (dpage) {
					console.info(' - detail page: ' + dpage.page.name + ' content types: ' + dpage.contentTypes);
				});

				if (allTypes) {
					_detailPages.forEach(function (dpage) {
						for (var i = 0; i < dpage.contentTypes.length; i++) {
							if (!_typesToQuery.includes(dpage.contentTypes[i])) {
								_typesToQuery.push(dpage.contentTypes[i]);
							}
						}
					});
					console.info(' - content types to query items: ' + _typesToQuery);
				} else if (wantedTypes && wantedTypes.length > 0) {
					for (var i = 0; i < wantedTypes.length; i++) {
						var found = false;
						for (var j = 0; j < _detailPages.length; j++) {
							if (_detailPages[j].contentTypes.includes(wantedTypes[i])) {
								found = true;
								if (!_typesToQuery.includes(wantedTypes[i])) {
									_typesToQuery.push(wantedTypes[i]);
								}
								break;
							}
						}
						if (!found) {
							console.warn('WARNING: no site detail page found for type ' + wantedTypes[i]);
						}
					}
					console.info(' - content types to query items: ' + _typesToQuery);
				}


				if (contentTypesPromise.length > 0) {
					Promise.all(contentTypesPromise).then(function (values) {
						_contentTypesOnPages = values;
						// console.log(_contentTypesOnPages);

						//
						// Get content ids on the pages
						//
						_pageContentIds = _getPageContentItemIds(pageData);
						// console.log(_pageContentIds);

						return resolve({});

					});
				} else {
					return resolve({});
				}
			})
			.catch((error) => {
				_cmdEnd(done);
			});
	});
	return dataPromise;
};

var _getSiteDataWithLocale = function (server, site, locale, isMaster) {
	var sitePromise = new Promise(function (resolve, reject) {
		var pages = [];
		var items = [];
		var pageFiles = [];
		var pageData = [];

		var siteStructurePromise = _getSiteStructure(server, locale, isMaster);
		siteStructurePromise.then(function (result) {
			if (result.err) {
				return resolve(result);
			}
			console.info(' - query site structure ' + (locale ? ('(' + locale + ')') : ''));

			var siteStructure = result;
			pages = siteStructure && siteStructure.pages;

			var sitePageFilesPromise = _getSitePageFiles(server);
			sitePageFilesPromise.then(function (result) {
				pageFiles = result.files || [];
				if (!pageFiles || pageFiles.length === 0) {
					console.warn('WARNING: failed to get page files');
				}

				if (_hasDetailPage && _contentTypesOnPages.length > 0) {
					//
					// Get page data for all pages
					//
					var pageDataPromise = _getPageData(server, locale, isMaster);
					pageDataPromise.then(function (result) {
						console.info(' - query page data (' + locale + ')');
						var values = result || [];
						for (var i = 0; i < values.length; i++) {
							pageData.push({
								id: values[i].id,
								data: values[i].data
							});
						}

						//
						// Get content list queries on the pages
						//
						var pageContentListQueries = _getPageContentListQuery(_masterPageData, locale);
						// console.log(pageContentListQueries);

						//
						// Get content items on the pages
						//
						var pageContentPromise = _getPageContentPromise(server, _siteChannelToken, _pageContentIds, pageContentListQueries, locale);
						Promise.all(pageContentPromise).then(function (values) {
							console.info(' - query content on the pages (' + locale + ')');

							for (var i = 0; i < values.length; i++) {
								items = items.concat(values[i]);
							}
							// console.log(' - total items: ' + items.length);

							var typeContentPromises = _typesToQuery.length > 0 ? [_getTypeItems(server, _siteChannelToken, locale)] : [];
							Promise.all(typeContentPromises).then(function (results) {
								var typeItems = _typesToQuery.length > 0 ? results[0] : [];
								return resolve({
									locale: locale,
									pageFiles: pageFiles,
									pages: pages,
									items: items,
									typeItems: typeItems
								});
							});
						});
					});

				} else {
					if (isMaster) {
						if (!_hasDetailPage) {
							console.log(' - no detail page');
						} else if (_contentTypesOnPages.length === 0) {
							console.log(' - no content on the pages');
						}
					}
					// no detail page nor content
					return resolve({
						locale: locale,
						pageFiles: pageFiles,
						pages: pages,
						items: items
					});
				}
			}); // page files

		}); // site structure
	});
	return sitePromise;
};

var _getSiteData = function (server, site, locales) {
	return new Promise(function (resolve, reject) {
		var values = [];
		var doGet = locales.reduce(function (sitePromise, locale) {
			return sitePromise.then(function (result) {
				return _getSiteDataWithLocale(server, site, locale.language, locale.isMaster)
					.then(function (result) {
						values.push(result);
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doGet.then(function (result) {
			resolve(values);
		});
	});
};

/**
 * Main entry
 * 
 */
var _createSiteMap = function (server, serverName, site, siteUrl, changefreq,
	publish, siteMapFile, languages, toppagepriority, newlink, noDefaultDetailPageLink,
	allTypes, wantedTypes, done) {

	//
	// get site info and other metadata
	// 
	var masterPages = [];
	var allPages = [];
	var allPageFiles = [];
	var allItems = [];
	var allTypeItems = [];
	var dataPromise = _prepareData(server, site, languages, allTypes, wantedTypes, done);
	dataPromise.then(function (result) {
		if (result.err) {
			_cmdEnd(done);
			return;
		}

		var isMaster = true;

		var locales = [];
		locales.push({
			language: _SiteInfo.defaultLanguage,
			isMaster: true
		});

		for (var i = 0; i < _languages.length; i++) {
			if (_languages[i] !== _SiteInfo.defaultLanguage) {
				locales.push({
					language: _languages[i],
					isMaster: false
				});
			}
		}

		return _getSiteData(server, site, locales);

	})
		.then(function (values) {
			for (var i = 0; i < values.length; i++) {
				if (values[i].locale === _SiteInfo.defaultLanguage) {
					masterPages = values[i].pages;
					break;
				}
			}

			for (var i = 0; i < values.length; i++) {
				if (values[i].pages && values[i].pages.length > 0) {
					for (var j = 0; j < values[i].pages.length; j++) {
						values[i].pages[j]['locale'] = values[i].locale;
					}
					allPages = allPages.concat(values[i].pages);
				}
			}

			for (var i = 0; i < allPages.length; i++) {
				var page = allPages[i];
				if (!page.pageUrl) {
					for (var j = 0; j < masterPages.length; j++) {
						if (page.id === masterPages[j].id) {
							page.pageUrl = masterPages[j].pageUrl;
							page.isDetailPage = masterPages[j].isDetailPage;
							page.parentId = masterPages[j].parentId;
							page.linkUrl = masterPages[j].linkUrl;
							break;
						}
					}
				}
			}

			for (var i = 0; i < values.length; i++) {
				if (values[i].pageFiles && values[i].pageFiles.length > 0) {
					allPageFiles = allPageFiles.concat(values[i].pageFiles);
				}
				if (values[i].items && values[i].items.length > 0) {
					allItems = allItems.concat(values[i].items);
				}
				if (values[i].typeItems && values[i].typeItems.length > 0) {
					allTypeItems = allTypeItems.concat(values[i].typeItems);
				}
			}

			var changefreqPromises = changefreq === 'auto' ? [_calculatePageChangeFraq(server, serverName, allPageFiles)] : [];

			return Promise.all(changefreqPromises);
		})
		.then(function (results) {
			// console.log(allPageFiles);
			//
			// create site map
			//
			_generateSiteMapXML(server, siteUrl, allPages, allPageFiles, allItems, allTypeItems, changefreq, toppagepriority, siteMapFile, newlink, noDefaultDetailPageLink);

			if (publish) {
				// Upload site map to the server
				var uploadPromise = _uploadSiteMapToServer(server, siteMapFile);
				uploadPromise.then(function (result) {
					if (!result.err) {
						var siteMapUrl = siteUrl + '/' + siteMapFile.substring(siteMapFile.lastIndexOf('/') + 1);
						console.log(' - site map uploaded, publish the site and access it at ' + siteMapUrl);
					}
					_cmdEnd(done, true);
				});
			} else {
				_cmdEnd(done, true);
			}
		});
};


var _calculatePageChangeFraq = function (server, serverName, allPageFiles) {
	return new Promise(function (resolve, reject) {
		var total = allPageFiles.length;
		console.info(' - total number of pages: ' + total);
		var groups = [];
		var limit = 20;
		var start, end;
		for (var i = 0; i < total / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= total) {
				end = total - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < total - 1) {
			groups.push({
				start: end + 1,
				end: total - 1
			});
		}

		var todayDate = new Date();
		var oneDay = 24 * 60 * 60 * 1000;
		var count = [];
		var doQueryVersion = groups.reduce(function (versionPromise, param) {
			return versionPromise.then(function (result) {
				var versionPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					versionPromises.push(serverRest.getFileVersions({
						server: server,
						fFileGUID: allPageFiles[i].id
					}));
				}

				count.push('.');
				process.stdout.write(' - calculating page change frequency ' + count.join(''));
				readline.cursorTo(process.stdout, 0);

				return Promise.all(versionPromises).then(function (results) {
					var pages = results;

					for (var i = 0; i < pages.length; i++) {
						versions = pages[i];

						if (versions) {
							if (versions.length > 5) {
								// use the latest 5 versions
								var byVersion = versions.slice(0);
								byVersion.sort(function (a, b) {
									var x = a.version;
									var y = b.version;
									return (x < y ? 1 : x > y ? -1 : 0);
								});
								versions = byVersion;
							}

							var oldestVersionIdx = versions.length > 5 ? versions.length - 5 : 0;
							var versionNum = versions.length > 5 ? 5 : versions.length;
							var oldest = new Date(versions[oldestVersionIdx].modifiedTime);
							var diffDays = Math.round(Math.abs((todayDate.getTime() - oldest.getTime()) / oneDay));
							var changefreq = diffDays / versionNum;
							var roundDown = changefreq * 0.7;
							var calculatedChangefreq;
							if (roundDown < 0.05) {
								calculatedChangefreq = 'hourly';
							} else if (roundDown <= 1) {
								calculatedChangefreq = 'daily';
							} else if (roundDown <= 7) {
								calculatedChangefreq = 'weekly';
							} else if (roundDown <= 31) {
								calculatedChangefreq = 'monthly';
							} else if (roundDown <= 365) {
								calculatedChangefreq = 'yearly';
							} else {
								calculatedChangefreq = 'never';
							}

							/*
							console.log(' - page : ' + versions[0].name + ' versions: ' + versions.length +
								' oldest update: ' + versions[oldestVersionIdx].modifiedTime +
								' days: ' + diffDays + ' changefreq: ' + changefreq.toFixed(2) + ' roundDown: ' + roundDown.toFixed(2) + ' => ' + calculatedChangefreq);
							*/
							for (var j = 0; j < allPageFiles.length; j++) {
								if (allPageFiles[j].name === versions[0].name) {
									allPageFiles[j].changefreq = calculatedChangefreq;
									break;
								}
							}
						} else {
							console.info(' - ' + i + ' is empty');
						}
					}
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQueryVersion.then(function (result) {
			process.stdout.write(os.EOL);
			resolve(allPageFiles);
		});

	});
};

/////////////////////////////////////////////////////////////////////
//
// Tasks
//
////////////////////////////////////////////////////////////////////


module.exports.createSiteMap = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var site = argv.site;
	var siteUrl = argv.url;
	if (serverUtils.endsWith(siteUrl, '/')) {
		siteUrl = siteUrl.substring(0, siteUrl.length - 1);
	}

	if (!site && !siteUrl) {
		console.error('ERROR: please run as npm run create-site-map -- --site <site name> --url <site url>');
		done();
		return;
	}
	if (!site) {
		console.error('ERROR: please use --site to specify the site');
		done();
		return;
	}
	if (!siteUrl) {
		console.error('ERROR: please use --url to specify the site url');
		done();
		return;
	}

	var parsedUrl = url.parse(siteUrl);
	if (!parsedUrl.protocol) {
		console.error('ERROR: invalid site url, it must begin with the protocol');
		done();
		return;
	}

	// content types
	var allTypes = argv.assettypes === '__cecanytype';
	var wantedTypes = argv.assettypes && argv.assettypes !== '__cecanytype' ? argv.assettypes.split(',') : undefined;

	// changefreq
	var changefreq = argv.changefreq || 'monthly';

	// site map file
	var siteMapFile = argv.file || (site + 'SiteMap.xml');
	if (siteMapFile.split('.').pop() !== 'xml') {
		siteMapFile = siteMapFile + '.xml';
	}
	if (!path.isAbsolute(siteMapFile)) {
		siteMapFile = path.join(projectDir, siteMapFile);
		siteMapFile = path.resolve(siteMapFile);
	}

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

	var newlink = typeof argv.newlink === 'string' && argv.newlink.toLowerCase() === 'true';

	var noDefaultDetailPageLink = typeof argv.noDefaultDetailPageLink === 'string' && argv.noDefaultDetailPageLink.toLowerCase() === 'true';

	var languages = argv.languages ? argv.languages.split(',') : [];

	var toppagepriority = argv.toppagepriority;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_createSiteMap(server, serverName, site, siteUrl, changefreq,
			publish, siteMapFile, languages, toppagepriority, newlink, noDefaultDetailPageLink,
			allTypes, wantedTypes, done);

	}); // login
};