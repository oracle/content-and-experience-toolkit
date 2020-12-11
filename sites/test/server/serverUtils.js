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
	crypto = require('crypto'),
	os = require('os'),
	fs = require('fs'),
	fsp = require('fs').promises,
	fse = require('fs-extra'),
	he = require('he'),
	path = require('path'),
	readline = require('readline'),
	uuid4 = require('uuid/v4'),
	puppeteer = require('puppeteer'),
	url = require('url'),
	_ = require('underscore'),
	sitesRest = require('./sitesRest.js');

var componentsDir,
	connectionsDir,
	connectorsDir,
	serversDir,
	templatesDir,
	themesDir,
	loginReported = false; // only report logging in once

var _setupSourceDir = function (projectDir) {
	if (projectDir) {
		var srcfolder = _getSourceFolder(projectDir);

		componentsDir = path.join(srcfolder, 'components');
		connectionsDir = path.join(srcfolder, 'connections');
		connectorsDir = path.join(srcfolder, 'connectors');
		serversDir = path.join(srcfolder, 'servers');
		templatesDir = path.join(srcfolder, 'templates');
		themesDir = path.join(srcfolder, 'themes');
	}
};


/**
 * Get the source folder.
 */
module.exports.getSourceFolder = function (currPath) {
	return _getSourceFolder(currPath);
};
var _getSourceFolder = function (currPath) {
	// var newSrc = _isNewSource(currPath);
	// var srcfolder = newSrc ? path.join(currPath, 'src') : path.join(currPath, 'src', 'main');
	var srcfolder = path.join(currPath, 'src');
	if (!fs.existsSync(srcfolder)) {
		fse.mkdirSync(srcfolder);
	}
	if (!fs.existsSync(path.join(srcfolder, 'components'))) {
		fse.mkdirSync(path.join(srcfolder, 'components'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'connections'))) {
		fse.mkdirSync(path.join(srcfolder, 'connections'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'connectors'))) {
		fse.mkdirSync(path.join(srcfolder, 'connectors'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'content'))) {
		fse.mkdirSync(path.join(srcfolder, 'content'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'documents'))) {
		fse.mkdirSync(path.join(srcfolder, 'documents'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'servers'))) {
		fse.mkdirSync(path.join(srcfolder, 'servers'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'templates'))) {
		fse.mkdirSync(path.join(srcfolder, 'templates'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'themes'))) {
		fse.mkdirSync(path.join(srcfolder, 'themes'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'translationJobs'))) {
		fse.mkdirSync(path.join(srcfolder, 'translationJobs'));
	}

	return srcfolder;
};

/**
 * Get the build folder.
 */
module.exports.getBuildFolder = function (currPath) {
	return _getBuildFolder(currPath);
};
var _getBuildFolder = function (currPath) {
	var newSrc = _isNewSource(currPath);
	var buildFolder = newSrc ? path.join(currPath, 'build') : path.join(currPath, 'src', 'build');
	return buildFolder;
};

/**
 * Check if the project uses the new src structure
 */
module.exports.isNewSource = function (currPath) {
	return _isNewSource(currPath);
};
var _isNewSource = function (currPath) {
	var newSrc = true;
	var packageFile = path.join(currPath, 'package.json');
	if (fs.existsSync(packageFile)) {
		var packageJSON = JSON.parse(fs.readFileSync(packageFile));
		if (packageJSON && packageJSON.name === 'cec-sites-toolkit') {
			newSrc = false;
		}
	}
	return newSrc;
};

var _closeServer = function (localServer) {
	if (localServer) {
		localServer.close();
	}
};

/**
 * Get server and credentials from gradle properties
 */
module.exports.getConfiguredServer = function (currPath) {
	return _getConfiguredServer(currPath);
};
var _getConfiguredServer = function (currPath) {
	var configFile;
	if (process.env.CEC_PROPERTIES) {
		configFile = process.env.CEC_PROPERTIES;
	} else if (currPath && fs.existsSync(path.join(currPath, 'cec.properties'))) {
		configFile = path.join(currPath, 'cec.properties');
	} else {
		configFile = path.join(os.homedir(), '.gradle', 'gradle.properties');
	}
	// console.log('CEC configure file: ' + configFile);
	var server = {
		fileloc: configFile,
		fileexist: false,
		url: '',
		username: '',
		password: '',
		oauthtoken: '',
		env: '',
		useRest: false,
		idcs_url: '',
		client_id: '',
		client_secret: '',
		scope: ''
	};
	if (fs.existsSync(configFile)) {
		server.fileexist = true;
		try {
			var cecurl,
				username,
				password,
				env,
				useRest,
				idcs_url,
				client_id,
				client_secret,
				scope,
				srcfolder;

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
				} else if (line.indexOf('cec_source_folder=') === 0) {
					srcfolder = line.substring('cec_source_folder='.length);
					srcfolder = srcfolder.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_idcs_url=') === 0) {
					idcs_url = line.substring('cec_idcs_url='.length);
					idcs_url = idcs_url.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_client_id=') === 0) {
					client_id = line.substring('cec_client_id='.length);
					client_id = client_id.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_client_secret=') === 0) {
					client_secret = line.substring('cec_client_secret='.length);
					client_secret = client_secret.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_scope=') === 0) {
					scope = line.substring('cec_scope='.length);
					scope = scope.replace(/(\r\n|\n|\r)/gm, '').trim();
				}
			});
			if (cecurl && username && password) {
				server.url = cecurl;
				server.username = username;
				server.password = password;
				server.env = env || 'pod_ec';
				server.oauthtoken = '';
				server.tokentype = '';
				server.idcs_url = idcs_url;
				server.client_id = client_id;
				server.client_secret = client_secret;
				server.scope = scope;

			}

			// console.log('configured server=' + JSON.stringify(server));
		} catch (e) {
			console.log('Failed to read config: ' + e);
		}
	}
	return server;
};

/**
 * Return the auth object for request
 * @param server the object obtained from API getConfiguredServer()
 */
module.exports.getRequestAuth = function (server) {
	return _getRequestAuth(server);
};
var _getRequestAuth = function (server) {
	var auth = server.env === 'dev_ec' || !server.oauthtoken ? {
		user: server.username,
		password: server.password
	} : {
		bearer: server.oauthtoken
	};
	return auth;
};

module.exports.verifyServer = function (serverName, currPath, showError) {
	return _verifyServer(serverName, currPath, showError);
};
var _verifyServer = function (serverName, currPath, showError) {
	var server = {};
	var toShowError = showError === undefined || showError === true;
	if (serverName) {
		_setupSourceDir(currPath);

		var serverpath = path.join(serversDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			if (toShowError) {
				console.log('ERROR: server ' + serverName + ' does not exist');
			}
			return server;
		}
	}

	server = serverName ? _getRegisteredServer(currPath, serverName) : _getConfiguredServer(currPath);
	if (!serverName) {
		if (server.fileexist) {
			if (toShowError) {
				console.log(' - configuration file: ' + server.fileloc);
			}
		} else {
			if (toShowError) {
				console.log('ERROR: no server is configured');
			}
			return server;
		}
	}
	if (!server.url || !server.username || !server.password) {
		if (toShowError) {
			console.log('ERROR: no server is configured in ' + server.fileloc);
		}
		return server;
	}
	if (server.key && !fs.existsSync(server.key)) {
		if (toShowError) {
			console.log('ERROR: missing key file ' + server.key);
		}
		return server;
	}

	server.valid = true;
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
 * Create a 32 char GUID
 */
module.exports.createAssetGUID = function (isDigitalAsset) {
	return _createAssetGUID(isDigitalAsset);
};
var _createAssetGUID = function (isDigitalAsset) {
	'use strict';
	var guid1 = uuid4();
	guid1 = guid1.replace(/-/g, '').toUpperCase();
	return ((isDigitalAsset ? 'CONT' : 'CORE') + guid1);
};


/**
 * Utility check if a string ends with 
 */
module.exports.endsWith = (str, end) => {
	return _endsWith(str, end);
};
var _endsWith = function (str, end) {
	return end.length <= str.length && str.lastIndexOf(end) === str.length - end.length;
};

module.exports.trimString = (str, search) => {
	if (!str || !search) {
		return str;
	}
	var val = str;

	// remove leading
	while (val.startsWith(search)) {
		val = val.substring(search.length);
	}

	// remove trailing
	while (_endsWith(val, search)) {
		val = val.substring(0, val.length - search.length);
	}
	return val;
};

/**
 * Utility replace all occurrences of a string
 */
module.exports.replaceAll = (str, search, replacement) => {
	return _replaceAll(str, search, replacement);
};
var _replaceAll = function (str, search, replacement) {
	if (!str) {
		return str;
	}
	var re = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
	return str.replace(re, replacement || '');
};

module.exports.unescapeHTML = function (str) {
	return _unescapeHTML(str);
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
module.exports.updateItemFolderJson = function (projectDir, type, name, propName, propValue) {
	"use strict";

	_setupSourceDir(projectDir);

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
 * Get a server in serversDir.
 */
module.exports.getRegisteredServer = function (projectDir, name) {
	"use strict";

	return _getRegisteredServer(projectDir, name);
};
var _getRegisteredServer = function (projectDir, name) {
	"use strict";

	_setupSourceDir(projectDir);

	var server = {};
	var serverpath = path.join(serversDir, name, "server.json");
	if (fs.existsSync(serverpath)) {
		var serverstr = fs.readFileSync(serverpath).toString(),
			serverjson = JSON.parse(serverstr);
		server = serverjson;
		server.fileloc = serverpath;
		server.fileexist = true;

		var keyFile = server.key;
		if (keyFile && fs.existsSync(keyFile)) {
			var key = fs.readFileSync(keyFile, 'utf8').toString();
			if (server.password) {
				// decrypt the password
				try {
					var buf = Buffer.from(server.password, 'base64');
					var decrypted = crypto.privateDecrypt(key, buf);
					server.password = decrypted.toString('utf8');

				} catch (e) {
					console.log('ERROR: failed to decrypt the password');
					console.log(e);
				}
			}

			if (server.client_id) {
				// decrypt the password
				try {
					server.client_id = crypto.privateDecrypt(key, Buffer.from(server.client_id, 'base64')).toString('utf8');

				} catch (e) {
					console.log('ERROR: failed to decrypt the client id');
					console.log(e);
				}
			}
			if (server.client_secret) {
				// decrypt the password
				try {
					server.client_secret = crypto.privateDecrypt(key, Buffer.from(server.client_secret, 'base64')).toString('utf8');

				} catch (e) {
					console.log('ERROR: failed to decrypt the client secret');
					console.log(e);
				}
			}
		}
	}
	// console.log(server);
	return server;
};

var _saveOAuthToken = function (serverPath, serverName, token) {
	// console.log('serverPath: ' + serverPath + ' serverName: ' + serverName);
	if (serverName && fs.existsSync(serverPath)) {
		var serverstr = fs.readFileSync(serverPath).toString(),
			serverjson = JSON.parse(serverstr);
		serverjson.oauthtoken = token;

		fs.writeFileSync(serverPath, JSON.stringify(serverjson));
		console.log(' - token saved to server ' + serverName);
	}
};

var _clearOAuthToken = function (serverPath, serverName) {

	if (fs.existsSync(serverPath)) {
		var serverstr = fs.readFileSync(serverPath).toString(),
			serverjson = JSON.parse(serverstr);
		serverjson.oauthtoken = '';

		fs.writeFileSync(serverPath, JSON.stringify(serverjson));
		console.log(' - token cleared for server ' + serverName);
	}
};

/**
 * Get components in componentsDir.
 */
module.exports.getComponents = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var components = [],
		items = fs.existsSync(componentsDir) ? fs.readdirSync(componentsDir) : [];
	if (items) {
		items.forEach(function (name) {
			var isOptimizedComp = name.length > 6 && name.substring(name.length - 6) === '_build';
			var folderpath = path.join(componentsDir, "/", name, "_folder.json");
			if (!isOptimizedComp && fs.existsSync(path.join(componentsDir, "/", name, "appinfo.json")) && fs.existsSync(folderpath)) {
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
 * Get component's app info componentsDir.
 */
module.exports.getComponentAppInfo = function (projectDir, compName) {
	"use strict";

	_setupSourceDir(projectDir);

	var appInfo;
	var filePath = path.join(componentsDir, compName, "appinfo.json");
	if (fs.existsSync(filePath)) {
		var appInfoStr = fs.readFileSync(filePath);
		appInfo = JSON.parse(appInfoStr);
	}

	return appInfo;
};

/**
 * Get all templates that use this component
 * @param compName
 */
module.exports.getComponentTemplates = function (projectDir, compName) {
	_setupSourceDir(projectDir);

	var temps = [],
		compSrcDir = path.join(componentsDir, compName);

	if (!fs.existsSync(compSrcDir)) {
		console.log('getComponentTemplates: ERROR component ' + compName + ' does not exist');
		return temps;
	}

	var alltemps = _getTemplates();

	for (var i = 0; i < alltemps.length; i++) {
		var tempname = alltemps[i].name,
			tempcomps = _getTemplateComponents(tempname);
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
module.exports.getTemplates = function (projectDir) {
	_setupSourceDir(projectDir);

	return _getTemplates();
};
var _getTemplates = function () {
	"use strict";
	var templates = [];
	var items = fs.existsSync(templatesDir) ? fs.readdirSync(templatesDir) : [];
	if (items) {
		items.forEach(function (name) {
			var folderPath = path.join(templatesDir, name, '_folder.json');
			if (fs.existsSync(folderPath)) {
				var folderJson = JSON.parse(fs.readFileSync(folderPath));
				templates.push({
					name: name,
					type: folderJson.isEnterprise === 'true' ? 'Enterprise' : 'Standard'
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
module.exports.getTemplateTheme = function (projectDir, templateName) {
	_setupSourceDir(projectDir);
	return _getTemplateTheme(templateName);
};

var _getTemplateTheme = function (templateName) {
	var themeName;

	var tempSrcDir = path.join(templatesDir, templateName);
	var siteinfofile = path.join(tempSrcDir, 'siteinfo.json');

	if (fs.existsSync(siteinfofile)) {
		var siteinfostr = fs.readFileSync(siteinfofile),
			siteinfojson = JSON.parse(siteinfostr);
		if (siteinfojson && siteinfojson.properties) {
			themeName = siteinfojson.properties.themeName;
		}
	}

	return themeName;
};

/**
 * Get all custom components used by a template
 * @param templateName
 */
module.exports.getTemplateComponents = function (projectDir, templateName, includeThemeComps) {
	_setupSourceDir(projectDir);

	return _getTemplateComponents(templateName, includeThemeComps);
};
var _getTemplateComponents = function (templateName, includeThemeComps) {
	var comps = [],
		tempSrcDir = path.join(templatesDir, templateName);

	if (!fs.existsSync(tempSrcDir)) {
		console.log('getTemplateComponents: template ' + templateName + ' does not exist');
		return comps;
	}

	var pages = fs.readdirSync(path.join(tempSrcDir, 'pages'));

	var processInstances = function (componentInstances) {
		var compvalues;

		Object.keys(componentInstances).forEach(function (key) {
			compvalues = componentInstances[key];
			if (compvalues &&
				(compvalues.type === 'scs-component' || compvalues.type === 'scs-componentgroup' || compvalues.type === 'scs-app' || compvalues.type === 'scs-sectionlayout') &&
				compvalues.id &&
				compvalues.id !== compvalues.type) {
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
	};
	for (var i = 0; i < pages.length; i++) {
		var pagepath = path.join(tempSrcDir, 'pages', pages[i]),
			pagestr = fs.readFileSync(pagepath),
			pagejson = JSON.parse(pagestr);
		if (pagejson.componentInstances) {
			processInstances(pagejson.componentInstances);
		}
	}


	// get all content layouts used by this template
	var contentmapfile = path.join(tempSrcDir, 'caas_contenttypemap.json');
	if (fs.existsSync(contentmapfile)) {
		var contenttypes = JSON.parse(fs.readFileSync(contentmapfile));
		contenttypes.forEach(function (ctype) {
			for (var j = 0; j < ctype.categoryList.length; j++) {
				var layout = ctype.categoryList[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}
		});
	}

	var summaryfile = path.join(tempSrcDir, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		var mappings = summaryjson.categoryLayoutMappings || summaryjson.contentTypeMappings || [];
		mappings.forEach(function (entry) {
			var catelist = entry.categoryList;
			for (var j = 0; j < catelist.length; j++) {
				var layout = catelist[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}

			var editorList = entry.editorList || [];
			editorList.forEach(function (listEntry) {
				var editor = listEntry.editorName;
				if (editor && comps.indexOf(editor) < 0) {
					comps.push(editor);
				}
			});
		});

		// custom field editors
		var editorComponents = summaryjson.editorComponents || [];
		editorComponents.forEach(function (editor) {
			if (editor && !comps.includes(editor)) {
				comps.push(editor);
			}
		});
	}

	// check if there are custom forms
	// currently custom forms not saved in summary.json, we check the type json file
	var typespath = path.join(tempSrcDir, 'assets', 'contenttemplate',
		'Content Template of ' + templateName, 'ContentTypes');
	if (fs.existsSync(typespath)) {
		var typeNames = fs.readdirSync(typespath);
		typeNames.forEach(function (typeName) {
			var typeFilePath = path.join(typespath, typeName);
			if (fs.statSync(typeFilePath).isFile() && _endsWith(typeName, '.json')) {
				var typeObj = JSON.parse(fs.readFileSync(typeFilePath));
				var typeCustomForms = typeObj.properties && typeObj.properties.customForms || [];
				for (var i = 0; i < typeCustomForms.length; i++) {
					if (!comps.includes(typeCustomForms[i])) {
						// console.log(' - adding custom form ' + typeCustomForms[i]);
						comps.push(typeCustomForms[i]);
					}
				}
			}
		});
	}

	if (includeThemeComps) {
		var themeName = _getTemplateTheme(templateName);
		var themeComps = themeName ? _getThemeComponents(themeName) : [];
		themeComps.forEach(function (themeComp) {
			if (themeComp && themeComp.id && !comps.includes(themeComp.id)) {
				comps.push(themeComp.id);
			}
		});
	}

	comps.sort();

	// console.log('getTemplateComponents: template=' + templateName + ' components=' + JSON.stringify(comps));
	return comps;
};


/**
 * Get the icon of a template (_folder_icon.png or _folder_icon.jpg)
 * @param templateName
 */
module.exports.getTemplateIcon = function (projectDir, templateName) {
	_setupSourceDir(projectDir);

	return _getTemplateIcon(templateName);
};

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
module.exports.getContentLayoutItems = function (projectDir, layoutName) {
	_setupSourceDir(projectDir);

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

	contenttypes.forEach(function (entry) {
		var tempname = entry.template,
			temppath = path.join(templatesDir, tempname),
			ctype = entry.type,
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
					};
				}
			}
		}
	});

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
		items.forEach(function (item) {
			msgs = msgs + item.type + ':' + item.name + ' ';
		});
		console.log(' - items ' + msgs);
	}

	return items;
};

/**
 * Get all content types (across templates)
 */
module.exports.getContentTypes = function (projectDir) {
	_setupSourceDir(projectDir);

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
module.exports.getContentType = function (projectDir, typeName, templateName) {
	_setupSourceDir(projectDir);

	var contenttype = {},
		alltypes = _getContentTypes();

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
module.exports.getContentTypesFromServer = function (server) {
	var contentTypesPromise = new Promise(function (resolve, reject) {
		if (!server || !server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server'
			});
		}

		var request = _getRequest();
		var url = server.url + '/content/management/api/v1.1/types?limit=99999';
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get types');
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get types  : ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return contentTypesPromise;
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

		var request = _getRequest();
		var url = server.url + '/content/management/api/v1.1/types/' + typename;
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get type ' + typename);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get type ' + typename + ' : ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return contentTypePromise;
};


/**
 * Get all fields of a content types from server
 */
module.exports.getContentTypeFieldsFromServer = function (server, typeName, callback) {
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		return;
	}

	var request = _getRequest();
	var url = server.url + '/content/management/api/v1.1/types/' + typeName;
	var options = {
		method: 'GET',
		url: url,
		auth: _getRequestAuth(server)
	};

	request(options, function (error, response, body) {
		var fields = [];
		if (error) {
			console.log('ERROR: failed to get type ' + typeName);
			console.log(error);
			callback(fields);
		}
		var data;
		try {
			data = JSON.parse(body);
		} catch (e) {
			data = body;
		}
		if (response && response.statusCode === 200) {
			fields = data && data.fields;
			callback(fields);
		} else {
			var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
			console.log('ERROR: failed to get type ' + typeName + ' : ' + msg);
			callback(fields);
		}
	});
};

module.exports.getCaasCSRFToken = function (server) {
	var csrfTokenPromise = new Promise(function (resolve, reject) {
		var request = _getRequest();
		var url = server.url + '/content/management/api/v1.1/token';
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get CSRF token');
				console.log(error);
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
			if (response && response.statusCode === 200) {
				return resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get CSRF token ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return csrfTokenPromise;
};

module.exports.getIdcToken = function (server) {
	return _getIdcToken(server);
};
var _getIdcToken = function (server) {
	var idcTokenPromise = new Promise(function (resolve, reject) {
		var request = _getRequest();
		var url = server.url + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}
		var total = 0;
		var inter = setInterval(function () {
			request(options, function (error, response, body) {
				if (error) {
					clearInterval(inter);
					console.log(' - failed to connect ' + error);
					return resolve({
						err: 'err'
					});
				} else if (response.statusCode !== 200) {
					clearInterval(inter);
					console.log(' - failed to connect: ' + (response.statusMessage || response.statusCode));
					return resolve({
						err: 'err'
					});
				} else {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						// console.log(' - establish user session');
						resolve({
							idcToken: idcToken
						});
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						resolve({
							err: 'err'
						});
					}
				}
			});
		}, 3000);
	});
	return idcTokenPromise;
};

/**
 * Requires login first
 */
module.exports.getTenantConfig = function (server) {
	return new Promise(function (resolve, reject) {
		var request = _getRequest();
		var url = server.url + '/documents/integration?IdcService=GET_TENANT_CONFIG&IsJson=1';
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get tenant config');
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
				console.log('ERROR: Failed to get tenant config' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.TenantInfo && data.ResultSets.TenantInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.TenantInfo && data.ResultSets.TenantInfo.rows;
			var config = {};

			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					config[attr] = rows[0][i];
				}
			}
			resolve(config);
		});
	});
};

/**
 * Get translation connectors in src/connectors/
 */
module.exports.getTranslationConnectors = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var connectors = [],
		items = fs.existsSync(connectorsDir) ? fs.readdirSync(connectorsDir) : [];
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(path.join(connectorsDir, name, 'package.json'))) {
				connectors.push({
					name: name
				});
			}
		});
	}

	/*
	if (connectors.length === 0) {
		console.error("No translation connectors found in " + connectorsDir);
	}
	*/

	return connectors;
};

/**
 * Get translation connections in src/connections/
 */
module.exports.getTranslationConnections = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var connections = [],
		items = fs.existsSync(connectionsDir) ? fs.readdirSync(connectionsDir) : [];
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(path.join(connectionsDir, name, 'connection.json'))) {
				connections.push({
					name: name
				});
			}
		});
	}

	return connections;
};

/**
 * Get OAuth token from IDCS
 */
module.exports.getOAuthTokenFromIDCS = function (server) {
	return _getOAuthTokenFromIDCS(server);
};

var _getOAuthTokenFromIDCS = function (server) {
	var tokenPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server'
			});
		}

		if (!server.idcs_url) {
			console.log('ERROR: no IDCS url is found');
			return resolve({
				err: 'no IDCS url'
			});
		}
		if (!server.client_id) {
			console.log('ERROR: no client id is found');
			return resolve({
				err: 'no client id'
			});
		}
		if (!server.client_secret) {
			console.log('ERROR: no client secret is found');
			return resolve({
				err: 'no client secret'
			});
		}
		if (!server.scope) {
			console.log('ERROR: no scope is found');
			return resolve({
				err: 'no scope'
			});
		}

		var url = server.idcs_url + '/oauth2/v1/token';
		var auth = {
			user: server.client_id,
			password: server.client_secret
		};

		var formData = new URLSearchParams();
		formData.append('grant_type', 'password');
		formData.append('username', server.username);
		formData.append('password', server.password);
		formData.append('scope', server.scope);

		var postData = {
			method: 'POST',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;'
			},
			body: formData.toString(),
			json: true
		};
		var request = _getRequest();
		request(postData, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get OAuth token');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				data = body;
			}

			if (!data || response.statusCode !== 200) {
				var msg = (data && (data.error || data.error_description)) ? (data.error_description || data.error) : (response.statusMessage || response.statusCode);
				console.log('ERROR: Failed to get OAuth token - ' + msg);
				return resolve({
					err: 'err'
				});
			} else {
				var token = data.access_token;
				server.oauthtoken = token;
				server.login = true;
				server.tokentype = data.token_type;
				console.log(' - connect to remote server: ' + server.url);
				return resolve({
					status: true,
					oauthtoken: token
				});
			}
		});
	});
	return tokenPromise;
};


/**
 * Get localization policy from server
 */
module.exports.getLocalizationPolicyFromServer = function (request, server, policyIdentifier, identifierType) {
	var policyPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/content/management/api/v1.1/policy?limit=9999';

		var options = {
			url: url,
			auth: auth
		};
		request(options, function (error, response, body) {

			if (error) {
				console.log('ERROR: failed to get localization policy:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				var policy;
				for (var i = 0; i < items.length; i++) {
					if (identifierType && identifierType === 'id') {
						if (items[i].id === policyIdentifier) {
							policy = items[i];
						}
					} else {
						if (items[i].name === policyIdentifier) {
							policy = items[i];
							break;
						}
					}
				}
				resolve({
					data: policy
				});
			} else {
				console.log('ERROR: failed to get localization policy: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return policyPromise;
};

var _btoa = function (value) {
	var encoding = (value instanceof Buffer) ? 'utf8' : 'binary';
	return Buffer.from(value, encoding).toString('base64');
};
module.exports.btoa = function (value) {
	return _btoa(value);
};


module.exports.getDocumentRendition = function (app, doc, callback) {
	var url = '';

	if (!app.locals.connectToServer) {
		console.log(' - No remote server to get document rendition');
		return;
	}

	var docname = doc.name,
		resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/folders/search/items?fulltext=' + encodeURIComponent(docname);
	// console.log(' -- get document id ');

	var request = _getRequest();
	request.get({
		url: resturl
	}, function (err, response, body) {
		if (response && response.statusCode === 200) {
			var data = JSON.parse(body);
			if (data && data.totalCount > 0) {
				var docobj;
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
				resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/files/' + doc.id + '/data/rendition?rendition=' + page;
				// console.log(' -- get document rendition');
				request.get({
					url: resturl
				}, function (err, response, body) {
					if (response && response.statusCode === 200) {
						console.log(' -- rendition exists, doc: ' + docname + ' page: ' + page);
						doc.renditionReady = true;
						callback(doc);
					} else {
						console.log(' -- no rendition for ' + docname + '/' + page + ' yet. Creating...');
						// create redition
						resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/files/' + doc.id + '/pages';
						var args = {
							data: {
								IsJson: 1
							},
							headers: {
								'Authorization': "Basic " + _btoa(app.locals.server.username + ":" + app.locals.server.password)
							}
						};
						request.post({
							url: resturl
						}, function (err, response, body) {
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
				callback(doc);
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
module.exports.getThemeComponents = function (projectDir, themeName) {
	_setupSourceDir(projectDir);
	return _getThemeComponents(themeName);
};
var _getThemeComponents = function (themeName) {
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
		// console.log(' - file ' + componentsjsonfile + ' does not exist');
	}
	// console.log(comps);
	return comps;
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


var _loginToDevServer = function (server, request) {
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

					if (!loginReported) {
						console.log(' - Logged in to remote server: ' + server.url);
						loginReported = true;
					}
					server.login = true;
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
module.exports.loginToDevServer = _loginToDevServer;

var _loginToPODServer = function (server) {
	if (server.sso) {
		return _loginToSSOServer(server);
	}

	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = '#idcs-signin-basic-signin-form-username',
			passwordid = '#idcs-signin-basic-signin-form-password',
			submitid = '#idcs-signin-basic-signin-form-submit',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		var timeout = server.timeout || 30000;
		// console.log(timeout);
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

				try {
					await page.waitForSelector(usernameid, {
						timeout: timeout
					});
				} catch (err) {
					console.log('Failed to open the login page');
					await browser.close();
					return resolve({
						'status': false
					});
				}
				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: timeout
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl, {
					timeout: timeout
				});
				try {
					await page.waitForSelector('pre', {
						timeout: 120000
					});
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the first time');

					await page.goto(tokenurl);
					try {
						await page.waitForSelector('pre'); // smaller timeout
					} catch (err) {
						console.log('Failed to connect to the server to get the OAuth token the second time');

						await browser.close();
						return resolve({
							'status': false
						});
					}
				}

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;
				server.login = true;

				await browser.close();

				if (!token || token.toLowerCase().indexOf('error') >= 0) {
					console.log('ERROR: failed to get the OAuth token');
					return resolve({
						'status': false
					});
				}

				console.log(' - connect to remote server: ' + server.url);

				// Save the token and use till it expires
				_saveOAuthToken(server.fileloc, server.name, token);

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
module.exports.loginToPODServer = _loginToPODServer;

var _loginToSSOServer = function (server) {
	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = '#sso_username',
			passwordid = '#ssopassword',
			submitid = '[value~=Sign]',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		var timeout = server.timeout || 30000;
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

				try {
					await page.waitForSelector(usernameid, {
						timeout: timeout
					});
				} catch (err) {
					console.log('Failed to open the login page');
					await browser.close();
					return resolve({
						'status': false
					});
				}

				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: timeout
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl, {
					timeout: timeout
				});
				try {
					await page.waitForSelector('pre', {
						timeout: 120000
					});
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the first time');

					await page.goto(tokenurl);
					try {
						await page.waitForSelector('pre'); // smaller timeout
					} catch (err) {
						console.log('Failed to connect to the server to get the OAuth token the second time');

						await browser.close();
						return resolve({
							'status': false
						});
					}
				}

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;
				server.login = true;

				await browser.close();

				if (!token || token.toLowerCase().indexOf('error') >= 0) {
					console.log('ERROR: failed to get the OAuth token');
					return resolve({
						'status': false
					});
				}

				console.log(' - connect to remote server: ' + server.url);

				// Save the token and use till it expires
				_saveOAuthToken(server.fileloc, server.name, token);

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
module.exports.loginToSSOServer = _loginToSSOServer;

var _loginToICServer = function (server) {
	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/sites',
			usernameid = '#username',
			passwordid = '#password',
			submitid = '#signin',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		var timeout = server.timeout || 30000;
		// console.log(timeout);
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

				try {
					await page.waitForSelector(usernameid, {
						timeout: timeout
					});
				} catch (err) {
					console.log('Failed to open the login page');
					await browser.close();
					return resolve({
						'status': false
					});
				}
				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: timeout
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				const cookies = await page.cookies();
				// console.log(cookies);
				var cookiesStr = '';
				if (cookies && cookies.length > 0) {
					for (var i = 0; i < cookies.length; i++) {
						if (cookies[i].name.startsWith('OAMAuthnCookie_')) {
							cookiesStr = cookies[i].name + '=' + cookies[i].value;
							break;
						}
					}
					for (var i = 0; i < cookies.length; i++) {
						if (!cookies[i].name.startsWith('OAMAuthnCookie_')) {
							cookiesStr = cookiesStr + '; ' + cookies[i].name + '=' + cookies[i].value;
							break;
						}
					}
				}
				// console.log(cookiesStr);

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl, {
					timeout: timeout
				});
				try {
					await page.waitForSelector('pre', {
						timeout: 120000
					});
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the first time');

					await page.goto(tokenurl);
					try {
						await page.waitForSelector('pre'); // smaller timeout
					} catch (err) {
						console.log('Failed to connect to the server to get the OAuth token the second time');

						await browser.close();
						return resolve({
							'status': false
						});
					}
				}

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;
				server.login = true;
				server.cookies = cookiesStr;

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
module.exports.loginToICServer = _loginToICServer;

module.exports.loginToServer = function (server, request) {
	return _loginToServer(server, request);
};
var _loginToServer = function (server, request) {
	if (server.login) {
		return Promise.resolve({
			status: true
		});
	}
	var env = server.env || 'pod_ec';

	if (env === 'dev_pod') {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}

	if (env === 'pod_ec' && server.idcs_url && server.client_id && server.client_secret && server.scope) {

		return _getOAuthTokenFromIDCS(server);

	} else if (server.oauthtoken) {
		// console.log(server);
		// verify the token
		return _getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					server.login = false;
					server.oauthtoken = '';
					// remove the expired/invalid token
					_clearOAuthToken(server.fileloc, server.name);

					// open browser to obtain the token again
					return _loginToServer(server, request);
				} else {
					return Promise.resolve({
						status: idcToken ? true : false
					});
				}
			});

	} else if (env === 'dev_osso') {

		return _loginToSSOServer(server);

	} else if (env === 'dev_ec') {

		return _loginToDevServer(server, request);

	} else if (env === 'dev_pod') {

		return _loginToPODServer(server);

	} else if (env === 'pod_ic') {

		return _loginToICServer(server);

	} else {
		// default
		return _loginToPODServer(server);
	}
};

module.exports.timeUsed = function (start, end) {
	return _timeUsed(start, end);
};
var _timeUsed = function (start, end) {
	var timeDiff = end - start; //in ms
	// strip the ms
	timeDiff /= 1000;

	// get seconds 
	var seconds = Math.round(timeDiff);
	return seconds.toString() + 's';
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
		if (server.env !== 'dev_ec') {
			options.auth = {
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
module.exports.queryFolderId = function (request, server, host, folderPath) {
	return _queryFolderId(request, server, host, folderPath);
};

var _queryFolderId = function (request, server, host, folderPath) {
	var folderIdPromise = new Promise(function (resolve, reject) {

		var folderNames = folderPath ? folderPath.split('/') : [];

		// First query user personal folder home
		var url = host + '/documents/web?IdcService=FLD_BROWSE_PERSONAL&itemType=Folder';
		var auth = _getRequestAuth(server);
		var options = {
			url: url,
			auth: auth
		};

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

			if (!folderPath) {
				// the personal home folder GUID
				return resolve({
					folderId: data.LocalData.OwnerFolderGUID
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

/**
 * get request 
 */
module.exports.getRequest = function () {
	"use strict";
	return _getRequest();
};
var _getRequest = function () {
	var request = require('request');

	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		/*
		pool: {
			maxSockets: 50
		},
		*/
		jar: true

	});

	return request;
};

/**
 * Get the site info return the data as API SCS_GET_SITE_INFO_FILE
 * @param {*} server 
 * @param {*} site the site name
 */
var _getSiteInfo = function (server, site) {
	var sitesPromise = new Promise(function (resolve, reject) {
		'use strict';

		sitesRest.getSite({
				server: server,
				name: site,
				expand: 'channel,repository,defaultCollection'
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve({
						err: 'err'
					});
				}

				var site = result;
				var channelAccessTokens = [];
				var tokens = site.channel && site.channel.channelTokens || [];
				for (var i = 0; i < tokens.length; i++) {
					channelAccessTokens.push({
						name: tokens[i].name,
						value: tokens[i].token,
						expirationDate: tokens[i].value
					});
				}
				// console.log(site);
				var siteInfo = {
					isEnterprise: site.isEnterprise,
					themeName: site.themeName,
					channelId: site.channel && site.channel.id,
					channelAccessTokens: channelAccessTokens,
					repositoryId: site.repository && site.repository.id,
					arCollectionId: site.defaultCollection && site.defaultCollection.id
				};
				return resolve({
					siteId: site.id,
					siteInfo: siteInfo
				});
			});
	});
	return sitesPromise;
};
module.exports.getSiteInfo = function (server, site) {
	return _getSiteInfo(server, site);
};


module.exports.getContentTypeLayoutMapping = function (request, server, typeName) {
	return _getContentTypeLayoutMapping(request, server, typeName);
};

var _getContentTypeLayoutMapping = function (request, server, typeName) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);
		var url = server.url + '/documents/web?IdcService=AR_GET_CONTENT_TYPE_CONFIG&contentTypeName=' + typeName;

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get content layout mapping for ' + typeName);
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
				console.log('ERROR: Failed to get content layout mapping for ' + typeName + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ContentTypeCategoryLayoutMapping && data.ResultSets.ContentTypeCategoryLayoutMapping.fields || [];
			var rows = data.ResultSets && data.ResultSets.ContentTypeCategoryLayoutMapping && data.ResultSets.ContentTypeCategoryLayoutMapping.rows;
			var mappings = [];
			rows.forEach(function (row) {
				mappings.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					mappings[j][attr] = rows[j][i];
				}
			}

			resolve({
				type: typeName,
				data: mappings,
				ResultSets: data.ResultSets
			});
		});
	});
};

/**
 * 
 */
module.exports.addContentTypeLayoutMapping = function (request, server, typeName, contentLayout, style) {
	return new Promise(function (resolve, reject) {
		_getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					console.log('ERROR: failed to get idcToken');
					return Promise.reject();
				}

				return _getContentTypeLayoutMapping(request, server, typeName);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var ResultSets = result.ResultSets;
				var rows = ResultSets && ResultSets.ContentTypeCategoryLayoutMapping && ResultSets.ContentTypeCategoryLayoutMapping.rows || [];
				var exist = false;
				for (var i = 0; i < rows.length; i++) {
					if (rows[i][0] && rows[i][0].toLowerCase() === style.toLowerCase()) {
						// category exists
						rows[i][1] = contentLayout;
						exist = true;
						break;
					}
				}
				if (!exist) {
					rows.push([style, contentLayout]);
				}
				// console.log(JSON.stringify(ResultSets, null, 4));
				var auth = _getRequestAuth(server);
				var url = server.url + '/documents/web?IdcService=AR_SET_CONTENT_TYPE_CONFIG&contentTypeName=' + typeName;

				var formData = {
					'idcToken': idcToken,
					'ResultSets': ResultSets
				};

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formData,
					json: true
				};

				request(postData, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to add content layout mapping');
						console.log(err);
						return resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						if (typeof body === 'object') {
							data = body;
						}
					}
					// console.log(data);
					if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
						console.log('ERROR: failed to add content layout mapping ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
						return resolve({
							err: 'err'
						});
					} else {
						return resolve({});
					}
				});

			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

module.exports.removeContentTypeLayoutMapping = function (request, server, typeName, contentLayout, style) {
	return new Promise(function (resolve, reject) {
		_getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					console.log('ERROR: failed to get idcToken');
					return Promise.reject();
				}

				return _getContentTypeLayoutMapping(request, server, typeName);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var ResultSets = result.ResultSets;
				var rows = ResultSets && ResultSets.ContentTypeCategoryLayoutMapping && ResultSets.ContentTypeCategoryLayoutMapping.rows || [];
				var exist = false;
				var idx;
				for (var i = 0; i < rows.length; i++) {
					if (rows[i][0] && rows[i][0].toLowerCase() === style.toLowerCase() &&
						rows[i][1] && rows[i][1].toLowerCase() === contentLayout.toLowerCase()) {
						idx = i;
						exist = true;
						break;
					}
				}
				if (!exist) {

					// Not exist, do nothing
					// console.log(' - the mapping ' + style + ':' + contentLayout + ' does not exist');
					return resolve({});

				} else {
					// remove 
					rows.splice(idx, 1);
					// console.log(JSON.stringify(ResultSets, null, 4));

					var auth = _getRequestAuth(server);
					var url = server.url + '/documents/web?IdcService=AR_SET_CONTENT_TYPE_CONFIG&contentTypeName=' + typeName;

					var formData = {
						'idcToken': idcToken,
						'ResultSets': ResultSets
					};

					var postData = {
						method: 'POST',
						url: url,
						auth: auth,
						headers: {
							'Content-Type': 'application/json',
							'X-REQUESTED-WITH': 'XMLHttpRequest'
						},
						body: formData,
						json: true
					};

					request(postData, function (err, response, body) {
						if (err) {
							console.log('ERROR: Failed to remove content layout mapping');
							console.log(err);
							return resolve({
								err: 'err'
							});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {
							if (typeof body === 'object') {
								data = body;
							}
						}
						// console.log(data);
						if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
							console.log('ERROR: failed to remove content layout mapping ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
							return resolve({
								err: 'err'
							});
						} else {
							return resolve({});
						}
					});
				}
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
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
module.exports.getTemplateImportStatus = function (server, request, host, jobId, action) {
	return _getTemplateImportStatus(server, request, host, jobId, action);
};
var _getTemplateImportStatus = function (server, request, host, jobId, action) {
	var importStatusPromise = new Promise(function (resolve, reject) {
		var actionLabel = action ? action : 'import';
		var startTime = new Date();
		var needNewLine = false;
		var inter = setInterval(function () {

			var jobStatusPromise = _getBackgroundServiceStatus(server, request, host, jobId);
			jobStatusPromise.then(function (result) {
				// console.log(result);
				if (!result || result.err) {
					if (needNewLine) {
						process.stdout.write(os.EOL);
					}
					clearInterval(inter);
					return resolve({
						err: 'err'
					});
				} else if (result.status === 'COMPLETE' || result.status === 'FAILED') {
					if (needNewLine) {
						process.stdout.write(os.EOL);
					}
					clearInterval(inter);
					return resolve({
						status: result.status,
						LocalData: result.LocalData,
						JobInfo: result.JobInfo
					});
				} else {
					process.stdout.write(' - ' + actionLabel + ' in process: percentage ' + result.percentage +
						' [' + _timeUsed(startTime, new Date()) + ']');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
			});
		}, 6000);
	});
	return importStatusPromise;
};

var _getBackgroundServiceStatus = function (server, request, host, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = host + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS&JobID=' + jobId;
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};
		request(options, function (err, response, body) {
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
				console.log('ERROR: Failed to get job status ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}
			var status;
			var percentage;
			var jobInfo = data.ResultSets && data.ResultSets.JobInfo;
			if (jobInfo) {
				var statusIdx, percentageIdx;
				jobInfo.fields.forEach(function (field, index) {
					if (field.name === 'JobStatus') {
						statusIdx = index;
					} else if (field.name === 'JobPercentage') {
						percentageIdx = index;
					}
				});
				status = statusIdx ? jobInfo.rows[0][statusIdx] : '';
				percentage = percentageIdx ? jobInfo.rows[0][percentageIdx] : '';
			}
			var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];

			var result = {};
			if (rows && rows.length > 0) {
				for (var i = 0; i < fields.length; i++) {
					var attr = fields[i].name;
					result[attr] = rows[0][i];
				}
			}
			return resolve({
				'status': status,
				'percentage': percentage,
				'LocalData': data.LocalData,
				'JobInfo': result
			});
		});
	});
	return statusPromise;
};

/**
 * @param server the server object
 */
module.exports.getBackgroundServiceJobStatus = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var auth = _getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			params.headers = {
				Cookie: server.cookies
			};
		}
		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get job status');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get job status' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];

			var status = {};
			if (rows && rows.length > 0) {
				for (var i = 0; i < fields.length; i++) {
					var attr = fields[i].name;
					status[attr] = rows[0][i];
				}
			}
			return resolve(status);
		});
	});
	return statusPromise;
};

/**
 * @param server the server object
 */
module.exports.getBackgroundServiceJobData = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_RESPONSE_DATA';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var auth = _getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			params.headers = {
				Cookie: server.cookies
			};
		}
		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get job response data');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			return resolve(data);
		});
	});
	return statusPromise;
};

module.exports.getBackgroundServiceJobErrorData = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_RESPONSE_ERROR_DATA';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var auth = _getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			params.headers = {
				Cookie: server.cookies
			};
		}
		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get job error data');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			return resolve(data);
		});
	});
	return statusPromise;
};

/**
 * Get sites or templates from server using IdcService
 */
module.exports.browseSitesOnServer = function (request, server, fApplication, name) {
	var sitePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_SITES&siteCount=-1';
		if (fApplication) {
			url = url + '&fApplication=' + fApplication;
		}
		if (name) {
			url = url + '&name=' + name;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}
		// console.log(options);
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get sites/templates');
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
				console.log('ERROR: Failed to get sites/templates - ' + (data && data.LocalData ? +data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
			var sites = [];
			rows.forEach(function (row) {
				sites.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					sites[j][attr] = rows[j][i];
				}
			}
			// add metadata
			var mFields = data.ResultSets && data.ResultSets.dSiteMetaCollection && data.ResultSets.dSiteMetaCollection.fields || [];
			var mRows = data.ResultSets && data.ResultSets.dSiteMetaCollection && data.ResultSets.dSiteMetaCollection.rows || [];
			var siteMetadata = [];
			mRows.forEach(function (row) {
				siteMetadata.push({});
			});
			(function () {
				for (var i = 0; i < mFields.length; i++) {
					var attr = mFields[i].name;
					for (var j = 0; j < mRows.length; j++) {
						siteMetadata[j][attr] = mRows[j][i];
					}
				}
				sites.forEach(function (site) {
					for (var j = 0; j < siteMetadata.length; j++) {
						if (site.fFolderGUID === siteMetadata[j].dIdentifier) {
							Object.assign(site, siteMetadata[j]);
							break;
						}
					}
				});
			})();
			resolve({
				data: sites
			});
		});
	});
	return sitePromise;
};

/**
 * NOT Used
 * Get components from server using IdcService
 */
module.exports.browseComponentsOnServer = function (request, server, name) {
	var compPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_APPS&appCount=-1';
		if (name) {
			url = url + '&name=' + name;
		}

		var options = {
			method: 'GET',
			url: url,
			auth: auth
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get components');
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
				console.log('ERROR: Failed to get components ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.AppInfo && data.ResultSets.AppInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.AppInfo && data.ResultSets.AppInfo.rows;
			var comps = [];
			rows.forEach(function (row) {
				comps.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					comps[j][attr] = rows[j][i];
				}
			}

			// add metadata
			var mFields = data.ResultSets && data.ResultSets.dAppMetaCollection && data.ResultSets.dAppMetaCollection.fields || [];
			var mRows = data.ResultSets && data.ResultSets.dAppMetaCollection && data.ResultSets.dAppMetaCollection.rows || [];
			var appMetadata = [];
			(function () {
				mRows.forEach(function (row) {
					appMetadata.push({});
				});
				for (var i = 0; i < mFields.length; i++) {
					var attr = mFields[i].name;
					for (var j = 0; j < mRows.length; j++) {
						appMetadata[j][attr] = mRows[j][i];
					}
				}
				comps.forEach(function (comp) {
					for (var j = 0; j < appMetadata.length; j++) {
						if (comp.fFolderGUID === appMetadata[j].dIdentifier) {
							Object.assign(comp, appMetadata[j]);
							break;
						}
					}
				});
			})();

			resolve({
				data: comps
			});
		});
	});
	return compPromise;
};

/**
 * NOT Used
 * Get themes from server using IdcService
 */
module.exports.browseThemesOnServer = function (request, server, params) {
	return _browseThemesOnServer(request, server, params);
};

var _browseThemesOnServer = function (request, server, params) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_THEMES&themeCount=-1';
		if (params) {
			url = url + '&' + params;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get themes');
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
				console.log('ERROR: Failed to get themes' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ThemeInfo && data.ResultSets.ThemeInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.ThemeInfo && data.ResultSets.ThemeInfo.rows;
			var themes = [];
			rows.forEach(function (row) {
				themes.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					themes[j][attr] = rows[j][i];
				}
			}

			resolve({
				data: themes
			});
		});
	});
};


/**
 * Get folder info from server using IdcService
 */
module.exports.getFolderInfoOnServer = function (request, server, folderId) {

	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=FLD_INFO&item=fFolderGUID:' + folderId + '&doRetrieveMetadata=1';

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get folder info');
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
				console.log('ERROR: Failed to get folder info' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.FolderInfo && data.ResultSets.FolderInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.FolderInfo && data.ResultSets.FolderInfo.rows;
			var folders = [];
			rows.forEach(function (row) {
				folders.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					folders[j][attr] = rows[j][i];
				}
			}

			// add metadata
			var mFields = data.ResultSets && data.ResultSets.dCommonSCSMetaCollection && data.ResultSets.dCommonSCSMetaCollection.fields || [];
			var mRows = data.ResultSets && data.ResultSets.dCommonSCSMetaCollection && data.ResultSets.dCommonSCSMetaCollection.rows || [];
			var appMetadata = [];
			(function () {
				mRows.forEach(function (row) {
					appMetadata.push({});
				});
				for (var i = 0; i < mFields.length; i++) {
					var attr = mFields[i].name;
					for (var j = 0; j < mRows.length; j++) {
						appMetadata[j][attr] = mRows[j][i];
					}
				}
				folders.forEach(function (folder) {
					for (var j = 0; j < appMetadata.length; j++) {
						if (folder.fFolderGUID === appMetadata[j].dIdentifier) {
							Object.assign(folder, appMetadata[j]);
							break;
						}
					}
				});
			})();

			return resolve({
				folderInfo: folders[0]
			});
		});
	});
};

/**
 * Get collections from server using IdcService (IC)
 */
module.exports.browseCollectionsOnServer = function (request, server, params) {
	return _browseCollectionsOnServer(request, server, params);
};
var _browseCollectionsOnServer = function (request, server, params) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=FLD_BROWSE_COLLECTIONS&itemCount=9999';
		if (params) {
			url = url + '&' + params;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get collections');
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
				console.log('ERROR: Failed to get collections' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.Collections && data.ResultSets.Collections.fields || [];
			var rows = data.ResultSets && data.ResultSets.Collections && data.ResultSets.Collections.rows || [];
			var collections = [];
			rows.forEach(function (row) {
				collections.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					collections[j][attr] = rows[j][i];
				}
			}

			resolve({
				data: collections
			});
		});
	});
};

/**
 * Get translation connectors from server using IdcService
 */
module.exports.browseTranslationConnectorsOnServer = function (request, server) {
	var transPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/integration?IdcService=GET_ALL_CONNECTOR_INSTANCES&IsJson=1&type=translation';

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get translation connectors');
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
				console.log('ERROR: Failed to get translation connector ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ConnectorInstanceInfo && data.ResultSets.ConnectorInstanceInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.ConnectorInstanceInfo && data.ResultSets.ConnectorInstanceInfo.rows;
			var connectors = [];
			rows.forEach(function (row) {
				connectors.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					connectors[j][attr] = rows[j][i];
				}
			}

			resolve({
				data: connectors
			});
		});
	});
	return transPromise;
};

/**
 * Get translation connector job status from server using IdcService
 */
module.exports.getTranslationConnectorJobOnServer = function (request, server, jobId) {
	var jobPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=GET_CONNECTOR_JOB_INFO&jobId=' + jobId;

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get translation connector job ' + jobId);
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
				console.log('ERROR: Failed to get translation connector job ' + jobId + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ConnectorJobInfo && data.ResultSets.ConnectorJobInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.ConnectorJobInfo && data.ResultSets.ConnectorJobInfo.rows;
			var jobs = {};

			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				jobs[attr] = rows[0][i];
			}

			resolve({
				data: jobs
			});
		});
	});
	return jobPromise;
};

/**
 * Get content types used in a site from server using IdcService
 */
module.exports.getSiteContentTypes = function (request, server, siteId) {
	var compPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=GET_METADATA&items=fFolderGUID:' + siteId;

		var options = {
			method: 'GET',
			url: url,
			auth: auth
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site content types');
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
				console.log('ERROR: Failed to get site content types ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.xScsContentTypesUsedCollection && data.ResultSets.xScsContentTypesUsedCollection.fields || [];
			var rows = data.ResultSets && data.ResultSets.xScsContentTypesUsedCollection && data.ResultSets.xScsContentTypesUsedCollection.rows || [];
			var usedTypes = [];
			rows.forEach(function (row) {
				usedTypes.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					usedTypes[j][attr] = rows[j][i];
				}
			}

			var typeNames = [];
			usedTypes.forEach(function (type) {
				if (!typeNames.includes(type.xScsContentTypesUsedName)) {
					typeNames.push(type.xScsContentTypesUsedName);
				}
			});

			resolve({
				data: typeNames
			});
		});
	});
	return compPromise;
};

/**
 * Get a site's metadata (text type) from server using IdcService
 */
module.exports.getSiteMetadata = function (request, server, siteId) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		// set dMetadataSerializer to get value raw values (not escaped ones)
		var url = server.url + '/documents/web?IdcService=GET_METADATA&items=fFolderGUID:' + siteId + '&dMetadataSerializer=BaseSerializer';

		var options = {
			method: 'GET',
			url: url,
			auth: auth
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site metadata');
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
				console.log('ERROR: Failed to get site metadata ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.Metadata && data.ResultSets.Metadata.fields || [];
			var rows = data.ResultSets && data.ResultSets.Metadata && data.ResultSets.Metadata.rows || [];
			var metadata = {};

			var dFieldNameIdx, dTextValueIdx;
			for (var i = 0; i < fields.length; i++) {
				if (fields[i].name === 'dFieldName') {
					dFieldNameIdx = i;
				}
				if (fields[i].name === 'dTextValue') {
					dTextValueIdx = i;
				}
			}

			for (var j = 0; j < rows.length; j++) {
				var attr = rows[j][dFieldNameIdx];
				metadata[attr] = rows[j][dTextValueIdx];
			}

			resolve({
				data: metadata
			});
		});
	});

};


/**
 * Get a site's metadata from server using IdcService
 */
module.exports.getSiteMetadataRaw = function (request, server, siteId) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		// set dMetadataSerializer to get value raw values (not escaped ones)
		var url = server.url + '/documents/web?IdcService=GET_METADATA&items=fFolderGUID:' + siteId;

		var options = {
			method: 'GET',
			url: url,
			auth: auth
		};
		if (server.cookies) {
			options.headers = {
				Cookie: server.cookies
			};
		}

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site metadata');
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
				console.log('ERROR: Failed to get site metadata ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.dCommonSCSMetaCollection && data.ResultSets.dCommonSCSMetaCollection.fields || [];
			var rows = data.ResultSets && data.ResultSets.dCommonSCSMetaCollection && data.ResultSets.dCommonSCSMetaCollection.rows || [];
			var metadata = [];

			rows.forEach(function (row) {
				metadata.push({});
			});
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					metadata[j][attr] = rows[j][i];
				}
			}

			resolve({
				data: metadata,
				xScsComponentsUsedCollection: data.ResultSets && data.ResultSets.xScsComponentsUsedCollection,
				xScsContentItemsUsedCollection: data.ResultSets && data.ResultSets.xScsContentItemsUsedCollection,
				xScsContentTypesUsedCollection: data.ResultSets && data.ResultSets.xScsContentTypesUsedCollection
			});
		});
	});

};

/**
 * Set metadata for a site using IdcService
 */
module.exports.setSiteMetadata = function (request, server, idcToken, siteId, values, resultSets) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SET_METADATA';

		var formData = {
			'idcToken': idcToken,
			'LocalData': {
				'IdcService': 'SET_METADATA',
				items: 'fFolderGUID:' + siteId
			}
		};
		if (values) {
			Object.keys(values).forEach(function (key) {
				formData.LocalData[key] = values[key];
			});
		}
		if (resultSets) {
			formData.ResultSets = resultSets;
		}
		// console.log(JSON.stringify(formData, null, 4));

		var postData = {
			method: 'POST',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest'
			},
			body: formData,
			json: true
		};

		request(postData, function (err, response, body) {
			if(response && response.statusCode !== 200){
				console.log('ERROR: Failed to set site metadata');
				console.log('compilation server message: response status -', response.statusCode);
			}
			if (err) {
				console.log('ERROR: Failed to set site metadata');
				console.log('compilation server message: error -', err);
				return reject({
					err: err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				if (typeof body === 'object') {
					data = body;
				}
			}
			// console.log(data);
			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.log('ERROR: failed to set site metadata ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				var errorMsg = data && data.LocalData ? '- ' + data.LocalData.StatusMessage : "failed to set site metadata";
				return reject({
					err: errorMsg
				});
			} else {
				return resolve({});
			}
		});
	});

};


/**
 * Delete a file from trash using IdcService
 */
module.exports.deleteFileFromTrash = function (server, fileName) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			return console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=FLD_BROWSE_TRASH&fileCount=-1';

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		var request = _getRequest();
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to query trash');
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
				console.log('ERROR: failed to browse trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			} else {
				var idcToken = data.LocalData.idcToken;
				var fields;
				var rows;
				var fields = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.fields || [];
				var rows = data.ResultSets && data.ResultSets.ChildFiles && data.ResultSets.ChildFiles.rows;

				var items = [];
				var i, j;
				for (j = 0; j < rows.length; j++) {
					items.push({});
				}
				for (i = 0; i < fields.length; i++) {
					var attr = fields[i].name;
					for (j = 0; j < rows.length; j++) {
						items[j][attr] = rows[j][i];
					}
				}

				var idInTrash;
				for (i = 0; i < items.length; i++) {
					if (items[i].fFileName === fileName) {
						idInTrash = items[i].fFileGUID;
						break;
					}
				}

				if (idInTrash) {
					url = server.url + '/documents/web?IdcService=FLD_DELETE_FROM_TRASH';
					var formData = {
						'idcToken': idcToken,
						'items': 'fFileGUID:' + idInTrash
					};
					var postData = {
						url: url,
						'auth': auth,
						'form': formData
					};
					request.post(postData, function (err, response, body) {
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
							console.log('ERROR: failed to delete from trash ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
							return resolve({
								err: 'err'
							});
						} else {
							console.log(' - file ' + fileName + ' deleted permanently');
							return resolve({});
						}
					});

				} else {
					console.log(' - file ' + fileName + ' is not in trash');
					return resolve({});
				}
			}
		});
	});
};

module.exports.templateHasContentItems = function (projectDir, templateName) {
	_setupSourceDir(projectDir);

	var tempExist = false;
	var templates = fs.readdirSync(templatesDir);
	for (var i = 0; i < templates.length; i++) {
		if (templateName === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		return false;
	}

	var hasContent = false;
	var summaryfile = path.join(templatesDir, templateName, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		if (summaryjson && summaryjson.summary) {
			hasContent = summaryjson.summary.contentTypes && summaryjson.summary.contentTypes.length > 0;
		}
	}

	return hasContent;
};

/**
 * Get the CEC server version
 */
module.exports.getServerVersion = function (request, server) {
	return new Promise(function (resolve, reject) {
		var isPod = server.env !== 'dev_ec';
		var url = server.url + (isPod ? '/content' : '/osn/social/api/v1/connections');
		var options = {
			method: 'GET',
			url: url,
			auth: _getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error || !response || response.statusCode !== 200) {
				// console.log('ERROR: failed to query CEC version: ' + (response && response.statusMessage));
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

			var cecVersion, cecVersion2;
			if (isPod) {
				cecVersion = data ? data.toString() : '';
				if (!cecVersion) {
					// console.log('ERROR: no value returned for CEC version');
					return resolve({
						err: 'err'
					});
				}

				if (cecVersion.indexOf('Revision:') >= 0) {
					cecVersion = cecVersion.substring(cecVersion.indexOf('Revision:') + 'Revision:'.length);
				}
				cecVersion = cecVersion.trim();

				if (cecVersion.indexOf('/') > 0) {
					cecVersion = cecVersion.substring(0, cecVersion.indexOf('/'));
				}

				var arr = cecVersion.split('.');
				var versionstr = arr.length >= 2 ? arr[1] : '';

				// the version is a string such as 1922ec
				if (versionstr && versionstr.length >= 3) {
					cecVersion2 = versionstr.charAt(0) + versionstr.charAt(1) + '.' + versionstr.charAt(2);
					cecVersion = cecVersion2;
					if (versionstr.length > 3) {
						cecVersion = cecVersion + '.' + versionstr.charAt(3);
					}
				}
			} else {
				cecVersion = data && data.version;
				if (!cecVersion) {
					// console.log('ERROR: no value returned for CEC version');
					return resolve({
						err: 'err'
					});
				}
			}
			// console.log(' CEC server: ' + server.url + '  version: ' + cecVersion);
			return resolve({
				version: cecVersion
			});
		});
	});
};

/**
 * Recursively get the files in a given directory
 */
var _paths = function (dir) {
	return new Promise(function (resolve, reject) {
		fsp.readdir(dir).then((files) => {
			Promise.all(files.map((file) => {
				return new Promise(function (resolve, reject) {
					file = path.join(dir, file);
					if (file.indexOf('_scs_theme_root_') >= 0 || file.indexOf('_scs_design_name_') >= 0) {
						resolve({
							files: [],
							dirs: []
						});
					} else {
						fsp.stat(file).then((stat) => {
							if (stat.isDirectory()) {
								_paths(file).then((results) => {
									results.dirs.push(file);
									resolve(results);
								}).catch((error) => {
									resolve({
										files: [],
										dirs: []
									});
								});
							} else {
								resolve({
									files: [file],
									dirs: []
								});
							}
						});
					}
				});
			})).then(function (results) {
				resolve({
					files: [].concat.apply([], _.pluck(results, "files")),
					dirs: [].concat.apply([], _.pluck(results, "dirs")),
				});
			});
		}).catch((error) => reject(error));
	});
};
module.exports.paths = function (dir, callback) {
	_paths(dir).then((paths) => {
		callback(null, paths);
	}).catch((error) => {
		callback(error);
	});
};

/**
 * Following an unzip, remove the one child directory inside the given dir.
 * For example, after unzipping subdir.zip into dir, you may have this:
 *   dir/subdir/files*
 * calling stripTopDirectory(dir) results in
 *   dir/files*
 */
module.exports.stripTopDirectory = function (dir) {
	return new Promise(function (resolve, reject) {
		fsp.readdir(dir).then((children) => {
			// verify that the given directory has just a single child directory
			if (children.length !== 1) {
				reject("dir should contain only a single sub-directory");
			}

			var subdir = path.join(dir, children[0]);
			fsp.stat(subdir).then((stat) => {
				if (!stat.isDirectory()) {
					reject("dir should contain only a single sub-directory");
				}
				// get the files in the subdir
				fsp.readdir(subdir).then((children) => {
					Promise.all(children.map((child) => {
						// move each child into dir
						var srcfile = path.join(subdir, child);
						var tgtfile = path.join(dir, child);
						return fse.move(srcfile, tgtfile);
					})).then(() => {
						// finally remove the empty subdir
						fse.remove(subdir).then(() => {
							resolve();
						});
					});
				});
			});
		});
	});
};

/**
 * Create a digital asset
 */
module.exports.createDigitalAsset = function (request, server, repositoryId, filePath) {
	return new Promise(function (resolve, reject) {

		_getIdcToken(server)
			.then(function (result) {
				var idcToken = result && result.idcToken;
				if (!idcToken) {
					console.log('ERROR: failed to get idcToken');
					return Promise.reject();
				}

				var auth = _getRequestAuth(server);
				var url = server.url + '/documents/web';
				var formData = {
					idcToken: idcToken,
					IdcService: 'AR_UPLOAD_DIGITAL_ASSET',
					ConflictResolutionMethod: 'ResolveDuplicates',
					repository: 'arCaaSGUID:' + repositoryId,
					primaryFile: fs.createReadStream(filePath)
				};

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					formData: formData,
					json: true
				};
				// console.log(' - creating digital asset: ' + filePath);
				request(postData, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to create digital asset ' + filePath);
						console.log(err);
						return resolve({
							filePath: filePath,
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						if (typeof body === 'object') {
							data = body;
						}
					}
					// console.log(data);
					if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
						console.log('ERROR: failed to create digital asset ' + filePath);
						console.log(data);
						return resolve({
							filePath: filePath,
							err: 'err'
						});
					} else {
						var fields = data.ResultSets && data.ResultSets.AssetInfo && data.ResultSets.AssetInfo.fields || [];
						var rows = data.ResultSets && data.ResultSets.AssetInfo && data.ResultSets.AssetInfo.rows;
						var asset = {};
						for (var i = 0; i < fields.length; i++) {
							var attr = fields[i].name;
							asset[attr] = rows[0][i];
						}
						// console.log(asset);
						return resolve({
							filePath: filePath,
							fileName: asset.fItemName,
							assetId: asset.xARCaaSGUID
						});
					}
				});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					filePath: filePath,
					err: 'err'
				});
			});
	});

};