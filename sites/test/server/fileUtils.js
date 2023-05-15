/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Utilities for files/folders
 */

var fs = require('fs'),
	extract = require('extract-zip');

var console = require('./logger.js').console;

module.exports.remove = function (srcPath) {
	try {
		if (srcPath && fs.existsSync(srcPath)) {
			var stat = fs.statSync(srcPath);
			if (stat.isFile()) {
				fs.unlinkSync(srcPath);
			} else if (stat.isDirectory()) {
				fs.rmSync(srcPath, { recursive: true, force: true });
			} else if (stat.isSymbolicLink()) {
				fs.unlinkSync(srcPath);
			}
		}
	} catch (e) {
		console.error(e);
	}
};

module.exports.copy = function (srcPath, destPath) {
	try {
		fs.cpSync(srcPath, destPath, { force: true, recursive: true });
	} catch (e) {
		console.error(e);
	}
};

module.exports.extractZip = function (filePath, targetPath) {

	async function _extract(filePath, targetPath) {
		var err;
		try {
			// console.log(' - extract ' + filePath + ' to ' + targetPath);
			await extract(filePath, {
				dir: targetPath
			});
			// console.log(' - extraction complete');
			return err;
		} catch (e) {
			console.error('ERROR: failed to extract ' + filePath);
			console.error(e);
			err = 'err';
			return err;
		}
	}

	return _extract(filePath, targetPath);

};