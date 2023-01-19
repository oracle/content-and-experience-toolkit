
/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var path = require('path'),
	fs = require('fs'),
	{ XMLParser } = require('fast-xml-parser'),
	urlparser = require('url'),
	serverRest = require('../test/server/serverRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var projectDir;

//
// Private functions
//

var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	return true;
};

var _getFile = function (fileUrl) {
	return new Promise(function (resolve, reject) {
		var options = {
			url: fileUrl,
			encoding: null
		};

		console.info(' - getting file ' + fileUrl);
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to get ' + fileUrl);
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode === 200) {
				return resolve(body);
			} else {
				console.error('ERROR: Failed to get ' + fileUrl);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

var _prepareNodes = function (sitemapJson, rootNode, excludeLocale) {
	var nodes = [];
	var urlset = [];
	if (sitemapJson && sitemapJson.urlset && sitemapJson.urlset.url) {
		if (Array.isArray(sitemapJson.urlset.url)) {
			urlset = sitemapJson.urlset.url;
		} else {
			urlset.push(sitemapJson.urlset.url);
		}
	}

	var urls = [];
	urlset.forEach(function (entry) {
		if (entry && entry.loc) {
			let urlInfo = urlparser.parse(entry.loc);
			let url = urlInfo.path;
			if (url) {
				// remove leading /
				while (url.startsWith('/')) {
					url = url.substring(1);
				}
				if (excludeLocale) {
					url = url.substring(url.indexOf('/') + 1);
				}
				// remove trailing /
				if (url.charAt(url.length - 1) === '/') {
					url = url.substring(0, url.length - 1);
				}

				// console.log(entry.loc + ' => ' + url);

				if (url && !urls.includes(url)) {
					urls.push(url);
				}
			}
		}
	});
	if (urls.length === 0) {
		return nodes;
	}

	var byDeep = urls.slice(0);
	byDeep.sort(function (a, b) {
		var x = a.split('/').length;
		var y = b.split('/').length;

		return (x < y ? -1 : x > y ? 1 : (a < b ? -1 : a > b ? 1 : 0));
	});
	urls = byDeep;

	// console.log(JSON.stringify(urls, null, 4));
	// fs.writeFileSync(path.join(projectDir, '__siteplan_urls.json'), JSON.stringify(urls, null, 4));

	// console.info(' - total distinct URLs: ' + urls.length);

	var nodeExists = function (name, parent) {
		var exist = false;
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i].name === name && nodes[i].parent === parent) {
				exist = true;
				break;
			}
		}
		return exist;
	};
	var getParentId = function (parentPath) {
		var id;
		var grantParent = parentPath.lastIndexOf('/') < 0 ? 'root' : parentPath.substring(0, parentPath.lastIndexOf('/'));
		var parentName = parentPath.lastIndexOf('/') < 0 ? parentPath : parentPath.substring(parentPath.lastIndexOf('/') + 1);
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i].name === parentName && nodes[i].parent === grantParent) {
				id = nodes[i].id;
				break;
			}
		}
		return id;
	};
	var getRank = function (parent) {
		var rank = 0;
		nodes.forEach(function (node) {
			if (node.parent === parent) {
				rank += 1;
			}
		});
		return rank;
	};
	var rootId = rootNode.id;
	urls.forEach(function (entry) {
		if (entry) {
			let entries = entry.split('/');
			for (let i = 0; i < entries.length; i++) {
				let name = entries[i];
				let parent;
				let grandParent;
				if (i === 0) {
					parent = 'root';
				} else {
					let parents = [];
					for (let j = 0; j < i; j++) {
						parents.push(entries[j])
					}
					parent = parents.join('/');
					if (i === 1) {
						grandParent = 'root';
					} else {
						let grandParents = [];
						for (let k = 0; k < i - 1; k++) {
							grandParents.push(entries[k])
						}
						grandParent = grandParents.join('/');
					}
				}

				// console.log(' - ' + entry + ' parent: ' + parent + ' name: ' + name);

				if (name && !nodeExists(name, parent) && nodes.length < 998) {
					var parentId = parent === 'root' ? rootId : getParentId(parent);
					nodes.push({
						parent: parent,
						name: decodeURIComponent(name),
						id: 'TEMP_' + serverUtils.createUUID(),
						parentId: parentId,
						rank: getRank(parent)
					});
				}
			}
		}
	});
	// console.log(JSON.stringify(nodes, null, 4));
	// fs.writeFileSync(path.join(projectDir, '__siteplan_nodes.json'), JSON.stringify(nodes, null, 4));
	return nodes;
};

var _createSitePlanNodes = function (server, siteplan, nodes) {
	return new Promise(function (resolve, reject) {
		var toCreate = [];
		var rank = 1;
		nodes.forEach(function (node) {
			toCreate.push({
				id: node.id,
				name: node.name,
				displayName: node.name,
				type: 'SeededLeafNodeType',
				parentId: node.parentId,
				rank: node.rank
			});
			rank += 1;
		});

		var body = {
			create: toCreate,
			if: {
				sitePlan: {
					version: 1
				}
			}
		};
		var url = '/content/management/api/v1.1/sitePlans/' + siteplan.id + '/nodes/.bulk/apply';
		serverRest.executePost({ server: server, endpoint: url, body: body, noMsg: true, async: true })
			.then(function (result) {
				return resolve(result);
			});
	});
};

/////////////////////////////////////////////////////////////////////
//
// Tasks
//
////////////////////////////////////////////////////////////////////


module.exports.createSitePlan = function (argv, done) {
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

	var name = argv.name;
	var url = argv.url;
	var filePath = argv.file;
	var repoName = argv.repository;
	var excludeLocale = typeof argv.excludelocale === 'string' && argv.excludelocale.toLowerCase() === 'true';

	const parser = new XMLParser();
	var sitemapJson = {};

	if (filePath) {
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(projectDir, filePath);
		}
		filePath = path.resolve(filePath);

		if (!fs.existsSync(filePath)) {
			console.error('ERROR: file ' + filePath + ' does not exist');
			done();
			return;
		}
		if (fs.statSync(filePath).isDirectory()) {
			console.error('ERROR: ' + filePath + ' is not a file');
			done();
			return;
		}
		var sitemapXML = fs.readFileSync(filePath);
		try {
			sitemapJson = parser.parse(sitemapXML, true);
		} catch (err) {
			console.error('ERROR: file ' + filePath + ' is not a valid XML file');
			console.error(err);
			done();
			return;
		}
	}

	var urls = [];
	var nodes = [];
	var repository;
	var siteplan;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var filePromises = [];
		var fileUrl;
		if (!filePath && url) {
			fileUrl = url + '/sitemap.xml';
			filePromises.push(_getFile(fileUrl));
		}
		Promise.all(filePromises)
			.then(function (results) {
				if (!filePath && url) {
					if (!results || !results[0] || results[0].err) {
						console.error('ERROR: failed to get file from ' + url);
						return Promise.reject();
					}
					try {
						sitemapJson = parser.parse(results[0], true);
					} catch (err) {
						console.error('ERROR: file from ' + url + ' is not a valid XML file');
						console.error(err);
						return Promise.reject();
					}
				}

				/*
				 * Currently we allow duplicate names
				// verify the site plan
				return serverRest.getSitePlansWithName({ server: server, name: name });

			})
			.then(function (result) {

				var existingSitePlans = result || [];
				var found = false;
				for (let i = 0; i < existingSitePlans.length; i++) {
					if (name === existingSitePlans[i].name) {
						found = true;
						break;
					}
				}
				if (found) {
					console.error('ERROR: site plan ' + name + ' already exists');
					return Promise.reject();
				}
				*/

				// verify repository
				return serverRest.getRepositoryWithName({ server: server, name: repoName });

			})
			.then(function (result) {
				if (!result || result.err || !result.data || !result.data.id) {
					console.error('ERROR: repository ' + repoName + ' does not exist');
					return Promise.reject();
				}

				repository = result.data;
				console.info(' - verify repository (Id: ' + repository.id);

				// create the site plan
				return serverRest.createSitePlan({
					server: server,
					name: name,
					displayName: name,
					repositoryId: repository.id
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					console.error('ERROR: failed to create site plan ' + name);
					return Promise.reject();
				}

				siteplan = result;
				console.log(' - site plan ' + name + ' created (Id: ' + siteplan.id + ')');

				let nodesUrl = '/content/management/api/v1.1/sitePlans/' + siteplan.id + '/nodes';
				return serverRest.executeGet({ server: server, endpoint: nodesUrl, noMsg: true });

			})
			.then(function (result) {
				var createdNodes;
				try {
					createdNodes = JSON.parse(result);
				} catch (e) {
					// handle invalid result
				}
				var rootNode = createdNodes && createdNodes.items ? createdNodes.items[0] : undefined;
				if (!rootNode) {
					console.error('ERROR: failed to find the root node of the site plan');
					return Promise.reject();
				}

				console.log(' - site plan root node (Name: ' + rootNode.name + ' Id: ' + rootNode.id + ' Rank: ' + rootNode.rank + ')');

				var nodes = _prepareNodes(sitemapJson, rootNode, excludeLocale);
				console.info(' - total nodes: ' + nodes.length);

				return _createSitePlanNodes(server, siteplan, nodes);

			})
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					console.log(' - site plan nodes created')
					// console.log(JSON.stringify(result, null, 4));
					done(true);
				}
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});

	}); // login
};