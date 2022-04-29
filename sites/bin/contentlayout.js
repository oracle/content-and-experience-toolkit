/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Content Layout library
 */

var fs = require('fs'),
	os = require('os'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	extract = require('extract-zip'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var cecDir = path.join(__dirname, ".."),
	componentsDataDir = path.join(cecDir, 'data', 'components');

var projectDir,
	componentsSrcDir,
	serversSrcDir,
	contentSrcDir,
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
	contentSrcDir = path.join(srcfolder, 'content');

	return true;
};

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
	console.info(' - server: ' + server.url);

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		var typesPromise = serverRest.getContentTypes({
			server: server
		});
		typesPromise.then(function (result) {
			var types = result || [];
			var typeFound = false;
			if (types && types.length > 0) {
				var byName = types.slice(0);
				byName.sort(function (a, b) {
					var x = a.name;
					var y = b.name;
					return (x < y ? -1 : x > y ? 1 : 0);
				});
				types = byName;
				var format = '   %-40s  %-20s';
				var labelShown = false;
				var count = 0;
				for (var i = 0; i < types.length; i++) {
					if (types[i].name !== 'DigitalAsset') {
						if (!labelShown) {
							console.log(sprintf(format, 'Name', 'Type Category'));
							labelShown = true;
						}
						console.log(sprintf(format, types[i].name, types[i].typeCategory));
						typeFound = true;
						count += 1;
					}
				}
				if (count > 0) {
					console.log('Total: ' + count);
				}
			}
			if (!typeFound) {
				console.log(' - no content type on the server');
			}

			done(true);
		});
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

		console.info(' - server: ' + server.url);
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

	var addcustomsettings = typeof argv.addcustomsettings === 'string' && argv.addcustomsettings.toLowerCase() === 'true';
console.log(useserver);
	if (useserver) {

		// verify the content type
		var typesPromise = serverRest.getContentTypes({
			server: server
		});
		typesPromise.then(function (result) {
			var types = result || [];
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

			var typefields = contenttype.fields;

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
			_createContentLayout(contenttypename, contenttype, layoutname, layoutstyle, true, addcustomsettings, done);

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

		_createContentLayout(contenttypename, contenttype, layoutname, layoutstyle, false, addcustomsettings, done);
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

	var summaryfile = path.join(templatesSrcDir, templatename, 'assets', 'contenttemplate', 'summary.json'),
		summaryjson = {},
		mappings = [],
		foundtype = false;
	if (fs.existsSync(summaryfile)) {
		summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		mappings = summaryjson["categoryLayoutMappings"] || summaryjson['contentTypeMappings'] || [];
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
	if (summaryjson.hasOwnProperty('contentTypeMappings')) {
		summaryjson['contentTypeMappings'] = mappings;
	} else {
		summaryjson['categoryLayoutMappings'] = mappings;
	}
	if (summaryjson.hasOwnProperty("layoutComponents") && summaryjson.layoutComponents.indexOf(layoutname) < 0) {
		summaryjson.layoutComponents[summaryjson.layoutComponents.length] = layoutname;
	} else {
		summaryjson["layoutComponents"] = [layoutname];
	}
	fs.writeFileSync(summaryfile, JSON.stringify(summaryjson));

	// also update caas_contenttypemap.json
	var mappingfile = path.join(templatesSrcDir, templatename, 'caas_contenttypemap.json');
	fs.writeFileSync(mappingfile, JSON.stringify(mappings));

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

	if (mobile && layoutstyle) {
		layoutstyle = layoutstyle + '|mobile';
	}
	var summaryfile = path.join(templatesSrcDir, templatename, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		var mappings = summaryjson["categoryLayoutMappings"] || summaryjson['contentTypeMappings'];

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

		if (summaryjson.hasOwnProperty('contentTypeMappings')) {
			summaryjson['contentTypeMappings'] = mappings;
		} else {
			summaryjson['categoryLayoutMappings'] = mappings;
		}
		if (layoutname && summaryjson.hasOwnProperty("layoutComponents") &&
			summaryjson.layoutComponents.indexOf(layoutname) >= 0) {
			summaryjson.layoutComponents.splice(summaryjson.layoutComponents.indexOf(layoutname), 1);
		}
		fs.writeFileSync(summaryfile, JSON.stringify(summaryjson));

		// also update caas_contenttypemap.json
		var mappingfile = path.join(templatesSrcDir, templatename, 'caas_contenttypemap.json');
		fs.writeFileSync(mappingfile, JSON.stringify(mappings));
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
var _createContentLayout = function (contenttypename, contenttype, layoutname, layoutstyle, isServer, addcustomsettings, done) {

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

	// base contentlayout files
	layoutzipfile = 'contentlayout.zip';

	console.info(' - layoutstyle = ' + layoutstyle + ' haslargetext = ' + haslargetext + ' hasRefItems = ' + hasRefItems + ' hasMultiItems = ' + hasMultiItems + ' layoutzipfile = ' + layoutzipfile);

	// Unzip the component and update metadata
	fileUtils.extractZip(path.join(componentsDataDir, layoutzipfile), componentDir)
		.then(function (err) {

			// if an error occured, report it
			if (err) {
				reject(err);
			}

			// remove the extra directory caused by unzip
			serverUtils.stripTopDirectory(componentDir).then(() => {

				// update itemGUID
				serverUtils.updateItemFolderJson(projectDir, 'component', layoutname);

				// update design.css
				var designfile = path.join(componentDir, 'assets', 'design.css'),
					designstr = fs.readFileSync(designfile).toString(),
					newdesignstr = serverUtils.replaceAll(designstr, '_devcs_contenttype_name', contenttypename);
				fs.writeFileSync(designfile, newdesignstr);
				console.info(' - update design.css');

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

						if (layoutstyle === 'detail') {
							var isDigitalAssetRef = (field.referenceType && (field.referenceType.typeCategory === 'DigitalAssetType' || field.referenceType.type === 'DigitalAsset'));
							if (isDigitalAssetRef) {
								// reference a digital asset
								fieldstr = fieldstr + '{{#contentItem}}' + os.EOL;
								fieldstr = fieldstr + '{{#renderAsImage}}' + os.EOL;
								fieldstr = fieldstr + '<li><img src="{{url}}"></img></li>' + os.EOL;
								fieldstr = fieldstr + '{{/renderAsImage}}' + os.EOL;
								fieldstr = fieldstr + '{{#renderAsVideo}}' + os.EOL;
								fieldstr = fieldstr + '<li><video src="{{url}}" playsinline width="100%" controls controlslist="nodownload"></video></li>' + os.EOL;
								fieldstr = fieldstr + '{{/renderAsVideo}}' + os.EOL;
								fieldstr = fieldstr + '{{#renderAsDownload}}' + os.EOL;
								fieldstr = fieldstr + '<li><a _target_="_blank" download href="{{url}}">{{{name}}}</a></li>' + os.EOL;
								fieldstr = fieldstr + '{{/renderAsDownload}}' + os.EOL;
								fieldstr = fieldstr + '{{/contentItem}}' + os.EOL;
							} else {
								// reference to another content
								fieldstr = fieldstr + '{{#contentItem}}' + os.EOL;
								fieldstr = fieldstr + '<li>{{{name}}}</li>' + os.EOL;
								fieldstr = fieldstr + '{{/contentItem}}' + os.EOL;
							}
						} else {
							if (field.referenceType && (field.referenceType.typeCategory === 'DigitalAssetType' || field.referenceType.type === 'DigitalAsset')) {
								fieldstr = fieldstr + '<li><img src="{{url}}"></img></li>' + os.EOL;
							}
						}

						fieldstr = fieldstr + '{{/' + field.name + '}}' + os.EOL;

					} else if (field.datatype === 'datetime') {
						fieldstr = fieldstr + os.EOL + '<li><p>{{' + field.name + '.formatted}}</p></li>' + os.EOL;
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
				console.info(' - update layout.html');

				// update render.mjs
				var renderfile = path.join(componentDir, 'assets', 'render.mjs'),
					renderstr = fs.readFileSync(renderfile).toString();

				var fieldNames = ['referedFields', 'digitalAssetFields', 'markDownFields', 'richTextFields', 'dateTimeFields'];
				var fieldTypes = {};

				// seed each of the field values
				fieldNames.forEach(function (fieldName) {
					fieldTypes[fieldName] = [];
				});

				// populate the fields by type
				contenttype.fields.forEach(function (field) {
					if (field.datatype === 'reference') {
						if (layoutstyle === 'detail') {
							// digital assets will be treated as referenced items
							fieldTypes.referedFields.push(field.name);
						} else if (field.referenceType && (field.referenceType.typeCategory === 'DigitalAssetType' || field.referenceType.type === 'DigitalAsset')) {
							// digital assets are assumed to be images and URLs generated
							fieldTypes.digitalAssetFields.push(field.name);
						}
					} else if (field.datatype === 'datetime') {
						fieldTypes.dateTimeFields.push(field.name);
					} else if (field.datatype === 'largetext') {
						var editorName = field.settings && field.settings.caas && field.settings.caas.editor ? field.settings.caas.editor.name : '';

						if (editorName === 'rich-text-editor') {
							fieldTypes.richTextFields.push(field.name);
						}

						if (editorName === 'markdown-editor') {
							fieldTypes.markDownFields.push(field.name);
						}
					}
				});

				// insert the field array into each of the entries in the template
				fieldNames.forEach(function (fieldName) {
					var fields = fieldTypes[fieldName];
					renderstr = renderstr.replace('"_' + fieldName + '_"', fields.length > 0 ? '"' + fields.join('", "') + '"' : '');
				});

				// replace the permission string - this is translated in the builder case
				renderstr = renderstr.replace('_noPermissionToView_', 'You do not have permission to view this asset');

				fs.writeFileSync(renderfile, renderstr);
				console.info(' - update render.mjs');

				if (addcustomsettings) {
					// update appinfo.json
					var appinfoFilePath = path.join(componentDir, 'appinfo.json');
					if (fs.existsSync(appinfoFilePath)) {
						var appinfoJson = JSON.parse(fs.readFileSync(appinfoFilePath));
						if (appinfoJson) {
							appinfoJson.settingsData = {
								settingsHeight: 500,
								settingsRenderOption: 'panel'
							};

							fs.writeFileSync(appinfoFilePath, JSON.stringify(appinfoJson, null, 4));
						}
					}
					// add default settings.html
					var settingsFile = 'settings.html';
					fs.copyFileSync(path.join(componentsDataDir, settingsFile), path.join(componentDir, 'assets', settingsFile));
					console.info(' - add custom settings');
				}

				console.log(`Created content layout ${layoutname} at ${componentDir}`);
				console.log(`To rename the content layout, rename the directory ${componentDir}`);
				if (!isServer) {
					console.log('To use this content layout, run add-contentlayout-mapping');
				}
				done(true);
			});
		});
};

/**
 * Add field editor to a template
 */
module.exports.addFieldEditor = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;
	var templateName = argv.template;
	var typeName = argv.contenttype;
	var fieldName = argv.field;
	var contenttemplate = typeof argv.contenttemplate === 'string' && argv.contenttemplate.toLowerCase() === 'true';

	// verify field editor
	var filePath = path.join(componentsSrcDir, name, 'appinfo.json');
	if (!fs.existsSync(filePath)) {
		console.error('ERROR: field editor ' + name + ' does not exist');
		done();
		return;
	}
	try {
		var appInfoJson = JSON.parse(fs.readFileSync(filePath));
		if (!appInfoJson || !appInfoJson.type || appInfoJson.type !== 'fieldeditor') {
			console.error('ERROR: ' + name + ' is not a field editor');
			done();
			return;
		}
		console.info(' - verify field editor ' + name);
	} catch (e) {
		console.error(e);
		done();
		return;
	}

	var templatePath = contenttemplate ? path.join(contentSrcDir, templateName) : path.join(templatesSrcDir, templateName);
	if (!fs.existsSync(templatePath)) {
		console.error('ERROR: ' + (contenttemplate ? 'content ' : '') + 'template ' + templateName + ' does not exist');
		done();
		return;
	}

	var templateContentPath = contenttemplate ? path.join(templatePath, 'contentexport') :
		path.join(templatePath, 'assets', 'contenttemplate', 'Content Template of ' + templateName);
	if (!fs.existsSync(templateContentPath)) {
		console.error('ERROR: template ' + templateName + ' does not have content');
		done();
		return;
	}
	console.info(' - get template');

	var typePath = path.join(templateContentPath, 'ContentTypes', typeName + '.json');
	if (!fs.existsSync(typePath)) {
		console.error('ERROR: type ' + typeName + ' does not exist');
		done();
		return;
	}
	var typeJson;
	try {
		typeJson = JSON.parse(fs.readFileSync(typePath));
	} catch (e) {
		console.error(e);
		done();
		return;
	}
	if (!typeJson || !typeJson.id || !typeJson.name) {
		console.error('ERROR: type ' + typeName + ' is not valid');
		done();
		return;
	}
	console.info(' - get content type');

	var fields = typeJson.fields || [];
	var field;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name === fieldName) {
			field = fields[i];
			break;
		}
	}
	if (!field) {
		console.error('ERROR: field ' + fieldName + ' is not found in type ' + typeName);
		done();
		return;
	}
	console.info(' - get field');
	var editor = {
		name: 'custom-editor',
		options: {
			name: name
		},
		isCustom: true
	};
	if (field.settings && field.settings.caas) {
		field.settings.caas.editor = editor;
	} else if (field.settings) {
		field.settings.caas = {
			editor: editor
		};
	} else {
		field.settings = {
			caas: {
				editor: editor
			}
		};
	}
	// console.log(JSON.stringify(field));
	if (typeJson.properties && typeJson.properties.customEditors) {
		var customEditors = typeJson.properties.customEditors || [];
		if (!customEditors.includes(name)) {
			customEditors.push(name);
		}
	} else if (typeJson.properties) {
		typeJson.properties.customEditors = [name];
	} else {
		typeJson.properties = {
			customEditors: [name]
		};
	}

	fs.writeFileSync(typePath, JSON.stringify(typeJson, null, 4));
	console.log(' - field editor ' + name + ' added to field ' + fieldName);

	if (contenttemplate) {
		done(true);
		return;
	}

	// add to summary.json
	var summaryPath = path.join(templatePath, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryPath)) {
		var summaryjson;
		try {
			summaryjson = JSON.parse(fs.readFileSync(summaryPath));
		} catch (e) {
			console.error(e);
		}
		if (!summaryjson) {
			done();
			return;
		}
		var mappings = summaryjson["categoryLayoutMappings"] || summaryjson['contentTypeMappings'] || [];
		var foundType = false;
		for (var i = 0; i < mappings.length; i++) {
			if (mappings[i].type === typeName) {
				foundType = true;
				var editors = mappings[i].editorList || [];
				var foundEditor = false;
				for (var j = 0; j < editors.length; j++) {
					if (editors[j].editorName === name) {
						foundEditor = true;
						break;
					}
				}
				if (!foundEditor) {
					editors.push({
						editorName: name
					});
					mappings[i].editorList = editors;
				}
			}
		}
		if (!foundType) {
			mappings.push({
				type: typeName,
				editorList: [{
					editorName: name
				}]
			});
		}
		if (summaryjson.hasOwnProperty('contentTypeMappings')) {
			summaryjson['contentTypeMappings'] = mappings;
		} else {
			summaryjson['categoryLayoutMappings'] = mappings;
		}
		var editorComponents = summaryjson.editorComponents || [];
		if (!editorComponents.includes(name)) {
			editorComponents.push(name);
			summaryjson.editorComponents = editorComponents;
		}
		fs.writeFileSync(summaryPath, JSON.stringify(summaryjson, null, 4));
		console.log(' - field editor ' + name + ' added to type ' + typeName + ' in file ' + summaryPath);

		done(true);
	} else {
		console.error('ERROR: template ' + templateName + ' does not have summary.json');
		done();
	}

};

/**
 * Remove field editor from a content type field in a template
 */
module.exports.removeFieldEditor = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;
	var templateName = argv.template;
	var typeName = argv.contenttype;
	var fieldName = argv.field;
	var contenttemplate = typeof argv.contenttemplate === 'string' && argv.contenttemplate.toLowerCase() === 'true';

	// verify field editor
	var filePath = path.join(componentsSrcDir, name, 'appinfo.json');
	if (!fs.existsSync(filePath)) {
		console.error('ERROR: field editor ' + name + ' does not exist');
		done();
		return;
	}
	try {
		var appInfoJson = JSON.parse(fs.readFileSync(filePath));
		if (!appInfoJson || !appInfoJson.type || appInfoJson.type !== 'fieldeditor') {
			console.error('ERROR: ' + name + ' is not a field editor');
			done();
			return;
		}
		console.info(' - verify field editor ' + name);
	} catch (e) {
		console.error(e);
		done();
		return;
	}

	var templatePath = contenttemplate ? path.join(contentSrcDir, templateName) : path.join(templatesSrcDir, templateName);
	if (!fs.existsSync(templatePath)) {
		console.error('ERROR: ' + (contenttemplate ? 'content ' : '') + 'template ' + templateName + ' does not exist');
		done();
		return;
	}

	var templateContentPath = contenttemplate ? path.join(templatePath, 'contentexport') :
		path.join(templatePath, 'assets', 'contenttemplate', 'Content Template of ' + templateName);
	if (!fs.existsSync(templateContentPath)) {
		console.error('ERROR: template ' + templateName + ' does not have content');
		done();
		return;
	}
	console.info(' - get template');

	var typePath = path.join(templateContentPath, 'ContentTypes', typeName + '.json');
	if (!fs.existsSync(typePath)) {
		console.error('ERROR: type ' + typeName + ' does not exist');
		done();
		return;
	}
	var typeJson;
	try {
		typeJson = JSON.parse(fs.readFileSync(typePath));
	} catch (e) {
		console.error(e);
		done();
		return;
	}
	if (!typeJson || !typeJson.id || !typeJson.name) {
		console.error('ERROR: type ' + typeName + ' is not valid');
		done();
		return;
	}
	console.info(' - get content type');

	var fields = typeJson.fields || [];
	var field;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name === fieldName) {
			field = fields[i];
			break;
		}
	}
	if (!field) {
		console.error('ERROR: field ' + fieldName + ' is not found in type ' + typeName);
		done();
		return;
	}
	console.info(' - get field');
	var editor = field.settings && field.settings.caas && field.settings.caas.editor;
	if (editor && editor.isCustom && editor.options && editor.options.name === name) {
		field.settings.caas.editor = {};
	}

	// check if the editor used by other fields
	var editorUsed = false;
	for (var i = 0; i < fields.length; i++) {
		if (fields[i].name !== fieldName) {
			var field2 = fields[i];
			var editor2 = field2.settings && field2.settings.caas && field2.settings.caas.editor;
			if (editor2 && editor2.isCustom && editor2.options && editor2.options.name === name) {
				editorUsed = true;
				break;
			}
		}
	}

	if (!editorUsed) {
		var customEditors = typeJson.properties && typeJson.properties.customEditors;
		if (customEditors && customEditors.includes(name)) {
			var newCustomEditors = [];
			for (var i = 0; i < customEditors.length; i++) {
				if (customEditors[i] !== name) {
					newCustomEditors.push(name);
				}
			}
			typeJson.properties.customEditors = newCustomEditors;
		}
	}

	fs.writeFileSync(typePath, JSON.stringify(typeJson, null, 4));
	console.log(' - field editor ' + name + ' removed from field ' + fieldName);

	if (contenttemplate) {
		done(true);
		return;
	}

	// remove from summary.json
	var summaryPath = path.join(templatePath, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryPath)) {
		var summaryjson;
		try {
			summaryjson = JSON.parse(fs.readFileSync(summaryPath));
		} catch (e) {
			console.error(e);
		}
		if (!summaryjson) {
			done();
			return;
		}
		var mappings = summaryjson["categoryLayoutMappings"] || summaryjson['contentTypeMappings'] || [];
		if (!editorUsed) {
			// remove editor for this type in mappings
			for (var i = 0; i < mappings.length; i++) {
				if (mappings[i].type === typeName) {
					var editors = mappings[i].editorList || [];
					var newEditorList = [];
					for (var j = 0; j < editors.length; j++) {
						if (editors[j].editorName !== name) {
							newEditorList.push(editors[j]);
						}
					}
					mappings[i].editorList = newEditorList;
				}
			}
		}
		if (summaryjson.hasOwnProperty('contentTypeMappings')) {
			summaryjson['contentTypeMappings'] = mappings;
		} else {
			summaryjson['categoryLayoutMappings'] = mappings;
		}

		var editorUsedAll = false;
		for (var i = 0; i < mappings.length; i++) {
			var editors = mappings[i].editorList || [];
			for (var j = 0; j < editors.length; j++) {
				if (editors[j].editorName === name) {
					editorUsedAll = true;
					break;
				}
			}
		}
		if (!editorUsedAll) {
			var editorComponents = summaryjson.editorComponents || [];
			var newEditorComponents = [];
			for (var i = 0; i < editorComponents.length; i++) {
				if (editorComponents[i] !== name) {
					newEditorComponents.push(editorComponents[i]);
				}
			}
			summaryjson.editorComponents = newEditorComponents;
		}
		fs.writeFileSync(summaryPath, JSON.stringify(summaryjson, null, 4));
		console.info(' - field editor ' + name + ' removed from type ' + typeName + ' in file ' + summaryPath);

		done(true);
	} else {
		console.error('ERROR: template ' + templateName + ' does not have summary.json');
		done();
	}

};

/**
 * Associate content form with a content type in a template
 */
module.exports.addContentForm = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.objectname;
	var templateName = argv.template;
	var typeName = argv.contenttype;
	var contenttemplate = typeof argv.contenttemplate === 'string' && argv.contenttemplate.toLowerCase() === 'true';

	// verify content form
	var filePath = path.join(componentsSrcDir, name, 'appinfo.json');
	if (!fs.existsSync(filePath)) {
		console.error('ERROR: content form ' + name + ' does not exist');
		done();
		return;
	}
	var appInfoJson;
	try {
		appInfoJson = JSON.parse(fs.readFileSync(filePath));
		if (!appInfoJson || !appInfoJson.type || appInfoJson.type !== 'contentform') {
			console.error('ERROR: ' + name + ' is not a content form');
			done();
			return;
		}
		console.info(' - verify content form ' + name);
	} catch (e) {
		console.error(e);
		done();
		return;
	}

	var templatePath = contenttemplate ? path.join(contentSrcDir, templateName) : path.join(templatesSrcDir, templateName);
	if (!fs.existsSync(templatePath)) {
		console.error('ERROR: ' + (contenttemplate ? 'content ' : '') + 'template ' + templateName + ' does not exist');
		done();
		return;
	}

	var templateContentPath = contenttemplate ? path.join(templatePath, 'contentexport') :
		path.join(templatePath, 'assets', 'contenttemplate', 'Content Template of ' + templateName);
	if (!fs.existsSync(templateContentPath)) {
		console.error('ERROR: template ' + templateName + ' does not have content');
		done();
		return;
	}
	console.info(' - get template');

	var typePath = path.join(templateContentPath, 'ContentTypes', typeName + '.json');
	if (!fs.existsSync(typePath)) {
		console.error('ERROR: type ' + typeName + ' does not exist');
		done();
		return;
	}
	var typeJson;
	try {
		typeJson = JSON.parse(fs.readFileSync(typePath));
	} catch (e) {
		console.error(e);
		done();
		return;
	}
	if (!typeJson || !typeJson.id || !typeJson.name) {
		console.error('ERROR: type ' + typeName + ' is not valid');
		done();
		return;
	}
	console.info(' - get content type');

	if (typeJson.properties) {
		typeJson.properties.customForms = [name];
	} else {
		typeJson.properties = {
			customForms: [name]
		};
	}

	fs.writeFileSync(typePath, JSON.stringify(typeJson, null, 4));
	console.log(' - custom form ' + name + ' added to type ' + typeName);

	if (contenttemplate) {
		done(true);
		return;
	}

	// May extra update for site template
	done(true);

};

/**
 * Associate content form with a content type on OCM server
 */
module.exports.addContentFormServer = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var contentFormName = argv.objectname;
	var contentTypeName = argv.contenttype;

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var typeObj;

		serverRest.getContentType({
			server: server,
			name: contentTypeName
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify type');
				typeObj = result;

				return sitesRest.getComponent({
					server: server,
					name: contentFormName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify component');

				if (typeObj.properties) {
					typeObj.properties.customForms = [contentFormName];
				} else {
					typeObj.properties = {
						customForms: [customForms]
					};
				}

				return serverRest.updateContentType({
					server: server,
					type: typeObj
				});

			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.log(' - custom form ' + contentFormName + ' added to type ' + contentTypeName);

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

/**
 * Remove content form from a content type in a template
 */
module.exports.removeContentForm = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.objectname;
	var templateName = argv.template;
	var typeName = argv.contenttype;
	var contenttemplate = typeof argv.contenttemplate === 'string' && argv.contenttemplate.toLowerCase() === 'true';

	// verify content form
	var filePath = path.join(componentsSrcDir, name, 'appinfo.json');
	if (!fs.existsSync(filePath)) {
		console.error('ERROR: content form ' + name + ' does not exist');
		done();
		return;
	}
	var appInfoJson;
	try {
		appInfoJson = JSON.parse(fs.readFileSync(filePath));
		if (!appInfoJson || !appInfoJson.type || appInfoJson.type !== 'contentform') {
			console.error('ERROR: ' + name + ' is not a content form');
			done();
			return;
		}
		console.info(' - verify content form ' + name);
	} catch (e) {
		console.error(e);
		done();
		return;
	}

	var templatePath = contenttemplate ? path.join(contentSrcDir, templateName) : path.join(templatesSrcDir, templateName);
	if (!fs.existsSync(templatePath)) {
		console.error('ERROR: ' + (contenttemplate ? 'content ' : '') + 'template ' + templateName + ' does not exist');
		done();
		return;
	}

	var templateContentPath = contenttemplate ? path.join(templatePath, 'contentexport') :
		path.join(templatePath, 'assets', 'contenttemplate', 'Content Template of ' + templateName);
	if (!fs.existsSync(templateContentPath)) {
		console.error('ERROR: template ' + templateName + ' does not have content');
		done();
		return;
	}
	console.info(' - get template');

	var typePath = path.join(templateContentPath, 'ContentTypes', typeName + '.json');
	if (!fs.existsSync(typePath)) {
		console.error('ERROR: type ' + typeName + ' does not exist');
		done();
		return;
	}
	var typeJson;
	try {
		typeJson = JSON.parse(fs.readFileSync(typePath));
	} catch (e) {
		console.error(e);
		done();
		return;
	}
	if (!typeJson || !typeJson.id || !typeJson.name) {
		console.error('ERROR: type ' + typeName + ' is not valid');
		done();
		return;
	}
	console.info(' - get content type');

	if (typeJson.properties && typeJson.properties.customForms && typeJson.properties.customForms.includes(name)) {

		typeJson.properties.customForms.splice(typeJson.properties.customForms.indexOf(name), 1);
		fs.writeFileSync(typePath, JSON.stringify(typeJson, null, 4));
		console.log(' - custom form ' + name + ' removed from type ' + typeName);

	} else {
		console.log(' - custom form ' + name + ' is not used by type ' + typeName);
	}

	if (contenttemplate) {
		done(true);
		return;
	}

	// May extra update for site template
	done(true);

};

/**
 * Remove content form from a content type on OCM server
 */
module.exports.removeContentFormServer = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var contentFormName = argv.objectname;
	var contentTypeName = argv.contenttype;

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var typeObj;

		serverRest.getContentType({
			server: server,
			name: contentTypeName
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify type');
				typeObj = result;

				return sitesRest.getComponent({
					server: server,
					name: contentFormName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify component');

				var customForms = typeObj.properties && typeObj.properties.customForms || [];
				var updateTypePromises = [];
				if (customForms.includes(contentFormName)) {
					typeObj.properties.customForms = [];
					updateTypePromises.push(serverRest.updateContentType({
						server: server,
						type: typeObj
					}));
				} else {
					console.log(' - content form ' + contentFormName + ' is not used by ' + contentTypeName);
				}

				return Promise.all(updateTypePromises);

			})
			.then(function (results) {
				if (results.length > 0) {
					if (results[0].err) {
						return Promise.reject();
					}

					console.log(' - custom form ' + contentFormName + ' removed type ' + contentTypeName);
					done(true);

				} else {
					done(true);
				}
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};


/**
 * Add content layout mapping to a type on OCM server
 */
module.exports.addContentLayoutMappingServer = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var contentType = argv.contenttype,
		contentLayoutName = argv.contentlayout,
		layoutStyle = argv.layoutstyle || 'Default',
		mobile = argv.mobile || false;

	if (typeof argv.mobile === 'string') {
		mobile = argv.mobile.toLowerCase() === 'true';
	}

	var format = mobile ? 'mobile' : 'desktop';

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: contentType
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify type');

				return sitesRest.getComponent({
					server: server,
					name: contentLayoutName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify component');

				return serverRest.addContentTypeLayoutMapping({
					server: server,
					typeName: contentType,
					contentLayout: contentLayoutName,
					style: layoutStyle,
					format: format
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				return serverRest.getContentType({
					server: server,
					name: contentType,
					expand: 'layoutMapping'
				});
			})
			.then(function (result) {

				console.log(' - content layout mapping ' + layoutStyle + ':' + contentLayoutName + ' added for type ' + contentType);
				if (result.layoutMapping && result.layoutMapping.data) {
					_displayContentLayoutMapping(result.layoutMapping.data);
				}
				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

/**
 * Remove content layout mapping from a type on OCM server
 */
module.exports.removeContentLayoutMappingServer = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var contentType = argv.contenttype,
		contentLayoutName = argv.contentlayout,
		layoutStyle = argv.layoutstyle || 'Default',
		mobile = argv.mobile || false;

	if (typeof argv.mobile === 'string') {
		mobile = argv.mobile.toLowerCase() === 'true';
	}

	var format = mobile ? 'mobile' : 'desktop';

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	serverUtils.loginToServer(server,).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: contentType
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify type');

				return sitesRest.getComponent({
					server: server,
					name: contentLayoutName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.info(' - verify component');

				return serverRest.removeContentTypeLayoutMapping({
					server: server,
					typeName: contentType,
					contentLayout: contentLayoutName,
					style: layoutStyle,
					format: format
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				return serverRest.getContentType({
					server: server,
					name: contentType,
					expand: 'layoutMapping'
				});
			})
			.then(function (result) {

				console.log(' - content layout mapping ' + layoutStyle + ':' + contentLayoutName + ' removed for type ' + contentType);
				if (result.layoutMapping && result.layoutMapping.data) {
					_displayContentLayoutMapping(result.layoutMapping.data);
				}
				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

var _displayContentLayoutMapping = function (mappings) {
	// console.log(mappings);
	console.log('');
	var format = '   %-30s  %-30s  %-s';
	console.log(sprintf(format, 'Layout Styles', 'Desktop Content Layout', 'Mobile Content Layout'));

	var _displayOne = function (style) {
		var desktopLayout = 'Default';
		var mobileLayout = 'Same as Desktop';

		for (var i = 0; i < mappings.length; i++) {
			var mapping = mappings[i];
			if (mapping.label === style) {
				desktopLayout = mapping.formats && mapping.formats.desktop || desktopLayout;
				mobileLayout = mapping.formats && mapping.formats.mobile || mobileLayout;
			}
		}
		console.log(sprintf(format, style, desktopLayout, mobileLayout));
	};

	_displayOne('Default');
	_displayOne('Content List Default');
	_displayOne('Empty Content List Default');
	_displayOne('Content Placeholder Default');

	var ootbStyles = ['Default', 'Default|mobile',
		'Content List Default', 'Content List Default|mobile',
		'Empty Content List Default', 'Empty Content List Default|mobile',
		'Content Placeholder Default', 'Content Placeholder Default|mobile'
	];
	for (var i = 0; i < mappings.length; i++) {
		var style = mappings[i].label;
		if (!ootbStyles.includes(style)) {
			_displayOne(style);
		}
	}
	console.log('');

};