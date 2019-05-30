/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	os = require('os'),
	componentlib = require('./component.js'),
	contentlayoutlib = require('./contentlayout.js'),
	contentlib = require('./content.js'),
	rsslib = require('./rss.js'),
	templatelib = require('./template.js'),
	sitelib = require('./site.js'),
	siteUpdateLib = require('./siteUpdate.js'),
	siteIndexlib = require('./siteIndex.js'),
	siteMaplib = require('./siteMap.js'),
	themelib = require('./theme.js'),
	translationlib = require('./translation.js'),
	decompress = require('decompress'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	childProcess = require('child_process'),
	argv = require('yargs').argv,
	config = require('../config/config.json'),
	semver = require('semver'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var serverUtils = require('../test/server/serverUtils.js');

var cecDir = path.join(__dirname, ".."),
	configDataDir = path.join(cecDir, 'data', 'config'),
	componentsDataDir = path.join(cecDir, 'data', 'components');

var projectDir,
	buildDir,
	componentsSrcDir,
	componentsBuildDir,
	connectionsSrcDir,
	connectorsSrcDir,
	contentSrcDir,
	serversSrcDir,
	transSrcDir,
	templatesSrcDir;

// console.log('cecDir: ' + cecDir);

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

/**
 * Private
 * Convert a directory name to task name
 */
var sanitizeName = function (name) {
	'use strict';
	// Sanitize dirname to taskname
	let safeName = name.replace(/[^a-z0-9]/gi, '');
	let chars = Array.from(safeName);
	chars[0] = chars[0].toUpperCase();
	return chars.join('');
};

/**
 * Private
 * Optimize a component if needed
 */
var optimizeComponent = function (componentName) {
	'use strict';
	if (!componentName || typeof componentName !== 'string') {
		console.error('Error:  please specify the component name');
		return;
	}

	let compGulpFile = path.join(componentsSrcDir, componentName, 'gulpfile.js');
	if (fs.existsSync(compGulpFile)) {
		// Run 'gulp' under the components directory
		var compBuild = childProcess.spawnSync(npmCmd, ['run', 'gulp', compGulpFile], {
			stdio: 'inherit'
		});
		return compBuild.status;
	} else {
		console.log(`Optimization is not enabled for the component ${componentName}`);
		return 0;
	}
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

/**
 * private
 * create a component from the zip file fixing the GUID and component id
 * 
 */

var createComponent = function (componentZipName, compName, done) {

	// Create the directory
	var componentDir = path.join(componentsSrcDir, compName);
	fs.mkdirSync(componentDir);

	// Unzip the component and fix the id
	decompress(path.join(componentsDataDir, componentZipName), componentDir, {
		strip: 1
	}).then(() => {

		// Fix the component id
		var filepath = path.join(componentDir, 'appinfo.json');
		if (fs.existsSync(filepath)) {
			var appinfostr = fse.readFileSync(filepath),
				appinfojson = JSON.parse(appinfostr),
				oldId = appinfojson.id,
				newId = compName;
			appinfojson.id = newId;
			if (appinfojson.initialData) {
				appinfojson.initialData.componentId = newId;
			}
			console.log(' - update component Id ' + oldId + ' to ' + newId);
			fs.writeFileSync(filepath, JSON.stringify(appinfojson));
		}

		// Fix the component itemGUID
		filepath = path.join(componentDir, '/_folder.json');
		if (fs.existsSync(filepath)) {
			var folderstr = fse.readFileSync(filepath),
				folderjson = JSON.parse(folderstr),
				oldGUID = folderjson.itemGUID,
				newGUID = serverUtils.createGUID();
			folderjson.itemGUID = newGUID;
			console.log(' - update component GUID ' + oldGUID + ' to ' + newGUID);
			fs.writeFileSync(filepath, JSON.stringify(folderjson));
		}

		console.log(` - component ${compName} created at ${componentDir}`);
		console.log(`To rename the component, rename the directory ${componentDir}`);

		done();
	});
};


/**
 * Private
 * Utility check if a string ends with 
 */
var endsWith = function (str, end) {
	return str.lastIndexOf(end) === str.length - end.length;
};

/**
 * Private
 * Utility replace all occurrences of a string
 */
var replaceAll = function (str, search, replacement) {
	var re = new RegExp(search, 'g');
	return str.replace(re, replacement);
};

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function () {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	componentsSrcDir = path.join(srcfolder, 'components');
	templatesSrcDir = path.join(srcfolder, 'templates');
	connectorsSrcDir = path.join(srcfolder, 'connectors');
	connectionsSrcDir = path.join(srcfolder, 'connections');
	contentSrcDir = path.join(srcfolder, 'content');
	transSrcDir = path.join(srcfolder, 'translationJobs');
	serversSrcDir = path.join(srcfolder, 'servers');

	buildDir = serverUtils.getBuildFolder(projectDir);
	componentsBuildDir = path.join(buildDir, 'components');

	return true;
};

/******************************* gulp tasks *******************************/

/**
 * 
 */
gulp.task('install-src', function (done) {
	'use strict';

	projectDir = argv.projectDir || projectDir;

	// existing setup
	var currserver = serverUtils.getConfiguredServer();

	// create the config file
	var configPath = path.join(projectDir, 'cec.properties');
	var newConfig = false;
	if (!fs.existsSync(configPath)) {
		fse.copySync(path.join(configDataDir, 'cec.properties'), configPath);
		newConfig = true;
	}

	// create the default package.json
	if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
		fse.copySync(path.join(configDataDir, 'src-package.json'), path.join(projectDir, 'package.json'));
	}

	// create symlink to libs
	try {
		fse.ensureSymlinkSync(path.join(cecDir, 'src', 'libs'), path.join(projectDir, 'libs'));
	} catch (err) {
		console.error('ERROR: ' + err);
	}

	// read the config file 
	var srcFolder = path.join(projectDir, 'src');

	// set up src folders
	if (!fs.existsSync(srcFolder)) {
		fs.mkdirSync(srcFolder);
	}

	if (!fs.existsSync(path.join(srcFolder, 'components'))) {
		fs.mkdirSync(path.join(srcFolder, 'components'));
	}
	if (!fs.existsSync(path.join(srcFolder, 'templates'))) {
		fs.mkdirSync(path.join(srcFolder, 'templates'));
	}
	if (!fs.existsSync(path.join(srcFolder, 'themes'))) {
		fs.mkdirSync(path.join(srcFolder, 'themes'));
	}

	// ./dist/
	if (!fs.existsSync(path.join(projectDir, 'dist'))) {
		fs.mkdirSync(path.join(projectDir, 'dist'));
	}

	// set the server in config with existing settings
	if (newConfig && currserver.url) {
		// console.log(' - set CEC server with ' + currserver.fileloc);
		var configstr = fs.readFileSync(configPath).toString();
		configstr = configstr.replace('cec_url=', 'cec_url=' + currserver.url);
		configstr = configstr.replace('cec_username=', 'cec_username=' + currserver.username);
		configstr = configstr.replace('cec_password=', 'cec_password=' + currserver.password);
		configstr = configstr.replace('cec_env=', 'cec_env=' + currserver.env);
		fs.writeFileSync(configPath, configstr);
	}

	console.log('Project set up, config CEC server in ' + configPath);

	// install dependencies
	console.log('Install dependencies from package.json:');
	var installCmd = childProcess.spawnSync(npmCmd, ['install', '--prefix', projectDir], {
		projectDir,
		stdio: 'inherit'
	});

	var seedArgs = ['run', 'create-component', '--prefix', cecDir,
		'--',
		'--projectDir', projectDir,
		'--name', 'Sample-To-Do',
		'--source', 'Sample-To-Do'
	];
	var seedCmd = childProcess.spawnSync(npmCmd, seedArgs, {
		projectDir,
		stdio: 'inherit'
	});

	done();
});


gulp.task('develop', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var port = argv.port || '8085';
	process.env['CEC_TOOLKIT_PORT'] = port;
	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;

	var args = ['run', 'start', '--prefix', cecDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
});

/**
 * Create component
 * Unzip the zip file of the seeded component and place into the /src
 */
gulp.task('create-component', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
	}

	var srcCompName = argv.source,
		compName = argv.name,
		comp = '',
		seededComponents = getContents(componentsDataDir);

	if (!srcCompName && !compName) {
		console.error('ERROR: please run as npm run create-component -- --source <source component> --name <new component name>');
		done();
		return;
	}
	if (!srcCompName) {
		console.error('ERROR: please use --source to specify the source component zip');
		done();
		return;
	}
	if (!compName) {
		console.error('ERROR: please use --name to specify the new component name');
		done();
		return;
	}

	// verify the source component zip
	for (var i = 0; i < seededComponents.length; i++) {
		if (srcCompName + '.zip' === seededComponents[i]) {
			comp = seededComponents[i];
			break;
		}
	}
	if (!comp) {
		console.error('ERROR: invalid source component ' + srcCompName);
		done();
		return;
	}

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (compName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(componentsSrcDir + '/' + compName)) {
			console.error('ERROR: A component with the name ' + compName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	console.log('Create Component: creating new component ' + compName + ' from ' + srcCompName);
	createComponent(comp, compName, done);
});

/**
 * Copy component
 * Copy a component in /src
 */
gulp.task('copy-component', function (done) {
	'use strict';
	if (!verifyRun()) {
		done();
		return;
	}
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
	}

	var srcCompName = argv.source,
		compName = argv.name,
		comp = '',
		existingComponents = getContents(componentsSrcDir);

	if (!srcCompName && !compName) {
		console.error('ERROR: please run as npm run copy-component -- --source <source component> --name <new component name>');
		done();
		return;
	}
	if (!srcCompName) {
		console.error('ERROR: please use --source to specify the source component name');
		done();
		return;
	}
	if (!compName) {
		console.error('ERROR: please use --name to specify the new component name');
		done();
		return;
	}

	// verify the source component
	for (var i = 0; i < existingComponents.length; i++) {
		if (srcCompName === existingComponents[i]) {
			comp = existingComponents[i];
			break;
		}
	}
	if (!comp) {
		console.error('ERROR: invalid source component ' + srcCompName);
		done();
		return;
	}

	// verify the new template name 
	var re = /^[a-z0-9_-]+$/ig;
	if (compName.search(re) === -1) {
		console.error('ERROR: Use only letters, numbers, hyphens, and underscores in component names.');
		done();
		return;
	} else {
		if (fs.existsSync(path.join(componentsSrcDir, compName))) {
			console.error('ERROR: A component with the name ' + compName + ' already exists. Please specify a different name.');
			done();
			return;
		}
	}

	// copy all files
	fse.copySync(path.join(componentsSrcDir, srcCompName), path.join(componentsSrcDir, compName));

	// update itemGUID
	if (serverUtils.updateItemFolderJson(projectDir, 'component', compName)) {
		console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
		done();
	}
});

/**
 * Import component
 * Unzip the component zip file and place into the /src
 */
gulp.task('import-component', function (done) {
	componentlib.importComponent(argv, done);
});


/**
 * Create all content types on the server
 */
gulp.task('list-server-content-types', function (done) {
	'use strict';

	contentlayoutlib.listServerContentTypes(argv, done);
});

/**
 * Create content layout
 * Unzip the zip file of the seeded content layout and place into the /src
 */
gulp.task('create-contentlayout', function (done) {
	'use strict';

	contentlayoutlib.createContentLayout(argv, done);
});

/**
 * Add content layout mapping to a template
 */
gulp.task('add-contentlayout-mapping', function (done) {
	'use strict';

	contentlayoutlib.addContentLayoutMapping(argv, done);
});

/**
 * remove content layout mapping from a template
 */
gulp.task('remove-contentlayout-mapping', function (done) {
	'use strict';

	contentlayoutlib.removeContnetLayoutMapping(argv, done);
});

/**
 * Create template
 * Unzip the zip file of the seeded template and place into the /src
 */
gulp.task('create-template', function (done) {
	'use strict';

	templatelib.createTemplate(argv, done);
});

/**
 * Create template from a site
 */
gulp.task('create-template-from-site', function (done) {
	'use strict';

	templatelib.createTemplateFromSite(argv, done);
});

/**
 * Copy template
 * copy a template and its scheme and place into the /src
 */
gulp.task('copy-template', function (done) {
	'use strict';

	templatelib.copyTemplate(argv, done);
});

/**
 * Import template
 * Unzip the template zip file and place into the /src
 */
gulp.task('import-template', function (done) {
	'use strict';

	templatelib.importTemplate(argv, done);
});

/**
 * Export template
 * Create the template zip with its theme and components
 */
gulp.task('export-template', function (done) {
	'use strict';

	templatelib.exportTemplate(argv, done);
});

/**
 * deploy template
 */
gulp.task('deploy-template', function (done) {
	'use strict';

	templatelib.deployTemplate(argv, done);
});

/**
 * upload template
 */
gulp.task('upload-template', function (done) {
	'use strict';

	templatelib.deployTemplate(argv, done);
});

/**
 * describe template
 */
gulp.task('describe-template', function (done) {
	'use strict';

	templatelib.describeTemplate(argv, done);
});

/**
 * download template from server
 */
gulp.task('download-template', function (done) {
	'use strict';

	templatelib.downloadTemplate(argv, done);
});

/**
 * delete template on server
 */
gulp.task('delete-template', function (done) {
	'use strict';

	templatelib.deleteTemplate(argv, done);
});

/**
 * download content from server
 */
gulp.task('download-content', function (done) {
	'use strict';

	contentlib.downloadContent(argv, done);
});

/**
 * upload content to server
 */
gulp.task('upload-content', function (done) {
	'use strict';

	contentlib.uploadContent(argv, done);
});

/**
 * Control content (publish, unpublish, remove) on server
 */
gulp.task('control-content', function (done) {
	'use strict';

	contentlib.controlContent(argv, done);
});

/**
 * Add component to a theme
 */
gulp.task('add-theme-component', function (done) {
	'use strict';

	templatelib.addThemeComponent(argv, done);
});

/**
 * Remove component from a theme
 */
gulp.task('remove-theme-component', function (done) {
	'use strict';

	templatelib.removeThemeComponent(argv, done);
});

/**
 * Control theme
 */
gulp.task('control-theme', function (done) {
	'use strict';

	themelib.controlTheme(argv, done);
});

/**
 * Copy the all component source to dist folder
 */
gulp.task('dist-all', function () {
	'use strict';
	fse.removeSync('../src/build');

	// Copy the components to the build folder

	return gulp.src('../src/main/components/**')
		.pipe(gulp.dest('../src/build/components'));
});


/**
 * Copy one component source to build folder, optimize if needed.
 */
gulp.task('dist', function (done) {
	'use strict';

	if (fs.existsSync(buildDir)) {
		// console.log(' - clean up folder ' + buildDir);
		fse.removeSync(buildDir);
	}

	if (argv.component) {

		var components = argv.component.split(',');
		for (var i = 0; i < components.length; i++) {
			if (fs.existsSync(componentsSrcDir + '/' + components[i])) {
				console.log(` - copying ${components[i]} component `);
				// Copy the components to the build folder
				fse.copySync(path.join(componentsSrcDir, components[i]), path.join(componentsBuildDir, components[i]));
			}
		}
	}

	done();
});

/**
 * For each of these components, go to its directory and run gulp
 * The gulp file in the component should have a default task, which 
 * optimizes the source. If there is no gulpfile, return.
 */
gulp.task('optimize-all', gulp.series('dist-all', function (done) {
	"use strict";
	var dirNames = fs.readdirSync(componentsSrcDir);
	var componentsToOptimize = [];

	if (dirNames) {
		dirNames.forEach(function (name) {
			if (fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
				componentsToOptimize.push(name);
			}
		});
	}

	for (var i = 0; i < componentsToOptimize.length; i++) {
		const status = optimizeComponent(componentsToOptimize[i]);
		if (status !== 0) {
			console.log(`Optimizing ${componentsToOptimize[i]} failed.`);
			done();
			process.exit(1);
		} else {
			console.log(`Optimized ${componentsToOptimize[i]} successfully.`);

		}
	}
	console.log(`Success: Finished optimizing all components`);
	done();
}));

/**
 * Copy one component source to build folder, optimize if needed.
 */
gulp.task('optimize', function (done) {
	'use strict';

	if (argv.component) {
		var components = argv.component.split(',');
		for (var i = 0; i < components.length; i++) {
			if (fs.existsSync(path.join(componentsSrcDir, components[i]))) {
				console.log(` - optimizing component ${components[i]}`);
				optimizeComponent(components[i]);
			}
		}
	}
	done();
});

/**
 * Deploy all components
 */
gulp.task('deploy-all', function (cb) {
	'use strict';
	// execGradle(['deployAll'], cb);
	console.log('deploy-all has been deprecated, please use deploy to deply individual component.');
});

/**
 * Create a component zip file
 */
gulp.task('create-component-zip', function (done) {
	'use strict';

	var destDir = path.join(projectDir, 'dist');
	var components = argv.component.split(',');
	var tasks = components.map(function (comp) {
		if (fs.existsSync(path.join(componentsSrcDir, comp))) {
			return gulp.src(`${componentsBuildDir}/${comp}/**/*`, {
					base: componentsBuildDir
				})
				.pipe(zip(`${comp}.zip`))
				.pipe(gulp.dest(destDir))
				.on('end', function () {
					var zippath = path.join(destDir, comp + '.zip');
					console.log(' - created zip file ' + zippath);
					done();
				});
		}
	});
	return tasks;
});

/**
 * Export a component zip
 */
gulp.task('export-component', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
	}

	if (!argv.component || typeof argv.component !== 'string') {
		console.error('Usage: npm run export-component <componentName>');
		done();
		return;
	} else {
		var components = argv.component.split(',');
		var validCompNum = 0;
		for (var i = 0; i < components.length; i++) {
			if (!fs.existsSync(path.join(componentsSrcDir, components[i]))) {
				console.error(`Error: Component ${components[i]} doesn't exist`);
			} else {
				validCompNum += 1;
			}
		}

		if (validCompNum > 0) {
			var exportSeries = gulp.series('dist', 'optimize', 'create-component-zip');
			exportSeries(function () {
				done();
			});
		} else {
			done();
		}
	}
});

/**
 * Download components
 */
gulp.task('download-component', function (done) {
	componentlib.downloadComponent(argv, done);
});


/**
 * Deploy components
 */
gulp.task('deploy-component', function (done) {
	_deployComponent(argv, done);
});

/**
 * Upload components
 */
gulp.task('upload-component', function (done) {
	_deployComponent(argv, done);
});

/**
 * Control components
 */
gulp.task('control-component', function (done) {
	componentlib.controlComponent(argv, done);
});

var _deployComponent = function (argv, done) {
	'use strict';
	if (!verifyRun()) {
		done();
		return;
	}
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
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
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		done();
		return;
	}

	if (!argv.component || typeof argv.component !== 'string') {
		console.error('Usage: npm run deploy <componentName>');
		done();
		return;
	}

	var publish = typeof argv.publish === 'string' && argv.publish.toLowerCase() === 'true';

	var folder = argv.folder && argv.folder.toString();
	if (folder === '/') {
		folder = '';
	} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
		console.log('ERROR: invalid folder');
		done();
		return;
	}

	// Support a list of components
	var components = argv.component.split(',');
	var allComps = [];

	for (var i = 0; i < components.length; i++) {
		if (!fs.existsSync(path.join(componentsSrcDir, components[i]))) {
			console.error(`Error: Component ${components[i]} doesn't exist`);
		} else {
			allComps.push(components[i]);
		}
	}
	if (allComps.length === 0) {
		done();
		return;
	}

	// Remove invalid component
	argv.component = allComps.join();

	var exportTask = gulp.series('export-component');
	exportTask(function () {

		if (server.env === 'pod_ec') {
			var loginPromise = serverUtils.loginToPODServer(server);

			loginPromise.then(function (result) {
				if (!result.status) {
					console.log(' - failed to connect to the server');
					done();
					return;
				}

				var imports = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";
					imports.push({
						name: name,
						zipfile: zipfile
					});
				}

				var importPromise = serverUtils.importToPODServer(server, 'component', folder, imports, publish);
				importPromise.then(function (importResult) {
					// result is processed in the API
					done();
					process.exit(0);
				});
			});
		} else {
			var request = require('request');
			request = request.defaults({
				jar: true,
				proxy: null
			});

			var loginPromise = serverUtils.loginToDevServer(server, request);

			loginPromise.then(function (result) {
				if (!result.status) {
					console.log(' - failed to connect to the server');
					done();
					return;
				}

				var importsPromise = [];
				for (var i = 0; i < allComps.length; i++) {
					var name = allComps[i];
					var zipfile = path.join(projectDir, "dist", name) + ".zip";

					importsPromise[i] = _deployOneComponentToDevServer(request, server, folder, zipfile, name, publish);
				}
				Promise.all(importsPromise).then(function (values) {
					// All done
					done();
					process.exit(0);
				});

			}); // login 
		} // dev server case
	}); // export
};

var _deployOneComponentToDevServer = function (request, server, folder, zipfile, name, publish) {
	var deployOneCompPromise = new Promise(function (resolve, reject) {
		// upload the zip file
		var uploadPromise = serverUtils.uploadFileToServer(request, server, folder, zipfile);

		uploadPromise.then(function (result) {
			if (result.err) {
				return resolve({});
			}

			var fileId = result && result.LocalData && result.LocalData.fFileGUID;
			var idcToken = result && result.LocalData && result.LocalData.idcToken;
			// console.log(' - name ' + name + ' file id ' + fileId + ' idcToken ' + idcToken);

			// import
			var importPromise = serverUtils.importComponentToServer(request, server, fileId, idcToken);
			importPromise.then(function (importResult) {
				// console.log(JSON.stringify(importResult));
				if (importResult.err) {
					console.log(' - failed to import: ' + importResult.err);
					return resolve({});
				} else {
					if (!importResult.LocalData || importResult.LocalData.StatusCode !== '0') {
						console.log(' - failed to import: ' + importResult.LocalData ? importResult.LocalData.StatusMessage : '');
						return resolve({});
					}

					console.log(' - component ' + name + ' imported');
					var compFolderId = serverUtils.getComponentAttribute(importResult, 'fFolderGUID');
					if (publish && compFolderId) {
						// publish the component
						var publishPromise = serverUtils.publishComponentOnServer(request, server, compFolderId, idcToken);
						publishPromise.then(function (publishResult) {
							// console.log(publishResult);
							if (publishResult.err) {
								console.log(' - failed to publish: ' + publishResult.err);
							} else if (!publishResult.LocalData || publishResult.LocalData.StatusCode !== '0') {
								console.log(' - failed to publish: ' + publishResult.LocalData ? publishResult.LocalData.StatusMessage : '');
							} else {
								console.log(' - component ' + name + ' published/republished');
							}
							return resolve({});
						});
					} else {
						return resolve({});
					}
				}
			}); // import
		}); // upload
	});

	return deployOneCompPromise;
};

/**
 * Copy the configured libraries from node_modules into library folder
 */
gulp.task('copy-libs', function (done) {
	'use strict';
	if (config && config.build && config.build.libs && config.build.libs.length > 0) {
		const libs = config.build.libs;
		const paths = libs.map((lib) => '../node_modules/' + lib + '/**/*');

		// Rename @oracle/oraclejet to oraclejet
		libs[libs.findIndex(element => element === '@oracle/oraclejet')] = 'oraclejet';

		// Rename @oracle/oraclejet/node_modules/jquery-ui to jquery-ui
		libs[libs.findIndex(element => element === '@oracle/oraclejet/node_modules/jquery-ui')] = 'jquery-ui';

		// Rename @webcomponents/custom-elements to custom-elements
		libs[libs.findIndex(element => element === '@webcomponents/custom-elements')] = 'custom-elements';

		// Rename @fortawesome/fontawesome-free to font-awesome
		libs[libs.findIndex(element => element === '@fortawesome/fontawesome-free')] = 'font-awesome';

		paths.forEach((path, index) => {
			console.log("Copying... " + path);
			gulp.src(path).pipe(gulp.dest('../src/libs/' + libs[index] + '/'));
		});
	}
	console.log("\nTo use the CEC command line util, run the following command:");
	if (/^darwin/.test(process.platform)) {
		console.log("\t sudo npm run install-cec \n");
	} else {
		console.log("\t npm run install-cec \n");
	}
	done();
});


/**
 * List resources such as templates and components
 */
gulp.task('list', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}
	if (!fs.existsSync(componentsSrcDir)) {
		console.log('ERROR: folder ' + componentsSrcDir + ' does not exist. Check your configuration');
		return false;
	}

	var typeName = typeof argv.resourcetype !== 'string' ? 'all' : argv.resourcetype,
		listComponents = !typeName || typeName === 'all' || typeName.toLowerCase() === 'components',
		listTemplates = !typeName || typeName === 'all' || typeName.toLowerCase() === 'templates';

	if (!listComponents && !listTemplates) {
		// console.error('Usage: npm run list [components | templates]');
		console.log('ERROR: invalid resource type ' + typeName);
		done();
		return;
	}

	// 
	// Servers
	//
	console.log('Servers:');
	var serverNames = fs.existsSync(serversSrcDir) ? fs.readdirSync(serversSrcDir) : [];
	if (serverNames) {
		var format = '    %-20s %-s';
		serverNames.forEach(function (name) {
			if (fs.existsSync(path.join(serversSrcDir, name, 'server.json'))) {
				var serverinfo = fs.readFileSync(path.join(serversSrcDir, name, 'server.json'));
				var serverinfojson = JSON.parse(serverinfo);
				console.log(sprintf(format, name, serverinfojson.url));
			}
		});
	}

	// console.log('list components: ' + listComponents + ' list templates: ' + listTemplates);
	if (listComponents) {
		console.log('Components: ');
		var compNames = fs.readdirSync(componentsSrcDir);
		if (compNames) {
			compNames.forEach(function (name) {
				if (fs.existsSync(path.join(componentsSrcDir, name, 'appinfo.json'))) {
					console.log('    ' + name);
				}
			});
		}
	}

	if (listTemplates) {
		console.log('Templates: ');
		var tempNames = fs.readdirSync(templatesSrcDir);
		if (tempNames) {
			tempNames.forEach(function (name) {
				if (fs.existsSync(path.join(templatesSrcDir, name, 'siteinfo.json'))) {
					console.log('    ' + name);
				}
			});
		}
	}

	//
	// Content
	//
	console.log('Content:');
	var contentNames = fs.existsSync(contentSrcDir) ? fs.readdirSync(contentSrcDir) : [];
	if (contentNames) {
		contentNames.forEach(function (name) {
			if (fs.existsSync(path.join(contentSrcDir, name, 'contentexport'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation connectors:');
	var connectorNames = fs.existsSync(connectorsSrcDir) ? fs.readdirSync(connectorsSrcDir) : [];
	if (connectorNames) {
		connectorNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectorsSrcDir, name, 'package.json'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation connections:');
	var connectionNames = fs.existsSync(connectionsSrcDir) ? fs.readdirSync(connectionsSrcDir) : [];
	if (connectionNames) {
		connectionNames.forEach(function (name) {
			if (fs.existsSync(path.join(connectionsSrcDir, name, 'connection.json'))) {
				console.log('    ' + name);
			}
		});
	}

	console.log('Translation jobs:');
	var jobNames = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	if (jobNames) {
		jobNames.forEach(function (name) {
			if (fs.existsSync(path.join(transSrcDir, name, 'site')) || fs.existsSync(path.join(transSrcDir, name, 'job.json'))) {
				console.log('    ' + name);
			}
		});
	}

	done();
});

/**
 * Create enterprise site
 */
gulp.task('create-site', function (done) {
	'use strict';

	sitelib.createSite(argv, done);
});

/**
 * Control site
 */
gulp.task('control-site', function (done) {
	'use strict';

	sitelib.controlSite(argv, done);
});


/**
 * update site
 */
gulp.task('update-site', function (done) {
	'use strict';

	siteUpdateLib.updateSite(argv, done);
});

/**
 * Validate site
 */
gulp.task('validate-site', function (done) {
	'use strict';

	sitelib.validateSite(argv, done);
});

/**
 * Index site
 * Create content items with the keywords on site page and import the items to the server
 */
gulp.task('index-site', function (done) {
	'use strict';

	siteIndexlib.indexSite(argv, done);
});

/**
 * Create site map
 * Create XML site map for a site and upload it to the server
 */
gulp.task('create-site-map', function (done) {
	'use strict';

	siteMaplib.createSiteMap(argv, done);
});

/**
 * Create RSS feed
 * Create RSS feed for a site and upload it to the server
 */
gulp.task('create-rss-feed', function (done) {
	'use strict';

	rsslib.createRSSFeed(argv, done);
});

/**
 * Download a translation job from the server
 */
gulp.task('download-translation-job', function (done) {
	'use strict';

	translationlib.downloadTranslationJob(argv, done);
});

/**
 * Import a translation job to the server
 */
gulp.task('upload-translation-job', function (done) {
	'use strict';

	translationlib.uploadTranslationJob(argv, done);
});

/**
 * List local or server translation jobs
 */
gulp.task('list-translation-jobs', function (done) {
	'use strict';

	translationlib.listTranslationJobs(argv, done);
});

/**
 * Create a translation job on the server
 */
gulp.task('create-translation-job', function (done) {
	'use strict';

	translationlib.createTranslationJob(argv, done);
});

/**
 * Submit translation job to LSP server
 */
gulp.task('submit-translation-job', function (done) {
	'use strict';

	translationlib.submitTranslationJob(argv, done);
});

/**
 * Ingest translatedjob 
 */
gulp.task('ingest-translation-job', function (done) {
	'use strict';

	translationlib.ingestTranslationJob(argv, done);
});


/**
 * Register translation connector
 */
gulp.task('register-translation-connector', function (done) {
	'use strict';

	translationlib.registerTranslationConnector(argv, done);
});

/**
 * Create translation connector
 */
gulp.task('create-translation-connector', function (done) {
	'use strict';

	translationlib.createTranslationConnector(argv, done);
});

/**
 * Start translation connector
 */
gulp.task('start-translation-connector', function (done) {
	'use strict';

	translationlib.startTranslationConnector(argv, done);
});

gulp.task('check-version', function (done) {
	'use strict';

	// check if the message already shown 
	var msgFile = path.join(os.tmpdir(), 'cec_sitestoolkit_message');
	if (fs.existsSync(msgFile)) {
		var statInfo = fs.statSync(msgFile);
		var lastModifiedTime = statInfo.mtimeMs;
		var currTime = (new Date()).getTime();
		var oneDay = 1000 * 60 * 60 * 24;
		var diffDays = Math.round((currTime - lastModifiedTime) / oneDay);
		// console.log(' - file ' + msgFile + ' last updated on ' + statInfo.mtime + ' days passed: ' + diffDays);
		// warn every 30 days :-)
		if (diffDays < 30) {
			return;
		}
	}

	projectDir = argv.projectDir || projectDir;

	var server = serverUtils.getConfiguredServer(projectDir);
	if (!server.url || !server.username || !server.password) {
		// console.log(' - no server is configured in ' + server.fileloc);
		return;
	}

	var Client = require('node-rest-client').Client;
	var client = new Client({
		user: server.username,
		password: server.password
	});

	var isPod = server.env === 'pod_ec';
	var url = server.url + (isPod ? '/content' : '/osn/social/api/v1/connections');
	client.get(url, function (data, response) {
		if (!response || response.statusCode !== 200) {
			console.log('ERROR: failed to query CEC version: ' + (response && response.statusMessage));
			return;
		}
		var cecVersion, cecVersion2;
		if (isPod) {
			cecVersion = data ? data.toString() : '';
			if (!cecVersion) {
				console.log('ERROR: no value returned for CEC version');
				return;
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
				console.log('ERROR: no value returned for CEC version');
				return;
			}
			var arr = cecVersion.split('.');
			cecVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');
		}
		// console.log(' CEC server: ' + server.url + '  version: ' + cecVersion + ' version2: ' + cecVersion2);

		// get the toolkit version
		var packagejsonpath = path.join(cecDir, 'package.json');
		var toolkitVersion;
		if (fs.existsSync(packagejsonpath)) {
			var str = fs.readFileSync(packagejsonpath);
			var packagejson = JSON.parse(str);
			toolkitVersion = packagejson && packagejson.version;
		}

		if (!toolkitVersion) {
			//console.log('ERROR: version found in ' + packagejsonpath);
			return;
		}
		arr = toolkitVersion.split('.');
		var toolkitVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');
		// console.log('toolkit version ' + packagejsonpath + ' version: ' + toolkitVersion + ' version2: ' + toolkitVersion2);

		if (cecVersion2 && toolkitVersion2 && semver.gt(semver.coerce(cecVersion2), semver.coerce(toolkitVersion2))) {
			var format = '%-1s %-50s  %-s';
			var sep = '*';
			console.log('');
			console.log('*******************************************************');
			console.log(sprintf(format, sep, 'A newer version of Sites Toolkit CLI is available.', sep));
			console.log(sprintf(format, sep, 'You are using ' + toolkitVersion + '. The latest is ' + cecVersion + '.', sep));
			console.log(sprintf(format, sep, 'Your current version will be deprecated soon.', sep));
			console.log('*******************************************************');

			// create the message file
			fs.writeFileSync(msgFile, 'CEC version: ' + cecVersion + ', toolkit version: ' + toolkitVersion + ', need upgrade.');
		}

		done();
	});
});

/**
 * Register server
 */
gulp.task('register-server', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var name = argv.name;
	var endpoint = argv.endpoint;
	var user = argv.user;
	var password = argv.password;
	var type = argv.type || 'pod_ec';
	var idcs_url = argv.idcsurl;
	var client_id = argv.clientid;
	var client_secret = argv.clientsecret;
	var scope = argv.scope;

	if (!fs.existsSync(serversSrcDir)) {
		fs.mkdirSync(serversSrcDir);
	}

	var serverPath = path.join(serversSrcDir, name);
	if (!fs.existsSync(serverPath)) {
		fs.mkdirSync(serverPath);
	}
	var serverFile = path.join(serverPath, 'server.json');
	// Use the same fields as serverUtils.getConfiguredServer
	var serverjson = {
		name: name,
		url: endpoint,
		username: user,
		password: password,
		env: type,
		idcs_url: idcs_url,
		client_id: client_id,
		client_secret: client_secret,
		scope: scope
	}
	fs.writeFileSync(serverFile, JSON.stringify(serverjson));
	console.log(' - server registered in ' + serverFile);
	done();
});

/**
 * Default task
 */
gulp.task('default', function () {
	'use strict';
	console.log("No default task!");
});