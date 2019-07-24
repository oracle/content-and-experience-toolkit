/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var path = require('path'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	url = require('url'),
	serverRest = require('../test/server/serverRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var projectDir,
	serversSrcDir;

/**
 * Global variable used by the node server
 */
/**
 * Global variable used by the node server
 */

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

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
}

var localServer;
var _cmdEnd = function (done) {
	done();
	if (localServer) {
		localServer.close();
	}
};

var _getSiteInfoFile = function (request, localhost, site, locale, isMaster) {
	var siteInfoFilePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_SITE_INFO_FILE&siteId=' + site + '&IsJson=1';
		if (locale && !isMaster) {
			url = url + '&locale=' + locale;
		}
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site info');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode !== 200) {
				if (isMaster) {
					console.log('ERROR: Failed to get site info');
					return resolve({
						'err': response.statusCode
					});
				} else {

				}
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get site info');
					return resolve({
						'err': 'error'
					});
				}
				if (data.LocalData && data.LocalData.StatusCode === '-32') {
					console.log('ERROR: site ' + site + ' does not exist');
					return resolve({
						'err': 'site does not exist'
					});
				}
				if (response && response.statusCode !== 200) {
					if (isMaster) {
						console.log('ERROR: Failed to get site info');
					}
					return resolve({
						'err': response.statusCode
					});
				}
				resolve({
					'locale': locale || 'master',
					'data': data
				});
			} catch (error) {
				console.log('ERROR: Failed to get site info');
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return siteInfoFilePromise;
};

var _getSiteStructure = function (request, localhost, site, locale, isMaster) {
	var siteStructurePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_STRUCTURE&siteId=' + site + '&IsJson=1';
		if (locale && !isMaster) {
			url = url + '&locale=' + locale;
		}
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site structure');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get site structure');
					return resolve({
						'err': 'error'
					});
				}
				// LocalData exists only when there is error
				if (data.LocalData && data.LocalData.StatusCode === '-32') {
					console.log('ERROR: site ' + site + ' does not exist');
					return resolve({
						'err': 'site does not exist'
					});
				}
				if (data.LocalData && data.LocalData.StatusCode !== '0') {
					console.log('ERROR: Failed to get site structure ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
					return resolve({
						err: 'err'
					});
				}

				resolve(data);
			} catch (error) {
				console.log('ERROR: Failed to get site structure');
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return siteStructurePromise;
};

var _getChannelInfo = function (request, localhost, channelId) {
	var channelPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/channels/' + channelId;
		url = url + '?includeAdditionalData=true&fields=all';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get channel with id ' + channelId);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: Failed to get channel with id ' + policyId);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return channelPromise;
};

var _getLocalizationPolicy = function (request, localhost, policyId) {
	var policyPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/policy/' + policyId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get policy with id ' + policyId);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: Failed to get policy with id ' + policyId);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return policyPromise;
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
	var pages = _masterSiteStructure.base && _masterSiteStructure.base.pages;
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
 * 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} site
 * @param {*} pagelist the comma separated list of page ids
 */
var _getPageData = function (request, localhost, site, pageIds) {
	var pageDataPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_PAGE_DATA&siteId=' + site + '&pageIds=' + pageIds + '&IsJson=1';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get page data');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get page data');
					return resolve({
						'err': 'error'
					});
				}
				resolve(data);
			} catch (error) {
				console.log('ERROR: Failed to get page data');
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return pageDataPromise;
};

/**
 * Get an array of promises to get the page data for all site pages
 * 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} pages the data from SCS_GET_STRUCTURE
 */
var _getPageDataPromise = function (request, localhost, site, pages, locale, isMaster) {

	var pageIdList = [];
	var limit = 20;
	var pageIds = '';
	for (var i = 0; i < pages.length; i++) {
		if (pageIds) {
			pageIds += ',';
		}
		pageIds += (locale && !isMaster ? locale + '_' + pages[i].id.toString() : pages[i].id.toString());
		if (i >= limit && (i % limit === 0)) {
			// another batch
			pageIdList.push(pageIds);
			pageIds = '';
		}
	}
	if (pageIds) {
		pageIdList.push(pageIds);
	}
	// console.log(pageIdList);
	var promises = [];
	for (var i = 0; i < pageIdList.length; i++) {
		promises.push(_getPageData(request, localhost, site, pageIdList[i]));
	}
	return promises;
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
				var data = componentInstances[key].data;
				if (data && data.contentPlaceholder && data.contentTypes && data.contentTypes.length > 0) {
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

var _getRepository = function (request, localhost, repositoryId) {
	var repositoryPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/repositories/' + repositoryId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get repository with id ' + repositoryId);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: Failed to get repository with id ' + repositoryId);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return repositoryPromise;
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

var _getPageContent = function (request, localhost, channelToken, locale, q, pageId, detailPageId, queryType) {
	var pageContentPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/published/api/v1.1/items';
		if (queryType === 'item') {
			url = url + '?q=' + q + '&channelToken=' + channelToken;
		} else {
			// content list query
			url = url + '?' + q + '&channelToken=' + channelToken;
		}
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get content: url: ' + url.replace(localhost, ''));
				console.log(err);
				return resolve({});
			}
			if (!response || response.statusCode !== 200) {
				// console.log('ERROR: Failed to get content: status: ' + (response ? response.statusCode : '') + ' url: ' + url.replace(localhost, ''));
				return resolve({});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get content: url: ' + url.replace(localhost, ''));
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
				console.log('ERROR: Failed to get page data');
				return resolve({});
			}
		});
	});
	return pageContentPromise;

};

var _getPageContentPromise = function (request, localhost, server, channelToken, pageContentIds, pageContentListQueries, locale) {
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

				promises.push(_getPageContent(request, localhost, channelToken, locale, q, pageId, detailPageId, 'item'));

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
			promises.push(_getPageContent(request, localhost, channelToken, locale, q, pageId, detailPageId, 'item'));
		}
	}

	// Content list queries
	for (var i = 0; i < pageContentListQueries.length; i++) {
		promises.push(_getPageContent(request, localhost, channelToken, locale,
			pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, pageContentListQueries[i].detailPageId, 'list'));
	}

	return promises;
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
	var pages = _masterSiteStructure.base && _masterSiteStructure.base.pages || [];
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
var _generateSiteMapXML = function (siteUrl, pages, pageFiles, items, changefreq, toppagepriority, siteMapFile) {

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
		if (!pages[i].isDetailPage && !noIndex) {

			var includeLocale = pages[i].locale && pages[i].locale !== _SiteInfo.defaultLanguage;

			// find out last modified date
			var fileName = (includeLocale ? (pages[i].locale + '_') : '') + pages[i].id.toString() + '.json';
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
				console.log('*** page ' + fileName);
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
			urls.push({
				loc: prefix + '/' + (includeLocale ? (pages[i].locale + '/') : '') + pages[i].pageUrl,
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

	//
	// detail page urls for items
	//
	if (_hasDetailPage) {
		var addedUrls = [];
		for (var i = 0; i < items.length; i++) {

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

			var detailPageUrl;
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
						var url = prefix + '/' + locale + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
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
		} // all items
	} // has detail page


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

var _getSiteFolder = function (request, localhost, site) {
	var folderPromise = new Promise(function (resolve, reject) {
		//
		// get folder id of the site
		//
		var url = localhost + '/documents/web?IdcService=SCS_BROWSE_SITES';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site folder');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get site folder ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
			var fFolderGUIDIdx = undefined,
				fFolderNameIdx = undefined;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].name === 'fFolderGUID') {
					fFolderGUIDIdx = i;
				} else if (fields[i].name === 'fFolderName') {
					fFolderNameIdx = i;
				}
			}

			var sites = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
			var siteFolderId;
			if (fFolderGUIDIdx !== undefined && fFolderNameIdx !== undefined && sites && sites.length > 0) {
				for (var i = 0; i < sites.length; i++) {
					// site name is case insensitive
					if (sites[i][fFolderNameIdx].toLowerCase() === site.toLowerCase()) {
						siteFolderId = sites[i][fFolderGUIDIdx];
					}
				}
			}
			if (!siteFolderId) {
				console.log('ERROR: site folder not found');
			}
			return resolve({
				'siteFolderId': siteFolderId
			});
		});
	});
	return folderPromise;
};

/**
 * Use API FLD_BROWSE to get child folders
 */
function _getChildFolder(request, localhost, folderId, folderName) {
	var foldersPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=Folder&item=fFolderGUID:' + folderId;

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query folder ' + folderName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query folder ' + folderName);
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.fields || [];
			var fFolderGUIDIdx = undefined,
				fFolderNameIdx = undefined;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].name === 'fFolderGUID') {
					fFolderGUIDIdx = i;
				} else if (fields[i].name === 'fFolderName') {
					fFolderNameIdx = i;
				}
			}

			var childFolders = data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
			var childFolderId;
			if (fFolderGUIDIdx !== undefined && fFolderNameIdx !== undefined && childFolders && childFolders.length > 0) {
				for (var i = 0; i < childFolders.length; i++) {
					if (childFolders[i][fFolderNameIdx] === folderName) {
						childFolderId = childFolders[i][fFolderGUIDIdx];
					}
				}
			}
			if (!childFolderId) {
				console.log('ERROR: folder ' + folderName + ' not found');
			}
			return resolve({
				'folderId': childFolderId
			});
		});
	});
	return foldersPromise;
}

/**
 * Use API FLD_BROWSE to get child file
 */
function _getChildFile(request, localhost, folderId, fileName) {
	var filesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&item=fFolderGUID:' + folderId;

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query file ' + fileName);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query file ' + fileName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var idcToken = data.LocalData.idcToken;

			var fields = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.fields || [];
			var fFileGUIDIdx = undefined,
				fFileNameIdx = undefined;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].name === 'fFileGUID') {
					fFileGUIDIdx = i;
				} else if (fields[i].name === 'fFileName') {
					fFileNameIdx = i;
				}
			}

			var childFiles = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.rows;
			var childFileId;
			if (fFileGUIDIdx !== undefined && fFileNameIdx !== undefined && childFiles && childFiles.length > 0) {
				for (var i = 0; i < childFiles.length; i++) {
					if (childFiles[i][fFileNameIdx] === fileName) {
						childFileId = childFiles[i][fFileGUIDIdx];
					}
				}
			}

			return resolve({
				'idcToken': idcToken,
				'fileId': childFileId
			});
		});
	});
	return filesPromise;
}

/**
 * Use API FLD_BROWSE to get child file
 */
function _getChildFiles(request, localhost, folderId) {
	var filesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&item=fFolderGUID:' + folderId + '&fileCount=99999';

		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query files');
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query files' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.fields || [];
			var fFileGUIDIdx = undefined,
				fFileNameIdx = undefined,
				fLastModifiedDateIdx = undefined;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].name === 'fFileGUID') {
					fFileGUIDIdx = i;
				} else if (fields[i].name === 'fFileName') {
					fFileNameIdx = i;
				} else if (fields[i].name === 'fLastModifiedDate') {
					fLastModifiedDateIdx = i;
				}
			}
			// console.log(fFileGUIDIdx + ', ' + fFileNameIdx + ', ' + fLastModifiedDateIdx);

			var childFiles = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.rows;
			var files = [];
			if (fFileGUIDIdx !== undefined && fFileNameIdx !== undefined && fLastModifiedDateIdx !== undefined &&
				childFiles && childFiles.length > 0) {
				for (var i = 0; i < childFiles.length; i++) {
					files.push({
						id: childFiles[i][fFileGUIDIdx],
						name: childFiles[i][fFileNameIdx],
						lastModifiedDate: childFiles[i][fLastModifiedDateIdx]
					});
				}
			}

			return resolve({
				'files': files
			});
		});
	});
	return filesPromise;
}

var _getSitePageFiles = function (request, localhost, site, locale, isMaster) {
	var pagesPromise = new Promise(function (resolve, reject) {
		var siteFolderPromise = _getSiteFolder(request, localhost, site);
		siteFolderPromise.then(function (result) {
			var siteFolderId = result.siteFolderId;
			if (siteFolderId) {
				// console.log(' - site folder id: ' + siteFolderId);
				//
				// get sub folder pages
				//
				var pagesFolderPromise = _getChildFolder(request, localhost, siteFolderId, 'pages');
				pagesFolderPromise.then(function (result) {
					var pagesFolderId = result.folderId;
					// console.log(' - folder pages id: ' + pagesFolderId);
					if (pagesFolderId) {
						var pageFilesPromise = _getChildFiles(request, localhost, pagesFolderId);
						pageFilesPromise.then(function (result) {
							return resolve(result);
						});
					} else {
						return resolve({
							'files': []
						});
					}
				});
			} else {
				return resolve({
					'files': []
				});
			}
		});
	});
	return pagesPromise;
};

var _checkinFile = function (request, localhost, idcToken, folderName, folderId, filePath, fileName, fileId) {
	var checkinPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
		url += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName + '&idcToken=' + idcToken;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to upload file ' + fileName);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to upload file ' + fileName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var version = data.LocalData.dRevLabel;
			console.log(' - file ' + fileName + ' uploaded to server, version ' + version);
			return resolve(data);
		});
	});
	return checkinPromise;
};


var _uploadSiteMapToServer = function (request, localhost, site, localFilePath) {
	var uploadPromise = new Promise(function (resolve, reject) {
		var siteFolderPromise = _getSiteFolder(request, localhost, site);
		siteFolderPromise.then(function (result) {
			var siteFolderId = result.siteFolderId;
			if (siteFolderId) {
				//
				// get sub folder settings
				//
				// console.log(' - site folder id: ' + siteFolderId);
				var settingsFolderPromise = _getChildFolder(request, localhost, siteFolderId, 'settings');
				settingsFolderPromise.then(function (result) {
					var settingsFolderId = result.folderId;
					if (settingsFolderId) {
						// console.log(' - folder settings id: ' + settingsFolderId);
						//
						// get sub folder seo
						//
						var seoFolderPromise = _getChildFolder(request, localhost, settingsFolderId, 'seo');
						seoFolderPromise.then(function (result) {
							var seoFolderId = result.folderId;
							if (seoFolderId) {
								// console.log(' - folder seo id: ' + settingsFolderId);
								//
								// get the site map on the server if it exists
								//
								var fileName = localFilePath;
								if (fileName.indexOf('/') >= 0) {
									fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
								}
								var filePromise = _getChildFile(request, localhost, seoFolderId, fileName);
								filePromise.then(function (result) {
									var fileId = result.fileId;
									// console.log(' - file: ' + fileName + ' Id: ' + fileId);

									//
									// upload file to server
									//
									var checkinFilePromise = _checkinFile(request, localhost, result.idcToken,
										'seo', seoFolderId, localFilePath, fileName, fileId);
									checkinFilePromise.then(function (result) {
										return resolve(result);

									}); // checkin

								}); // get file from seo

							} else {
								return resolve({
									err: 'err'
								});
							}
						}) // seo
					} else {
						return resolve({
							err: 'err'
						});
					}
				}); // settings 
			} else {
				return resolve(result);
			}
		}); // site folder
	});
	return uploadPromise;
};

var _prepareData = function (server, request, localhost, site, languages, done) {
	var dataPromise = new Promise(function (resolve, reject) {

		var siteInfo, defaultLanguage, siteChannelToken, siteRepositoryId;
		var siteStructure, pages, pageData = [];

		//
		// Get site info
		//
		var siteInfoPromise = _getSiteInfoFile(request, localhost, site);
		siteInfoPromise
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				siteInfo = result.data.base.properties;
				_SiteInfo = siteInfo;
				defaultLanguage = siteInfo.defaultLanguage;
				siteRepositoryId = siteInfo.repositoryId;
				siteChannelId = siteInfo.channelId;
				_siteChannelToken = _getSiteChannelToken(siteInfo);
				console.log(' - site: ' + site + ', default language: ' + defaultLanguage + ', channel: ' + siteInfo.channelId);

				//
				// get channel
				//
				var channelPromises = [];
				if (siteInfo.channelId) {
					channelPromises.push(_getChannelInfo(request, localhost, siteInfo.channelId));
				}
				return Promise.all(channelPromises);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				console.log(' - query site channel');
				var policyId = result && result.length > 0 ? result[0].localizationPolicy : undefined;
				//
				// Get Localization policy
				//
				var policyPromise = [];
				if (policyId) {
					policyPromise.push(_getLocalizationPolicy(request, localhost, policyId));
				}
				return Promise.all(policyPromise);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var policy = result && result[0] || {};
				if (policy && policy.id) {
					console.log(' - site localization policy: ' + policy.name);
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
					siteinfoPromises[i] = _getSiteInfoFile(request, localhost, site, locales[i], false);
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
						console.log('ERROR: site does not have translation for ' + languages[i]);
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
					console.log(' - site translation: ' + _languages);
				}

				return _getRepository(request, localhost, siteRepositoryId);
			})
			.then(function (result) {
				//
				// Get repository 
				// 
				if (result.err) {
					return Promise.reject();
				}
				repository = result;
				console.log(' - query site repository');

				return _getSiteStructure(request, localhost, site);
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
				console.log(' - query site structure');
				pages = siteStructure && siteStructure.base && siteStructure.base.pages;
				if (!pages || pages.length === 0) {
					console.log('ERROR: no page found');
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
					console.log(' - default detail page: ' + _defaultDetailPage.name);
				}

				var pageDataPromises = [];
				if (_hasDetailPage) {
					pageDataPromises = _getPageDataPromise(request, localhost, site, pages);
				}
				return Promise.all(pageDataPromises);
			})
			.then(function (values) {
				console.log(' - query page data');
				for (var i = 0; i < values.length; i++) {
					var obj = values[i];
					Object.keys(obj).forEach(key => {
						var value = obj[key];
						pageData.push({
							id: key,
							data: value && value.base
						});
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
						contentTypesPromise.push(serverUtils.getContentTypeFromServer(server, contentTypes[i]));
					}
				}

				//
				// Get content types on the detail pages
				//
				_getDetailPageContentTypes(pageData);
				// console.log(_detailPages);

				if (contentTypesPromise.length > 0) {
					Promise.all(contentTypesPromise).then(function (values) {
						console.log(' - content types used in the site: ' + contentTypeNames);
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

var _getSiteDataWithLocale = function (server, request, localhost, site, locale, isMaster) {
	var sitePromise = new Promise(function (resolve, reject) {
		var pages = [];
		var items = [];
		var pageFiles = [];
		var pageData = [];

		var siteStructurePromise = _getSiteStructure(request, localhost, site, locale, isMaster);
		siteStructurePromise.then(function (result) {
			if (result.err) {
				return resolve(result);
			}
			console.log(' - query site structure ' + (locale ? ('(' + locale + ')') : ''));

			var siteStructure = result;
			pages = siteStructure && siteStructure.base && siteStructure.base.pages;

			var sitePageFilesPromise = _getSitePageFiles(request, localhost, site, locale, isMaster);
			sitePageFilesPromise.then(function (result) {
				pageFiles = result.files || [];
				if (!pageFiles || pageFiles.length === 0) {
					console.log('WARNING: failed to get page files');
				}

				if (_hasDetailPage && _contentTypesOnPages.length > 0) {
					//
					// Get page data for all pages
					//
					var pageDataPromise = _getPageDataPromise(request, localhost, site, pages, locale, isMaster);
					Promise.all(pageDataPromise).then(function (values) {
						console.log(' - query page data (' + locale + ')');
						for (var i = 0; i < values.length; i++) {
							var obj = values[i];
							Object.keys(obj).forEach(key => {
								var value = obj[key];
								pageData.push({
									id: key,
									data: value && value.base
								});
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
						var pageContentPromise = _getPageContentPromise(request, localhost, server, _siteChannelToken, _pageContentIds, pageContentListQueries, locale);
						Promise.all(pageContentPromise).then(function (values) {
							console.log(' - query content on the pages (' + locale + ')');

							var items = [];
							for (var i = 0; i < values.length; i++) {
								items = items.concat(values[i]);
							}

							return resolve({
								locale: locale,
								pageFiles: pageFiles,
								pages: pages,
								items: items
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


/**
 * Main entry
 * 
 */
var _createSiteMap = function (server, serverName, request, localhost, site, siteUrl, changefreq, publish, siteMapFile, languages, toppagepriority, done) {

	//
	// get site info and other metadata
	// 
	var masterPages = [];
	var allPages = [];
	var allPageFiles = [];
	var allItems = [];
	var dataPromise = _prepareData(server, request, localhost, site, languages, done);
	dataPromise.then(function (result) {
			if (result.err) {
				_cmdEnd(done);
				return;
			}

			var isMaster = true;
			var siteDataPromises = [];
			siteDataPromises.push(_getSiteDataWithLocale(server, request, localhost, site, _SiteInfo.defaultLanguage, isMaster));
			for (var i = 0; i < _languages.length; i++) {
				if (_languages[i] !== _SiteInfo.defaultLanguage) {
					siteDataPromises.push(_getSiteDataWithLocale(server, request, localhost, site, _languages[i], false));
				}
			}

			return Promise.all(siteDataPromises);

		})
		.then(function (values) {
			// console.log(values);
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
			}

			var changefreqPromises = changefreq === 'auto' ? [_calculatePageChangeFraq(serverName, allPageFiles)] : [];

			return Promise.all(changefreqPromises);
		})
		.then(function (results) {
			// console.log(allPageFiles);
			//
			// create site map
			//
			_generateSiteMapXML(siteUrl, allPages, allPageFiles, allItems, changefreq, toppagepriority, siteMapFile);

			if (publish) {
				// Upload site map to the server
				var uploadPromise = _uploadSiteMapToServer(request, localhost, site, siteMapFile);
				uploadPromise.then(function (result) {
					if (!result.err) {
						var siteMapUrl = siteUrl + '/' + siteMapFile.substring(siteMapFile.lastIndexOf('/') + 1);
						console.log(' - site map uploaded, publish the site and access it at ' + siteMapUrl);
					}
					_cmdEnd(done);
				});
			} else {
				_cmdEnd(done);
			}
		});
};

var _calculatePageChangeFraq = function (serverName, allPageFiles) {
	return new Promise(function (resolve, reject) {
		var total = allPageFiles.length;
		console.log(' - total number of pages: ' + total);
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
					for (var i = param.start; i < param.end; i++) {
						versionPromises.push(serverRest.getFileVersions({
							registeredServerName: serverName,
							currPath: projectDir,
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
								console.log(' - ' + i + ' is empty');
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
	if (serverName) {
		var serverpath = path.join(serversSrcDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			done();
			return;
		}
	}

	var server = serverName ? serverUtils.getRegisteredServer(projectDir, serverName) : serverUtils.getConfiguredServer(projectDir);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}

	var site = argv.site;
	var siteUrl = argv.url;

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

	var languages = argv.languages ? argv.languages.split(',') : [];

	var toppagepriority = argv.toppagepriority;

	var request = require('request');
	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		pool: {
			maxSockets: 50
		},
		jar: true,
		proxy: null
	});

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9393';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		var auth = serverUtils.getRequestAuth(server);

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
				};

				options['auth'] = auth;

				request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					serverUtils.fixHeaders(response, res);
				}).pipe(res);

			} else {
				console.log('ERROR: GET request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('CHECKIN_UNIVERSAL') > 0) {
				var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				var fileId = params.fileId,
					filePath = params.filePath,
					fileName = params.fileName,
					folderId = params.folderId,
					idcToken = params.idcToken;
				var uploadUrl = server.url + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
				var formData = {
					'parent': 'fFolderGUID:' + folderId,
					'idcToken': idcToken,
					'primaryFile': fs.createReadStream(filePath),
					'filename': fileName
				};
				if (fileId && fileId !== 'undefined') {
					formData['item'] = 'fFileGUID:' + fileId;
				}

				var postData = {
					method: 'POST',
					url: uploadUrl,
					'auth': auth,
					'formData': formData
				};

				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - upload finished: '+filePath);
						res.end();
					});
			} else {
				console.log('ERROR: POST request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});

		localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

			// console.log('localhost: ' + localhost);
			_createSiteMap(server, serverName, request, localhost, site, siteUrl, changefreq, publish, siteMapFile, languages, toppagepriority, done);
		});
		localServer.on('error', function (e) {
			console.log('ERROR: ');
			console.log(e);
		});

	}); // login
};