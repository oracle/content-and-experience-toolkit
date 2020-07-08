/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */
var request = require('request'),
	os = require('os'),
	readline = require('readline'),
	serverUtils = require('./serverUtils');

//
// Folder CRUD
//

// Create Folder on server
var _createFolder = function (server, parentID, foldername) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/folders/' + parentID,
			auth: serverUtils.getRequestAuth(server),
			headers: {
				'Content-Type': 'application/json'
			},
			body: {
				'name': foldername,
				'description': ''
			},
			json: true
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create folder ' + foldername);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(body);
			} else {
				console.log('ERROR: failed to create folder ' + foldername + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}

		});
	});
};

/**
 * Create folder on server by folder name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.foldername The name of the folder to create.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createFolder = function (args) {
	return _createFolder(args.server, args.parentID, args.foldername);
};

// Find or Create Folder on server
var _findOrCreateFolder = function (server, parentID, foldername) {
	return new Promise(function (resolve, reject) {
		// try to find the folder
		_findFile(server, parentID, foldername, false).then(function (existingFolder) {
			// if we've found the folder, return it
			if (existingFolder && existingFolder.id) {
				return resolve(existingFolder);
			}

			// didn't find the folder, create it
			_createFolder(server, parentID, foldername).then(function (newFolder) {
				// return the created folder
				if (newFolder) {
					newFolder.__created = '1';
				}
				return resolve(newFolder);
			});
		});
	});
};

/**
 * Find or Create folder on server by folder name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.foldername The name of the folder to create.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.findOrCreateFolder = function (args) {
	return _findOrCreateFolder(args.server, args.parentID, args.foldername);
};

var _findFolderHierarchy = function (server, rootParentId, folderPathStr) {
	return new Promise(function (resolve, reject) {
		var folderPromises = [],
			parentGUID;
		var folderPath = folderPathStr ? folderPathStr.split('/') : [];
		folderPath.forEach(function (foldername) {
			if (foldername) {
				folderPromises.push(function (parentID) {
					return _findFile(server, parentID, foldername, true, 'folder');
				});
			}
		});

		// get the folders in sequence
		var doFindFolder = folderPromises.reduce(function (previousPromise, nextPromise) {
				return previousPromise.then(function (folderDetails) {
					// store the parent
					if (folderDetails && folderDetails.id) {
						if (folderDetails.id !== rootParentId) {
							console.log(' - find ' + folderDetails.type + ' ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
						}
						parentGUID = folderDetails.id;

						// wait for the previous promise to complete and then return a new promise for the next 
						return nextPromise(parentGUID);
					}
				});
			},
			// Start with a previousPromise value that is a resolved promise passing in the home folder id as the parentID
			Promise.resolve({
				id: rootParentId
			}));

		doFindFolder.then(function (parentFolder) {
			if (parentFolder && parentFolder.id) {
				if (parentFolder.id !== rootParentId) {
					console.log(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
				}
			}
			resolve(parentFolder);
		});
	});
};
/**
 * Find folder hierarchy on server by folder name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.folderPath The path of the folder.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.findFolderHierarchy = function (args) {
	return _findFolderHierarchy(args.server, args.parentID, args.folderPath);
};

// Delete Folder on server
var _deleteFolder = function (server, fFolderGUID) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'DELETE',
			url: server.url + '/documents/api/1.2/folders/' + fFolderGUID,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete folder ' + fFolderGUID);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(body);
			} else {
				console.log('ERROR: failed to delete folder ' + foldername + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}

		});
	});
};
/**
 * Delete Folder from server by folder GUID
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFolderGUID The DOCS GUID for the folder to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteFolder = function (args) {
	return _deleteFolder(args.server, args.fFolderGUID);
};

// Get child items with the parent folder
var _getChildItems = function (server, parentID, limit, offset) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/folders/' + parentID + '/items';
		if (limit) {
			url = url + '?limit=' + limit;
		}
		if (offset) {
			url = url + '&offset=' + offset;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get folder child items ' + parentID);
				console.log(error);
				resolve({
					err: 'err'
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
				console.log('ERROR: failed to get folder items ' + parentID + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});

	});
};
/**
 * Get child items from server under the given parent
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder to search
 * @param {string} args.limit the maximum number of items to return
 * @returns {array} The array of data object returned by the server.
 */
module.exports.getChildItems = function (args) {
	return _getChildItems(args.server, args.parentID, args.limit, args.offset);
};

// Find file by name with the parent folder
var _findFile = function (server, parentID, filename, showError, itemtype) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/folders/' + parentID + '/items?limit=9999';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get folder child items ' + parentID);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				// find the requested folder
				var items = (data && data.items || []);
				for (var i = 0; i < items.length; i++) {
					if (items[i].name === filename) {
						return resolve(items[i]);
					}
				}
			}

			// folder not found
			if (showError) {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				msg = msg === 'OK' ? '' : msg;
				console.log('ERROR: failed to find ' + (itemtype ? itemtype : ' File') + ': ' + filename + ' ' + msg);
			}
			return resolve({
				err: 'err'
			});
		});
	});
};
/**
 * Find the file from server under the given parent
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder to search
 * @param {string} args.filename The name of the folder to find
 * @param {string} args.itemtype The type of item ti find, folder or file
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.findFile = function (args) {
	var showError = args.showError === undefined ? true : args.showError;
	return _findFile(args.server, args.parentID, args.filename, showError, args.itemtype);
};


//
// File CRUD
//

// Create file on server
var _createFile = function (server, parentID, filename, contents) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/files/data/',
			auth: serverUtils.getRequestAuth(server),
			headers: {
				'Content-Type': 'multipart/form-data'
			},
			formData: {
				jsonInputParameters: JSON.stringify({
					'parentID': parentID
				}),
				'primaryFile': {
					value: contents,
					options: {
						'filename': filename
					}
				}
			}
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create file ' + filename);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(data);
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to create file ' + filename + ' : ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Create file from server by file name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.filename The name of the file to create.
 * @param {stream} args.contents The filestream to upload.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createFile = function (args) {
	return _createFile(args.server, args.parentID, args.filename, args.contents);
};


// Read file from server
var _readFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to read file ' + fFileGUID);
				console.log(error);
				resolve({
					err: 'err'
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
				console.log('ERROR: failed to read file ' + fFileGUID + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});

	});
};
/**
 * Read file from server by file name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.readFile = function (args) {
	return _readFile(args.server, args.fFileGUID);
};

// Read file object
var _getFile = function (server, id) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + id;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get file ' + id);
				console.log(error);
				resolve({
					err: 'err'
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
				console.log('ERROR: failed to get file ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});

	});
};
/**
 * Read file from server by file name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The DOCS GUID for the file
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getFile = function (args) {
	return _getFile(args.server, args.id);
};

var _downloadFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var auth = serverUtils.getRequestAuth(server);
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';
		var options = {
			url: url,
			auth: auth,
			encoding: null
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to download file');
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				resolve({
					id: fFileGUID,
					data: body
				});
			} else {
				console.log('ERROR: failed to download file: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}

		});
	});
};

/**
 * Download file from server by file id
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.downloadFile = function (args) {
	return _downloadFile(args.server, args.fFileGUID);
};

// Delete file from server
var _deleteFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'DELETE',
			url: server.url + '/documents/api/1.2/files/' + fFileGUID,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete file ' + fFileGUID);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(body);
			} else {
				console.log('ERROR: failed to delete file ' + fFileGUID + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}

		});
	});
};
/**
 * Delete file from server by file GUID
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteFile = function (args) {
	return _deleteFile(args.server, args.fFileGUID);
};

// Get file versions from server
var _getFileVersions = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/versions';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get file version ' + fFileGUID);
				console.log(error);
				resolve();
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get file version ' + fFileGUID + ' : ' + msg);
				resolve();
			}
		});
	});
};
/**
 * Get file versions from server by file id
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to query
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getFileVersions = function (args) {
	return _getFileVersions(args.server, args.fFileGUID);
};

var _getItem = function (server, id, expand) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items/' + id;
		if (expand) {
			url = url + '?expand=' + expand;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get item ' + id);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				return resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get item ' + id + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get an item on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} args.server the server object
 * @param {string} args.id The id of the item to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItem = function (args) {
	return _getItem(args.server, args.id, args.expand);
};

var _getItemRelationships = function (server, id) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items/' + id + '/relationships';

		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get item relationships ' + id);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				var referenceIds = [];
				var referencedByIds = [];
				if (data && data.data && data.data.references) {
					for (var i = 0; i < data.data.references.length; i++) {
						referenceIds.push(data.data.references[i].id);
					}
				}
				if (data && data.data && data.data.referencedBy) {
					for (var i = 0; i < data.data.referencedBy.length; i++) {
						referencedByIds.push(data.data.referencedBy[i].id);
					}
				}
				return resolve({
					id: id,
					references: referenceIds,
					referencedBy: referencedByIds
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get item relationships ' + id + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get an item's relationships on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} args.server the server object
 * @param {string} args.id The id of the item to query.
 * @param {string} args.expand The comma-separated list of field names or all to get child resources.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemRelationships = function (args) {
	return _getItemRelationships(args.server, args.id);
};

var _getItemVariations = function (server, id) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items/' + id + '/variations';

		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get item variations ' + id);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				return resolve({
					id: id,
					data: data && data.data || []
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get item variations ' + id + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get an item's variations on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} args.server the server object
 * @param {string} args.id The id of the item to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemVariations = function (args) {
	return _getItemVariations(args.server, args.id);
};

var _queryItems = function (server, q, fields, orderBy, limit, offset, channelToken) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items';
		var sep = '?';
		if (q) {
			url = url + sep + 'q=' + q;
			sep = '&';
		}
		url = url + sep + 'limit=' + (limit || 9999);
		if (offset) {
			url = url + '&offset=' + offset;
		}
		if (orderBy) {
			url = url + '&orderBy=' + orderBy;
		}
		if (channelToken) {
			url = url + '&channelToken=' + channelToken;
		}
		if (fields) {
			url = url + '&fields=' + fields;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to query items with ' + query);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				return resolve({
					data: data && data.items,
					query: query,
					hasMore: data && data.hasMore
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to query items with ' + query + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get an item on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} args.server the server object
 * @param {string} args.q The query expression
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.queryItems = function (args) {
	return _queryItems(args.server, args.q, args.fields, args.orderBy, args.limit, args.offset, args.channelToken);
};

// Create collection on server
var _createCollection = function (server, repositoryId, name, channels) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					'repository': {
						id: repositoryId
					},
					'name': name,
					'channels': channels
				};

				var url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};
				// console.log(postData);
				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create collection ' + name);
						console.log(error);
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
						console.log('Failed to create collection ' + name + ' : ' + (response.statusMessage || response.statusCode));
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};

/**
 * Create channel on server by channel name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the channel to create.
 * @param {string} args.repositoryId The id of the repository
 * @param {string} args.channels the list of channels, e.g [{id: id1}, {id: id2}]
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createCollection = function (args) {
	return _createCollection(args.server, args.repositoryId, args.name, args.channels);
};

// Create channel on server
var _createChannel = function (server, name, channelType, description, publishPolicy, localizationPolicy) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					'name': name,
					'channelType': channelType || 'public',
					'description': description || '',
					'publishPolicy': publishPolicy || 'anythingPublished'
				};
				if (localizationPolicy) {
					payload.localizationPolicy = localizationPolicy;
				}

				var url = server.url + '/content/management/api/v1.1/channels';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create channel ' + name);
						console.log(error);
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
						console.log('Failed to create channel ' + name + ' : ' + (response.statusMessage || response.statusCode));
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};

/**
 * Create channel on server by channel name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the channel to create.
 * @param {string} args.description The description of the channel to create.
 * @param {string} args.channelType The type of the channel, defaults to public.
 * @param {string} args.publishPolicy the publish policy, defaults to anythingPublished.
 * @param {string} args.localizationPolicy the id of the localization policy.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createChannel = function (args) {
	return _createChannel(args.server, args.name, args.channelType,
		args.description, args.publishPolicy, args.localizationPolicy);
};

// Delete channel on server
var _deleteChannel = function (server, id) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/channels/' + id;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'DELETE',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					}
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete channel ' + id);
						console.log(error);
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
						console.log('Failed to delete channel ' + id + ' : ' + (response.statusMessage || response.statusCode));
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Delete channel on server by channel id
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the channel to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteChannel = function (args) {
	return _deleteChannel(args.server, args.id);
};

// Delete repository on server
var _deleteRepository = function (server, id) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/repositories/' + id;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'DELETE',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					}
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete repository ' + id);
						console.log(error);
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
						console.log('Failed to delete repository ' + id + ' : ' + (response.statusMessage || response.statusCode));
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Delete repository on server by channel id
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the repository to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteRepository = function (args) {
	return _deleteRepository(args.server, args.id);
};

// Add channel to repository
var _addChannelToRepository = function (server, channelId, channelName, repository) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var channel = {
					'id': channelId
				};
				var data = repository;
				if (data.channels) {
					data.channels.push(channel);
				} else {
					data.channels = [channel];
				}

				var request = require('request');
				var url = server.url + '/content/management/api/v1.1/repositories/' + repository.id;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'PUT',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: data,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to add channel ' + channelName + ' to repository ' + repository.name);
						console.log(error);
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = data ? JSON.stringify(data) : (response.statusMessage || response.statusCode);
						console.log('Failed to add channel ' + channelName + ' to repository ' + repository.name + ' : ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};

/**
 * Add channel to repository on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the channel to add.
 * @param {string} args.name The naem of the channel.
 * @param {object} repository JavaScript object containing repository
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addChannelToRepository = function (args) {
	return _addChannelToRepository(args.server, args.id, args.name, args.repository);
};


// Get channels from server
var _getChannels = function (server) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/channels?limit=99999&fields=all';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get channels');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get channels  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all channels on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getChannels = function (args) {
	return _getChannels(args.server);
};

// Get channel from server
var _getChannel = function (server, channelId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/channels/' + channelId;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get channel ' + channelId);
				console.log(error);
				return resolve({
					err: 'err'
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
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get channel ' + channelId + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the channel to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getChannel = function (args) {
	return _getChannel(args.server, args.id);
};


/**
 * Get a channel with name on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the channel to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getChannelWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			resolve({
				err: 'err'
			});
		}
		_getChannels(args.server).then(function (result) {
			if (result.err) {
				resolve({
					err: 'err'
				});
			}

			var channels = result || [];
			var channel;
			var name = args.name.toLowerCase();
			for (var i = 0; i < channels.length; i++) {
				if (name === channels[i].name.toLowerCase()) {
					channel = channels[i];
					break;
				}
			}

			resolve({
				data: channel
			});
		});
	});
};


// Get all items in a channel from server
var _getChannelItems = function (server, channelToken, fields) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items?limit=9999&channelToken=' + channelToken;
		if (fields) {
			url = url + '&fields=' + fields;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get channel items');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get channel items  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all items in a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} args.server the server object
 * @param {string} args.channelToken The token of the channel to query.
 * @param {string} args.fields The extral fields returned from the query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getChannelItems = function (args) {
	return _getChannelItems(args.server, args.channelToken, args.fields);
};

// perform bulk operation on items in a channel from server
var _bulkOpItems = function (server, operation, channelIds, itemIds, queryString, async, collectionIds) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var request = serverUtils.getRequest();

				var q = '';
				if (queryString) {
					q = queryString;
				} else {
					for (var i = 0; i < itemIds.length; i++) {
						if (q) {
							q = q + ' or ';
						}
						q = q + 'id eq "' + itemIds[i] + '"';
					}
				}

				var channels = [];
				for (var i = 0; i < channelIds.length; i++) {
					channels.push({
						id: channelIds[i]
					});
				}

				var collections = [];
				if (collectionIds && collectionIds.length > 0) {
					collectionIds.forEach(function (id) {
						collections.push({
							id: id
						});
					});
				}

				var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';

				var auth = serverUtils.getRequestAuth(server);

				var operations = {};
				if (operation === 'deleteItems') {
					operations[operation] = {
						value: 'true'
					};
				} else if (operation === 'addCollections' || operation === 'removeCollections') {
					operations[operation] = {
						collections: collections
					};
				} else {
					operations[operation] = {
						channels: channels
					};
				}
				if (operation === 'validatePublish') {
					operations[operation]['validation'] = {
						verbosity: 'normal'
					};
				}

				var formData = {
					q: q,
					operations: operations
				};
				// console.log(JSON.stringify(formData));

				var headers = {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest'
				};
				if (async &&async ==='true') {
					headers.Prefer = 'respond-async';
				}
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: headers,
					body: formData,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to ' + operation + ' items ');
						console.log(error);
						resolve({
							err: 'err'
						});
					}

					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}

					if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
						var statusId = response.headers && response.headers.location || '';
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);
						return resolve({
							statusId: statusId,
							data: data
						});
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.log('Failed to ' + operation + ' items - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});

			} // get token
		});
	});
};
/**
 * Publish items in a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the channel to publish items.
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishChannelItems = function (args) {
	return _bulkOpItems(args.server, 'publish', [args.channelId], args.itemIds);
};

/**
 * Unpublish items in a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the channel to publish items.
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unpublishChannelItems = function (args) {
	return _bulkOpItems(args.server, 'unpublish', [args.channelId], args.itemIds);
};

/**
 * Remove items from a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the channel to publish items.
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeItemsFromChanel = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'removeChannels', [args.channelId], args.itemIds, '', async);
};

/**
 * Add items to a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the channel to add items.
 * @param {array} args.itemIds The id of items 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addItemsToChanel = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'addChannels', [args.channelId], args.itemIds, '', async);
};

/**
 * Remove items from a collection on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.collectionId The id of the collection to remove items.
 * @param {array} args.itemIds The id of items to remove
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeItemsFromCollection = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'removeCollections', [], args.itemIds, '', async, [args.collectionId]);
};

/**
 * Add items to a collection on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the collection to add items.
 * @param {array} args.itemIds The id of items 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addItemsToCollection = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'addCollections', [], args.itemIds, '', async, [args.collectionId]);
};

/**
 * Delete items (translatable items with all tts variations) on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteItems = function (args) {
	return _bulkOpItems(args.server, 'deleteItems', [], args.itemIds);
};

/**
 * Validate items from a channel on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.channelId The id of the channel to validate items.
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.validateChannelItems = function (args) {
	return _bulkOpItems(args.server, 'validatePublish', [args.channelId], args.itemIds);
};

var _getItemOperationStatus = function (server, statusId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/bulkItemsOperations/' + statusId;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: get channel operation status');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get channel operation status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get item bulk operation status
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.statusId The id of operation status
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemOperationStatus = function (args) {
	return _getItemOperationStatus(args.server, args.statusId);
};

var _copyAssets = function (server, repositoryId, targetRepositoryId, channel, collection, itemIds) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var request = serverUtils.getRequest();

				var q = '';

				if (itemIds && itemIds.length > 0) {
					for (var i = 0; i < itemIds.length; i++) {
						if (q) {
							q = q + ' or ';
						}
						q = q + 'id eq "' + itemIds[i] + '"';
					}
				} else {
					if (collection && collection.id) {
						q = 'collections co "' + collection.id + '"';
					} else {
						q = 'repositoryId eq "' + repositoryId + '"';
						if (channel && channel.id) {
							q = q + ' AND channels co "' + channel.id + '"';
						}
					}
				}
				var operations = {
					copy: {
						targetRepository: targetRepositoryId
					}
				};
				if (collection && collection.name) {
					operations.copy['collections'] = {
						collectionName: collection.name
					};
				}
				if (channel && channel.id && !channel.isSiteChannel) {
					operations.copy['channels'] = {
						targetToChannel: [{
							id: channel.id
						}]
					};
				}

				var formData = {
					q: q,
					operations: operations
				};
				// console.log(JSON.stringify(formData));

				var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';
				var auth = serverUtils.getRequestAuth(server);

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formData,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to copy assets ');
						console.log(error);
						resolve({
							err: 'err'
						});
					}

					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}

					if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
						var statusId = response.headers && response.headers.location || '';
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);

						console.log(' - submit request');
						var count = [];
						var needNewLine = false;
						var inter = setInterval(function () {
							var jobPromise = _getItemOperationStatus(server, statusId);
							jobPromise.then(function (data) {
								if (!data || data.error || data.progress === 'failed') {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									// console.log(data);
									var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
									console.log('ERROR: copy assets failed: ' + msg);

									return resolve({
										err: 'err'
									});
								}
								if (data.completed) {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									return resolve({});
								} else {
									count.push('.');
									process.stdout.write(' - copy assets in process ' + count.join(''));
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							});
						}, 6000);
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.log('Failed to copy assets - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});

			} // get token
		});
	});
};
/**
 * Copy assets
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyAssets = function (args) {
	return _copyAssets(args.server, args.repositoryId, args.targetRepositoryId, args.channel, args.collection,
		args.itemIds);
};

// Get localization policies from server
var _getLocalizationPolicies = function (server) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/localizationPolicies?limit=99999';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to localization policies');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get localization policies : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all localization policies on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getLocalizationPolicies = function (args) {
	return _getLocalizationPolicies(args.server);
};

// Get a localization policy from server
var _getLocalizationPolicy = function (server, id) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/localizationPolicies/' + id;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get localization policy ' + id);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				return resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get localization policy ' + id + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get a localization policy on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the localization policy to query
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getLocalizationPolicy = function (args) {
	return _getLocalizationPolicy(args.server, args.id);
};

// Create localization policy on server
var _createLocalizationPolicy = function (server, name, description, requiredLanguages, defaultLanguage, optionalLanguages) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {};
				payload.name = name;
				payload.description = description || '';
				payload.requiredValues = requiredLanguages;
				payload.defaultValue = defaultLanguage;
				payload.optionalValues = optionalLanguages || [];

				var url = server.url + '/content/management/api/v1.1/localizationPolicies';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create localization policy ' + name);
						console.log(error);
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
						console.log('Failed to create localization policy ' + name + ' : ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Create localization policy on server by channel name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the localization policy to create.
 * @param {string} args.description The description of the localization policy.
 * @param {string} args.defaultLanguage The default language of the localization policy.
 * @param {array} args.requiredLanguages The list of required languages.
 * @param {array} args.optionalLanguages The list of optional languages.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createLocalizationPolicy = function (args) {
	return _createLocalizationPolicy(args.server, args.name, args.description,
		args.requiredLanguages, args.defaultLanguage, args.optionalLanguages);
};


// Update localization policy on server
var _updateLocalizationPolicy = function (server, id, name, data) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = data;
				payload.id = id;
				payload.name = name;

				var url = server.url + '/content/management/api/v1.1/localizationPolicies/' + id;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'PUT',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to update localization policy ' + (name || id));
						console.log(error);
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
						console.log('Failed to update localization policy ' + (name || id) + ' : ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Update localization policy on server
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the localization policy to update.
 * @param {string} args.name The name of the localization policy.
 * @param {string} args.data The info to update the localization policy
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateLocalizationPolicy = function (args) {
	return _updateLocalizationPolicy(args.server, args.id, args.name, args.data);
};


// Get repositories from server
var _getRepositories = function (server) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/repositories?limit=99999&fields=all';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get repositories');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = (data && (data.title || data.errorMessage)) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get repositories : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all repositories on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRepositories = function (args) {
	return _getRepositories(args.server);
};

// Get a repository from server
var _getRepository = function (server, repoId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/repositories/' + repoId;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get repository ' + repoId);
				console.log(error);
				return resolve({
					err: 'err'
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
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get repository ' + repoId + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get a repository on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the repository to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRepository = function (args) {
	return _getRepository(args.server, args.id);
};

/**
 * Get a repository with name on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the repository to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRepositoryWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			resolve({
				err: 'err'
			});
		}
		_getRepositories(args.server).then(function (result) {
			if (result.err) {
				resolve({
					err: 'err'
				});
			}

			var repositories = result || [];
			var repository;
			var name = args.name.toLowerCase();
			for (var i = 0; i < repositories.length; i++) {
				if (name === repositories[i].name.toLowerCase()) {
					repository = repositories[i];
					break;
				}
			}

			resolve({
				data: repository
			});
		});
	});
};

// Get collections of a repository from server
var _getCollections = function (server, repositoryId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections?limit=9999';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get collections');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get collections : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all collections of a repository on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.repositoryId the id of the repository
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getCollections = function (args) {
	return _getCollections(args.server, args.repositoryId);
};

// Get taxonomies from server
var _getTaxonomies = function (server) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies?fields=all&limit=9999&q=(status eq "all")';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get taxonomies');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get taxonomies : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all taxonomies on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTaxonomies = function (args) {
	return _getTaxonomies(args.server);
};

/**
 * Get a collection with name on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the collection to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getCollectionWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			resolve({
				err: 'err'
			});
		}
		_getCollections(args.server, args.repositoryId).then(function (result) {
			if (result.err) {
				resolve({
					err: 'err'
				});
			}

			var collections = result || [];
			var collection;
			var name = args.name.toLowerCase();
			for (var i = 0; i < collections.length; i++) {
				if (name === collections[i].name.toLowerCase()) {
					collection = collections[i];
					break;
				}
			}

			resolve({
				data: collection
			});
		});
	});
};


var _getResourcePermissions = function (server, id, type) {
	return new Promise(function (resolve, reject) {
		var resourceType = type === 'repository' ? 'repositories' : (type === 'type' ? 'types' : type),
			url = server.url + '/content/management/api/v1.1/' + resourceType + '/' + id + '/permissions';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get ' + type + ' permissions for ' + id);
				console.log(error);
				return resolve({
					err: 'err'
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
					resource: id,
					resourceType: type,
					permissions: data && data.items
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get ' + type + ' permissions for ' + id + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all permissions of a resource on a ron server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {string} server the server object
 * @param {string} args.id The id of the resource to query.
 * @param {string} args.type The type of the resource to query [repository | type]
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getResourcePermissions = function (args) {
	return _getResourcePermissions(args.server, args.id, args.type);
};

// Create repository on server
var _createRepository = function (server, name, description, contentTypes, channels, defaultLanguage) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {};
				payload.name = name;
				payload.description = description || '';
				payload.defaultLanguage = defaultLanguage || 'en-US';
				payload.taxonomies = [];

				if (contentTypes && contentTypes.length > 0) {
					payload.contentTypes = contentTypes;
				}
				if (channels && channels.length > 0) {
					payload.channels = channels;
				}

				var url = server.url + '/content/management/api/v1.1/repositories';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create repository ' + name);
						console.log(error);
						resolve({
							err: 'err'
						});
					}
					var data;
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						try {
							data = JSON.parse(body);
						} catch (err) {
							data = body;
						}
						resolve(data);
					} else {
						var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
						console.log('Failed to create repository ' + name + ' - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Create channel on server by channel name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the repository to create.
 * @param {string} args.description The description of the repository.
 * @param {string} args.defaultLanguage The default language of the repository.
 * @param {array} args.contentTypes The list of content types.
 * @param {array} args.channels The list of channels.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createRepository = function (args) {
	return _createRepository(args.server, args.name, args.description,
		args.contentTypes, args.channels, args.defaultLanguage);
};

// Update repository
var _updateRepository = function (server, repository, contentTypes, channels) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var data = repository;
				data.contentTypes = contentTypes;
				data.channels = channels;

				var url = server.url + '/content/management/api/v1.1/repositories/' + repository.id;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'PUT',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: data,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to add channel to repository ' + repository.name);
						console.log(error);
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = data ? JSON.stringify(data) : (response.statusMessage || response.statusCode);
						console.log('Failed to add channel to repository ' + repository.name + ' - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Update repository on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {object} repository JavaScript object containing repository
 * @param {array} args.contentTypes The list of content types.
 * @param {array} args.channels The list of channels.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateRepository = function (args) {
	return _updateRepository(args.server, args.repository, args.contentTypes, args.channels);
};

var _performPermissionOperation = function (server, operation, resourceId, resourceName, resourceType, role, users, groups) {
	return new Promise(function (resolve, reject) {
		if (users.length === 0 && groups.length === 0) {
			return resolve({});
		}
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var request = serverUtils.getRequest();

				var url = server.url + '/content/management/api/v1.1/permissionOperations';
				var auth = serverUtils.getRequestAuth(server);

				var userArr = [];
				for (var i = 0; i < users.length; i++) {
					userArr.push({
						name: users[i].loginName,
						type: 'user'
					});
				}

				for (var i = 0; i < groups.length; i++) {
					userArr.push({
						name: groups[i].name,
						type: 'group',
						groupType: groups[i].groupOriginType || 'CEC'
					});
				}
				var resource = {
					type: resourceType
				};
				if (resourceId) {
					resource['id'] = resourceId;
				}
				if (resourceName) {
					resource['name'] = resourceName;
				}
				var operations = {};
				operations[operation] = {
					resource: resource
				};
				if (operation === 'share') {
					operations[operation]['roles'] = [{
						name: role,
						users: userArr
					}];
				} else {
					operations[operation]['users'] = userArr;
				}

				var formData = {
					operations: operations
				};
				// console.log(JSON.stringify(formData));

				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: formData,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('ERROR: failed to ' + operation + ' resource ');
						console.log(error);
						resolve({
							err: 'err'
						});
					}

					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}

					if (response && response.statusCode === 200) {
						var failedRoles = data && data.operations[operation] && data.operations[operation].failedRoles;
						var msg = '';
						if (failedRoles && failedRoles.length > 0) {
							// console.log(JSON.stringify(failedRoles, null, 2));
							for (var i = 0; i < failedRoles.length; i++) {
								for (var j = 0; j < failedRoles[i].users.length; j++) {
									msg = msg + ' ' + (failedRoles[i].users[j].name || failedRoles[i].users[j].id) + ': ' + failedRoles[i].users[j].message;
								}
							}
							console.log('ERROR: failed to ' + operation + ' resource: ' + msg);
							resolve({
								err: 'err'
							});

						} else {
							resolve(data);
						}
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.log('ERROR: failed to ' + operation + ' resource ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Share/Unshare a resource
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {String} operation share | unshare
 * @param {String} args.resourceId the id of the resource
 * @param {String} args.resourceType the type of the resource
 * @param {String} args.resourceName the name of the resource
 * @param {String} args.role manager | contributor | viewer
 * @param {array} args.users The list of the users 
 * @param {array} args.groups The list of the groups
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.performPermissionOperation = function (args) {
	return _performPermissionOperation(args.server,
		args.operation, args.resourceId, args.resourceName, args.resourceType, args.role, args.users || [], args.groups || []);
};

// Get typefrom server
var _getContentType = function (server, typeName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/types/' + typeName;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get type ' + typeName);
				console.log(error);
				return resolve({
					err: 'err'
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
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get type ' + typeName + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get a content type on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the type to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentType = function (args) {
	return _getContentType(args.server, args.name);
};

var _getUser = function (server, userName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/users/items?info=' + userName;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get user ' + userName);
				console.log(error);
				return resolve({
					err: 'err'
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
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get user ' + userName + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get user info on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of user.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getUser = function (args) {
	return _getUser(args.server, args.name);
};

var _getFolderUsers = function (server, folderId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/shares/' + folderId + '/items';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get folder users ' + folderId);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				var users = [];
				if (data && data.items && data.items.length > 0) {
					for (var i = 0; i < data.items.length; i++) {
						users.push({
							id: data.items[i].user.id,
							name: data.items[i].user.loginName || data.items[i].user.displayName,
							type: data.items[i].user.type,
							role: data.items[i].role
						});
					}
				}
				resolve({
					id: folderId,
					data: users
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get folder users ' + folderId + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get shared folder users on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the folder
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getFolderUsers = function (args) {
	return _getFolderUsers(args.server, args.id);
};

var _shareFolder = function (server, folderId, userId, role, createNew) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/shares/' + folderId;
		if (!createNew) {
			url = url + '/role';
		}
		var options = {
			method: createNew ? 'POST' : 'PUT',
			url: url,
			auth: serverUtils.getRequestAuth(server),
			headers: {
				'Content-Type': 'application/json'
			},
			body: {
				'userID': userId,
				'role': role
			},
			json: true
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to share folder ' + folderId);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(body);
			} else {
				var objName = body && body.user ? body.user.displayName : 'folder ' + folderId;
				var msg = body && body.errorMessage ? body.errorMessage : (response ? (response.statusMessage || response.statusCode) : '');
				console.log('ERROR: failed to share ' + objName + ' : ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Share folder with a user on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the folder
 * @param {string} args.userId the user id
 * @param {string} args.role the role
 * @param {boolean} args.create the flag to indicate create new sharing otherwise update exising
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.shareFolder = function (args) {
	return _shareFolder(args.server, args.id, args.userId, args.role, (args.create === undefined ? true : args.create));
};

var _unshareFolder = function (server, folderId, userId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/shares/' + folderId + '/user';
		var options = {
			method: 'DELETE',
			url: url,
			auth: serverUtils.getRequestAuth(server),
			headers: {
				'Content-Type': 'application/json'
			},
			body: {
				'userID': userId
			},
			json: true
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to unshare folder ' + folderId);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(body);
			} else {
				console.log('ERROR: failed to unshare folder ' + folderId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});

	});
};
/**
 * Unshare folder with a user on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.id The id of the folder
 * @param {string} args.userId the user id
 * @param {string} args.role the role
 * @param {boolean} args.create the flag to indicate create new sharing otherwise update exising
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unshareFolder = function (args) {
	return _unshareFolder(args.server, args.id, args.userId);
};

var _getGroups = function (server, count, offset) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/social/api/v1/groups?count=' + count + '&offset=' + offset;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get groups');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(' - url: ' + url + ' hasMore: ' + (data ? data.hasMore : 'unknown'));

			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = response.statusMessage || response.statusCode;
				console.log('ERROR: failed to get groups ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get CEC groups on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getGroups = function (args) {
	return new Promise(function (resolve, reject) {
		var count = 1000;
		var offset = 0;
		var items = [];
		//
		// Currently support up to 12000 groups
		//
		console.log(' - querying groups ...');
		_getGroups(args.server, count, offset)
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items)
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(items);
				}
				if (result.items) {
					items = items.concat(result.items);
				}
				if (!result.hasMore) {
					return resolve(items);
				}

				console.log(' - querying groups ...');
				offset = offset + count;
				return _getGroups(args.server, count, offset);
			})
			.then(function (result) {
				if (result && result.items) {
					items = items.concat(result.items);
				}
				// console.log(' - total groups: ' + items.length);
				return resolve(items);
			});
	});
};

var _getGroupMembers = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/social/api/v1/groups/' + id + '/members';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get members of group ' + (name || id));
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				var msg = response.statusMessage || response.statusCode;
				console.log('ERROR: failed to get members of group ' + (name || id) + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get members of a group on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getGroupMembers = function (args) {
	return _getGroupMembers(args.server, args.id, args.name);
};

var _createConnection = function (request, server) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/osn/social/api/v1/connections';

		var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
			'Basic ' + serverUtils.btoa(server.username + ':' + server.password);

		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: auth
			},
		};
		// console.log(postData);

		request(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create connection');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(data);
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = response.statusMessage || response.statusCode;
				console.log('ERROR: failed to create connection' + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Establish OSN connection on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createConnection = function (args) {
	return _createConnection(args.request, args.server);
};

var _getGroup2 = function (request, server, connection, name) {
	return new Promise(function (resolve, reject) {

		// console.log(' - get group: ' + name);

		var apiVersion = connection.apiVersion;
		var apiRandomID = connection.apiRandomID;

		var url = server.url + '/osn/fc/RemoteJSONBatch';
		var payload = [{
			'ModuleName': 'XMemberModule$Server',
			'MethodName': 'findMembers',
			'Arguments': [{
				'IncludeGroups': true,
				'IncludeUsers': false,
				'SearchString': name,
				'NumResults': 1
			}]
		}];

		var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
			'Basic ' + serverUtils.btoa(server.username + ':' + server.password);
		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: auth,
				'X-Requested-With': 'XMLHttpRequest',
				'X-Waggle-APIVersion': apiVersion,
				'X-Waggle-RandomID': apiRandomID
			},
			body: payload,
			json: true
		};
		// console.log(JSON.stringify(postData, null, 4));

		request(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get group');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(JSON.stringify(data, null, 4));

			if (response && response.statusCode === 200) {
				var returnStatus = data && data[0] && data[0].returnStatus;
				var items = returnStatus === 'success' ? data && data[0] && data[0].returnValue : [];
				return resolve({
					data: items
				});
			} else {
				var msg = response.statusMessage || response.statusCode;
				console.log('ERROR: failed to get group ' + name + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});

};

var _getGroup = function (server, name) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/social/api/v1/groups/' + name;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		// console.log(options);
		request(options, function (error, response, body) {
			if (error) {
				// console.log('ERROR: failed to get group ' + name);
				// console.log(error);
				return resolve({
					err: 'err'
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
				var msg = response.statusMessage || response.statusCode;
				// console.log('ERROR: failed to get group ' + name + ' ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get CEC group with name on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getGroup = function (args) {
	return _getGroup(args.server, args.name);
};

var _createGroup = function (request, server, name, type) {
	return new Promise(function (resolve, reject) {

		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/groups';
					var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
						'Basic ' + serverUtils.btoa(server.username + ':' + server.password);
					var payload = {
						name: name,
						groupType: type
					};
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: auth,
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: payload,
						json: true
					};
					// console.log(postData);
					request(postData, function (error, response, body) {
						if (error) {
							console.log('ERROR: create group ' + name);
							console.log(error);
							return resolve({
								err: 'err'
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
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.log('ERROR: failed to create group ' + name + ' : ' + msg);
							return resolve({
								err: 'err'
							});
						}
					});
				}
			});
	});
};
/**
 * Create an OCE group on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createGroup = function (args) {
	return _createGroup(args.request, args.server, args.name, args.type);
};

var _deleteGroup = function (request, server, id, name) {
	return new Promise(function (resolve, reject) {

		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/groups/' + id;
					var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
						'Basic ' + serverUtils.btoa(server.username + ':' + server.password);

					var postData = {
						method: 'DELETE',
						url: url,
						headers: {
							Authorization: auth,
							'X-Waggle-RandomID': result.apiRandomID
						}
					};

					request(postData, function (error, response, body) {
						if (error) {
							console.log('ERROR: delete group ' + (name || id));
							console.log(error);
							return resolve({
								err: 'err'
							});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {
							data = body;
						}

						if (response && response.statusCode === 200) {
							resolve({});
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.log('ERROR: failed to delete group ' + (name || id) + ' : ' + msg);
							return resolve({
								err: 'err'
							});
						}
					});
				}
			});
	});
};
/**
 * Delete an OCE group on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteGroup = function (args) {
	return _deleteGroup(args.request, args.server, args.id, args.name);
};

var _addMemberToGroup = function (request, server, apiRandomID, id, name, memberId, memberName, role, isGroup) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/osn/social/api/v1/groups/' + id + '/members';
		var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
			'Basic ' + serverUtils.btoa(server.username + ':' + server.password);
		var payload = {
			member: memberName,
			role: role,
			isGroup: isGroup
		};
		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: auth,
				'X-Waggle-RandomID': apiRandomID
			},
			body: payload,
			json: true
		};
		// console.log(postData);
		request(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: add member ' + (memberName || memberId) + ' to group ' + (name || id));
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(data);
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
				console.log('ERROR: add member ' + (memberName || memberId) + ' to group ' + (name || id) + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Add members to an OCE group on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addMembersToGroup = function (args) {
	var request = args.request;
	var server = args.server;
	var id = args.id;
	var name = args.name;
	var members = args.members || [];
	return new Promise(function (resolve, reject) {
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve([{
						err: 'err'
					}]);
				} else {
					var apiRandomID = result.apiRandomID;
					var memberPromises = [];
					for (var i = 0; i < members.length; i++) {
						memberPromises.push(_addMemberToGroup(request, server, apiRandomID, id, name, members[i].id,
							members[i].name, members[i].role, members[i].isGroup));
					}
					Promise.all(memberPromises).then(function (results) {
						return resolve(results);
					});
				}
			});
	});
};

var _removeMemberFromGroup = function (request, server, apiRandomID, id, name, memberId, memberName) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/osn/social/api/v1/groups/' + id + '/members/' + memberId;
		var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
			'Basic ' + serverUtils.btoa(server.username + ':' + server.password);

		var postData = {
			method: 'DELETE',
			url: url,
			headers: {
				Authorization: auth,
				'X-Waggle-RandomID': apiRandomID
			}
		};
		// console.log(postData);
		request(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: remove member ' + (memberName || memberId) + ' from group ' + (name || id));
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(data);
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
				console.log('ERROR: remove member ' + (memberName || memberId) + ' from group ' + (name || id) + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Remove members from an OCE group on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeMembersFromGroup = function (args) {
	var request = args.request;
	var server = args.server;
	var id = args.id;
	var name = args.name;
	var members = args.members || [];
	return new Promise(function (resolve, reject) {
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve([{
						err: 'err'
					}]);
				} else {
					var apiRandomID = result.apiRandomID;
					var memberPromises = [];
					for (var i = 0; i < members.length; i++) {
						memberPromises.push(_removeMemberFromGroup(request, server, apiRandomID, id, name,
							members[i].id, members[i].name));
					}
					Promise.all(memberPromises).then(function (results) {
						return resolve(results);
					});
				}
			});
	});
};

var _getTaxonomyExportStatus = function (server, id, jobId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/' + id + '/export/' + jobId;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: get taxonomy export status');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get taxonomy export status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
// Export taxonomy from server
var _exportTaxonomy = function (server, id, name, status) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					status: status
				};

				var url = server.url + '/content/management/api/v1.1/taxonomies/' + id + '/export';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};

				request(postData, function (error, response, body) {
					if (error) {
						console.log('ERROR: failed to export taxonomy ' + name);
						console.log(error);
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
						var jobId = data && data.jobId;
						if (jobId) {
							console.log(' - submit request');
							var count = [];
							var needNewLine = false;
							var inter = setInterval(function () {
								var jobPromise = _getTaxonomyExportStatus(server, id, jobId);
								jobPromise.then(function (data) {
									if (!data || data.status === 'FAILED') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										var msg = data && data.summary ? data.summary : '';
										console.log('ERROR: export taxonomy failed: ' + msg);

										return resolve({
											err: 'err'
										});
									}
									if (data.status === 'COMPLETED') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}

										var downloadLink;
										if (data.downloadLink) {
											for (var i = 0; i < data.downloadLink.length; i++) {
												if (data.downloadLink[i].rel === 'self' && data.downloadLink[i].href) {
													downloadLink = data.downloadLink[i].href;
													break;
												}
											}
											downloadLink = downloadLink || data.downloadLink[0].href;
										}
										return resolve({
											downloadLink: downloadLink
										});
									} else {
										count.push('.');
										process.stdout.write(' - export taxonomy in process ' + count.join(''));
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								});
							}, 6000);
						} else {
							console.log('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to export taxonomy ' + name + ' - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Export taxonomy from server
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy
 * @param {string} args.id The id of the taxonomy
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportTaxonomy = function (args) {
	return _exportTaxonomy(args.server, args.id, args.name, args.status);
};

var _getTaxonomyImportStatus = function (server, jobId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/import/' + jobId;
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: get taxonomy import status');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			// console.log(data);
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get taxonomy import status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
// Import taxonomy to server
var _importTaxonomy = function (server, fileId, name, isNew, hasNewIds, taxonomy) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					exportDocId: fileId,
					isNew: isNew,
					hasNewIds: hasNewIds,
					taxonomy: taxonomy
				};

				var url = server.url + '/content/management/api/v1.1/taxonomies/import';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};
				// console.log(postData);
				request(postData, function (error, response, body) {
					if (error) {
						console.log('ERROR: failed to import taxonomy ' + name);
						console.log(error);
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						var jobId = data && data.jobId;
						if (jobId) {
							console.log(' - submit request');
							var count = [];
							var needNewLine = false;
							var inter = setInterval(function () {
								var jobPromise = _getTaxonomyImportStatus(server, jobId);
								jobPromise.then(function (data) {
									if (!data || data.status === 'FAILED') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										var msg = data && data.errorDescription ? data.errorDescription : '';
										console.log('ERROR: import taxonomy failed: ' + msg);

										return resolve({
											err: 'err'
										});
									}
									if (data.status === 'COMPLETED') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										return resolve({});

									} else {
										count.push('.');
										process.stdout.write(' - export taxonomy in process ' + count.join(''));
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								});
							}, 6000);
						} else {
							console.log('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to export taxonomy ' + name + ' - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Import taxonomy to server
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fileId The file id
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importTaxonomy = function (args) {
	return _importTaxonomy(args.server, args.fileId, args.name, args.isNew, args.hasNewIds, args.taxonomy);
};

var _getTaxonomyActionStatus = function (server, url, action) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};

		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: get ' + action + ' taxonomy  status');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get ' + action + ' taxonomy status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
// perform action on taxonomy
var _controlTaxonomy = function (server, id, name, action, isPublishable, channels) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {};
				if (action === 'promote') {
					payload.isPublishable = isPublishable;
				} else {
					payload.channels = channels;
				}

				var url = server.url + '/content/management/api/v1.1/taxonomies/' + id + '/' + action;
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					method: 'POST',
					url: url,
					auth: auth,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					body: payload,
					json: true
				};
				// console.log(postData);

				request(postData, function (error, response, body) {
					if (error) {
						console.log('ERROR: failed to ' + action + ' taxonomy ' + name);
						console.log(error);
						resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						var statusUrl = response.headers && response.headers.location;
						if (statusUrl) {
							console.log(' - submit request');
							var count = [];
							var needNewLine = false;
							var inter = setInterval(function () {
								var jobPromise = _getTaxonomyActionStatus(server, statusUrl, action);
								jobPromise.then(function (data) {
									if (!data || data.progress === 'failed' || data.progress === 'aborted') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										var msg = data && data.summary ? data.summary : '';
										console.log('ERROR: export taxonomy failed: ' + msg);

										return resolve({
											err: 'err'
										});
									}
									if (data.completed && data.progress === 'succeeded') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										return resolve({});

									} else {
										count.push('.');
										process.stdout.write(' - ' + action + ' taxonomy in process ' + count.join(''));
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								});
							}, 5000);
						} else {
							console.log('ERROR: no job info is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to ' + action + ' taxonomy ' + name + ' - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Control taxonomy on server by channel name
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy
 * @param {string} args.id The id of the taxonomy
 * @param {string} args.action The action to perform [promote | publish | unpublish]
 * @param {boolean} args.isPublishable Allow publishing when promote
 * @param {array} channels Channels when publish or unpublish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.controlTaxonomy = function (args) {
	return _controlTaxonomy(args.server, args.id, args.name, args.action, args.isPublishable, args.channels);
};

// Get recommendations from server
var _getRecommendations = function (server, repositoryId, repositoryName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/personalization/recommendations';
		url = url + '?q=(repositoryId eq "' + repositoryId + '")&fields=all&links=none&limit=9999';
		var options = {
			method: 'GET',
			url: url,
			auth: serverUtils.getRequestAuth(server)
		};
		request(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get recommendations from repository ' + (repositoryName || repositoryId));
				console.log(error);
				return resolve({
					err: 'err'
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
					repositoryId: repositoryId,
					repositoryName: repositoryName,
					data: data && data.items
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get recommendations from repository ' + (repositoryName || repositoryId) + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all recommendations on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRecommendations = function (args) {
	return _getRecommendations(args.server, args.repositoryId, args.repositoryName);
};

var _getContentJobStatus = function (server, jobId) {
	return new Promise(function (resolve, reject) {
		var statusUrl = server.url + '/content/management/api/v1.1/content-templates/exportjobs/' + jobId;
		var auth = serverUtils.getRequestAuth(server);
		var options = {
			url: statusUrl,
			'auth': auth
		};
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get export job status');
				console.log(err);
				return resolve({
					status: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				return resolve({
					status: 'success',
					data: data
				});
			} else {
				console.log('ERROR: Failed to get export job status: ' + response.statusCode);
				return resolve({
					status: response.statusCode
				});
			}
		});
	});
};
/**
 * Check export/import status on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentJobStatus = function (args) {
	return _getContentJobStatus(args.server, args.jobId);
};

var _exportRecommendation = function (server, id, name, published, publishedChannelId) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/content-templates/exportjobs';
				var auth = serverUtils.getRequestAuth(server);
				var contentTemplateName = 'contentexport';
				var postData = {
					'name': contentTemplateName,
					'items': {
						contentItems: [id]
					}
				};

				if (published && publishedChannelId) {
					postData.exportPublishedItems = true;
					postData.channelIds = [{
						id: publishedChannelId
					}];
				}

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					auth: auth,
					body: JSON.stringify(postData)
				};
				// console.log(options);

				request(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to export recommendation ' + name);
						console.log(err);
						resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}
					// console.log(data);
					if (response && (response.statusCode === 200 || response.statusCode === 201)) {
						var jobId = data && data.jobId;
						if (!jobId) {
							return resolve({
								err: 'err'
							});
						} else {
							return resolve({
								jobId: jobId
							});
						}
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to export: ' + msg);
						return resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Export a recommendation on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportRecommendation = function (args) {
	return _exportRecommendation(args.server, args.id, args.name, args.published, args.publishedChannelId);
};

var _importContent = function (server, fileId, repositoryId, channelId, update) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/content-templates/importjobs';

				var auth = serverUtils.getRequestAuth(server);

				var postData = {
					'exportDocId': fileId,
					'repositoryId': repositoryId,
					'channelIds': channelId ? [channelId] : []
				};
				if (update) {
					postData.source = 'sites';
				}

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					auth: auth,
					body: JSON.stringify(postData)
				};
				// console.log(options);
				request(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to import');
						console.log(err);
						return resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}
					// console.log(data);
					if (response && (response.statusCode === 200 || response.statusCode === 201)) {
						var jobId = data && data.jobId;
						if (!jobId) {
							return resolve({
								err: 'err'
							});
						} else {
							return resolve({
								jobId: jobId
							});
						}
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to import: ' + msg);
						return resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};

/**
 * Import content package to server
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importContent = function (args) {
	return _importContent(args.server, args.fileId, args.repositoryId, args.channelId, args.update);
};

var _exportContentItem = function (server, id, name, published) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/content-templates/exportjobs';
				var auth = serverUtils.getRequestAuth(server);
				var contentTemplateName = 'contentexport';
				var postData = {
					'name': contentTemplateName,
					'items': {
						contentItems: [id]
					}
				};

				if (published) {
					postData.exportPublishedItems = true;
				}

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					auth: auth,
					body: JSON.stringify(postData)
				};
				// console.log(options);

				request(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to export content item ' + (name || id));
						console.log(err);
						resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						data = body;
					}
					// console.log(data);
					if (response && (response.statusCode === 200 || response.statusCode === 201)) {
						var jobId = data && data.jobId;
						if (!jobId) {
							return resolve({
								err: 'err'
							});
						} else {
							return resolve({
								jobId: jobId
							});
						}
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to export: ' + msg);
						return resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};
/**
 * Export a content item on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportContentItem = function (args) {
	return _exportContentItem(args.server, args.id, args.name, args.published);
};