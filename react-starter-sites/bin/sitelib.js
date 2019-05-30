/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Site library
 */
var gulp = require('gulp'),
	serverUtils = require('./serverUtils.js'),
	Mustache = require('mustache'),
	extract = require('extract-zip'),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	dir = require('node-dir'),
	path = require('path'),
	argv = require('yargs').argv;

var projectDir,
	sitesSrcDir,
	buildDir,
	contentBuildDir;

module.exports.createSite = function (argv, done) {
	'use strict';
	// console.log(argv);

	projectDir = argv.projectDir || path.join('./');
	sitesSrcDir = projectDir,
		buildDir = path.join(projectDir, 'build'),
		contentBuildDir = path.join(projectDir, 'build', 'content');

	//
	// name: the site name
	// source: the site template path (currently only one OOTB)
	// contnet: the CEC template zip path
	// server: indicate to use CEC server content types/content
	// types: list of content types on the CEC server
	// navtypes: the types to be used as navigation for the site
	// 
	// console.log(argv);
	var siteName = argv.name,
		template = argv.source,
		runtimeSrc = argv.runtimeSrc,
		contentZipFile = argv.content,
		useserver = argv.server || false,
		typesStr = argv.types,
		navTypesStr = argv.navtypes,
		localesStr = argv.locales;

	if (!siteName || !template) {
		console.error('ERROR: please run as npm run create-site -- --source <source template> --name <new site name> --content <content zip file path>');
		done();
		return;
	}

	// verify the source template
	var tempPath = template;
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join(projectDir, tempPath);
	}
	tempPath = path.resolve(tempPath);

	if (!fs.existsSync(tempPath)) {
		console.error('ERROR: invalid template ' + template);
		done();
		return;
	}

	// verify the new site name
	var re = /^[a-z0-9_-]+$/ig;
	if (siteName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in site names.');
		done();
		return;
	} else {
		if (fs.existsSync(sitesSrcDir + '/' + siteName)) {
			console.error('ERROR: A site with the name ' + siteName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	var localeNames = localesStr ? localesStr.split(',') : [];
	var locales = [];
	for (var i = 0; i < localeNames.length; i++) {
		if (localeNames[i]) {
			var isFirst = locales.length === 0;
			locales.push({
				localeName: localeNames[i],
				localeCompName: localeNames[i].replace('-', ''),
				firstLocale: isFirst
			});
		}
	}
	// console.log(locales);

	var types = [];
	var fields = [];

	// verify the content file
	if (!useserver && contentZipFile) {
		if (!path.isAbsolute(contentZipFile)) {
			contentZipFile = path.join(projectDir, contentZipFile);
		}
		contentZipFile = path.resolve(contentZipFile);
		if (!fs.existsSync(contentZipFile)) {
			console.log('ERROR: file ' + contentZipFile + ' does not exist');
			done();
			return;
		}

		// fresh dir for the content
		if (fs.existsSync(contentBuildDir)) {
			fse.removeSync(contentBuildDir);
		}

		extract(contentZipFile, {
			dir: contentBuildDir
		}, function (err) {
			if (err) {
				console.log(err);
			}

			var contentdir = '';
			// unzip content zip 
			var contentpath = path.join(contentBuildDir, 'template', 'assets', 'contenttemplate');
			var contentexportfile = path.join(contentpath, 'export.zip');
			if (fs.existsSync(contentexportfile)) {
				console.log(' - unzip site template content file');
				extract(contentexportfile, {
					dir: contentpath
				}, function (err) {
					if (err) {
						console.log(err);
					}
					var names = fs.readdirSync(contentpath);
					for (var i = 0; i < names.length; i++) {
						if (names[i].indexOf('Content Template of ') >= 0) {
							contentdir = path.join(contentpath, names[i]);
							break;
						}
					}

					var typespath = path.join(contentdir, 'ContentTypes');
					if (fs.existsSync(typespath)) {
						_createSiteWithLocalContent(siteName, tempPath, runtimeSrc, contentdir, navTypesStr, typesStr, locales, done);
					} else {
						console.log(' - ERROR: content type not exist ' + typespath);
						done();
						return;
					}
				});
			} else {
				// Check if the zip is a content template
				var names = fs.readdirSync(contentBuildDir);
				for (var i = 0; i < names.length; i++) {
					var name = names[i];
					if (fs.existsSync(path.join(contentBuildDir, name, 'ContentItems')) &&
						fs.existsSync(path.join(contentBuildDir, name, 'ContentTypes'))) {
						contentdir = path.join(contentBuildDir, name);
						break;
					}
				}
				if (contentdir) {
					console.log(' - unzip content template file');
					_createSiteWithLocalContent(siteName, tempPath, runtimeSrc, contentdir, navTypesStr, typesStr, locales, done);
				} else {
					console.log(' - ERROR: content type not exist');
					done();
					return;
				}
			}
		});

	} else if (useserver) {
		var server = serverUtils.getConfiguredServer();
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			done();
			return;
		}

		var allTypes = [];
		// Get content types from the server
		var typesPromise = serverUtils.getContentTypesFromServer(server);
		typesPromise.then(function (result) {
			var stypes = result && result.types || [];
			for (var i = 0; i < stypes.length; i++) {
				if (stypes[i].name !== 'DigitalAsset') {
					allTypes.push(stypes[i].name);
				}
			}
			if (allTypes.length === 0) {
				console.log(' - ERROR: no content type in the server');
				done();
				return;
			}

			var navTypeNames = navTypesStr ? navTypesStr.split(',') : [];
			var navTypes = [];
			// Validate types used for navigation
			for (var i = 0; i < navTypeNames.length; i++) {
				if (allTypes.includes(navTypeNames[i])) {
					navTypes.push({
						name: navTypeNames[i]
					});
				} else {
					console.log(' - type ' + navTypeNames[i] + ' does not exist');
				}
			}

			if (typesStr) {
				var selectedTypes = typesStr.split(',');
				// Validate types
				for (var i = 0; i < selectedTypes.length; i++) {
					if (allTypes.includes(selectedTypes[i])) {
						types.push(selectedTypes[i]);
					} else {
						console.log(' - type ' + selectedTypes[i] + ' does not exist');
					}
				}

				// check if the types for the navigation not included in the type list
				if (navTypes.length > 0) {
					for (var i = 0; i < navTypes.length; i++) {
						if (!types.includes(navTypes[i].name)) {
							types.push(navTypes[i].name);
						}
					}
				}
			} else {
				types = allTypes;
			}

			if (types.length === 0) {
				console.log(' - ERROR: no valid content type specified');
				done();
				return;
			}
			if (navTypes.length === 0) {
				console.log(' - ERROR: no valid content type specified for the site navigation');
				done();
				return;
			}

			var finalNavTypes = navTypes;
			var finalTypes = types;

			//console.log('types: ' + JSON.stringify(finalTypes));
			//console.log('navTypes: ' + JSON.stringify(finalNavTypes));

			var fieldsPromise = [];
			for (var i = 0; i < finalTypes.length; i++) {
				var typename = finalTypes[i];
				fieldsPromise[i] = serverUtils.getContentTypeFieldsFromServer(server, typename);
			}
			Promise.all(fieldsPromise).then(function (values) {
				types = [];
				for (var i = 0; i < values.length; i++) {
					types[i] = {
						name: values[i].type
					};
					fields[i] = values[i].fields;
				}

				// Create site
				_createSite(siteName, tempPath, runtimeSrc, true, '', finalNavTypes, types, fields, locales, done);
			});
		});
	}
};

/**
 * Private read content types from local directory
 * @param {*} contentdir 
 */
var _getLocalContentTypes = function (contentdir) {
	var typespath = path.join(contentdir, 'ContentTypes');
	var types = [];
	if (fs.existsSync(typespath)) {
		var typefiles = fs.readdirSync(typespath);
		for (var j = 0; j < typefiles.length; j++) {
			var typejson = JSON.parse(fs.readFileSync(path.join(typespath, typefiles[j])));
			types.push({
				name: typejson.name
			});
		}
	}
	return types;
}

/**
 * Private read content types from local directory
 * @param {*} contentdir 
 */
var _getLocalContentTypeFields = function (contentdir, type) {
	var typepath = path.join(contentdir, 'ContentTypes', type + '.json');
	var field = {};
	if (fs.existsSync(typepath)) {
		var typejson = JSON.parse(fs.readFileSync(typepath));
		field = typejson.fields;
	}
	return field;
}

/**
 * * Private prepare types and fields from local conent before create site
 */
var _createSiteWithLocalContent = function (siteName, tempPath, runtimeSrc, contentdir, navTypesStr, typesStr, locales, done) {
	var types = [];
	var fields = [];

	var localTypes = [];
	var typespath = path.join(contentdir, 'ContentTypes');
	if (fs.existsSync(typespath)) {
		localTypes = _getLocalContentTypes(contentdir);
	} else {
		console.log(' - ERROR: content type not exist ' + typespath);
		done();
		return;
	}
	if (localTypes.length === 0) {
		console.log(' - ERROR: no content type' + typespath);
		done();
		return;
	}

	var navTypeNames = navTypesStr ? navTypesStr.split(',') : [];
	var navTypes = [];
	// Validate types used for navigation
	for (var i = 0; i < navTypeNames.length; i++) {
		var typeExist = false;
		for (var j = 0; j < localTypes.length; j++) {
			if (localTypes[j].name === navTypeNames[i]) {
				typeExist = true;
				navTypes.push({
					name: navTypeNames[i]
				});
				break;
			}
		}
		if (!typeExist) {
			console.log(' - type ' + navTypeNames[i] + ' does not exist');
		}
	}

	if (typesStr) {
		var selectedTypes = typesStr.split(',');
		// Validate types
		for (var i = 0; i < selectedTypes.length; i++) {
			var typeExist = false;
			for (var j = 0; j < localTypes.length; j++) {
				if (localTypes[j].name === selectedTypes[i]) {
					typeExist = true;
					types.push({
						name: selectedTypes[i]
					});
					break;
				}
			}
			if (!typeExist) {
				console.log(' - type ' + selectedTypes[i] + ' does not exist');
			}
		}

		// check if the types for the navigation not included in the type list
		if (navTypes.length > 0) {
			for (var i = 0; i < navTypes.length; i++) {
				var typeIncluded = false;
				for (var j = 0; j < types.length; j++) {
					if (types[j].name === navTypes[i].name) {
						typeIncluded = true;
						break;
					}
				}
				if (!typeIncluded) {
					types.push(navTypes[i]);
				}
			}
		}
	} else {
		types = localTypes;
	}

	if (navTypes.length === 0) {
		navTypes = types;
	}

	// Get fields for each types
	for (var i = 0; i < types.length; i++) {
		fields[i] = _getLocalContentTypeFields(contentdir, types[i].name);
	}
	// console.log('nav types: ' + JSON.stringify(navTypes) + ' types: ' + JSON.stringify(types));
	// console.log('fields: ' + JSON.stringify(fields));

	// Create site
	_createSite(siteName, tempPath, runtimeSrc, false, contentdir, navTypes, types, fields, locales, done);
}

/**
 * Private unzip site template and create React Component for content types
 * 
 * @param {*} siteName the site name
 * @param {*} tempPath the site template zip path
 * @param {*} contentdir the local content folder under folder 
 * @param {*} navTypes the types to be used as site navigation
 * @param {*} types list of content types
 * @param {*} fields the fields for content types
 */
var _createSite = function (siteName, tempPath, runtimeSrc, isServer, contentdir, navTypes, types, fields, locales, done) {

	if (types.length == 0) {
		console.log(' - no content type');
		done();
		return;
	}

	var siteSrcDir = path.join(sitesSrcDir, siteName);
	if (fs.existsSync(siteSrcDir)) {
		fse.removeSync(siteSrcDir);
	}
	fs.mkdirSync(siteSrcDir);
	siteSrcDir = path.join(sitesSrcDir, siteName, 'src');
	fs.mkdirSync(siteSrcDir);

	// unzip site template
	extract(tempPath, {
		dir: siteSrcDir
	}, function (err) {
		if (err) {
			console.log(err);
		}
		console.log(' - unzip site template');

		if (contentdir) {
			fse.moveSync(contentdir, path.join(siteSrcDir, 'content'));
			console.log(' - add content to site');
		}

		// clean up
		if (fs.existsSync(buildDir)) {
			fse.removeSync(buildDir);
		}

		// copy run time files
		extract(runtimeSrc, {
			dir: path.join(sitesSrcDir, siteName)
		}, function (err) {
			if (err) {
				console.log(err);
			}
			console.log(' - set up files for site runtime');

			// inject extra dependencies
			var depPath = path.join(siteSrcDir, 'dependencies.json');
			if (fs.existsSync(depPath)) {
				try {
					var depJson = JSON.parse(fs.readFileSync(depPath));
					var packageJson = JSON.parse(fs.readFileSync(path.join(sitesSrcDir, siteName, 'package.json')));
					Object.keys(depJson).forEach(function (libname) {
						var libversion = depJson[libname];
						console.log(' - add dependency: ' + libname + ' ' + libversion);
						packageJson.dependencies[libname] = libversion;
					});

					fs.writeFileSync(path.join(sitesSrcDir, siteName, 'package.json'), JSON.stringify(packageJson, null, 2));
				} catch (e) {
					// console.log(e);
					console.log('ERROR: file ' + depPath + ' is not valid JSON file');
				}
			}

			// create and process components
			_createComponents(siteName, isServer, navTypes, types, fields, locales, done);
		});

	});

};


/**
 * Private
 * Create React components for content types in a site
 */
var _createComponents = function (site, isServer, navTypes, types, fields, locales, done) {

	var siteSrcDir = path.join(sitesSrcDir, site, 'src'),
		contentDir = path.join(siteSrcDir, 'content');

	// The first nav type will be the default component
	for (var i = 0; i < types.length; i++) {
		if (types[i].name === navTypes[0].name) {
			types[i]['first'] = true;
			break;
		}
	}

	var compNames = [];
	var startWithDigit = new RegExp(/^\d+/);
	for (var i = 0; i < types.length; i++) {
		// Use the type name as the component name
		if (types[i].name.indexOf('-') < 0 && !startWithDigit.test(types[i].name)) {
			types[i]['component'] = types[i].name;
			compNames.push(types[i].name);
		}
	}

	for (var i = 0; i < types.length; i++) {
		// The type name is invalid for component name, change it
		if (types[i].name.indexOf('-') >= 0 || startWithDigit.test(types[i].name)) {
			var compName = types[i].name;
			if (startWithDigit.test(compName)) {
				compName = 'Comp' + compName;
			}
			// Replace '-' with '_'
			compName = serverUtils.replaceAll(compName, '-', '_');

			// Make sure the name is unique
			var unique = !compNames.includes(compName);
			var index = 1;
			while (!unique) {
				index += 1;
				compName = compName + index.toString();
				unique = !compNames.includes(compName);
			}
			types[i]['component'] = compName;
			compNames.push(compName);
			console.log(' - type ' + types[i].name + ' mapped to component ' + compName);
		}
	}

	// console.log(locales);
	var localenames = '';
	for (var i = 0; i < locales.length; i++) {
		if (i > 0) {
			localenames += ',';
		}
		localenames += '\'' + locales[i].localeName + '\'';
	}

	var typeHash = {
		'sitename': site,
		'types': types,
		'navtypes': navTypes,
		'locales': locales,
		'localenames': localenames
	};

	fields.forEach(function (typeFields) {
		var textTotal = 0;
		var imageTotal = 0;
		typeFields.forEach(function (field) {
			var isDigitalAsset = field.referenceType && field.referenceType.type === 'DigitalAsset';
			var isReference = field.datatype === 'reference' && !isDigitalAsset;
			var hasMultiple = field.settings && field.settings.caas && field.settings.caas.valuecountRange;
			var isDateTime = field.datatype === 'datetime';
			var isRichText = field.settings && field.settings.caas && field.settings.caas.editor && field.settings.caas.editor.name === 'rich-text-editor';
			var isMarkdown = field.settings && field.settings.caas && field.settings.caas.editor && field.settings.caas.editor.name === 'markdown-editor';
			var forsummary = false;
			if (field.datatype === 'text' && !hasMultiple) {
				textTotal += 1;
				forsummary = textTotal <= 2;
			}
			if (isDigitalAsset && !hasMultiple) {
				imageTotal += 1;
				forsummary = imageTotal <= 1;
			}

			// add field info for rendering
			field['__render'] = {
				'direct': !isDigitalAsset && !isReference && !isDateTime && !isRichText && !isMarkdown,
				'image': isDigitalAsset,
				'richtext': isRichText,
				'markdown': isMarkdown,
				'datetime': isDateTime,
				'reference': isReference,
				'multiple': hasMultiple,
				'single': !hasMultiple,
				'forsummary': forsummary
			};
			// console.log('field: ' + field.name + ' render: ' + JSON.stringify(field['__render']));
		});
	});

	var jsfiles = [];

	var commonDir = path.join(siteSrcDir, 'common');

	var compTempDirs = [];

	// Check if need to create Component for content types
	dir.subdirs(siteSrcDir, function (err, dirs) {
		// console.log(dirs);
		var compFiles = [];
		dirs.forEach(function (subdir) {
			var dirName = subdir.substring(subdir.lastIndexOf(path.sep) + 1);
			if (dirName === '{{types}}') {
				var compTempDir = subdir;
				var compParentDir = subdir.substring(0, subdir.lastIndexOf(path.sep));
				var compfilepath = path.join(subdir, '{{name}}.js'),
					comptempexist = fs.existsSync(compfilepath);
				var comptempsrc = comptempexist ? fs.readFileSync(compfilepath).toString() : '';

				// create dir for each type
				for (var i = 0; i < types.length; i++) {
					var typename = types[i].name;
					var compname = types[i].component;
					var typeFieldsHash = {
						'sitename': site,
						'langugeEnabled': locales && locales.length > 0,
						'type': typename,
						'component': compname,
						'fields': fields[i]
					};
					// In case the {{type}} is nested
					compParentDir = serverUtils.replaceAll(compParentDir, '{{types}}', typename);

					var compname = typename,
						compdir = path.join(compParentDir, compname);
					fs.mkdirSync(compdir);
					// console.log(' - create component folder ' + compname);
					if (comptempexist && comptempsrc) {
						var newcompfilepath = path.join(compdir, compname + '.js');
						var newcompsrc = Mustache.render(comptempsrc, typeFieldsHash);
						compFiles.push(newcompfilepath);
						fs.writeFileSync(newcompfilepath, newcompsrc);
						console.log(' - create component file .' + newcompfilepath.substring(newcompfilepath.indexOf('/' + site + '/')));
					}
				}

				compTempDirs.push(compTempDir);
			}
		});

		// Delete the component template folders
		for (var i = 0; i < compTempDirs.length; i++) {
			if (fs.existsSync(compTempDirs[i])) {
				fse.removeSync(compTempDirs[i]);
			}
		}

		// Go through all js files 
		dir.files(siteSrcDir, function (err, files) {
			if (err) {
				console.log(err);
				done();
			} else {
				files.forEach(function (file) {
					var extension = file.replace(/^.*\./, '');
					// console.log(file + '   ' + extension);
					if (file.indexOf(contentDir) < 0 && file.lastIndexOf('{{types}}') < 0 &&
						(extension === 'js' || extension === 'html' || extension === 'css')) {
						jsfiles.push(file);
					}
				});

				// console.log(compFiles);
				jsfiles.forEach(function (file) {
					var isCompFile = false;
					for (var j = 0; j < compFiles.length; j++) {
						if (file === compFiles[j]) {
							isCompFile = true;
							break;
						}
					}
					// Do not process the newly created js file for components
					if (!isCompFile) {
						var srcfile = fs.readFileSync(file).toString();
						// console.log('processing ' + file);
						var newFile = Mustache.render(srcfile, typeHash);
						if (srcfile !== newFile) {
							// console.log('file updated: ' + file);
							fs.writeFileSync(file, newFile);
						}
					}
				});
				console.log(' - finish processing js files');

				console.log(' *** site created, please run npm install to build');
				done();
			}
		});
	});
};