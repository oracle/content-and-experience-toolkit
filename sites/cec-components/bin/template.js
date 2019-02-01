/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Template library
 */
var gulp = require('gulp'),
	serverUtils = require('../test/server/serverUtils.js'),
	decompress = require('decompress'),
	extract = require('extract-zip'),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	argv = require('yargs').argv,
	replace = require('gulp-replace'),
	zip = require('gulp-zip');

var projectDir = path.join(__dirname, ".."),
	componentsSrcDir = path.join(projectDir, 'src', 'main', 'components'),
	templatesDataDir = path.join(projectDir, 'data', 'templates'),
	templatesSrcDir = path.join(projectDir, 'src', 'main', 'templates'),
	templatesBuildDir = path.join(projectDir, 'src', 'build', 'templates'),
	themesSrcDir = path.join(projectDir, 'src', 'main', 'themes'),
	themesBuildDir = path.join(projectDir, 'src', 'build', 'themes');

var templateBuildContentDirBase = '',
	templateBuildContentDirName = '',
	templateName = '';

module.exports.createTemplate = function (argv, done) {
	'use strict';

	var srcTempName = argv.source,
		tempName = argv.name,
		template = '',
		seededTemplates = getContents(templatesDataDir);

	if (!srcTempName && !tempName) {
		console.error('ERROR: please run as npm run create-template -- --source <source template> --name <new template name>');
		done();
		return;
	}
	if (!srcTempName) {
		console.error('ERROR: please use --source to specify the source template');
		done();
		return;
	}
	if (!tempName) {
		console.error('ERROR: please use --name to specify the new template name');
		done();
		return;
	}

	// verify the source template
	for (var i = 0; i < seededTemplates.length; i++) {
		// console.log('seeded template: ' + seededTemplates[i]);
		if (srcTempName + '.zip' === seededTemplates[i]) {
			template = seededTemplates[i];
			break;
		}
	}
	if (!template) {
		console.error('ERROR: invalid template ' + srcTempName);
		done();
		return;
	}

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (tempName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(templatesSrcDir + '/' + tempName)) {
			console.error('ERROR: A template with the name ' + tempName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	console.log('Create Template: creating new template ' + tempName + ' from ' + srcTempName);
	unzipTemplate(tempName, path.resolve(templatesDataDir + '/' + template), true, done);
};

module.exports.importTemplate = function (argv, done) {
	'use strict';

	if (typeof argv.path !== 'string') {
		console.error('ERROR: please specify the template zip file');
		done();
		return;
	}
	var tempPath = argv.path;
	if (!path.isAbsolute(tempPath)) {
		tempPath = path.join('..', tempPath);
	}
	tempPath = path.resolve(tempPath);

	if (!fs.existsSync(tempPath)) {
		console.log('ERROR: file ' + tempPath + ' does not exist');
		done();
		return;
	}

	var tempName = tempPath.substring(tempPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	console.log('Import Template: importing template name=' + tempName + ' path=' + tempPath);
	unzipTemplate(tempName, tempPath, false, done);
};

module.exports.exportTemplate = function (argv, done) {
	'use strict';

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please run as npm run export-template -- --template <template> [--minify <true|false>]');
		done();
		return;
	}

	var optimize = typeof argv.minify === 'string' && argv.minify.toLowerCase() === 'true';

	var name = argv.template,
		tempExist = false,
		templates = getContents(templatesSrcDir);
	for (var i = 0; i < templates.length; i++) {
		if (name === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		console.error('ERROR: template ' + name + ' does not exist');
		done();
		return;
	}

	var zipfile = _exportTemplate(name, optimize);
	// wait the zip file created
	var total = 0;
	var inter = setInterval(function () {
		// console.log(' - total = ' + total);
		if (fs.existsSync(zipfile)) {
			console.log('The template exported to ' + zipfile);
			clearInterval(inter);
			done();
			return;
		}
		total += 1;
	}, 2000);
};

gulp.task('create-template-zip', function (done) {
	'use strict';

	if (templateName && templateBuildContentDirBase && templateBuildContentDirName) {
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			tempBuildDir = path.join(templatesBuildDir, templateName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');

		gulp.src([tempBuildDir + '/**', '!' + contentdir, '!' + contentdir + '/**', '!' + metainfbuilddir, '!' + metainfbuilddir + '/**'])
			.pipe(zip(templateName + '.zip'))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', done);
	}
});

gulp.task('create-template-export-zip', function (done) {
	'use strict';

	if (templateBuildContentDirBase && templateBuildContentDirName) {
		console.log(' - content export.zip');
		var contentdir = path.join(templateBuildContentDirBase, templateBuildContentDirName),
			metainfbuilddir = path.join(templateBuildContentDirBase, 'META-INF');
		return gulp.src([contentdir + '/**', metainfbuilddir + '/**'], {
				base: templateBuildContentDirBase
			})
			.pipe(zip('export.zip'))
			.pipe(gulp.dest(path.join(templateBuildContentDirBase)))
			.on('end', done);
	}
});

module.exports.copyTemplate = function (argv, done) {
	'use strict';

	var srcTempName = argv.source,
		tempName = argv.name,
		template = '',
		existingTemplates = getContents(templatesSrcDir);

	if (!srcTempName && !tempName) {
		console.error('ERROR: please run as npm run copy-template -- --source <source template> --name <new template name>');
		done();
		return;
	}
	if (!srcTempName) {
		console.error('ERROR: please use --source to specify the source template');
		done();
		return;
	}
	if (!tempName) {
		console.error('ERROR: please use --name to specify the new template name');
		done();
		return;
	}

	// verify the source template
	for (var i = 0; i < existingTemplates.length; i++) {
		if (srcTempName === existingTemplates[i]) {
			template = existingTemplates[i];
			break;
		}
	}
	if (!template) {
		console.error('ERROR: invalid template ' + srcTempName);
		done();
		return;
	}

	var themeName = tempName + 'Theme';

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (tempName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(path.join(templatesSrcDir, tempName))) {
			console.error('ERROR: A template with the name ' + tempName + ' already exists. Please specify a different name.');
			done();
			return;
		}
		// check theme name 
		if (fs.existsSync(path.join(themesSrcDir, themeName))) {
			console.error('ERROR: A theme with the name ' + themeName + ' already exists. Please specify a different template name.');
			done();
			return;
		}
	}

	console.log('Copy Template: creating new template ' + tempName + ' from ' + srcTempName);

	var siteinfofile = path.join(templatesSrcDir, srcTempName, 'siteinfo.json');
	if (!fs.existsSync(siteinfofile)) {
		console.error('ERROR: template file siteinfo.json is missing');
		done();
		return;
	}

	// get the theme
	var siteinfostr = fs.readFileSync(siteinfofile),
		siteinfojson = JSON.parse(siteinfostr),
		srcThemeName = '';
	if (siteinfojson && siteinfojson.properties) {
		srcThemeName = siteinfojson.properties.themeName;
	}

	if (!srcThemeName) {
		console.error('ERROR: no theme is defined for the source template ' + srcTempName);
		done();
		return;
	}

	// copy template files
	fse.copySync(path.join(templatesSrcDir, srcTempName), path.join(templatesSrcDir, tempName));

	// update itemGUID for the new template
	serverUtils.updateItemFolderJson('template', tempName, 'siteName', tempName);

	// update the content dir if exists
	var contentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', 'Content Template of ' + srcTempName);
	if (fs.existsSync(contentdir)) {
		var newname = 'Content Template of ' + tempName,
			newcontentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', newname);
		fs.renameSync(contentdir, newcontentdir);
		console.log(' - update content dir to ' + newname);
	}

	// copy theme files
	fse.copySync(path.join(themesSrcDir, srcThemeName), path.join(themesSrcDir, themeName));

	// update itemGUID for the new theme
	serverUtils.updateItemFolderJson('theme', themeName, 'themeName', themeName);

	// update the siteName and themeName in siteinfo.json for the new template
	siteinfofile = path.join(templatesSrcDir, tempName, 'siteinfo.json');
	if (fs.existsSync(siteinfofile)) {
		var siteinfostr = fs.readFileSync(siteinfofile),
			siteinfojson = JSON.parse(siteinfostr);
		if (siteinfojson && siteinfojson.properties) {
			console.log(' - update template themeName to ' + themeName + ' in siteinfo.json');
			siteinfojson.properties.themeName = themeName;
			siteinfojson.properties.siteName = tempName;
			fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
		}
	}

	console.log(' *** template is ready to test: http://localhost:8085/templates/' + tempName);
	done();
};

module.exports.deployTemplate = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please run as npm run deploy-template -- --template <template> [--minify <true|false>]');
		done();
		return;
	}

	var optimize = typeof argv.minify === 'string' && argv.minify.toLowerCase() === 'true';

	var name = argv.template,
		tempExist = false,
		templates = getContents(templatesSrcDir);
	for (var i = 0; i < templates.length; i++) {
		if (name === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		console.error('ERROR: template ' + name + ' does not exist');
		done();
		return;
	}

	var zipfile = _exportTemplate(name, optimize);

	// wait the zip file created
	var total = 0;
	var inter = setInterval(function () {
		// console.log(' - total = ' + total);
		if (fs.existsSync(zipfile)) {
			console.log(' - template exported to ' + zipfile);
			clearInterval(inter);
			// import the template to the server
			_importTemplate(server, name, zipfile);
			done();
			return;
		}
		total += 1;
		if (total >= 10) {
			clearInterval(inter);
			console.log('ERROR: file ' + zipfile + ' does not exist');
		}
	}, 2000);
};

module.exports.describeTemplate = function (argv, done) {
	'use strict';

	if (typeof argv.template !== 'string') {
		console.error('ERROR: please specify template');
		done();
		return;
	}

	var name = argv.template,
		tempExist = false,
		templates = getContents(templatesSrcDir);
	for (var i = 0; i < templates.length; i++) {
		if (name === templates[i]) {
			tempExist = true;
			break;
		}
	}
	if (!tempExist) {
		console.error('ERROR: template ' + name + ' does not exist');
		done();
		return;
	}

	console.log('Name:  ' + name);

	var tempSrcDir = path.join(templatesSrcDir, name);

	// get the used theme
	var siteinfofile = path.join(tempSrcDir, 'siteinfo.json'),
		themeName = '';
	if (fs.existsSync(siteinfofile)) {
		var siteinfostr = fs.readFileSync(siteinfofile),
			siteinfojson = JSON.parse(siteinfostr);
		if (siteinfojson && siteinfojson.properties) {
			themeName = siteinfojson.properties.themeName;
		}
	}
	console.log('Theme: ' + themeName);

	// custom components
	var comps = serverUtils.getTemplateComponents(name);
	console.log('Components: ');
	if (comps) {
		comps.forEach(function (name) {
			if (fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
				console.log('    ' + name);
			}
		});
	}

	// theme components
	console.log('Theme components:');
	var themeComps = serverUtils.getThemeComponents(themeName);
	themeComps.forEach(function (comp) {
		console.log('    ' + comp.id);
	});

	// Content types
	console.log('Content types:');
	var alltypes = serverUtils.getContentTypes();
	for (var i = 0; i < alltypes.length; i++) {
		if (name === alltypes[i].template) {
			console.log('    ' + alltypes[i].type.name);
		}
	}

	// Content layout mapping
	console.log('Content Layout mappings:');
	var contentmapfile = path.join(tempSrcDir, 'caas_contenttypemap.json');
	if (fs.existsSync(contentmapfile)) {
		var contenttypes = JSON.parse(fs.readFileSync(contentmapfile));
		for (var i = 0; i < contenttypes.length; i++) {
			var j;
			var ctype = contenttypes[i];
			console.log('    ' + ctype.type + ':');
			var mappings = [],
				defaultLayout,
				conentListDefault,
				emptyListDefault,
				contentPlaceholderDefault;
			for (j = 0; j < ctype.categoryList.length; j++) {
				var layoutName = ctype.categoryList[j].layoutName,
					categoryName = ctype.categoryList[j].categoryName;
				if (layoutName) {
					if (categoryName === 'Default') {
						defaultLayout = {
							'layoutName': layoutName,
							'categoryName': 'Content Item Default'
						};
					} else if (categoryName === 'Content List Default') {
						conentListDefault = {
							'layoutName': layoutName,
							'categoryName': categoryName
						};
					} else if (categoryName === 'Empty Content List Default') {
						emptyListDefault = {
							'layoutName': layoutName,
							'categoryName': categoryName
						};
					} else if (categoryName === 'Content Placeholder Default') {
						contentPlaceholderDefault = {
							'layoutName': layoutName,
							'categoryName': categoryName
						};
					} else {
						mappings[mappings.length] = {
							'layoutName': layoutName,
							'categoryName': categoryName
						};
					}
				}
			}

			if (mappings.length > 0) {
				var byName = mappings.slice(0);
				byName.sort(function (a, b) {
					var x = a.categoryName;
					var y = b.categoryName;
					return (x < y ? -1 : x > y ? 1 : 0);
				});
				mappings = byName;
			}

			if (defaultLayout) {
				console.log('        ' + defaultLayout.categoryName + ' => ' + defaultLayout.layoutName);
			}
			if (conentListDefault) {
				console.log('        ' + conentListDefault.categoryName + ' => ' + conentListDefault.layoutName);
			}
			if (emptyListDefault) {
				console.log('        ' + emptyListDefault.categoryName + ' => ' + emptyListDefault.layoutName);
			}
			if (contentPlaceholderDefault) {
				console.log('        ' + contentPlaceholderDefault.categoryName + ' => ' + contentPlaceholderDefault.layoutName);
			}
			for (j = 0; j < mappings.length; j++) {
				console.log('        ' + mappings[j].categoryName + ' => ' + mappings[j].layoutName);
			}
		}
	}
	done();
};

module.exports.addThemeComponent = function (argv, done) {
	'use strict';

	var component = argv.component,
		category = argv.category || '',
		theme = argv.theme;

	if (!component || !theme) {
		console.error('ERROR: please run as npm run add-theme-component -- --component <component> --theme <theme> [--category <category>]');
		done();
		return;
	}

	// Verify the component
	var compfolderfile = path.join(componentsSrcDir, component, '_folder.json');
	if (!fs.existsSync(compfolderfile)) {
		console.error('ERROR: Component ' + component + ' does not exist');
		done();
		return;
	}
	var compstr = fs.readFileSync(compfolderfile),
		compjson = JSON.parse(compstr),
		appType = compjson && compjson.appType;

	if (appType === 'sectionlayout') {
		console.error('ERROR: The section layout cannot be added to the theme');
		done();
		return;
	}
	if (appType === 'sectionlayout' || appType === 'contentlayout') {
		console.error('ERROR: The content layout cannot be added to the theme');
		done();
		return;
	}

	// Verify the theme
	var themefolderfile = path.join(themesSrcDir, theme, '_folder.json');
	if (!fs.existsSync(themefolderfile)) {
		console.error('ERROR: Theme ' + theme + ' does not exist');
		done();
		return;
	}

	var componentsjsonfile = path.join(themesSrcDir, theme, 'components.json'),
		comps = [];
	if (fs.existsSync(componentsjsonfile)) {
		var str = fs.readFileSync(componentsjsonfile).toString().trim(),
			filecontent = str ? JSON.parse(str) : [];
		if (filecontent && !Array.isArray(filecontent)) {
			comps = filecontent.components || [];
		} else {
			comps = filecontent;
		}
	}

	// Remove the component from the list
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			var newCompList = [];
			comp.list.forEach(function (listcomp) {
				if (listcomp.id !== component) {
					newCompList.push(listcomp);
				}
			});
			comp.list = newCompList;
		}
	});

	// Remove categories that do not have any component
	var newComps = [];
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			newComps.push(comp);
		}
	});

	// Add the component
	var added = false;
	newComps.forEach(function (comp) {
		var cate = comp.name;
		if (!cate && !category || cate && category && cate === category) {
			comp.list.push({
				type: appType,
				id: component,
				themed: true
			});
			added = true;
		}
	});

	if (!added) {
		// The category is new
		newComps.push({
			name: category,
			list: [{
				type: appType,
				id: component,
				themed: true
			}]
		});
	}
	// console.log(newComps);

	// Write to the file
	fs.writeFileSync(componentsjsonfile, JSON.stringify(newComps));

	console.log(' - Component ' + component + ' added to theme ' + theme);
	done();
};

module.exports.removeThemeComponent = function (argv, done) {
	'use strict';

	var component = argv.component,
		theme = argv.theme;

	if (!component || !theme) {
		console.error('ERROR: please run as npm run remove-theme-component -- --component <component> --theme <theme>');
		done();
		return;
	}

	// Verify the component
	var compfolderfile = path.join(componentsSrcDir, component, '_folder.json');
	if (!fs.existsSync(compfolderfile)) {
		console.error('ERROR: Component ' + component + ' does not exist');
		done();
		return;
	}

	// Verify the theme
	var themefolderfile = path.join(themesSrcDir, theme, '_folder.json');
	if (!fs.existsSync(themefolderfile)) {
		console.error('ERROR: Theme ' + theme + ' does not exist');
		done();
		return;
	}

	var componentsjsonfile = path.join(themesSrcDir, theme, 'components.json');
	if (!fs.existsSync(componentsjsonfile)) {
		console.log(' - Component ' + component + ' is not associated with theme ' + theme);
		done();
		return;
	}

	var comps = [],
		str = fs.readFileSync(componentsjsonfile).toString().trim(),
		filecontent = str ? JSON.parse(str) : [];
	if (filecontent && !Array.isArray(filecontent)) {
		comps = filecontent.components || [];
	} else {
		comps = filecontent;
	}

	// Remove the component from the list
	var found = false;
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			var newCompList = [];
			comp.list.forEach(function (listcomp) {
				if (listcomp.id !== component) {
					newCompList.push(listcomp);
				} else {
					found = true;
				}
			});
			comp.list = newCompList;
		}
	});
	if (!found) {
		console.log(' - Component ' + component + ' is not associated with theme ' + theme);
		done();
		return;
	}

	// Remove categories that do not have any component
	var newComps = [];
	comps.forEach(function (comp) {
		if (comp.list && comp.list.length > 0) {
			newComps.push(comp);
		}
	});

	// Save to the file
	fs.writeFileSync(componentsjsonfile, JSON.stringify(newComps));

	console.log(' - Component ' + component + ' removed from theme ' + theme);
	done();
};

/** 
 * private
 * unzip template zip file and copy to /src
 */
var unzipTemplate = function (tempName, tempPath, useNewGUID, done) {

	var createNew = tempPath.indexOf(tempName + '.zip') < 0;
	//console.log('unzipTemplate: name=' + tempName + ' path=' + tempPath + ' createNew=' + createNew);

	// create dirs in src
	var tempSrcDir = path.join(templatesSrcDir, tempName);
	console.log('The template will be at ' + tempSrcDir);
	if (fs.existsSync(tempSrcDir)) {
		fse.removeSync(tempSrcDir);
	}
	fs.mkdirSync(tempSrcDir);

	// unzip /src/templates/<temp name>/
	// decompress(tempPath, tempSrcDir).then(() => {
	// decompress does not work with empty directories on unix
	extract(tempPath, {
		dir: tempSrcDir
	}, function (err) {
		if (err) {
			console.log(err);
		}

		// get the theme name from theme/_folder.json 
		var themeName = '';
		if (createNew) {
			themeName = tempName + 'Theme';

		} else {
			if (fs.existsSync(path.join(tempSrcDir, 'theme', '_folder.json'))) {
				var themestr = fs.readFileSync(path.join(tempSrcDir, 'theme', '_folder.json')),
					themejson = JSON.parse(themestr),
					themeName = themejson && themejson.themeName || tempName + 'Theme';
			}
		}

		// create the theme dir
		var themeSrcDir = path.join(themesSrcDir, themeName);
		console.log('The theme for the template will be at ' + themeSrcDir);
		if (fs.existsSync(themeSrcDir)) {
			fse.removeSync(themeSrcDir);
		}

		// move theme to the themes dir
		fse.moveSync(path.join(tempSrcDir, 'theme'), themeSrcDir);

		// create soft links
		var currdir = process.cwd();
		try {
			if (fs.existsSync(path.join(themeSrcDir, 'layouts'))) {
				process.chdir(path.join(themeSrcDir, 'layouts'));
				fse.ensureSymlinkSync('..', '_scs_theme_root_');
				console.log(' - create link _scs_theme_root_');
			} else {
				console.log(' Path does not exist: ' + path.join(themeSrcDir, 'layouts'));
			}

			if (fs.existsSync(path.join(themeSrcDir, 'designs', 'default'))) {
				process.chdir(path.join(themeSrcDir, 'designs'));
				fse.ensureSymlinkSync('default', '_scs_design_name_');
				console.log(' - create link _scs_design_name_');
			} else {
				console.log(' Path does not exist: ' + path.join(themeSrcDir, 'designs', 'default'));
			}

			process.chdir(currdir);
		} catch (err) {
			console.error('ERROR: ' + err);
		}

		// move all files under /template up 
		var files = fs.readdirSync(path.join(tempSrcDir, 'template'));
		for (var i = 0; i < files.length; i++) {
			fse.moveSync(path.join(tempSrcDir, 'template', files[i]), path.join(tempSrcDir, files[i]), true);
		}
		fse.removeSync(path.join(tempSrcDir, 'template'));

		// unzip content zip if exists
		var contentpath = path.join(tempSrcDir, 'assets', 'contenttemplate');
		var contentexportfile = path.join(contentpath, 'export.zip');
		if (fs.existsSync(contentexportfile)) {
			console.log(' - unzip template content file');
			extract(contentexportfile, {
				dir: contentpath
			}, function (err) {
				if (err) {
					console.log(err);
				}

				if (createNew) {
					// update the content dir if exists
					var items = fs.readdirSync(path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate'));
					for (var i = 0; i < items.length; i++) {
						if (items[i].indexOf('Content Template of ') === 0 && items[i] !== 'Content Template of ' + tempName) {
							// rename the dir
							var contentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', items[i]),
								newname = 'Content Template of ' + tempName,
								newcontentdir = path.join(templatesSrcDir, tempName, 'assets', 'contenttemplate', newname);
							fs.renameSync(contentdir, newcontentdir);
							// console.log(' - update content dir to ' + newname);
							break;
						}
					}
				}
			});
		}

		if (fs.existsSync(path.join(tempSrcDir, 'components'))) {
			// move components to the components dir
			var comps = fs.readdirSync(path.join(tempSrcDir, 'components'));
			for (var i = 0; i < comps.length; i++) {
				if (fs.existsSync(path.join(componentsSrcDir, comps[i]))) {
					fse.removeSync(path.join(componentsSrcDir, comps[i]));
					console.log(' - override component ' + componentsSrcDir + '/' + comps[i]);
				}
				fse.moveSync(path.join(tempSrcDir, 'components', comps[i]), path.join(componentsSrcDir, comps[i]), true);
			}
			fse.removeSync(path.join(tempSrcDir, 'components'));
		}

		// make sure the correct theme name is set in siteinfo
		var siteinfofile = path.join(tempSrcDir, 'siteinfo.json');
		if (fs.existsSync(siteinfofile)) {
			var siteinfostr = fs.readFileSync(siteinfofile),
				siteinfojson = JSON.parse(siteinfostr);
			if (siteinfojson && siteinfojson.properties) {
				console.log(' - set themeName to ' + themeName + ' in siteinfo.json');
				siteinfojson.properties.themeName = themeName;
				siteinfojson.properties.siteName = tempName;
				fs.writeFileSync(siteinfofile, JSON.stringify(siteinfojson));
			}
		}

		if (useNewGUID) {
			// update itemGUID for template and theme
			var templatefolderfile = path.join(tempSrcDir, '_folder.json'),
				themefolderfile = path.join(themeSrcDir, '_folder.json');

			// update template _folder.json
			if (fs.existsSync(templatefolderfile)) {
				var folderstr = fs.readFileSync(templatefolderfile),
					folderjson = JSON.parse(folderstr),
					oldGUID = folderjson.itemGUID,
					newGUID = serverUtils.createGUID();
				folderjson.itemGUID = newGUID;
				folderjson.siteName = tempName;
				console.log(' - update template GUID ' + oldGUID + ' to ' + newGUID);
				fs.writeFileSync(templatefolderfile, JSON.stringify(folderjson));
			}
			// update theme _folder.json
			if (fs.existsSync(themefolderfile)) {
				var folderstr = fs.readFileSync(themefolderfile),
					folderjson = JSON.parse(folderstr),
					oldGUID = folderjson.itemGUID,
					newGUID = serverUtils.createGUID();
				folderjson.itemGUID = newGUID;
				folderjson.themeName = themeName;
				console.log(' - update theme GUID ' + oldGUID + ' to ' + newGUID);
				fs.writeFileSync(themefolderfile, JSON.stringify(folderjson));
			}
		}

		console.log(' *** template is ready to test: http://localhost:8085/templates/' + tempName);
		done();
	});

};


/**
 * Private
 * Export a template
 */
var _exportTemplate = function (name, optimize) {
	var tempSrcDir = path.join(templatesSrcDir, name),
		tempBuildDir = path.join(templatesBuildDir, name);

	if (fs.existsSync(tempBuildDir)) {
		fse.removeSync(tempBuildDir);
	}

	// copy template files to build dir: <template name>/template/
	fse.copySync(tempSrcDir, path.join(tempBuildDir, 'template'));
	console.log(' - template ' + name);

	var exportfile = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate', 'export.zip');
	if (fs.existsSync(exportfile)) {
		fse.removeSync(exportfile);
	}
	/*
	var metainfbuilddir = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate', 'META-INF');
	if (fs.existsSync(metainfbuilddir)) {
		fse.removeSync(metainfbuilddir);
	}
	*/

	// get the used theme
	var siteinfofile = path.join(tempSrcDir, 'siteinfo.json'),
		themeName = '';
	if (fs.existsSync(siteinfofile)) {
		var siteinfostr = fs.readFileSync(siteinfofile),
			siteinfojson = JSON.parse(siteinfostr);
		if (siteinfojson && siteinfojson.properties) {
			themeName = siteinfojson.properties.themeName;
		}
	}

	if (!themeName) {
		console.error('ERROR: no theme is found for template ' + name);
		return;
	}

	var themeSrcDir = path.join(themesSrcDir, themeName);
	if (!fs.existsSync(siteinfofile)) {
		console.error('ERROR: theme path does not exist ' + themeSrcDir);
		return;
	}

	// copy theme files to build dir: <template name>/theme/
	fse.copySync(themeSrcDir, path.join(tempBuildDir, 'theme'));
	console.log(' - theme ' + themeName);

	// remove soft links
	try {
		fs.unlinkSync(path.join(tempBuildDir, 'theme', 'layouts', '_scs_theme_root_'));
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			console.error('ERROR: ' + err);
		}
	}
	try {
		fs.unlinkSync(path.join(tempBuildDir, 'theme', 'designs', '_scs_design_name_'));
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			console.error('ERROR: ' + err);
		}
	}

	// get all custom components used by the template
	var comps = serverUtils.getTemplateComponents(name);

	// get the theme components
	var themeComps = serverUtils.getThemeComponents(themeName);
	themeComps.forEach(function (comp) {
		if (!comps.includes(comp.id)) {
			comps[comps.length] = comp.id;
		}
	});

	// create the components dir (required even the template doesn not have any custom component)
	fs.mkdirSync(path.join(tempBuildDir, 'components'));

	// copy customer components to buid dir: <template name>/components/
	for (var i = 0; i < comps.length; i++) {
		var compSrcDir = path.join(componentsSrcDir, comps[i]),
			compExist = fs.existsSync(compSrcDir);
		if (compExist) {
			fse.copySync(compSrcDir, path.join(tempBuildDir, 'components', comps[i]));
			console.log(' - component ' + comps[i]);
		}
	}

	// Optimize if requested
	if (optimize) {
		var files = getDirFiles(tempBuildDir);

		if (files) {
			var uglifycss = require('uglifycss'),
				uglifyjs = require("uglify-js");
			files.forEach(function (name) {
				if (name.endsWith('.css')) {
					var uglified = uglifycss.processFiles([name]);
					fs.writeFileSync(name, uglified);
					// console.log(' - Optimized CSS File ' + name);
				} else if (name.endsWith('.js')) {
					var orig = fs.readFileSync(name, {
							encoding: 'utf8'
						}),
						result = uglifyjs.minify(orig),
						uglified = result.code;
					if (result.error) {
						console.log(' - ERROR optiomizing JS File ' + name + result.error);
					} else {
						fs.writeFileSync(name, uglified);
						// console.log(' - Optimized JS File ' + name);
					}
				}
			});
		}
	}

	// create the zip file
	var zipfile = path.join(projectDir, 'dist', name + '.zip');
	if (fs.existsSync(zipfile)) {
		fse.removeSync(zipfile);
	}

	var dirname = 'Content Template of ' + name,
		dirbase = path.join(tempBuildDir, 'template', 'assets', 'contenttemplate'),
		contentdir = path.join(dirbase, dirname);

	if (fs.existsSync(contentdir)) {
		templateName = name;
		templateBuildContentDirBase = dirbase;
		templateBuildContentDirName = dirname;

		var generateZip = gulp.series('create-template-export-zip', 'create-template-zip');
		generateZip();

	} else {
		gulp.src(tempBuildDir + '/**')
			.pipe(zip(name + '.zip'))
			.pipe(gulp.dest(path.join(projectDir, 'dist')));
	}

	return zipfile;
};
/**
 * Private
 * Import a template
 */
var _importTemplate = function (server, name, zipfile) {
	console.log(' - deploy template ' + argv.template);

	var request = require('request');
	request = request.defaults({
		jar: true,
		proxy: null
	});

	if (server.env === 'pod_ec') {
		var loginPromise = serverUtils.loginToPODServer(server);

		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return;
			}

			var importPromise = serverUtils.importToPODServer(server, 'template', zipfile);
			importPromise.then(function (importResult) {
				// console.log(importResult);
				if (importResult && importResult.LocalData) {
					if (importResult.LocalData.StatusCode !== '0') {
						console.log(' - failed to import: ' + importResult.LocalData.StatusMessage);
					} else if (importResult.LocalData.ImportConflicts) {
						console.log(' - failed to import: the template already exists and you do not have privilege to override it');
					} else {
						console.log(' - template ' + name + ' imported');
					}
				}
				process.exit(0);
			});
		});
	} else {
		var loginPromise = serverUtils.loginToDevServer(server, request);

		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				return;
			}

			// upload the zip file
			var uploadPromise = serverUtils.uploadFileToServer(request, server, zipfile);

			uploadPromise.then(function (result) {
				var fileId = result && result.LocalData && result.LocalData.fFileGUID;
				var idcToken = result && result.LocalData && result.LocalData.idcToken;
				// console.log(' - file id ' + fileId + ' idcToken ' + idcToken);

				// import
				if (fileId && idcToken) {
					var importPromise = serverUtils.importTemplateToServer(request, server, fileId, idcToken);
					importPromise.then(function (importResult) {
						// console.log(importResult);
						if (importResult.err) {
							console.log(' - failed to import: ' + importResult.err);
						} else if (importResult.LocalData && importResult.LocalData.StatusCode !== '0') {
							console.log(' - failed to import: ' + importResult.LocalData.StatusMessage);
						} else if (importResult.LocalData && importResult.LocalData.ImportConflicts) {
							console.log(' - failed to import: the template already exists and you do not have privilege to override it');
						} else {
							console.log(' - template ' + name + ' imported');
						}
					});
				}
			});
		});
	}
};

/**
 * Private
 * List all files in a dir
 */
var getDirFiles = function (dir, filelist) {
	var files = fs.readdirSync(dir);
	filelist = filelist || [];
	files.forEach(function (file) {
		if (fs.statSync(path.join(dir, file)).isDirectory()) {
			filelist = getDirFiles(path.join(dir, file), filelist);
		} else {
			filelist.push(path.join(dir, file));
		}
	});
	return filelist;
};

/**
 * Private
 * Get files/folders from given path
 */
var getContents = function (path) {
	"use strict";
	var contents = fs.readdirSync(path);
	return contents;
};