/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var gulp = require('gulp'),
	os = require('os'),
	assetlib = require('./asset.js'),
	componentlib = require('./component.js'),
	contentlayoutlib = require('./contentlayout.js'),
	contentlib = require('./content.js'),
	doclib = require('./document.js'),
	grouplib = require('./group.js'),
	reportlib = require('./report.js'),
	readline = require('readline'),
	resourcelib = require('./resource.js'),
	rsslib = require('./rss.js'),
	templatelib = require('./template.js'),
	sitelib = require('./site.js'),
	siteUpdateLib = require('./siteUpdate.js'),
	siteIndexlib = require('./siteIndex.js'),
	siteMaplib = require('./siteMap.js'),
	sitePlanlib = require('./sitePlan.js'),
	taxonomylib = require('./taxonomy.js'),
	themelib = require('./theme.js'),
	translationlib = require('./translation.js'),
	recommendationlib = require('./recommendation.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	childProcess = require('child_process'),
	argv = require('yargs').argv,
	config = require('../config/config.json'),
	semver = require('semver'),
	sprintf = require('sprintf-js').sprintf;

var serverUtils = require('../test/server/serverUtils.js');

var console = require('../test/server/logger.js').console;

var cecDir = path.join(__dirname, ".."),
	configDataDir = path.join(cecDir, 'data', 'config'),
	buildDataDir = path.join(cecDir, 'data', 'build'),
	testDataDir = path.join(cecDir, 'data', 'test');

var projectDir,
	serversSrcDir;

// console.log('cecDir: ' + cecDir);

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';


/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function () {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

// read logger level
var _readLoggerLevel = function (projectDir) {
	serverUtils.readLoggerLevel(projectDir);
};

/******************************* gulp tasks *******************************/

/**
 * 
 */
gulp.task('install-src', function (done) {
	'use strict';

	var nodeVersion = process.version;
	console.log('Node version ' + nodeVersion);
	var version0 = nodeVersion.split('.')[0];
	if (version0.startsWith('v')) {
		version0 = version0.substring(1);
	}
	if (version0 < 10) {
		console.log('ERROR: requires Node version 10 or above, please upgrade');
		done();
		return;
	}

	projectDir = argv.projectDir || projectDir;

	// existing setup
	var currserver = serverUtils.getConfiguredServer();

	// create the config file
	var configPath = path.join(projectDir, 'cec.properties');
	var newConfig = false;
	if (!fs.existsSync(configPath)) {
		fs.copyFileSync(path.join(configDataDir, 'cec.properties'), configPath);
		newConfig = true;
	}

	// create the default package.json
	if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
		fse.copySync(path.join(configDataDir, 'src-package.json'), path.join(projectDir, 'package.json'));
	}
	if (!fs.existsSync(path.join(projectDir, 'gulpfile.js'))) {
		fse.copySync(path.join(buildDataDir, 'src-gulpfile.js'), path.join(projectDir, 'gulpfile.js'));
	}

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

	// ./dist/ & ./test/
	if (!fs.existsSync(path.join(projectDir, 'dist'))) {
		fs.mkdirSync(path.join(projectDir, 'dist'));
	}
	if (!fs.existsSync(path.join(projectDir, 'test'))) {
		fse.copySync(testDataDir, path.join(projectDir, 'test'));
	}

	// ./samples/ 
	if (!fs.existsSync(path.join(projectDir, 'samples'))) {
		fs.mkdirSync(path.join(projectDir, 'samples'));
	}
	if (!fs.existsSync(path.join(projectDir, 'samples', 'compile_site.sh'))) {
		fse.copySync(path.join(configDataDir, 'src-compile_site.sh'), path.join(projectDir, 'samples', 'compile_site.sh'));
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

	console.log('Project set up, config OEC server in ' + configPath);

	// install dependencies
	console.log('Install dependencies from package.json:');
	var installCmd = childProcess.spawnSync(npmCmd, ['install', '--prefix', projectDir, projectDir, '--no-bin-links'], {
		projectDir,
		stdio: 'inherit'
	});
	var dependenciesInstalled = true;
	if (!fs.existsSync(path.join(projectDir, 'node_modules')) || !fs.existsSync(path.join(projectDir, 'node_modules', 'mustache'))) {
		dependenciesInstalled = false;
		if (!fs.existsSync(path.join(projectDir, 'node_modules'))) {
			fs.mkdirSync(path.join(projectDir, 'node_modules'));
		}
	}

	// copy over libs 

	var libsPath = path.join(cecDir, 'src', 'libs');
	var items = fs.readdirSync(libsPath);
	// console.log(items);
	items.forEach(function (item) {
		var destPath = path.join(projectDir, 'node_modules', item);
		if (!fs.existsSync(destPath)) {
			fs.mkdirSync(destPath);
			fse.copySync(path.join(libsPath, item), destPath);
			// console.log('Copy ' + item);
		}
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

	if (!dependenciesInstalled) {
		console.log('');
		console.log('Dependencies not installed, please run \'npm install\'');
	}

	process.exitCode = 0;
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
	process.env['CEC_TOOLKIT_SERVER'] = argv.server || '';
	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;

	var args = argv.debug ? ['run', '--node-options', '--inspect', 'start', '--prefix', cecDir] : ['run', 'start', '--prefix', cecDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
});

gulp.task('sync-server', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var srcServerName = argv.server;
	if (!fs.existsSync(path.join(serversSrcDir, srcServerName, 'server.json'))) {
		console.log('ERROR: source server ' + srcServerName + ' does not exist');
		done();
		return;
	}

	var destServerName = argv.destination;
	if (!fs.existsSync(path.join(serversSrcDir, destServerName, 'server.json'))) {
		console.log('ERROR: destination server ' + destServerName + ' does not exist');
		done();
		return;
	}

	var port = argv.port || '8086';
	process.env.CEC_TOOLKIT_SYNC_PORT = port;
	process.env.CEC_TOOLKIT_SYNC_SRC = srcServerName;
	process.env.CEC_TOOLKIT_SYNC_DEST = destServerName;
	process.env.CEC_TOOLKIT_PROJECTDIR = projectDir;
	process.env.CEC_TOOLKIT_SYNC_HTTPS_KEY = '';
	process.env.CEC_TOOLKIT_SYNC_HTTPS_CERTIFICATE = '';

	process.env.CEC_TOOLKIT_SYNC_UPDATEITEMONLY = typeof argv.updateitemonly === 'string' && argv.updateitemonly.toLowerCase() === 'true';

	var keyPath = argv.key;
	if (keyPath) {
		if (!path.isAbsolute(keyPath)) {
			keyPath = path.join(projectDir, keyPath);
		}
		keyPath = path.resolve(keyPath);
		if (!fs.existsSync(keyPath)) {
			console.log('ERROR: file ' + keyPath + ' does not exist');
			done();
			return;
		}
		process.env.CEC_TOOLKIT_SYNC_HTTPS_KEY = keyPath;
	}

	var certPath = argv.certificate;
	if (certPath) {
		if (!path.isAbsolute(certPath)) {
			certPath = path.join(projectDir, certPath);
		}
		certPath = path.resolve(certPath);
		if (!fs.existsSync(certPath)) {
			console.log('ERROR: file ' + certPath + ' does not exist');
			done();
			return;
		}
		process.env.CEC_TOOLKIT_SYNC_HTTPS_CERTIFICATE = certPath;
	}

	var authMethod = argv.authorization || 'basic';
	process.env.CEC_TOOLKIT_SYNC_AUTH = authMethod;

	var args = ['run', 'start-sync', '--prefix', cecDir];
	var spawnCmd;

	if (authMethod === 'basic') {
		var rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		rl._writeToOutput = function _writeToOutput(stringToWrite) {
			if (rl.stdoutMuted) {
				var str = stringToWrite.replace(/(\r\n|\n|\r)/gm, '').trim();
				if (str) {
					rl.output.write("*");
				}
			} else {
				rl.output.write(stringToWrite);
			}
		};

		var username = argv.username || '';
		var password = argv.password || '';

		var usernamePromises = [];
		if (!username) {
			usernamePromises.push(_promptInput(rl, 'Please enter username: '));
		}
		Promise.all(usernamePromises)
			.then(function (results) {
				if (!username) {
					username = results[0].value;
					if (!username) {
						console.log('ERROR: username is empty');
						return Promise.reject();
					}
				}

				var passwordPromises = [];
				if (!password) {
					rl.stdoutMuted = true;
					passwordPromises.push(_promptInput(rl, 'Please enter password: '));
				}

				return Promise.all(passwordPromises);
			})
			.then(function (results) {
				if (!password) {
					password = results[0].value;
					if (!password) {
						console.log('ERROR: password is empty');
						return Promise.reject();
					}
					console.log('');
				}

				rl.stdoutMuted = false;
				rl.close();

				process.env.CEC_TOOLKIT_SYNC_USERNAME = username;
				process.env.CEC_TOOLKIT_SYNC_PASSWORD = password;

				spawnCmd = childProcess.spawnSync(npmCmd, args, {
					projectDir,
					stdio: 'inherit'
				});

				done();
			})
			.catch((error) => {
				rl.stdoutMuted = false;
				rl.close();
				done();
			});
	} else if (authMethod === 'header') {
		process.env.CEC_TOOLKIT_SYNC_AUTH_HEADER = argv.values;

		spawnCmd = childProcess.spawnSync(npmCmd, args, {
			projectDir,
			stdio: 'inherit'
		});
	} else {
		// none
		spawnCmd = childProcess.spawnSync(npmCmd, args, {
			projectDir,
			stdio: 'inherit'
		});
	}

});

gulp.task('webhook-server', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var srcServerName = argv.server;
	if (!fs.existsSync(path.join(serversSrcDir, srcServerName, 'server.json'))) {
		console.log('ERROR: server ' + srcServerName + ' does not exist');
		done();
		return;
	}


	var port = argv.port || '8087';
	process.env.CEC_TOOLKIT_WEBHOOK_PORT = port;
	process.env.CEC_TOOLKIT_WEBHOOK_SERVER = srcServerName;
	process.env.CEC_TOOLKIT_WEBHOOK_CONTENTTYPE = argv.contenttype;
	process.env.CEC_TOOLKIT_WEBHOOK_DETAILPAGE = argv.detailpage;
	process.env.CEC_TOOLKIT_PROJECTDIR = projectDir;

	var args = ['run', 'start-webhook', '--prefix', cecDir];
	var spawnCmd;

	spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});

});

gulp.task('compilation-server', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var port = argv.port || '8087';
	var useShellScript = typeof argv.shellscript === 'boolean' ? argv.shellscript : argv.shellscript === 'true';

	process.env['CEC_TOOLKIT_COMPILATION_PORT'] = port;
	process.env['CEC_TOOLKIT_COMPILATION_USE_SHELL_SCRIPT'] = useShellScript.toString();
	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;
	process.env['CEC_TOOLKIT_COMPILATION_SINGLE_RUN'] = argv.onceonly || false;

	var compilationLogsDir = argv.logs;
	if (compilationLogsDir) {
		if (!path.isAbsolute(compilationLogsDir)) {
			compilationLogsDir = path.join(projectDir, compilationLogsDir);
		}
		compilationLogsDir = path.resolve(compilationLogsDir);
		if (!fs.existsSync(compilationLogsDir)) {
			try {
				fs.mkdirSync(compilationLogsDir);
			} catch (err) {
				console.log('ERROR: Failed to create logs directory. REASON:', err.message);
				done();
				return;
			}
		}

		process.env['CEC_TOOLKIT_COMPILATION_LOGS_DIR'] = compilationLogsDir;
	}

	var compilationJobsDir = argv.jobs;
	if (compilationJobsDir) {
		if (!path.isAbsolute(compilationJobsDir)) {
			compilationJobsDir = path.join(projectDir, compilationJobsDir);
		}
		compilationJobsDir = path.resolve(compilationJobsDir);
		if (!fs.existsSync(compilationJobsDir)) {
			console.log('ERROR:', compilationJobsDir, 'directory does not exist for jobs directory.');
			done();
			return;
		}

		process.env['CEC_TOOLKIT_COMPILATION_JOBS_DIR'] = compilationJobsDir;
	}

	var compilationTimeout = argv.timeout;
	if (compilationTimeout) {
		process.env['CEC_TOOLKIT_COMPILATION_COMPILE_STEP_TIMEOUT'] = compilationTimeout;
	}

	process.env['CEC_TOOLKIT_COMPILATION_HTTPS_KEY'] = '';
	process.env['CEC_TOOLKIT_COMPILATION_HTTPS_CERTIFICATE'] = '';

	var keyPath = argv.key;
	if (keyPath) {
		if (!path.isAbsolute(keyPath)) {
			keyPath = path.join(projectDir, keyPath);
		}
		keyPath = path.resolve(keyPath);
		if (!fs.existsSync(keyPath)) {
			console.log('ERROR: file ' + keyPath + ' does not exist');
			done();
			return;
		}
		process.env['CEC_TOOLKIT_COMPILATION_HTTPS_KEY'] = keyPath;
	}

	var certPath = argv.certificate;
	if (certPath) {
		if (!path.isAbsolute(certPath)) {
			certPath = path.join(projectDir, certPath);
		}
		certPath = path.resolve(certPath);
		if (!fs.existsSync(certPath)) {
			console.log('ERROR: file ' + certPath + ' does not exist');
			done();
			return;
		}
		process.env['CEC_TOOLKIT_COMPILATION_HTTPS_CERTIFICATE'] = certPath;
	}

	var args = ['run', 'start-compilation', '--prefix', cecDir];

	childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});

	done();
});

var _promptInput = function (rl, question) {
	return new Promise((resolve, reject) => {
		console.log(question);
		rl.question('', (answer) => {
			resolve({
				value: answer
			});
		});
	});
};

var _getExitCode = function (value) {
	var exitCode = 0;
	if (value === undefined || !value) {
		exitCode = 1;
	} else if (typeof value === 'number') {
		exitCode = value;
	}
	// console.log('value: ' + value + ' exitCode: ' + exitCode);
	return exitCode;
};

/**
 * Create folder
 */
gulp.task('create-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.createFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy folder
 */
gulp.task('copy-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.copyFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Share folder
 */
gulp.task('share-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.shareFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare folder
 */
gulp.task('unshare-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.unshareFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List folder
 */
gulp.task('list-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.listFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Download folder
 */
gulp.task('download-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.downloadFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload folder
 */
gulp.task('upload-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.uploadFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete folder
 */
gulp.task('delete-folder', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.deleteFolder(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy file
 */
gulp.task('copy-file', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.copyFile(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload file
 */
gulp.task('upload-file', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.uploadFile(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download file
 */
gulp.task('download-file', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.downloadFile(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete file
 */
gulp.task('delete-file', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.deleteFile(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe file
 */
gulp.task('describe-file', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	doclib.describeFile(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create component
 * Unzip the zip file of the seeded component and place into the /src
 */
gulp.task('create-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.createComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy component
 * Copy a component in /src
 */
gulp.task('copy-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.copyComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Import component
 * Unzip the component zip file and place into the /src
 */
gulp.task('import-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.importComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share component
 */
gulp.task('share-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.shareComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare component
 */
gulp.task('unshare-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.unshareComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe component
 */
gulp.task('describe-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.describeComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create all content types on the server
 */
gulp.task('list-server-content-types', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.listServerContentTypes(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create content layout
 * Unzip the zip file of the seeded content layout and place into the /src
 */
gulp.task('create-contentlayout', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlayoutlib.createContentLayout(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Add content layout mapping to a local template or a type on OCM server
 */
gulp.task('add-contentlayout-mapping', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	if (argv.server) {
		contentlayoutlib.addContentLayoutMappingServer(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	} else {
		contentlayoutlib.addContentLayoutMapping(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	}
});

/**
 * remove content layout mapping from a local template or a type on OCM server
 */
gulp.task('remove-contentlayout-mapping', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	if (argv.server) {
		contentlayoutlib.removeContentLayoutMappingServer(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	} else {
		contentlayoutlib.removeContentLayoutMapping(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	}
});

/**
 * Add field editor to a content type field in a template
 */
gulp.task('add-field-editor', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlayoutlib.addFieldEditor(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Remove field editor from a content type field in a template
 */
gulp.task('remove-field-editor', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlayoutlib.removeFieldEditor(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Create template
 * Unzip the zip file of the seeded template and place into the /src
 */
gulp.task('create-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.createTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create template from a site
 */
gulp.task('create-template-from-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.createTemplateFromSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy template
 * copy a template and its scheme and place into the /src
 */
gulp.task('copy-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.copyTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Import template
 * Unzip the template zip file and place into the /src
 */
gulp.task('import-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.importTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Export template
 * Create the template zip with its theme and components
 */
gulp.task('export-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.exportTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * deploy template
 */
gulp.task('deploy-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.deployTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * upload template
 */
gulp.task('upload-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.deployTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * describe template
 */
gulp.task('describe-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.describeTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * create template report
 */
gulp.task('create-template-report', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	reportlib.createTemplateReport(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * cleanup template
 */
gulp.task('cleanup-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	reportlib.cleanupTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * download template from server
 */
gulp.task('download-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.downloadTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Compile template
 * compile a template and place compiles pages under the sites assets
 */
gulp.task('compile-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.compileTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Compile site
 * download a site to a local template, compile it and upload the compiled pages to the site
 */
gulp.task('compile-site', function (done) {
	'use strict';
	projectDir = argv.projectDir;

	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;
	_readLoggerLevel(argv.projectDir);
	sitelib.compileSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Compile content
 * compile content items and place compiles pages under the content assets
 */
gulp.task('compile-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.compileContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload compiled content to server
 */
gulp.task('upload-compiled-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.uploadCompiledContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * delete template on server
 */
gulp.task('delete-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.deleteTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share template
 */
gulp.task('share-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.shareTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare template
 */
gulp.task('unshare-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.unshareTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * rename asset ids
 */
gulp.task('update-template', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	if (argv.action === 'rename-asset-id') {
		assetlib.renameAssetIds(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	} else {
		console.log('ERRRO: ' + argv.action + ' is not supported');
		process.exitCode = 1;
		done();
	}
});

/**
 * download content from server
 */
gulp.task('download-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.downloadContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * upload content to server
 */
gulp.task('upload-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.uploadContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * control content to server
 */
gulp.task('control-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.controlContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * tranfer content from one OCM server to another
 */
gulp.task('transfer-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.transferContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * tranfer image renditions from one OCM server to another (internal)
 */
gulp.task('transfer-rendition', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.transferRendition(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * upload content to server
 */
gulp.task('validate-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.validateContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete assets on server
 */
gulp.task('delete-assets', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.deleteAssets(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create digital asset
 */
gulp.task('create-digital-asset', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.createDigitalAsset(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Update digital asset
 */
gulp.task('update-digital-asset', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.updateDigitalAsset(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy assets to another repository
 */
gulp.task('copy-assets', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.copyAssets(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload content from a server to another
 */
gulp.task('migrate-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.migrateContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * sync channel content on destination server from source server
 */
gulp.task('sync-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.syncContent(argv, done);
});

/**
 * download taxonomy from server
 */
gulp.task('download-taxonomy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	taxonomylib.downloadTaxonomy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * upload taxonomy to server
 */
gulp.task('upload-taxonomy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	taxonomylib.uploadTaxonomy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * control taxonomy on server
 */
gulp.task('control-taxonomy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	taxonomylib.controlTaxonomy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * update taxonomy on server
 */
 gulp.task('update-taxonomy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	taxonomylib.updateTaxonomy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * describe taxonomy on server
 */
gulp.task('describe-taxonomy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	taxonomylib.describeTaxonomy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Add component to a theme
 */
gulp.task('add-theme-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.addThemeComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Remove component from a theme
 */
gulp.task('remove-theme-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	templatelib.removeThemeComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy theme
 */
gulp.task('copy-theme', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	themelib.copyTheme(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Control theme
 */
gulp.task('control-theme', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	themelib.controlTheme(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share theme
 */
gulp.task('share-theme', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	themelib.shareTheme(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare theme
 */
gulp.task('unshare-theme', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	themelib.unshareTheme(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * describe theme
 */
gulp.task('describe-theme', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	themelib.describeTheme(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Export a component zip
 */
gulp.task('export-component', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	componentlib.exportComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download components
 */
gulp.task('download-component', function (done) {
	_readLoggerLevel(argv.projectDir);
	componentlib.downloadComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Deploy components
 */
gulp.task('deploy-component', function (done) {
	_readLoggerLevel(argv.projectDir);
	componentlib.deployComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload components
 */
gulp.task('upload-component', function (done) {
	_readLoggerLevel(argv.projectDir);
	componentlib.deployComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Control components
 */
gulp.task('control-component', function (done) {
	_readLoggerLevel(argv.projectDir);
	componentlib.controlComponent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * download recommendation from server
 */
gulp.task('download-recommendation', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	recommendationlib.downloadRecommendation(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * upload recommendation to server
 */
gulp.task('upload-recommendation', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	recommendationlib.uploadRecommendation(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Perform action on recommendation to server
 */
gulp.task('control-recommendation', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	recommendationlib.controlRecommendation(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy the configured libraries from node_modules into library folder
 */
gulp.task('copy-libs', function (done) {
	'use strict';
	var cec_path;
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
	console.log("\nTo use the CEC command line util, add the following directory to your PATH:\n");
	cec_path = path.resolve(__dirname + path.sep + '..');
	console.log('\t' + path.join(cec_path, 'node_modules', '.bin') + os.EOL);
	done();
});


/**
 * List resources such as templates and components
 */
gulp.task('list', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	if (argv.server) {
		resourcelib.listServerResources(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	} else {
		resourcelib.listLocalResources(argv, function (success) {
			process.exitCode = _getExitCode(success);
			done();
		});
	}
});

/**
 * List properties of a background job
 */
gulp.task('describe-background-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.describeBackgroundJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Rename content type
 */
gulp.task('rename-content-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.renameContentType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create enterprise site
 */
gulp.task('create-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.createSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy enterprise site
 */
gulp.task('copy-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.copySite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Transfer enterprise site
 */
gulp.task('transfer-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.transferSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create transfer enterprise site content scripts
 */
gulp.task('transfer-site-content', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	contentlib.transferSiteContent(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create non-MLS enterprise site
 */
gulp.task('migrate-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.migrateSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Control site
 */
gulp.task('control-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.controlSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share site
 */
gulp.task('share-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.shareSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare site
 */
gulp.task('unshare-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.unshareSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete site
 */
gulp.task('delete-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.deleteSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe site
 */
gulp.task('describe-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.describeSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Get site security
 */
gulp.task('get-site-security', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.getSiteSecurity(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Set site security
 */
gulp.task('set-site-security', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.setSiteSecurity(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * update site
 */
gulp.task('update-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	siteUpdateLib.updateSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * export site
 */
gulp.task('export-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.exportSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * import site
 */
gulp.task('import-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.importSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Cancel export job
 */
 gulp.task('cancel-export-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.cancelExportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Cancel import job
 */
 gulp.task('cancel-import-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.cancelImportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete export job
 */
 gulp.task('delete-export-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.deleteExportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete import job
 */
 gulp.task('delete-import-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.deleteImportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List export jobs
 */
 gulp.task('list-export-jobs', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.listExportJobs(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe export job
 */
 gulp.task('describe-export-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.describeExportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List export jobs
 */
 gulp.task('list-import-jobs', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.listImportJobs(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe import job
 */
 gulp.task('describe-import-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.describeImportJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Validate site
 */
gulp.task('validate-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.validateSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Index site
 * Create content items with the keywords on site page and import the items to the server
 */
gulp.task('index-site', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	siteIndexlib.indexSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create site map
 * Create XML site map for a site and upload it to the server
 */
gulp.task('create-site-map', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	siteMaplib.createSiteMap(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create RSS feed
 * Create RSS feed for a site and upload it to the server
 */
gulp.task('create-rss-feed', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	rsslib.createRSSFeed(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Generate asset usage report for a site 
 */
gulp.task('create-asset-report', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	reportlib.createAssetReport(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload static files to a site on CEC server
 */
gulp.task('upload-static-site-files', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.uploadStaticSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Refresh pre-render cache for a site on CEC server
 */
gulp.task('refresh-prerender-cache', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.refreshPrerenderCache(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download static files from a site on CEC server
 */
gulp.task('download-static-site-files', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.downloadStaticSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete static files from a site on CEC server
 */
gulp.task('delete-static-site-files', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.deleteStaticSite(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Create site plan
 */
gulp.task('create-site-plan', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitePlanlib.createSitePlan(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create a repository
 */
gulp.task('create-repository', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.createRepository(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Control a repository (add/remove types/channels)
 */
gulp.task('control-repository', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.controlRepository(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share a repository
 */
gulp.task('share-repository', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.shareRepository(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare a repository
 */
gulp.task('unshare-repository', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.unShareRepository(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List repository properties
 */
gulp.task('describe-repository', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeRepository(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Set Editorial Permissions
 */
gulp.task('set-editorial-permission', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.setEditorialPermission(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List Editorial Permissions
 */
gulp.task('list-editorial-permission', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.listEditorialPermission(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List Editorial Roles
 */
gulp.task('list-editorial-roles', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.listEditorialRole(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create an Editorial Role
 */
gulp.task('create-editorial-role', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.createEditorialRole(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Set editorial permission for an Editorial Role
 */
gulp.task('set-editorial-role', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.setEditorialRole(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete an Editorial Role
 */
gulp.task('delete-editorial-role', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.deleteEditorialRole(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share a type
 */
gulp.task('share-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.shareType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare a type
 */
gulp.task('unshare-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.unshareType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download types
 */
gulp.task('download-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.downloadType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload types
 */
gulp.task('upload-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.uploadType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Copy a type
 */
gulp.task('copy-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.copyType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Update type
 */
gulp.task('update-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	if (argv.action === 'add-content-form') {
		if (argv.server) {
			contentlayoutlib.addContentFormServer(argv, function (success) {
				process.exitCode = _getExitCode(success);
				done();
			});
		} else {
			contentlayoutlib.addContentForm(argv, function (success) {
				process.exitCode = _getExitCode(success);
				done();
			});
		}

	} else if (argv.action === 'remove-content-form') {
		if (argv.server) {
			contentlayoutlib.removeContentFormServer(argv, function (success) {
				process.exitCode = _getExitCode(success);
				done();
			});
		} else {
			contentlayoutlib.removeContentForm(argv, function (success) {
				process.exitCode = _getExitCode(success);
				done();
			});
		}

	} else {
		console.log('ERRRO: ' + argv.action + ' is not supported');
		process.exitCode = 1;
		done();
	}
});

/**
 * Describe an asset type
 */
gulp.task('describe-type', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeType(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Describe a workflow
 */
gulp.task('describe-workflow', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeWorkflow(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create MS word template
 * 2021-08-20 removed
gulp.task('create-word-template', function (done) {
	'use strict';

	assetlib.createMSWordTemplate(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});
*/

/**
 * Create content item
 * 2021-08-20 removed
gulp.task('create-content-item', function (done) {
	'use strict';

	assetlib.createContentItem(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});
*/

/**
 * Create a collection
 */
gulp.task('create-collection', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.createCollection(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Perform action on a collection
 */
gulp.task('control-collection', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.controlCollection(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create a channel
 */
gulp.task('create-channel', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.createChannel(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Share a channel
 */
gulp.task('share-channel', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.shareChannel(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Unshare a channel
 */
gulp.task('unshare-channel', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.unshareChannel(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe a channel
 */
gulp.task('describe-channel', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeChannel(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create a localization policy
 */
gulp.task('create-localization-policy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.createLocalizationPolicy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download localization policies
 */
gulp.task('download-localization-policy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.downloadLocalizationPolicy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Upload localization policies
 */
gulp.task('upload-localization-policy', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.uploadLocalizationPolicy(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List assets on server
 */
gulp.task('list-assets', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.listAssets(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Describe an asset on server
 */
gulp.task('describe-asset', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeAsset(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Validate assets on server
 */
gulp.task('validate-assets', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	sitelib.validateAssets(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create asset report on server
 */
gulp.task('create-asset-usage-report', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	reportlib.createAssetUsageReport(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download a translation job from the server
 */
gulp.task('download-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.downloadTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Import a translation job to the server
 */
gulp.task('upload-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.uploadTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List local or server translation jobs
 */
gulp.task('list-translation-jobs', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.listTranslationJobs(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create a translation job on the server
 */
gulp.task('create-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.createTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Submit translation job to LSP server
 */
gulp.task('submit-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.submitTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * refresh translation job from LSP server
 */
gulp.task('refresh-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.refreshTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Ingest translatedjob 
 */
gulp.task('ingest-translation-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.ingestTranslationJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});


/**
 * Register translation connector
 */
gulp.task('register-translation-connector', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.registerTranslationConnector(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create translation connector
 */
gulp.task('create-translation-connector', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.createTranslationConnector(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Start translation connector
 */
gulp.task('start-translation-connector', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	translationlib.startTranslationConnector(argv, done);
});

/**
 * List properties of a scheduled publish job
 */
gulp.task('describe-scheduled-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.describeScheduledJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List scheduled publish jobs
 */
gulp.task('list-scheduled-jobs', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.listScheduledJobs(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * List publishing jobs
 */
gulp.task('list-publishing-jobs', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.listPublishingJobs(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Download publishing job log
 */
gulp.task('download-job-log', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.downloadJobLog(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Update rendition job
 */
 gulp.task('update-rendition-job', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	assetlib.updateRenditionJob(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Create group
 */
gulp.task('create-group', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	grouplib.createGroup(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Delete group
 */
gulp.task('delete-group', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	grouplib.deleteGroup(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Add member to group
 */
gulp.task('add-member-to-group', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	grouplib.addMemberToGroup(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Remove member from group
 */
gulp.task('remove-member-from-group', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	grouplib.removeMemberFromGroup(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Execute GET
 */
gulp.task('execute-get', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.executeGet(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Execute POST
 */
gulp.task('execute-post', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.executePost(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Execute PUT
 */
gulp.task('execute-put', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.executePut(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Execute PATCH
 */
gulp.task('execute-patch', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.executePatch(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Execute DELETE
 */
gulp.task('execute-delete', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.executeDelete(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

gulp.task('check-version', function (done) {
	'use strict';

	// check if the message already shown 
	var msgFile = path.join(os.tmpdir(), 'cec_sitestoolkit_message');
	// console.log(msgFile);

	if (fs.existsSync(msgFile)) {
		var statInfo = fs.statSync(msgFile);
		var lastModifiedTime = statInfo.mtimeMs;
		var currTime = (new Date()).getTime();
		var oneDay = 1000 * 60 * 60 * 24;
		var diffDays = Math.round((currTime - lastModifiedTime) / oneDay);
		// console.log(' - file ' + msgFile + ' last updated on ' + statInfo.mtime + ' days passed: ' + diffDays);
		// warn every 14 days :-)
		if (diffDays < 14) {
			done();
			return;
		}
	}

	projectDir = argv.projectDir || projectDir;

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir, false);
	if (!server || !server.valid) {
		done();
		return;
	}

	var url = server.url + '/osn/social/api/v1/connections';
	var options = {
		method: 'GET',
		url: url,
		headers: {
			Authorization: serverUtils.getRequestAuthorization(server)
		}
	};
	// console.log(options);

	var request = require('../test/server/requestUtils.js').request;
	request.get(options, function (error, response, body) {
		if (error || !response || response.statusCode !== 200) {
			// console.log('ERROR: failed to query  version: ' + (response && response.statusMessage));
			done();
			return;
		}

		var data;
		try {
			data = JSON.parse(body);
		} catch (e) {
			data = body;
		}
		// console.log(data);

		var cecVersion, cecVersion2;
		var arr;

		cecVersion = data && data.version;
		if (!cecVersion) {
			// console.log('ERROR: no value returned for CEC version');
			done();
			return;
		}
		arr = cecVersion.split('.');
		cecVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');

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
			done();
			return;
		}
		arr = toolkitVersion.split('.');
		var toolkitVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');
		// console.log(' toolkit version ' + packagejsonpath + ' version: ' + toolkitVersion + ' version2: ' + toolkitVersion2);

		if (cecVersion2 && toolkitVersion2 && semver.valid(semver.coerce(cecVersion2)) && semver.gt(semver.coerce(cecVersion2), semver.coerce(toolkitVersion2))) {
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
gulp.task('create-encryption-key', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.createEncryptionKey(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Register server
 */
gulp.task('register-server', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.registerServer(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Set OAuth token
 */
gulp.task('set-oauth-token', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.setOAuthToken(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Refresh OAuth token
 */
gulp.task('refresh-oauth-token', function (done) {
	'use strict';
	_readLoggerLevel(argv.projectDir);
	resourcelib.refreshOAuthToken(argv, function (success) {
		process.exitCode = _getExitCode(success);
		done();
	});
});

/**
 * Set logger level
 */
gulp.task('set-logger-level', function (done) {
	'use strict';
	projectDir = argv.projectDir || projectDir;
	var srcFolder = path.join(projectDir, 'src');

	// set up src folders
	if (!fs.existsSync(srcFolder)) {
		fs.mkdirSync(srcFolder);
	}

	if (!fs.existsSync(path.join(srcFolder, 'logger'))) {
		fs.mkdirSync(path.join(srcFolder, 'logger'));
	}

	var loggerjson = {
		level: argv.level
	};
	fs.writeFileSync(path.join(srcFolder, 'logger', 'logger.json'), JSON.stringify(loggerjson));
	console.log(' - logger level set to ' + argv.level);

	process.exitCode = 0;
	done();

});

/**
 * Default task
 */
gulp.task('default', function () {
	'use strict';
	console.log("No default task!");
});