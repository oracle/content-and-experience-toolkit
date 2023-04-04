/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
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
const { result } = require('underscore');

var console = require('../test/server/logger.js').console;

var projectDir,
	serversSrcDir,
	sitemapSrcDir;

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	sitemapSrcDir = path.join(srcfolder, 'sitemaps');

	return true;
};

var _cmdEnd = function (done, success) {
	done(success);
};

var _getSiteInfoFile = function (server, items, locale, isMaster) {
	var siteInfoFilePromise = new Promise(function (resolve, reject) {

		var name = (isMaster || !locale) ? 'siteinfo.json' : locale + '_siteinfo.json';
		var fileId;
		for (var i = 0; i < items.length; i++) {
			if (items[i].name === name) {
				fileId = items[i].id;
				break;
			}
		}
		// console.log(' - file name: ' + name + ' id: ' + fileId);
		if (!fileId) {
			return resolve({
				err: 'err'
			});
		} else {
			serverRest.readFile({
				server: server,
				fFileGUID: fileId

			})
				.then(function (result) {
					if (result.err) {
						return resolve({
							err: 'err'
						});
					} else {

						var siteInfoFileContent = typeof result === 'string' ? JSON.parse(result) : result;
						return resolve({
							'locale': locale || 'master',
							'data': siteInfoFileContent
						});
					}
				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});
		}
	});
	return siteInfoFilePromise;
};

var _getSiteInfoFiles = function (server, items, locales) {
	return new Promise(function (resolve, reject) {
		var values = [];
		var doGet = locales.reduce(function (siteInfoPromise, locale) {
			return siteInfoPromise.then(function (result) {
				return _getSiteInfoFile(server, items, locale, false)
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

var _getSiteStructure = function (server, items, locale, isMaster) {
	var siteStructurePromise = new Promise(function (resolve, reject) {

		var name = (isMaster || !locale) ? 'structure.json' : locale + '_structure.json';
		var fileId;
		for (var i = 0; i < items.length; i++) {
			if (items[i].name === name) {
				fileId = items[i].id;
				break;
			}
		}
		// console.log(' - file name: ' + name + ' id: ' + fileId);

		if (!fileId) {
			return resolve({
				err: 'err'
			});
		} else {

			serverRest.readFile({
				server: server,
				fFileGUID: fileId
			})
				.then(function (result) {
					if (result.err) {
						return resolve({
							err: 'err'
						});
					} else {

						var structureFileContent = typeof result === 'string' ? JSON.parse(result) : result;
						return resolve(structureFileContent);
					}
				})
				.catch((error) => {
					return resolve({
						err: 'err'
					});
				});
		}
	});
	return siteStructurePromise;
};


var _getDefaultDetailPageId = function (data) {
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
	var pages = data.masterSiteStructure && data.masterSiteStructure.pages;
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
var _getPageData = function (server, data, locale, isMaster) {
	// console.log(' isMaster: ' + isMaster + ' locale: ' + locale);
	return new Promise(function (resolve, reject) {
		serverRest.findFolderItems({
			server: server,
			parentID: data.pagesFolderId
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				var items = result || [];
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
				if (error) {
					console.error(error);
				}
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

		serverUtils.showRequestOptions(options);

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
		var limit = 10;
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
					if (data.contentTypes[j] && !pageContentTypes.includes(data.contentTypes[j])) {
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
var _getDetailPageContentTypes = function (data, pageData) {

	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var detailPageIdx = undefined;
		for (var j = 0; j < data.detailPages.length; j++) {
			if (pageId === data.detailPages[j].page.id.toString()) {
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
						if (data.contentTypes[j] && !pageContentTypes.includes(data.contentTypes[j])) {
							pageContentTypes.push(data.contentTypes[j]);
						}
					}
				}
			});
			data.detailPages[detailPageIdx]['contentTypes'] = pageContentTypes;
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
			itemIds = [];
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


var _getContentListQueryString = function (type, limit, offset, orderBy, categoryFilters, queryString, locale) {
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
	if (categoryFilters && categoryFilters.length > 0) {
		let taxq = '';
		categoryFilters.forEach(function (tax) {
			if (tax.taxonomy && tax.categories && tax.categories.length > 0) {
				let catq = '';
				for (let i = 0; i < tax.categories.length; i++) {
					if (catq) {
						catq = catq + ' or ';
					}
					catq = catq + 'taxonomies.categories.nodes.id eq "' + tax.categories[i] + '"';
				}
				if (catq) {
					if (taxq) {
						taxq = taxq + ' and ';
					}
					taxq = taxq + '(' + catq + ')';
				}
			}
		});
		if (taxq) {
			q = q + ' and ' + taxq;
		}
	}
	if (queryString) {
		q = q + ' and (' + queryString + ')';
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
				var categoryFilters = data.categoryFilters;
				var queryString = data.queryString;
				var str = _getContentListQueryString(type, limit, offset, orderBy, categoryFilters, queryString, locale);
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

		serverUtils.showRequestOptions(options);

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
		var q = '';
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
	for (let i = 0; i < pageContentListQueries.length; i++) {
		promises.push(_getPageContent(server, channelToken, locale,
			pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, pageContentListQueries[i].detailPageId, 'list'));
	}

	return promises;
};

var _getTypeItems = function (server, data, channelToken, locale) {
	return new Promise(function (resolve, reject) {
		var items = [];
		var doQuery = data.typesToQuery.reduce(function (typePromise, typeName) {
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

var _getPage = function (data, pageid) {
	var pages = data.masterSiteStructure && data.masterSiteStructure.pages || [];
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
var _getMasterPageData = function (data, pageid) {
	var id = pageid.toString();
	if (id.indexOf('_') > 0) {
		id = id.substring(id.lastIndexOf('_') + 1);
	}
	var pagedata;
	for (var i = 0; i < data.masterPageData.length; i++) {
		if (id === data.masterPageData[i].id) {
			pagedata = data.masterPageData[i].data;
		}
	}
	return pagedata;
};

/**
 * check if a page has query string
 */
var _getQueryString = function (querystrings, name) {
	var queryString = '';
	querystrings.forEach(function (item) {
		var pageName;
		var pageQueryString;
		if (item.indexOf(':') > 0) {
			var values = item.split(':');
			pageName = values[0];
			pageQueryString = values[1];
		} else {
			// no page name specified
			pageQueryString = item;
		}
		if (!pageName) {
			// the query string is for all pages
			if (!queryString) {
				// do not override the particular page value
				queryString = pageQueryString;
			}
		}

		if (pageName && pageName === name) {
			// the query string for this paticular page, can override value for all pages
			queryString = pageQueryString;
		}

	});
	return queryString;
};


/**
 * Generate site map XML file
 * 
 * @param {*} siteInfo 
 * @param {*} pages 
 */
var _generateSiteMapURLs = function (server, languages, excludeLanguages, data, siteUrl, pages, pageFiles, items, typeItems, changefreq, toppagepriority,
	newlink, noDefaultDetailPageLink, querystrings, noDefaultLocale, defaultLocale, useDefaultSiteUrl) {

	var prefix = siteUrl;
	if (prefix.substring(prefix.length - 1) === '/') {
		prefix = prefix.substring(0, prefix.length - 1);
	}

	var detailPageUrl;
	var queryString;
	var lastmod;
	var urls = [];
	var locales = [];
	var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

	var rootPageId;
	for (let i = 0; i < pages.length; i++) {
		if (pages[i].id && !pages[i].parentId) {
			rootPageId = pages[i].id;
			break;
		}
	}

	if (!noDefaultLocale) {
		if (languages.length > 0 && !languages.includes(data.SiteInfo.defaultLanguage)) {
			languages.push(data.SiteInfo.defaultLanguage);
		}
	} else {
		if (languages.length > 0 && languages.includes(data.SiteInfo.defaultLanguage)) {
			languages.splice(languages.indexOf(data.SiteInfo.defaultLanguage), 1);
		}
	}
	// console.log(languages);

	//
	// page urls
	//
	var pagePriority = [];
	var addedPageUrls = [];
	for (let i = 0; i < pages.length; i++) {

		//
		// find out last modified date
		//
		// var fileName = (includeLocale ? (pages[i].locale + '_') : '') + pages[i].id.toString() + '.json';
		var fileName = pages[i].id.toString() + '.json';
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
			// console.info('*** page ' + fileName + ' not found');
		}
		//
		// calculate priority
		//
		var priority;
		if (!pages[i].parentId) {
			// root always is 1
			priority = 1;
		} else {
			priority = toppagepriority || 1;
			if (pages[i].pageUrl) {
				var levels = pages[i].pageUrl.split('/');
				for (let j = 1; j < levels.length; j++) {
					priority = priority / 2;
				}
			}
		}

		pagePriority.push({
			id: pages[i].id.toString(),
			pageUrl: pages[i].pageUrl,
			priority: priority,
			changefreq: pageChangefreq
		});

		// console.log(pages[i]);
		var pageId = pages[i].id;
		var masterPageData = _getMasterPageData(data, pageId);
		var properties = masterPageData && masterPageData.properties;
		var noIndex = properties && properties.noIndex;
		var isExternalLink = pages[i].linkUrl && pages[i].linkUrl.indexOf(server.url) < 0;
		if (pages[i].pageUrl && !pages[i].isDetailPage && !noIndex && !isExternalLink) {

			var includeLocale = pages[i].locale && (pages[i].locale !== data.SiteInfo.defaultLanguage || defaultLocale);

			// console.log('page: ' + pages[i].id + ' parent: ' + pages[i].parentId + ' url: ' + pages[i].pageUrl + ' priority: ' + priority + ' lastmod: ' + lastmod);
			let pageurl = pageId === rootPageId && useDefaultSiteUrl ? '' : pages[i].pageUrl;
			var loc = pages[i].linkUrl || (prefix + '/' + (includeLocale ? (pages[i].locale + '/') : '') + pageurl);

			// check query strings
			queryString = _getQueryString(querystrings, pages[i].name);
			if (queryString) {
				if (loc.indexOf('?') > 0) {
					loc = loc + '&' + queryString;
				} else {
					loc = loc + '?' + queryString;
				}
				// console.log(' - page: ' + pages[i].name + ' url: ' + loc);
			}

			if (!addedPageUrls.includes(loc)) {
				if (!noDefaultLocale || includeLocale) {
					if (languages.length === 0 || languages.includes(pages[i].locale)) {
						if (!excludeLanguages.includes(pages[i].locale)) {
							urls.push({
								loc: loc,
								lastmod: lastmod,
								priority: priority,
								changefreq: pageChangefreq,
								locale: pages[i].locale,
								type: 'page',
								id: pages[i].id.toString()
							});
							addedPageUrls.push(loc);
							if (!locales.includes(pages[i].locale)) {
								locales.push(pages[i].locale);
							}
						}
					}

					// Add fallbacks if there are
					if (pages[i].locale && data.SiteInfo.localeFallbacks) {
						Object.keys(data.SiteInfo.localeFallbacks).forEach(function (otherLocale) {
							if (pages[i].locale === data.SiteInfo.localeFallbacks[otherLocale]) {
								let otherLoc = serverUtils.replaceAll(loc, '/' + pages[i].locale + '/', '/' + otherLocale + '/');
								if (languages.length === 0 || languages.includes(otherLocale)) {
									if (!excludeLanguages.includes(otherLocale)) {
										if (!addedPageUrls.includes(otherLoc)) {
											urls.push({
												loc: otherLoc,
												lastmod: lastmod,
												priority: priority,
												changefreq: pageChangefreq,
												locale: otherLocale,
												type: 'page',
												id: pages[i].id.toString()
											});
											addedPageUrls.push(otherLoc);
											if (!locales.includes(otherLocale)) {
												locales.push(otherLocale);
											}
										}
									}
								}
							}
						});
					}
				}
			} // no duplicate
		}
	}


	var totalPageUrls = addedPageUrls.length;

	//
	// detail page urls for items
	//
	var addedUrls = [];
	if (data.hasDetailPage) {
		for (let i = 0; i < items.length; i++) {
			if (!noDefaultDetailPageLink || items[i].detailPageId) {
				// get page's priority
				let pageId = items[i].pageId;
				var itemPriority;
				var itemChangefreq;
				for (let j = 0; j < pagePriority.length; j++) {
					if (pageId === pagePriority[j].id) {
						itemPriority = pagePriority[j].priority;
						itemChangefreq = pagePriority[j].changefreq;
						break;
					}
				}

				var detailPage = _getPage(data, items[i].detailPageId) || data.defaultDetailPage;
				detailPageUrl = detailPage.pageUrl;
				queryString = _getQueryString(querystrings, detailPage.name);

				var pageItems = items[i].data || [];
				// console.log(pageItems);
				for (let j = 0; j < pageItems.length; j++) {
					var item = pageItems[j];
					if (item && item.id) {

						// verify if the detail page allows the content type
						var detailPageAllowed = false;
						for (var k = 0; k < data.detailPages.length; k++) {
							if (data.detailPages[k].page.id.toString() === detailPage.id.toString() &&
								(data.detailPages[k].contentTypes.length === 0 || data.detailPages[k].contentTypes.includes(item.type))) {
								detailPageAllowed = true;
								break;
							}
						}

						if (detailPageAllowed && detailPageUrl) {
							var detailPagePrefix = detailPageUrl.replace('.html', '');
							var itemlanguage = item.language || items[i].locale;
							var locale = itemlanguage && (itemlanguage !== data.SiteInfo.defaultLanguage || defaultLocale) ? (itemlanguage + '/') : '';
							// trailing / is required
							var url;
							if (newlink) {
								url = prefix + '/' + locale + detailPagePrefix + '/' + item.slug;
							} else {
								url = prefix + '/' + locale + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
							}
							// console.log(item);

							if (queryString) {
								if (url.indexOf('?') > 0) {
									url = url + '&' + queryString;
								} else {
									url = url + '?' + queryString;
								}
							}

							lastmod = _getLastmod(item.updatedDate.value);

							// no duplicate url
							if (!addedUrls.includes(url)) {
								// console.log('item: ' + item.name + ' page: ' + pageId + ' priority: ' + itemPriority + ' lastmod: ' + lastmod);
								if (!noDefaultLocale || locale) {
									if (languages.length === 0 || languages.includes(itemlanguage)) {
										if (!excludeLanguages.includes(itemlanguage)) {
											urls.push({
												loc: url,
												lastmod: lastmod,
												priority: itemPriority,
												changefreq: itemChangefreq,
												locale: itemlanguage,
												type: 'item',
												itemId: item.id
											});

											addedUrls.push(url);
										}
									}

									// Add fallbacks if there are
									if (locale && data.SiteInfo.localeFallbacks) {
										Object.keys(data.SiteInfo.localeFallbacks).forEach(function (otherLocale) {
											if (locale === data.SiteInfo.localeFallbacks[otherLocale] + '/') {
												let otherUrl = serverUtils.replaceAll(url, '/' + locale, '/' + otherLocale + '/');
												if (languages.length === 0 || languages.includes(otherLocale)) {
													if (!excludeLanguages.includes(otherLocale)) {
														if (!addedUrls.includes(otherUrl)) {
															urls.push({
																loc: otherUrl,
																lastmod: lastmod,
																priority: itemPriority,
																changefreq: itemChangefreq,
																locale: otherLocale,
																type: 'item',
																itemId: item.id
															});

															addedUrls.push(otherUrl);
														}
													}
												}
											}
										});
									}
								}
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
			var detailPageName;
			for (var i = 0; i < data.detailPages.length; i++) {
				if (data.detailPages[i].contentTypes && data.detailPages[i].contentTypes.includes(typeItem.type)) {
					detailPageUrl = data.detailPages[i].page && data.detailPages[i].page.pageUrl;
					detailPageName = data.detailPages[i].page && data.detailPages[i].page.name;
					break;
				}
			}

			var queryString = detailPageName ? _getQueryString(querystrings, detailPageName) : '';

			if (detailPageUrl) {
				for (let i = 0; i < typeItem.items.length; i++) {
					var item = typeItem.items[i];
					var detailPagePrefix = detailPageUrl.replace('.html', '');
					var itemlanguage = typeItem.locale;
					var locale = itemlanguage && (itemlanguage !== data.SiteInfo.defaultLanguage || defaultLocale) ? (itemlanguage + '/') : '';
					// trailing / is required
					var url;
					if (newlink) {
						url = prefix + '/' + locale + detailPagePrefix + '/' + item.slug;
					} else {
						url = prefix + '/' + locale + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
					}
					// console.log(item);

					if (queryString) {
						if (url.indexOf('?') > 0) {
							url = url + '&' + queryString;
						} else {
							url = url + '?' + queryString;
						}
					}

					var lastmod = _getLastmod(item.updatedDate.value);

					// no duplicate url
					if (!addedUrls.includes(url)) {
						// console.log('item: ' + item.name + ' page: ' + pageId + ' priority: ' + itemPriority + ' lastmod: ' + lastmod);
						if (!noDefaultLocale || locale) {
							if (languages.length === 0 || languages.includes(itemlanguage)) {
								if (!excludeLanguages.includes(itemlanguage)) {
									urls.push({
										loc: url,
										lastmod: lastmod,
										priority: itemPriority,
										changefreq: itemChangefreq,
										locale: itemlanguage,
										type: 'item',
										itemId: item.id
									});

									addedUrls.push(url);
								}
							}

							if (locale && data.SiteInfo.localeFallbacks) {
								Object.keys(data.SiteInfo.localeFallbacks).forEach(function (otherLocale) {
									if (locale === data.SiteInfo.localeFallbacks[otherLocale] + '/') {
										let otherUrl = serverUtils.replaceAll(url, '/' + locale, '/' + otherLocale + '/');
										if (languages.length === 0 || languages.includes(otherLocale)) {
											if (!excludeLanguages.includes(otherLocale)) {
												if (!addedUrls.includes(otherUrl)) {
													urls.push({
														loc: otherUrl,
														lastmod: lastmod,
														priority: itemPriority,
														changefreq: itemChangefreq,
														locale: otherLocale,
														type: 'item',
														itemId: item.id
													});

													addedUrls.push(otherUrl);
												}
											}
										}
									}
								});
							}
						}
					}
				}
			}
		});

	} // has detail page

	console.info(' - total page URLs: ' + totalPageUrls + '  total asset URLs: ' + addedUrls.length);

	return { urls: urls, locales: locales };
};

var _generateSiteMapXML = function (format, urls, siteMapFile, bufs) {

	var buf = '';
	var ident = '    ',
		ident2 = ident + ident;

	if (format === 'text') {

		for (let i = 0; i < urls.length; i++) {
			buf = buf + urls[i].loc + os.EOL;
		}

		// save to file
		fs.writeFileSync(siteMapFile, buf);
		console.log(' - generate file ' + siteMapFile);

	} else if (format === 'xml-variants') {
		// sort: page first, then by page id or item master id
		var sortUrls = urls.slice(0);
		sortUrls.sort(function (a, b) {
			var x = a.type;
			var y = b.type;
			var idA = a.id;
			var idB = b.id;
			return (x < y ? 1 : x > y ? -1 : (idA < idB ? -1 : 1));
		});
		urls = sortUrls;

		// get all unique Ids
		var ids = [];
		urls.forEach(function (url) {
			if (!ids.includes(url.id)) {
				ids.push(url.id);
			}
		});

		var header = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' + os.EOL +
			'  xmlns:xhtml="http://www.w3.org/1999/xhtml">' + os.EOL;

		var footer = '</urlset>' + os.EOL;

		// sitemap file max size 50MB
		const SITEMAP_FILE_SIZE = 48000000;
		// const SITEMAP_FILE_SIZE = 1000000;
		var allbuf = '';
		ids.forEach(function (id) {
			let buf = '';
			for (let i = 0; i < urls.length; i++) {
				if (urls[i].id === id) {
					let url = urls[i];
					buf = buf + ident + '<url>' + os.EOL;
					buf = buf + ident2 + '<loc>' + url.loc + '</loc>' + os.EOL;

					// alternate urls
					for (let j = 0; j < urls.length; j++) {
						if (url.id === urls[j].id) {
							buf = buf + ident2 + '<xhtml:link rel="alternate" hreflang="' + urls[j].locale + '" href="' + urls[j].loc + '"/>' + os.EOL;
						}
					}

					buf = buf + ident + '</url>' + os.EOL;
				}
			}
			if (buf.length + allbuf.length > SITEMAP_FILE_SIZE) {
				if (allbuf.length > 0) {
					bufs.push(header + allbuf + footer);
				}
				allbuf = buf;
				buf = '';
			} else {
				allbuf = allbuf + buf;
				buf = '';
			}
		});

		if (allbuf.length > 0) {
			bufs.push(header + allbuf + footer);
		}

		return bufs;

	} else {

		buf = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + os.EOL;

		for (let i = 0; i < urls.length; i++) {
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
	}

};


var _uploadSiteMapToServer = function (server, seoFolderId, localFiles) {
	return new Promise(function (resolve, reject) {
		var err;
		var doUpload = localFiles.reduce(function (uploadPromise, localFilePath) {
			var fileName = localFilePath;
			if (fileName.indexOf(path.sep) >= 0) {
				fileName = fileName.substring(fileName.lastIndexOf(path.sep) + 1);
			}
			return uploadPromise.then(function (result) {
				return serverRest.createFile({
					server: server,
					parentID: seoFolderId,
					filename: fileName,
					contents: fs.createReadStream(localFilePath)
				});
			})
				.then(function (result) {
					if (result && result.id) {
						console.info(' - file ' + fileName + ' uploaded to server, version ' + result.version);
					} else {
						err = 'err';
					}
				});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doUpload.then(function (result) {
			resolve({
				err: err
			});
		});
	});
};

var _prepareData = function (server, site, languages, allTypes, wantedTypes, done) {
	var dataPromise = new Promise(function (resolve, reject) {

		var siteInfo, defaultLanguage, siteChannelToken, siteRepositoryId;
		var siteStructure, pages, pageData = [];

		var data = {};

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

				data.siteId = result.id;

				// get all site top level files
				return serverRest.getAllChildItems({
					server: server,
					parentID: data.siteId
				});

			})
			.then(function (result) {

				var siteTopItems = result || [];
				data.siteTopItems = siteTopItems;
				console.log(' - site top level items: ' + siteTopItems.length);

				for (var i = 0; i < siteTopItems.length; i++) {
					var item = siteTopItems[i];
					if (item.name === 'pages') {
						data.pagesFolderId = item.id;
						break;
					}
				}
				if (!data.pagesFolderId) {
					console.log('ERROR: failed to find folder pages');
					return Promise.reject();

				}

				//
				// Get site info
				//
				var siteInfoPromise = _getSiteInfoFile(server, data.siteTopItems);
				return siteInfoPromise;
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				siteInfo = result.data.properties;
				data.SiteInfo = siteInfo;
				defaultLanguage = siteInfo.defaultLanguage;
				siteRepositoryId = siteInfo.repositoryId;
				data.siteChannelToken = _getSiteChannelToken(siteInfo);
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
				var requiredLangs = policy.requiredValues || [];
				var optionalLangs = policy.optionalValues || [];

				var locales = [];

				for (var i = 0; i < requiredLangs.length; i++) {
					if (requiredLangs[i] !== data.SiteInfo.defaultLanguage) {
						locales.push(requiredLangs[i]);
					}
				}
				for (let i = 0; i < optionalLangs.length; i++) {
					if (optionalLangs[i] !== data.SiteInfo.defaultLanguage) {
						locales.push(optionalLangs[i]);
					}
				}
				// console.log(locales);

				//
				// verify the site has the translation
				//
				return _getSiteInfoFiles(server, data.siteTopItems, locales);

			})
			.then(function (values) {
				data.validLocales = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i].locale) {
						data.validLocales.push(values[i].locale);
					}
				}

				//
				// validate languages parameter
				//
				var fallbackLocales = [];
				if (data.SiteInfo.localeFallbacks) {
					Object.keys(data.SiteInfo.localeFallbacks).forEach(function (key) {
						fallbackLocales.push(key);
					});
				}

				var languages2 = [];
				for (let i = 0; i < languages.length; i++) {
					if (languages[i] !== data.SiteInfo.defaultLanguage && !data.validLocales.includes(languages[i]) && !fallbackLocales.includes(languages[i])) {
						console.error('ERROR: site does not have translation for ' + languages[i]);
						return Promise.reject();
					}

					languages2.push(languages[i]);
					if (fallbackLocales.includes(languages[i])) {
						let fallbackTo = data.SiteInfo.localeFallbacks[languages[i]];
						// get the fallback to query
						if (fallbackTo !== data.SiteInfo.defaultLanguage && !languages2.includes(fallbackTo)) {
							languages2.push(fallbackTo);
						}
					}
				}
				if (languages2.length > 0) {
					// use this param
					data.languages = languages2;
				} else {
					data.languages = data.validLocales;
				}
				if (data.languages.length > 0) {
					console.info(' - site translation: ' + data.languages);
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

				console.info(' - query site repository');

				return _getSiteStructure(server, data.siteTopItems);
			})
			.then(function (result) {
				// 
				// Get site structure
				//
				if (result.err) {
					return Promise.reject();
				}
				siteStructure = result;
				data.masterSiteStructure = siteStructure;
				console.info(' - query site structure');
				pages = siteStructure && siteStructure.pages;
				if (!pages || pages.length === 0) {
					console.error('ERROR: no page found');
					return Promise.reject();
				}
				// find the detail pages
				data.hasDetailPage = false;
				data.detailPages = [];
				for (var i = 0; i < pages.length; i++) {
					if (pages[i].isDetailPage) {
						data.hasDetailPage = true;
						data.detailPages.push({
							page: pages[i]
						});
					}
				}
				if (data.hasDetailPage) {
					var detailpageid = _getDefaultDetailPageId(data);
					data.defaultDetailPage = _getPage(data, detailpageid);
					console.info(' - default detail page: ' + data.defaultDetailPage.name);
				}

				return _getPageData(server, data, '', true);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - query page data');
				var pages = result;
				for (var i = 0; i < pages.length; i++) {
					if (pages[i] && pages[i].id) {
						pageData.push({
							id: pages[i].id,
							data: pages[i].data
						});
					}
				}
				data.masterPageData = pageData;

				//
				// Get all content types on the pages
				//
				var contentTypes = _getPageContentTypes(pageData);
				var contentTypeNames = [];
				var contentTypesPromise = [];
				if (contentTypes.length > 0) {
					for (let i = 0; i < contentTypes.length; i++) {
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
				_getDetailPageContentTypes(data, pageData);

				if (contentTypeNames.length > 0) {
					console.info(' - content types used in the site: ' + contentTypeNames);
				}

				// Display detail pages
				data.detailPages.forEach(function (dpage) {
					console.info(' - detail page: ' + dpage.page.name + ' content types: ' + dpage.contentTypes);
				});

				data.typesToQuery = [];
				if (allTypes) {
					data.detailPages.forEach(function (dpage) {
						for (var i = 0; i < dpage.contentTypes.length; i++) {
							if (!data.typesToQuery.includes(dpage.contentTypes[i])) {
								data.typesToQuery.push(dpage.contentTypes[i]);
							}
						}
					});
					console.info(' - content types to query items: ' + data.typesToQuery);
				} else if (wantedTypes && wantedTypes.length > 0) {
					for (let i = 0; i < wantedTypes.length; i++) {
						var found = false;
						for (var j = 0; j < data.detailPages.length; j++) {
							if (data.detailPages[j].contentTypes.includes(wantedTypes[i])) {
								found = true;
								if (!data.typesToQuery.includes(wantedTypes[i])) {
									data.typesToQuery.push(wantedTypes[i]);
								}
								break;
							}
						}
						if (!found) {
							console.warn('WARNING: no site detail page found for type ' + wantedTypes[i]);
						}
					}
					console.info(' - content types to query items: ' + data.typesToQuery);
				}

				data.contentTypesOnPages = [];

				if (contentTypesPromise.length > 0) {
					Promise.all(contentTypesPromise).then(function (values) {
						data.contentTypesOnPages = values;

						//
						// Get content ids on the pages
						//
						data.pageContentIds = _getPageContentItemIds(pageData);

						return resolve(data);

					});
				} else {
					return resolve(data);
				}
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				_cmdEnd(done);
			});
	});
	return dataPromise;
};

var _getSiteDataWithLocale = function (server, site, data, locale, isMaster) {
	var sitePromise = new Promise(function (resolve, reject) {
		var pages = [];
		var items = [];
		var pageFiles = [];
		var pageData = [];

		var siteStructurePromise = _getSiteStructure(server, data.siteTopItems, locale, isMaster);
		siteStructurePromise.then(function (result) {
			if (result.err) {
				return resolve(result);
			}
			console.info(' - query site structure ' + (locale ? ('(' + locale + ')') : ''));

			var siteStructure = result;
			pages = siteStructure && siteStructure.pages;

			var sitePageFilesPromise = serverRest.findFolderItems({
				server: server,
				parentID: data.pagesFolderId
			});
			sitePageFilesPromise.then(function (result) {
				pageFiles = result || [];
				if (!pageFiles || pageFiles.length === 0) {
					console.warn('WARNING: failed to get page files');
				}

				if (data.hasDetailPage && data.contentTypesOnPages.length > 0) {
					//
					// Get page data for all pages
					//
					var pageDataPromise = _getPageData(server, data, locale, isMaster);
					pageDataPromise.then(function (result) {
						console.info(' - query page data (' + locale + ')');
						var values = result || [];
						for (var i = 0; i < values.length; i++) {
							if (values[i] && values[i].id) {
								pageData.push({
									id: values[i].id,
									data: values[i].data
								});
							}
						}

						//
						// Get content list queries on the pages
						//
						var pageContentListQueries = _getPageContentListQuery(data.masterPageData, locale);
						// console.log(pageContentListQueries);

						//
						// Get content items on the pages
						//
						var pageContentPromise = _getPageContentPromise(server, data.siteChannelToken, data.pageContentIds, pageContentListQueries, locale);
						Promise.all(pageContentPromise).then(function (values) {
							console.info(' - query content on the pages (' + locale + ')');

							for (var i = 0; i < values.length; i++) {
								items = items.concat(values[i]);
							}
							// console.log(' - total items: ' + items.length);

							var typeContentPromises = data.typesToQuery.length > 0 ? [_getTypeItems(server, data, data.siteChannelToken, locale)] : [];
							Promise.all(typeContentPromises).then(function (results) {
								var typeItems = data.typesToQuery.length > 0 ? results[0] : [];
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
						if (!data.hasDetailPage) {
							console.log(' - no detail page');
						} else if (data.contentTypesOnPages.length === 0) {
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

var _getSiteData = function (server, site, data, locales) {
	return new Promise(function (resolve, reject) {
		var values = [];
		var doGet = locales.reduce(function (sitePromise, locale) {
			return sitePromise.then(function (result) {
				return _getSiteDataWithLocale(server, site, data, locale.language, locale.isMaster)
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

var _getItemMasterIds = function (server, itemGUIDs) {
	return new Promise(function (resolve, reject) {
		var total = itemGUIDs.length;
		console.log(' - total number of assets: ' + total);
		var groups = [];
		var limit = 10;
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

		var queriedItems = [];
		var startTime = new Date();
		var needNewLine = false;
		var doQueryItems = groups.reduce(function (itemPromise, param) {
			return itemPromise.then(function (result) {
				var itemPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					itemPromises.push(serverRest.getItem({ server: server, id: itemGUIDs[i], expand: 'variations' }));
				}
				return Promise.all(itemPromises).then(function (results) {
					queriedItems = queriedItems.concat(results);
					if (console.showInfo()) {
						process.stdout.write(' - quering items to get master Id [' + param.start + ', ' + param.end + ']' +
							' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						readline.cursorTo(process.stdout, 0);
						needNewLine = true;
					}
				});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQueryItems.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			// console.log(queriedItems);
			resolve(queriedItems);
		});
	});
};

var _setLocalAliases = function (aliases, urls) {
	if (!aliases || Object.keys(aliases).length === 0) {
		return urls;
	}

	Object.keys(aliases).forEach(function (alias) {
		var locale = aliases[alias];
		if (locale) {
			for (let i = 0; i < urls.length; i++) {
				urls[i].loc = serverUtils.replaceAll(urls[i].loc, '/' + locale + '/', '/' + alias + '/');
			}
		}
	});
	return urls;
}

/**
 * Main entry
 * 
 */
var _createSiteMap = function (server, serverName, site, siteUrl, format, changefreq,
	publish, siteMapFile, languages, excludeLanguages, toppagepriority, newlink, noDefaultDetailPageLink,
	allTypes, wantedTypes, querystrings, noDefaultLocale, defaultLocale, multiple, useDefaultSiteUrl, done) {

	//
	// get site info and other metadata
	// 
	var masterPages = [];
	var allPages = [];
	var allPageFiles = [];
	var allItems = [];
	var allTypeItems = [];
	var urls = [];
	var locales = [];
	var data;
	var dataPromise = _prepareData(server, site, languages, allTypes, wantedTypes, done);
	dataPromise
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			data = result;

			var isMaster = true;

			var locales = [];
			locales.push({
				language: data.SiteInfo.defaultLanguage,
				isMaster: true
			});

			for (var i = 0; i < data.languages.length; i++) {
				if (data.languages[i] !== data.SiteInfo.defaultLanguage) {
					locales.push({
						language: data.languages[i],
						isMaster: false
					});
				}
			}

			if (locales.length === 0) {
				console.log('ERROR: no language is specified');
				return Promise.reject();
			}
			if (noDefaultLocale && locales.length === 1 && locales[0].language === data.SiteInfo.defaultLanguage) {
				console.log('ERROR: no language is specified');
				return Promise.reject();
			}

			return _getSiteData(server, site, data, locales);

		})
		.then(function (values) {
			for (var i = 0; i < values.length; i++) {
				if (values[i].locale === data.SiteInfo.defaultLanguage) {
					masterPages = values[i].pages;
					break;
				}
			}

			for (let i = 0; i < values.length; i++) {
				if (values[i].pages && values[i].pages.length > 0) {
					for (var j = 0; j < values[i].pages.length; j++) {
						values[i].pages[j]['locale'] = values[i].locale;
					}
					allPages = allPages.concat(values[i].pages);
				}
			}

			for (let i = 0; i < allPages.length; i++) {
				var page = allPages[i];
				if (!page.pageUrl) {
					for (let j = 0; j < masterPages.length; j++) {
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

			for (let i = 0; i < values.length; i++) {
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

		})
		.then(function (results) {

			var changefreqPromises = format === 'xml' && changefreq === 'auto' ? [_calculatePageChangeFraq(server, serverName, allPageFiles)] : [];

			return Promise.all(changefreqPromises);
		})
		.then(function (results) {
			// console.log(allPageFiles);
			if (!fs.existsSync(sitemapSrcDir)) {
				fs.mkdirSync(sitemapSrcDir, {
					recursive: true
				});
			}
			if (!fs.existsSync(path.join(sitemapSrcDir, site))) {
				fs.mkdirSync(path.join(sitemapSrcDir, site), {
					recursive: true
				});
			}
			//
			// create site map
			//
			var siteMapData = _generateSiteMapURLs(server, languages, excludeLanguages, data, siteUrl, allPages, allPageFiles, allItems, allTypeItems,
				changefreq, toppagepriority, newlink, noDefaultDetailPageLink, querystrings, noDefaultLocale, defaultLocale, useDefaultSiteUrl);

			urls = siteMapData.urls;
			locales = siteMapData.locales;

			// use local aliases if defined
			urls = _setLocalAliases(data.SiteInfo.localeAliases, urls);

			var itemGUIDs = [];
			urls.forEach(function (data) {
				if (data.type === 'item' && data.itemId && !itemGUIDs.includes(data.itemId)) {
					itemGUIDs.push(data.itemId);
				}
			});

			var queryMasterItemPromises = format === 'xml-variants' && itemGUIDs.length > 0 ? [_getItemMasterIds(server, itemGUIDs)] : [];

			return Promise.all(queryMasterItemPromises);

		})
		.then(function (results) {
			if (format === 'xml-variants' && results && results[0] && results[0].length > 0) {
				let items = results[0];
				urls.forEach(function (data) {
					if (data.type === 'item') {
						for (let i = 0; i < items.length; i++) {
							let item = items[i];
							if (data.itemId === item.id) {
								if (item.variations && item.variations.data && item.variations.data.length > 0 && item.variations.data[0].varType === 'language') {
									let masterItemId = item.variations.data[0].masterItem;
									data.id = masterItemId;
								}
								break;
							}
						}
					}
				});
			}

			var siteMapFileName = siteMapFile.substring(siteMapFile.lastIndexOf(path.sep) + 1)
			var generatedFiles = [];
			var topFile;

			if (format === 'xml-variants') {

				let bufs = [];
				_generateSiteMapXML(format, urls, siteMapFileName, bufs);
				let totalSize = 0;
				bufs.forEach(function (b) {
					totalSize = totalSize + b.length;
				});
				console.log(' - total size: ' + totalSize + ' files: ' + bufs.length);
				if (bufs.length === 1) {
					// single sitemap file
					topFile = path.join(sitemapSrcDir, site, siteMapFileName);
					fs.writeFileSync(topFile, bufs[0]);
					console.log(' - generate file ' + topFile);
					// continue to save to the cec source folder
					fs.copyFileSync(topFile, siteMapFile);
					generatedFiles.push(siteMapFile);
				} else {
					// multiple files
					let prefix = siteUrl;
					if (prefix.substring(prefix.length - 1) === '/') {
						prefix = prefix.substring(0, prefix.length - 1);
					}
					let sitemapIndex = [];
					for (let i = 0; i < bufs.length; i++) {
						let sizeSiteMapFileName = serverUtils.replaceAll(siteMapFileName, '.xml', '_' + (i + 1) + '.xml');
						let filePath = path.join(sitemapSrcDir, site, sizeSiteMapFileName);
						fs.writeFileSync(filePath, bufs[i]);
						console.log(' - generate file ' + filePath);
						// free
						bufs[i] = '';

						sitemapIndex.push({
							loc: prefix + '/' + sizeSiteMapFileName,
						})

						generatedFiles.push(filePath);
					}
					// generate index file
					let buf = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
						'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + os.EOL;

					let ident = '    ',
						ident2 = ident + ident;

					sitemapIndex.forEach(function (index) {
						buf += ident + '<sitemap>' + os.EOL;
						buf += ident2 + '<loc>' + index.loc + '</loc>' + os.EOL;
						buf += ident + '</sitemap>' + os.EOL;
					});

					buf += '</sitemapindex>' + os.EOL;

					topFile = path.join(sitemapSrcDir, site, siteMapFileName);
					fs.writeFileSync(topFile, buf);
					console.log(' - generate sitemap index file ' + topFile);

					generatedFiles.push(topFile);
				}

			} else {
				if (multiple) {
					// generate multiple files
					var prefix = siteUrl;
					if (prefix.substring(prefix.length - 1) === '/') {
						prefix = prefix.substring(0, prefix.length - 1);
					}
					var sitemapIndex = [];
					for (let i = 0; i < locales.length; i++) {
						let localeURLs = [];
						var lastmod;
						urls.forEach(function (url) {
							if (url.locale === locales[i]) {
								localeURLs.push(url);
								if (!lastmod) {
									lastmod = url.lastmod
								} else {
									// get the latter one
									let oldDate = new Date(lastmod);
									let newDate = new Date(url.lastmod);
									if (newDate > oldDate) {
										lastmod = url.lastmod;
									}
								}
							}
						});

						var localeSiteMapFileName;
						if (format === 'xml' || format === 'xml-variants') {
							localeSiteMapFileName = serverUtils.replaceAll(siteMapFileName, '.xml', '_' + locales[i] + '.xml');
						} else {
							localeSiteMapFileName = serverUtils.replaceAll(siteMapFileName, '.txt', '_' + locales[i] + '.txt');
						}
						// console.log(locales[i] + ': ' + localeURLs.length + ' => ' + localeSiteMapFileName);
						// one file for each locale
						let filePath = path.join(sitemapSrcDir, site, localeSiteMapFileName);
						_generateSiteMapXML(format, localeURLs, filePath);

						sitemapIndex.push({
							loc: prefix + '/' + localeSiteMapFileName,
							lastmod: lastmod
						})

						generatedFiles.push(filePath);
					}

					// now create the sitemap index file
					if (format === 'xml') {
						var buf = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
							'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + os.EOL;

						var ident = '    ',
							ident2 = ident + ident;
						sitemapIndex.forEach(function (index) {
							buf += ident + '<sitemap>' + os.EOL;
							buf += ident2 + '<loc>' + index.loc + '</loc>' + os.EOL;
							buf += ident2 + '<lastmod>' + index.lastmod + '</lastmod>' + os.EOL;
							buf += ident + '</sitemap>' + os.EOL;
						});

						buf += '</sitemapindex>' + os.EOL;

						topFile = path.join(sitemapSrcDir, site, siteMapFileName);
						fs.writeFileSync(topFile, buf);
						console.log(' - generate sitemap index file ' + topFile);

						generatedFiles.push(topFile);

					} else {
						// no index file
						topFile = generatedFiles[0];
					}

				} else {
					// single sitemap file
					topFile = path.join(sitemapSrcDir, site, siteMapFileName);
					_generateSiteMapXML(format, urls, topFile);
					// continue to save to the cec source folder
					fs.copyFileSync(topFile, siteMapFile);
					generatedFiles.push(siteMapFile);
				}
			}

			if (publish) {
				// Upload site map to the server
				serverRest.findFolderHierarchy({
					server: server,
					parentID: data.siteId,
					folderPath: 'settings/seo'
				})
					.then(function (result) {
						if (!result || result.err || !result.id) {
							return Promise.reject();
						}
						var seoFolderId = result.id;

						_uploadSiteMapToServer(server, seoFolderId, generatedFiles)
							.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								} else {
									var siteMapUrl = siteUrl + '/' + topFile.substring(topFile.lastIndexOf(path.sep) + 1);
									console.log(' - sitemap uploaded, publish the site and access it at ' + siteMapUrl);
									_cmdEnd(done, true);
								}

							});

					})
					.catch((error) => {
						if (error) {
							console.error(error);
						}
						_cmdEnd(done);
					});

			} else {
				_cmdEnd(done, true);
			}
		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			_cmdEnd(done);
		});
};


var _calculatePageChangeFraq = function (server, serverName, allPageFiles) {
	return new Promise(function (resolve, reject) {
		var total = allPageFiles.length;
		console.info(' - total number of pages: ' + total);
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

				process.stdout.write(' - calculating page change frequency [' + param.start + ', ' + param.end + '] ...');
				readline.cursorTo(process.stdout, 0);

				return Promise.all(versionPromises).then(function (results) {
					var pages = results;

					for (var i = 0; i < pages.length; i++) {
						var versions = pages[i];

						if (versions) {

							// the versions returned in order, the latest in front
							// if there are more than 5 versions, use the 5th latest to calculate

							var oldestVersionIdx = versions.length > 5 ? 4 : versions.length - 1;
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

							console.debug(' - page : ' + versions[0].name + ' versions: ' + versions.length +
								' 5th latest: v' + versions[oldestVersionIdx].version + ' update: ' + versions[oldestVersionIdx].modifiedTime +
								' days: ' + diffDays + ' changefreq: ' + changefreq.toFixed(2) + ' roundDown: ' + roundDown.toFixed(2) + ' => ' + calculatedChangefreq);

							for (var j = 0; j < allPageFiles.length; j++) {
								if (allPageFiles[j].name === versions[0].name) {
									allPageFiles[j].changefreq = calculatedChangefreq;
									break;
								}
							}
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

	// xml or text
	var format = argv.format || 'xml';

	// content types
	var allTypes = argv.assettypes === '__cecanytype';
	var wantedTypes = argv.assettypes && argv.assettypes !== '__cecanytype' ? argv.assettypes.split(',') : undefined;

	// changefreq
	var changefreq = argv.changefreq || 'monthly';

	// site map file
	var siteMapFile = argv.file || (site + (format === 'text' ? 'SiteMap.txt' : 'SiteMap.xml'));
	if ((format === 'xml' || format === 'xml-variants') && siteMapFile.split('.').pop() !== 'xml') {
		siteMapFile = siteMapFile + '.xml';
	} else if (format === 'text' && siteMapFile.split('.').pop() !== 'txt') {
		siteMapFile = siteMapFile + '.txt';
	}
	if (!path.isAbsolute(siteMapFile)) {
		siteMapFile = path.join(projectDir, siteMapFile);
		siteMapFile = path.resolve(siteMapFile);
	}

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

	var newlink = typeof argv.newlink === 'string' && argv.newlink.toLowerCase() === 'true';

	var noDefaultLocale = typeof argv.nodefaultlocale === 'string' && argv.nodefaultlocale.toLowerCase() === 'true';

	var defaultLocale = typeof argv.defaultlocale === 'string' && argv.defaultlocale.toLowerCase() === 'true';

	var noDefaultDetailPageLink = typeof argv.noDefaultDetailPageLink === 'string' && argv.noDefaultDetailPageLink.toLowerCase() === 'true';

	var languages = argv.languages ? argv.languages.split(',') : [];

	var excludeLanguages = argv.excludelanguages ? argv.excludelanguages.split(',') : [];

	var toppagepriority = argv.toppagepriority;

	var querystrings = argv.querystrings ? argv.querystrings.split(',') : [];

	var multiple = typeof argv.multiple === 'string' && argv.multiple.toLowerCase() === 'true';

	var useDefaultSiteUrl = typeof argv.usedefaultsiteurl === 'string' && argv.usedefaultsiteurl.toLowerCase() === 'true';

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_createSiteMap(server, serverName, site, siteUrl, format, changefreq,
			publish, siteMapFile, languages, excludeLanguages, toppagepriority, newlink, noDefaultDetailPageLink,
			allTypes, wantedTypes, querystrings, noDefaultLocale, defaultLocale, multiple, useDefaultSiteUrl, done);

	}); // login
};