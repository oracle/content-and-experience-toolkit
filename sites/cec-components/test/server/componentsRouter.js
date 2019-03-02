/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals app, module, __dirname */
/* jshint esversion: 6 */
/**
 * Router handling /templates requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	fs = require('fs'),
	argv = require('yargs').argv,
	path = require('path'),
	url = require('url'),
	uuid4 = require('uuid/v4');

var projectDir = path.resolve(__dirname).replace(path.join('test', 'server'), ''),
	defaultTemplatesDir = projectDir + '/src/main/templates',
	defaultThemesDir = projectDir + '/src/main/themes',
	defaultComponentsDir = projectDir + '/src/main/components',
	defaultTestDir = projectDir + '/test',
	defaultLibsDir = projectDir + '/src/libs';

var templatesDir = path.resolve(argv.templatesDir || defaultTemplatesDir),
	themesDir = path.resolve(argv.themesDir || defaultThemesDir),
	componentsDir = path.resolve(argv.componentsDir || defaultComponentsDir),
	compSiteDir = path.resolve(projectDir + '/test/sites/CompSite'),
	compThemeDir = path.resolve(projectDir + '/test/themes/CompTheme');

//
// Get requests
//
router.get('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request;

	var filePathSuffix = req.path.replace(/\/components\//, '').replace(/\/$/, ''),
		filePath = '',
		compName = filePathSuffix.indexOf('/') > 0 ? filePathSuffix.substring(0, filePathSuffix.indexOf('/')) : filePathSuffix;

	// console.log(' **** filePathSuffix=' + filePathSuffix + ' comp=' + compName);

	if (req.path === '/components' || req.path === '/components/') {
		res.redirect('/public/components');
		res.end();
		return;
	}

	app.locals.currentComponent = compName;

	console.log('### Component: ' + req.url);

	if (req.path.indexOf('/_compdelivery/') === 0) {
		// 
		// component render
		//
		var compFile = req.path.replace(/\/_compdelivery\//, '').replace(/\/$/, '');
		compName = compFile.substring(0, compFile.indexOf('/'));
		filePath = path.resolve(componentsDir + '/' + compFile);
		app.locals.currentComponent = compName;
	} else if (req.path.indexOf('/_themes/_components/') === 0) {
		// 
		// component render (contentClient.renderItem)
		//
		var compFile = req.path.replace(/\/_themes\/_components\//, '').replace(/\/$/, '');
		compName = compFile.substring(0, compFile.indexOf('/'));
		filePath = path.resolve(componentsDir + '/' + compFile);
		app.locals.currentComponent = compName;
	} else if (filePathSuffix.indexOf('/_themesdelivery/') > 0) {
		//
		// theme
		var themeName = filePathSuffix.substring(filePathSuffix.indexOf('/_themesdelivery/') + '/_themesdelivery/'.length),
			themeFile = '';
		themeName = themeName.substring(0, themeName.indexOf('/'));
		themeFile = filePathSuffix.substring(filePathSuffix.indexOf('/' + themeName + '/') + themeName.length + 2);
		filePath = path.resolve(compThemeDir + '/' + themeFile);
	} else if (filePathSuffix.indexOf('/_sitesclouddelivery/') > 0) {
		var fpath = filePathSuffix.substring(filePathSuffix.indexOf('/_sitesclouddelivery/') + '/_sitesclouddelivery/'.length),
			useServer = filePathSuffix.indexOf('/app/apps/') > 0;

		if (useServer) {
			res.redirect('/' + fpath);
			res.end();
			return;
		} else {
			filePath = path.resolve(defaultTestDir + '/sitescloud/' + fpath);
		}
	} else if (filePathSuffix.indexOf('require.js') > 0) {
		filePath = path.resolve(defaultLibsDir + '/requirejs/require.js');
	} else if (filePathSuffix.indexOf('renderer.js') > 0) {
		filePath = path.resolve(defaultTestDir + '/sitescloud/renderer/renderer.js');
	} else if (filePathSuffix.indexOf('/detail-page/') > 0) {
		// get the content info
		var itemstr = filePathSuffix.substring(filePathSuffix.indexOf('/detail-page/') + 13),
			iteminfo = itemstr.split('/'),
			itemtype = iteminfo.length > 0 ? iteminfo[0] : '',
			itemid = iteminfo.length > 1 ? iteminfo[1] : '',
			itemname = iteminfo.length > 2 ? iteminfo[2] : '';
		if (itemtype && itemid && itemname) {
			app.locals.currentContentItem.type = itemtype;
			app.locals.currentContentItem.id = itemid;
			app.locals.currentContentItem.name = itemname;
			console.log(' - detail-page: set item type ' + itemtype + ' id ' + itemid + ' name ' + itemname);
		}
	} else if (filePathSuffix.indexOf('caas_contenttypemap.json') > 0) {
		var mappings = [],
			temp = app.locals.currentContentItem.template;

		if (!temp) {
			var comptemps = serverUtils.getComponentTemplates(compName);
			temp = comptemps.length > 0 ? comptemps[0] : '';
		}

		var mappingfile = path.join(templatesDir, temp, 'caas_contenttypemap.json'),
			type = app.locals.currentContentItem.type,
			types = app.locals.currentContentTypes;
		console.log(' - component template: ' + temp);
		if (fs.existsSync(mappingfile)) {
			console.log(' - use mapping from : ' + mappingfile);
			mappings = JSON.parse(fs.readFileSync(mappingfile));
			for(var i = 0; i < mappings.length; i++) {
				if (mappings[i].type === type) {
					for(var j = 0; j < mappings[i].categoryList.length; j++) {
						if (mappings[i].categoryList[j].categoryName === 'Default') {
							mappings[i].categoryList[j].layoutName = compName;
							console.log(' - set layout to ' + compName + ' for type ' + type);
							break;
						}
					}
				}
			}
		} else {
			console.log(' - set content layout to ' + compName + ' for type ' + types);
			for (var i = 0; i < types.length; i++) {
				mappings[i] = {
					"type": types[i],
					"categoryList": [{
						"categoryName": "Default",
						"layoutName": compName
					}, {
						"categoryName": "Content List Default",
						"layoutName": compName
					}, {
						"categoryName": "Content Placeholder Default",
						"layoutName": compName
					}, {
						"categoryName": "Empty Content List Default",
						"layoutName": compName
					}]
				};
			}
		}
		res.write(JSON.stringify(mappings));
		res.end();
		return;
	} else if (filePathSuffix.indexOf('structure.json') >= 0) {
		filePath = path.resolve(compSiteDir + '/structure.json');
	} else if (filePathSuffix.indexOf('/pages/') >= 0 && filePathSuffix.indexOf('.json') > 0) {
		//
		// page
		//
		var compfolderFile = path.resolve(componentsDir + '/' + compName + '/_folder.json'),
			compfolderster = fs.readFileSync(compfolderFile).toString(),
			compfolderjson = JSON.parse(compfolderster),
			compAppInfoFile = path.resolve(componentsDir + '/' + compName + '/appinfo.json'),
			compstr = fs.readFileSync(compAppInfoFile).toString(),
			compjson = JSON.parse(compstr),
			apptype = compfolderjson.appType,
			comptype = '';

		switch (apptype) {
			case 'sectionlayout':
				comptype = 'scs-sectionlayout';
				break;
			case 'componentgroup':
				comptype = 'scs-componentgroup';
				break;
			case 'sandboxed':
				comptype = 'scs-app';
				break;
			case 'vbcs':
				comptype = 'scs-app';
				break;
			default:
				comptype = apptype;
		}

		var pagename;
		switch (comptype) {
			case 'scs-sectionlayout':
				pagename = '/pages/300.json';
				break;
			case 'scs-componentgroup':
				pagename = '/pages/200.json';
				break;
			case 'scs-app':
				pagename = '/pages/100.json'
				break;
			case 'remote':
				pagename = '/pages/100.json'
				break;
			default:
				pagename = '/pages/1.json';
		}
		if (apptype === 'contentlayout') {
			pagename = '/pages/400.json';
		}

		var pageFilePath = path.resolve(compSiteDir + pagename),
			pagestr = existsAndIsFile(pageFilePath) ? fs.readFileSync(pageFilePath).toString() : '{}',
			pagejson = JSON.parse(pagestr),
			componentInstances = pagejson && pagejson.base ? pagejson.base.componentInstances : undefined,
			compvalues;

		if (componentInstances) {
			Object.keys(componentInstances).forEach(function (key) {
				if (!compvalues) {
					compvalues = componentInstances[key];
				}
				return;
			});
		}

		// replace with the selected component
		if (comptype === 'scs-app') {
			compvalues.id = compName;
			compvalues.data.appName = compName;
			compvalues.data.customSettingsData = compjson.initialData.customSettingsData;
			if (compjson.initialData.cloudService) {
				compvalues.data.cloudService = compjson.initialData.cloudService;
			}
		} else if (comptype === 'remote') {
			compvalues.id = compName;
			compvalues.data.appName = compName;
			compvalues.data.appType = comptype;
			compvalues.data.appSrc = compjson.endpoints.widget.url;
		} else if (comptype === 'scs-componentgroup') {
			compvalues.id = compName;

			var compgroupcomponentInstances = compjson.initialData.componentInstances,
				components = compjson.initialData.components,
				compgroupcompvalues = [];
			delete compjson.initialData['componentInstances'];
			compvalues.data = compjson.initialData;

			// add the components inside the component-group to the page
			if (compgroupcomponentInstances) {
				Object.keys(compgroupcomponentInstances).forEach(function (key) {
					compgroupcompvalues.push(compgroupcomponentInstances[key]);
				});
				for (var i = 0; i < compgroupcompvalues.length; i++) {
					if (components && components.length > i) {
						// console.log('add component group component inatance: id=' + components[i] + ' data=' + JSON.stringify(compgroupcompvalues[i]));
						componentInstances[components[i]] = compgroupcompvalues[i];
					}
				}

				var newpagestr = JSON.stringify(pagejson),
					reReplace = /\[!--\$\s*scsGenerateComponentId\s*\(\s*([0-9]+)\s*\)\s*--\]/g,
					newGUIDS = [];

				for (var i = 0; i < components.length; i++) {
					newGUIDS[i] = createGUID();
				}
				// create new instance id

				newpagestr = newpagestr.replace(reReplace, function (matchString, subMatchString1, offset, wholeString) {
					var idx = Number(subMatchString1) - 1,
						guid = idx < newGUIDS.length ? newGUIDS[idx] : matchString;
					// console.log('matchString=' + matchString + ' subMatchString1=' + subMatchString1 + ' guid=' + guid);

					return guid;
				});

				pagejson = JSON.parse(newpagestr);
			}
		} else if (comptype === 'scs-sectionlayout') {
			compvalues.id = compName;
			var comps = compvalues.data.components;
			compvalues.data = compjson.initialData;
			compvalues.data.components = comps;
			var tabData = {};
			// set tab titles
			for (var i = 0; i < comps.length; i++) {
				tabData[comps[i]] = {
					'label': '  ' + (i + 1) + '  '
				}
			}
			compvalues.data.tabData = tabData;
		} else if (apptype === 'contentlayout') {
			var itemid = app.locals.currentContentItem.id,
				itemtype = app.locals.currentContentItem.type,
				itemname = app.locals.currentContentItem.name;
			compvalues.data.contentId = itemid;
			compvalues.data.componentName = itemname;
			compvalues.data.contentTypes = [itemtype];
			compvalues.data.description = itemname + ' : Default';
			compvalues.data.contentIds = [itemid]
		} else {
			comptype = 'scs-component';
			compvalues.id = compName;
			compvalues.type = comptype;
			compvalues.data = compjson.initialData;
		}
		console.log('*** appType=' + apptype + ' compType=' + comptype + ' page=' + pagename);

		res.write(JSON.stringify(pagejson));
		res.end();
		return;
	} else if (filePathSuffix.indexOf(compName + '/assets/') === 0) {
		//
		// component file
		//
		if (filePathSuffix.indexOf('settings.html') > 0) {
			var compfolderFile = path.resolve(componentsDir + '/' + compName + '/_folder.json'),
				compfolderster = fs.readFileSync(compfolderFile).toString(),
				compfolderjson = JSON.parse(compfolderster),
				apptype = compfolderjson.appType;
			if (apptype === 'contentlayout') {
				filePath = path.resolve(compSiteDir + '/contentlayoutsettings.html');
				var settingshtml = fs.readFileSync(filePath).toString(),
					newsettingshtml = settingshtml.replace('_devcs_component_contentlayout_name', compName);
				newsettingshtml = newsettingshtml.replace('sites.min.js', 'sites.mock.min.js');
				console.log('path=' + req.path + ' filePath=' + filePath + ' layout=' + compName);
				res.write(newsettingshtml);
				res.end();
				return;
			} else {
				filePath = filePath = path.resolve(componentsDir + '/' + filePathSuffix);
			}
		} else {
			filePath = path.resolve(componentsDir + '/' + filePathSuffix);
		}
	} else {
		filePath = path.resolve(compSiteDir + '/' + filePathSuffix);
	}

	if (!existsAndIsFile(filePath)) {
		if (filePath.indexOf('settings.html') > 0) {
			// display message
			filePath = path.resolve(compSiteDir + '/nosettings.html');
		} else if (filePath.indexOf('.html') < 0 && filePath.indexOf('.css') < 0 && filePath.indexOf('.js') < 0 && filePath.indexOf('.png') < 0) {
			filePath = path.resolve(compSiteDir + '/controller.html');
		}
	}

	console.log(' - filePath=' + filePath);

	if (filePath && existsAndIsFile(filePath)) {
		if (filePath.indexOf('controller.html') > 0) {
			//
			// insert SCS 
			//
			var buf = fs.readFileSync(filePath).toString(),
				loc = buf.indexOf('<script'),
				modifiedFile = '';
			if (loc < 0) {
				// do not insert SCS
				res.sendFile(filePath);
			} else {
				modifiedFile = buf.substring(0, loc) +
					'<script type="text/javascript"> var SCS = { sitePrefix: "/components/' + compName + '/" }; </script>' +
					buf.substring(loc);
				res.write(modifiedFile);
				res.end();
			}
		} else if (filePath.indexOf('layouts') > 0) {
			//
			// set the settings file for the selected component
			var buf = fs.readFileSync(filePath).toString(),
				compfolderFile = path.resolve(componentsDir + '/' + compName + '/_folder.json'),
				compfolderster = fs.readFileSync(compfolderFile).toString(),
				compfolderjson = JSON.parse(compfolderster),
				compType = compfolderjson.appType,
				settingsPath = '/components/' + compName + '/assets/settings.html',
				compAppInfoFile = path.resolve(componentsDir + '/' + compName + '/appinfo.json'),
				compstr = fs.readFileSync(compAppInfoFile).toString(),
				compjson = JSON.parse(compstr),
				customsettingsdatastr = compjson.initialData && compjson.initialData.customSettingsData ? JSON.stringify(compjson.initialData.customSettingsData) : '{}',
				cloudservicestr = compjson.initialData && compjson.initialData.cloudService ? JSON.stringify(compjson.initialData.cloudService) : '{}';

			if (compType === 'remote') {
				settingsPath = compjson.endpoints.settings.url;
			}
			console.log('*** component settingsPath=' + settingsPath);

			buf = buf.replace('_devcs_component_setting_url', settingsPath);
			buf = buf.replace('_devcs_component_name', compName);
			buf = buf.replace('_devcs_component_name', compName);
			buf = buf.replace('_devcs_component_custom_settings', customsettingsdatastr);
			buf = buf.replace('_devcs_component_cloud_service', cloudservicestr);

			// Theme designs
			var themes = fs.readdirSync(themesDir),
				themedesigns = '<select id="themedesign" class="themedesign-select" onchange="selectTheme()"><option value="none">None</option>';
			for(var i = 0; i < themes.length; i++) {
				if (fs.existsSync(path.join(themesDir, themes[i], '_folder.json'))) {
					themedesigns = themedesigns + '<option value="' + themes[i] + '">' + themes[i] + '</option>';
				} else {
					console.log(' - ' + themes[i] + ' is not a theme');
				}
			}
			themedesigns = themedesigns + '</select>';
			buf = buf.replace('_devcs_theme_designs', themedesigns);

			res.write(buf);
			res.end();
		} else if (filePath.indexOf('settings.html') > 0) {
			// 
			// update the SitesSDK for settings
			//
			var buf = fs.readFileSync(filePath).toString();
			buf = buf.replace('sites.min.js', 'sites.mock.min.js');
			res.write(buf);
			res.end();
		} else if (filePath.indexOf('structure.json') > 0) {
			// add connections
			var vbcsconn = '';
			request('http://localhost:8085/getvbcsconnection', {
				isJson: true
			}, function (err, response, body) {
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					vbcsconn = data ? data.VBCSConnection : '';
				} else {
					console.log('status=' + response.statusCode + ' err=' + err);
				}

				var structurebuf = fs.readFileSync(filePath).toString(),
					structurejson = JSON.parse(structurebuf);

				structurejson.siteInfo.base.properties['siteConnections'] = {
					VBCSConnection: vbcsconn
				};

				res.write(JSON.stringify(structurejson));
				res.end();
			});
		} else {
			// original file
			res.sendFile(filePath);
		}
	} else {
		console.log('404: ' + filePath);
		res.writeHead(404, {});
		res.end();
	}
});

//
// POST requests
//
router.post('/*', (req, res) => {
	console.log('path ' + req.path + ' not supported yet');
	res.writeHead(200, {});
	res.end();
});

var existsAndIsFile = function (filePath) {
	var ok = false;
	if (fs.existsSync(filePath)) {
		var statInfo = fs.statSync(filePath);
		ok = statInfo && statInfo.isFile();
	}
	return ok;
};

var createGUID = function () {
	'use strict';
	let guid1 = uuid4();
	let guid2 = uuid4();
	guid1 = guid1.replace(/-/g, '').toUpperCase();
	guid2 = guid2.replace(/-/g, '').toUpperCase();
	const guid = 'C' + guid1 + guid2.substr(0, 11);
	return guid;
};

// Export the router
module.exports = router;
