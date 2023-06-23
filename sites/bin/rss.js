/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fs = require('fs'),
	Mustache = require('mustache'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var console = require('../test/server/logger.js').console;

var cecDir = path.join(__dirname, ".."),
	rssDataDir = path.join(cecDir, 'data', 'rss');

var projectDir,
	componentsSrcDir,
	serversSrcDir;

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};


module.exports.createRSSFeed = function (argv, done) {
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

	// verify template
	var tempPath = argv.template || path.join(rssDataDir, 'rss.xml');
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join(projectDir, tempPath);
	}
	tempPath = path.resolve(tempPath);
	if (!fs.existsSync(tempPath)) {
		console.error('ERROR: file ' + tempPath + ' does not exist');
		done();
		return;
	}

	var javascript = argv.javascript;
	if (javascript) {
		if (!path.isAbsolute(javascript)) {
			javascript = path.join(projectDir, javascript);
		}
		javascript = path.resolve(javascript);
		if (!fs.existsSync(javascript)) {
			console.error('ERROR: file ' + javascript + ' does not exist');
			done();
			return;
		}
	}

	try {
		_createRSSFeed(server, argv, done);
	} catch (e) {
		console.error(e);
		done();
	}
};

var _createRSSFeed = function (server, argv, done) {

	var siteName = argv.site;

	var tempPath = argv.template || path.join(rssDataDir, 'rss.xml');
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join(projectDir, tempPath);
	}
	tempPath = path.resolve(tempPath);

	// RSS file
	var rssFile = argv.file || (siteName + 'RSS.xml');
	if (rssFile.split('.').pop() !== 'xml') {
		rssFile = rssFile + '.xml';
	}
	if (!path.isAbsolute(rssFile)) {
		rssFile = path.join(projectDir, rssFile);
		rssFile = path.resolve(rssFile);
	}

	var javascript = argv.javascript;
	if (javascript) {
		if (!path.isAbsolute(javascript)) {
			javascript = path.join(projectDir, javascript);
		}
		javascript = path.resolve(javascript);
	}

	var query = argv.query;
	var limit = argv.limit;
	var orderby = argv.orderby;
	var language = argv.language;

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

	var newlink = typeof argv.newlink === 'string' && argv.newlink.toLowerCase() === 'true';

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		_createRSSFeedREST(server, siteName, argv.url, tempPath,
			rssFile, query, limit, orderby, language, publish, argv.rsstitle,
			argv.description, argv.ttl, newlink, javascript, done);

	}); // login
};


var _getContentItems = function (server, channelToken, query, limit, orderby, language) {
	return new Promise(function (resolve, reject) {
		var url = '/content/published/api/v1.1/items';
		var q = language ? (query + ' and (language eq "' + language + '" or translatable eq "false")') : query;

		url = url + '?q=(' + q + ')';
		url = url + '&limit=' + limit;
		url = url + '&orderBy=' + orderby;
		url = url + '&channelToken=' + channelToken + '&fields=all';

		console.info(' - query: ' + url);
		var options = {
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to get content');
				console.error(err);
				return resolve({
					'err': 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// in case the result is not valid json
			}

			if (!response || response.statusCode !== 200) {
				var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
				console.error('ERROR: Failed to get content: ' + msg);
				return resolve({
					'err': 'err'
				});
			}

			if (!data) {
				console.error('ERROR: Failed to get content');
				return resolve({
					'err': 'err'
				});
			}
			// handle both 1 item or multiple items
			resolve({
				data: data.items ? data.items : [data]
			});
		});
	});
};

var _getDefaultDetailPageId = function (pages) {
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

var _generateRSSFile = function (siteUrl, items, language, detailPage, tempPath, title, description, ttl, rssFilePath, newlink, javascript) {

	var itemValues = [];
	for (var i = 0; i < items.length; i++) {
		var item = items[i];

		var fields = item.fields || [];
		Object.keys(fields).forEach(function (key) {
			var field = fields[key];
			if (field && field.timezone && field.value) {
				field['rssDate'] = _getRSSDate(new Date(Date.parse(field.value)));
			}
		});

		var updatedDateStr = item.updatedDate.value;
		var updatedDateRSS = _getRSSDate(new Date(Date.parse(updatedDateStr)));
		item['publishDate'] = updatedDateRSS;

		var detailLink = '';
		var detailPageUrl = '';
		if (detailPage) {
			detailPageUrl = detailPage.pageUrl;
			var detailPagePrefix = detailPageUrl.replace('.html', '');
			detailPageUrl = siteUrl + '/' + (language ? (language + '/') : '') + detailPageUrl;
			if (newlink) {
				detailLink = siteUrl + '/' + (language ? (language + '/') : '') + detailPagePrefix + '/' + item.slug;
			} else {
				detailLink = siteUrl + '/' + (language ? (language + '/') : '') + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;

			}
		}
		item['detailLink'] = detailLink;
		item['detailPageUrl'] = detailPageUrl;

		itemValues.push(item);
	}
	// console.log(JSON.stringify(itemValues));

	var customHash;
	if (javascript) {
		console.info(' - require in javascript from ' + javascript);
		try {
			customHash = require(javascript);
			// console.log(customHash);
		} catch (e) {
			console.error(e);
		}
	}

	var rssDate = _getRSSDate(new Date());
	var rssHash = {
		'title': title,
		'description': description,
		'url': siteUrl,
		'lastBuildDate': rssDate,
		'pubDate': rssDate,
		'ttl': ttl,
		'items': itemValues
	};

	if (customHash && typeof customHash === 'object') {
		// merge
		Object.keys(customHash).forEach(function (key) {
			rssHash[key] = customHash[key];
		});
	}
	// console.log(rssHash);

	try {
		var tempsrc = fs.readFileSync(tempPath).toString();
		var filesrc = Mustache.render(tempsrc, rssHash);

		// create the rss file
		fs.writeFileSync(rssFilePath, filesrc);

		return true;
	} catch (e) {
		console.error('ERROR: failed to generate RSS file');
		console.error(e);
		return false;
	}
};

var _getRSSDate = function (date) {
	var pieces = date.toString().split(' '),
		offsetTime = pieces[5].match(/[-+]\d{4}/),
		offset = (offsetTime) ? offsetTime : pieces[5],
		parts = [
			pieces[0] + ',',
			pieces[2],
			pieces[1],
			pieces[3],
			pieces[4],
			offset
		];

	return parts.join(' ');
};

var _pubishRSSFile = function (server, siteUrl, siteName, rssFile, done) {

	var filename = rssFile;
	filename = filename.substring(filename.lastIndexOf('/') + 1);

	var sitePromise = sitesRest.getSite({
		server: server,
		name: siteName
	});
	sitePromise.then(function (result) {
		if (result.err) {
			return Promise.reject();
		}

		var siteId = result.id;
		if (!siteId) {
			console.error('ERROR: failed to get site id');
			return Promise.reject();
		}

		// console.log(' - site id: ' + siteId);

		// get settings folder
		return serverRest.findFile({
			server: server,
			parentID: siteId,
			filename: 'settings'
		});
	})
		.then(function (result) {
			if (!result || !result.id) {
				console.error('ERROR: failed to get folder settings');
				return Promise.reject();
			}
			var settingsFolderId = result.id;

			// get seo folder
			return serverRest.findFile({
				server: server,
				parentID: settingsFolderId,
				filename: 'seo'
			});
		})
		.then(function (result) {
			if (!result || !result.id) {
				console.error('ERROR: failed to get folder seo');
				return Promise.reject();
			}
			var seoFolderId = result.id;

			// upload file
			return serverRest.createFile({
				server: server,
				parentID: seoFolderId,
				filename: filename,
				contents: fs.createReadStream(rssFile)
			});
		})
		.then(function (result) {
			if (!result || !result.id) {
				console.error('ERROR: failed upload RSS file');
				return Promise.reject();
			}

			var rssFileUrl = siteUrl + '/' + filename;
			console.log(' - site RSS feed uploaded, publish with command \'cec control-site publish -s ' + siteName + ' -i seo\' and access it at ' + rssFileUrl);
			done(true);
		})
		.catch((error) => {
			done();
		});
};

/**
 * Create RSS feed using REST APIs
 * @param {*} server
 * @param {*} tempPath
 * @param {*} rssFile
 * @param {*} query
 * @param {*} limit
 * @param {*} orderby
 * @param {*} language
 * @param {*} publish
 * @param {*} done
 */
var _createRSSFeedREST = function (server, siteName, url, tempPath, rssFile,
	query, limit, orderby, language, publish, title, description, ttl, newlink, javascript, done) {
	var site;
	var channelId, channelToken;
	var defaultDetailPage;
	var items;

	sitesRest.getSite({
		server: server,
		name: siteName,
		expand: 'channel'
	})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			site = result;
			if (!site.isEnterprise) {
				console.error(' - site ' + siteName + ' is not an enterprise site');
				return Promise.reject();
			}

			if (site.channel) {
				channelId = site.channel.id;

				var tokens = site.channel.channelTokens;
				for (var i = 0; i < tokens.length; i++) {
					if (tokens[i].name === 'defaultToken') {
						channelToken = tokens[i].token;
						break;
					}
				}
				if (!channelToken && tokens.length > 0) {
					channelToken = tokens[0].value;
				}
			}
			if (!channelId || !channelToken) {
				console.error(' - no channel found for site ' + siteName);
				return Promise.reject();
			}

			console.info(' - get site (channelToken: ' + channelToken + ')');

			return _getContentItems(server, channelToken, query, limit, orderby, language);
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			items = result.data;
			if (items.length === 0) {
				console.error(' - no items');
				return Promise.reject();
			}
			console.info(' - find ' + items.length + ' ' + (items.length > 1 ? 'items' : 'item'));

			return serverRest.findFile({
				server: server,
				parentID: site.id,
				filename: 'structure.json',
				itemtype: 'file'
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var fileId = result.id;
			return serverRest.readFile({
				server: server,
				fFileGUID: fileId
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var pages = result && result.pages;

			var defaultDetailPageId = _getDefaultDetailPageId(pages);
			if (defaultDetailPageId) {
				for (var i = 0; i < pages.length; i++) {
					if (pages[i].id.toString() === defaultDetailPageId) {
						defaultDetailPage = pages[i];
						break;
					}
				}
				console.info(' - default detail page: ' + defaultDetailPage.name);
			}

			var siteUrl = url;
			if (siteUrl.substring(siteUrl.length - 1) === '/') {
				siteUrl = siteUrl.substring(0, siteUrl.length - 1);
			}

			if (_generateRSSFile(siteUrl, items, language, defaultDetailPage, tempPath,
				title, description, ttl, rssFile, newlink, javascript)) {
				console.log(' - create RSS file ' + rssFile);

				if (publish) {
					_pubishRSSFile(server, siteUrl, siteName, rssFile, done);
				} else {
					done(true);
				}
			} else {
				done();
			}
		})
		.catch((error) => {
			done();
		});
};