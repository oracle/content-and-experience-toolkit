/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	Mustache = require('mustache'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

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
}

var _cmdEnd = function (done) {
	done();
	process.exit(0);
};

module.exports.createRSSFeed = function (argv, done) {
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

	// verify template
	var tempPath = argv.template || path.join(rssDataDir, 'rss.xml');
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join(projectDir, tempPath);
	}
	tempPath = path.resolve(tempPath);
	if (!fs.existsSync(tempPath)) {
		console.log('ERROR: file ' + tempPath + ' does not exist');
		done();
		return;
	}

	try {
		_createRSSFeed(server, argv, done);
	} catch (e) {
		console.log(e);
		_cmdEnd(done);
	}
};

var _createRSSFeed = function (server, argv, done) {
	var isPod = server.env === 'pod_ec';

	var request = serverUtils.getRequest();

	var siteName = argv.site;

	var tempPath = argv.template || path.join(rssDataDir, 'rss.xml')
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

	var query = argv.query;
	var limit = argv.limit;
	var orderby = argv.orderby;
	var language = argv.language;

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

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

		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var channelId, channelToken;
		var defaultDetailPage;
		var items;

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
					})
					.on('error', function (err) {
						console.log('ERROR: GET request failed: ' + req.url);
						console.log(error);
						return resolve({
							err: 'err'
						});
					})
					.pipe(res);

			} else {
				console.log('ERROR: GET request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});

		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;

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

						// verify site
						var msg = 'ERROR: site ' + siteName + ' does not exist';
						var sitePromise = _getOneIdcService(request, localhost, 'SCS_GET_SITE_INFO_FILE', 'siteId=' + siteName + '&IsJson=1', msg);
						sitePromise.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								}

								var site = result.base ? result.base.properties : undefined;
								if (!site || !site.siteName) {
									console.log('ERROR: site ' + siteName + ' does not exist');
									_cmdEnd(done);
								}

								if (!site.isEnterprise) {
									console.log(' - site ' + siteName + ' is not an enterprise site');
									_cmdEnd(done);
								}
								// console.log(site);

								channelId = site.channelId;

								var tokens = site.channelAccessTokens;
								for (var i = 0; i < tokens.length; i++) {
									if (tokens[i].name === 'defaultToken') {
										channelToken = tokens[i].value;
										break;
									}
								}
								if (!channelToken && tokens.length > 0) {
									channelToken = tokens[0].value;
								}

								if (!channelId || !channelToken) {
									console.log(' - no channel found for site ' + siteName);
									_cmdEnd(done);
								}

								console.log(' - get site (channelToken: ' + channelToken + ')');

								//
								// get content items
								return _getContentItems(request, localhost, channelToken, query, limit, orderby, language);
							})
							.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								}

								items = result.data;
								if (items.length === 0) {
									console.log(' - no items');
									_cmdEnd(done);
								}
								console.log(' - find ' + items.length + ' ' + (items.length > 1 ? 'items' : 'item'));

								//
								// Get site pages 
								var msg = 'ERROR: failed to get site pages';
								return _getOneIdcService(request, localhost, 'SCS_GET_STRUCTURE', 'siteId=' + siteName + '&IsJson=1', msg);
							})
							.then(function (result) {
								if (result.err) {
									_cmdEnd(done);
								}

								var pages = result && result.base && result.base.pages;

								var defaultDetailPageId = _getDefaultDetailPageId(pages);
								if (defaultDetailPageId) {
									for (var i = 0; i < pages.length; i++) {
										if (pages[i].id.toString() === defaultDetailPageId) {
											defaultDetailPage = pages[i];
											break;
										}
									}
									console.log(' - default detail page: ' + defaultDetailPage.name);
								}

								var siteUrl = argv.url;
								if (siteUrl.substring(siteUrl.length - 1) === '/') {
									siteUrl = siteUrl.substring(0, siteUrl.length - 1);
								}
								if (_generateRSSFile(siteUrl, items, language, defaultDetailPage, tempPath,
										argv.title, argv.description, argv.ttl, rssFile)) {
									console.log(' - create RSS file ' + rssFile);

									if (publish) {
										_pubishRSSFile(argv.server, server, request, siteUrl, siteName, rssFile, done);
									} else {
										_cmdEnd(done);
									}
								} else {
									_cmdEnd(done);
								}
							});
					}
				});
			}, 6000);
		}); // local
	}); // login
};

var _getOneIdcService = function (request, localhost, service, params, errorMsg) {
	return new Promise(function (resolve, reject) {
		// service: SCS_GET_SITE_INFO_FILE
		var url = localhost + '/documents/web?IdcService=' + service;
		if (params) {
			url = url + '&' + params;
		}

		request.get(url, function (err, response, body) {
			if (err) {
				console.log(errorMsg || ('ERROR: Failed to do ' + service));
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {};

			if (response && response.statusCode !== 200) {
				var msg = (data && data.LocalData ? data.LocalData.StatusMessage : (response.statusMessage || response.statusCode));
				console.log(errorMsg || ('ERROR: Failed to do ' + service + ' - ' + msg));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);
		});
	});
};

var _getContentItems = function (request, localhost, channelToken, query, limit, orderby, language) {
	return new Promise(function (resolve, reject) {
		var url = '/content/published/api/v1.1/items';
		var q = language ? (query + ' and (language eq "' + language + '" or translatable eq "false")') : query;

		url = url + '?q=(' + q + ')';
		url = url + '&limit=' + limit;
		url = url + '&orderBy=' + orderby;
		url = url + '&channelToken=' + channelToken + '&fields=all';

		console.log(' - query: ' + url);

		request.get(localhost + url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get content');
				console.log(err);
				return resolve({
					'err': 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {};

			if (!response || response.statusCode !== 200) {
				var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
				console.log('ERROR: Failed to get content: ' + msg);
				return resolve({
					'err': 'err'
				});
			}

			if (!data) {
				console.log('ERROR: Failed to get content');
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

var _generateRSSFile = function (siteUrl, items, language, detailPage, tempPath, title, description, ttl, rssFilePath) {

	var itemValues = [];
	for (var i = 0; i < items.length; i++) {
		var item = items[i];

		var updatedDateStr = item.updatedDate.value;
		var updatedDateRSS = _getRSSDate(new Date(Date.parse(updatedDateStr)));
		item['publishDate'] = updatedDateRSS;

		var detailLink = '';
		var detailPageUrl = '';
		if (detailPage) {
			var detailPageUrl = detailPage.pageUrl;
			var detailPagePrefix = detailPageUrl.replace('.html', '');
			detailPageUrl = siteUrl + '/' + (language ? (language + '/') : '') + detailPageUrl;
			detailLink = siteUrl + '/' + (language ? (language + '/') : '') + detailPagePrefix + '/' + item.type + '/' + item.id + '/' + item.slug;
		}
		item['detailLink'] = detailLink;
		item['detailPageUrl'] = detailPageUrl;

		itemValues.push(item);
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
	// console.log(rssHash);

	try {
		var tempsrc = fs.readFileSync(tempPath).toString();
		var filesrc = Mustache.render(tempsrc, rssHash);

		// create the rss file
		fs.writeFileSync(rssFilePath, filesrc);

		return true;
	} catch (e) {
		console.log('ERROR: failed to generate RSS file');
		console.log(e);
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
}

var _pubishRSSFile = function (serverName, server, request, siteUrl, siteName, rssFile, done) {

	var sitePromise = serverUtils.browseSitesOnServer(request, server);
	sitePromise.then(function (result) {
			if (result.err) {
				_cmdEnd(done);
			}

			var sites = result.data || [];
			var site;
			for (var i = 0; i < sites.length; i++) {
				if (siteName.toLowerCase() === sites[i].fFolderName.toLowerCase()) {
					site = sites[i];
					break;
				}
			}
			if (!site || !site.fFolderGUID) {
				console.log('ERROR: failed to get site id');
				_cmdEnd(done);
			}

			// console.log(' - site id: ' + site.fFolderGUID);

			// get settings folder 
			return serverRest.findFile({
				registeredServerName: serverName,
				currPath: projectDir,
				parentID: site.fFolderGUID,
				filename: 'settings'
			});
		})
		.then(function (result) {
			if (!result || !result.id) {
				console.log('ERROR: failed tp get folder settings');
				_cmdEnd(done);
			}
			var settingsFolderId = result.id;

			// get seo folder 
			return serverRest.findFile({
				registeredServerName: serverName,
				currPath: projectDir,
				parentID: settingsFolderId,
				filename: 'seo'
			});
		})
		.then(function (result) {
			if (!result || !result.id) {
				console.log('ERROR: failed to get folder seo');
				_cmdEnd(done);
			}
			var seoFolderId = result.id;

			var filename = rssFile;
			filename = filename.substring(filename.lastIndexOf('/') + 1);

			// upload file
			return serverRest.createFile({
				registeredServerName: serverName,
				currPath: projectDir,
				parentID: seoFolderId,
				filename: filename,
				contents: fs.readFileSync(rssFile)
			});
		})
		.then(function (result) {
			if (!result || !result.id) {
				console.log('ERROR: failed upload RSS file');
				_cmdEnd(done);
			}

			var rssFileUrl = siteUrl + '/' + result.name;
			console.log(' - site RSS feed uploaded, publish the site and access it at ' + rssFileUrl);
			_cmdEnd(done);
		});
};