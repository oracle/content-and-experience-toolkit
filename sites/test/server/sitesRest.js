/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */
var request = require('request'),
	siteUtils = require('./serverUtils');

var _utils = {
	getServer: function (currPath, registeredServerName) {
		return registeredServerName ? siteUtils.getRegisteredServer(currPath, registeredServerName) : siteUtils.getConfiguredServer(currPath);
	}
};

var _getResources = function (server, type, expand) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = server.url + '/sites/management/api/v1/' + type + '?links=none&orderBy=name';
		if (expand) {
			url = url + '&expand=' + expand + '&expansionErrors=ignore';
		}

		var options = {
			url: url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: server.oauthtoken
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get ' + type + ':');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items || [];
				resolve(items);
			} else {
				console.log('ERROR: failed to get ' + type + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
};

/**
 * Get all templates on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTemplates = function (args) {
	var server = args.server;
	return _getResources(server, 'templates', args.expand);
};


/**
 * Get all components on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getComponents = function (args) {
	var server = args.server;
	return _getResources(server, 'components');
};

/**
 * Get all sites on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSites = function (args) {
	var server = args.server;
	return _getResources(server, 'sites', args.expand);
};
