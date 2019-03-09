/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var path = require('path'),
	fs = require('fs'),
	os = require('os'),
	url = require('url'),
	serverUtils = require('../test/server/serverUtils.js');

var projectDir = path.join(__dirname, "..");

/**
 * Global variable used by the node server
 */
var _CSRFToken = '';
var _itemIds = [];

//
// Private functions
//

var _cmdEnd = function (done) {
	done();
	process.exit(0);
};

var _getCSRFToken = function (server, request) {
	var csrfTokenPromise = new Promise(function (resolve, reject) {
		var tokenUrl = server.url + '/content/management/api/v1.1/token';
		var auth = {
			user: server.username,
			password: server.password
		};
		var options = {
			url: tokenUrl,
			'auth': auth
		};
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get CSRF token');
				console.log(err);
				return resolve({});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				return resolve(data);
			} else {
				console.log('ERROR: Failed to get CSRF token, status=' + response.statusCode);
				return resolve({});
			}
		});
	});
	return csrfTokenPromise;
};

var _getSiteInfoFile = function (request, localhost, site) {
	var siteInfoFilePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_SITE_INFO_FILE&siteId=' + site + '&IsJson=1';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site info');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get site info');
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
					console.log('ERROR: Failed to get site info ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
					return resolve({
						err: 'err'
					});
				}

				resolve(data);
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

var _getSiteStructure = function (request, localhost, site) {
	var siteStructurePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_STRUCTURE&siteId=' + site + '&IsJson=1';
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
var _getPageDataPromise = function (request, localhost, site, pages) {

	var pageIdList = [];
	var limit = 50;
	var pageIds = '';
	for (var i = 0; i < pages.length; i++) {
		if (pageIds) {
			pageIds += ',';
		}
		pageIds += pages[i].id.toString();
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
 * Get the id of all content item on the pages
 * @param {*} pageData 
 */
var _getPageContentItemIds = function (pageData) {
	var pageContentIds = [];
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var componentInstances = pageData[i].data.componentInstances || {};

		var itemIds = [];
		Object.keys(componentInstances).forEach(key => {
			var data = componentInstances[key].data;
			if (data && data.contentIds && data.contentIds.length > 0) {
				itemIds = itemIds.concat(data.contentIds);
			}
		});

		pageContentIds.push({
			id: pageId,
			contentIds: itemIds
		});
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

var _getContentListQueryString = function (type, limit, offset, orderBy) {
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
		if (q) {
			q = q + ' and ';
		}
		q = q + '(type eq "' + type + '")';
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
var _getPageContentListQuery = function (pageData) {
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
				var str = _getContentListQueryString(type, limit, offset, orderBy);
				pageContentListQueries.push({
					pageId: pageId,
					type: type,
					queryString: str
				});
			}
		});
	}
	return pageContentListQueries;
};

var _getPageContent = function (request, localhost, channelToken, q, pageId, queryType) {
	var pageContentPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/published/api/v1.1/items';
		if (queryType === 'item') {
			if (q.indexOf(' or ') > 0) {
				url = url + '?q=' + q + '&channelToken=' + channelToken;
			} else {
				// only one id
				var id = q.replace('(id eq "', '').replace('")', '');
				url = url + '/' + id + '?channelToken=' + channelToken;
			}
		} else {
			// content list query
			url = url + '?' + q + '&channelToken=' + channelToken;
		}
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get content: url: ' + url);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (!response || response.statusCode !== 200) {
				console.log('ERROR: Failed to get content: status: ' + (response ? response.statusCode : '') + ' url: ' + url);
				return resolve({
					'err': (response ? response.statusCode : 'error')
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get content: url: ' + url);
					return resolve({
						'err': 'error'
					});
				}
				// handle both 1 item or multiple items
				resolve({
					pageId: pageId,
					data: data.items ? data.items : [data]
				});
			} catch (error) {
				console.log('ERROR: Failed to get page data');
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return pageContentPromise;

};

var _getPageContentPromise = function (request, localhost, server, channelToken, pageContentIds, pageContentListQueries) {
	var promises = [];
	var limit = 30;
	var num = 0;

	// Content items queries
	for (var i = 0; i < pageContentIds.length; i++) {
		var pageId = pageContentIds[i].id;
		q = '';
		for (var j = 0; j < pageContentIds[i].contentIds.length; j++) {
			if (q) {
				q += ' or ';
			}
			q += 'id eq "' + pageContentIds[i].contentIds[j] + '"';

			num += 1;
			if (num >= limit && (num % limit === 0)) {
				q = '(' + q + ')';
				promises.push(_getPageContent(request, localhost, channelToken, q, pageId, 'item'));

				// another batch
				q = '';
			}
		}

		if (q) {
			q = '(' + q + ')';
			promises.push(_getPageContent(request, localhost, channelToken, q, pageId, 'item'));
		}
	}

	// Content list queries
	for (var i = 0; i < pageContentListQueries.length; i++) {
		promises.push(_getPageContent(request, localhost, channelToken, pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, 'list'));
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

/**
 * Generate site map XML file
 * 
 * @param {*} siteInfo 
 * @param {*} pages 
 */
var _generateSiteMapXML = function (siteUrl, siteInfo, pages, pageFiles, items, changefreq, siteMapFile) {

	var prefix = siteUrl;
	if (prefix.substring(prefix.length - 1) === '/') {
		prefix = prefix.substring(0, prefix.length - 1);
	}

	var detailPageUrl;
	var urls = [];
	var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
	// page urls
	var pagePriority = [];
	for (var i = 0; i < pages.length; i++) {
		// get the first detail page
		if (!detailPageUrl && pages[i].isDetailPage) {
			detailPageUrl = pages[i].pageUrl;
		}

		if (!pages[i].isDetailPage) {
			// find out last modified date
			var fileName = pages[i].id.toString() + '.json';
			var lastmod;
			for (var j = 0; j < pageFiles.length; j++) {
				if (fileName === pageFiles[j].name) {
					lastmod = _getLastmod(pageFiles[j].lastModifiedDate);
					break;
				}
			}
			// calculate priority
			var priority = 1;
			var levels = pages[i].pageUrl.split('/');
			for (var j = 1; j < levels.length; j++) {
				priority = priority / 2;
			}

			// console.log('page: ' + pages[i].id + ' url: ' + pages[i].pageUrl + ' priority: ' + priority + ' lastmod: ' + lastmod);
			urls.push({
				loc: prefix + '/' + pages[i].pageUrl,
				lastmod: lastmod,
				priority: priority
			});

			pagePriority.push({
				id: pages[i].id.toString(),
				priority: priority
			});
		}
	}

	// detail page urls for items
	if (detailPageUrl) {
		var detailPagePrefix = detailPageUrl.replace('.html', '');

		for (var i = 0; i < items.length; i++) {
			// get page's priority
			var pageId = items[i].pageId;
			var itemPriority;
			for (var j = 0; j < pagePriority.length; j++) {
				if (pageId === pagePriority[j].id) {
					itemPriority = pagePriority[j].priority;
					break;
				}
			}

			var pageItems = items[i].data;
			for (var j = 0; j < pageItems.length; j++) {
				var item = pageItems[j];
				// trailing / is required
				var url = prefix + '/' + detailPagePrefix + '/' + item.type + '/' + item.id + '/';
				var lastmod = _getLastmod(item.updatedDate.value);

				// console.log('item: ' + item.name + ' page: ' + pageId + ' priority: ' + itemPriority + ' lastmod: ' + lastmod);
				urls.push({
					loc: url,
					lastmod: lastmod,
					priority: itemPriority
				});
			}
		}
	}

	var buf = '<?xml version="1.0" encoding="UTF-8"?>' + os.EOL +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + os.EOL;

	var ident = '    ',
		ident2 = ident + ident,
		ident3 = ident2 + ident;
	for (var i = 0; i < urls.length; i++) {
		buf = buf + ident + '<url>' + os.EOL;
		buf = buf + ident2 + '<loc>' + urls[i].loc + '</loc>' + os.EOL;
		buf = buf + ident2 + '<lastmod>' + urls[i].lastmod + '</lastmod>' + os.EOL;
		buf = buf + ident2 + '<changefreq>' + changefreq + '</changefreq>' + os.EOL;
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
					// site name is case insensetive
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
		var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&item=fFolderGUID:' + folderId;

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

var _getSitePageFiles = function (request, localhost, site) {
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
		url += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName;

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
								return resolve(result);
							}
						}) // seo
					} else {
						return resolve(result);
					}
				}); // settings 
			} else {
				return resolve(result);
			}
		}); // site folder
	});
	return uploadPromise;
};

/**
 * Main entry
 * 
 */
var _createSiteMap = function (server, request, localhost, site, siteUrl, changefreq, publish, siteMapFile, done) {
	var siteInfo, defaultLanguage, siteChannelId, siteChannelToken, siteRepositoryId;
	var repository;
	var siteStructure, pages, pageData = [];
	var pageContent = [];
	var pageIndex;

	//
	// Get site info
	//
	var siteInfoPromise = _getSiteInfoFile(request, localhost, site);
	siteInfoPromise.then(function (result) {
		if (result.err) {
			_cmdEnd(done);
			return;
		}

		siteInfo = result.base.properties;
		defaultLanguage = siteInfo.defaultLanguage;
		siteRepositoryId = siteInfo.repositoryId;
		siteChannelId = siteInfo.channelId;
		siteChannelToken = _getSiteChannelToken(siteInfo);
		console.log(' - site: ' + site + ', default language: ' + defaultLanguage + ', channel token: ' + siteChannelToken);

		//
		// Get repository 
		// 
		var repositoryPromise = _getRepository(request, localhost, siteRepositoryId);
		repositoryPromise.then(function (result) {
			if (result.err) {
				_cmdEnd(done);
				return;
			}
			repository = result;
			console.log(' - query site repository');


			// 
			// Get site structure
			//
			var siteStructurePromise = _getSiteStructure(request, localhost, site);
			siteStructurePromise.then(function (result) {
				if (result.err) {
					_cmdEnd(done);
					return;
				}
				siteStructure = result;
				console.log(' - query site structure');
				pages = siteStructure && siteStructure.base && siteStructure.base.pages;
				if (!pages || pages.length === 0) {
					console.log('ERROR: no page found');
					_cmdEnd(done);
				}

				var sitePageFilesPromise = _getSitePageFiles(request, localhost, site);
				sitePageFilesPromise.then(function (result) {
					var pageFiles = result.files || [];
					if (!pageFiles || pageFiles.length === 0) {
						console.log('WARNING: failed to get page files');
					}

					//
					// Get page data for all pages
					//
					var pageDataPromise = _getPageDataPromise(request, localhost, site, pages);
					Promise.all(pageDataPromise).then(function (values) {
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

						//
						// Get all content types on the pages
						//
						var contentTypes = _getPageContentTypes(pageData);
						var usedContentTypes = [];
						var contentTypesPromise = [];
						if (contentTypes.length > 0) {
							for (var i = 0; i < contentTypes.length; i++) {
								contentTypesPromise.push(serverUtils.getContentTypeFromServer(server, contentTypes[i]));
							}
						}

						if (contentTypesPromise.length > 0) {
							Promise.all(contentTypesPromise).then(function (values) {
								console.log(' - content types used in the site: ' + contentTypes);
								contentTypes = values;
								// console.log(contentTypes);

								//
								// Get content ids on the pages
								//
								var pageContentIds = _getPageContentItemIds(pageData);
								// console.log(pageContentIds);

								//
								// Get content list queries on the pages
								//
								var pageContentListQueries = _getPageContentListQuery(pageData);
								// console.log(pageContentListQueries);

								//
								// Get content items on the pages
								//
								var pageContentPromise = _getPageContentPromise(request, localhost, server, siteChannelToken, pageContentIds, pageContentListQueries);
								if (pageContentPromise && pageContentPromise.length > 0) {
									Promise.all(pageContentPromise).then(function (values) {
										console.log(' - query content on the pages');
										var items = [];
										for (var i = 0; i < values.length; i++) {
											items = items.concat(values[i]);
										}
										_generateSiteMapXML(siteUrl, siteInfo, pages, pageFiles, items, changefreq, siteMapFile);
										if (publish) {
											// Upload site map to the server
											var uploadPromise = _uploadSiteMapToServer(request, localhost, site, siteMapFile);
											uploadPromise.then(function (result) {
												console.log(' - site map published');
												_cmdEnd(done);
											});
										} else {
											_cmdEnd(done);
										}
									});
								}
							});
						} else {
							// No content on the pages
							console.log(' - no content on the pages');
							var items = [];
							_generateSiteMapXML(siteUrl, siteInfo, pages, pageFiles, items, changefreq, siteMapFile);
							if (publish) {
								// Upload site map to the server
								var uploadPromise = _uploadSiteMapToServer(request, localhost, site, siteMapFile);
								uploadPromise.then(function (result) {
									console.log(' - site map published');
									_cmdEnd(done);
								});
							} else {
								_cmdEnd(done);
							}
						}

					}); // page data

				}); // site page files

			}); // site structure

		}); // repository

	}); // site info
};

/////////////////////////////////////////////////////////////////////
//
// Tasks
//
////////////////////////////////////////////////////////////////////


module.exports.createSiteMap = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
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
	var changefreqValues = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
	if (!changefreqValues.includes(changefreq)) {
		console.error('ERROR: invalid changefreq ' + changefreq + '. Valid values are: ' + changefreqValues);
		done();
		return;
	}

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

	var isPod = server.env === 'pod_ec';
	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
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

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
				};
				var auth = isPod ? {
					bearer: server.oauthtoken
				} : {
					user: server.username,
					password: server.password
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
					folderId = params.folderId;
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
					'auth': {
						bearer: server.oauthtoken
					},
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

		var localServer = app.listen(port, function () {
			var total = 0;
			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						console.log(' - establish user session');
						var csrfTokenPromise = _getCSRFToken(server, request);
						csrfTokenPromise.then(function (result) {
							var csrfToken = result && result.token;
							if (!csrfToken) {
								console.log('ERROR: Failed to get CSRF token');
								_cmdEnd(done);
							}
							console.log(' - get CSRF token');
							_CSRFToken = csrfToken;

							_createSiteMap(server, request, localhost, site, siteUrl, changefreq, publish, siteMapFile, done);
						});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_cmdEnd(done);
					}
				});
			}, 6000);

		});

	}); // login
};