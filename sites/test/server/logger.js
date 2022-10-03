/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Toolkit logger
 */

var _level;

var levels = ['info', 'warn', 'error', 'debug'];
var _setLevel = function (level) {
	if (!levels.includes(level)) {
		_level = 'info';
	} else {
		_level = level;
	}
	// console.log('*** set log level: ' + _level);
};

var _log = function (msg) {
	// always display
	console.log(msg);
};

var _debug = function (msg) {
	if (_level === 'debug') {
		console.log(msg);
	}
};

var _info = function (msg) {
	if (!_level || _level === 'info' || _level === 'debug') {
		console.info(msg);
	}
};

var _warn = function (msg) {
	if (_level && _level !== 'error') {
		console.warn(msg);
	}
};

var _error = function (msg) {
	// always display
	var d = new Date();
	console.error(msg + ' (' + d.toUTCString() + ')');
};

var _showInfo = function () {
	return _level === 'info';
};

module.exports.console = {
	showInfo: _showInfo,
	setLevel: _setLevel,
	log: _log,
	debug: _debug,
	info: _info,
	warn: _warn,
	error: _error
};