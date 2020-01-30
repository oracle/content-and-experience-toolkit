/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, module, Buffer, console */
/* jshint esversion: 6 */

var he = require('he'),
	fs = require('fs'),
	os = require('os'),
	path = require('path'),
	readline = require('readline'),
	serverRest = require('../test/server/serverRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

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
}

var localServer;

var _indexSiteEnd = function (done, success) {
	done(success);
	if (localServer) {
		localServer.close();
	}
};

var _getSiteInfoFile = function (server, request, localhost, site, locale, isMaster) {
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

var _getSiteStructure = function (server, request, localhost, site, locale, isMaster) {
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
		return false;
	}
	// Require fields: site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords
	var site, pageid, pagename, pageurl, pagetitle, pagedescription, keywords;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name === 'site') {
			site = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field site should be text');
				return false;
			}
		} else if (fields[i].name === 'pageid') {
			pageid = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pageid should be text');
				return false;
			}
		} else if (fields[i].name === 'pagename') {
			pagename = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pagename should be text');
				return false;
			}
		} else if (fields[i].name === 'pageurl') {
			pageurl = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pageurl should be text');
				return false;
			}
		} else if (fields[i].name === 'pagetitle') {
			pagetitle = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field pagetitle should be text');
				return false;
			}
		} else if (fields[i].name === 'pagedescription') {
			pagedescription = true;
			if (fields[i].datatype !== 'text' && fields[i].datatype !== 'largetext') {
				console.log('ERROR: field pagedescription should be text');
				return false;
			}
		} else if (fields[i].name === 'keywords') {
			keywords = true;
			if (fields[i].datatype !== 'text') {
				console.log('ERROR: field keywords should be text');
				return false;
			}
			if (fields[i].valuecount !== 'list') {
				console.log('ERROR: field keywords should allow multiple values');
				return false;
			}
		}
	}
	if (!site) {
		console.log('ERROR: field site is missing from type ' + contenttype);
		return false;
	}
	if (!pageid) {
		console.log('ERROR: field pageid is missing from type ' + contenttype);
		return false;
	}
	if (!pagename) {
		console.log('ERROR: field pagename is missing from type ' + contenttype);
		return false;
	}
	if (!pageurl) {
		console.log('ERROR: field pageurl is missing from type ' + contenttype);
		return false;
	}
	if (!pagetitle) {
		console.log('ERROR: field pagetitle is missing from type ' + contenttype);
		return false;
	}
	if (!pagedescription) {
		console.log('ERROR: field pagedescription is missing from type ' + contenttype);
		return false;
	}
	if (!keywords) {
		console.log('ERROR: field keywords is missing from type ' + contenttype);
		return false;
	}

	return true;
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

/**
 * Get an array of promises to get the page data for all site pages
 * 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} pages the data from SCS_GET_STRUCTURE
 */
var _getPageData = function (server, request, localhost, site, pages, locale, isMaster) {
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
			auth: auth
		};
		var request = serverUtils.getRequest();
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to download file ' + fileName);
				console.log(error);
				resolve();
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			};
			if (response && response.statusCode === 200) {
				resolve({
					id: fileName.substring(0, fileName.indexOf('.')),
					data: data
				});
			} else {
				console.log('ERROR: failed to download file: ' + fileName + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve();
			}

		});
	});
};
var _readPageFiles = function (server, files) {
	return new Promise(function (resolve, reject) {
		var total = files.length;
		console.log(' - total number of files: ' + total);
		var groups = [];
		var limit = 16;
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

		var doReadFile = groups.reduce(function (filePromise, param) {
				return filePromise.then(function (result) {
					var filePromises = [];
					for (var i = param.start; i <= param.end; i++) {
						filePromises.push(_readFile(server, files[i].id, files[i].name));
					}

					count.push('.');
					process.stdout.write(' - downloading files ' + count.join(''));
					readline.cursorTo(process.stdout, 0);
					return Promise.all(filePromises).then(function (results) {
						fileData = fileData.concat(results);
					});

				});
			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doReadFile.then(function (result) {
			process.stdout.write(os.EOL);
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
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} contentIds 
 */
var _getPageContent = function (request, localhost, channelToken, q, pageId, queryType) {
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
				return resolve({
					'err': err
				});
			}
			if (!response || response.statusCode !== 200) {
				console.log('ERROR: Failed to get content: status: ' + (response ? response.statusCode : '') + ' url: ' + url.replace(localhost, ''));
				return resolve({
					'err': (response ? response.statusCode : 'error')
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get content: url: ' + url.replace(localhost, ''));
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
var _getPageContentPromise = function (request, localhost, channelToken, pageContentIds, locale) {
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

				promises.push(_getPageContent(request, localhost, channelToken, q, pageId, 'item'));

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
			promises.push(_getPageContent(request, localhost, channelToken, q, pageId, 'item'));
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

var _unescapeHTML = function (str) {
	try {
		return he.decode(str);
	} catch(e) {
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
			var masterPage = _getPageFromMastrStructure(pageId);
			var pageName = masterPage ? masterPage.name : ' ';
			var pageUrl = masterPage ? masterPage.pageUrl : ' ';
			// console.log('page title=' + pageTitle + ' description=' + pageDescription);

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
			console.log(' - page ' + pageId + ' is set hidden from search');
		}
	}
	// console.log(pageIndex);
	return pageIndex;
};


var _getPageIndexItem = function (request, localhost, channelToken, contenttype, locale) {
	var pageIndexItemPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?fields=ALL&limit=9999';
		url = url + '&channelToken=' + channelToken;
		if (locale) {
			url = url + '&q=(type eq "' + contenttype + '" and language eq "' + locale + '")';
		} else {
			url = url + '&q=(type eq "' + contenttype + '")';
		}
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

var _createPageIndexItem = function (request, localhost, repositoryId, contenttype, pageIndexDataIndex, locale, isMaster) {
	var createPageIndexPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?dataIndex=' + pageIndexDataIndex;
		url = url + '&repositoryId=' + repositoryId + '&contenttype=' + contenttype;
		url = url + '&locale=' + locale + '&isMaster=' + isMaster;
		var pageName = _pageIndexToCreate[pageIndexDataIndex].pagename;
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create page index item for page ' + pageName + localemsg);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				console.log(' - create page index item for ' + pageName + localemsg);
				return resolve(data);
			} else {
				console.log('ERROR: Failed to create page index item for page ' + pageName + localemsg);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return createPageIndexPromise;
};


var _addPageIndexItemsToChannel = function (request, localhost, channelId, itemIds) {
	var addItemToChannelPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?channelId=' + channelId + '&itemIds=' + itemIds;
		url = url + '&op=addChannels';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to add page index items to site channel');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				console.log(' - add page index items to site channel');
				resolve(data);
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to add page index items to site channel : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return addItemToChannelPromise;
};


var _removePageIndexItemsFromChannel = function (request, localhost, itemIds, pageNames, locale, isMaster) {
	var addItemToChannelPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?channelId=' + _SiteInfo.channelId + '&itemIds=' + itemIds;
		url = url + '&op=removeChannels';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to remove page index items for page ' + pageNames + ' from site channel');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				console.log(' - remove page index items for page ' + pageNames + ' from site channel');
				resolve(data);
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to remove index items for page ' + pageNames + ' from site channel : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return addItemToChannelPromise;
};

var _itemsSetAsTranslated = function (request, localhost, itemIds, locale) {
	var setAsTranslatedPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?itemIds=' + itemIds;
		url = url + '&op=setAsTranslated';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to set items in ' + locale + ' as translated');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				console.log(' - set page index items in ' + locale + ' as translated');
				resolve(data);
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to set items in ' + locale + ' as translated : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return setAsTranslatedPromise;
};

var _itemPublishInfo = function (request, localhost, itemId, pageName) {
	infoPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items/' + itemId + '/publishInfo';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get page index item publish info (' + pageName + ')');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve({
					itemId: itemId,
					data: data && data.data
				});
			} else {
				var err = (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: failed to get page index item publish info (' + pageName + ') : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return infoPromise;
};

var _unpublishPageIndexItemsRequest = function (request, localhost, itemIds, pageNames, locale, isMaster) {
	var unpublishPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?itemIds=' + itemIds + '&channelId=' + _SiteInfo.channelId;
		url = url + '&op=unpublish';
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to unpublish page index items' + localemsg);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
				console.log(' - send unpublish page index items for page ' + pageNames + localemsg);
				var statusId = response.headers && response.headers.location || '';
				statusId = statusId.substring(statusId.lastIndexOf('/') + 1);
				return resolve({
					statusId: statusId
				});
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to unpublish page index items' + localemsg + ' : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return unpublishPromise;
};

var _unpublishPageIndexItems = function (request, localhost, itemIds, pageNames, locale, isMaster) {
	var unpublishPromise = new Promise(function (resolve, reject) {
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		// first check if the items are published
		var ifPublishedPromise = [];
		for (var i = 0; i < itemIds.length; i++) {
			ifPublishedPromise.push(_itemPublishInfo(request, localhost, itemIds[i], pageNames[i]));
		}
		Promise.all(ifPublishedPromise).then(function (values) {
				var publishedItemIds = [];

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
				var publisedPageNames = [];
				if (publishedItemIds.length > 0) {
					for (var i = 0; i < publishedItemIds.length; i++) {
						var idx = itemIds.indexOf(publishedItemIds[i]);
						publisedPageNames[i] = idx >= 0 && idx < pageNames.length ? pageNames[idx] : '';
					}
					unpublishRequestPromise.push(
						_unpublishPageIndexItemsRequest(request, localhost, publishedItemIds, publisedPageNames, locale, isMaster)
					);
				}
				// console.log(itemIds + ',' + pageNames + ' => ' + publishedItemIds + ',' + publisedPageNames);

				return Promise.all(unpublishRequestPromise);

			})
			.then(function (result) {
				if (result.length === 0) {
					return resolve({});
				}
				var statusId = result && result[0] && result[0].statusId;
				if (!statusId) {
					console.log('ERROR: failed to get unpublish status');
					return resolve({
						err: 'err'
					});
				}

				// wait unpublish to finish
				var inter = setInterval(function () {
					var jobPromise = _getItemOperationStatus(request, localhost, statusId, 'unpublish');
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || data.progress === 'failed') {
							clearInterval(inter);
							console.log('ERROR: unpublish failed: ' + (data && data.error && data.error.detail || data && data.status));
							return resolve({
								err: 'err'
							});
						}
						// console.log(result.status);
						if (data.completed) {
							clearInterval(inter);
							console.log(' - unpublish page index items for page ' + pageNames);
							return resolve({});
						} else {
							console.log(' - unpublishing: percentage ' + data.completedPercentage);
						}
					});
				}, 5000);
			});
	});
	return unpublishPromise;
};

var _deletePageIndexItems = function (request, localhost, itemIds, pageNames, locale, isMaster) {
	var deletePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations';
		url = url + '?itemIds=' + itemIds + '&channelId' + _SiteInfo.channelId;
		url = url + '&op=deleteItems';
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to delete page index items' + localemsg);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				console.log(' - delete page index items for page ' + pageNames + localemsg);
				resolve(data);
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to delete page index items' + localemsg + ' : ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return deletePromise;
};

var _getItemOperationStatus = function (request, localhost, statusId, op) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/bulkItemsOperations/' + statusId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: get status for operation ' + op);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				// console.log('get status for operation ' + op);
				resolve(data);
			} else {
				var err = data && data.detail ? data.detail : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: get status for operation ' + op);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return statusPromise;
};


var _updatePageIndexItem = function (request, localhost, pageIndexDataIndex, locale, isMaster) {
	var updatePageIndexPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/items?dataIndex=' + pageIndexDataIndex;
		var pageName = _pageIndexToUpdate[pageIndexDataIndex].fields.pagename;
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		request.put(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to update page index item for page' + pageName + localemsg);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var endTime = new Date();
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				console.log(' - update page index item for page ' + pageName + localemsg);
				return resolve(data);
			} else {
				console.log('ERROR: Failed to update page index item for page ' + pageName + localemsg);
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
var _pageContentIds = [];;
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
var _indexSiteOnServer = function (request, localhost, siteInfo, siteChannelToken, contenttype, pageIndex, locale, isMaster) {
	var indexSiteOnServerPromise = new Promise(function (resolve, reject) {
		var siteChannelId = siteInfo.channelId;
		var localemsg = isMaster ? '' : ' (' + locale + ')';
		//
		// Get the existing page index for the site
		//
		var pageIndexPromise = _getPageIndexItem(request, localhost, siteChannelToken, contenttype, locale);
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
				} else {
					_pageIndexToDelete.push(item);
				}
			}

			if (_pageIndexToCreate.length === 0 && _pageIndexToUpdate.length === 0) {
				// what happens?
				console.log(' - no page for indexing');
				return resolve({});
			}
			console.log(' - will create ' + _pageIndexToCreate.length + ' page index items ' + localemsg);
			console.log(' - will update ' + _pageIndexToUpdate.length + ' page index items ' + localemsg);
			if (_pageIndexToDelete.length > 0) {
				console.log(' - will remove ' + _pageIndexToDelete.length + ' page index items ' + localemsg);
			}

			var deleteItemIds = [];
			var deleteItemPageNames = [];
			for (var i = 0; i < _pageIndexToDelete.length; i++) {
				var itemId = _pageIndexToDelete[i].id;
				var pageName = _pageIndexToDelete[i].fields.pagename;
				deleteItemIds.push(itemId);
				deleteItemPageNames.push(pageName);
			}

			// save id for created or updated items in other locales
			var itemIds = [];

			var createNewPageIndexPromises = [];
			for (var i = 0; i < _pageIndexToCreate.length; i++) {
				createNewPageIndexPromises.push(
					_createPageIndexItem(request, localhost, siteInfo.repositoryId, contenttype, i, locale, isMaster)
				);
			}
			Promise.all(createNewPageIndexPromises)
				.then(function (values) {
					// items created

					var ids = [];
					if (values && values.length > 0) {
						for (var i = 0; i < values.length; i++) {
							// Save the item id for publish
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

					var addToChannelPromises = [];
					if (ids.length > 0) {
						addToChannelPromises.push(_addPageIndexItemsToChannel(request, localhost, siteChannelId, ids));
					}
					return Promise.all(addToChannelPromises);

				})
				.then(function (addToChannelValues) {
					// add items to channel finished

					var updateExistingPageIndexPromises = [];
					for (var i = 0; i < _pageIndexToUpdate.length; i++) {
						updateExistingPageIndexPromises.push(
							_updatePageIndexItem(request, localhost, i, locale, isMaster)
						);
					}
					return Promise.all(updateExistingPageIndexPromises);

				})
				.then(function (values) {
					// updated

					for (var i = 0; i < values.length; i++) {
						// Save the item id for publish
						if (isMaster) {
							_masterItems.push({
								id: values[i].id,
								pageid: values[i].fields.pageid
							});
						} else {
							itemIds.push(values[i].id);
						}
					}

					var setAsTranslatedPromise = [];

					// set items in locales as translated
					if (!isMaster) {
						setAsTranslatedPromise.push(_itemsSetAsTranslated(request, localhost, itemIds, locale));
					}
					return Promise.all(setAsTranslatedPromise);
				})
				.then(function (values) {

					if (deleteItemIds.length > 0) {
						var unpublishPromise = _unpublishPageIndexItems(
							request, localhost, deleteItemIds, deleteItemPageNames, locale, isMaster);
						unpublishPromise.then(function (result) {
							if (result.err) {
								return resolve(result);
							}
							var removeFromChannelPromise = _removePageIndexItemsFromChannel(
								request, localhost, deleteItemIds, deleteItemPageNames, locale, isMaster);
							removeFromChannelPromise.then(function (result) {
								if (result.err) {
									return resolve(result);
								}
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
					console.log('error: ');
					console.log(err);
				});

		}); // get page index items
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
	if (_masterItems.length === 0) {
		console.log(' - no item to publish');
		return Promise.reject();
	}

	var publishItemsPromise = _publishItems(request, localhost, channelId);
	publishItemsPromise.then(function (result) {
		if (result.err) {
			return Promise.reject();
		}
		var jobId = result.jobId;
		// console.log(jobId);
		var inter = setInterval(function () {
			var jobPromise = _getPublishJobStatus(request, localhost, jobId);
			jobPromise.then(function (result) {
				// console.log(result);
				if (result.err) {
					clearInterval(inter);
					return Promise.reject();
				}
				// console.log(result.status);
				if (result.status === 'success') {
					clearInterval(inter);
					console.log(' - publish page index items finished');
					_indexSiteEnd(done, true);
					return;
				} else if (result.status === 'failed') {
					var msg = result.message;
					if (msg.indexOf('csAssetsChannelRequiresApprovalOnPublish') > 0) {
						msg = 'items are not publishable: AssetsChannelRequiresApprovalOnPublish';
					}
					console.log('ERROR: ' + msg);
					clearInterval(inter);
					return Promise.reject();
				} else {
					console.log(' - publish ' + result.message.toLowerCase());
				}
			});
		}, 5000);
	});
};

/**
 * Get all data and verify before create index
 * 
 * @param {*} server 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} site 
 * @param {*} contenttype 
 * @param {*} publish 
 * @param {*} done 
 */
var _prepareData = function (server, request, localhost, site, contenttype, publish, done) {
	var dataPromise = new Promise(function (resolve, reject) {
		var siteInfo, defaultLanguage, siteRepositoryId;
		var localizationPolicy;
		var repository;
		var siteStructure, pages, pageData = [];

		//
		// Get site id
		//
		serverUtils.getSiteFolder(server, site)
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: site ' + site + ' does not exist');
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
				var siteInfoPromise = _getSiteInfoFile(server, request, localhost, site);
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
					console.log('ERROR: site ' + site + ' is not an enterprise site');
					return Promise.reject();
				}

				console.log(' - site: ' + site + ', default language: ' + defaultLanguage + ', channel token: ' + _siteChannelToken);

				//
				// Get channel
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
				console.log(' - query channel');
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
				//
				// Get Localization policy
				//
				if (result.err) {
					return Promise.reject();
				}
				var policy = result && result[0] || {};
				console.log(' - site localization policy: ' + policy.name);
				_requiredLangs = policy.requiredValues;
				_optionalLangs = policy.optionalValues;

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

				return serverUtils.getContentTypeFromServer(server, contenttype);
			})
			.then(function (result) {
				//
				// Get page index content type
				//

				if (result.err) {
					return Promise.reject();
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
					return Promise.reject();
				}

				return _getContentTypeFields(request, localhost, contenttype);
			})
			.then(function (result) {
				//
				// Get page index fields
				//

				if (result.err) {
					return Promise.reject();
				}
				if (_validatePageIndexFields(done, contenttype, result, done)) {
					return _getSiteStructure(server, request, localhost, site);
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
				console.log(' - query site structure');
				pages = siteStructure && siteStructure.pages;
				if (!pages || pages.length === 0) {
					console.log('ERROR: no page found');
					return Promise.reject();
				}
				_masterSiteStructure = siteStructure;

				return _getPageData(server, request, localhost, site, pages, '', true);
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
					for (var i = 0; i < contentTypes.length; i++) {
						if (contentTypes[i] !== contenttype) {
							contentTypeNames.push(contentTypes[i]);
							contentTypesPromise.push(serverUtils.getContentTypeFromServer(server, contentTypes[i]));
						}
					}
				}


				if (contentTypesPromise.length > 0) {
					Promise.all(contentTypesPromise).then(function (values) {
						console.log(' - content types used in the site: ' + contentTypeNames);
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

var _indexSiteWithLocale = function (server, request, localhost, site, contenttype, locale, isMaster, queriedStructure) {
	var sitePromise = new Promise(function (resolve, reject) {
		var pageData = [];
		var msg = isMaster ? '' : ('(' + locale + ')');
		var siteStructurePromise = _getSiteStructure(server, request, localhost, site, locale, isMaster, queriedStructure);
		siteStructurePromise.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			var siteStructure = result;
			if (!queriedStructure) {
				console.log(' - query site structure with locale ' + locale);
			}
			var pages = siteStructure && siteStructure.pages;

			//
			// Get page data for all pages
			//
			var pageDataPromise = _getPageData(server, request, localhost, site, pages, locale, isMaster);
			pageDataPromise.then(function (result) {
					console.log(' - query page data (' + locale + ')');
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
					for (var i = 0; i < pageContentListQueries.length; i++) {
						promises.push(_getPageContent(request, localhost, _siteChannelToken, pageContentListQueries[i].queryString, pageContentListQueries[i].pageId, 'list'));
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

					var pageContentPromise = _getPageContentPromise(request, localhost, _siteChannelToken, _pageContentIds, (isMaster ? undefined : locale));
					if (pageContentPromise && pageContentPromise.length > 0) {
						Promise.all(pageContentPromise).then(function (values) {
							console.log(' - query content on the pages ' + msg);
							var items = [];
							for (var i = 0; i < values.length; i++) {
								items = items.concat(values[i]);
							}

							var pageContent = _assignPageContent(pageData, _pageContentIds, items);
							// console.log(pageContent);

							pageIndex = _generatePageIndex(site, pages, pageData, pageContent, _contentTextFields);
							// console.log(pageIndex);
							var indexSiteOnServerPromise = _indexSiteOnServer(request, localhost, _SiteInfo, _siteChannelToken, contenttype, pageIndex, locale, isMaster);
							indexSiteOnServerPromise.then(function (values) {
								return resolve(values);
							});
						});

					} else {
						// No content on the pages
						console.log(' - no content on the pages');
						pageIndex = _generatePageIndex(site, pages, pageData, []);
						var indexSiteOnServerPromise = _indexSiteOnServer(request, localhost, _SiteInfo, _siteChannelToken, contenttype, pageIndex, locale, isMaster);
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
 * @param {*} server 
 * @param {*} request 
 * @param {*} localhost 
 * @param {*} site 
 * @param {*} contenttype 
 * @param {*} publish 
 * @param {*} done 
 */
var _indexSite = function (server, request, localhost, site, contenttype, publish, done) {

	//
	// get site info and other metadata
	// 
	var dataPromise = _prepareData(server, request, localhost, site, contenttype, publish, done);
	dataPromise.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			// index master site
			var isMaster = true;
			var indexSiteLocalePromise = _indexSiteWithLocale(server, request, localhost, site, contenttype,
				_SiteInfo.defaultLanguage, isMaster, _masterSiteStructure);
			indexSiteLocalePromise.then(function (result) {
				var locales = [];
				var translation
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
				if (locales.length > 0) {
					//
					// verify the site has the translation
					//
					var siteinfoPromises = [];
					for (var i = 0; i < locales.length; i++) {
						siteinfoPromises[i] = _getSiteInfoFile(server, request, localhost, site, locales[i], false);
					}
					var validLocales = [];
					Promise.all(siteinfoPromises).then(function (values) {
						for (var i = 0; i < values.length; i++) {
							if (values[i].locale) {
								validLocales.push(values[i].locale);
							}
						}

						if (validLocales.length > 0) {
							console.log(' - will create/update translate for ' + validLocales);

							var initialTask = _indexSiteWithLocale(server, request, localhost, site, contenttype, validLocales[0], false);
							if (validLocales.length === 1) {
								initialTask.then(function (result) {
									if (publish) {
										_publishPageIndexItems(request, localhost, _SiteInfo.channelId, done);
									} else {
										_indexSiteEnd(done, true);
									}
								});
							} else {
								var taskParams = [];
								for (var i = 1; i < validLocales.length; i++) {
									taskParams.push({
										server: server,
										request: request,
										localhost: localhost,
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
												_publishPageIndexItems(request, localhost, _SiteInfo.channelId, done);
											} else {
												_indexSiteEnd(done, true);
											}
										} else {
											return _indexSiteWithLocale(param.server, param.request, param.localhost, param.site, param.contenttype, param.locale, false);
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
								_publishPageIndexItems(request, localhost, _SiteInfo.channelId, done);
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
						_publishPageIndexItems(request, localhost, _SiteInfo.channelId, done);
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

var _getCSRFToken = function (server, request) {
	var csrfTokenPromise = new Promise(function (resolve, reject) {
		var tokenUrl = server.url + '/content/management/api/v1.1/token';
		var auth = serverUtils.getRequestAuth(server);
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

			var port = '9191';
			var localhost = 'http://localhost:' + port;

			app.get('/*', function (req, res) {
				// console.log('GET: ' + req.url);
				if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
					var url = server.url + req.url;

					var options = {
						url: url,
					};
					var auth = serverUtils.getRequestAuth(server);
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
				var locale = params.locale;
				var isMaster = (params.isMaster.toLowerCase() === 'true');
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
						language: locale,
						languageIsMaster: isMaster,
						translatable: true,
						repositoryId: repositoryId,
						fields: indexData
					};

					var masterid = _getItemMasterId(indexData, locale);
					if (!isMaster) {
						formData['sourceId'] = masterid;
					}

					var formDataStr = JSON.stringify(formData);
					var auth = serverUtils.getRequestAuth(server);
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
							console.log(err);
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
				var op = params.op;
				var itemIds = params.itemIds;
				if (op !== 'addChannels' && op !== 'setAsTranslated' && op !== 'deleteItems' && op !== 'removeChannels' && op !== 'unpublish') {
					console.log('ERROR: request ' + url + ' NOT supported');
					res.write({});
					res.end();
				} else {
					var arr = itemIds.split(',');
					var q = '';
					for (var i = 0; i < arr.length; i++) {
						if (q) {
							q = q + ' or ';
						}
						q = q + 'id eq "' + arr[i] + '"';
					}
					var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';
					var formData;
					if (op == 'addChannels') {
						formData = {
							q: q,
							operations: {
								addChannels: {
									channels: [{
										id: channelId
									}]
								}
							}
						};
					} else if (op == 'removeChannels') {
						formData = {
							q: q,
							operations: {
								removeChannels: {
									channels: [{
										id: channelId
									}]
								}
							}
						};
					} else if (op === 'setAsTranslated') {
						formData = {
							q: q,
							operations: {
								setAsTranslated: {
									value: true
								}
							}
						};
					} else if (op === 'deleteItems') {
						formData = {
							q: q,
							operations: {
								deleteItems: {
									value: 'true'
								}
							}
						};
					} else if (op === 'unpublish') {
						formData = {
							q: q,
							operations: {
								unpublish: {
									channels: [{
										id: channelId
									}]
								}
							}
						};
					}
					var formDataStr = JSON.stringify(formData);
					var auth = serverUtils.getRequestAuth(server);
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
					var url = server.url + '/content/management/api/v1.1/items/' + id;
					var formDataStr = JSON.stringify(indexData);
					var auth = serverUtils.getRequestAuth(server);
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
				if (channelId && _masterItems.length > 0) {
					var url = server.url + '/content/management/api/v1.1/jobs/publishjobs';
					var ids = [];
					for (var i = 0; i < _masterItems.length; i++) {
						ids.push({
							id: _masterItems[i].id
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
					var auth = serverUtils.getRequestAuth(server);
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


			localServer = app.listen(0, function () {
				port = localServer.address().port;
				localhost = 'http://localhost:' + port;
				localServer.setTimeout(0);

				var csrfTokenPromise = _getCSRFToken(server, request);
				csrfTokenPromise.then(function (result) {
					var csrfToken = result && result.token;
					if (!csrfToken) {
						console.log('ERROR: Failed to get CSRF token');
						return Promise.reject();
					}
					console.log(' - get CSRF token');
					_CSRFToken = csrfToken;
					_indexSite(server, request, localhost, site, contenttype, publish, done);
				});
			});

		})
		.catch((error) => {
			_indexSiteEnd(done);
		});
};