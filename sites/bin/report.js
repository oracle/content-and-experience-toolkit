/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var projectDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};


module.exports.createAssetReport = function (argv, done) {
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
	// console.log(' - server: ' + server.url);

	_createAssetReport(server, serverName, argv.site, done);
};

var _createAssetReport = function (server, serverName, siteName, done) {

	var request = serverUtils.getRequest();

	var site, siteInfo;
	var templateName, template;
	var themeName, theme;
	var repositoryId, channelId;

	var sitejson = {};
	var templatejson = {};
	var themejson = {};

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		server['login'] = true;

		serverUtils.browseSitesOnServer(request, server).then(function (result) {
				var sites = result.data || [];
				for (var i = 0; i < sites.length; i++) {
					if (siteName.toLowerCase() === sites[i].fFolderName.toLowerCase()) {
						site = sites[i];
						break;
					}
				}

				if (!site || !site.fFolderGUID) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					return Promise.reject();
				}

				//console.log(site);
				sitejson['id'] = site.fFolderGUID;
				sitejson['name'] = site.fFolderName;
				sitejson['type'] = site.xScsIsEnterprise === '1' ? 'Enterprise' : 'Standard';
				sitejson['slug'] = site.xScsSlugPrefix;
				sitejson['defaultLanguage'] = site.xScsSiteDefaultLanguage;
				sitejson['siteTemplate'] = site.xScsSiteTemplate;
				templateName = site.xScsSiteTemplate;

				return serverUtils.getSiteInfoWithToken(server, siteName);
			})
			.then(function (result) {

				siteInfo = result && result.siteInfo;
				//console.log(siteInfo);
				if (siteInfo) {
					sitejson['theme'] = siteInfo.themeName;
					themeName = siteInfo.themeName;
				}

				return serverRest.getFolderUsers({
					registeredServerName: serverName,
					currPath: projectDir,
					id: site.fFolderGUID
				});
			})
			.then(function (result) {
				sitejson['members'] =  result || [];
				console.log(sitejson);

				return serverUtils.browseSitesOnServer(request, server, 'framework.site.template');
			})
			.then(function (result) {
				//
				// list templates
				//
				var templates = result.data || [];

				for (var i = 0; i < templates.length; i++) {
					var temp = templates[i];
					if (temp.fFolderName.toLowerCase() === templateName.toLowerCase()) {
						template = temp;
						templatejson['id'] = temp.fFolderGUID;
						templatejson['name'] = temp.fFolderName;
						break;
					}
				}

				return serverRest.getFolderUsers({
					registeredServerName: serverName,
					currPath: projectDir,
					id: template.fFolderGUID
				});
			})
			.then(function (result) {
				templatejson['members'] =  result || [];
				console.log(templatejson);

				var params = 'doBrowseStarterThemes=1';
				return serverUtils.browseThemesOnServer(request, server, params);
						
			})
			.then(function (result) {
				//
				// list themes
				//
				var themes = result.data || [];

				for (var i = 0; i < themes.length; i++) {
					if (themes[i].fFolderName.toLowerCase() === themeName.toLowerCase()) {
						theme = themes[i];
						// console.log(theme);
						themejson['id'] = theme.fFolderGUID;
						themejson['name'] = theme.fFolderName;
						break;
					}
				}

				return serverRest.getFolderUsers({
					registeredServerName: serverName,
					currPath: projectDir,
					id: theme.fFolderGUID
				});
			})
			.then(function (result) {
				themejson['members'] =  result || [];
				console.log(themejson);

				done();
			})
			.catch((error) => {
				done();
			});

	}); // login
};