/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	path = require('path'),
	btoa = require('btoa'),
	serverUtils = require('../test/server/serverUtils.js');

var projectDir = path.join(__dirname, "..");


//
// Private functions
//

var _indexSiteEnd = function (done) {
	done();
	process.exit(0);
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
				if (data.LocalData && data.LocalData.StatusCode === '-32') {
					console.log('ERROR: site ' + site + ' does not exist');
					return resolve({
						'err': 'site does not exist'
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
				if (data.LocalData && data.LocalData.StatusCode === '-32') {
					console.log('ERROR: site ' + site + ' does not exist');
					return resolve({
						'err': 'site does not exist'
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

var _getContentTypeFields = function (request, localhost, contenttype) {
	var fieldsPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/types/' + contenttype;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get fields for content type ' + contenttype);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: Failed to get fields for content type ' + contenttype);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return fieldsPromise;
};

var _validatePageIndexFields = function (done, contenttype, result) {
	var fields = result && result.fields;
	if (!fields || fields.length === 0) {
		console.log('ERROR: content type ' + contenttype + ' has no field');
		_indexSiteEnd(done);
	}
	// Require fields: site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords
	var site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name === 'site') {
			site = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field site should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'pageid') {
			pageid = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pageid should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'pagename') {
			pagename = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pagename should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'pageurl') {
			pageurl = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pageurl should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'pagetitle') {
			pagetitle = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pagetitle should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'pagedescription') {
			pagedescription = true;
			if (fields[i].datatype !== 'text' && fields[i].datatype !== 'largetext') {
				console.log('ERROR: field pagedescription should be text');
				_indexSiteEnd(done);
			}
		} else if (fields[i].name === 'keywords') {
			keywords = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field keywords should be text');
				_indexSiteEnd(done);
			}
			if (fields[i].valuecount !== 'list') {
				console.log('ERROR: field keywords should allow multiple values');
				_indexSiteEnd(done);
			}
		}
	}
	if (!site) {
		console.log('ERROR: field site is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!pageid) {
		console.log('ERROR: field pageid is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!pagename) {
		console.log('ERROR: field pagename is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!pageurl) {
		console.log('ERROR: field pageurl is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!pagetitle) {
		console.log('ERROR: field pagetitle is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!pagedescription) {
		console.log('ERROR: field pagedescription is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
	if (!keywords) {
		console.log('ERROR: field keywords is missing from type ' + contenttype);
		_indexSiteEnd(done);
	}
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
var _getPageContentListQuery = function (pageData, contenttype) {
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
				// Skip the page index content type 
				if (type !== contenttype) {
					var str = _getContentListQueryString(type, limit, offset, orderBy);
					pageContentListQueries.push({
						pageId: pageId,
						type: type,
						queryString: str
					});
				}
			}
		});
	}
	return pageContentListQueries;
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
 * 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} contentIds 
 */
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

/**
 * 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} pageContentIds 
 */
var _getPageContentPromise = function (request, localhost, server, channelToken, pageContentIds, pageContentListQueries) {
	var promises = [];
	var limit = 30;
	var num = 0;
	var q = '';

	// Content items queries
	for (var i = 0; i < pageContentIds.length; i++) {
		for (var j = 0; j < pageContentIds[i].contentIds.length; j++) {
			if (q) {
				q += ' or ';
			}
			q += 'id eq "' + pageContentIds[i].contentIds[j] + '"';

			num += 1;
			if (num >= limit && (num % limit === 0)) {
				q = '(' + q + ')';
				promises.push(_getPageContent(request, localhost, channelToken, q, '__mixed', 'item'));

				// another batch
				q = '';
			}
		}
	}
	if (q) {
		q = '(' + q + ')';
		promises.push(_getPageContent(request, localhost, channelToken, q, '__mixed', 'item'));
	}

	// Content list queries
	for (var i = 0; i < pageContentListQueries.length; i++) {
		promises.push(_getPageContent(request, localhost, channelToken, pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, 'list'));
	}

	return promises;
};


/**
 * 
 * @param {*} pageData 
 * @param {*} items The query result in the form of [{pageId: <page id>, data: <item data>}, {}, ...]
 */
var _assignPageContent = function (pageData, pageContentIds, items) {
	var pageContent = [];
	var i, j, pageId, pageItems;

	// Assign content item query result
	for (i = 0; i < pageContentIds.length; i++) {
		pageId = pageContentIds[i].id;
		pageItems = [];
		for (j = 0; j < pageContentIds[i].contentIds.length; j++) {
			for (var k = 0; k < items.length; k++) {
				if (items[k].pageId === '__mixed') {
					for (var l = 0; l < items[k].data.length; l++) {
						if (pageContentIds[i].contentIds[j] === items[k].data[l].id) {
							pageItems.push(items[k].data[l]);
						}
					}
				}
			}
		}
		if (pageItems.length > 0) {
			pageContent.push({
				id: pageId,
				content: pageItems
			});
		}
	}

	// Assign content list query result
	for (i = 0; i < pageData.length; i++) {
		pageId = pageData[i].id;
		pageItems = [];
		for (j = 0; j < items.length; j++) {
			if (pageId === items[j].pageId) {
				pageItems = pageItems.concat(items[j].data);
				// console.log('page: ' + pageId + ' added items ' + items[j].data.length);
			}
		}
		if (pageItems.length > 0) {
			pageContent.push({
				id: pageId,
				content: pageItems
			});
		}
	}

	return pageContent;
};

/**
 * 
 * @param {*} contentTypes 
 */
var _getTypeTextFields = function (contentTypes) {
	var textFields = [];
	if (!contentTypes || contentTypes.length === 0) {
		return textFields;
	}

	contentTypes.forEach(function (type) {
		var typeName = type.name;
		var fields = type.fields;
		if (fields && fields.length > 0) {
			fields.forEach(function (field) {
				if (field.datatype === 'text' || field.datatype === 'largetext') {
					textFields.push(typeName + '.' + field.name);
				}
			});
		}
	});
	return textFields;
};

/**
 * 
 * @param {*} siteInfo 
 */
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

var _getParagraphText = function (comp) {
	return (comp && comp.data && comp.data.userText ? comp.data.userText : '');
};

var _getTitleText = function (comp) {
	return (comp && comp.data && comp.data.userText ? comp.data.userText : '');
};

var _getInlineTextText = function (comp) {
	var str = (comp && comp.data && comp.data.userText ? comp.data.innerHTML : '');
	console.log('inline text: ' + str);
	return str;
};

var _getButtonText = function (comp, sep) {
	var buf = [];
	if (comp && comp.data) {
		if (comp.data.text) {
			buf.push(comp.data.text);
		}
		if (comp.data.title) {
			buf.push(comp.data.title);
		}
	}
	return buf.join(sep);
};

var _getImageText = function (comp, sep) {
	var buf = [];
	if (comp && comp.data) {
		if (comp.data.altText) {
			buf.push(comp.data.altText);
		}
		if (comp.data.title) {
			buf.push(comp.data.title);
		}
		if (comp.data.description) {
			buf.push(comp.data.description);
		}
	}
	return buf.join(sep);
};

var _getGalleryText = function (comp, sep) {
	var buf = [];
	if (comp && comp.data && comp.data.images && comp.data.images.length > 0) {
		comp.data.images.forEach(function (image) {
			if (image.altText) {
				buf.push(image.altText);
			}
			if (image.description) {
				buf.push(image.description);
			}
			if (image.title) {
				buf.push(image.title);
			}
		});
	}
	return buf.join(sep);
};

var _stripHTMLTags = function (str) {
	var newStr = '';
	if (str) {
		newStr = str.toString();
		newStr = newStr.replace(/<[^>]*>/g, '');
		newStr = serverUtils.replaceAll(newStr, '&nbsp;', ' ');
		newStr = serverUtils.replaceAll(newStr, '&ldquo;', ' ');
		newStr = serverUtils.replaceAll(newStr, '&rdquo;', ' ');
		newStr = serverUtils.replaceAll(newStr, '\n', ' ');
	}
	return newStr;
}

/**
 * Return an array of strings and each string is no more than 2000 characters
 * @param {*} keywords 
 */
var _addKeywords = function (strings) {
	var limit = 2000 - 10;
	var keywords = [];
	if (strings) {
		var newStrings = _stripHTMLTags(strings);
		var buf = newStrings.split(' ');
		var row = '';
		for (var i = 0; i < buf.length; i++) {
			var tmp = Buffer.from(row + buf[i]);
			if (tmp.length > limit) {
				keywords.push(row);
				row = '';
			}
			if (row) {
				row = row + ' ';
			}
			row = row + buf[i];
		}
		if (row) {
			keywords.push(row);
		}
		// console.log(' ****    strings: ' + strings);
		// console.log(' %%%% newStrings: ' + newStrings);
	}

	// console.log(keywords);
	return keywords;
};

/**
 * 
 * @param {*} pages
 * @param {*} pageData 
 */
var _generatePageIndex = function (site, pages, pageData, pageContent, typeTextFields) {
	var pageIndex = [];

	var getPageStructure = function (id) {
		var obj;
		for (var i = 0; i < pages.length; i++) {
			if (Number(pages[i].id) === Number(id)) {
				obj = pages[i];
				break;
			}
		}
		return obj;
	};
	var sep = ' ';
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i].id;
		var pageTitle = pageData[i].data.properties.title || ' ';
		var pageDescription = pageData[i].data.properties.pageDescription || ' ';
		var pageStructure = getPageStructure(pageId);
		var pageName = pageStructure ? pageStructure.name : '';
		var pageUrl = pageStructure ? pageStructure.pageUrl : '';
		// console.log('page title=' + pageTitle + ' description=' + pageDescription);

		var componentInstances = pageData[i].data.componentInstances;
		var compKeywords = [];
		//
		// Go through all components on the page
		if (componentInstances) {
			Object.keys(componentInstances).forEach(key => {
				var comp = componentInstances[key];
				if (comp.type === 'scs-paragraph') {
					compKeywords.push(_getParagraphText(comp));
				} else if (comp.type === 'scs-title') {
					compKeywords.push(_getTitleText(comp));
				} else if (comp.type === 'scs-button') {
					compKeywords.push(_getButtonText(comp, sep));
				} else if (comp.type === 'scs-inline-text') {
					compKeywords.push(_getInlineTextText(comp, sep));
				} else if (comp.type === 'scs-image') {
					compKeywords.push(_getImageText(comp, sep));
				} else if (comp.type === 'scs-gallery') {
					compKeywords.push(_getGalleryText(comp, sep));
				}
			});
		}
		// console.log('Page: ' + pageName + ' Comp keywords: ' + compKeywords);
		var keywords = _addKeywords(compKeywords.join(sep));
		// console.log(' - page ' + pageName + ': index components');

		// Go through all content items on the page

		var items = [];
		for (var j = 0; j < pageContent.length; j++) {
			if (pageContent[j].id === pageId) {
				items = items.concat(pageContent[j].content);
			}
		}

		if (items.length > 0) {
			var itemKeywords = [];
			items.forEach(function (item) {
				if (item.name) {
					itemKeywords.push(item.name);
				}
				if (item.description) {
					itemKeywords.push(item.description);
				}
				var type = item.type;
				var fields = item.fields;
				Object.keys(fields).forEach(key => {
					if (typeTextFields.includes(type + '.' + key)) {
						var value = fields[key];
						if (value) {
							itemKeywords.push(value.toString());
						}
					}
				});
			});
			if (itemKeywords.length > 0) {
				keywords = keywords.concat(_addKeywords(itemKeywords.join(sep)));
				// console.log(' - page ' + pageName + ': index content items');
			}
		}

		pageIndex.push({
			site: site,
			pageid: pageId,
			pagename: pageName,
			pageurl: pageUrl,
			pagetitle: pageTitle,
			pagedescription: pageDescription,
			keywords: keywords
		});
	}
	// console.log(pageIndex);
	return pageIndex;
};

var _getPageIndexItem = function (request, localhost, channelToken, contenttype) {
	var pageIndexItemPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?fields=ALL&limit=9999';
		url = url + '&q=((type eq "' + contenttype + '"))&channelToken=' + channelToken;
		// console.log(url);
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get page index');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (!response || response.statusCode !== 200) {
				console.log('ERROR: Failed to get page index: ' + (response ? response.statusCode : ''));
				return resolve({
					'err': (response ? response.statusCode : 'error')
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get page index');
					return resolve({
						'err': 'error'
					});
				}
				resolve(data.items);
			} catch (error) {
				console.log('ERROR: Failed to get page index');
				return resolve({
					'err': 'error'
				});
			}
		});
	});

	return pageIndexItemPromise;
};

var _timeUsed = function (start, end) {
	var timeDiff = end - start; //in ms
	// strip the ms
	timeDiff /= 1000;

	// get seconds 
	var seconds = Math.round(timeDiff);
	return seconds.toString() + 's';
};

var _createPageIndexItem = function (request, localhost, defaultLanguage, repositoryId, contenttype, pageIndexDataIndex) {
	var createPageIndexPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?dataIndex=' + pageIndexDataIndex;
		url = url + '&repositoryId=' + repositoryId + '&contenttype=' + contenttype + '&defaultLanguage=' + defaultLanguage;
		var pageName = _pageIndexToCreate[pageIndexDataIndex].pagename;
		var startTime = new Date();
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create page index item for page ' + pageName);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var endTime = new Date();
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				console.log(' - create page index item for ' + pageName);
				resolve(data);
			} else {
				console.log('ERROR: Failed to create page index item for page ' + pageName);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return createPageIndexPromise;
};

var _addPageIndexItemToChannel = function (request, localhost, channelId, itemId, itemName) {
	var addItemToChannelPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?channelId=' + channelId + '&itemId=' + itemId;
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to add page index item ' + itemName + ' to site channel');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var endTime = new Date();
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				console.log(' - add page index item ' + itemName + ' to site channel');
				resolve(data);
			} else {
				console.log('ERROR: Failed to add page index item ' + itemName + ' to site channel');
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return addItemToChannelPromise;
};

var _updatePageIndexItem = function (request, localhost, pageIndexDataIndex) {
	var updatePageIndexPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?dataIndex=' + pageIndexDataIndex;
		var pageName = _pageIndexToUpdate[pageIndexDataIndex].fields.pagename;
		request.put(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to update page index item for page' + pageName);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var endTime = new Date();
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				console.log(' - update page index item for page ' + pageName);
				resolve(data);
			} else {
				console.log('ERROR: Failed to update page index item for page ' + pageName);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return updatePageIndexPromise;
};

/**
 * Global variable used by the node server
 */
var _CSRFToken = '';
var _pageIndexToUpdate = [];
var _pageIndexToCreate = [];
var _itemIds = [];

/**
 * Create or update page index for the site on the server
 * 
 * @param {*} siteChannelToken 
 * @param {*} pageIndex 
 */
var _indexSiteOnServer = function (request, localhost, siteInfo, siteChannelId, siteChannelToken, contenttype, pageIndex) {
	var indexSiteOnServerPromise = new Promise(function (resolve, reject) {
		//
		// Get the existing page index for the site
		//
		var pageIndexPromise = _getPageIndexItem(request, localhost, siteChannelToken, contenttype);
		pageIndexPromise.then(function (existingPageIndex) {
			// console.log('Existing page index:');
			// console.log(existingPageIndex.length);

			_pageIndexToCreate = [];
			for (var i = 0; i < pageIndex.length; i++) {
				var found = false;
				for (var j = 0; j < existingPageIndex.length; j++) {
					var fields = existingPageIndex[j].fields;
					if (fields && pageIndex[i].site === fields.site && pageIndex[i].pageid === fields.pageid) {
						found = true;
						break;
					}
				}
				if (!found) {
					_pageIndexToCreate.push(pageIndex[i]);
				}
			}

			_pageIndexToUpdate = [];
			for (var j = 0; j < existingPageIndex.length; j++) {
				var found = false;
				var item = existingPageIndex[j];
				var fields = item.fields;
				for (var i = 0; i < pageIndex.length; i++) {
					if (fields && pageIndex[i].site === fields.site && pageIndex[i].pageid === fields.pageid) {
						found = true;
						break;
					}
				}

				if (found) {
					// Update item with newly generated page index
					item.fields = pageIndex[i];
					_pageIndexToUpdate.push(item);
				}
			}
			console.log(' - will create ' + _pageIndexToCreate.length + ' PageIndex items');
			console.log(' - will update ' + _pageIndexToUpdate.length + ' PageIndex items');

			var createNewPageIndexPromise = [];
			var updateExistingPageIndexPromise = [];

			for (var i = 0; i < _pageIndexToCreate.length; i++) {
				createNewPageIndexPromise.push(
					_createPageIndexItem(request, localhost, siteInfo.defaultLanguage, siteInfo.repositoryId, contenttype, i)
				);
			}

			for (var i = 0; i < _pageIndexToUpdate.length; i++) {
				updateExistingPageIndexPromise.push(
					_updatePageIndexItem(request, localhost, i)
				);
			}

			if (createNewPageIndexPromise.length > 0) {
				Promise.all(createNewPageIndexPromise).then(function (values) {
					// items created
					var addItemToChannelPromise = [];
					if (values && values.length > 0) {
						for (var i = 0; i < values.length; i++) {
							// Save the item id for publish
							_itemIds.push(values[i].id);

							addItemToChannelPromise.push(
								_addPageIndexItemToChannel(request, localhost, siteChannelId, values[i].id, values[i].name)
							);
						}
					} else {
						resolve({});
					}

					// Add items to the site channel
					Promise.all(addItemToChannelPromise).then(function (addToChannelValues) {
						// Update items if needed
						if (updateExistingPageIndexPromise.length > 0) {
							Promise.all(updateExistingPageIndexPromise).then(function (values) {
								for (var i = 0; i < values.length; i++) {
									// Save the item id for publish
									_itemIds.push(values[i].id);
								}
								// items updated, all done
								resolve({});
							});
						} else {
							resolve({});
						}
					});
				});
			} else if (updateExistingPageIndexPromise.length > 0) {
				Promise.all(updateExistingPageIndexPromise).then(function (values) {
					for (var i = 0; i < values.length; i++) {
						// Save the item id for publish
						_itemIds.push(values[i].id);
					}
					// items updated
					resolve({});
				});
			}
		});

	});
	return indexSiteOnServerPromise;
};

var _publishItems = function (request, localhost, channelId) {
	var publishItemPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/jobs/publishjobs';
		url = url + '?channelId=' + channelId;
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create publish job');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			if (response && (response.statusCode === 200 || response.statusCode === 202)) {
				var data = JSON.parse(body);
				console.log(' - publish job submitted');
				resolve(data);
			} else {
				console.log('ERROR: Failed to create publish job');
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return publishItemPromise;
};

var _getPublishJobStatus = function (request, localhost, jobId) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/jobs/publishjobs/' + jobId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get publish job status');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				// console.log(' - publish page index items finished');
				resolve(data);
			} else {
				console.log('ERROR: Failed to get publish job status');
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return jobPromise;
};

var _publishPageIndexItems = function (request, localhost, channelId, done) {
	if (_itemIds.length === 0) {
		console.log(' - no item to publish');
		_indexSiteEnd(done);
		return;
	}

	var publishItemsPromise = _publishItems(request, localhost, channelId);
	publishItemsPromise.then(function (result) {
		if (result.err) {
			_indexSiteEnd(done);
			return;
		}
		var jobId = result.jobId;
		// console.log(jobId);
		var inter = setInterval(function () {
			var jobPromise = _getPublishJobStatus(request, localhost, jobId);
			jobPromise.then(function (result) {
				if (result.err) {
					clearInterval(inter);
					_indexSiteEnd(done);
					return;
				}
				// console.log(result.status);
				if (result.status === 'success') {
					clearInterval(inter);
					console.log(' - publish page index items finished');
					_indexSiteEnd(done);
					return;
				} else {
					console.log(' - publish ' + result.message.toLowerCase());
				}
			});
		}, 5000);
	});
};

var _indexSite = function (server, request, localhost, site, contenttype, publish, done) {

	var siteInfo, defaultLanguage, siteChannelId, siteChannelToken, siteRepositoryId;
	var repository;
	var siteStructure, pages, pageData = [];
	var pageContent = [];
	var pageIndex;

	//
	// Get site info
	var siteInfoPromise = _getSiteInfoFile(request, localhost, site);
	siteInfoPromise.then(function (result) {
		if (result.err) {
			_indexSiteEnd(done);
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
				_indexSiteEnd(done);
				return;
			}
			repository = result;
			console.log(' - query site repository');

			//
			// Get content type
			//
			var pageIndexPromise = serverUtils.getContentTypeFromServer(server, contenttype);
			pageIndexPromise.then(function (result) {
				if (result.err) {
					console.log('ERROR: ' + result.err);
					_indexSiteEnd(done);
				}
				console.log(' - query content type ' + contenttype);
				var repsotiroyContentTypes = repository && repository.contentTypes;
				var pageIndexInRepository = false;
				if (repsotiroyContentTypes) {
					for (var i = 0; i < repsotiroyContentTypes.length; i++) {
						if (repsotiroyContentTypes[i].name === contenttype) {
							pageIndexInRepository = true;
							break;
						}
					}
				}
				if (!pageIndexInRepository) {
					console.log('ERROR: content type ' + contenttype + ' is not in repository ' + repository.name);
					_indexSiteEnd(done);
					return;
				}

				//
				// Get page index fields
				//
				var pageIndexFieldsPromise = _getContentTypeFields(request, localhost, contenttype);
				pageIndexFieldsPromise.then(function (result) {
					if (result.err) {
						_indexSiteEnd(done);
					}
					_validatePageIndexFields(done, contenttype, result);

					// 
					// Get site structure
					//
					var siteStructurePromise = _getSiteStructure(request, localhost, site);
					siteStructurePromise.then(function (result) {
						if (result.err) {
							_indexSiteEnd(done);
							return;
						}
						siteStructure = result;
						console.log(' - query site structure');
						pages = siteStructure && siteStructure.base && siteStructure.base.pages;
						if (!pages || pages.length === 0) {
							console.log('ERROR: no page found');
							_indexSiteEnd(done);
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
									if (contentTypes[i] !== contenttype) {
										usedContentTypes.push(contentTypes[i]);
										contentTypesPromise.push(serverUtils.getContentTypeFromServer(server, contentTypes[i]));
									}
								}
							}

							if (contentTypesPromise.length > 0) {
								Promise.all(contentTypesPromise).then(function (values) {
									console.log(' - content types used in the site: ' + usedContentTypes);
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
									var pageContentListQueries = _getPageContentListQuery(pageData, contenttype);
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

											pageContent = _assignPageContent(pageData, pageContentIds, items);
											// console.log(pageContent);

											var typeTextFields = _getTypeTextFields(contentTypes);

											pageIndex = _generatePageIndex(site, pages, pageData, pageContent, typeTextFields);
											// console.log(pageIndex);
											var indexSiteOnServerPromise = _indexSiteOnServer(request, localhost, siteInfo, siteChannelId, siteChannelToken, contenttype, pageIndex);
											indexSiteOnServerPromise.then(function (values) {
												//
												// page index items created/updated on the server
												//
												if (publish) {
													_publishPageIndexItems(request, localhost, siteChannelId, done);
												} else {
													_indexSiteEnd(done);
												}
											});
										});
									}
								});
							} else {
								// No content on the pages
								console.log(' - no content on the pages');
								pageIndex = _generatePageIndex(site, pages, pageData, pageContent);
								var indexSiteOnServerPromise = _indexSiteOnServer(request, localhost, siteInfo, siteChannelId, siteChannelToken, contenttype, pageIndex);
								indexSiteOnServerPromise.then(function (values) {
									if (publish) {
										_publishPageIndexItems(request, localhost, siteChannelId, done);
									} else {
										_indexSiteEnd(done);
									}
								});
							}

						}); // page data

					}); // site structure

				}); // validate type fields

			}); // PageIndex type

		}); // repository

	}); // site info
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

//
// Tasks
//

/**
 * Index site pages
 */
module.exports.indexSite = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}

	var site = argv.site,
		contenttype = argv.contenttype;

	if (!site && !contenttype) {
		console.error('ERROR: please run as npm run index-site -- --site <site name> --contenttype <content type name>');
		done();
		return;
	}
	if (!site) {
		console.error('ERROR: please use --site to specify the site');
		done();
		return;
	}
	if (!contenttype) {
		console.error('ERROR: please use --contenttype to specify the content type');
		done();
		return;
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

		var port = '9191';
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
				console.log('ERROR: request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});
		app.post('/content/management/api/v1.1/items', function (req, res) {
			// console.log('POST: ' + req.url);
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var defaultLanguage = params.defaultLanguage;
			var repositoryId = params.repositoryId;
			var contenttype = params.contenttype;
			var dataIndex = params.dataIndex;
			if (repositoryId && contenttype && dataIndex && dataIndex >= 0 && dataIndex < _pageIndexToCreate.length) {
				var url = server.url + '/content/management/api/v1.1/items';
				var indexData = _pageIndexToCreate[dataIndex];
				var itemName = indexData.site + indexData.pagename + indexData.pageid;
				var itemDesc = 'Page index for ' + itemName;
				var formData = {
					name: itemName,
					description: itemDesc,
					type: contenttype,
					language: defaultLanguage,
					translatable: true,
					repositoryId: repositoryId,
					fields: indexData
				};
				var formDataStr = JSON.stringify(formData);
				var auth = {
					user: server.username,
					password: server.password
				};
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': _CSRFToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formDataStr
				};
				// console.log(formDataStr);
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - create item finished: ' + itemName);
						res.end();
					});
			} else {
				console.log('ERROR: invalid parameters to create content item: ' + params);
				res.write({});
				res.end();
			}
		});
		app.post('/content/management/api/v1.1/bulkItemsOperations', function (req, res) {
			// console.log('POST: ' + req.url);
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var channelId = params.channelId;
			var itemId = params.itemId;
			if (channelId && itemId) {
				var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';
				var formData = {
					q: 'id eq "' + itemId + '"',
					operations: {
						addChannels: {
							channels: [{
								id: channelId
							}]
						}
					}
				};
				var formDataStr = JSON.stringify(formData);
				var auth = {
					user: server.username,
					password: server.password
				};
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': _CSRFToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formDataStr
				};
				// console.log(formDataStr);
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - add item to site channel finished: ' + itemId);
						res.end();
					});
			} else {
				console.log('ERROR: invalid parameters to add content item to site channel: ' + params);
				res.write({});
				res.end();
			}
		});
		app.put('/content/management/api/v1.1/items', function (req, res) {
			// console.log('PUT: ' + req.url);
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var dataIndex = params.dataIndex;
			if (dataIndex && dataIndex >= 0 && dataIndex < _pageIndexToUpdate.length) {
				var indexData = _pageIndexToUpdate[dataIndex];
				var id = indexData.id;
				var itemName = indexData.name;
				var url = server.url + '/content/management/api/v1.1/items/' + id + '?expand=all';
				var formDataStr = JSON.stringify(indexData);
				var auth = {
					user: server.username,
					password: server.password
				};
				var postData = {
					method: 'PUT',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': _CSRFToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formDataStr
				};
				// console.log(formDataStr);
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - update item finished: ' + itemName);
						res.end();
					});
			} else {
				console.log('ERROR: invalid parameters to update content item: ' + params);
				res.write({});
				res.end();
			}
		});
		app.post('/content/management/api/v1.1/jobs/publishjobs', function (req, res) {
			// console.log('POST: ' + req.url);
			var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
			var channelId = params.channelId;
			if (channelId && _itemIds.length > 0) {
				var url = server.url + '/content/management/api/v1.1/jobs/publishjobs';
				var ids = [];
				for (var i = 0; i < _itemIds.length; i++) {
					ids.push({
						id: _itemIds[i]
					});
				}
				var formData = {
					jobType: 'publish',
					channels: [{
						id: channelId
					}],
					ids: ids
				};
				var formDataStr = JSON.stringify(formData);
				var auth = {
					user: server.username,
					password: server.password
				};
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': _CSRFToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formDataStr
				};
				// console.log(formDataStr);
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						res.end();
					});
			} else {
				console.log('ERROR: invalid parameters to publish items: ' + params);
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
								_indexSiteEnd(done);
							}
							console.log(' - get CSRF token');
							_CSRFToken = csrfToken;
							_indexSite(server, request, localhost, site, contenttype, publish, done);
						});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_indexSiteEnd(done);
					}
				});
			}, 6000);

		});

	});
};
