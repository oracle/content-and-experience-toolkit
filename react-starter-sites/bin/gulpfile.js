/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	serverUtils = require('./serverUtils.js'),
	sitelib = require('./sitelib.js'),
	contentlib = require('./contentlib.js'),
	extract = require('extract-zip'),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	childProcess = require('child_process'),
	argv = require('yargs').argv;

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
 * Get files/folders from given path
 */
var getContents = function (path) {
	"use strict";
	var contents = fs.readdirSync(path);
	return contents;
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
 * Create all content types on the server
 */
gulp.task('list-server-content-types', function (done) {
	'use strict';

	var projectDir = argv.projectDir || path.join('./');

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}
	console.log(' - CEC config: ' + server.source);

	var typesPromise = serverUtils.getContentTypesFromServer(server);
	typesPromise.then(function (result) {
		var types = result && result.types || [];
		if (types && types.length > 0) {
			var byName = types.slice(0);
			byName.sort(function (a, b) {
				var x = a.name;
				var y = b.name;
				return (x < y ? -1 : x > y ? 1 : 0);
			});
			types = byName;
			console.log(' - Content types from ' + server.url + ':');
			for (var i = 0; i < types.length; i++) {
				if (types[i].name !== 'DigitalAsset') {
					console.log('   ' + types[i].name);
				}
			}
		} else {
			console.log(' - no content type on the server')
		}
		done();
	});

});

/**
 * Create all content types on the server
 */
gulp.task('list-server-channels', function (done) {
	'use strict';
	var projectDir = argv.projectDir || path.join('./');

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}
	console.log(' - CEC config: ' + server.source);

	var channelsPromise = serverUtils.getChannelsFromServer(server);
	channelsPromise.then(function (result) {
		// console.log(result);
		var channels = result && result.channels || [];
		if (channels.length === 0) {
			console.log(' - no channel on the server');
		} else {
			console.log(' - Channels:');
			console.log(sprintf('   %-40s %-34s', 'Name', 'Token'));
			channels.forEach(function (channel) {
				console.log(sprintf('   %-40s %-34s', channel.name, channel.token));
			});
		}
		done();
	});
});

/**
 * Create site
 * Unzip the zip file of the seeded site and place into the /src
 * Unzip the content into the site
 * Create components for content types
 */
gulp.task('create-site', function (done) {
	'use strict';

	sitelib.createSite(argv, done);
});

/**
 * Export content template from CEC server
 */
gulp.task('export-server-content', function (done) {
	'use strict';

	contentlib.exportServerContent(argv, done);
});

/**
 * Start development server. Watches files, rebuilds, and hot reloads if something changes
 */
gulp.task('develop', function (done) {
	'use strict';

	var projectDir = argv.projectDir || path.join('./');

	var packagefilepath = path.join(projectDir, 'package.json');
	if (!fs.existsSync(packagefilepath)) {
		console.log('ERROR: the current working directory does not contain a valid package.json');
		done();
		return;
	}

	// Verify it is a CEC starter site
	var packagefile = JSON.parse(fs.readFileSync(packagefilepath));
	var name = packagefile && packagefile.name;
	if (!name || name !== 'cec-startsite') {
		console.log('ERROR: cecss develop can only run for a CEC starter site');
		done();
		return;
	}

	var port = argv.port || 9090;
	var nodeServerPort = argv.nodeserverport || 8080;

	if (port === 8080 && nodeServerPort === 8080) {
		console.log('ERROR: port 8080 is reserved, choose a different one.');
		done();
		return;
	}

	if (port === nodeServerPort) {
		console.log('ERROR: cannot use the same port for both Webpack and Node server.');
		done();
		return;
	}

	process.env['CECSS_WEBPACK_PORT'] = port;
	process.env['CECSS_PORT'] = nodeServerPort;

	var args = ['run', 'dev', '--prefix', projectDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});

	console.log('*** access site at http://localhost:' + port);
	done();

});

/**
 * Build a starter site
 */
gulp.task('build', function (done) {
	'use strict';

	var projectDir = argv.projectDir || path.join('./');

	var packagefilepath = path.join(projectDir, 'package.json');
	if (!fs.existsSync(packagefilepath)) {
		console.log('ERROR: the current working directory does not contain a valid package.json');
		done();
		return;
	}

	// Verify it is a CEC starter site
	var packagefile = JSON.parse(fs.readFileSync(packagefilepath));
	var name = packagefile && packagefile.name;
	if (!name || name !== 'cec-startsite') {
		console.log('ERROR: cecss develop can only run for a CEC starter site');
		done();
		return;
	}

	var args = ['run', 'build', '--prefix', projectDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
});

/**
 * Serve previously build CEC starter site
 */
gulp.task('serve', function (done) {
	'use strict';

	var projectDir = argv.projectDir || path.join('./');

	var packagefilepath = path.join(projectDir, 'package.json');
	if (!fs.existsSync(packagefilepath)) {
		console.log('ERROR: the current working directory does not contain a valid package.json');
		done();
		return;
	}

	// Verify it is a CEC starter site
	var packagefile = JSON.parse(fs.readFileSync(packagefilepath));
	var name = packagefile && packagefile.name;
	if (!name || name !== 'cec-startsite') {
		console.log('ERROR: cecss develop can only run for a CEC starter site');
		done();
		return;
	}

	// make sure bundle is built
	var boundlefilepath = path.join(projectDir, 'src', 'bundle.js');
	if (!fs.existsSync(boundlefilepath)) {
		console.log('ERROR: the bundle file does not exist, run cecss build first');
		done();
		return;
	}

	var port = argv.port || '8080';
	process.env['CECSS_PORT'] = port;

	var args = ['run', 'start', '--prefix', projectDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
});

/**
 * Default task
 */
gulp.task('default', function (done) {
	'use strict';
	console.log("No default task!");
	done();
});