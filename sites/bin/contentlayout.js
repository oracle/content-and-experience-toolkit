/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Content Layout library
 */

var express = require('express'),
	app = express(),
	fs = require('fs'),
	os = require('os'),
	path = require('path'),
	decompress = require('decompress'),
	serverUtils = require('../test/server/serverUtils.js');

var cecDir = path.join(__dirname, ".."),
	componentsDataDir = path.join(cecDir, 'data', 'components');

var projectDir,
	componentsSrcDir,
	serversSrcDir,
	templatesSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	serversSrcDir = path.join(srcfolder, 'servers');
	templatesSrcDir = path.join(srcfolder, 'templates');

	return true;
}

/**
 * List all content types on the server
 */
module.exports.listServerContentTypes = function (argv, done) {
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
	console.log(' - server: ' + server.url);

	var typesPromise = serverUtils.getContentTypesFromServer(server);
	typesPromise.then(function (result) {
		var types = result && result.items;
		var typeFound = false;
		if (types && types.length > 0) {
			var byName = types.slice(0);
			byName.sort(function (a, b) {
				var x = a.name;
				var y = b.name;
				return (x < y ? -1 : x > y ? 1 : 0);
			});
			types = byName;
			var typeFound = false;
			for (var i = 0; i < types.length; i++) {
				if (types[i].name !== 'DigitalAsset') {
					console.log(' ' + types[i].name);
					typeFound = true;
				}
			}
		}
		if (!typeFound) {
			console.log(' - no content type on the server')
		}

		done(true);
	});
};

/**
 * Create content layout
 * Unzip the zip file of the seeded content layout and place into the /src
 */
module.exports.createContentLayout = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var useserver = argv.server ? true : false;
	var serverName;
	var server;
	if (useserver) {
		serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		console.log(' - server: ' + server.url);
	}

	var contenttypename = argv.contenttype,
		layoutname = argv.name,
		templatename = argv.template,
		layoutstyle = (argv.style || 'overview').toLowerCase(),
		seededComponents = fs.readdirSync(componentsDataDir);

	if (!contenttypename && !layoutname) {
		console.error('ERROR: please run as npm run create-contentlayout -- --contenttype <content type name> --name <new content layout name>');
		done();
		return;
	}
	if (!contenttypename) {
		console.error('ERROR: please use --contenttype to specify the content type');
		done();
		return;
	}
	if (!layoutname) {
		console.error('ERROR: please use --name to specify the new content layout name');
		done();
		return;
	}

	// verify the new content layout name 
	var re = /^[a-z0-9_-]+$/ig;
	if (layoutname.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(componentsSrcDir + '/' + layoutname)) {
			console.error('ERROR: A component with the name ' + layoutname + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	if (templatename && templatename !== undefined) {
		// verify the template
		var templates = serverUtils.getTemplates(projectDir),
			foundtemplate = false;
		for (var i = 0; i < templates.length; i++) {
			if (templates[i].name === templatename) {
				foundtemplate = true;
				break;
			}
		}
		if (!foundtemplate) {
			console.error('ERROR: invalid template ' + templatename);
			done();
			return;
		}
	}

	if (useserver) {

		// verify the content type
		var typesPromise = serverUtils.getContentTypesFromServer(server);
		typesPromise.then(function (result) {
			var types = result && result.items || [];
			var foundtype = false,
				contenttype;
			for (var i = 0; i < types.length; i++) {
				if (types[i].name === contenttypename) {
					contenttype = types[i];
					foundtype = true;
					break;
				}
			}
			if (!foundtype) {
				console.error('ERROR: invalid content type ' + contenttypename);
				done();
				return;
			}

			serverUtils.getContentTypeFieldsFromServer(server, contenttypename, function (typefields) {
				if (!typefields || typefields.length === 0) {
					console.error('ERROR: content type ' + contenttypename + ' does not have any field');
					done();
					return;
				}
				var fields = [],
					typeprefix = contenttypename.toLowerCase();

				for (var i = 0; i < typefields.length; i++) {
					var field = typefields[i];
					fields[fields.length] = field;
				}
				if (fields.length === 0) {
					console.error('ERROR: content type ' + contenttypename + ' does not have any field');
					done();
					return;
				}

				contenttype['fields'] = fields;
				_createContentLayout(contenttypename, contenttype, layoutname, layoutstyle, true, done);
			});
		});

	} else {
		// verify the content type
		var contenttype = serverUtils.getContentType(projectDir, contenttypename, templatename);
		// console.log(JSON.stringify(contenttype));
		if (!contenttype || !contenttype.id) {
			console.error('ERROR: invalid content type ' + contenttypename);
			done();
			return;
		}
		if (!contenttype.fields || contenttype.fields.length === 0) {
			console.error('ERROR: content type ' + contenttypename + ' does not have any field');
			done();
			return;
		}

		_createContentLayout(contenttypename, contenttype, layoutname, layoutstyle, false, done);
	}
};

/**
 * Add content layout mapping to a template
 */
module.exports.addContentLayoutMapping = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var contenttypename = argv.contenttype,
		layoutname = argv.contentlayout,
		layoutstyle = argv.layoutstyle || 'Default',
		templatename = argv.template,
		mobile = argv.mobile || false;

	if (typeof argv.mobile === 'string') {
		mobile = argv.mobile.toLowerCase() === 'true';
	}

	if (!contenttypename && !layoutname && !templatename) {
		console.error('ERROR: please run as npm run add-contentlayout-mapping -- --contenttype <content type name> --contentlayout <content layout name> --template <template name> [--layoutstyle <content style>]');
		done();
		return;
	}
	if (!contenttypename) {
		console.error('ERROR: please use --contenttype to specify the content type');
		done();
		return;
	}
	if (!layoutname) {
		console.error('ERROR: please use --contentlayout to specify the content layout');
		done();
		return;
	}
	if (!templatename) {
		console.error('ERROR: please use --template to specify the template');
		done();
		return;
	}

	// verify the content layout
	var components = serverUtils.getComponents(projectDir),
		foundlayout = false;
	for (var i = 0; i < components.length; i++) {
		if (components[i].name === layoutname && components[i].type === 'contentlayout') {
			foundlayout = true;
			break;
		}
	}
	if (!foundlayout) {
		console.error('ERROR: invalid content layout ' + layoutname);
		done();
		return;
	}

	// verify the template
	var templates = serverUtils.getTemplates(projectDir),
		foundtemplate = false;
	for (var i = 0; i < templates.length; i++) {
		if (templates[i].name === templatename) {
			foundtemplate = true;
			break;
		}
	}
	if (!foundtemplate) {
		console.error('ERROR: invalid template ' + templatename);
		done();
		return;
	}

	// verify the content type
	var contenttype = serverUtils.getContentType(projectDir, contenttypename, templatename);
	if (!contenttype || !contenttype.id) {
		console.error('ERROR: invalid content type ' + contenttypename);
		done();
		return;
	}
	if (!contenttype.fields || contenttype.fields.length === 0) {
		console.error('ERROR: content type ' + contenttypename + ' does not have any field');
		done();
		return;
	}

	var mappingfile = path.join(templatesSrcDir, templatename, 'caas_contenttypemap.json'),
		mappings = [],
		foundtype = false;
	if (fs.existsSync(mappingfile)) {
		mappings = JSON.parse(fs.readFileSync(mappingfile));
		// check if the content type is in the mappings
		for (var i = 0; i < mappings.length; i++) {
			if (mappings[i].type === contenttypename) {
				foundtype = true;
				break;
			}
		}
	}
	if (!foundtype) {
		mappings[mappings.length] = {
			"type": contenttypename,
			"categoryList": [{
					"categoryName": "Default",
					"layoutName": ""
				},
				{
					"categoryName": "Content List Default",
					"layoutName": ""
				},
				{
					"categoryName": "Content Placeholder Default",
					"layoutName": ""
				},
				{
					"categoryName": "Empty Content List Default",
					"layoutName": ""
				}
			]
		};
	}
	if (mobile) {
		layoutstyle = layoutstyle + '|mobile';
	}
	// now add the mapping for the type
	for (var i = 0; i < mappings.length; i++) {
		if (mappings[i].type === contenttypename) {
			var catelist = mappings[i].categoryList,
				foundmapping = false;
			for (var j = 0; j < catelist.length; j++) {
				if (catelist[j].categoryName === layoutstyle) {
					catelist[j].layoutName = layoutname;
					foundmapping = true;
				}
			}
			if (!foundmapping) {
				catelist[catelist.length] = {
					"categoryName": layoutstyle,
					"layoutName": layoutname
				};
			}
		}
	}
	fs.writeFileSync(mappingfile, JSON.stringify(mappings));

	// also update summary.json
	var summaryfile = path.join(templatesSrcDir, templatename, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		summaryjson["categoryLayoutMappings"] = mappings;
		if (summaryjson.hasOwnProperty("layoutComponents") && summaryjson.layoutComponents.indexOf(layoutname) < 0) {
			summaryjson.layoutComponents[summaryjson.layoutComponents.length] = layoutname;
		} else {
			summaryjson["layoutComponents"] = [layoutname];
		}

		fs.writeFileSync(summaryfile, JSON.stringify(summaryjson));
	}

	console.log('Content layout ' + layoutname + ' is set to use by type ' + contenttypename + ' for template ' + templatename);
	done(true);
};

/**
 * remove content layout mapping from a template
 */
module.exports.removeContentLayoutMapping = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var templatename = argv.template,
		layoutname = argv.contentlayout,
		layoutstyle = argv.layoutstyle,
		mobile = argv.mobile || false;

	if (typeof argv.mobile === 'string') {
		mobile = argv.mobile.toLowerCase() === 'true';
	}

	if (!templatename && !layoutname && !layoutstyle) {
		console.error('ERROR: please run as npm run remove-contentlayout-mapping -- --template <template name> [--contentlayout <content layout name> | --layoutstyle <content style>]');
		done();
		return;
	}

	if (!templatename) {
		console.error('ERROR: please use --template to specify the template');
		done();
		return;
	}

	if (!layoutname && !layoutstyle) {
		console.error('ERROR: please use --contentlayout to specify the conentlayout and/or --layoutstyle to specify the layout style');
		done();
		return;
	}

	// verify the template
	var templates = serverUtils.getTemplates(projectDir),
		foundtemplate = false;
	for (var i = 0; i < templates.length; i++) {
		if (templates[i].name === templatename) {
			foundtemplate = true;
			break;
		}
	}
	if (!foundtemplate) {
		console.error('ERROR: invalid template ' + templatename);
		done();
		return;
	}

	if (layoutname) {
		// verify the content layout
		var components = serverUtils.getComponents(projectDir),
			foundlayout = false;
		for (var i = 0; i < components.length; i++) {
			if (components[i].name === layoutname && components[i].type === 'contentlayout') {
				foundlayout = true;
				break;
			}
		}
		if (!foundlayout) {
			console.error('ERROR: invalid content layout ' + layoutname);
			done();
			return;
		}
	}

	var mappingfile = path.join(templatesSrcDir, templatename, 'caas_contenttypemap.json');
	if (mobile && layoutstyle) {
		layoutstyle = layoutstyle + '|mobile';
	}
	if (fs.existsSync(mappingfile)) {
		var mappings = JSON.parse(fs.readFileSync(mappingfile));
		if (layoutstyle && layoutname) {
			for (var i = 0; i < mappings.length; i++) {
				var catelist = mappings[i].categoryList;
				for (var j = 0; j < catelist.length; j++) {
					if (catelist[j].categoryName === layoutstyle && catelist[j].layoutName === layoutname) {
						if (mobile) {
							catelist.splice(j, 1);
						} else {
							catelist[j].layoutName = '';
						}
					}
				}
			}
		} else if (layoutstyle) {
			for (var i = 0; i < mappings.length; i++) {
				var catelist = mappings[i].categoryList;
				for (var j = catelist.length - 1; j >= 0; j--) {
					if (catelist[j].categoryName === layoutstyle) {
						catelist.splice(j, 1);
					}
				}
			}
		} else if (layoutname) {
			for (var i = 0; i < mappings.length; i++) {
				var catelist = mappings[i].categoryList;
				for (var j = 0; j < catelist.length; j++) {
					if (catelist[j].layoutName === layoutname) {
						if (mobile) {
							catelist.splice(j, 1);
						} else {
							catelist[j].layoutName = '';
						}
					}
				}
			}
		}
		fs.writeFileSync(mappingfile, JSON.stringify(mappings));

		// also update summary.json
		var summaryfile = path.join(templatesSrcDir, templatename, 'assets', 'contenttemplate', 'summary.json');
		if (fs.existsSync(summaryfile)) {
			var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
			summaryjson["categoryLayoutMappings"] = mappings;
			if (layoutname && summaryjson.hasOwnProperty("layoutComponents") &&
				summaryjson.layoutComponents.indexOf(layoutname) >= 0) {
				summaryjson.layoutComponents.splice(summaryjson.layoutComponents.indexOf(layoutname), 1);
			}

			fs.writeFileSync(summaryfile, JSON.stringify(summaryjson));
		}
	}

	if (layoutstyle) {
		console.log('Layout style ' + layoutstyle + ' removed from the content layout mapping');
	} else {
		console.log('Content layout ' + layoutname + ' removed from the content layout mapping');
	}
	done(true);
};

/**
 * Private
 * Create content layout
 */
var _createContentLayout = function (contenttypename, contenttype, layoutname, layoutstyle, isServer, done) {

	// console.log('Create Content Layout: creating a new content layout ' + layoutname + ' for type ' + contenttypename);

	// Create the directory
	var componentDir = path.join(componentsSrcDir, layoutname);
	fs.mkdirSync(componentDir);

	// check if the content type contains largetext fields
	var haslargetext = false;
	var hasRefItems = false;
	var hasMultiItems = false;
	for (var i = 0; i < contenttype.fields.length; i++) {
		var field = contenttype.fields[i];
		if (field.datatype === 'largetext') {
			haslargetext = true;
		} else if (field.datatype === 'reference' && field.referenceType && (!field.referenceType.type || field.referenceType.type !== 'DigitalAsset')) {
			hasRefItems = true;
		}
		if (field.settings && field.settings.caas && field.settings.caas.valuecountRange) {
			hasMultiItems = true;
		}
		if (haslargetext && hasRefItems && hasMultiItems) {
			break;
		}
	}

	var layoutzipfile = 'contentlistnoqlayout.zip';
	if (layoutstyle === 'detail') {
		if (hasRefItems) {
			layoutzipfile = 'contentlayout.zip';
		}
	} else if (haslargetext) {
		layoutzipfile = 'contentlistlayout.zip';
	}

	console.log(' - layoutstyle = ' + layoutstyle + ' haslargetext = ' + haslargetext + ' hasRefItems = ' + hasRefItems + ' hasMultiItems = ' + hasMultiItems + ' layoutzipfile = ' + layoutzipfile);
	// Unzip the component and update metadata
	decompress(path.join(componentsDataDir, layoutzipfile), componentDir, {
		strip: 1
	}).then(() => {
		// update itemGUID
		serverUtils.updateItemFolderJson(projectDir, 'component', layoutname);

		// update design.css
		var designfile = path.join(componentDir, 'assets', 'design.css'),
			designstr = fs.readFileSync(designfile).toString(),
			newdesignstr = serverUtils.replaceAll(designstr, '_devcs_contenttype_name', contenttypename);
		fs.writeFileSync(designfile, newdesignstr);
		console.log(' - update design.css');

		// update layout.html
		var layoutfile = path.join(componentDir, 'assets', 'layout.html'),
			layoutstr = fs.readFileSync(layoutfile).toString(),
			newlayoutstr = serverUtils.replaceAll(layoutstr, '_devcs_contenttype_name', contenttypename);

		var fieldstr = '';
		for (var i = 0; i < contenttype.fields.length; i++) {
			var field = contenttype.fields[i],
				fieldname = field.name;
			var valuecountRange = field.settings && field.settings.caas && field.settings.caas.valuecountRange ?
				field.settings.caas.valuecountRange : {};

			fieldstr = fieldstr + '<li><h2>' + field.name + '</h2></li>' + os.EOL;

			if (valuecountRange && valuecountRange.min >= 0) {
				fieldstr = fieldstr + '<ul>' + os.EOL;
			}
			if (field.datatype === 'text' || field.datatype === 'largetext') {
				var editor = field.settings && field.settings.caas && field.settings.caas.editor ?
					field.settings.caas.editor.name : '';

				if (valuecountRange && valuecountRange.min >= 0) {
					fieldstr = fieldstr + '{{#' + field.name + '}}' + os.EOL;
					fieldname = '.';
				}

				if (editor && (editor === 'rich-text-editor' || editor === 'markdown-editor')) {
					fieldstr = fieldstr + '<li><p>{{{' + fieldname + '}}}</p></li>' + os.EOL;
				} else {
					fieldstr = fieldstr + '<li><p>{{' + fieldname + '}}</p></li>' + os.EOL;
				}

				if (valuecountRange && valuecountRange.min >= 0) {
					fieldstr = fieldstr + '{{/' + field.name + '}}' + os.EOL;
				}
			} else if (field.datatype === 'reference') {
				fieldstr = fieldstr + '{{#' + field.name + '}}' + os.EOL;

				if (field.referenceType && field.referenceType.type === 'DigitalAsset') {
					fieldstr = fieldstr + '<li><img src="{{url}}"></img></li>' + os.EOL;
				} else {
					// reference to another content
					fieldstr = fieldstr + '{{#contentItem}}' + os.EOL;
					fieldstr = fieldstr + '<li>{{{name}}}</li>' + os.EOL;
					fieldstr = fieldstr + '{{/contentItem}}' + os.EOL;
				}

				fieldstr = fieldstr + '{{/' + field.name + '}}' + os.EOL;

			} else if (field.datatype === 'datetime') {
				fieldstr = fieldstr + os.EOL + '<li><p>{{' + field.name + '.formated}}</p></li>' + os.EOL;
			} else {
				// default
				fieldstr = fieldstr + os.EOL + '<li><p>{{' + field.name + '}}</p></li>' + os.EOL;
			}

			if (valuecountRange && valuecountRange.min >= 0) {
				fieldstr = fieldstr + '</ul>' + os.EOL;
			}

			fieldstr = fieldstr + os.EOL;
		}
		fieldstr = fieldstr + '{{#scsData.detailPageLink}}' + os.EOL +
			'<li><a href="{{scsData.detailPageLink}}" title="Go to detail page"><span class="detail- page">Details</span></a></li>' + os.EOL +
			'{{/scsData.detailPageLink}}';
		newlayoutstr = newlayoutstr.replace('_devcs_contenttype_fields', fieldstr);
		fs.writeFileSync(layoutfile, newlayoutstr);
		console.log(' - update layout.html');

		// update render.js
		var renderfile = path.join(componentDir, 'assets', 'render.js'),
			renderstr = fs.readFileSync(renderfile).toString(),
			newrenderstr = '';

		var ident = (layoutstyle === 'detail' || !haslargetext) ? '			' : '					',
			ident2 = ident + '	',
			ident3 = ident2 + '	',
			ident4 = ident3 + '	',
			ident5 = ident4 + '	',
			tmpstr = ident + '// Support both v1.0 and v1.1 Content REST API response formats.' + os.EOL +
			ident + "// User-defined fields are passed through the 'data' property in v1.0 and 'fields' property in v1.1." + os.EOL +
			ident + 'var data = !contentClient.getInfo().contentVersion || contentClient.getInfo().contentVersion === "v1" ? content.data : content.fields;' + os.EOL,
			refstr = '';

		tmpstr = tmpstr + os.EOL + ident + "// Massage the data so that the 'fields' property is always there." + os.EOL +
			ident + "// The corresponding layout.html template only checks for the ‘fields’ property. " + os.EOL +
			ident + 'if (!contentClient.getInfo().contentVersion || contentClient.getInfo().contentVersion === "v1") {' + os.EOL +
			ident2 + 'content["fields"] = content.data;' + os.EOL +
			ident + '}' + os.EOL;

		tmpstr = tmpstr + os.EOL + ident + '//' + os.EOL +
			ident + '// Handle fields specific to this content type.' + os.EOL +
			ident + '//' + os.EOL;

		if (hasMultiItems) {
			tmpstr = tmpstr + os.EOL + ident + 'var moreItems;' + os.EOL;
		}

		if (layoutstyle === 'detail') {
			tmpstr = tmpstr + os.EOL + ident + 'var referedIds = [];' + os.EOL;
		}

		for (var i = 0; i < contenttype.fields.length; i++) {
			var field = contenttype.fields[i],
				fieldname = field.name;
			var valuecountRange = field.settings && field.settings.caas && field.settings.caas.valuecountRange ?
				field.settings.caas.valuecountRange : {};

			if (field.datatype === 'reference') {

				if (field.referenceType && field.referenceType.type === 'DigitalAsset') {
					tmpstr = tmpstr + os.EOL + ident;
					if (valuecountRange && valuecountRange.min >= 0) {
						tmpstr = tmpstr + os.EOL + ident;

						tmpstr = tmpstr + 'moreItems = data["' + field.name + '"] || [];' + os.EOL + ident;
						tmpstr = tmpstr + 'moreItems.forEach(function (nxtItem) {';
						tmpstr = tmpstr + os.EOL + ident2;
						tmpstr = tmpstr +
							'nxtItem["url"] = contentClient.getRenditionURL({"id": nxtItem.id});';
						tmpstr = tmpstr + os.EOL + ident + '});' + os.EOL + ident;

					} else {
						tmpstr = tmpstr + 'if (data["' + field.name + '"]) {' + os.EOL + ident +
							'	data["' + field.name + '"]["url"] = contentClient.getRenditionURL({"id": data["' + field.name +
							'"].id});';
						tmpstr = tmpstr + os.EOL + ident + '}';
					}
					tmpstr = tmpstr + os.EOL;

				} else if (layoutstyle === 'detail') {
					tmpstr = tmpstr + os.EOL + ident;
					// reference to another content
					if (valuecountRange && valuecountRange.min >= 0) {
						tmpstr = tmpstr + 'moreItems = data["' + field.name + '"] || [];' + os.EOL + ident;
						tmpstr = tmpstr + 'moreItems.forEach(function (nxtItem) {';
						tmpstr = tmpstr + os.EOL + ident2;
						tmpstr = tmpstr + '// Get the IDs of any referenced assets, we will do an additional query to retrieve these so we can render them as well.';
						tmpstr = tmpstr + os.EOL + ident2;
						tmpstr = tmpstr + '// If you don’t want to render referenced assets, remove these block.';
						tmpstr = tmpstr + os.EOL + ident2;
						tmpstr = tmpstr + 'referedIds[referedIds.length] = nxtItem.id;';
						tmpstr = tmpstr + os.EOL + ident + '});';

						refstr = refstr + os.EOL + ident3 +
							'moreItems = data["' + field.name + '"] || [];' + os.EOL + ident3 +
							'// Retrieve the reference item from the query result.' + os.EOL + ident3 +
							'moreItems.forEach(function (nxtItem) {' + os.EOL + ident4 +
							'if (nxtItem.id === item.id) {' + os.EOL +
							ident5 + 'nxtItem["contentItem"] = item;' + os.EOL +
							ident4 + '}' + os.EOL + ident3 + '});';
					} else {
						tmpstr = tmpstr + '// Get the IDs of any referenced assets, we will do an additional query to retrieve these so we can render them as well.' + os.EOL + ident;
						tmpstr = tmpstr + '// If you don’t want to render referenced assets, remove these block.' + os.EOL + ident;
						tmpstr = tmpstr + 'if (data["' + field.name + '"]) {' + os.EOL + ident2;
						tmpstr = tmpstr + 'referedIds[referedIds.length] = data["' + field.name + '"].id;' + os.EOL + ident;
						tmpstr = tmpstr + '}';
						refstr = refstr + os.EOL + ident3 +
							'// Retrieve the reference item from the query result.' +
							os.EOL + ident3 +
							'if (data["' + field.name + '"] && data["' + field.name + '"].id === item.id) {' + os.EOL +
							ident4 + 'data["' + field.name + '"]["contentItem"] = item;' + os.EOL +
							ident3 + '}';
					}
					tmpstr = tmpstr + os.EOL;
					refstr = refstr + os.EOL;
				}

			} else if (field.datatype === 'datetime') {
				tmpstr = tmpstr + os.EOL + ident;
				tmpstr = tmpstr + 'if (data["' + field.name + '"]) {' + os.EOL + ident;
				tmpstr = tmpstr + '	data["' + field.name + '"]["formated"] = dateToMDY(data["' + field.name + '"].value);';
				tmpstr = tmpstr + os.EOL + ident + '}';
			}
			if (field.datatype === 'largetext') {
				var editor = field.settings && field.settings.caas && field.settings.caas.editor ?
					field.settings.caas.editor.name : '';
				if (editor && editor === 'rich-text-editor') {
					tmpstr = tmpstr + os.EOL + ident;
					tmpstr = tmpstr + 'data["' + field.name + '"] = contentClient.expandMacros(data["' + field.name + '"]);';
					tmpstr = tmpstr + os.EOL;
				} else if (editor && editor === 'markdown-editor') {
					tmpstr = tmpstr + os.EOL + ident;
					tmpstr = tmpstr + 'data["' + field.name + '"] = parseMarkdown(contentClient.expandMacros(data["' + field.name + '"]));';
					tmpstr = tmpstr + os.EOL;
				}
			}
		}
		newrenderstr = renderstr.replace('//_devcs_contentlayout_code', tmpstr);
		newrenderstr = newrenderstr.replace('//_devcs_contentlayout_reference_code', refstr);
		fs.writeFileSync(renderfile, newrenderstr);
		console.log(' - update render.js');

		console.log(`Created content layout ${layoutname} at ${componentDir}`);
		console.log(`To rename the content layout, rename the directory ${componentDir}`);
		if (!isServer) {
			console.log('To use this content layout, run add-contentlayout-mapping');
		}
		done(true);
	});
};