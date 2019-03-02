/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	serverUtils = require('../test/server/serverUtils.js'),
	contentlayoutlib = require('./contentlayout.js'),
	templatelib = require('./template.js'),
	sitelib = require('./site.js'),
	decompress = require('decompress'),
	extract = require('extract-zip'),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	childProcess = require('child_process'),
	argv = require('yargs').argv,
	replace = require('gulp-replace'),
	config = require('../config/config.json'),
	zip = require('gulp-zip');

var projectDir = path.join(__dirname, ".."),
	componentsDataDir = path.join(projectDir, 'data', 'components'),
	componentsSrcDir = path.join(projectDir, 'src', 'main', 'components'),
	componentsBuildDir = path.join(projectDir, 'src', 'build', 'components'),
	templatesDataDir = path.join(projectDir, 'data', 'templates'),
	templatesSrcDir = path.join(projectDir, 'src', 'main', 'templates'),
	templatesBuildDir = path.join(projectDir, 'src', 'build', 'templates'),
	themesSrcDir = path.join(projectDir, 'src', 'main', 'themes'),
	themesBuildDir = path.join(projectDir, 'src', 'build', 'themes');

/**
 * Private
 * Execute Gradle tasks via shell.
 * @param taskNames Array of gradle task names. Avoid tasks that might invoke gulp.
 * @param cb        Callback function of gulp task.
 */
var execGradle = function (taskNames, cb) {
	"use strict";

	var gradle = 'gradle';

	// Use Gradle Wrapper if found
	if (fs.existsSync(path.join(projectDir, 'gradlew'))) {
		gradle = path.join(projectDir, (/^win/.test(process.platform)) ? 'gradlew.bat' : './gradlew');
	}
	console.log(fs.existsSync(gradle));
	// Invoke Gradle
	var cmd = childProcess.spawn(gradle,
		Array.isArray(taskNames) ? taskNames : [taskNames], {
			cwd: projectDir,
			stdio: 'inherit'
		},
		function (code) {
			if (cb) {
				cb(code);
			}
		});

	console.log('Executing: ' + cmd.spawnargs.join(' '));
};

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
		const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
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
 * unzip component zip file and copy to /src
 */
var unzipComponent = function (compName, compPath, done) {

	// create dir in src
	var compSrcDir = path.join(componentsSrcDir, compName);
	console.log('The comp will be at ' + compSrcDir);
	if (fs.existsSync(compSrcDir)) {
		fse.removeSync(compSrcDir);
	}

	// unzip /src/main/components/<comp name>/
	decompress(compPath, componentsSrcDir).then(() => {
		console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
		done();
	});
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


/******************************* gulp tasks *******************************/
/**
 * Create component
 * Unzip the zip file of the seeded component and place into the /src
 */
gulp.task('create-component', function (done) {
	'use strict';
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
	if (serverUtils.updateItemFolderJson('component', compName)) {
		console.log(' *** component is ready to test: http://localhost:8085/components/' + compName);
		done();
	}
});

/**
 * Import component
 * Unzip the component zip file and place into the /src
 */
gulp.task('import-component', function (done) {
	'use strict';
	if (typeof argv.path !== 'string') {
		console.error('ERROR: please specify the component zip file');
		done();
		return;
	}
	var compPath = argv.path;
	if (!path.isAbsolute(compPath)) {
		compPath = path.join('..', compPath);
	}
	compPath = path.resolve(compPath);

	if (!fs.existsSync(compPath)) {
		console.log('ERROR: file ' + compPath + ' does not exist');
		done();
		return;
	}

	var compName = compPath.substring(compPath.lastIndexOf(path.sep) + 1).replace('.zip', '');
	console.log('Import Component: importing component name=' + compName + ' path=' + compPath);
	unzipComponent(compName, compPath, done);
});


/**
 * Create all content types on the server
 */
gulp.task('list-server-content-types', function (done) {
	'use strict';

	contentlayoutlib.listServerContentTypes(done);
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
 * describe template
 */
gulp.task('describe-template', function (done) {
	'use strict';

	templatelib.describeTemplate(argv, done);
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
	fse.removeSync('../src/build');

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

	var components = argv.component.split(',');
	var tasks = components.map(function (comp) {
		if (fs.existsSync(path.join(componentsSrcDir, comp))) {
			return gulp.src(`${componentsBuildDir}/${comp}/**/*`, {
					base: componentsBuildDir
				})
				.pipe(zip(`${comp}.zip`))
				.pipe(gulp.dest('../dist/'))
				.on('end', function () {
					console.log(` - created zip file ${comp}.zip`);
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
 * Deploy a single component
 */
gulp.task('deploy-component', function (done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
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
				});

			}); // login 
		} // dev server case
	}); // export
});

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

	var typeName = typeof argv.resourcetype !== 'string' ? 'all' : argv.resourcetype,
		listComponents = !typeName || typeName === 'all' || typeName.toLowerCase() === 'components',
		listTemplates = !typeName || typeName === 'all' || typeName.toLowerCase() === 'templates';

	if (!listComponents && !listTemplates) {
		// console.error('Usage: npm run list [components | templates]');
		console.log('ERROR: invalid resource type ' + typeName);
		done();
		return;
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

	done();
});

/**
 * Index site
 * Create content items with the keywords on site page and import the items to the server
 */
gulp.task('index-site', function (done) {
	'use strict';

	sitelib.indexSite(argv, done);
});

/**
 * Default task
 */
gulp.task('default', function () {
	'use strict';
	console.log("No default task!");
});