/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/* globals app */
/**
 * Router handling /templates requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	serverRest = require('./serverRest.js'),
	router = express.Router(),
	fs = require('fs'),
	argv = require('yargs').argv,
	path = require('path'),
	url = require('url');

var cecDir = path.resolve(__dirname).replace(path.join('test', 'server'), ''),
	defaultTestDir = cecDir + '/test',
	defaultLibsDir = cecDir + '/src/libs',
	compSiteDir = path.resolve(cecDir + '/test/sites/CompSite'),
	compThemeDir = path.resolve(cecDir + '/test/themes/CompTheme');

var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;

// console.log('componentRouter: cecDir: ' + cecDir + ' projectDir: ' + projectDir);

var templatesDir,
	themesDir,
	componentsDir,
	contentDir,
	customTemplate = '',
	customChannelToken = '';
customThemeName = '';

var _setupSourceDir = function (req, compName) {
	var srcfolder = serverUtils.getSourceFolder(projectDir);

	contentDir = path.join(srcfolder, 'content');
	templatesDir = path.join(srcfolder, 'templates');
	themesDir = path.join(srcfolder, 'themes');
	componentsDir = path.join(srcfolder, 'components');

	// if the request is for the components page, then setup the custom theme if passed in as well
	if (req.path === '/components/' + compName + '/') {
		customThemeName = req.query.theme;
		customTemplate = req.query.template;
		customChannelToken = req.query.token;
	}
};

//
// Get requests
//
router.get('/*', (req, res) => {
	let app = req.app;

	var request = require('./requestUtils.js').request;

	var filePathSuffix = req.path.replace(/\/components\//, '').replace(/\/$/, ''),
		filePath = '',
		compName = filePathSuffix.indexOf('/') > 0 ? filePathSuffix.substring(0, filePathSuffix.indexOf('/')) : filePathSuffix;

	_setupSourceDir(req, compName);

	app.locals.localTemplate = '';
	app.locals.channelToken = '';
	if (customTemplate) {
		app.locals.localTemplate = customTemplate;
	} else if (customChannelToken) {
		app.locals.channelToken = customChannelToken;
	}

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
		// remove any cache
		compFile = compFile.replace(/_cache_(....|.....)\//, '');
		compName = compFile.substring(0, compFile.indexOf('/'));
		app.locals.currentComponent = compName;

		var appInfo = serverUtils.getComponentAppInfo(projectDir, compName);
		if (appInfo && appInfo.type === 'fieldeditor') {
			var editHtmlFilePath = path.join(componentsDir, compName, 'assets', 'edit.html');
			var editHtml = fs.readFileSync(editHtmlFilePath).toString();
			editHtml = serverUtils.replaceAll(editHtml, "'", '"');
			editHtml = editHtml.replace(/(\r\n|\n|\r)/gm, " ");
			var isMapEditor = editHtml.indexOf('oraclemapsv2') > 0 ? true : false;
			var iframeHeight = isMapEditor ? '320px' : '100%';
			var filePath = path.join(compSiteDir, 'fieldeditorrender.html');
			var htmlSrc = fs.readFileSync(filePath).toString();
			var newHtmlSrc = htmlSrc.replace('_devcs_component_fieldeditor_edit_html_path', '/components/' + compName + '/assets/edit.html');
			var viewHtmlFilePath = '/components/' + compName + '/assets/view.html';
			if (!fs.existsSync(path.join(componentsDir, compName, 'assets', 'view.html'))) {
				viewHtmlFilePath = '/components/' + compName + '/assets/edit.html';
			}
			newHtmlSrc = newHtmlSrc.replace('_devcs_component_fieldeditor_view_html_path', viewHtmlFilePath);
			newHtmlSrc = serverUtils.replaceAll(newHtmlSrc, '_devcs_component_fieldeditor_iframe_height', iframeHeight);
			// console.log(newHtmlSrc);

			filePath = path.join(compSiteDir, 'fieldeditorrender.js');
			var renderjs = fs.readFileSync(filePath).toString();
			var newrenderjs = renderjs.replace('_devcs_component_fieldeditor_edit_html_src', newHtmlSrc);
			// console.log(newrenderjs);

			console.log('path=' + req.path + ' filePath=' + filePath + ' field editor=' + compName);
			res.write(newrenderjs);
			res.end();
			return;

		} else if (appInfo && appInfo.type === 'contentform') {

			var filePath = path.join(compSiteDir, 'contentformrender.js');
			var renderjs = fs.readFileSync(filePath).toString();
			var newrenderjs = renderjs.replace('_devcs_component_contentform_edit_html_path', '/components/' + compName + '/assets/edit.html');
			// console.log(newrenderjs);

			console.log('path=' + req.path + ' filePath=' + filePath + ' content form=' + compName);
			res.write(newrenderjs);
			res.end();
			return;

		} else {
			filePath = path.resolve(componentsDir + '/' + compFile);
		}

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


		// see if we want to override with a custom theme resource
		var fixedResources = [
			'layouts/index.html',
			'assets/js/main.js',
			'assets/css/main.css',
			'assets/js/appController.js'
		];
		if (customThemeName && fixedResources.indexOf(themeFile) === -1) {
			// see if the file exists under the referenced customTheme
			var customThemeFilePath = path.resolve(path.join(themesDir, customThemeName, themeFile));
			if (fs.existsSync(customThemeFilePath)) {
				filePath = customThemeFilePath;
			}
		}
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
			var comptemps = serverUtils.getComponentTemplates(projectDir, compName);
			temp = comptemps.length > 0 ? comptemps[0] : '';
		}

		var mappingfile = path.join(templatesDir, temp, 'caas_contenttypemap.json'),
			type = app.locals.currentContentItem.type,
			types = app.locals.currentContentTypes;
		console.log(' - component template: ' + temp);
		if (fs.existsSync(mappingfile)) {
			console.log(' - use mapping from : ' + mappingfile);
			mappings = JSON.parse(fs.readFileSync(mappingfile));
			for (var i = 0; i < mappings.length; i++) {
				if (mappings[i].type === type) {
					for (var j = 0; j < mappings[i].categoryList.length; j++) {
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
				pagename = '/pages/100.json';
				break;
			case 'remote':
				pagename = '/pages/100.json';
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
					newGUIDS[i] = serverUtils.createGUID();
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
				};
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
			compvalues.data.contentIds = [itemid];
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
		var compfolderFile = path.resolve(componentsDir + '/' + compName + '/_folder.json'),
			compfolderster = fs.readFileSync(compfolderFile).toString(),
			compfolderjson = JSON.parse(compfolderster),
			apptype = compfolderjson.appType;
		//
		// component file
		//
		if (filePathSuffix.indexOf('settings.html') > 0) {
			if (apptype === 'contentlayout') {
				var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				var customsettingsFilePath = path.join(componentsDir, compName, 'assets', 'settings.html');
				// console.log(JSON.stringify(params));
				if (params && params.customsettings && fs.existsSync(customsettingsFilePath)) {
					filePath = customsettingsFilePath;
				} else {
					filePath = path.resolve(compSiteDir + '/contentlayoutsettings.html');
					var settingshtml = fs.readFileSync(filePath).toString(),
						newsettingshtml = settingshtml.replace('_devcs_component_contentlayout_name', compName);
					newsettingshtml = newsettingshtml.replace('sites.min.js', 'sites.mock.min.js');
					console.log('path=' + req.path + ' filePath=' + filePath + ' layout=' + compName);
					res.write(newsettingshtml);
					res.end();
					return;
				}

			} else if (apptype === 'fieldeditor') {
				var appInfo = serverUtils.getComponentAppInfo(projectDir, compName);
				var types = appInfo && appInfo.supportedDatatypes || ['text'];
				var handlesMultiple = appInfo && appInfo.handlesMultiple;

				filePath = path.join(compSiteDir, 'fieldeditorsettings.html');
				var settingshtml = fs.readFileSync(filePath).toString();
				var newsettingshtml = settingshtml.replace('_devcs_component_fieldeditor_name', compName);
				newsettingshtml = newsettingshtml.replace('_devcs_component_fieldeditor_multi', handlesMultiple);
				newsettingshtml = newsettingshtml.replace('_devcs_component_fieldeditor_types', types.join(','));
				newsettingshtml = newsettingshtml.replace('sites.min.js', 'sites.mock.min.js');
				console.log('path=' + req.path + ' filePath=' + filePath + ' field editor=' + compName);
				res.write(newsettingshtml);
				res.end();
				return;

			} else if (apptype === 'contentform') {
				var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));

				if (params && params.customsettings) {
					var appInfo = serverUtils.getComponentAppInfo(projectDir, compName);
					var drawerSize = appInfo && appInfo.drawerSize || 'default';

					filePath = path.join(compSiteDir, 'contentformsettings.html');
					var settingshtml = fs.readFileSync(filePath).toString();
					var newsettingshtml = settingshtml.replace('_devcs_component_contentform_name', compName);
					newsettingshtml = newsettingshtml.replace('_devcs_component_contentform_drawersize', drawerSize);
					newsettingshtml = newsettingshtml.replace('sites.min.js', 'sites.mock.min.js');
					console.log('path=' + req.path + ' filePath=' + filePath + ' content form=' + compName);
					res.write(newsettingshtml);
					res.end();
					return;
				} else {
					// the content for testing
					filePath = path.resolve(compSiteDir + '/contentformcontent.html');
					var settingshtml = fs.readFileSync(filePath).toString(),
						newsettingshtml = settingshtml.replace('_devcs_component_contentform_name', compName);
					newsettingshtml = newsettingshtml.replace('sites.min.js', 'sites.mock.min.js');
					console.log('path=' + req.path + ' filePath=' + filePath + ' layout=' + compName);
					res.write(newsettingshtml);
					res.end();
					return;
				}

			} else {
				filePath = path.resolve(componentsDir + '/' + filePathSuffix);
			}
		} else if (filePathSuffix.indexOf('render.js') > 0 && apptype === 'fieldeditor') {
			filePath = path.join(componentsDir, compName, 'assets', 'view.html');
		} else if (filePathSuffix.indexOf('render.js') > 0 && apptype === 'contentform') {

			filePath = path.join(componentsDir, compName, 'assets', 'edit.html');

		} else if (filePathSuffix.indexOf('edit.html') > 0 && apptype === 'contentform') {
			console.log(' - modify content form edit.html to use content published API');
			// 
			// content form: use content published API for local testing
			//
			filePath = path.join(componentsDir, compName, 'assets', 'edit.html');
			if (fs.existsSync(filePath)) {
				var contentformEditSrc = fs.readFileSync(filePath).toString();
				contentformEditSrc = serverUtils.replaceAll(contentformEditSrc, '/content/management/api/', '/content/published/api/');
				res.write(contentformEditSrc);
				res.end();
				return;
			}
		} else {
			filePath = path.resolve(componentsDir + '/' + filePathSuffix);
		}

	} else if (filePathSuffix.indexOf(compName + '/content/') === 0) {

		// component group content files
		var contentFile = filePathSuffix.substring(filePathSuffix.lastIndexOf('/') + 1);
		filePath = path.join(componentsDir, compName, 'assets', contentFile);

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
			buf = buf.replace('_devcs_component_type', compType);
			buf = buf.replace('_devcs_component_setting_url', settingsPath);
			buf = serverUtils.replaceAll(buf, '_devcs_component_name', compName);
			buf = buf.replace('_devcs_component_custom_settings', customsettingsdatastr);
			buf = buf.replace('_devcs_component_cloud_service', cloudservicestr);

			// field editor
			var fieldEditorType = '';
			if (compType === 'fieldeditor') {
				var editHtmlFilePath = path.join(componentsDir, compName, 'assets', 'edit.html');
				if (fs.existsSync(editHtmlFilePath)) {
					var editHtml = fs.readFileSync(editHtmlFilePath).toString();
					if (editHtml.indexOf('oraclemapsv2') > 0) {
						fieldEditorType = 'map';
					} else {
						fieldEditorType = 'fieldeditor';
					}
				}
			}
			buf = buf.replace('_devcs_component_fieldeditor_type', fieldEditorType);

			// Theme designs
			var themes = fs.readdirSync(themesDir),
				themedesigns = '<select id="themedesign" class="themedesign-select" onchange="selectTheme()"><option value="none">None</option>';
			for (var i = 0; i < themes.length; i++) {
				if (fs.existsSync(path.join(themesDir, themes[i], '_folder.json'))) {
					themedesigns += '<option value="' + themes[i] + '"';
					if (themes[i] === customThemeName) {
						themedesigns += ' selected="selected"';
					}
					themedesigns += '>' + themes[i] + '</option>';
				} else {
					console.log(' - ' + themes[i] + ' is not a theme');
				}
			}
			themedesigns = themedesigns + '</select>';

			// handle theme designs
			buf = buf.replace('_devcs_theme_designs', themedesigns);

			// handle theme resources
			buf = buf.replace('_devcs_theme_resources', themedesigns.replace('selectTheme()', 'selectThemeResource()').replace('"themedesign"', '"themeresource"'));

			var clickSettingsSrc = 'var clickSettings = function () {};';
			var contentlayoutSettingsTitleSrc = '';
			if (compType === 'contentlayout') {
				buf = buf.replace('_devcs_local_content', '');
				buf = buf.replace('_devcs_server_content', '');
				buf = buf.replace('_devcs_component_settings_title', 'Content');

				var customSettingsFilePath = path.join(componentsDir, compName, 'assets', 'settings.html');
				if (fs.existsSync(customSettingsFilePath)) {
					contentlayoutSettingsTitleSrc = '<div class="oj-dialog-title devcs_column" id="settingsTitle2" onclick="clickSettings(1)" style="color: rgb(221, 221, 221);">Settings</div>';
					clickSettingsSrc = 'var clickSettings = function (customsettings) {console.log("content layout custom settings"); ' +
						'var iframeSrc = "/components/' + compName + '/assets/settings.html";' +
						'if (customsettings) {iframeSrc = iframeSrc + "?customsettings=1";}' +
						'console.log(iframeSrc);' +
						'var settingsIframe = document.getElementById("settings");' +
						'if (settingsIframe) {settingsIframe.src = iframeSrc;} }';
				}
				buf = buf.replace('_devcs_contentlayout_settings_title_div', contentlayoutSettingsTitleSrc);
				buf = buf.replace('_devcs_component_click_settings_func', clickSettingsSrc);

				res.write(buf);
				res.end();

			} else if (compType === 'contentform') {
				buf = buf.replace('_devcs_local_content', '');
				buf = buf.replace('_devcs_server_content', '');
				buf = buf.replace('_devcs_component_settings_title', 'Content');

				contentlayoutSettingsTitleSrc = '<div class="oj-dialog-title devcs_column" id="settingsTitle2" onclick="clickSettings(1)" style="color: rgb(221, 221, 221);">Form Properties</div>';
				clickSettingsSrc = 'var clickSettings = function (customsettings) {console.log("content form settings"); ' +
					'var iframeSrc = "/components/' + compName + '/assets/settings.html";' +
					'if (customsettings) {iframeSrc = iframeSrc + "?customsettings=1";}' +
					'console.log(iframeSrc);' +
					'var settingsIframe = document.getElementById("settings");' +
					'if (settingsIframe) {settingsIframe.src = iframeSrc;} }';

				buf = buf.replace('_devcs_contentlayout_settings_title_div', contentlayoutSettingsTitleSrc);
				buf = buf.replace('_devcs_component_click_settings_func', clickSettingsSrc);

				res.write(buf);
				res.end();

			} else {
				buf = buf.replace('_devcs_component_settings_title', 'Settings');
				buf = buf.replace('_devcs_contentlayout_settings_title_div', contentlayoutSettingsTitleSrc);
				buf = buf.replace('_devcs_component_click_settings_func', clickSettingsSrc);

				var localContentHtml = '<div class="themedesign"><span>Local Content</span>' +
					'<select id="localcontent" class="themedesign-select" onchange="selectLocalContent()">' +
					'<option value="none">None</option>';
				var templates = fs.readdirSync(templatesDir);
				console.log('    site templates: ' + templates);
				templates.forEach(function (tempName) {
					if (fs.existsSync(path.join(templatesDir, tempName, 'assets', 'contenttemplate', 'Content Template of ' + tempName))) {
						localContentHtml += '<option value="' + tempName + '"';
						if (app.locals.localTemplate && tempName === app.locals.localTemplate) {
							localContentHtml += ' selected="selected"';
						}
						localContentHtml += '>' + tempName + '</option>';
					}
				});
				templates = fs.readdirSync(contentDir);
				console.log('    content templates: ' + templates);
				templates.forEach(function (tempName) {
					if (fs.existsSync(path.join(contentDir, tempName, 'contentexport'))) {
						localContentHtml += '<option value="' + tempName + '"';
						if (app.locals.localTemplate && tempName === app.locals.localTemplate) {
							localContentHtml += ' selected="selected"';
						}
						localContentHtml += '>' + tempName + '</option>';
					}
				});
				localContentHtml += '</select></div>';
				buf = buf.replace('_devcs_local_content', localContentHtml);

				var serverContentHtml = '<div class="themedesign"><span>Server Content</span>' +
					'<select id="servercontent" class="themedesign-select" onchange="selectServerContent()">' +
					'<option value="none">None</option>';
				if (!app.locals.connectToServer) {
					serverContentHtml += '</select></div>';
					buf = buf.replace('_devcs_server_content', serverContentHtml);

					res.write(buf);
					res.end();
				} else {
					serverRest.getChannels({
							server: app.locals.server
						})
						.then(function (result) {
							// console.log(result);
							var channels = [];
							var channelNames = [];
							if (result && result.length > 0) {
								result.forEach(function (channel) {
									var channelToken;
									var tokens = channel.channelTokens || [];
									for (var i = 0; i < tokens.length; i++) {
										if (tokens[i].name === 'defaultToken') {
											channelToken = tokens[i].token;
											break;
										}
									}
									if (!channelToken && tokens.length > 0) {
										channelToken = tokens[0].value;
									}
									channelNames.push(channel.name);
									channels.push({
										name: channel.name,
										token: channelToken
									});
								});
							}
							console.log('    server channels: ' + channelNames);
							channels.forEach(function (channel) {
								serverContentHtml += '<option value="' + channel.token + '"';
								if (app.locals.channelToken && app.locals.channelToken === channel.token) {
									serverContentHtml += ' selected="selected"';
								}
								serverContentHtml += '>' + channel.name + '</option>';
							});
							serverContentHtml += '</select></div>';
							buf = buf.replace('_devcs_server_content', serverContentHtml);

							res.write(buf);
							res.end();
						});
				}
			}
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
			var options = {
				method: 'GET',
				url: 'http://localhost:' + app.locals.port + '/getvbcsconnection'
			};
			request.get(options, function (err, response, body) {
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					vbcsconn = data ? data.VBCSConnection : '';
				} else {
					console.log('status=' + response.statusCode + ' err=' + err);
				}

				var structurebuf = fs.readFileSync(filePath).toString();

				if (customThemeName) {
					structurebuf = structurebuf.replace('CompTheme', customThemeName);
				}

				var structurejson = JSON.parse(structurebuf);

				structurejson.siteInfo.base.properties.siteConnections = {
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


// Export the router
module.exports = router;