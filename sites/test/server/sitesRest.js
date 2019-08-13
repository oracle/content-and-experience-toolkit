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
		// console.log(' - GET ' + url);
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

var _getResource = function (server, type, id, name, showError) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.log(' - get ' + url);

		url = url + '?links=none';
		var options = {
			url: server.url + url
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
				if (showError) {
					console.log('ERROR: failed to get ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' : ');
					console.log(error);
				}
				resolve({
					err: error
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				if (showError) {
					console.log('ERROR: failed to get ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' : ' + msg);
				}
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Get a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSite = function (args) {
	var server = args.server;
	return _getResource(server, 'sites', args.id, args.name, true);
};

/**
 * Get a template on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the template or
 * @param {string} name the name of the template
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTemplate = function (args) {
	var server = args.server;
	return _getResource(server, 'templates', args.id, args.name, true);
};

/**
 * Get a theme on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the theme or
 * @param {string} name the name of the theme
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTheme = function (args) {
	var server = args.server;
	return _getResource(server, 'themes', args.id, args.name, true);
};

/**
 * Get a component on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the component or
 * @param {string} name the name of the component
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getComponent = function (args) {
	var server = args.server;
	return _getResource(server, 'components', args.id, args.name, true);
};

/**
 * Check if a resource exists on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} type templates/sites/themes/components
 * @param {string} id the id of the resource or
 * @param {string} name the name of the resoruce
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.resourceExist = function (args) {
	var server = args.server;
	return _getResource(server, args.type, args.id, args.name, false);
};

var _exportResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/export';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
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
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to export ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' : ');
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 303) {
				var fileLocation = response.headers && response.headers.location;
				resolve({
					id: id,
					name: name,
					file: fileLocation
				});
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to export ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Export a component on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the component or
 * @param {string} name the name of the component
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportComponent = function (args) {
	var server = args.server;
	return _exportResource(server, 'components', args.id, args.name);
};
/**
 * Export a template on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the template or
 * @param {string} name the name of the template
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportTemplate = function (args) {
	var server = args.server;
	return _exportResource(server, 'templates', args.id, args.name);
};

var _publishResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/publish';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
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
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to publish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 303) {
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to publish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Publish a component on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the component or
 * @param {string} name the name of the component
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishComponent = function (args) {
	var server = args.server;
	return _publishResource(server, 'components', args.id, args.name);
};

var _softDeleteResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id
		} else if (name) {
			url = url + 'name:' + name;
		}

		console.log(' - delete ' + url);
		var options = {
			method: 'DELETE',
			url: server.url + url
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
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode < 300) {
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
var _hardDeleteResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/hardDelete';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
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
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode < 300) {
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Delete a template on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the template or
 * @param {string} name the name of the template
 * @param {boolean} hard a flag to indicate delete the template permanently
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteTemplate = function (args) {
	var server = args.server;
	return args.hard ? _hardDeleteResource(server, 'templates', args.id, args.name) : _softDeleteResource(server, 'templates', args.id, args.name);
};

var _importComponent = function (server, name, fileId) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/components';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			body: {
				file: fileId,
				conflicts: {
					'resolution': "overwrite"
				}
			},
			json: true
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
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to import component ' + name);
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve({
					name: name
				});
			} else {
				console.log(data.componentConflicts[0].conflicts);
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to import component ' + name + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Import a component on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} name the name of the component
 * @param {string} fileId the file id of the zip file
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importComponent = function (args) {
	var server = args.server;
	return _importComponent(server, args.name, args.fileId);
};

var _getBackgroundServiceJobStatus = function (server, url) {
	return new Promise(function (resolve, reject) {
		var options = {
			url: url + '?links=none'
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

		var endpoint = siteUtils.replaceAll(url, server.url);
		request(options, function (error, response, body) {

			if (error) {
				console.log('ERROR: failed to get status from ' + endpoint);
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to get status from ' + endpoint + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

var _createTemplateFromSite = function (server, name, siteName, exportPublishedAssets) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/' + 'name:' + siteName + '/templates';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Prefer: 'respond-async'
			},
			body: {
				name: name
			},
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers['Authorization'] = server.oauthtoken;
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create template ' + name + ' from site ' + siteName);
				console.log(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 202) {
				var statusLocation = response.headers && response.headers.location;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundServiceJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.err || !data.progress || data.progress === 'failed') {
							clearInterval(inter);
							console.log('ERROR: create template failed: ');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);

							return resolve(data.template);
						} else {
							console.log(' - creating template: percentage ' + data.completedPercentage);
						}
					});
				}, 5000);
			} else {
				var msg = data ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to create template ' + name + ' from site ' + siteName + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Create template from a site
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} name the name of the template
 * @param {string} siteName the name of the site
 * @param {boolean} exportPublishedAssets 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createTemplateFromSite = function (args) {
	var server = args.server;
	return _createTemplateFromSite(server, args.name, args.siteName, args.exportPublishedAssets);
};