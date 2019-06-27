/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	fse = require('fs-extra'),
	fs = require('fs'),
	decompress = require('decompress');

// These files have been moved. 
// These old copies can be removed.
const toRemove = ['../config.json',
	'../gulpfile.js',
	'../lib/scs-starter-component.zip',
	'../lib/scs-test-site.zip',
	'../server.js',
	'../src/main/components/Sample-To-Do/assets/css',
	'../src/test',
	'../src/main/templates/StarterTemplate/componentsused.json'
];

gulp.task("default", () => {
	'use strict';
	toRemove.forEach((item) => {
		fse.remove(item)
			.then(() => console.log(`Fixing ${item}`))
			.catch(err => console.log(err));
	});

	// If gulpfile.js exists for Sample-Text-With-Image, replace it with the one from source zip file.
	// It has the correct path for libraries.
	if (fs.existsSync('../src/main/components/Sample-Text-With-Image/gulpfile.js')) {
		decompress('../data/components/Sample-Text-With-Image.zip', '../src/main/components/Sample-Text-With-Image', {
			filter: file => file.path === 'gulpfile.js'
		}).then(files => {
			console.log("Fixing ../src/main/components/Sample-Text-With-Image/gulpfile.js : " + files[0].path);
		});
	} else {
		console.log('Sample-Text-With-Image does not exist, so its gulpfile fix is not needed');
	}
});
