/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */
var request = require('request'),
	os = require('os'),
	fs = require('fs'),
	readline = require('readline'),
	serverUtils = require('./serverUtils');

///////////////////////////////////////////////////////////
//                 Documents Management APIs
///////////////////////////////////////////////////////////

// Create Folder on server
var _createFolder = function (server, parentID, foldername) {
	return new Promise(function (resolve, reject) {
		var body = {
			'name': foldername,
			'description': ''
		};
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/folders/' + parentID,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};
		// console.log(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create folder ' + foldername);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {}
				resolve(data);
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

var _findFolderItems = function (server, parentId, parentPath, _files) {
	// console.log(' - folder: id=' + parentId + ' path=' + parentPath);
	return new Promise(function (resolve, reject) {

		if (!parentId) {
			return resolve(_files);
		}

		var items;
		var size = 10000;
		_getChildItems(server, parentId, size)
			.then(function (result) {
				if (!result) {
					resolve();
				}

				items = result && result.items || [];
				// console.log(' - total ' + result.childItemsCount);
				// console.log(' - offset: ' + result.offset + ' count: ' + result.count);

				var remaining = result.childItemsCount - size;
				var queryAgainPromises = [];
				var extra = 1;
				while (remaining > 0) {
					var offset = size * extra;
					queryAgainPromises.push(_.getChildItems({
						server: server,
						parentID: parentId,
						limit: size,
						offset: offset
					}));
					remaining = remaining - size;
					extra = extra + 1;
				}

				return Promise.all(queryAgainPromises);

			})
			.then(function (results) {

				if (results && results.length > 0) {
					for (var i = 0; i < results.length; i++) {
						// console.log(' - ' + i + ' offset: ' + results[i].offset + ' count: ' + results[i].count);
						var items2 = results[i] && results[i].items;
						if (items2.length > 0) {
							items = items.concat(items2);
						}
					}
				}

				var subfolderPromises = [];
				for (var i = 0; i < items.length; i++) {
					if (items[i].type === 'file') {
						// console.log(' - file: id=' + items[i].id + ' path=' + parentPath + '/' + items[i].name);
						_files.push({
							type: 'File',
							id: items[i].id,
							path: parentPath ? parentPath + '/' + items[i].name : items[i].name,
							size: items[i].size
						});
					} else {
						_files.push({
							type: 'Folder',
							id: items[i].id,
							path: parentPath ? parentPath + '/' + items[i].name : items[i].name
						});
						subfolderPromises.push(_findFolderItems(server, items[i].id, parentPath ? parentPath + '/' + items[i].name : items[i].name, _files));
					}
				}
				return Promise.all(subfolderPromises);

			})
			.then(function (results) {
				resolve(_files);
			});

	});
};
/**
 * Find all items of a folder (folder tree)on server by folder name
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.folderPath The path of the folder.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.findFolderItems = function (args) {
	var _files = [];
	var parentPath = '';
	return _findFolderItems(args.server, args.parentID, parentPath, _files);
};

// Delete Folder on server
var _deleteFolder = function (server, fFolderGUID, folderPath) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'DELETE',
			url: server.url + '/documents/api/1.2/folders/' + fFolderGUID,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
		};

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete folder ' + fFolderGUID);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {}

				resolve(data);
			} else {
				console.log('ERROR: failed to delete folder ' + (folderPath || fFolderGUID) + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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
	return _deleteFolder(args.server, args.fFolderGUID, args.folderPath);
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

// Get folder metadata
var _getFolderMetadata = function (server, folderId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/folders/' + folderId + '/metadata';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get folder metadata ' + folderId);
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
				var metadata = {};
				if (data && data.metadata) {
					Object.keys(data.metadata).forEach(function (key) {
						var collectionMetadata = data.metadata[key];
						Object.assign(metadata, collectionMetadata);
					});
				}
				// console.log(metadata);
				resolve({
					folderId: folderId,
					metadata: metadata
				});
			} else {
				console.log('ERROR: failed to get folder metadata ' + folderId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});

	});
};
/**
 * Get a folder's metadata on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.folderId The DOCS GUID for the folder
 * @returns {array} The array of data object returned by the server.
 */
module.exports.getFolderMetadata = function (args) {
	return _getFolderMetadata(args.server, args.folderId);
};

// Find file by name with the parent folder
var _findFile = function (server, parentID, filename, showError, itemtype) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/folders/' + parentID + '/items?limit=9999';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
var _createFile = function (server, parentID, filename, contents, filepath) {
	return new Promise(function (resolve, reject) {
		var FormData = require('form-data');
		var form = new FormData();
		form.append('jsonInputParameters', JSON.stringify({
			'parentID': parentID
		}));
		form.append('primaryFile', contents);

		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/files/data/',
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: form
		};

		// console.log(' - uploading file ...');
		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
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
				if (data && filepath) {
					data.filepath = filepath;
				}
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
	return _createFile(args.server, args.parentID, args.filename, args.contents, args.filepath);
};


// Read file from server
var _readFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';
		var options = {
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			encoding: null
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
var _deleteFile = function (server, fFileGUID, filePath) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'DELETE',
			url: server.url + '/documents/api/1.2/files/' + fFileGUID,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to delete file ' + fFileGUID);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {}

				resolve(data);
			} else {
				console.log('ERROR: failed to delete file ' + (filePath || fFileGUID) + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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
	return _deleteFile(args.server, args.fFileGUID, args.filePath);
};

// Get file versions from server
var _getFileVersions = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/versions';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(options);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

///////////////////////////////////////////////////////////
//                  Content Management APIs
///////////////////////////////////////////////////////////

var _getItem = function (server, id, expand) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items/' + id;
		if (expand) {
			url = url + '?expand=' + expand;
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

var _queryItems = function (server, q, fields, orderBy, limit, offset, channelToken, includeAdditionalData, aggregationResults) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items';
		var sep = '?';
		if (q) {
			url = url + sep + 'q=' + q;
			sep = '&';
		}
		url = url + sep + 'limit=' + (limit || 10000);
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
		if (includeAdditionalData) {
			url = url + '&includeAdditionalData=true';
		}
		if (aggregationResults) {
			url = url + '&aggs={"name":"item_count_per_category","field":"id"}';
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
					hasMore: data && data.hasMore,
					limit: data && data.limit,
					aggregationResults: data && data.aggregationResults
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

var _scrollItems = function (server, url) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to scroll items with ' + query);
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
				console.log('ERROR: failed to scroll items with ' + query + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
var _scrollAllItems = function (server, q, fields, orderBy, limit, offset, channelToken, includeAdditionalData) {
	var SCROLL_SIZE = 4000;
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items';
		var sep = '?';
		if (q) {
			url = url + sep + 'q=' + q;
			sep = '&';
		}
		url = url + sep + 'limit=' + SCROLL_SIZE;
		if (orderBy) {
			url = url + '&orderBy=' + orderBy;
		}
		if (channelToken) {
			url = url + '&channelToken=' + channelToken;
		}
		if (fields) {
			url = url + '&fields=' + fields;
		}
		if (includeAdditionalData) {
			url = url + '&includeAdditionalData=true';
		}
		url = url + '&scroll=true';

		var groups = [];
		// 4000 * 1000 = 4,000,000 should be enough for now
		for (var i = 1; i < 1000; i++) {
			groups.push(1);
		}

		var items = [];

		var startTime = new Date();
		var doGetItems = groups.reduce(function (itemPromise) {
				return itemPromise.then(function (result) {
					if (result) {
						if (result.items && result.items.length > 0) {
							items = items.concat(result.items);
							process.stdout.write(' - fetching items ' + items.length +
								' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
						}
						// console.log(' - count: ' + result.count + ' limit: ' + result.limit);
						if (result.count > 0 && result.scrollId) {
							// continue to next scroll
							return _scrollItems(server, url + '&scrollId=' + result.scrollId);
						}
					}
				});
			},
			// first scroll
			_scrollItems(server, url));

		doGetItems.then(function (result) {
			if (items.length > 0) {
				process.stdout.write(os.EOL);
			}
			if (offset && limit) {
				return resolve(items.slice(offset, offset + limit));
			} else if (offset) {
				return resolve(items.slice(offset, items.length));
			} else if (limit) {
				return resolve(items.slice(0, items.length));
			} else {
				return resolve(items);
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
	return new Promise(function (resolve, reject) {
		// find out the total first
		_queryItems(args.server, args.q, args.fields, args.orderBy, 1, 0, args.channelToken, args.includeAdditionalData)
			.then(function (result) {
				items = result && result.data || [];
				if (items.length == 0 || result.limit === args.limit) {
					return resolve(result);
				}

				var totalCount = result.limit;
				// console.log(' - total items: ' + totalCount);
				var offset = args.offset ? args.offset : 0;
				if (totalCount < 10000 || (args.limit && (offset + args.limit < 10000))) {
					_queryItems(args.server, args.q, args.fields, args.orderBy, args.limit, args.offset, args.channelToken, args.includeAdditionalData, args.aggregationResults)
						.then(function (result) {
							return resolve(result);
						});
				} else {
					// console.log(' - scrolling items...');
					_scrollAllItems(args.server, args.q, args.fields, args.orderBy, args.limit, args.offset, args.channelToken, args.includeAdditionalData)
						.then(function (result) {
							var items = result;
							return resolve({
								data: items,
								hasMore: false,
								limit: items.length,
								aggregationResults: items.aggregationResults
							});
						});
				}

			});
	});
};

var _getAllItemIds = function (server, repositoryId, channelId, publishedassets) {
	return new Promise(function (resolve, reject) {
		var max = 1000000;
		var url = server.url + '/content/management/api/v1.1/content-templates/export/items?repositoryId=' + repositoryId + '&limit=' + max;
		if (channelId) {
			url = url + '&channelId=' + channelId;
		}
		if (publishedassets) {
			url = url + '&publishedItems=true';
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get all item Ids ' + query);
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
					hasMore: data && data.hasMore,
					limit: data && data.limit
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get all item Ids ' + query + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get Id of all items
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.repositoryId the repository
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getAllItemIds = function (args) {
	return _getAllItemIds(args.server, args.repositoryId, args.channelId, args.publishedassets);
};

// Create item on server
var _createItem = function (server, repositoryId, type, name, desc, fields, language) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					repositoryId: repositoryId,
					type: type,
					name: name,
					description: desc ? desc : '',
					language: language,
					fields: fields
				};

				var url = server.url + '/content/management/api/v1.1/items';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create create ' + name);
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
						console.log('Failed to create item ' + name + ' : ' + (response.statusMessage || response.statusCode));
						console.log(data);
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
 * create an item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.item the item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createItem = function (args) {
	return _createItem(args.server, args.repositoryId, args.type,
		args.name, args.desc, args.fields, args.language);
};

// Create digital item on server
var _createDigitalItem = function (server, repositoryId, type, filename, contents, fields, slug) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var FormData = require('form-data');
				var form = new FormData();
				var item = {
					repositoryId: repositoryId,
					type: type
				};
				if (slug) {
					item.slug = slug;
				}
				if (fields && Object.keys(fields).length > 0) {
					item.fields = fields;
				}

				form.append('item', JSON.stringify(item));
				form.append('file', contents);

				var url = server.url + '/content/management/api/v1.1/items';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: form
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create create digital item for ' + filename);
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.log('Failed to create digital item for ' + filename + ' : ' + msg);
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.log(data['o:errorDetails']);
						}
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
 * create a digital item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.item the item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createDigitalItem = function (args) {
	return _createDigitalItem(args.server, args.repositoryId, args.type, args.filename, args.contents, args.fields, args.slug);
};


// Update digital item on server
var _updateDigitalItem = function (server, item, contents) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var FormData = require('form-data');
				var form = new FormData();

				if (contents) {
					form.append('item', JSON.stringify(item));
					form.append('file', contents);
				}

				var url = server.url + '/content/management/api/v1.1/items/' + item.id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};
				if (contents) {
					postData.body = form;
				} else {
					postData.headers['Content-Type'] = 'application/json';
					postData.body = JSON.stringify(item);
				}
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to update create digital item ' + item.id);
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.log('Failed to update digital item ' + item.id + ' : ' + msg);
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.log(data['o:errorDetails']);
						}
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
 * Update a digital item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.item the item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateDigitalItem = function (args) {
	return _updateDigitalItem(args.server, args.item, args.contents, args.fields);
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
					// console.log(data);
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
				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
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
				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
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

// Delete content type on server
var _deleteContentType = function (server, id) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/types/' + id;
				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete contennt type ' + id);
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
						console.log('Failed to delete content type ' + id + ' : ' + (response.statusMessage || response.statusCode));
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
 * Delete cotent type on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.name Name of the content type to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteContentType = function (args) {
	return _deleteContentType(args.server, args.name);
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

				var url = server.url + '/content/management/api/v1.1/repositories/' + repository.id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(data),
					json: true
				};
				// console.log(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			return resolve({});
		}
		var channelName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/channels';
		url = url + '?q=(name mt "' + encodeURIComponent(channelName) + '")';
		url = url + '&fields=all';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get channel ' + channelName);
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
				var channels = data && data.items || [];
				var channel;
				for (var i = 0; i < channels.length; i++) {
					if (channels[i].name && channels[i].name.toLowerCase() === channelName.toLocaleLowerCase()) {
						channel = channels[i];
						break;
					}
				}
				if (channel) {
					resolve({
						data: channel
					});
				} else {
					// console.log('ERROR:  channel ' + channelName + ' not found');
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get channel ' + channelName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};


// perform bulk operation on items in a channel from server
var _bulkOpItems = function (server, operation, channelIds, itemIds, queryString, async, collectionIds, actOnDependencies) {
	// console.log('_bulkOpItems: ' + operation);
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

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

				var operations = {};
				if (operation === 'deleteItems' || operation === 'approve' || operation === 'setAsTranslated') {
					operations[operation] = {
						value: 'true'
					};
				} else if (operation === 'addCollections' || operation === 'removeCollections') {
					operations[operation] = {
						collections: collections
					};
				} else if (operation === 'lock' || operation === 'unlock') {
					operations[operation] = {
						dependencies: !!actOnDependencies
					}
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
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				};
				if (async &&async ==='true') {
					headers.Prefer = 'respond-async';
				}
				var postData = {
					method: 'POST',
					url: url,
					headers: headers,
					body: JSON.stringify(formData),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
						var statusId = response.location || '';
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
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'unpublish', [args.channelId], args.itemIds, '', async);
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
 * Approve items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.approveItems = function (args) {
	return _bulkOpItems(args.server, 'approve', [], args.itemIds);
};

/**
 * Lock items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @param {array} args.actOnDependencies Whether to unlock dependencies, too
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.lockItems = function (args) {
	return _bulkOpItems(args.server, 'lock', [], args.itemIds, undefined, undefined, undefined, args.actOnDependencies);
};

/**
 * Unlock items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @param {array} args.actOnDependencies Whether to unlock dependencies, too
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unlockItems = function (args) {
	return _bulkOpItems(args.server, 'unlock', [], args.itemIds, undefined, undefined, undefined, args.actOnDependencies);
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

/**
 * Set items as translated on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.ItemsSetAsTranslated = function (args) {
	return _bulkOpItems(args.server, 'setAsTranslated', [], args.itemIds);
};

var _getPublishingJobItems = function (server, jobId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/bulkItemsOperations/publish/' + jobId + '/ids';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				return resolve({
					error: error
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
				console.log('getPublishingJobItems: ' + msg);
				return resolve({
					error: data
				});
			}
		});
	});
};
/**
 * Get the items that will be published in the referenced publishing job
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.jobId The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getPublishingJobItems = function (args) {
	return _getPublishingJobItems(args.server, args.jobId);
};


var _getItemOperationStatus = function (server, statusId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/bulkItemsOperations/' + statusId;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(formData),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
						var statusId = response.location || '';
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);

						console.log(' - submit request');
						var startTime = new Date();
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
									process.stdout.write(' - copy assets in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
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

// Delete localization policy on server
var _deleteLocalizationPolicy = function (server, id) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/localizationPolicies/' + id;
				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete localization policy ' + id);
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
						console.log('Failed to delete localization policy ' + id + ' : ' + (response.statusMessage || response.statusCode));
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
 * Delete localization policy on server by channel id
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The id of the localization policy to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteLocalizationPolicy = function (args) {
	return _deleteLocalizationPolicy(args.server, args.id);
};


// Get repositories from server
var _getRepositories = function (server) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/content/management/api/v1.1/repositories?limit=99999&fields=all';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			return resolve({});
		}
		var repoName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/repositories';
		url = url + '?q=(name mt "' + encodeURIComponent(repoName) + '")';
		url = url + '&fields=all';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get repository ' + repoName);
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
				var repos = data && data.items || [];
				var repository;
				for (var i = 0; i < repos.length; i++) {
					if (repos[i].name && repos[i].name.toLowerCase() === repoName.toLocaleLowerCase()) {
						repository = repos[i];
						break;
					}
				}
				if (repository) {
					resolve({
						data: repository
					});
				} else {
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get repository ' + repoName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			return resolve({
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


var TAX_MAX_LIMIT = 100;
// Get taxonomies from server
var _getTaxonomies = function (server, offset) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies?fields=all&q=(status eq "all")&totalResults=true';
		url = url + '&limit=' + TAX_MAX_LIMIT;
		if (offset) {
			url = url + '&offset=' + offset;
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
				resolve(data);
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

// get all taxonomies with pagination
var _getAllTaxonomies = function (server) {
	return new Promise(function (resolve, reject) {
		var groups = [];
		// 1000 * 100 should be enough
		for (var i = 1; i < 1000; i++) {
			groups.push(TAX_MAX_LIMIT * i);
		}

		var resources = [];

		var doGetResources = groups.reduce(function (resPromise, offset) {
				return resPromise.then(function (result) {
					if (result && result.items && result.items.length > 0) {
						resources = resources.concat(result.items);
					}
					if (result && result.hasMore) {
						return _getTaxonomies(server, offset);
					}
				});
			},
			// Start with a previousPromise value that is a resolved promise
			_getTaxonomies(server));

		doGetResources.then(function (result) {
			// console.log(resources.length);
			resolve(resources);
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
	return _getAllTaxonomies(args.server);
};

/**
 * Get a taxonomy with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTaxonomyWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}
		var taxonomyName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/taxonomies';
		url = url + '?q=(name mt "' + encodeURIComponent(taxonomyName) + '")';
		url = url + '&fields=all';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get taxonomy ' + taxonomyName);
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
				var taxonomies = data && data.items || [];
				var taxonomy;
				for (var i = 0; i < taxonomies.length; i++) {
					if (taxonomies[i].name && taxonomies[i].name === taxonomyName) {
						taxonomy = taxonomies[i];
						break;
					}
				}
				if (taxonomy) {
					resolve({
						data: taxonomy
					});
				} else {
					// console.log('ERROR:  channel ' + channelName + ' not found');
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get taxonomy ' + taxonomyName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

// Get categories of a taxonomy from server
var _getCategories = function (server, taxonomyId, taxonomyName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomyId + '/categories?fields=all&limit=9999';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get categories');
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
					taxonomyName: taxonomyName,
					taxonomyId: taxonomyId,
					categories: data && data.items
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get categories : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all categories of a taxonomy on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getCategories = function (args) {
	return _getCategories(args.server, args.taxonomyId, args.taxonomyName);
};


var _getResourcePermissions = function (server, id, type) {
	return new Promise(function (resolve, reject) {
		var resourceType = type === 'repository' ? 'repositories' : (type + 's'),
			url = server.url + '/content/management/api/v1.1/' + resourceType + '/' + id + '/permissions';
		// console.log(url);
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

var _getPermissionSets = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/repositories/' + id + '/permissionSets?limit=1000&links=none';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get permission sets for ' + (name || id));
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
					id: id,
					name: name,
					permissionSets: data && data.items
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to get permission sets for ' + (name || id) + ' : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all permission sets of repository  on a oce server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} server the server object
 * @param {string} args.id The id of the repository to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getPermissionSets = function (args) {
	return _getPermissionSets(args.server, args.id, args.name);
};

var _setPermissionSets = function (server, id, name, action, permissions) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/repositories/' + id + '/permissionSets';
				if (action === 'update' && permissions.id) {
					url = url + '/' + permissions.id;
				}
				var method = action === 'add' ? 'POST' : 'PUT';
				var postData = {
					method: method,
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(permissions),
					json: true
				};
				// console.log(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to ' + action + ' permission sets for ' + name);
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
						console.log('Failed to ' + action + ' permission sets for ' + name + ' - ' + msg);
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
 * Set editorial permissions for arepository on a oce server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} server the server object
 * @param {string} args.id The id of the repository to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.setPermissionSets = function (args) {
	return _setPermissionSets(args.server, args.id, args.name, args.action, args.permissions);
};

// Create repository on server
var _createRepository = function (server, name, description, contentTypes, channels, defaultLanguage, repositoryType) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {};
				payload.name = name;
				payload.description = description || '';
				if (repositoryType) {
					payload.repositoryType = repositoryType;
				}
				payload.defaultLanguage = repositoryType && repositoryType === 'Business' ? 'und' : (defaultLanguage || 'en-US');

				payload.taxonomies = [];

				if (contentTypes && contentTypes.length > 0) {
					payload.contentTypes = contentTypes;
				}
				if (channels && channels.length > 0) {
					payload.channels = channels;
				}

				var url = server.url + '/content/management/api/v1.1/repositories';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create repository ' + name);
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
		args.contentTypes, args.channels, args.defaultLanguage, args.repositoryType);
};

// Update repository
var _updateRepository = function (server, repository, contentTypes, channels, taxonomies, autoTagEnabled) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var data = repository;
				if (contentTypes) {
					data.contentTypes = contentTypes;
				}
				if (channels) {
					data.channels = channels;
				}
				if (taxonomies) {
					data.taxonomies = taxonomies;
				}
				data.autoTagEnabled = autoTagEnabled || false;

				var url = server.url + '/content/management/api/v1.1/repositories/' + repository.id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(data),
					json: true
				};
				// console.log(JSON.stringify(data, null, 4));

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to update repository ' + repository.name);
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
						console.log('Failed to update repository ' + repository.name + ' - ' + msg);
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
 * @param {array} args.taxonomies The list of taxonomies.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateRepository = function (args) {
	return _updateRepository(args.server, args.repository, args.contentTypes, args.channels, args.taxonomies, args.autoTagEnabled);
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

				var url = server.url + '/content/management/api/v1.1/permissionOperations';

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
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(formData),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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

// Get types from server
var _getContentTypes = function (server) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/types?limit=99999&links=none';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.log('ERROR: failed to get types');
					console.log(error);
				}
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
				if (showError) {
					console.log('ERROR: failed to get types');
				}
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get all types on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentTypes = function (args) {
	return _getContentTypes(args.server);
};

// Get type from server
var _getContentType = function (server, typeName, expand, showError) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/types/' + typeName + '?links=none';
		if (expand) {
			url = url + '&expand=' + expand;
		}

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.log('ERROR: failed to get type ' + typeName);
					console.log(error);
				}
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
				if (showError) {
					console.log('ERROR: failed to get type ' + typeName + ' : ' + msg);
				}
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
	var showError = args.showError === undefined ? true : args.showError;
	return _getContentType(args.server, args.name, args.expand, showError);
};

var _createContentType = function (server, typeObj) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var name = typeObj.name;
				var payload = typeObj;
				payload.id = '';

				var url = server.url + '/content/management/api/v1.1/types';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create type ' + name);
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
						console.log('Failed to create type ' + name + ' - ' + msg);
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
 * Create a content type on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.type the type to create
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createContentType = function (args) {
	return _createContentType(args.server, args.type);
};

var _updateContentType = function (server, typeObj) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var name = typeObj.name;
				var payload = typeObj;

				var url = server.url + '/content/management/api/v1.1/types/' + name;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to update type ' + name);
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
						console.log('Failed to update type ' + name + ' - ' + msg);
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
 * Create a content type on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.type the type to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateContentType = function (args) {
	return _updateContentType(args.server, args.type);
};

/**
 * Add content layout mapping to a content type on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.type the type to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addContentTypeLayoutMapping = function (args) {
	var server = args.server;
	var typeName = args.typeName;
	var contentLayout = args.contentLayout;
	var style = args.style;
	var format = args.format || 'desktop';

	return new Promise(function (resolve, reject) {
		_getContentType(server, typeName, 'layoutMapping')
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var typeObj = result;
				var layoutMappings = result.layoutMapping && result.layoutMapping.data || [];

				var formats = format === 'desktop' ? {
					'desktop': contentLayout
				} : {
					'mobile': contentLayout
				};
				var found = false;
				for (var i = 0; i < layoutMappings.length; i++) {
					var mapping = layoutMappings[i];
					if (mapping.label === style) {
						if (mapping.hasOwnProperty('formats')) {
							mapping.formats[format] = contentLayout;
						} else {
							mapping.formats = formats;
						}
						found = true;
						break;
					}
				}
				if (!found) {
					layoutMappings.push({
						label: style,
						apiName: serverUtils.replaceAll(style, ' ', '').toLowerCase(),
						formats: formats
					});
				}
				// console.log(JSON.stringify(layoutMappings, null, 4));

				typeObj.layoutMapping.data = layoutMappings;

				return _updateContentType(server, typeObj);
			})
			.then(function (result) {
				return resolve(result);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};

/**
 * Remove content layout mapping from a content type on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.type the type to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeContentTypeLayoutMapping = function (args) {
	var server = args.server;
	var typeName = args.typeName;
	var contentLayout = args.contentLayout;
	var style = args.style;
	var format = args.format || 'desktop';

	var ootbStyles = ['Default', 'Content List Default', 'Empty Content List Default', 'Content Placeholder Default'];

	return new Promise(function (resolve, reject) {
		_getContentType(server, typeName, 'layoutMapping')
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var typeObj = result;
				var layoutMappings = result.layoutMapping && result.layoutMapping.data || [];
				var found = false;
				for (var i = 0; i < layoutMappings.length; i++) {
					var mapping = layoutMappings[i];
					if (mapping.label === style && mapping.formats) {
						if (mapping.formats[format] && mapping.formats[format] === contentLayout) {
							found = true;
							delete mapping.formats[format];
							if (Object.keys(mapping.formats).length === 0) {
								delete mapping.formats;
								// will delete the entry if it is custom style
								if (!ootbStyles.includes(style)) {
									layoutMappings.splice(i, 1);
								}
							}
							break;
						}
					}
				}
				// console.log(JSON.stringify(layoutMappings, null, 4));

				if (!found) {
					return resolve({});
				} else {
					typeObj.layoutMapping.data = layoutMappings;
				}

				return _updateContentType(server, typeObj);
			})
			.then(function (result) {
				return resolve(result);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};

var _getUser = function (server, userName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/users/items?info=' + userName;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
		var body = {
			'userID': userId,
			'role': role
		};
		var options = {
			method: createNew ? 'POST' : 'PUT',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to share folder ' + folderId);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
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
		var body = {
			'userID': userId
		};
		var options = {
			method: 'DELETE',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body),
			json: true
		};

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to unshare folder ' + folderId);
				console.log(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(options);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
		};

		// console.log(postData);

		request.post(postData, function (error, response, body) {
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
				var apiRandomID = data && data.apiRandomID;
				var cookies = [];
				if (response.headers && response.headers.raw && typeof response.headers.raw === 'function') {
					cookies = response.headers.raw()['set-cookie'] || [];
				}
				resolve({
					apiRandomID: apiRandomID,
					cookies: cookies.length > 0 ? cookies.join(',') : ''
				});
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


var _getGroup = function (server, name) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/social/api/v1/groups/' + name;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// console.log(options);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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

var _createGroup = function (server, name, type) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/groups';
					var payload = {
						name: name,
						groupType: type
					};
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify(payload),
						json: true
					};
					if (result.cookies) {
						postData.headers.Cookie = result.cookies;
					}
					// console.log(postData);
					request.post(postData, function (error, response, body) {
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
 * Create an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createGroup = function (args) {
	return _createGroup(args.server, args.name, args.type);
};

var _deleteGroup = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/groups/' + id;

					var postData = {
						method: 'DELETE',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						}
					};
					if (result.cookies) {
						postData.headers.Cookie = result.cookies;
					}
					request.delete(postData, function (error, response, body) {
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
 * Delete an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteGroup = function (args) {
	return _deleteGroup(args.server, args.id, args.name);
};

var _addMemberToGroup = function (request, cookies, server, apiRandomID, id, name, memberId, memberName, role, isGroup) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/osn/social/api/v1/groups/' + id + '/members';
		var payload = {
			member: memberName,
			role: role,
			isGroup: isGroup
		};
		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server),
				'X-Waggle-RandomID': apiRandomID
			},
			body: JSON.stringify(payload),
			json: true
		};
		if (cookies) {
			postData.headers.Cookie = cookies;
		}
		// console.log(JSON.stringify(postData, null, 4));
		request.post(postData, function (error, response, body) {
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
 * Add members to an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addMembersToGroup = function (args) {
	var server = args.server;
	var id = args.id;
	var name = args.name;
	var members = args.members || [];
	var request = require('./requestUtils.js').request;
	return new Promise(function (resolve, reject) {
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve([{
						err: 'err'
					}]);
				} else {
					var apiRandomID = result.apiRandomID;
					var cookies = result.cookies;
					var memberPromises = [];
					for (var i = 0; i < members.length; i++) {
						memberPromises.push(_addMemberToGroup(request, cookies, server, apiRandomID, id, name, members[i].id,
							members[i].name, members[i].role, members[i].isGroup));
					}
					Promise.all(memberPromises).then(function (results) {
						return resolve(results);
					});
				}
			});
	});
};

var _removeMemberFromGroup = function (request, cookies, server, apiRandomID, id, name, memberId, memberName) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/osn/social/api/v1/groups/' + id + '/members/' + memberId;
		var auth = server.oauthtoken ? (server.tokentype || 'Bearer') + ' ' + server.oauthtoken :
			'Basic ' + serverUtils.btoa(server.username + ':' + server.password);

		var postData = {
			method: 'DELETE',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server),
				'X-Waggle-RandomID': apiRandomID
			}
		};
		if (cookies) {
			postData.headers.Cookie = cookies;
		}
		// console.log(postData);
		request.delete(postData, function (error, response, body) {
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
 * Remove members from an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeMembersFromGroup = function (args) {
	var server = args.server;
	var id = args.id;
	var name = args.name;
	var members = args.members || [];
	var request = require('./requestUtils.js').request;
	return new Promise(function (resolve, reject) {
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve([{
						err: 'err'
					}]);
				} else {
					var apiRandomID = result.apiRandomID;
					var cookies = result.cookies;
					var memberPromises = [];
					for (var i = 0; i < members.length; i++) {
						memberPromises.push(_removeMemberFromGroup(request, cookies, server, apiRandomID, id, name,
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
							console.log(' - job id: ' + jobId);
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
							console.log(' - job id: ' + jobId);
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
										process.stdout.write(' - import taxonomy in process ' + count.join(''));
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
						console.log('ERROR: failed to import taxonomy ' + name + ' - ' + msg);
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
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
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
						var statusUrl = response.location;
						if (statusUrl) {
							var jobId = statusUrl.substring(statusUrl.lastIndexOf('/') + 1);
							console.log(' - submit request (job id: ' + jobId + ')');
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
// create taxonomy
var _createTaxonomy = function (server, name, description, shortName) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					name: name,
					description: description || '',
					shortName: shortName || ''
				};

				var url = server.url + '/content/management/api/v1.1/taxonomies?fields=all';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to create taxonomy ' + name);
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
						resolve(data);
					} else {
						console.log('Failed to create taxonomy ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Create an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy
 * @param {string} args.description The description of the taxonomy
 * @param {string} args.shortName The shortName of the taxonomy
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createTaxonomy = function (args) {
	return _createTaxonomy(args.server, args.name, args.description, args.shortName);
};

// add category to taxonomy
var _addCategorytoTaxonomy = function (server, taxonomyId, name, description, parentId, position) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = {
					name: name,
					description: description || '',
					parentId: parentId,
					position: position || 0
				};

				var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomyId + '/categories';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to add category sibling ' + name);
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
						resolve(data);
					} else {
						console.log('Failed to add category sibling ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Create an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.taxonomyId The id of the taxonomy
 * @param {string} args.name The name of the taxonomy
 * @param {string} args.description The description of the taxonomy
 * @param {string} args.parentId The parentId of the taxonomy
 * @param {string} args.position The position of the taxonomy
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addCategorytoTaxonomy = function (args) {
	return _addCategorytoTaxonomy(args.server, args.taxonomyId, args.name, args.description, args.parentId, args.position);
};
// delete taxonomy
var _deleteTaxonomy = function (server, id, name, status) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/taxonomies/' + id + '?q=(status%20eq%20%22' + status + '%22)';
				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
				};
				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete taxonomy ' + name);
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
						resolve(data);
					} else {
						console.log('Failed to delete taxonomy ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Create an OCM group on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The id of the taxonomy
 * @param {string} args.name The name of the taxonomy
 * @param {string} args.status The status of the taxonomy [drafted | promoted | published]
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteTaxonomy = function (args) {
	return _deleteTaxonomy(args.server, args.id, args.name, args.status);
};

// Get recommendations from server
var _getRecommendations = function (server, repositoryId, repositoryName) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/personalization/recommendations';
		url = url + '?q=(repositoryId eq "' + repositoryId + '")&fields=all&links=none&limit=9999';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
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
		var options = {
			url: statusUrl,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
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
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData)
				};
				// console.log(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
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
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData)
				};
				// console.log(options);
				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
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
	if (args.waitForImport) {
		return new Promise(function (resolve, reject) {
			_importContent(args.server, args.fileId, args.repositoryId, args.channelId, args.update)
				.then(function (result) {
					if (!result || result.err || !result.jobId) {
						return resolve(result);
					}

					var jobId = result.jobId;
					console.log(' - submit import job (' + jobId + ')' + (args.update ? ', updating content' : ''));

					// Wait for job to finish
					var startTime = new Date();
					var needNewline = false;
					var inter = setInterval(function () {
						_getContentJobStatus(args.server, jobId)
							.then(function (result) {
								if (result.status !== 'success') {
									clearInterval(inter);
									if (needNewline) {
										process.stdout.write(os.EOL);
									}
									return resolve({
										err: 'err'
									});
								}

								var data = result.data;
								var status = data.status;

								if (status && status === 'SUCCESS') {
									clearInterval(inter);
									if (needNewline) {
										process.stdout.write(os.EOL);
									}
									console.log(' - content imported');
									return resolve({});
								} else if (!status || status === 'FAILED') {
									clearInterval(inter);
									if (needNewline) {
										process.stdout.write(os.EOL);
									}
									console.log('ERROR: import failed: ' + data.errorDescription);
									if (!data.errorDescription) {
										console.log(data);
									}
									return resolve({
										err: 'err'
									});
								} else if (status && status === 'INPROGRESS') {
									needNewline = true;
									process.stdout.write(' - import job in progress [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
									readline.cursorTo(process.stdout, 0);
								}
							});

					}, 5000);
				});
		});
	} else {
		return _importContent(args.server, args.fileId, args.repositoryId, args.channelId, args.update);
	}
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



// Update the rendition status for a publishing job on server
var _updateRenditionStatus = function (server, isMultiPart, jobId, status, progress, compiledAt, filename, filepath) {
	// ToDo:  Currently a placeholder waiting on the correct server API
	// This will POST the "status" as well as a file in a multi-part form.
	// If the file isn't there, only the status will be passed
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token,
					options = {
						method: 'POST',
						url: server.url + '/content/management/api/v1.1/contentRenditionJobs',
						auth: serverUtils.getRequestAuth(server),
					};

				if (isMultiPart) {
					options.headers = {
						'Content-Type': 'multipart/form-data',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					};

					var multiPartFormRequest = request.post(options, function optionalCallback(error, response, body) {
						if (error) {
							console.log('updateRenditionStatus: ' + error);
							return resolve({
								error: error
							});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {
							data = body;
						}

						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							return resolve(data);
						} else {
							var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response ? (response.statusMessage || response.statusCode) : '');
							console.log('updateRenditionStatus: ' + msg);
							return resolve({
								error: data
							});
						}
					});

					// populate the form body
					var form = multiPartFormRequest.form();

					// add in the "status" details
					form.append('status', JSON.stringify({
						"jobId": jobId,
						"status": status,
						"progress": progress,
						"compiledAt": compiledAt
					}), {
						contentType: 'application/json'
					});

					// add in the "file" details
					form.append('file', fs.createReadStream(filepath), {
						contentType: 'application/zip'
					});
				} else {
					options.headers = {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					};

					options.body = JSON.stringify({
						"jobId": jobId,
						"status": status,
						"progress": progress,
						"compiledAt": compiledAt
					});


					// console.log(' - uploading file ...');
					request(options, function (error, response, body) {
						if (error) {
							console.log('updateRenditionStatus: ' + error);
							return resolve({
								error: error
							});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {
							data = body;
						}

						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							return resolve(data);
						} else {
							var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response ? (response.statusMessage || response.statusCode) : '');
							console.log('updateRenditionStatus: ' + msg);
							return resolve({
								error: data
							});
						}
					});
				}
			}
		});
	});
};

/**
 * Update rendition generation status for publishing job
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder where the new file should be created.
 * @param {string} args.filename The name of the file to create.
 * @param {stream} args.contents The filestream to upload.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateRenditionStatus = function (args) {
	return _updateRenditionStatus(args.server, args.multipart, args.jobId, args.status, args.progress, args.compiledAt, args.filename, args.filePath);
};


var _importCompiledContent = function (server, filePath) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/contentRenditionJobs';

				var FormData = require('form-data');
				var form = new FormData();
				form.append('file', fs.createReadStream(filePath));

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: form
				};
				// console.log(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to import compiled content from ' + filePath);
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

					if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
						var statusId = response.location || '';
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);

						console.log(' - submit request (job id: ' + statusId + ')');
						var startTime = new Date();
						var needNewLine = false;
						var inter = setInterval(function () {
							var jobPromise = _getItemOperationStatus(server, statusId);
							jobPromise.then(function (data) {
								// console.log(data);
								if (!data || data.error || data.progress === 'failed') {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
									console.log('ERROR: import compiled content failed: ' + msg);

									return resolve({
										err: 'err'
									});
								}
								if (data.completed) {
									clearInterval(inter);
									process.stdout.write(' - import compiled content in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									process.stdout.write(os.EOL);

									return resolve({});
								} else {
									process.stdout.write(' - import compiled content in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							});
						}, 5000);
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to import compiled content : ' + msg);
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
 * Import compiled content package to server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importCompiledContent = function (args) {
	return _importCompiledContent(args.server, args.filePath);
};

var _publishLaterChannelItems = function (server, name, items, channelId, repositoryId, schedule) {

	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/publish/scheduledJobs';
				var auth = serverUtils.getRequestAuth(server);
				var postData = {
					'name': name,
					'items': items,
					'channels': channelId ? [channelId] : [],
					'repositoryId': repositoryId,
					'schedule': schedule
				};

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
						console.log('ERROR: Failed to schedule publishing of items ' + name);
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
						var jobId = data && data.id;
						if (!jobId) {
							console.log(data);
							return resolve({
								err: 'err'
							});
						} else {
							var scheduledRunTime = data.nextRunTime && data.nextRunTime.value || 'unknown';
							console.log(' - Scheduled run time: ' + scheduledRunTime);
							return resolve({
								jobId: jobId
							});
						}
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to schedule publishing of items: ' + msg);
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
 * Publish items in a channel on server at a later date
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the scheduling job to create
 * @param {string} args.channelId The id of the channel to publish items.
 * @param {string} args.repositoryId The id of the repository to schedule publish items.
 * @param {array} args.itemIds The id of items to publish
 * @param {object} args.schedule Object containining the schedule of when to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishLaterChannelItems = function (args) {
	return _publishLaterChannelItems(args.server, args.name, args.itemIds, args.channelId, args.repositoryId, args.schedule);
};


var _queryScheduledJobs = function (server, repositoryId, startDate, endDate) {
	var formatDate = function (date) {
		// iso returns in the format: "2021-12-26T20:25:00.000Z"
		// server API expects UTC dates in the format: "2021-12-26T20:25UTC"
		return date.toISOString().replace(/:\d+\.\d+Z$/g, "UTC");
	};

	return new Promise(function (resolve, reject) {
		var pastDate = formatDate(new Date(startDate));
		var futureDate = formatDate(new Date(endDate));

		var url = server.url + '/content/management/api/v1.1/publish/scheduledJobs?repositoryId=' + repositoryId + '&limit=10000&q=nextRunTime gt "' + pastDate + '" and nextRunTime lt "' + futureDate + '"';

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to query scheduled jobs for: ' + repositoryId);
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
				console.log('ERROR: failed to query scheduled jobs for: ' + repositoryId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Publish items in a channel on server at a later date
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.repositoryId The id of the repository to schedule publish items.
 * @param {Date} args.startDate Jobs scheduled after this date
 * @param {Date} args.endDate Jobs scheduled before this date
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.queryScheduledJobs = function (args) {
	return _queryScheduledJobs(args.server, args.repositoryId, args.startDate, args.endDate);
};


var _cancelScheduledJob = function (server, id) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/publish/scheduledJobs/' + id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server),
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						status: 'Cancelled'
					})
				};

				// console.log(postData);
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to cancel scheduled job: ' + id);
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.log('Failed to cancel scheduled job: ' + id + ' : ' + msg);
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.log(data['o:errorDetails']);
						}
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};

var _createAssetTranslation = function (server, name, repositoryId, collectionId, contentIds, sourceLanguage, targetLanguages, connectorId) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/translationJobs';
				var payload = {
					jobType: 'export',
					properties: {
						jobName: name,
						repositoryId: repositoryId,
						contentIds: contentIds,
						sourceLanguage: sourceLanguage,
						targetLanguages: targetLanguages,
						connectorId: connectorId
					}
				};
				if (collectionId) {
					payload.properties.collectionId = collectionId;
				}
				// console.log(payload);

				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.log('ERROR: failed to create translation job ' + name);
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
						var statusUrl = response.location;
						if (statusUrl) {
							console.log(' - create translation job submitted, status: ' + serverUtils.replaceAll(statusUrl, server.url, ''));
							var needNewLine = false;
							var startTime = new Date();
							var inter = setInterval(function () {
								var jobPromise = _getTranslationStatus(server, statusUrl, 'export');
								jobPromise.then(function (data) {
									if (!data || data.progress === 'failed') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										var msg = data && data.message ? data.message : '';
										console.log('ERROR: create translation failed: ' + msg);

										return resolve({
											err: 'err'
										});
									}
									if (data.progress === 'succeeded') {
										clearInterval(inter);
										process.stdout.write(' - creating: percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										readline.cursorTo(process.stdout, 0);
										process.stdout.write(os.EOL);
										return resolve(data);

									} else {
										process.stdout.write(' - creating: percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								});
							}, 5000);
						} else {
							console.log('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.log('ERROR: failed to create tanslation job ' + name + ' - ' + msg);
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
 * Create asset translation
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The translation job name
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createAssetTranslation = function (args) {
	return _createAssetTranslation(args.server, args.name, args.repositoryId, args.collectionId, args.contentIds,
		args.sourceLanguage, args.targetLanguages, args.connectorId);
};
/**
 * Publish items in a channel on server at a later date
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id job to cancel
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.cancelScheduledJob = function (args) {
	return _cancelScheduledJob(args.server, args.id);
};

var _cancelScheduledJobs = function (server, ids) {

	// create Promises to cancel each job
	var cancelPromises = [];
	ids.forEach(function (id) {
		cancelPromises.push(function () {
			return _cancelScheduledJob(server, id);
		});
	});

	// return the sequence of cancalled promises
	return cancelPromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function () {
				// wait for the previous promise to complete and then call the function to start executing the next promise
				return nextPromise();
			});
		},
		// Start with a previousPromise value that is a resolved promise 
		Promise.resolve());
};

/**
 * Publish items in a channel on server at a later date
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array|string} args.ids jobs to cancel
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.cancelScheduledJobs = function (args) {
	return _cancelScheduledJobs(args.server, args.ids);
};



var _createTaxonomy = function (server, name, shortName) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/taxonomies';

				var postData = {
					'name': name,
					'shortName': shortName
				};

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData)
				};

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to create taxonomy ' + name);
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

					if (response && response.statusCode === 201) {
						return resolve(data);
					} else {
						var msg = data && (data.detail || data.title) || response.statusCode;
						console.log('ERROR: Failed to create taxonomy ' + name + ' : ' + msg);
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
 * Create a taxonomy
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy to create
 * @param {string} args.shortName The shortName of the taxonomy
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createTaxonomy = function (args) {
	return _createTaxonomy(args.server, args.name, args.shortName);
};

// Delete taxonomy
var _deleteTaxonomy = function (server, id, status) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/taxonomies/' + id;
				if (status === 'promoted') {
					url += '?q=(status eq "promoted")';
				} else {
					url += '?q=(status eq "draft")';
				}

				var postData = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.log('Failed to delete taxonomy ' + id);
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
						console.log('Failed to delete taxonomy ' + id + ' : ' + (response.statusMessage || response.statusCode));
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
 * Delete taxonomy on server by taxonomy id
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The id of the taxonomy to delete
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteTaxonomy = function (args) {
	return _deleteTaxonomy(args.server, args.id, args.status);
};

// Create category
var _createCategory = function (server, name, parentId, position) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/taxonomies/' + parentId + '/categories';
				var postData = {
					name: name,
					parentId: parentId,
					position: position || 0
				};

				var options = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData)
				};

				var request = require('./requestUtils.js').request;
				request.post(options, function (error, response, body) {
					if (error) {
						console.log('Failed to create category ' + name);
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
						console.log('Failed to create category ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Create Category
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the category to create
 * @param {string} args.parentId The parentId of the category to create
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createCategory = function (args) {
	return _createCategory(args.server, args.name, args.parentId, args.position);
};

var _getTranslationStatus = function (server, statusUrl, action) {
	return new Promise(function (resolve, reject) {
		var url = statusUrl;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: get ' + action + ' translation status');
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
				console.log('ERROR: failed to get ' + action + ' translation status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

var _importAssetTranslation = function (server, csrfToken, action, job, fFileGUID) {
	return new Promise(function (resolve, reject) {

		var url = server.url + '/content/management/api/v1.1/translationJobs';
		var payload = {
			jobType: 'import',
			properties: {
				repositoryId: job.repositoryId,
				validationMode: action === 'validate' ? 'validateOnly' : 'validateAndImport',
				jobName: job.name,
				connectorId: job.connectorId
			}
		};
		if (job.id) {
			payload.properties.jobId = job.id;
		}
		if (fFileGUID) {
			payload.properties.fFileGUID = fFileGUID;
		}
		// console.log(payload);
		var postData = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': csrfToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		var request = require('./requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to ' + action + ' translation job ' + job.name);
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
				var statusUrl = response.location;
				if (statusUrl) {
					console.log(' - ' + action + ' translation job submitted, status: ' + serverUtils.replaceAll(statusUrl, server.url, ''));
					var needNewLine = false;
					var startTime = new Date();
					var actionLabel = action === 'import' ? 'importing' : 'validating';
					var inter = setInterval(function () {
						var jobPromise = _getTranslationStatus(server, statusUrl, action);
						jobPromise.then(function (data) {
							if (!data || data.progress === 'failed') {
								clearInterval(inter);
								if (needNewLine) {
									process.stdout.write(os.EOL);
								}
								var msg = data && data.message ? data.message : '';
								console.log('ERROR: ' + action + ' translation failed: ' + msg);

								return resolve({
									err: 'err'
								});
							}
							if (data.progress === 'succeeded') {
								clearInterval(inter);
								process.stdout.write(' - ' + actionLabel + ': percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								process.stdout.write(os.EOL);
								return resolve(data);

							} else {
								process.stdout.write(' - ' + actionLabel + ': percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						});
					}, 5000);
				} else {
					console.log('ERROR: no job Id is found');
					resolve({
						err: 'err'
					});
				}
			} else {
				var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to ' + action + ' tanslation job ' + job.name + ' - ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Import asset translation
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.job The translation job
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.importAssetTranslation = function (args) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(args.server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				_importAssetTranslation(args.server, csrfToken, 'validate', args.job, args.fFileGUID)
					.then(function (result) {
						if (!result || result.err) {
							return resolve(result);
						}

						if (args.validateOnly) {
							return resolve(result);
						} else {

							// console.log(result);
							var fFileGUID = result.result && result.result.body && result.result.body.fFileGUID;
							if (!fFileGUID) {
								console.log('ERROR: failed to get translation file');
								return resolve({
									err: 'err'
								});
							}

							_importAssetTranslation(args.server, csrfToken, 'import', args.job, fFileGUID)
								.then(function (result) {
									return resolve(result);
								});
						}
					});
			}
		});
	});
};
