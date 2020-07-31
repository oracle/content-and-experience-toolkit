/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */

/**
 * Utilities for files/folders
 */

var fs = require('fs'),
	fse = require('fs-extra');

module.exports.remove = function (srcPath) {
	try {
		if (srcPath && fs.existsSync(srcPath)) {
			var stat = fs.statSync(srcPath);
			if (stat.isFile()) {
				fs.unlinkSync(srcPath);
			} else if (stat.isDirectory()) {
				/* this works only for node 12+ */
				/*
				fs.rmdirSync(srcPath, {
					recursive: true
				});
				*/

				fse.removeSync(srcPath);
			} else if (stat.isSymbolicLink()) {
				fs.unlinkSync(srcPath);
			}
		}
	} catch (e) {
		console.log(e);
	}
};