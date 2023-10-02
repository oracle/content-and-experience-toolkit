/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var he = require('he'),
	fs = require('fs'),
	os = require('os'),
	path = require('path'),
	readline = require('readline'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var projectDir,
	serversSrcDir;

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

var _indexSiteEnd = function (done, success) {
	if (success) {
		console.log(' - index site finished');
	}
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

var _validatePageIndexFields = function (contenttype, result) {
	var fields = result && result.fields;
	if (!fields || fields.length === 0) {
		console.error('ERROR: content type ' + contenttype + ' has no field');
		return false;
	}
	// Require fields: site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords
	var site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name === 'site') {
			site = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field site should be text');
				return false;
			}
		} else if (fields[i].name === 'pageid') {
			pageid = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field pageid should be text');
				return false;
			}
		} else if (fields[i].name === 'pagename') {
			pagename = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field pagename should be text');
				return false;
			}
		} else if (fields[i].name === 'pageurl') {
			pageurl = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field pageurl should be text');
				return false;
			}
		} else if (fields[i].name === 'pagetitle') {
			pagetitle = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field pagetitle should be text');
				return false;
			}
		} else if (fields[i].name === 'pagedescription') {
			pagedescription = true;
			if (fields[i].datatype !== 'text' && fields[i].datatype !== 'largetext') {
				console.error('ERROR: field pagedescription should be text');
				return false;
			}
		} else if (fields[i].name === 'keywords') {
			keywords = true;
			if (fields[i].datatype !== 'text') {
				console.error('ERROR: field keywords should be text');
				return false;
			}
			if (fields[i].valuecount !== 'list') {
				console.error('ERROR: field keywords should allow multiple values');
				return false;
			}
		}
	}
	if (!site) {
		console.error('ERROR: field site is missing from type ' + contenttype);
		return false;
	}
	if (!pageid) {
		console.error('ERROR: field pageid is missing from type ' + contenttype);
		return false;
	}
	if (!pagename) {
		console.error('ERROR: field pagename is missing from type ' + contenttype);
		return false;
	}
	if (!pageurl) {
		console.error('ERROR: field pageurl is missing from type ' + contenttype);
		return false;
	}
	if (!pagetitle) {
		console.error('ERROR: field pagetitle is missing from type ' + contenttype);
		return false;
	}
	if (!pagedescription) {
		console.error('ERROR: field pagedescription is missing from type ' + contenttype);
		return false;
	}
	if (!keywords) {
		console.error('ERROR: field keywords is missing from type ' + contenttype);
		return false;
	}

	return true;
};


/**
 * Get an array of promises to get the page data for all site pages
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
		var auth = serverUtils.getRequestAuth(server);
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
					readline.cursorTo(process.stdout, 0);
				}
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

var _getContentListQueryString = function (type, limit, offset, orderBy, queryString, locale) {
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
		q = 'type eq "' + type + '"';
		if (queryString) {
			q = q + ' and (' + queryString + ')';
		}
		if (locale) {
			q = q + ' and (language eq "' + locale + '" or translatable eq "false")';
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
var _getPageContentListQuery = function (pageData, contenttype, locale) {
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
				var queryString = data.queryString;
				// Skip the page index content type
				if (type !== contenttype) {
					var str = _getContentListQueryString(type, limit, offset, orderBy, queryString, locale);
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
 */
var _getPageContent = function (server, channelToken, q, pageId, queryType) {
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
				return resolve({
					'err': err
				});
			}
			if (!response || response.statusCode !== 200) {
				console.error('ERROR: Failed to get content: page: ' + pageId + ' status: ' + (response ? response.statusCode : '') + ' url: ' + url.replace(server.url, ''));
				return resolve({
					'err': (response ? response.statusCode : 'error')
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.error('ERROR: Failed to get content: page: ' + pageId + ' url: ' + url.replace(server.url, ''));
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
				console.error('ERROR: Failed to get page data');
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return pageContentPromise;

};

/**
 */
var _getPageContentPromise = function (server, channelToken, pageContentIds, locale) {
	var promises = [];
	var limit = 30;
	var num = 0;
	var q = '';

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
				if (locale) {
					q = '((' + q + ') and (language eq "' + locale + '"))';
				} else {
					q = '(' + q + ')';
				}

				promises.push(_getPageContent(server, channelToken, q, pageId, 'item'));

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
			promises.push(_getPageContent(server, channelToken, q, pageId, 'item'));
		}
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
					textFields.push({
						type: field.datatype,
						name: typeName + '.' + field.name
					});
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
	console.info('inline text: ' + str);
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
};

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

var _unescapeHTML = function (str) {
	try {
		return he.decode(str);
	} catch (e) {
		// console.log('WARNING: failed processing ' + str);
		// console.log(e);
		return str;
	}
};

/**
 *
 * @param {*} pages
 * @param {*} pageData
 */
var _generatePageIndex = function (site, pages, pageData, pageContent, typeTextFields) {
	var pageIndex = [];
	var sep = ' ';
	for (var i = 0; i < pageData.length; i++) {
		var pageId = pageData[i] && pageData[i].id;
		var masterPageData = _getMasterPageData(pageId);

		//
		// check if the page is hidden from search
		//
		var properties = masterPageData && masterPageData.properties;
		if (properties && !properties.noIndex) {
			var pageTitle = masterPageData && masterPageData.properties && masterPageData.properties.title || ' ';
			var pageDescription = masterPageData && masterPageData.properties && masterPageData.properties.pageDescription || ' ';
			var pageKeywords = masterPageData && masterPageData.properties && masterPageData.properties.keywords || ' ';
			var masterPage = _getPageFromMastrStructure(pageId);
			var pageName = masterPage ? masterPage.name : ' ';
			var pageUrl = masterPage ? masterPage.pageUrl : ' ';
			// console.log('page id=' + pageId + ' title=' + pageTitle + ' description=' + pageDescription + ' keywords=' + pageKeywords);

			var keywords = [];

			if (pageKeywords) {
				keywords = _addKeywords(pageKeywords);
			}

			var componentInstances = pageData[i].data.componentInstances;
			var masterComponentInstances = masterPageData.componentInstances;
			var compKeywords = [];
			//
			// Go through all components on the page
			if (componentInstances) {
				Object.keys(componentInstances).forEach(key => {
					var comp = componentInstances[key];
					var masterComp = masterComponentInstances[key];
					var comptype = comp.type || (masterComp && masterComp.type) || comp.id;
					if (comptype === 'scs-paragraph') {
						compKeywords.push(_getParagraphText(comp));
					} else if (comptype === 'scs-title') {
						compKeywords.push(_getTitleText(comp));
					} else if (comptype === 'scs-button') {
						compKeywords.push(_getButtonText(comp, sep));
					} else if (comptype === 'scs-inline-text') {
						compKeywords.push(_getInlineTextText(comp, sep));
					} else if (comptype === 'scs-image') {
						compKeywords.push(_getImageText(comp, sep));
					} else if (comptype === 'scs-gallery') {
						compKeywords.push(_getGalleryText(comp, sep));
					}
				});
			}
			// console.log('Page: id: ' + pageId + ' name: ' + pageName + ' Comp keywords: ' + compKeywords);
			keywords = keywords.concat(_addKeywords(compKeywords.join(sep)));
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
						var fieldName = type + '.' + key;
						for (var i = 0; i < typeTextFields.length; i++) {
							if (typeTextFields[i].name === fieldName) {
								var value = fields[key];
								if (value && typeTextFields[i].type === 'largetext') {
									// unescape richtext
									// console.log(value);
									value = _unescapeHTML(value);
								}
								if (value) {
									itemKeywords.push(value.toString());
								}
								break;
							}
						}
					});
				});
				// console.log('Page: id: ' + pageId + ' name: ' + pageName + ' item keywords: ' + itemKeywords);
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
		} else {
			console.info(' - page ' + pageId + ' is set hidden from search');
		}
	}
	// console.log(pageIndex);
	return pageIndex;
};


var _getPageIndexItem = function (server, channelToken, contenttype, locale) {
	return new Promise(function (resolve, reject) {

		var q;
		if (locale) {
			q = 'type eq "' + contenttype + '" and language eq "' + locale + '"';
		} else {
			q = 'type eq "' + contenttype + '"';
		}

		serverRest.queryItems({
			server: server,
			q: q,
			channelToken: channelToken
		})
			.then(function (result) {
				if (!result || result.err) {
					console.error('ERROR: Failed to get page index');
					return resolve({
						'err': 'error'
					});
				} else {
					resolve(result.data);
				}
			});
	});

};

var _timeUsed = function (start, end) {
	var timeDiff = end - start; //in ms
	// strip the ms
	timeDiff /= 1000;

	// get seconds
	var seconds = Math.round(timeDiff);
	return seconds.toString() + 's';
};

var _createPageIndexItem = function (server, repositoryId, contenttype, dataIndex, locale, isMaster) {
	return new Promise(function (resolve, reject) {
		// console.log(' - repositoryId: ' + repositoryId + ' contenttype: ' + contenttype + ' dataIndex: ' + dataIndex);
		if (repositoryId && contenttype && dataIndex >= 0 && dataIndex < _pageIndexToCreate.length) {
			var pageName = _pageIndexToCreate[dataIndex].pagename;
			var localemsg = isMaster ? '' : ' (' + locale + ')';

			var url = server.url + '/content/management/api/v1.1/items';
			var indexData = _pageIndexToCreate[dataIndex];
			var itemName = indexData.site + indexData.pagename + indexData.pageid;
			var itemDesc = 'Page index for ' + itemName;
			// the maximum length of item description is 128
			if (itemDesc.length > 128) {
				itemDesc = itemDesc.substring(0, 127);
			}
			var formData = {
				name: itemName,
				description: itemDesc,
				type: contenttype,
				language: locale,
				languageIsMaster: isMaster,
				translatable: true,
				repositoryId: repositoryId,
				fields: indexData
			};

			var masterid = _getItemMasterId(indexData, locale);
			if (!isMaster) {
				formData.sourceId = masterid;
			}

			var postData = {
				method: 'POST',
				url: url,
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': _CSRFToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				},
				body: JSON.stringify(formData),
				json: true
			};

			serverUtils.showRequestOptions(postData);

			var request = require('../test/server/requestUtils.js').request;
			request.post(postData, function (err, response, body) {
				if (err) {
					console.error('ERROR: Failed to create page index item for page ' + pageName + localemsg + ' (ecid: ' + response.ecid + ')');
					console.error(err);
					return resolve({
						err: 'err'
					});
				}

				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					data = body;
				}

				if (response && (response.statusCode === 200 || response.statusCode === 201)) {
					console.info(' - create page index item for ' + pageName + localemsg);
					return resolve(data);
				} else {
					var msg = data ? (data.detail || data.title) : response.statusMessage;
					console.error('ERROR: Failed to create page index item for page ' + pageName + localemsg + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
					return resolve({
						err: 'err'
					});
				}
			});
		} else {
			console.error('ERROR: invalid parameters to create content item');
			return resolve({
				err: 'err'
			});
		}
	});

};


var _itemPublishInfo = function (server, itemId, pageName) {
	var infoPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items/' + itemId + '/publishInfo';
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
				console.error('ERROR: Failed to get page index item publish info (' + pageName + ')');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				// handle invalid json
			}

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve({
					itemId: itemId,
					data: data && data.data
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get page index item publish info (' + pageName + ') : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return infoPromise;
};


var _unpublishPageIndexItems = function (server, itemIds, pageNames, locale, isMaster) {
	var unpublishPromise = new Promise(function (resolve, reject) {
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		// first check if the items are published
		var ifPublishedPromise = [];
		for (var i = 0; i < itemIds.length; i++) {
			ifPublishedPromise.push(_itemPublishInfo(server, itemIds[i], pageNames[i]));
		}
		var publishedItemIds = [];
		var publisedPageNames = [];
		Promise.all(ifPublishedPromise).then(function (values) {

			for (var i = 0; i < values.length; i++) {
				var id = values[i].itemId;
				var data = values[i].data;
				for (var j = 0; j < data.length; j++) {
					if (data[j].channel === _SiteInfo.channelId && itemIds.indexOf(id) >= 0) {
						publishedItemIds.push(id);
						break;
					}
				}
			}

			var unpublishRequestPromise = [];
			if (publishedItemIds.length > 0) {
				for (let i = 0; i < publishedItemIds.length; i++) {
					var idx = itemIds.indexOf(publishedItemIds[i]);
					publisedPageNames[i] = idx >= 0 && idx < pageNames.length ? pageNames[idx] : '';
				}
				unpublishRequestPromise.push(
					serverRest.unpublishChannelItems({
						server: server,
						channelId: _SiteInfo.channelId,
						itemIds: publishedItemIds,
						async: true
					})
				);
			}
			// console.log(itemIds + ',' + pageNames + ' => ' + publishedItemIds + ',' + publisedPageNames);

			return Promise.all(unpublishRequestPromise);

		})
			.then(function (result) {
				if (!result || result.length === 0) {
					return resolve({});
				} else if (result[0].err) {
					return resolve({
						err: 'err'
					});
				} else {
					var statusId = result[0].statusId;
					if (!statusId) {
						console.error('ERROR: failed to unsubmit publish job');
						return resolve({
							err: 'err'
						});
					}
					var inter = setInterval(function () {
						var jobPromise = serverRest.getItemOperationStatus({
							server: server,
							statusId: statusId
						});
						jobPromise.then(function (data) {
							if (!data || data.error || data.progress === 'failed') {
								clearInterval(inter);
								var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
								console.error('ERROR: ' + msg);
								return Promise.reject();
							} else if (data.completed) {
								clearInterval(inter);
								var localemsg = isMaster ? '' : ' (' + locale + ')';
								console.info(' - unpublish page index items for page ' + publisedPageNames + localemsg);
								return resolve({});
							} else {
								console.info(' - unpublish  in progress');
							}
						});
					}, 5000);
				}
			});
	});
	return unpublishPromise;
};


var _updatePageIndexItem = function (server, dataIndex, locale, isMaster) {
	return new Promise(function (resolve, reject) {
		if (dataIndex >= 0 && dataIndex < _pageIndexToUpdate.length) {
			var pageName = _pageIndexToUpdate[dataIndex].fields.pagename;
			var localemsg = isMaster ? '' : ' (' + locale + ')';
			var indexData = _pageIndexToUpdate[dataIndex];
			var id = indexData.id;
			var itemName = indexData.name;
			var url = server.url + '/content/management/api/v1.1/items/' + id;
			var postData = {
				method: 'PUT',
				url: url,
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': _CSRFToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				},
				body: JSON.stringify(indexData),
				json: true
			};

			serverUtils.showRequestOptions(postData);

			var request = require('../test/server/requestUtils.js').request;
			request.post(postData, function (err, response, body) {
				if (err) {
					console.error('ERROR: Failed to update page index item for page' + pageName + localemsg);
					console.error(err);
					return resolve({
						err: 'err'
					});
				}

				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					data = body;
				}
				if (response && (response.statusCode === 200 || response.statusCode === 201)) {
					console.info(' - update page index item for page ' + pageName + localemsg);
					return resolve(data);
				} else {
					var msg = data ? (data.detail || data.title) : response.statusMessage;
					console.error('ERROR: Failed to update page index item for page ' + pageName + localemsg + ' : ' + msg);
					return resolve({
						err: 'err'
					});
				}
			});
		} else {
			console.error('ERROR: invalid parameters to update content item');
			return resolve({
				err: 'err'
			});
		}
	});

};


/**
 * Global variable used by the node server
 */
var _CSRFToken = '';
var _siteId;
var _pagesFolderId;
var _SiteInfo;
var _siteChannelToken;
var _requiredLangs = [],
	_optionalLangs = [];
var _masterSiteStructure;
var _masterPageData = [];
var _contentTypesOnPages = [];
var _contentTextFields = [];
var _pageContentIds = [];
var _pageIndexToUpdate = [];
var _pageIndexToCreate = [];
var _pageIndexToDelete = [];
var _masterItems = [];

var _getItemMasterId = function (pageIndexData, locale) {
	var pageid = pageIndexData.pageid;
	if (locale) {
		pageid = pageid.replace(locale + '_', '');
	}
	for (var i = 0; i < _masterItems.length; i++) {
		if (pageid === _masterItems[i].pageid) {
			return _masterItems[i].id;
		}
	}
	return undefined;
};

/**
 *
 * @param {*} pageid <locale>_<page id>
 */
var _getMasterPageData = function (pageid) {
	var id = pageid;
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

var _getPageFromMastrStructure = function (pageid) {
	var id = pageid;
	if (id.indexOf('_') > 0) {
		id = id.substring(id.lastIndexOf('_') + 1);
	}
	var pages = _masterSiteStructure.pages || [];
	var page;
	for (var i = 0; i < pages.length; i++) {
		if (id === pages[i].id.toString()) {
			page = pages[i];
			break;
		}
	}
	return page;
};


/**
 * Create or update page index for the site on the server
 *
 * @param {*} siteChannelToken
 * @param {*} pageIndex
 */
var _indexSiteOnServer = function (server, siteInfo, siteChannelToken, contenttype, pageIndex, locale, isMaster) {
	var indexSiteOnServerPromise = new Promise(function (resolve, reject) {
		var siteChannelId = siteInfo.channelId;
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		//
		// Get the existing page index for the site
		//
		var pageIndexPromise = _getPageIndexItem(server, siteChannelToken, contenttype, locale);
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
			_pageIndexToDelete = [];
			for (let j = 0; j < existingPageIndex.length; j++) {
				let found = false;
				let item = existingPageIndex[j];
				let fields = item.fields;
				let newFields;
				for (let i = 0; i < pageIndex.length; i++) {
					if (fields && pageIndex[i].site === fields.site && pageIndex[i].pageid === fields.pageid) {
						found = true;
						newFields = pageIndex[i];
						break;
					}
				}

				if (found) {
					// Update item with newly generated page index
					item.fields = newFields;
					_pageIndexToUpdate.push(item);
				} else {
					_pageIndexToDelete.push(item);
				}
			}

			if (_pageIndexToCreate.length === 0 && _pageIndexToUpdate.length === 0) {
				// what happens?
				console.log(' - no page for indexing');
				return resolve({});
			}
			console.info(' - will create ' + _pageIndexToCreate.length + ' page index items ' + localemsg);
			console.info(' - will update ' + _pageIndexToUpdate.length + ' page index items ' + localemsg);
			if (_pageIndexToDelete.length > 0) {
				console.info(' - will remove ' + _pageIndexToDelete.length + ' page index items ' + localemsg);
			}

			var deleteItemIds = [];
			var deleteItemPageNames = [];
			for (let i = 0; i < _pageIndexToDelete.length; i++) {
				var itemId = _pageIndexToDelete[i].id;
				var pageName = _pageIndexToDelete[i].fields.pagename;
				deleteItemIds.push(itemId);
				deleteItemPageNames.push(pageName);
			}

			// save id for created or updated items in other locales
			var itemIds = [];

			var createNewPageIndexPromises = [];
			for (let i = 0; i < _pageIndexToCreate.length; i++) {
				createNewPageIndexPromises.push(
					_createPageIndexItem(server, siteInfo.repositoryId, contenttype, i, locale, isMaster)
				);
			}
			Promise.all(createNewPageIndexPromises)
				.then(function (values) {
					// items created

					var ids = [];
					if (values && values.length > 0) {
						for (var i = 0; i < values.length; i++) {
							// Save the item id for publish
							if (values[i].id && values[i].fields) {
								ids.push(values[i].id);
								if (isMaster) {
									_masterItems.push({
										id: values[i].id,
										pageid: values[i].fields.pageid
									});
								} else {
									itemIds.push(values[i].id);
								}
							}
						}
					}

					var addToChannelPromises = [];
					if (ids.length > 0) {
						addToChannelPromises.push(
							serverRest.addItemsToChanel({
								server: server,
								channelId: siteChannelId,
								itemIds: ids
							}));
					}
					return Promise.all(addToChannelPromises);

				})
				.then(function (results) {
					// add items to channel finished
					if (results && results.length > 0 && !results[0].err) {
						console.info(' - add page index items to site channel');
					}

					var updateExistingPageIndexPromises = [];
					for (var i = 0; i < _pageIndexToUpdate.length; i++) {
						updateExistingPageIndexPromises.push(
							_updatePageIndexItem(server, i, locale, isMaster)
						);
					}
					return Promise.all(updateExistingPageIndexPromises);

				})
				.then(function (values) {
					// updated

					for (var i = 0; i < values.length; i++) {
						// Save the item id for publish
						if (values[i].id && values[i].fields) {
							if (isMaster) {
								_masterItems.push({
									id: values[i].id,
									pageid: values[i].fields.pageid
								});
							} else {
								itemIds.push(values[i].id);
							}
						}
					}

					var setAsTranslatedPromise = [];

					// set items in locales as translated
					if (!isMaster) {
						setAsTranslatedPromise.push(serverRest.ItemsSetAsTranslated({
							server: server,
							itemIds: itemIds
						}));
					}
					return Promise.all(setAsTranslatedPromise);
				})
				.then(function (results) {
					if (!isMaster) {
						if (results && !results[0].err) {
							console.info(' - set page index items in ' + locale + ' as translated');
						}
					}

					if (deleteItemIds.length > 0) {
						var unpublishPromise = _unpublishPageIndexItems(
							server, deleteItemIds, deleteItemPageNames, locale, isMaster);
						unpublishPromise.then(function (result) {
							if (result.err) {
								return resolve(result);
							}
							var removeFromChannelPromise = serverRest.removeItemsFromChanel({
								server: server,
								channelId: _SiteInfo.channelId,
								itemIds: deleteItemIds
							});
							removeFromChannelPromise.then(function (result) {
								if (result.err) {
									return resolve(result);
								}

								console.info(' - remove page index items for page ' + deleteItemPageNames + ' from site channel');
								/* comment out due to bug in server
								var deletePromise = _deletePageIndexItems(
									request, localhost, deleteItemIds, deleteItemPageNames, locale, isMaster);
								deletePromise.then(function (result) {
									return resolve({result});
								});
								*/
								return resolve({
									result
								});
							});
						});
					} else {
						return resolve({});
					}
				}).catch(function (err) {
					if (err) {
						console.error(err);
					}
				});

		}); // get page index items
	});

	return indexSiteOnServerPromise;
};


var _publishPageIndexItems = function (server, channelId, done) {
	if (_masterItems.length === 0) {
		console.info(' - no item to publish');
		return Promise.reject();
	}

	var ids = [];
	for (var i = 0; i < _masterItems.length; i++) {
		ids.push(_masterItems[i].id);
	}

	var publishItemsPromise = serverRest.publishChannelItems({
		server: server,
		channelId: channelId,
		itemIds: ids
	});

	publishItemsPromise.then(function (result) {
		if (result.err) {
			return Promise.reject();
		}
		var statusId = result && result.statusId;
		if (!statusId) {
			console.error('ERROR: failed to submit publish job');
			return Promise.reject();
		}
		var inter = setInterval(function () {
			var jobPromise = serverRest.getItemOperationStatus({
				server: server,
				statusId: statusId
			});
			jobPromise.then(function (data) {
				if (!data || data.error || data.progress === 'failed') {
					clearInterval(inter);
					var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
					console.error('ERROR: ' + msg);
					return Promise.reject();
				} else if (data.completed) {
					clearInterval(inter);
					console.log(' - publish page index items finished');
					_indexSiteEnd(done, true);
				} else {
					console.info(' - publish  in progress');
				}
			});
		}, 5000);
	});
};

/**
 * Get all data and verify before create index
 *
 */
var _prepareData = function (server, site, contenttype, publish, done) {
	var dataPromise = new Promise(function (resolve, reject) {
		var siteInfo, defaultLanguage, siteRepositoryId;
		var localizationPolicy;
		var repository;
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
				localizationPolicy = siteInfo.localizationPolicy;
				siteRepositoryId = siteInfo.repositoryId;
				_siteChannelToken = _getSiteChannelToken(siteInfo);

				if (!siteInfo.isEnterprise) {
					console.error('ERROR: site ' + site + ' is not an enterprise site');
					return Promise.reject();
				}

				console.info(' - site: ' + site + ', default language: ' + defaultLanguage + ', channel token: ' + _siteChannelToken);

				//
				// Get channel
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
				console.info(' - query channel');
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
				//
				// Get Localization policy
				//
				if (result.err) {
					return Promise.reject();
				}
				var policy = result && result[0] || {};
				console.info(' - site localization policy: ' + policy.name);
				_requiredLangs = policy.requiredValues || [];
				_optionalLangs = policy.optionalValues || [];

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

				return serverRest.getContentType({
					server: server,
					name: contenttype
				});
			})
			.then(function (result) {
				//
				// Get page index content type
				//

				if (result.err) {
					return Promise.reject();
				}
				console.info(' - query content type ' + contenttype);
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
					console.error('ERROR: content type ' + contenttype + ' is not in repository ' + repository.name);
					return Promise.reject();
				}

				return serverRest.getContentType({
					server: server,
					name: contenttype
				});
			})
			.then(function (result) {
				//
				// Get page index fields
				//

				if (result.err) {
					return Promise.reject();
				}
				if (_validatePageIndexFields(contenttype, result)) {
					return _getSiteStructure(server);
				} else {
					return Promise.reject();
				}
			})
			.then(function (result) {
				//
				// Get the master site structure
				//

				if (result.err) {
					return Promise.reject();
				}
				siteStructure = result;
				console.info(' - query site structure');
				pages = siteStructure && siteStructure.pages;
				if (!pages || pages.length === 0) {
					console.error('ERROR: no page found');
					return Promise.reject();
				}
				_masterSiteStructure = siteStructure;

				return _getPageData(server, '', true);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				//
				// Get page data for all pages
				//

				// console.log(' - query page data');
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
					for (let i = 0; i < contentTypes.length; i++) {
						if (contentTypes[i] !== contenttype) {
							contentTypeNames.push(contentTypes[i]);
							contentTypesPromise.push(serverRest.getContentType({
								server: server,
								name: contentTypes[i]
							}));
						}
					}
				}


				if (contentTypesPromise.length > 0) {
					Promise.all(contentTypesPromise).then(function (values) {
						console.info(' - content types used in the site: ' + contentTypeNames);
						_contentTypesOnPages = values;
						// console.log(_contentTypesOnPages);

						_contentTextFields = _getTypeTextFields(_contentTypesOnPages);
						// console.log(_contentTextFields);

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
				_indexSiteEnd(done);
			});

	}); // site info



	return dataPromise;
};

var _indexSiteWithLocale = function (server, site, contenttype, locale, isMaster, queriedStructure) {
	var sitePromise = new Promise(function (resolve, reject) {
		var pageData = [];
		var msg = isMaster ? '' : ('(' + locale + ')');
		var siteStructurePromise = _getSiteStructure(server, locale, isMaster, queriedStructure);
		siteStructurePromise.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			var siteStructure = result;
			if (!queriedStructure) {
				console.info(' - query site structure with locale ' + locale);
			}
			var pages = siteStructure && siteStructure.pages;

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
				// Get content items on the pages
				//
				//
				// Get content list queries on the pages
				//
				var pageContentListQueries = _getPageContentListQuery(_masterPageData, contenttype, locale);
				// console.log(pageContentListQueries);

				var promises = [];
				// Content list queries
				for (let i = 0; i < pageContentListQueries.length; i++) {
					promises.push(_getPageContent(server, _siteChannelToken, pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, 'list'));
				}

				return Promise.all(promises);
			})
				.then(function (results) {
					// add items from content list for item query
					for (var i = 0; i < results.length; i++) {
						var list = results[i];
						if (list.pageId && list.data.length > 0) {
							for (var j = 0; j < _pageContentIds.length; j++) {
								if (list.pageId === _pageContentIds[j].id) {
									for (var k = 0; k < list.data.length; k++) {
										var listItem = list.data[k];
										if (!_pageContentIds[j].contentIds.includes(listItem.id)) {
											_pageContentIds[j].contentIds.push(listItem.id);
										}
									}
								}
							}
						}
					}

					var pageContentPromise = _getPageContentPromise(server, _siteChannelToken, _pageContentIds, (isMaster ? undefined : locale));
					if (pageContentPromise && pageContentPromise.length > 0) {
						Promise.all(pageContentPromise).then(function (values) {
							console.info(' - query content on the pages ' + msg);
							var items = [];
							for (var i = 0; i < values.length; i++) {
								items = items.concat(values[i]);
							}

							var pageContent = _assignPageContent(pageData, _pageContentIds, items);
							// console.log(pageContent);

							let pageIndex = _generatePageIndex(site, pages, pageData, pageContent, _contentTextFields);
							// console.log(pageIndex);
							var indexSiteOnServerPromise = _indexSiteOnServer(server, _SiteInfo, _siteChannelToken, contenttype, pageIndex, locale, isMaster);
							indexSiteOnServerPromise.then(function (values) {
								return resolve(values);
							});
						});

					} else {
						// No content on the pages
						console.info(' - no content on the pages');
						let pageIndex = _generatePageIndex(site, pages, pageData, []);
						var indexSiteOnServerPromise = _indexSiteOnServer(server, _SiteInfo, _siteChannelToken, contenttype, pageIndex, locale, isMaster);
						indexSiteOnServerPromise.then(function (values) {
							return resolve(values);
						});
					}

				}); // page content
		}); // site structure
	});
	return sitePromise;
};

/**
 * Main entry
 *
 */
var _indexSite = function (server, site, contenttype, publish, done) {

	//
	// get site info and other metadata
	//
	var dataPromise = _prepareData(server, site, contenttype, publish, done);
	dataPromise.then(function (result) {
		if (result.err) {
			return Promise.reject();
		}

		// index master site
		var isMaster = true;
		var indexSiteLocalePromise = _indexSiteWithLocale(server, site, contenttype,
			_SiteInfo.defaultLanguage, isMaster, _masterSiteStructure);
		indexSiteLocalePromise.then(function (result) {
			var locales = [];
			var translation;
			for (var i = 0; i < _requiredLangs.length; i++) {
				if (_requiredLangs[i] !== _SiteInfo.defaultLanguage) {
					locales.push(_requiredLangs[i]);
				}
			}
			for (let i = 0; i < _optionalLangs.length; i++) {
				if (_optionalLangs[i] !== _SiteInfo.defaultLanguage) {
					locales.push(_optionalLangs[i]);
				}
			}
			if (locales.length > 0) {
				//
				// verify the site has the translation
				//
				var siteinfoPromises = [];
				for (let i = 0; i < locales.length; i++) {
					siteinfoPromises[i] = _getSiteInfoFile(server, locales[i], false);
				}
				var validLocales = [];
				Promise.all(siteinfoPromises).then(function (values) {
					for (var i = 0; i < values.length; i++) {
						if (values[i].locale) {
							validLocales.push(values[i].locale);
						}
					}

					if (validLocales.length > 0) {
						console.info(' - will create/update translate for ' + validLocales);

						var initialTask = _indexSiteWithLocale(server, site, contenttype, validLocales[0], false);
						if (validLocales.length === 1) {
							initialTask.then(function (result) {
								if (publish) {
									_publishPageIndexItems(server, _SiteInfo.channelId, done);
								} else {
									_indexSiteEnd(done, true);
								}
							});
						} else {
							var taskParams = [];
							for (let i = 1; i < validLocales.length; i++) {
								taskParams.push({
									server: server,
									site: site,
									contenttype: contenttype,
									locale: validLocales[i]
								});
							}
							taskParams.push({
								done: true
							});
							//
							// index site with locale in sequence
							//
							taskParams.reduce(function (indexSitePromise, param) {
								return indexSitePromise.then(function (result) {
									if (!param || param.done) {
										// console.log(' - translation finishes');
										if (publish) {
											_publishPageIndexItems(server, _SiteInfo.channelId, done);
										} else {
											_indexSiteEnd(done, true);
										}
									} else {
										return _indexSiteWithLocale(param.server, param.site, param.contenttype, param.locale, false);
									}
								});
							}, initialTask);
						}

					} else {
						// no translation
						//
						// page index items created/updated on the server
						//
						if (publish) {
							_publishPageIndexItems(server, _SiteInfo.channelId, done);
						} else {
							_indexSiteEnd(done, true);
						}
					}
				});

			} else {
				//
				// page index items created/updated on the server
				//
				if (publish) {
					_publishPageIndexItems(server, _SiteInfo.channelId, done);
				} else {
					_indexSiteEnd(done, true);
				}
			}

		}); // index site in one master / locale

	}) // prepare data
		.catch((error) => {
			_indexSiteEnd(done);
		});

};


//
// Tasks
//

/**
 * Index site pages
 */
module.exports.indexSite = function (argv, done) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverUtils.getCaasCSRFToken(server).then(function (result) {
			var csrfToken = result && result.token;
			if (!csrfToken) {
				console.error('ERROR: Failed to get CSRF token');
				return Promise.reject();
			}
			console.info(' - get CSRF token');
			_CSRFToken = csrfToken;
			_indexSite(server, site, contenttype, publish, done);
		});

	})
		.catch((error) => {
			_indexSiteEnd(done);
		});
};