/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */

/**
 * Utilities for Local Server
 */

var express = require('express'),
	app = express(),
	os = require('os'),
	fs = require('fs'),
	path = require('path'),
	ps = require('ps-node'),
	uuid4 = require('uuid/v4'),
	puppeteer = require('puppeteer'),
	btoa = require('btoa'),
	url = require('url'),
	Client = require('node-rest-client').Client;

var projectDir = path.join(__dirname, "../.."),
	componentsDir = path.join(projectDir, 'src', 'main', 'components'),
	templatesDir = path.join(projectDir, 'src', 'main', 'templates'),
	themesDir = path.join(projectDir, 'src', 'main', 'themes');


/**
 * Get server and credentials from gradle properties
 */
module.exports.getConfiguredServer = function () {
	return _getConfiguredServer();
};
var _getConfiguredServer = function () {
	var configFile = process.env.CEC_PROPERTIES || path.join(os.homedir(), '.gradle', 'gradle.properties');
	// console.log('CEC configure file: ' + configFile);
	var server = {
		url: '',
		username: '',
		password: '',
		oauthtoken: '',
		env: ''
	};
	try {
		var cecurl,
			username,
			password,
			env;
		fs.readFileSync(configFile).toString().split('\n').forEach(function (line) {
			if (line.indexOf('cec_url=') === 0) {
				cecurl = line.substring('cec_url='.length);
				cecurl = cecurl.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_username=') === 0) {
				username = line.substring('cec_username='.length);
				username = username.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_password=') === 0) {
				password = line.substring('cec_password='.length);
				password = password.replace(/(\r\n|\n|\r)/gm, '').trim();
			} else if (line.indexOf('cec_env=') === 0) {
				env = line.substring('cec_env='.length);
				env = env.replace(/(\r\n|\n|\r)/gm, '').trim();
			}
		});
		if (cecurl && username && password) {
			server.url = cecurl;
			server.username = username;
			server.password = password;
			server.env = env || 'pod_ec';
			server.oauthtoken = '';
		}
		// console.log('configured server=' + JSON.stringify(server));
	} catch (e) {
		console.log('Failed to read config: ' + e);
	}
	return server;
};

/**
 * Create a 44 char GUID
 * ‘C’ + 32 char complete UUID + 11 char from another UUID
 */
module.exports.createGUID = function () {
	return _createGUID();
};
var _createGUID = function () {
	'use strict';
	let guid1 = uuid4();
	let guid2 = uuid4();
	guid1 = guid1.replace(/-/g, '').toUpperCase();
	guid2 = guid2.replace(/-/g, '').toUpperCase();
	const guid = 'C' + guid1 + guid2.substr(0, 11);
	return guid;
};

/**
 * Utility check if a string ends with 
 */
module.exports.endsWith = (str, end) => {
	return str.lastIndexOf(end) === str.length - end.length;
};

/**
 * Utility replace all occurrences of a string
 */
module.exports.replaceAll = (str, search, replacement) => {
	return _replaceAll(str, search, replacement);
};
var _replaceAll = function (str, search, replacement) {
	var re = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
	return str.replace(re, replacement || '');
};

module.exports.fixHeaders = (origResponse, response) => {
	_fixHeaders(origResponse, response);
};
var _fixHeaders = function (origResponse, response) {
	var headers = origResponse.rawHeaders, // array [name1, value1, name2, value2, ...]
		i = 0,
		headerNames = [],
		headerName;

	for (i = 0; i < headers.length; i = i + 2) {
		headerName = headers[i];
		// collect header name
		headerNames.push(headerName);

		// regarding capitalization, we're only taking care of SCS 'ETag-something' headers
		if (headerName.indexOf('ETag-') === 0) {
			// remove the corresponding lower case header from the proxied response object
			// (it otherwise takes precedence when piped to the actual response)
			delete origResponse.headers[headerName.toLowerCase()];
			// set the capitalized header name in the new response object
			response.setHeader(headerName, headers[i + 1]);
		}
	}

	// explicitly declare headers for cross-domain requests
	response.setHeader('Access-Control-Expose-Headers', headerNames.join(','));
};

module.exports.getURLParameters = function (queryString) {
	return _getURLParameters(queryString);
};
var _getURLParameters = function (queryString) {
	var params = {};
	if (!queryString || queryString.indexOf('=') < 0) {
		console.log(' queryString ' + queryString + ' is empty or not valid');
		return params;
	}
	var parts = queryString.split('&');
	for (var i = 0; i < parts.length; i++) {
		var nameval = parts[i].split('='),
			name = nameval[0],
			val = nameval[1] || '';
		params[name] = decodeURIComponent(val);
	}
	// console.log(params);
	return params;
};

/**
 * Update itemGUID in _folder.json for a give item in /src
 * @param type type of the item (template, theme, component)
 * @param name name of the item
 */
module.exports.updateItemFolderJson = function (type, name, propName, propValue) {
	"use strict";
	if (type !== 'template' && type !== 'theme' && type !== 'component') {
		console.log('updateItemFolderJson: invalid type ' + type);
		return false;
	}
	if (!name) {
		console.log('updateItemFolderJson: no name is specified');
		return false;
	}

	var file = path.join(type === 'template' ? templatesDir : (type === 'theme' ? themesDir : componentsDir), name, '_folder.json');
	// console.log('file=' + file);
	if (!fs.existsSync(file)) {
		console.error('ERROR: file does not exist ' + file);
		return false;
	}

	var folderstr = fs.readFileSync(file),
		folderjson = JSON.parse(folderstr),
		oldGUID = folderjson.itemGUID,
		newGUID = _createGUID();
	folderjson.itemGUID = newGUID;
	console.log(' - update ' + type + ' GUID ' + oldGUID + ' to ' + newGUID);
	if (propName && folderjson.hasOwnProperty(propName)) {
		var oldValue = folderjson[propName];
		folderjson[propName] = propValue;
		console.log(' - update ' + type + ' ' + propName + ' ' + oldValue + ' to ' + propValue);
	}
	fs.writeFileSync(file, JSON.stringify(folderjson));
	return true;
};

/**
 * Get components in componentsDir.
 */
module.exports.getComponents = function () {
	"use strict";
	var components = [],
		items = fs.readdirSync(componentsDir);
	if (items) {
		items.forEach(function (name) {
			var folderpath = path.join(componentsDir, "/", name, "_folder.json");
			if (fs.existsSync(path.join(componentsDir, "/", name, "appinfo.json")) && fs.existsSync(folderpath)) {
				// get the component type
				var folderstr = fs.readFileSync(folderpath).toString(),
					folderjson = JSON.parse(folderstr),
					comptype = folderjson.appType;
				components.push({
					name: name,
					type: comptype
				});
			}
		});
	}

	if (components.length === 0) {
		console.error("No components found in " + componentsDir);
	}
	return components;
};

/**
 * Get all templates that use this component
 * @param compName
 */
module.exports.getComponentTemplates = function (compName) {
	var temps = [],
		compSrcDir = path.join(componentsDir, compName);

	if (!fs.existsSync(compSrcDir)) {
		console.log('getComponentTemplates: ERROR component ' + compName + ' does not exist');
		return temps;
	}

	var alltemps = _getTemplates();

	for (var i = 0; i < alltemps.length; i++) {
		var tempname = alltemps[i].name,
			tempcomps = _getTemplateComponents(tempname)
		for (var j = 0; j < tempcomps.length; j++) {
			if (tempcomps[j] === compName) {
				temps[temps.length] = alltemps[i].name;
			}
		}
	}
	return temps;
};

/**
 * Get templates in templatesDir.
 */
module.exports.getTemplates = function () {
	return _getTemplates();
};
var _getTemplates = function () {
	"use strict";
	var templates = [];
	var items = fs.readdirSync(templatesDir);
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(templatesDir + "/" + name + "/_folder.json")) {
				templates.push({
					name: name
				});
			}
		});
	}

	if (templates.length === 0) {
		console.error("No components found in " + templatesDir);
	}
	return templates;
};

/**
 * Get all custom components used by a template
 * @param templateName
 */
module.exports.getTemplateComponents = function (templateName) {
	return _getTemplateComponents(templateName);
}
var _getTemplateComponents = function (templateName) {
	var comps = [],
		tempSrcDir = path.join(templatesDir, templateName);

	if (!fs.existsSync(tempSrcDir)) {
		console.log('getTemplateComponents: template ' + templateName + ' does not exist');
		return comps;
	}

	var pages = fs.readdirSync(path.join(tempSrcDir, 'pages'));
	for (var i = 0; i < pages.length; i++) {
		var pagepath = path.join(tempSrcDir, 'pages', pages[i]),
			pagestr = fs.readFileSync(pagepath),
			pagejson = JSON.parse(pagestr),
			componentInstances = pagejson.componentInstances || {},
			compvalues;

		Object.keys(componentInstances).forEach(function (key) {
			compvalues = componentInstances[key];
			if (compvalues && (compvalues.type === 'scs-component' || compvalues.type === 'scs-componentgroup' || compvalues.type === 'scs-app') && compvalues.id) {
				var added = false;
				for (var j = 0; j < comps.length; j++) {
					if (compvalues.id === comps[j]) {
						added = true;
						break;
					}
				}
				if (!added) {
					comps[comps.length] = compvalues.id;
				}
			}
		});
	}

	// get all content layouts used by this template
	var contentmapfile = path.join(tempSrcDir, 'caas_contenttypemap.json');
	if (fs.existsSync(contentmapfile)) {
		var contenttypes = JSON.parse(fs.readFileSync(contentmapfile));
		for (var i = 0; i < contenttypes.length; i++) {
			var ctype = contenttypes[i];
			for (var j = 0; j < ctype.categoryList.length; j++) {
				var layout = ctype.categoryList[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}
		}
	}

	var summaryfile = path.join(tempSrcDir, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		var mappings = summaryjson.categoryLayoutMappings || [];
		for (var i = 0; i < mappings.length; i++) {
			var catelist = mappings[i].categoryList;
			for (var j = 0; j < catelist.length; j++) {
				var layout = catelist[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}
		}
	}

	comps.sort();

	// console.log('getTemplateComponents: template=' + templateName + ' components=' + JSON.stringify(comps));
	return comps;
};

/**
 * Get the icon of a template (_folder_icon.png or _folder_icon.jpg)
 * @param templateName
 */
module.exports.getTemplateIcon = function (templateName) {
	return _getTemplateIcon(templateName);
}

var _getTemplateIcon = function (templateName) {
	var icon = '',
		tempSrcDir = path.join(templatesDir, templateName);

	if (!fs.existsSync(tempSrcDir)) {
		console.log('getTemplateIcon: template ' + templateName + ' does not exist');
		return icon;
	}

	var files = fs.readdirSync(tempSrcDir),
		iconfile = '';
	for (var i = 0; i < files.length; i++) {
		if (files[i].indexOf('_folder_icon') === 0) {
			iconfile = path.join(tempSrcDir, files[i]);
			break;
		}
	}
	// console.log('iconfile=' + iconfile);
	if (iconfile && fs.existsSync(iconfile)) {
		icon = fs.readFileSync(iconfile);
	}

	return icon;
};

/**
 * Get all content items (across templates) that use this content layout 
 * @param layoutName
 */
module.exports.getContentLayoutItems = function (layoutName) {
	var items = [],
		layoutSrcDir = path.join(componentsDir, layoutName);

	if (!layoutName || !fs.existsSync(layoutSrcDir)) {
		console.log('getContentLayoutItems: content layout ' + layoutName + ' does not exist');
		return items;
	}
	console.log('getContentLayoutItems: ' + layoutName);

	// go through all templates
	var temps = fs.readdirSync(templatesDir),
		contenttypes = [];
	for (var i = 0; i < temps.length; i++) {
		var contentmapfile = path.join(templatesDir, temps[i], 'caas_contenttypemap.json');
		if (fs.existsSync(contentmapfile)) {
			var ctypes = JSON.parse(fs.readFileSync(contentmapfile));
			for (var j = 0; j < ctypes.length; j++) {
				var ctype = ctypes[j];
				for (var k = 0; k < ctype.categoryList.length; k++) {
					if (ctype.categoryList[k].layoutName === layoutName) {
						var found = false;
						for (var p = 0; p < contenttypes.length; p++) {
							found = found || (contenttypes[p].template === temps[i] && contenttypes[p].type === ctype.type);
						}
						if (!found) {
							contenttypes[contenttypes.length] = {
								template: temps[i],
								type: ctype.type
							};
						}
					}
				}
			}
		}
	}
	// console.log(contenttypes);
	if (contenttypes.length === 0) {
		console.log('getContentLayoutItems: content layout ' + layoutName + ' is not used by any content items');
		return items;
	}
	console.log(' - types: ' + JSON.stringify(contenttypes));

	for (var j = 0; j < contenttypes.length; j++) {
		var tempname = contenttypes[j].template,
			temppath = path.join(templatesDir, tempname),
			ctype = contenttypes[j].type,
			itemspath = path.join(temppath, 'assets', 'contenttemplate',
				'Content Template of ' + tempname, 'ContentItems', ctype);

		if (fs.existsSync(itemspath)) {
			var itemfiles = fs.readdirSync(itemspath);
			for (var k = 0; k < itemfiles.length; k++) {
				var itemjson = JSON.parse(fs.readFileSync(path.join(itemspath, itemfiles[k]))),
					found = false;

				for (var idx = 0; idx < items.length; idx++) {
					if (itemjson.id === items[idx].id) {
						found = true;
					}
				}

				if (!found) {
					items[items.length] = {
						id: itemjson.id,
						name: itemjson.name,
						type: itemjson.type,
						template: tempname,
						data: itemjson
					}
				}
			}
		}
	}

	// sort by item name
	if (items.length > 0) {
		var byName = items.slice(0);
		byName.sort(function (a, b) {
			var x = a.name;
			var y = b.name;
			return (x < y ? -1 : x > y ? 1 : 0);
		});
		items = byName;

		var msgs = '';
		for (var i = 0; i < items.length; i++) {
			msgs = msgs + items[i].type + ':' + items[i].name + ' ';
		}
		console.log(' - items ' + msgs);
	}

	return items;
};

/**
 * Get all content types (across templates)
 */
module.exports.getContentTypes = function () {
	return _getContentTypes();
};
var _getContentTypes = function () {
	var types = [],
		alltemps = _getTemplates();

	for (var i = 0; i < alltemps.length; i++) {
		var tempname = alltemps[i].name,
			typespath = path.join(templatesDir, tempname, 'assets', 'contenttemplate',
				'Content Template of ' + tempname, 'ContentTypes');
		if (fs.existsSync(typespath)) {
			var typefiles = fs.readdirSync(typespath);
			for (var j = 0; j < typefiles.length; j++) {
				var typejson = JSON.parse(fs.readFileSync(path.join(typespath, typefiles[j])));
				types[types.length] = {
					template: tempname,
					type: typejson
				};
			}
		}
	}
	// console.log(' - getContentTypes: total content types: ' + types.length);
	return types;
};


/**
 * Get a content types (from a template)
 * @param typeName the content type name
 * @param templateName the template name, if not specified, return the first type with the name
 */
module.exports.getContentType = function (typeName, templateName) {
	var contenttype = {},
		alltypes = _getContentTypes()

	for (var i = 0; i < alltypes.length; i++) {
		if (typeName === alltypes[i].type.name &&
			(!templateName || templateName === alltypes[i].template)) {
			contenttype = alltypes[i].type;
			break;
		}
	}

	return contenttype;
};

/**
 * Get content types from server
 */
module.exports.getContentTypesFromServer = function (callback) {
	var server = _getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		return;
	}
	var client = new Client({
		user: server.username,
		password: server.password
	});
	var url = server.url + '/content/management/api/v1.1/types?limit=9999';
	client.get(url, function (data, response) {
		var types = [];
		if (response && response.statusCode === 200) {
			types = data && data.items;
		} else {
			// console.log('status=' + response.statusCode + ' err=' + err);
			console.log('ERROR: failed to query content types');
		}
		callback(types);
	});
};

/**
 * Get content type from server
 */
module.exports.getContentTypeFromServer = function (server, typename) {
	var contentTypePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			resolve({
				err: 'no server'
			});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/types/' + typename;
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				// console.log('status=' + response.statusCode);
				resolve({
					err: 'type ' + typename + ' does not exist'
				});
			}
		});
	});
	return contentTypePromise;
};


/**
 * Get all fields of a content types from server
 */
module.exports.getContentTypeFieldsFromServer = function (typename, callback) {
	var server = _getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		return;
	}
	var client = new Client({
		user: server.username,
		password: server.password
	});
	var url = server.url + '/content/management/api/v1.1/types/' + typename;
	client.get(url, function (data, response) {
		var fields = [];
		if (response && response.statusCode === 200 && data && data.fields) {
			fields = data.fields;
		} else {
			// console.log('status=' + response.statusCode + ' err=' + err);
		}
		callback(fields);
	});
};

module.exports.getCaasCSRFToken = function (server) {
	var csrfTokenPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/token';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				return resolve(data);
			} else {
				console.log('ERROR: Failed to get CSRF token, status=' + response.statusCode);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return csrfTokenPromise;
};

/**
 * Check if node server is up
 */
var _isNodeServerUp = function (callback) {
	ps.lookup({
		command: 'node'
	}, function (err, resultList) {
		if (err) {
			console.log('ERROR: ' + err);
			return callback(false);
		}

		var result = false;
		resultList.forEach(function (process) {
			if (process) {
				// console.log('PID: %s, COMMAND: %s, ARGUMENTS: %s', process.pid, process.command, process.arguments);
				if (process.command === 'node' && JSON.stringify(process.arguments).indexOf('test/server.js') >= 0) {
					result = true;
				}
			}
		});
		//console.log('_isNodeServerUp: result=' + result);
		callback(result);
	});
};

module.exports.isNodeServerUp = function () {
	"use strict";
	return _isNodeServerUp();
};


module.exports.getDocumentRendition = function (app, doc, callback) {
	var url = '';

	if (!app.locals.connectToServer) {
		console.log(' - No remote server to get document rendition');
		return;
	}

	var client = new Client(),
		docname = doc.name,
		resturl = 'http://localhost:8085/documents/api/1.2/folders/search/items?fulltext=' + encodeURIComponent(docname);
	// console.log(' -- get document id ');

	client.get(resturl, function (data, response) {
		if (response && response.statusCode === 200) {
			if (data && data.totalCount > 0) {
				var docobj
				for (var j = 0; j < data.items.length; j++) {
					if (data.items[j].name && data.items[j].name.indexOf(docname) === 0) {
						docobj = data.items[j];
						break;
					}
				}
				if (!docobj) {
					console.log(' -- failed to get metadata for ' + docname);
					doc.valid = false;
					callback(doc);
				} else {
					doc.valid = true;
					doc.id = docobj.id;
				}
				docname = docobj.name;

				// check of the rendition exists
				var page = 'page1';
				resturl = 'http://localhost:8085/documents/api/1.2/files/' + doc.id + '/data/rendition?rendition=' + page;
				// console.log(' -- get document rendition');
				client.get(resturl, function (data, response) {
					if (response && response.statusCode === 200) {
						console.log(' -- rendition exists, doc: ' + docname + ' page: ' + page);
						doc.renditionReady = true;
						callback(doc);
					} else {
						console.log(' -- no rendition for ' + docname + '/' + page + ' yet. Creating...');
						// create redition
						resturl = 'http://localhost:8085/documents/api/1.2/files/' + doc.id + '/pages';
						var args = {
							data: {
								IsJson: 1
							},
							headers: {
								'Authorization': "Basic " + btoa(app.locals.server.username + ":" + app.locals.server.password)
							}
						};
						client.post(resturl, function (data, response) {
							doc.finished = true;
							if (response && response.statusCode === 200) {
								setTimeout(function () {
									// waiting rendition to be created
									console.log(' -- rendition created, doc: ' + docname);
									url = '/documents/web?IdcService=GET_RENDITION&AuxRenditionType=system&item=fFileGUID:' + doc.id + '&Rendition=' + page;
									doc.renditionReady = true;
									callback(doc);
								}, 3000); // 3 second
							} else {
								console.log(' -- failed to create rendition: ' + response.statusCode);
								doc.renditionReady = false;
								callback(doc);
							}
						});
					}
				});
			} else {
				console.log(' -- no document found with name ' + docname);
				doc.valid = false;
				callback(doc)
			}
		} else {
			console.log(' -- failed to get metadata for ' + docname);
			doc.valid = false;
			callback(doc);
		}
	});

};

/**
 * Get custom components associated with a theme
 * @param {*} themeName 
 */
module.exports.getThemeComponents = function (themeName) {
	var componentsjsonfile = path.join(themesDir, themeName, 'components.json'),
		themeComps = [],
		comps = [];
	if (fs.existsSync(componentsjsonfile)) {
		var str = fs.readFileSync(componentsjsonfile).toString().trim(),
			filecontent = str ? JSON.parse(str) : [];
		if (filecontent && !Array.isArray(filecontent)) {
			themeComps = filecontent.components || [];
		} else {
			themeComps = filecontent;
		}
		themeComps.forEach(function (comp) {
			if (comp.list && comp.list.length > 0) {
				comp.list.forEach(function (listcomp) {
					if (listcomp.themed) {
						comps.push({
							id: listcomp.id,
							type: listcomp.type,
							category: comp.name
						});
					}
				});
			}
		});
	} else {
		console.log(' - file ' + componentsjsonfile + ' does not exist');
	}
	// console.log(comps);
	return comps;
};


/**
 * Upload a local file to the personal folder on the server
 * @param {*} filePath 
 */
module.exports.uploadFileToServer = function (request, server, folderPath, filePath) {
	"use strict";

	var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

	var folder = folderPath;
	if (folder && folder.charAt(0) === '/') {
		folder = folder.substring(1);
	}
	if (folder && folder.charAt(folder.length - 1) === '/') {
		folder = folder.substring(0, folder.length - 1);
	}

	var uploadPromise = new Promise(function (resolve, reject) {

		var dUser = '';
		var idcToken;

		var express = require('express');
		var app = express();

		var port = '9393';
		var localhost = 'http://localhost:' + port;

		app.get('/documents/web', function (req, res) {
			// console.log('GET: ' + req.url);
			var url = server.url + req.url;
			var options = {
				url: url,
				'auth': {
					bearer: server.oauthtoken
				}
			};

			request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					_fixHeaders(response, res);
				})
				.on('error', function (err) {
					console.log(err);
					res.write({
						err: err
					});
					res.end();
				})
				.pipe(res);
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('CHECKIN_UNIVERSAL') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				var fileId = params.fileId;
				var filePath = params.filePath;
				var fileName = params.fileName;
				var folderId = params.folderId;
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
						_fixHeaders(response, res);
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - upload finished: '+filePath);
						res.end();
					});

			}
		});

		var localServer = app.listen(port, function () {
			// get the personal folder id
			var folderUrl = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';
			var options = {
				url: folderUrl
			};
			if (server.env === 'pod_ec') {
				options['auth'] = {
					bearer: server.oauthtoken
				};
			}

			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get user id ');
					console.log(err);
					return resolve({
						err: 'err'
					});
				}
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					var folderId = 'F:USER:' + dUser;
					// console.log(' - folder id: ' + folderId + ' idcToken: ' + idcToken);

					var queryFolderPromise = _queryFolderId(request, server, localhost, folder);
					queryFolderPromise.then(function (result) {
						if (result.err) {
							return resolve({
								err: 'err'
							});
						}
						folderId = result.folderId || folderId;

						// check if the file exists 
						var filesUrl = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&IsJson=1&item=fFolderGUID:' + folderId;

						options.url = filesUrl;
						var fileId;
						request.get(options, function (err, response, body) {
							if (err) {
								console.log('ERROR: Failed to get personal files');
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
								console.log('ERROR: Failed to get personal files ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
								return resolve({
									err: 'err'
								});
							}

							var dRoleName = data.LocalData.dRoleName;
							if (dRoleName !== 'owner' && dRoleName !== 'manager' && dRoleName !== 'contributor') {
								console.log('ERROR: no permission to upload to ' + (folder ? 'folder ' + folder : 'home folder'));
								return resolve({
									err: 'err'
								});
							}

							fileId = _getFileIdFromResultSets(data, fileName);
							var folderId = _getFolderIdFromFolderInfo(data) || ('F:USER:' + dUser);
							// console.log('folder: ' + (folder ? folder : 'home') + ' id: ' + folderId);

							// now upload the file
							var uploadUrl = localhost + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
							uploadUrl += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName;

							request.post(uploadUrl, function (err, response, body) {
								if (err) {
									console.log('ERROR: Failed to upload');
									console.log(err);
									return resolve({
										err: 'err'
									});
								}
								if (response && response.statusCode === 200) {
									var data = JSON.parse(body);
									var version = data && data.LocalData && data.LocalData.dRevLabel;
									console.log(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + version);
									return resolve(data);
								} else {
									console.log(' - failed to upload: ' + response.statusCode);
									return resolve({
										err: 'err'
									});
								}
							}); // checkin request
						}); // query file id
					}); // query folder id
				}
			}); // get user id
		}); // local server
	});
	return uploadPromise;
};


/**
 * Get the attribute of a component
 * @param data the result from API SCS_BROWSE_APPS or SCS_ACTIVATE_COMPONENT
 * @param fieldName
 */
module.exports.getComponentAttribute = function (data, fieldName) {
	return _getComponentAttribute(data, fieldName);
};
var _getComponentAttribute = function (data, fieldName) {
	var compAttr;
	var appInfo = data && data.ResultSets && data.ResultSets.AppInfo;
	if (appInfo && appInfo.rows.length > 0) {
		var fieldIdx = -1;
		var fields = appInfo.fields;
		for (var i = 0; i < fields.length; i++) {
			if (fields[i].name === fieldName) {
				fieldIdx = i;
				break;
			}
		}
		if (fieldIdx >= 0 && fieldIdx < appInfo.rows[0].length) {
			compAttr = appInfo.rows[0][fieldIdx];
		}
	}
	return compAttr;
};

/**
 * Import a template with the zip file
 * @param fileId
 * @param idcToken
 */
module.exports.importTemplateToServer = function (request, server, fileId, idcToken) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
		var data = {
			'item': 'fFileGUID:' + fileId,
			'idcToken': idcToken,
			'useBackgroundThread': true,
			'ThemeConflictResolution': 'overwrite',
			'TemplateConflictResolution': 'overwrite',
			'DefaultComponentConflictResolution': true
		};
		var postData = {
			'form': data
		};

		request.post(importUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.log('ERROR: Failed to import template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve(data);
			}

			var jobId = data.LocalData.JobID;
			var importStatusPromise = _getTemplateImportStatus(request, server.url, jobId);
			importStatusPromise.then(function (statusResult) {
				resolve(statusResult);
			});
		});
	});

	return importPromise;
};

/**
 * Import a component with the zip on the dev server
 * @param fileId
 * @param idcToken
 */
module.exports.importComponentToServer = function (request, server, fileId, idcToken) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
		var data = {
			'item': 'fFileGUID:' + fileId,
			'idcToken': idcToken,
			'ComponentConflictResolution': 'overwrite'
		};
		var postData = {
			'form': data
		};

		request.post(importUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data = JSON.parse(body);
			return resolve(data);
		});
	});

	return importPromise;
};

/**
 * Publish a component on the dev server
 * @param fileId
 * @param idcToken
 */
module.exports.publishComponentOnServer = function (request, server, componentFolderGUID, idcToken) {
	"use strict";

	var publishPromise = new Promise(function (resolve, reject) {
		var publishUrl = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
		var data = {
			'item': 'fFolderGUID:' + componentFolderGUID,
			'idcToken': idcToken
		};
		var postData = {
			'form': data
		};

		request.post(publishUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data = JSON.parse(body);
			return resolve(data);
		});
	});

	return publishPromise;
};

module.exports.loginToDevServer = function (server, request) {
	var loginPromise = new Promise(function (resolve, reject) {
		// open user session
		request.post(server.url + '/cs/login/j_security_check', {
			form: {
				j_character_encoding: 'UTF-8',
				j_username: server.username,
				j_password: server.password
			}
		}, function (err, resp, body) {
			if (err) {
				console.log(' - Failed to login to ' + server.url);
				return resolve({
					'status': false
				});
			}
			// we expect a 303 response
			if (resp && resp.statusCode === 303) {
				var location = server.url + '/adfAuthentication?login=true';

				request.get(location, function (err, response, body) {
					if (err) {
						console.log(' - failed to login to ' + server.url);
						return resolve({
							'status': false
						});
					}

					console.log(' - Logged in to remote server: ' + server.url);
					return resolve({
						'status': true
					});
				});
			} else {
				return resolve({
					'status': false
				});
			}
		});
	});
	return loginPromise;
};

module.exports.loginToPODServer = function (server) {
	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = '#idcs-signin-basic-signin-form-username',
			passwordid = '#idcs-signin-basic-signin-form-password',
			submitid = '#idcs-signin-basic-signin-form-submit',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		async function loginServer() {
			try {
				browser = await puppeteer.launch({
					ignoreHTTPSErrors: true,
					headless: false
				});
				const page = await browser.newPage();
				await page.setViewport({
					width: 960,
					height: 768
				});

				await page.goto(url);

				await page.waitForSelector(usernameid);
				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: 12000
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl);
				await page.waitForSelector('pre');

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;

				await browser.close();

				if (!token || token.toLowerCase().indexOf('error') >= 0) {
					console.log('ERROR: failed to get the OAuth token');
					return resolve({
						'status': false
					});
				}

				console.log(' - connect to remote server: ' + server.url);

				return resolve({
					'status': true
				});

			} catch (err) {
				console.log('ERROR: failed to connect to the server');
				console.log(err);
				if (browser) {
					await browser.close();
				}
				return resolve({
					'status': false
				});
			}
		}
		loginServer();
		/* jshint ignore:end */
	});
	return loginPromise;
};


/**
 * Upload a local file to the personal folder on the server
 * @param server the server info
 * @param type template or component
 * @param filePath 
 */
module.exports.importToPODServer = function (server, type, folder, imports, publishComponent) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var filePath;
		var fileName;
		var objectName;
		var dUser = '';
		var idcToken;
		var fileId = '';
		var importedFileId;
		var importedCompFolderId;

		var express = require('express');
		var app = express();
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

		var port = '8181';
		var localhost = 'http://localhost:' + port;

		var params, url;

		app.get('/documents/web', function (req, res) {
			// console.log('GET: ' + req.url);
			var url = server.url + req.url;
			var options = {
				url: url,
				'auth': {
					bearer: server.oauthtoken
				}
			};

			request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					_fixHeaders(response, res);
				})
				.on('error', function (err) {
					console.log(err);
					res.write({
						err: err
					});
					res.end();
				})
				.pipe(res);
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('CHECKIN_UNIVERSAL') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				fileId = params.fileId;
				filePath = params.filePath;
				fileName = params.fileName;
				var folderId = params.folderId;
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
						_fixHeaders(response, res);
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - upload finished: '+filePath);
						res.end();
					});

			} else if (req.url.indexOf('SCS_IMPORT_TEMPLATE_PACKAGE') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedFileId = params.importedFileId;
				var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
				var data = {
					'item': 'fFileGUID:' + importedFileId,
					'idcToken': idcToken,
					'useBackgroundThread': true,
					'ThemeConflictResolution': 'overwrite',
					'TemplateConflictResolution': 'overwrite',
					'DefaultComponentConflictResolution': true
				};
				var postData = {
					method: 'POST',
					url: importUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - template import finished');
						res.end();
					});

			} else if (req.url.indexOf('SCS_IMPORT_COMPONENT') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedFileId = params.importedFileId;
				var importCompUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
				var data = {
					'item': 'fFileGUID:' + importedFileId,
					'idcToken': idcToken,
					'ComponentConflictResolution': 'overwrite'
				};
				var postData = {
					method: 'POST',
					url: importCompUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - component import finished');
						res.end();
					});
			} else if (req.url.indexOf('SCS_ACTIVATE_COMPONENT') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedCompFolderId = params.importedCompFolderId;
				var publishCompUrl = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
				var data = {
					'item': 'fFolderGUID:' + importedCompFolderId,
					'idcToken': idcToken
				};
				var postData = {
					method: 'POST',
					url: publishCompUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - component publish finished');
						res.end();
					});
			}
		});
		var socketNum = 0;
		var localServer = app.listen(port, function () {
			// console.log(' - start ' + localhost + ' for import...');
			console.log(' - establishing user session');
			var total = 0;
			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {}

					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						_import();
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						return resolve({});
					}
				});
			}, 6000);

			var _import = function () {
				var queryFolderPromise = _queryFolderId(request, server, localhost, folder);
				queryFolderPromise.then(function (result) {
					if (result.err) {
						return resolve({
							err: 'err'
						});
					}
					var folderId = result.folderId || ('F:USER:' + dUser);

					var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&item=fFolderGUID:' + folderId;

					request.get(url, function (err, response, body) {
						if (err) {
							console.log('ERROR: Failed to get personal files ');
							console.log(err);
							return resolve({});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {}

						if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
							console.log('ERROR: Failed to get personal files ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
							return resolve({
								err: 'err'
							});
						}

						var dRoleName = data.LocalData.dRoleName;
						if (dRoleName !== 'owner' && dRoleName !== 'manager' && dRoleName !== 'contributor') {
							console.log('ERROR: no permission to upload to ' + (folder ? 'folder ' + folder : 'home folder'));
							return resolve({
								err: 'err'
							});
						}

						// upload the file
						var importsPromise = [];
						var folderId = _getFolderIdFromFolderInfo(data) || ('F:USER:' + dUser);
						// console.log('folder: ' + (folder ? folder : 'home') + ' id: ' + folderId);

						for (var i = 0; i < imports.length; i++) {
							fileId = _getFileIdFromResultSets(data, fileName);
							filePath = imports[i].zipfile;
							objectName = imports[i].name;
							fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
							fileId = _getFileIdFromResultSets(data, fileName);
							// console.log('fileName: ' + fileName + ' fileId: ' + fileId);

							importsPromise[i] = _importOneObjectToPodServer(localhost, request, type, objectName, folder, folderId, fileId, filePath, publishComponent);
						}

						// Execute parallelly
						Promise.all(importsPromise).then(function (values) {
							// All done
							resolve({});
						});
					}); // query file
				}); // query folder
			}; // _import
		});
		localServer.setTimeout(0);

	});

	return importPromise;
};

var _timeUsed = function (start, end) {
	var timeDiff = end - start; //in ms
	// strip the ms
	timeDiff /= 1000;

	// get seconds 
	var seconds = Math.round(timeDiff);
	return seconds.toString() + 's';
};

var _importOneObjectToPodServer = function (localhost, request, type, name, folder, folderId, fileId, filePath, publishComponent) {
	var importOnePromise = new Promise(function (resolve, reject) {
		var startTime;

		// Upload the zip file first
		var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
		var url = localhost + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
		url += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName;
		startTime = new Date();
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to upload ' + filePath);
				console.log(err);
				return resolve({});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var version = data && data.LocalData && data.LocalData.dRevLabel;
				var uploadedFileName = data && data.LocalData && data.LocalData.dOriginalName;
				console.log(' - file ' + uploadedFileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + version + ' (' + _timeUsed(startTime, new Date()) + ')');
				var importedFileId = data && data.LocalData && data.LocalData.fFileGUID;

				// import
				if (importedFileId) {
					if (type === 'template') {
						url = localhost + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
					} else {
						url = localhost + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
					}
					url += '&importedFileId=' + importedFileId;
					startTime = new Date();
					request.post(url, function (err, response, body) {
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {}
						if (!data || data.err || !data.LocalData || data.LocalData.StatusCode !== '0') {
							console.log(' - failed to import  ' + (data && data.LocalData ? ('- ' + data.LocalData.StatusMessage) : err));
							return resolve({});
						}

						if (type === 'template') {
							var jobId = data.LocalData.JobID;
							var importTempStatusPromise = _getTemplateImportStatus(request, localhost, jobId);
							importTempStatusPromise.then(function (data) {
								if (data && data.LocalData) {
									if (data.LocalData.StatusCode !== '0') {
										console.log(' - failed to import ' + name + ': ' + importResult.LocalData.StatusMessage);
									} else if (data.LocalData.ImportConflicts) {
										console.log(data.LocalData);
										console.log(' - failed to import ' + name + ': the template already exists and you do not have privilege to override it');
									} else {
										console.log(' - template ' + name + ' imported (' + _timeUsed(startTime, new Date()) + ')');
									}
								}
								return resolve({});
							});
						} else {
							console.log(' - finished import component');
							//
							// Process import component result
							//
							if (data && data.LocalData) {
								if (data.LocalData.StatusCode !== '0') {
									console.log(' - failed to import ' + name + ': ' + data.LocalData.StatusMessage);
									return resolve({});
								} else if (data.LocalData.ImportConflicts) {
									console.log(' - failed to import ' + name + ': the component already exists and you do not have privilege to override it');
									return resolve({});
								} else {
									console.log(' - component ' + name + ' imported (' + _timeUsed(startTime, new Date()) + ')');
									var importedCompFolderId = _getComponentAttribute(data, 'fFolderGUID');

									if (publishComponent && importedCompFolderId) {
										// publish the imported component
										url = localhost + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
										url += '&importedCompFolderId=' + importedCompFolderId;
										startTime = new Date();
										request.post(url, function (err, response, body) {
											if (err) {
												console.log(' - failed to publish ' + name + ': ' + err);
												return resolve({});
											}
											if (response.statusCode !== 200) {
												console.log(' - failed to publish ' + name + ': status code ' + response.statusCode + ' ' + response.statusMessage);
												return resolve({});
											}
											var publishResult = JSON.parse(body);
											if (publishResult.err) {
												console.log(' - failed to import ' + name + ': ' + err);
												return resolve({});
											}
											if (publishResult.LocalData && publishResult.LocalData.StatusCode !== '0') {
												console.log(' - failed to publish: ' + publishResult.LocalData.StatusMessage);
											} else {
												console.log(' - component ' + name + ' published (' + _timeUsed(startTime, new Date()) + ')');
											}
											return resolve({});
										});
									} else {
										return resolve({});
									}
								}
							} else {
								console.log(' - failed to import ' + name);
								return resolve({});
							}
						}
					});
				} else {
					console.log('ERROR: Failed to upload ' + filePath);
					return resolve({});
				}
			} else {
				console.log(' - failed to upload ' + filePath + ': ' + response && response.statusCode);
				return resolve({});
			}
		});
	});

	return importOnePromise;
};

/**
 * Use API FLD_BROWSE to get child folders
 * @param {*} request 
 * @param {*} server 
 * @param {*} host 
 * @param {*} folerId 
 */
function _browseFolder(request, server, host, folderId, folderName) {
	var foldersPromise = new Promise(function (resolve, reject) {
		var url = host + '/documents/web?IdcService=FLD_BROWSE&itemType=Folder&item=fFolderGUID:' + folderId;
		var options = {
			url: url
		};
		if (server.env === 'pod_ec') {
			options['auth'] = {
				bearer: server.oauthtoken
			};
		}

		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query folder ' + folderName);
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

			resolve(data);

		});
	});
	return foldersPromise;
}

/**
 * Get the id of the last folder in the folder path folder1/folder2/.../folder[n]
 * @param {*} request 
 * @param {*} server 
 * @param {*} host 
 * @param {*} folderPath 
 */
var _queryFolderId = function (request, server, host, folderPath) {
	var folderIdPromise = new Promise(function (resolve, reject) {
		if (!folderPath) {
			return resolve({
				folderId: ''
			});
		}

		var folderNames = folderPath.split('/');

		// First query user personal folder home
		var url = host + '/documents/web?IdcService=FLD_BROWSE_PERSONAL&itemType=Folder';
		var options = {
			url: url
		};
		if (server.env === 'pod_ec') {
			options['auth'] = {
				bearer: server.oauthtoken
			};
		}
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query home folder');
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query home folder');
				return resolve({
					err: 'err'
				});
			}

			// The top folder
			var folderId = _getFolderIdFromResultSets(data, folderNames[0]);

			if (!folderId) {
				console.log('ERROR: folder ' + folderNames[0] + ' does not exist');
				return resolve({
					err: 'err'
				});
			}

			if (folderNames.length === 1) {
				return resolve({
					folderId: folderId
				});
			}

			var folderName = folderNames[0];

			// Varify and get sub folders 
			/* jshint ignore:start */
			async function _querysubFolders(request, server, host, parentFolderId, folderNames) {
				var id = parentFolderId,
					name = folderNames[0];
				// console.log('Folder: ' + folderNames[0] + ' id: ' + parentFolderId);
				for (var i = 1; i < folderNames.length; i++) {
					var result = await _browseFolder(request, server, host, id, name);
					if (result.err) {
						return ({
							err: 'err'
						});
					}
					id = _getFolderIdFromResultSets(result, folderNames[i]);
					if (!id) {
						console.log('ERROR: folder ' + folderNames[i] + ' does not exist');
						return ({
							err: 'err'
						});
					}
					// console.log('Folder: ' + folderNames[i] + ' id: ' + id);
					name = folderNames[i];
				}
				return ({
					folderId: id
				});
			};
			_querysubFolders(request, server, host, folderId, folderNames).then((result) => {
				if (result.err) {
					return resolve({
						err: 'err'
					});
				}
				return resolve(result);
			});
			/* jshint ignore:end */

		});

	});
	return folderIdPromise;
};

/** 
 * Get the file id with the file name
 * @param data the JSON result from FLD_BROWSER
 * @param fileName the file name to match
 */
var _getFileIdFromResultSets = function (data, fileName) {
	var fileId = '';
	if (data && data.LocalData && data.LocalData.TotalChildFilesCount > 0) {
		var files = data.ResultSets && data.ResultSets.ChildFiles;
		var fFileGUIDIdx, fFileNameIdx;
		for (var i = 0; i < files.fields.length; i++) {
			if (files.fields[i].name === 'fFileGUID') {
				fFileGUIDIdx = i;
			} else if (files.fields[i].name === 'fFileName') {
				fFileNameIdx = i;
			}
			if (fFileGUIDIdx && fFileNameIdx) {
				break;
			}
		}
		for (var i = 0; i < files.rows.length; i++) {
			var obj = files.rows[i];
			if (obj[fFileNameIdx] === fileName) {
				fileId = obj[fFileGUIDIdx];
				// console.log(' - File ' + fileName + ' exists, ID: ' + fileId);
				break;
			}
		}
	}
	return fileId;
};

/** 
 * Get the folder id from FolderInfo
 * @param data the JSON result from FLD_BROWSER
 */
var _getFolderIdFromFolderInfo = function (data) {
	var folderId = '';
	if (data && data.ResultSets && data.ResultSets.FolderInfo) {
		var folderInfo = data.ResultSets.FolderInfo;
		for (var i = 0; i < folderInfo.fields.length; i++) {
			if (folderInfo.fields[i].name === 'fFolderGUID') {
				folderId = folderInfo.rows[0][i];
				break;
			}
		}
	}
	return folderId;
};

/**
 * Get the id of a folder in the browse result with a specific name
 * @param {*} data the JSON result from FLD_BROWSER
 * @param {*} folderName 
 */
var _getFolderIdFromResultSets = function (data, folderName) {
	var result;

	var folders = data && data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
	if (!folders || folders.length === 0) {
		return result;
	}
	var fields = data.ResultSets.ChildFolders.fields;
	var fFolderGUIDIdx, fFolderNameIdx;
	var i;
	for (i = 0; i < fields.length; i++) {
		if (fields[i].name === 'fFolderName') {
			fFolderNameIdx = i;
		} else if (fields[i].name === 'fFolderGUID') {
			fFolderGUIDIdx = i;
		}
	}

	var folderId;
	for (i = 0; i < folders.length; i++) {
		if (folders[i][fFolderNameIdx] === folderName) {
			folderId = folders[i][fFolderGUIDIdx];
			break;
		}
	}

	return folderId;
};

module.exports.sleep = function (delay) {
	_sleep(delay);
};
var _sleep = function (delay) {
	var start = new Date().getTime();
	while (true) {
		if (new Date().getTime() >= start + delay) {
			break;
		}
	}
};
/**
 * 
 * @param {*} jobId 
 */
var _getTemplateImportStatus = function (request, host, jobId) {
	var importStatusPromise = new Promise(function (resolve, reject) {
		var gap = 5000;
		var limit = 50;
		var trials = [];
		for (var i = 0; i < limit; i++) {
			if (limit > 22) {
				gap = 7000;
			}
			trials.push({
				request: request,
				host: host,
				jobId: jobId,
				index: i + 1,
				delay: gap
			});
		}

		var initialTask = _getBackgroundServiceStatus(request, host, jobId);

		trials.reduce(function (jobStatusPromise, nextParam) {
			return jobStatusPromise.then(function (result) {
				// console.log(result);
				if (!result || result.err) {

				} else if (result.status === 'COMPLETE' || result.status === 'FAILED') {
					return resolve({
						status: result.status,
						LocalData: result.LocalData
					});
				} else {
					var trail = '';
					for (var i = 0; i < nextParam.index; i++) {
						trail += '.';
					}
					var msg = result.status === 'PROCESSING' ? (result.status + ' percentage: ' + result.percentage) : (result.status + ' ' + trail);
					console.log(' - importing: ' + msg);

					_sleep(nextParam.delay);
					return _getBackgroundServiceStatus(nextParam.request, nextParam.host, nextParam.jobId);
				}
			});
		}, initialTask);
	});
	return importStatusPromise;
};

var _getBackgroundServiceStatus = function (request, host, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = host + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS&JobID=' + jobId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get job status ');
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
				console.log('ERROR: Failed to get job status ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var status;
			var percentage;
			var jobInfo = data.ResultSets && data.ResultSets.JobInfo;
			if (jobInfo) {
				var statusIdx, percentageIdx;
				for (var i = 0; i < jobInfo.fields.length; i++) {
					if (jobInfo.fields[i].name === 'JobStatus') {
						statusIdx = i;
					} else if (jobInfo.fields[i].name === 'JobPercentage') {
						percentageIdx = i;
					}
				}
				status = statusIdx ? jobInfo.rows[0][statusIdx] : '';
				percentage = percentageIdx ? jobInfo.rows[0][percentageIdx] : '';
			}
			return resolve({
				'status': status,
				'percentage': percentage,
				'LocalData': data.LocalData
			});
		});
	});
	return statusPromise;
};
