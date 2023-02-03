/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var os = require('os'),
	readline = require('readline'),
	serverRest = require('./serverRest'),
	serverUtils = require('./serverUtils');

var console = require('./logger.js').console;

var MAX_LIMIT = 250;

var _getResources = function (server, type, expand, offset) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;

		var url = server.url + '/sites/management/api/v1/' + type + '?links=none&orderBy=name&limit=' + MAX_LIMIT;

		if (offset) {
			url = url + '&offset=' + offset;
		}

		if (expand) {
			url = url + '&expand=' + expand + '&expansionErrors=ignore';
		}
		// console.log(' - GET ' + url);

		var options = {
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		request.get(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.error('ERROR: failed to get ' + type + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items || [];
				resolve(data);
			} else {
				console.error('ERROR: failed to get ' + type + ' : ' + (response ? (response.statusMessage + ' ' + response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
};

// get all resources with pagination
var _getAllResources = function (server, type, expand) {
	return new Promise(function (resolve, reject) {
		var groups = [];
		// 1000 * 250 should be enough
		for (var i = 1; i < 1000; i++) {
			groups.push(MAX_LIMIT * i);
		}

		var resources = [];

		var doGetResources = groups.reduce(function (resPromise, offset) {
				return resPromise.then(function (result) {
					if (result && result.items && result.items.length > 0) {
						resources = resources.concat(result.items);
					}
					if (result && result.hasMore) {
						return _getResources(server, type, expand, offset);
					}
				});
			},
			// Start with a previousPromise value that is a resolved promise
			_getResources(server, type, expand));

		doGetResources.then(function (result) {
			// console.log(resources.length);
			resolve(resources);
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
	return _getAllResources(server, 'templates', args.expand);
};

/**
 * Get all themes on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getThemes = function (args) {
	var server = args.server;
	return _getAllResources(server, 'themes', args.expand);
};

/**
 * Get all components on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getComponents = function (args) {
	var server = args.server;
	return _getAllResources(server, 'components');
};

/**
 * Get all sites on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSites = function (args) {
	var server = args.server;
	return _getAllResources(server, 'sites', args.expand);
};

var _getResource = function (server, type, id, name, expand, showError, includeDeleted, showInfo) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}

		if (showInfo === undefined || showInfo) {
			console.info(' - get ' + url);
		}

		url = url + '?links=none';
		if (expand) {
			url = url + '&expand=' + expand;
		}
		if (includeDeleted) {
			url = url + '&includeDeleted=true';
		}

		var options = {
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			var result = {};

			if (error) {
				if (showError) {
					console.error('ERROR: failed to get ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' (ecid: ' + response.ecid + ')');
					console.error(error);
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
					console.error('ERROR: failed to get ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
	return _getResource(server, 'sites', args.id, args.name, args.expand, true, args.includeDeleted, args.showInfo);
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
	return _getResource(server, 'templates', args.id, args.name, args.expand, true, args.includeDeleted);
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
	var showError = args.showError !== undefined ? args.showError : true;
	var includeDeleted = false;
	var showInfo = args.showInfo !== undefined ? args.showInfo : true;
	return _getResource(server, 'components', args.id, args.name, args.expand, showError, includeDeleted, showInfo);
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
	var showError = false;
	var includeDeleted = false;
	var showInfo = args.showInfo !== undefined ? args.showInfo : true;
	return _getResource(server, args.type, args.id, args.name, args.expand, showError, includeDeleted, showInfo);
};

var _getSiteContentTypes = function (server, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/assetTypes';
		console.info(' - get ' + url);

		url = url + '?links=none&expand=type';

		var options = {
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.error('ERROR: failed to get site content types ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var typeNames = [];
				var items = data && data.items || [];
				items.forEach(function (item) {
					if (item.type && item.type.name && !typeNames.includes(item.type.name)) {
						typeNames.push(item.type.name);
					}
				});
				resolve({
					data: typeNames
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to get site content types ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Get asset types used by a site
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSiteContentTypes = function (args) {
	var server = args.server;
	return _getSiteContentTypes(server, args.id, args.name);
};

var _getSiteAccess = function (server, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access';
		console.info(' - get ' + url);

		url = url + '?links=none';

		var options = {
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.error('ERROR: failed to get site access ' + (id || name) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get site access ' + (id || name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access/' + member;
		console.info(' - delete ' + url);

		var options = {
			method: 'DELETE',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {

			if (error) {
				console.error('ERROR: failed to remove ' + member + ' from accessing site ' + (id || name) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to remove ' + member + ' from accessing site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/access';
		console.info(' - post ' + url);

		var body = {
			id: member
		};
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to grant ' + member + ' to access site ' + (id || name) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to grant ' + member + ' to access site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.info(' - patch ' + url);

		var body = {
			security: {
				access: accessList
			}
		};
		var options = {
			method: 'PATCH',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.patch(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to set runtime access for site ' + (id || name) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to set runtime access for site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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


var _setSiteStaticDeliveryOptions = function (server, id, name, staticDeliveryOptions) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.info(' - patch ' + url);

		var body = {
			staticSiteDeliveryOptions: staticDeliveryOptions
		};
		var options = {
			method: 'PATCH',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.patch(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to set staticDeliveryOptions for site ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to set staticDeliveryOptions for site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Update site's static delivery options
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string}  options of static delivery
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.setSiteStaticDeliveryOptions = function (args) {
	var server = args.server;
	return _setSiteStaticDeliveryOptions(server, args.id, args.name, args.staticDeliveryOptions);
};

var _updateSite = function (server, id, name, body) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		console.info(' - patch ' + url);

		var options = {
			method: 'PATCH',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.patch(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to update site ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to update site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Update site's expiration date
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} expiredate
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.setSiteExpirationDate = function (args) {
	var server = args.server;
	var body = {
		expiresAt: args.expireDate
	};
	return _updateSite(server, args.id, args.name, body);
};

var _refreshSiteContent = function (server, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/refresh';
		console.info(' - post ' + url);

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Prefer: 'respond-async',
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to refresh pre-render cache for site ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var status = response.location;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, status);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							console.error('ERROR: refresh pre-render cache failed' + ' (ecid: ' + response.ecid + ')');
							if (data && data.error && data.error['o:errorDetails'] && data.error['o:errorDetails'].length > 0) {
								console.error(data.error);
							}
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);

							return resolve({});
						} else {
							var completedPercentage = '';
							if (data.pageCount) {
								completedPercentage = 100 * (data.completedCount / data.pageCount).toFixed(2);
							}
							console.log(' - refreshing pre-render cache: percentage ' + completedPercentage);
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to refresh pre-render cache for site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

/**
 * Update the theme for a site or template
 */
var _setSiteTheme = function (server, site, themeName, showMsg) {
	return new Promise(function (resolve, reject) {
		if (site.themeName === themeName) {
			return resolve({});
		} else {
			// check of the theme exist
			_getResource(server, 'themes', '', themeName, '', true)
				.then(function (result) {
					if (result.err) {
						return Promise.reject();
					}

					// get file siteinfo.json
					return serverRest.findFile({
						server: server,
						parentID: site.id,
						filename: 'siteinfo.json',
						itemtype: 'file'
					});
				})
				.then(function (result) {
					if (result.err || !result.id) {
						return Promise.reject();
					}

					return serverRest.readFile({
						server: server,
						fFileGUID: result.id
					});
				})
				.then(function (result) {
					if (!result || result.err || !result.properties) {
						return Promise.reject();
					}

					var siteinfo = result;
					siteinfo.properties.themeName = themeName;

					const {
						Readable
					} = require('stream');
					const newSiteInfo = Readable.from(JSON.stringify(siteinfo));
					return serverRest.createFile({
						server: server,
						parentID: site.id,
						filename: 'siteinfo.json',
						contents: newSiteInfo
					});

				})
				.then(function (result) {
					if (!result || result.err || !result.id) {
						return Promise.reject();
					}

					return serverUtils.getIdcToken(server);
				})
				.then(function (result) {
					// fetch token
					var idcToken = result && result.idcToken;

					// update template to the original template
					var values = {
						'scsSiteTheme': themeName
					};
					return serverUtils.setSiteMetadata(server, idcToken, site.id, values);

				})
				.then(function (result) {
					if (!result || result.err) {
						console.error('ERROR: failed to set theme to ' + themeName);
						return Promise.reject();
					}

					if (showMsg) {
						console.info(' - set theme to ' + themeName);
					}

					return resolve({});
				})
				.catch((error) => {
					if (error) {
						console.error(error);
					}
					return resolve({
						err: 'err'
					});
				});
		}
	});
};
/**
 * Update the theme for a site or a template
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {object} site the site or template object
 * @param {object} themeName the name of the theme
 * @returns 
 */
module.exports.setSiteTheme = function (args) {
	return _setSiteTheme(args.server, args.site, args.themeName, args.showMsg)
};

var _exportResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/export';
		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		serverUtils.showRequestOptions(options);

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to export ' + type.substring(0, type.length - 1) + ' ' + (id || name) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var fileLocation = response.location || response.url;
				resolve({
					id: id,
					name: name,
					file: fileLocation
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to export ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

var _exportResourceAsync = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/export';
		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			url: server.url + url
		};

		serverUtils.showRequestOptions(options);

		var resource = type.substring(0, type.length - 1);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to export ' + resource + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location;
				var jobId = statusLocation ? statusLocation.substring(statusLocation.lastIndexOf('/') + 1) : '';
				console.log(' - job id: ' + jobId);
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							var msg = data && (data.message || data.err);
							if (data && data.error) {
								msg = msg + ' ' + (data.error.detail || data.error.title);
							}
							console.error('ERROR: export ' + resource + ' failed: ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							process.stdout.write(' - export in process: percentage ' + data.completedPercentage +
								' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
							clearInterval(inter);
							process.stdout.write(os.EOL);

							return resolve({});
						} else {
							process.stdout.write(' - export in process: percentage ' + data.completedPercentage +
								' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to export ' + resource + ' ' + name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				if (data) {
					console.error(data);
				}
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
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
	return _exportResourceAsync(server, 'templates', args.id, args.name);
};

var _publishResource = function (server, type, id, name, hideAPI) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/publish';
		if (!hideAPI) {
			console.info(' - post ' + url);
		}
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			timeout: 3600000
		};

		serverUtils.showRequestOptions(options);

		var startTime = new Date();
		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to publish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				resolve({
					id: id,
					name: name,
					timeUsed: (serverUtils.timeUsed(startTime, new Date()))
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to publish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
	if (args.async) {
		return _publishResourceAsync(server, 'components', args.id, args.name);
	} else {
		return _publishResource(server, 'components', args.id, args.name, args.hideAPI);
	}
};

var _publishResourceAsync = function (server, type, id, name, usedContentOnly, compileSite, staticOnly, compileOnly, fullpublish, deletestaticfiles) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/publish';
		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async',
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			url: server.url + url
		};

		if (type === 'sites' && deletestaticfiles) {
			options.headers['X-Purge-Site-Static-Files'] = true;
		}
		if (type === 'sites' && (usedContentOnly || compileSite || staticOnly || compileOnly || fullpublish)) {
			var body = {};
			if (usedContentOnly) {
				body.onlyUsedContent = true;
			}
			if (compileSite) {
				body.skipCompile = false;
			}
			if (staticOnly) {
				body.onlyStaticFiles = true;
			}
			if (compileOnly) {
				body.onlyStaticFiles = true;
				body.skipCompile = false;
			}
			if (fullpublish) {
				body.type = 'full';
			}
			options.body = JSON.stringify(body);
			options.json = true;
		}

		serverUtils.showRequestOptions(options);

		var resTitle = type.substring(0, type.length - 1);

		var timer = type === 'components' ? 2000 : 5000;
		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location;
				var jobId = statusLocation ? statusLocation.substring(statusLocation.lastIndexOf('/') + 1) : '';
				console.info(' - job id: ' + jobId);
				var needNewLine = false;
				var startTime = new Date();
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							var msg = data && data.message;
							if (data && data.error) {
								msg = msg + ' ' + (data.error.detail || data.error.title);
							}
							console.error('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							if (console.showInfo()) {
								process.stdout.write(' - publish in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								process.stdout.write(os.EOL);
							}
							return resolve({
								name: name,
								id: jobId
							});
						} else {
							if (console.showInfo()) {
								process.stdout.write(' - publish in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						}
					});
				}, timer);
			} else {
				var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to publish ' + resTitle + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
	return _publishResourceAsync(server, 'sites', args.id, args.name,
		args.usedContentOnly, args.compileSite, args.staticOnly, args.compileOnly, args.fullpublish, args.deletestaticfiles
	);
};

var _unpublishResource = function (server, type, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/unpublish';
		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to unpublish ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		var action = status === 'online' ? 'activate' : 'deactivate';
		url = url + '/' + action;

		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to ' + action + ' site ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				resolve({
					id: id,
					name: name
				});
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to ' + action + ' site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

var _getReports = function (location, job) {
	var urls = [];
	((job.reports && job.reports.items) || []).forEach(function (report) {
		urls.push(location + '/reports/' + report.id + '/package');
	});
	return urls;
}

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

var _exportSite = function (server, name, siteName, siteId, folderId, includeUnpublishedAssets) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/exports';

		var payload = {
			name: name,
			description: "",
			target: {
				provider: "docs",
				docs: {
					folderId: folderId
				}
			},
			sources: [{
				select: {
					type: "site",
					site: {
						id: siteId
					}
				},
				apply: {
					policies: "exportSite",
					exportSite: {
						includeUnpublishedAssets: includeUnpublishedAssets
					}
				}
			}]
		};

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to export site ' + (siteName) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - submit background job');
				statusUrl += '?fields=id,name,description,progress,completed,message,completedPercentage,sources,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports';
				console.info(' - job status: ' + statusUrl);
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine && console.showInfo()) {
									process.stdout.write(os.EOL);
								}
								console.error('ExportSite job ' + data.id + ' ' + data.progress + ' (ecid: ' + response.ecid + ')');
								return resolve({
									err: 'err',
									reports: _getReports(response.location, data)
								});
							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									if (data.completedPercentage) {
										process.stdout.write('   ExportSite job in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									}
									process.stdout.write(os.EOL);
								}
								console.info('  ExportSite job ' + data.id + ' completed [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve({
									job: data,
									reports: _getReports(response.location, data)
								});
							} else {
								if (console.showInfo()) {
									process.stdout.write('   ExportSite job in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								}
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to export site ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Export a site on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} name of the export
 * @param {string} siteId of the site for export
 * @param {string} folderId on Documents to export to
 * @param {string} includeunpublishedassets flag to include unpublished assets or not
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportSite = function (args) {
	var server = args.server;
	return _exportSite(server, args.name, args.siteName, args.siteId, args.folderId, args.includeunpublishedassets);
};

var _createArchive = function (server, folderId) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/archives';

		var payload = {
			provider: "docs",
			docs: {
				folderId: folderId
			}
		};

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create site archive ' + (folderId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - submit background job for create archive');
				statusUrl += '?fields=id,entries,provider,entries.site.id,entries.site.name,entries.site.defaultLanguage,entries.site.channel,entries.site.channel,entries.site.channel.localizationPolicy,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName';
				console.info(' - job status: ' + statusUrl);
				var startTime = new Date();
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							if (!data || data.error) {
								clearInterval(inter);
								var msg = data && data.error ? (data.error.detail || data.error.title) : '';
								console.error('   CreateArchive failed: ' + msg + ' (ecid: ' + response.ecid + ')');
								return resolve({
									err: 'err'
								});
							} else {
								clearInterval(inter);
								console.info('   CreateArchive finished [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve(data);
							}
						});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to create archive ' + (folderId) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Create archive
 * @param {object} args
 * @returns
 */
module.exports.createArchive = function (args) {
	var server = args.server;
	return _createArchive(server, args.folderId);
};

var _showValidationResults = function (source, job) {
	var results = job.validationResults;

	if (!results) {
		return;
	}

	results.items.forEach(function (entry) {
		entry.messages.items.forEach(function (message) {
			console.info(source + ' validation ' + message.level + ' - key ' + message.key + ' parameters:');
			Object.keys(message.parameters).forEach(function (k) {
				console.info('   ' + k + ' : ' + message.parameters[k]);
			})
		});
	});
};

var _importSite = function (server, name, archiveId, siteId, repositoryId, localizationPolicyId, sitePrefix, policies, assetspolicy, newsite) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/imports';

		var payload = {
			name: name,
			description: "",
			source: {
				"provider": "archive",
				"archive": {
					"id": archiveId
				}
			},
			targets: [{
				select: {
					type: "site",
					site: {
						id: siteId
					}
				},
				apply: {
					policies: policies
				}
			}],
			"policies": {
				"ignoreAllValidationWarnings": true
			},
			"ignoreFailures": true
		};

		switch (policies) {
			case 'createSite':
				payload.targets[0].apply.createSite = {
					"assetsPolicy": assetspolicy,
					"site": {
						"repository": {
							"id": repositoryId
						}
					}
				}
				break;
			case 'updateSite':
				payload.targets[0].apply.updateSite = {
					"assetsPolicy": assetspolicy,
					"site": {
						"repository": {
							"id": repositoryId
						}
					}
				}
				break;
			case 'duplicateSite':
				payload.targets[0].apply.duplicateSite = {
					"assetsPolicy": 'duplicate',
					"site": {
						"name": newsite,
						"sitePrefix": sitePrefix,
						"repository": {
							"id": repositoryId
						},
						channel: {
							"localizationPolicy": {
								"id": localizationPolicyId
							}
						}
					}
				}
				break;
			default:
		}

		// TODO: Temporary
		console.info('importSite payload ' + JSON.stringify(payload));

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to import site ' + (archiveId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
				return;
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - submit background job for import site');
				statusUrl += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,currentState,completed,completedPercentage,targets,reports';
				statusUrl += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
				statusUrl += ',validationResults.assetType,validationResults.assetType.source,validationResults.assetType.target,validationResults.messages';
				console.info(' - job status: ' + statusUrl);
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							var reportURL;
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'blocked' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine && console.showInfo()) {
									process.stdout.write(os.EOL);
								}
								console.error('ImportSite job ' + data.id + ' ' + data.progress + ' (ecid: ' + response.ecid + ')');
								_showValidationResults('ImportSite', data);
								return resolve({
									err: 'error',
									job: data,
									reports: _getReports(response.location, data)
								});
							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									if (data.completedPercentage) {
										process.stdout.write('   ImportSite job in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									}
									process.stdout.write(os.EOL);
								}
								console.info('  ImportSite job ' + data.id + ' completed [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve({
									job: data,
									reports: _getReports(response.location, data)
								});
							} else {
								if (console.showInfo()) {
									process.stdout.write('   ImportSite job in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								}
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						});
				}, 10000);
			} else {
				console.info('   ImportSite job status: No statusUrl');
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to import site ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Import a site to server
 * @param {object} args
 * @returns
 */
module.exports.importSite = function (args) {
	var server = args.server;
	return _importSite(server, args.name, args.archiveId, args.siteId, args.repositoryId, args.localizationPolicyId, args.sitePrefix, args.policies, args.assetspolicy, args.newsite);
};

var _describeExportJob = function (server, id) {
	return new Promise(function (resolve, reject) {

		var stem = server.url + '/system/export/api/v1/exports/' + id;
		var url = stem;

		url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed,currentState,completedPercentage,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports,sources.select.type,sources.select.site.id,sources.apply.exportSite.includeUnpublishedAssets';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get export job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get export job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Describe export job
 * @param {object} args
 * @returns
 */
module.exports.describeExportJob = function (args) {
	var server = args.server;
	return _describeExportJob(server, args.id);
};

var _describeImportJob = function (server, id) {
	return new Promise(function (resolve, reject) {

		var stem = server.url + '/system/export/api/v1/imports/' + id;
		var url = stem;

		url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,currentState,completed,reports';
		url += ',source,source.archive,targets.select.type,targets.select.site,id,targets.select.site.name';
		url += ',targets.select.site.channel.name,targets.select.site.channel.localizationPolicy.name,targets.select.site.defaultLanguage,targets.apply.policies';
		url += ',targets.apply.createSite.site.repository,targets.apply.createSite.assetsPolicy';
		url += ',targets.apply.updateSite.site.repository,targets.apply.updateSite.assetsPolicy';
		url += ',targets.apply.duplicateSite.site.repository,targets.apply.duplicateSite.assetsPolicy';
		url += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
		url += ',validationResults.assetType,validationResults.assetType.source,validationResults.assetType.target,validationResults.messages';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get import job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get import job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Describe export job
 * @param {object} args
 * @returns
 */
module.exports.describeImportJob = function (args) {
	var server = args.server;
	return _describeImportJob(server, args.id);
};

var _validateSite = function (server, id, name) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/validate';

		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to validate site ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to validate site ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}

		console.info(' - delete ' + url);
		var options = {
			method: 'DELETE',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
var _hardDeleteResource = function (server, type, id, name, showError) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/hardDelete';
		console.info(' - post ' + url);
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.error('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' (ecid: ' + response.ecid + ')');
					console.error(error);
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
					console.error('ERROR: failed to delete ' + type.substring(0, type.length - 1) + ' ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

/**
 * Delete a site on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {boolean} hard a flag to indicate delete the site permanently
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteSite = function (args) {
	var server = args.server;
	var showError = args.showError !== undefined ? args.showError : true;
	return args.hard ? _hardDeleteResource(server, 'sites', args.id, args.name, showError) : _softDeleteResource(server, 'sites', args.id, args.name);
};

/**
 * Delete a theme on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the theme or
 * @param {string} name the name of the theme
 * @param {boolean} hard a flag to indicate delete the theme permanently
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteTheme = function (args) {
	var server = args.server;
	var showError = args.showError !== undefined ? args.showError : true;
	return args.hard ? _hardDeleteResource(server, 'themes', args.id, args.name, showError) : _softDeleteResource(server, 'themes', args.id, args.name);
};

/**
 * Delete a component on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the component or
 * @param {string} name the name of the component
 * @param {boolean} hard a flag to indicate delete the component permanently
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteComponent = function (args) {
	var server = args.server;
	var showError = args.showError !== undefined ? args.showError : true;
	return args.hard ? _hardDeleteResource(server, 'components', args.id, args.name, showError) : _softDeleteResource(server, 'components', args.id, args.name);
};

var _importComponent = function (server, name, fileId) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/components';
		console.info(' - post ' + url);
		var body = {
			file: fileId,
			conflicts: {
				'resolution': "overwrite"
			}
		};
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			timeout: 3600000,
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to import component ' + name + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location || response.url;
				var itemId;
				if (statusLocation && statusLocation.indexOf('/') > 0) {
					itemId = statusLocation.substring(statusLocation.lastIndexOf('/') + 1);
					// console.log(' - component id: ' + itemId);
				}
				if (itemId) {
					_getResource(server, 'components', itemId).then(function (result) {
						if (!result || result.err || !result.name) {
							console.error('ERROR: failed to import component ' + name + ' (ecid: ' + response.ecid + ')');
						} else {
							resolve({
								id: result.id,
								name: name,
								newName: result.name
							});
						}

					});
				} else {
					console.error('ERROR: failed to import component ' + name + ' : ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
					resolve({
						err: 'err'
					});
				}
			} else {
				// console.log(data);
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				var owner = data && data.owner && data.owner.displayName || '';
				console.error('ERROR: failed to import component ' + name + (owner ? ' (owned by ' + owner + ')' : '') + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				if (!msg) {
					console.log(data);
				}
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

var _getBackgroundJobStatus = function (server, url) {
	return new Promise(function (resolve, reject) {
		var augmentedUrl = (url.indexOf('?') !== -1) ? url : url + '?links=none';
		var options = {
			url: augmentedUrl,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// Note: Export service on dev instances requires additional header
		if (url.indexOf('/system/export') !== -1 && server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		var endpoint = serverUtils.replaceAll(augmentedUrl, server.url);
		if (endpoint.indexOf('/') > 0) {
			endpoint = endpoint.substring(endpoint.indexOf('/'));
		}

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {

			if (error) {
				console.info('_getBackgroundJobStatus error fetching from options.url ' + options.url);
				console.error('ERROR: failed to get status from ' + endpoint + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
				data.ecid = response.ecid;
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.info('_getBackgroundJobStatus  error in response fetching from options.url ' + options.url);
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to get status from ' + endpoint + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Get background job status
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} url the status url
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getBackgroundJobStatus = function (args) {
	return _getBackgroundJobStatus(args.server, args.url);
};

var _createTemplateFromSite = function (server, name, siteName, includeUnpublishedAssets, enterprisetemplate) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/' + 'name:' + siteName + '/templates';
		console.info(' - post ' + url);
		var body = {
			name: name,
			includeUnpublished: includeUnpublishedAssets
		};
		if (enterprisetemplate) {
			body.type = 'enterprise';
		}
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				Prefer: 'respond-async',
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create template ' + name + ' from site ' + siteName + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location;
				console.log(' - create template (job id: ' + statusLocation.substring(statusLocation.lastIndexOf('/') + 1) + ')');
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.error('ERROR: create template failed: ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							process.stdout.write(' - creating template: percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							process.stdout.write(os.EOL);

							return resolve({});
						} else {
							process.stdout.write(' - creating template: percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to create template ' + name + ' from site ' + siteName + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
	return _createTemplateFromSite(server, args.name, args.siteName, args.includeUnpublishedAssets, args.enterprisetemplate);
};

var _importTemplate = function (server, name, fileId) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/templates';
		console.info(' - post ' + url);
		var body = {
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
		};
		var options = {
			method: 'POST',
			headers: {
				Prefer: 'respond-async',
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			url: server.url + url,
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to import template ' + name + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location;
				console.info(' - import template (job id: ' + statusLocation.substring(statusLocation.lastIndexOf('/') + 1) + ')');
				var startTime = new Date();
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							process.stdout.write(os.EOL);
							console.log(JSON.stringify(data, null, 4));
							var msg = data && data.error ? (data.error.detail || data.error.title) : '';
							console.error('ERROR: import template failed: ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							if (console.showInfo()) {
								process.stdout.write(' - importing template: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								process.stdout.write(os.EOL);
							}
							return resolve(data.template);
						} else {
							if (console.showInfo()) {
								process.stdout.write(' - importing template: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
							}
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
				console.error('ERROR: failed to import template ' + name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				if (data) {
					console.error(JSON.stringify(data, null, 4));
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

var _createSite = function (server, name, description, sitePrefix, templateName, templateId, repositoryId, localizationPolicyId, defaultLanguage,
	updateContent, reuseContent, suppressgovernance, id, taxonomyId, categoryId) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites';
		console.info(' - post ' + url + ' ' + (updateContent ? '(preserve asset ID)' : ''));
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
		if (taxonomyId && categoryId) {
			body.contentSecurity = {
				taxonomy: taxonomyId,
				category: categoryId
			}
		}
		if (id) {
			// create the site with a specific id (transfer site preserve original site id)
			body.id = id;
		}

		var headers = {
			Prefer: 'respond-async',
			'Content-Type': 'application/json',
			Authorization: serverUtils.getRequestAuthorization(server)
		};
		if (reuseContent) {
			headers['X-Preserve-Guids'] = true;
			headers['X-Reuse-Existing-Content'] = true;
		} else if (updateContent) {
			headers['X-Preserve-Guids'] = true;
		}
		if (suppressgovernance) {
			headers['X-Suppress-Site-Governance'] = true;
		}
		// this will be ignored if governance is not on or the user is not a sitesadmin
		headers['X-Auto-Approve-Request'] = true;

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: headers,
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create site ' + name + ' from template ' + (templateName || templateId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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

			var msg;
			if (response && response.statusCode === 202) {
				var statusLocation = response.location;
				var governanceEnabled = false;
				if (statusLocation.indexOf('/requests/') > 0) {
					governanceEnabled = true;
					console.info(' - sending request');
				} else {
					console.info(' - creating site (job id: ' + statusLocation.substring(statusLocation.lastIndexOf('/') + 1) + ')');
				}
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (governanceEnabled) {
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine) {
									process.stdout.write(os.EOL);
								}
								var msg = data && data.message ? data.message : (data && data.error ? (data.error.detail || data.error.title) : '');
								console.error('ERROR: create site failed: ' + msg + ' (ecid: ' + response.ecid + ')');
								if (data) {
									console.error(JSON.stringify(data, null, 4));
								}
								return resolve({
									err: 'err'
								});
							} else if (data.progress === 'blocked') {
								clearInterval(inter);
								console.log(' - the request is awaiting approval');
								return resolve({
									status: 'pending'
								});

							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									process.stdout.write(' - creating site in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									process.stdout.write(os.EOL);
								}

								return resolve({
									status: 'created'
								});
							} else {
								if (console.showInfo()) {
									process.stdout.write(' - creating site in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							}

						} else {
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine) {
									process.stdout.write(os.EOL);
								}
								msg = data && data.message ? data.message : (data && data.error ? (data.error.detail || data.error.title) : '');
								console.error('ERROR: create site failed: ' + msg + ' (ecid: ' + response.ecid + ')');
								if (data) {
									console.error(JSON.stringify(data, null, 4));
								}
								return resolve({
									err: 'err'
								});
							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									process.stdout.write(' - creating site in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									process.stdout.write(os.EOL);
								}

								return resolve({});
							} else {
								if (console.showInfo()) {
									process.stdout.write(' - creating site in process: percentage ' + data.completedPercentage +
										' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							}
						}
					});
				}, 5000);
			} else {
				msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to create site ' + name + ' from template ' + templateName + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				if (data) {
					console.error(data);
				}
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
		args.templateName, args.templateId, args.repositoryId,
		args.localizationPolicyId, args.defaultLanguage,
		args.updateContent, args.reuseContent, args.suppressgovernance, args.id,
		args.taxonomyId, args.categoryId);
};

var _copySite = function (server, sourceSiteName, name, description, sitePrefix, repositoryId) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/name:' + sourceSiteName + '/copy';
		console.info(' - post ' + url);
		var body = {
			name: name,
			description: description || ''
		};
		if (sitePrefix) {
			body.sitePrefix = sitePrefix;
		}
		if (repositoryId) {
			body.repository = repositoryId;
		}

		var headers = {
			Prefer: 'respond-async',
			'Content-Type': 'application/json',
			Authorization: serverUtils.getRequestAuthorization(server)
		};

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: headers,
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to copy site ' + sourceSiteName + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var statusLocation = response.location;
				console.info(' - copying site (job id: ' + statusLocation.substring(statusLocation.lastIndexOf('/') + 1) + ')');
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							var msg = data && data.message ? data.message : (data && data.error ? (data.error.detail || data.error.title) : '');
							console.error('ERROR: copy site failed: ' + msg + ' (ecid: ' + response.ecid + ')');
							// console.log(data);
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							if (console.showInfo()) {
								process.stdout.write(' - copying site in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								process.stdout.write(os.EOL);
							}
							return resolve({});
						} else {
							if (console.showInfo()) {
								process.stdout.write(' - copying site in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to copy site ' + sourceSiteName + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}
		});
	});
};
/**
 * Copy a site
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} sourceSite the name of the source site
 * @param {string} name the name of the copied site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copySite = function (args) {
	var server = args.server;
	return _copySite(server, args.sourceSite, args.name, args.description, args.sitePrefix, args.repositoryId);
};

var _siteUpdated = function (server, name) {
	return new Promise(function (resolve, reject) {

		_getResource(server, 'sites', '', name, '', true)
			.then(function (result) {
				if (result.err) {
					resolve({
						err: 'err'
					});
				} else {
					var site = result;

					var url = '/sites/management/api/v1/sites/' + site.id;
					console.info(' - patch ' + url);

					var body = {
						description: site.description ? site.description : ''
					};
					var options = {
						method: 'PATCH',
						url: server.url + url,
						headers: {
							'Content-Type': 'application/json',
							Authorization: serverUtils.getRequestAuthorization(server)
						},
						body: JSON.stringify(body),
						json: true
					};

					serverUtils.showRequestOptions(options);

					var request = require('./requestUtils.js').request;
					request.patch(options, function (error, response, body) {
						if (error) {
							console.error('ERROR: failed to update site ' + site.name + ' (ecid: ' + response.ecid + ')');
							console.error(error);
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
							console.error('ERROR: failed to update site ' + site.name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
							resolve({
								err: msg || 'err'
							});
						}

					});
				}
			});
	});
};

/**
 * Mark a site as updated
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} name the name of the site
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.siteUpdated = function (args) {
	return _siteUpdated(args.server, args.name);
};

var _createUpdate = function (server, siteId, name) {
	return new Promise(function (resolve, reject) {

		var url = '/documents/integration?IdcService=SCS_CREATE_EMPTY_VARIANT&IsJson=1';

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)

			},
			body: JSON.stringify({
				'LocalData': {
					'IdcService': 'SCS_CREATE_EMPTY_VARIANT',
					siteId: siteId,
					name: name,
					isSiteUpdate: 1
				}
			}),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (err, response, body) {
			if (response && response.statusCode !== 200) {
				console.error('ERROR: Failed to create the site update');
				console.error('compilation server message: response status -', response.statusCode);
			}
			if (err) {
				console.error('ERROR: Failed to create the site update');
				console.error('compilation server message: error -', err);
				return reject({
					err: err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				if (typeof body === 'object') {
					data = body;
				}
			}
			// console.log(data);
			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.error('ERROR: failed to create the site update ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				var errorMsg = data && data.LocalData ? '- ' + data.LocalData.StatusMessage : "failed to create the site update";
				return reject({
					err: errorMsg
				});
			} else {
				return resolve({
					id: data.LocalData.fFolderGUID,
					name: data.LocalData.variantName
				});
			}
		});
	});
};

/**
 * Create a site update
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} siteId the ID of the site
 * @param {string} name the name of the new update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createUpdate = function (args) {
	return _createUpdate(args.server, args.siteId, args.name);
};

var _shareSite = function (server, id, name, member, role) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/sites/';
		if (id) {
			url = url + id;
		} else if (name) {
			url = url + 'name:' + name;
		}
		url = url + '/members';
		console.info(' - post ' + url);

		var body = {
			id: member,
			role: role
		};
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to share site ' + (name || id) + ' with ' + member + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to share site ' + (name || id) + ' with ' + member + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};
/**
 * Share a site with a user/group.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} id the id of the site or
 * @param {string} name the name of the site
 * @param {string} member in the form of user:<user id>
 * @param {string} role the role to give the user/group
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.shareSite = function (args) {
	return _shareSite(args.server, args.id, args.name, args.member, args.role);
};

var _copyResource = function (server, type, srcId, srcName, name, desc) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (srcId) {
			url = url + srcId;
		} else if (srcName) {
			url = url + 'name:' + srcName;
		}
		url = url + '/copy';

		var body = {
			name: name
		};
		if (desc) {
			body.description = desc;
		}
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.error('ERROR: failed to copy ' + type.substring(0, type.length - 1) + ' ' + (srcName || srcId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);

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
				console.error('ERROR: failed to copy ' + type.substring(0, type.length - 1) + ' ' + (srcName || srcId) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');

				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Copy a component on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} srcId the id of the source component or
 * @param {string} srcName the name of the source component
 * @param {string} name the name of the new component
 * * @param {string} description the description of the new component
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyComponent = function (args) {
	return _copyResource(args.server, 'components', args.srcId, args.srcName, args.name, args.description);
};


var _copyResourceAsync = function (server, type, srcId, srcName, name, desc) {
	return new Promise(function (resolve, reject) {

		var url = '/sites/management/api/v1/' + type + '/';
		if (srcId) {
			url = url + srcId;
		} else if (srcName) {
			url = url + 'name:' + srcName;
		}
		url = url + '/copy';

		var body = {
			name: name
		};
		if (desc) {
			body.description = desc;
		}
		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Prefer: 'respond-async',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		serverUtils.showRequestOptions(options);

		var typeLabel = type.substring(0, type.length - 1);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {

			if (error) {
				console.error('ERROR: failed to copy ' + typeLabel + ' ' + (srcName || srcId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);

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
				var statusLocation = response.location;
				var jobId = statusLocation ? statusLocation.substring(statusLocation.lastIndexOf('/') + 1) : '';
				console.info(' - job id: ' + jobId);
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getBackgroundJobStatus(server, statusLocation);
					jobPromise.then(function (data) {
						// console.log(data);
						if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							var msg = data && data.message;
							if (data && data.error) {
								msg = msg + ' ' + (data.error.detail || data.error.title);
							}
							console.error('ERROR: copy ' + type + ' ' + (srcName || srcId) + ' failed: ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						} else if (data.completed && data.progress === 'succeeded') {
							clearInterval(inter);
							if (console.showInfo()) {
								process.stdout.write(' - copy in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								process.stdout.write(os.EOL);
							}

							return resolve({});
						} else {
							if (console.showInfo()) {
								process.stdout.write(' - copy in process: percentage ' + data.completedPercentage +
									' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						}
					});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to copy ' + typeLabel + ' ' + (srcName || srcId) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				if (data) {
					console.error(data);
				}
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Copy a theme on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} srcId the id of the source theme or
 * @param {string} srcName the name of the source theme
 * @param {string} name the name of the new theme
 * * @param {string} description the description of the new theme
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyTheme = function (args) {
	return _copyResourceAsync(args.server, 'themes', args.srcId, args.srcName, args.name, args.description);
};


/**
 * Copy a site template on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} srcId the id of the source template or
 * @param {string} srcName the name of the source template
 * @param {string} name the name of the new template
 * * @param {string} description the description of the new template
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyTemplate = function (args) {
	return _copyResourceAsync(args.server, 'templates', args.srcId, args.srcName, args.name, args.description);
};

var _getExportJobsEndpoint = function (server) {
	return `${server.url}/system/export/api/v1/exports`;
};
module.exports.getExportJobsEndpoint = function (server) {
	return _getExportJobsEndpoint(server);
};

var _sendExportJobRequest = function (server, method, url, payload, requestUtils) {
	return new Promise(function (resolve /*, reject*/ ) {
		var postData = {
			method: method,
			url,
			headers: {
				'Content-Type': 'application/json',
				'IDCS_REMOTE_USER': server.username,
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			json: true
		};

		if (payload) {
			postData.body = JSON.stringify(payload);
		}

		requestUtils.request.post(postData, function (error, response, body) {
			if (error) {
				console.log(`Failed to ${method} ${url}`);
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				data = body;
			}
			if (response.statusCode >= 200 && response.statusCode < 300) {
				resolve((response.location).split('/')[8]);
			} else {
				var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
				console.log(`Failed to ${method} ${url} - ${msg}`);
				resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Send different Ranking policy requests
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.method method name
 * @param {object} args.payload payload of Ranking policy for different actions like create, promote and publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.sendExportJobRequest = function (args) {
	return _sendExportJobRequest(args.server, args.method, args.url, args.payload, args.requestUtils);
}
var _getExportJobRequest = function (server, method, url, requestUtils) {
	return new Promise(function (resolve /*, reject*/ ) {
		var postData = {
			method: method,
			url,
			headers: {
				'Content-Type': 'application/json',
				'IDCS_REMOTE_USER': server.username,
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			json: true
		};
		requestUtils.request.post(postData, function (error, response, body) {
			if (error) {
				console.log(`Failed to ${method} ${url}`);
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				data = body;
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
				console.log(`Failed to ${method} ${url} - ${msg}`);
				resolve({
					err: 'err'
				});
			}
		});
	});
};
module.exports.getExportJobRequest = function (args) {
	return _getExportJobRequest(args.server, args.method, args.url, args.requestUtils);
}