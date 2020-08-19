/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */
var request = require('request'),
	os = require('os'),
	readline = require('readline'),
	siteUtils = require('./serverUtils');

var _getAuthorization = function (server) {
	return (server.tokentype || 'Bearer') + ' ' + server.oauthtoken;
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
				Authorization: _getAuthorization(server)
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

var _getResource = function (server, type, id, name, expand, showError) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.log(' - get ' + url);

		url = url + '?links=none';
		if (expand) {
			url = url + '&expand=' + expand;
		}
		var options = {
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
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
	return _getResource(server, 'sites', args.id, args.name, args.expand, true);
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
	return _getResource(server, 'templates', args.id, args.name, args.expand, true);
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
	return _getResource(server, 'themes', args.id, args.name, args.expand, true);
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
	return _getResource(server, 'components', args.id, args.name, args.expand, true);
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
	return _getResource(server, args.type, args.id, args.name, args.expand, false);
};

var _getSiteAccess = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access';
		console.log(' - get ' + url);

		url = url + '?links=none';

		var options = {
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to get site access ' + (id || name) + ' : ');
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
				resolve(data && data.items || []);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to get site access ' + (id || name) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Get a secure site's access on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSiteAccess = function (args) {
	var server = args.server;
	return _getSiteAccess(server, args.id, args.name);
};

var _removeSiteAccess = function (server, id, name, member) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access/' + member;
		console.log(' - delete ' + url);

		var options = {
			method: 'DELETE',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {

			if (error) {
				console.log('ERROR: failed to remove ' + member + ' from accessing site ' + (id || name) + ' : ');
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
			if (response && response.statusCode <= 300) {
				resolve(data);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to remove ' + member + ' from accessing site ' + (id || name) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Remove a user from a site's access list on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} member in the form of user:<user id>
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeSiteAccess = function (args) {
	var server = args.server;
	return _removeSiteAccess(server, args.id, args.name, args.member);
};

var _grantSiteAccess = function (server, id, name, member) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access';
		console.log(' - post ' + url);

		var options = {
			method: 'POST',
			url: server.url + url,
			body: {
				id: member
			},
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to grant ' + member + ' to access site ' + (id || name) + ' : ');
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
			if (response && response.statusCode <= 300) {
				resolve(data);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to grant ' + member + ' to access site ' + (id || name) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Grant a user access to a site server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} member in the form of user:<user id>
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.grantSiteAccess = function (args) {
	var server = args.server;
	return _grantSiteAccess(server, args.id, args.name, args.member);
};

var _setSiteRuntimeAccess = function (server, id, name, accessList) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.log(' - patch ' + url);

		var options = {
			method: 'PATCH',
			url: server.url + url,
			body: {
				security: {
					access: accessList
				}
			},
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to set runtime access for site ' + (id || name) + ' : ');
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
				resolve(data);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to set runtime access for site ' + (id || name) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Update site's access at runtime
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} access list of access level, valid values: cloud, visitors, service and named
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.setSiteRuntimeAccess = function (args) {
	var server = args.server;
	return _setSiteRuntimeAccess(server, args.id, args.name, args.accessList);
};

var _refreshSiteContent = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/refresh';
		console.log(' - post ' + url);

		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async'
			},
			url: server.url + url
		};

		if (server.env !== 'dev_ec') {
			options.headers.Authorization = _getAuthorization(server);
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to refresh pre-render cache for site ' + (name || id) + ' : ');
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
				var status = response.headers && response.headers.location;
				resolve({
					id: id,
					name: name,
					status: status
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to refresh pre-render cache for site ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Update site's access at runtime
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} access list of access level, valid values: cloud, visitors, service and named
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.refreshSiteContent = function (args) {
	return _refreshSiteContent(args.server, args.id, args.name);
};

var _exportResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
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
				Authorization: _getAuthorization(server)
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
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

var _publishResource = function (server, type, id, name, hideAPI) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/publish';
		if (!hideAPI) {
			console.log(' - post ' + url);
		}
		var options = {
			method: 'POST',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
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

	return _publishResource(server, 'components', args.id, args.name, args.hideAPI);
};

var _publishResourceAsync = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/publish';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async'
			},
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers.Authorization = _getAuthorization(server);

		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}
		// console.log(options);
		var resTitle = type.substring(0, type.length - 1);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' : ');
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
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.log('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' : ' + msg);
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);

							return resolve({});
						} else {
							console.log(' - publish in process: percentage ' + data.completedPercentage);
						}
					});
				}, 5000);
			} else {
				var msg = data && typeof data === 'object' ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Publish a theme on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the theme or
 * @param {string} name the name of the theme
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishTheme = function (args) {
	var server = args.server;
	return _publishResourceAsync(server, 'themes', args.id, args.name);
};

/**
 * Publish a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishSite = function (args) {
	var server = args.server;
	return _publishResourceAsync(server, 'sites', args.id, args.name);
};

var _unpublishResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/unpublish';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Unpublish a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unpublishSite = function (args) {
	var server = args.server;
	return _unpublishResource(server, 'sites', args.id, args.name);
};

var _unpublishResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/unpublish';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Unpublish a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unpublishSite = function (args) {
	var server = args.server;
	return _unpublishResource(server, 'sites', args.id, args.name);
};

var _setSiteOnlineStatus = function (server, id, name, status) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		var action = status === 'online' ? 'activate' : 'deactivate';
		url = url + '/' + action;

		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to ' + action + ' site ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to ' + action + ' site ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Activate a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.activateSite = function (args) {
	var server = args.server;
	return _setSiteOnlineStatus(server, args.id, args.name, 'online');
};

/**
 * Deactivate a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deactivateSite = function (args) {
	var server = args.server;
	return _setSiteOnlineStatus(server, args.id, args.name, 'offline');
};

var _validateSite = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/validate';

		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: _getAuthorization(server)
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
				console.log('ERROR: failed to validate site ' + (name || id) + ' : ');
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to validate site ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Validate a site on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.validateSite = function (args) {
	var server = args.server;
	return _validateSite(server, args.id, args.name);
};


var _softDeleteResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
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
				Authorization: _getAuthorization(server)
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
var _hardDeleteResource = function (server, type, id, name, showError) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
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
				Authorization: _getAuthorization(server)
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
				if (showError) {
					console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ');
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
			if (response && response.statusCode < 300) {
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				if (showError) {
					console.log('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg);
				}
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
	var showError = args.showError !== undefined ? args.showError : true;
	return args.hard ? _hardDeleteResource(server, 'templates', args.id, args.name, showError) : _softDeleteResource(server, 'templates', args.id, args.name);
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
				Authorization: _getAuthorization(server)
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

			// console.log(response.statusCode);
			if (response && response.statusCode >= 200 && response.statusCode <= 303) {
				var statusLocation = response.headers && response.headers.location;
				var itemId;
				if (statusLocation && statusLocation.indexOf('/') > 0) {
					itemId = statusLocation.substring(statusLocation.lastIndexOf('/') + 1);
					// console.log(' - component id: ' + itemId);
				}
				if (itemId) {
					_getResource(server, 'components', itemId).then(function (result) {
						if (!result || result.err || !result.name) {
							console.log('ERROR: failed to import component ' + name);
						} else {
							resolve({
								id: result.id,
								name: name,
								newName: result.name
							});
						}

					});
				} else {
					console.log('ERROR: failed to import component ' + name + ' : ' + response.statusMessage);
					resolve({
						err: 'err'
					});
				}
			} else {
				// console.log(data);
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				var owner = data && data.owner && data.owner.displayName || '';
				if (response.statusCode === 403 && owner) {
					msg = 'The component ' + name + ' is owned by ' + owner + ' and you do not have privileges to overwrite it.';
				}
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
				Authorization: _getAuthorization(server)
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to get status from ' + endpoint + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

var _createTemplateFromSite = function (server, name, siteName, includeUnpublishedAssets) {
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
				name: name,
				includeUnpublished: includeUnpublishedAssets
			},
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers.Authorization = _getAuthorization(server);
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
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.log('ERROR: create template failed: ' + msg);
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
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
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
	return _createTemplateFromSite(server, args.name, args.siteName, args.includeUnpublishedAssets);
};

var _importTemplate = function (server, name, fileId) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/templates';
		console.log(' - post ' + url);
		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async'
			},
			url: server.url + url,
			body: {
				file: fileId,
				template: {
					resolution: 'overwrite'
				},
				theme: {
					resolution: 'overwrite'
				},
				components: {
					resolution: 'overwrite'
				}
			},
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers.Authorization = _getAuthorization(server);
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}
		// console.log(JSON.stringify(options, null, 4));
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to import template ' + name);
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
				console.log(' - import template (job id: ' + statusLocation.substring(statusLocation.lastIndexOf('/') + 1) + ')');
				var startTime = new Date();
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundServiceJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							process.stdout.write(os.EOL);
							console.log(JSON.stringify(data, null, 4));
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.log('ERROR: import template failed: ' + msg);
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							process.stdout.write(os.EOL);
							return resolve(data.template);
						} else {
							process.stdout.write(' - importing template: percentage ' + data.completedPercentage +
								' [' + siteUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
						}
					});
				}, 5000);

			} else {
				var msg = response && (response.statusMessage || response.statusCode) ? (response.statusMessage || response.statusCode) : '';
				if (data) {
					msg = data.detail || data.title || msg;
					if (data.status || data['o:errorCode']) {
						msg = msg + ' (' + data.status + ' ' + data['o:errorCode'] + ')';
					}
				}
				console.log('ERROR: failed to import template ' + name + ' : ' + msg);
				if (data) {
					console.log(JSON.stringify(data, null, 4));
				}
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Import a template on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} name the name of the component
 * @param {string} fileId the file id of the zip file
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importTemplate = function (args) {
	var server = args.server;
	return _importTemplate(server, args.name, args.fileId);
};

var _createSite = function (server, name, description, sitePrefix, templateName, templateId, repositoryId, localizationPolicyId, defaultLanguage) {
	return new Promise(function (resolve, reject) {
		var request = siteUtils.getRequest();

		var url = '/sites/management/api/v1/sites';
		console.log(' - post ' + url);
		var body = {
			name: name,
			description: description || '',
			template: templateId
		};
		if (sitePrefix) {
			body.sitePrefix = sitePrefix;
		}
		if (repositoryId) {
			body.repository = repositoryId;
		}
		if (localizationPolicyId) {
			body.localizationPolicy = localizationPolicyId;
		}
		if (defaultLanguage) {
			body.defaultLanguage = defaultLanguage;
		}

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Prefer: 'respond-async'
			},
			body: body,
			json: true
		};
		if (server.env !== 'dev_ec') {
			options.headers.Authorization = _getAuthorization(server);
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create site ' + name + ' from template ' + templateName);
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
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.log('ERROR: create site failed: ' + msg);
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);

							return resolve({});
						} else {
							console.log(' - creating site: percentage ' + data.completedPercentage);
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to create site ' + name + ' from template ' + templateName + ' : ' + msg);
				resolve({
					err: msg || 'err'
				});
			}
		});
	});
};
/**
 * Create site from a template
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} server the server object
 * @param {string} name the name of the site
 * @param {string} templateName the name of the site
 * @param {boolean} exportPublishedAssets 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createSite = function (args) {
	var server = args.server;
	return _createSite(server, args.name, args.description, args.sitePrefix,
		args.templateName, args.templateId, args.repositoryId, args.localizationPolicyId, args.defaultLanguage);
};