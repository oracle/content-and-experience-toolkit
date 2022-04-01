/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Utilities for files/folders
 */

var fs = require('fs'),
	fse = require('fs-extra'),
	extract = require('extract-zip');


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
			console.log('ERROR: failed to extract ' + filePath);
			console.log(e);
			err = 'err';
			return err;
		}
	}

	return _extract(filePath, targetPath);

};