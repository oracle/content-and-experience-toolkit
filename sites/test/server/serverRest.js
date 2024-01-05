/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var os = require('os'),
	fs = require('fs'),
	readline = require('readline'),
	serverUtils = require('./serverUtils');

var console = require('./logger.js').console;

if (process.shim) {
	process.stdout.write = console.log;
}

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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create folder ' + foldername + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					// ignore
				}
				resolve(data);
			} else {
				console.error('ERROR: failed to create folder ' + foldername + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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

// Copy a folder
var _copyFolder = function (server, folderId, targetFolderId) {
	return new Promise(function (resolve, reject) {
		var body = {
			destinationID: targetFolderId
		};
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/folders/' + folderId + '/copy',
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body)
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to copy folder ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// ignore
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to copy folder ' + folderId + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}

		});
	});
};
/**
 * Copy folder on server with file GUID
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The DOCS GUID for the folder to copy
 * @param {string} args.folderId The DOCS GUID for the target folder to copy to
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyFolder = function (args) {
	return _copyFolder(args.server, args.id, args.folderId);
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

var _findFolderHierarchy = function (server, rootParentId, folderPathStr, noMsg) {
	return new Promise(function (resolve, reject) {
		var showDetail = noMsg ? false : true;
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
						if (showDetail) {
							console.info(' - find ' + folderDetails.type + ' ' + folderDetails.name + ' (Id: ' + folderDetails.id + ')');
						}
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
					if (showDetail) {
						console.info(' - find ' + parentFolder.type + ' ' + parentFolder.name + ' (Id: ' + parentFolder.id + ')');
					}
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
	return _findFolderHierarchy(args.server, args.parentID, args.folderPath, args.noMsg);
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
					queryAgainPromises.push(_getChildItems(server, parentId, size, offset));
					remaining = remaining - size;
					extra = extra + 1;
				}

				return Promise.all(queryAgainPromises);

			})
			.then(function (results) {

				var i;
				if (results && results.length > 0) {
					for (i = 0; i < results.length; i++) {
						// console.log(' - ' + i + ' offset: ' + results[i].offset + ' count: ' + results[i].count);
						var items2 = results[i] && results[i].items || [];
						if (items2.length > 0) {
							items = items.concat(items2);
						}
					}
				}

				var subfolderPromises = [];
				for (i = 0; i < items.length; i++) {
					if (items[i].type === 'file') {
						// console.log(' - file: id=' + items[i].id + ' path=' + parentPath + '/' + items[i].name);
						_files.push({
							type: 'File',
							id: items[i].id,
							path: parentPath ? parentPath + '/' + items[i].name : items[i].name,
							size: items[i].size,
							version: items[i].version,
							name: items[i].name,
							lastModifiedDate: items[i].modifiedTime
						});
					} else {
						_files.push({
							type: 'Folder',
							id: items[i].id,
							name: items[i].name,
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to delete folder ' + fFolderGUID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					// should not happen
				}

				resolve(data);
			} else {
				console.error('ERROR: failed to delete folder ' + (folderPath || fFolderGUID) + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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
		// var url = server.url + '/documents/api/1.2/folders/' + parentID + '/items';
		var url = server.url + '/documents/api/1.2/folders' + (parentID === 'self' ? '' : '/' + parentID) + '/items';
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get folder child items ' + parentID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get folder items ' + parentID + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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

/**
 * Get all child items from server under the given parent
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.parentID The DOCS GUID for the folder to search
 * @returns {array} The array of data object returned by the server.
 */
module.exports.getAllChildItems = function (args) {
	return new Promise(function (resolve, reject) {
		var groups = [];
		var limit = 10000;
		// 10000 * 20 should be enough
		for (var i = 1; i < 20; i++) {
			groups.push(limit * i);
		}

		var childItems = [];

		var doGetItems = groups.reduce(function (itemPromise, offset) {
			return itemPromise.then(function (result) {
				if (result && result.items && result.items.length > 0) {
					childItems = childItems.concat(result.items);
				}
				if (result && result.hasMore === '1') {
					return _getChildItems(args.server, args.parentID, limit, offset);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise
		_getChildItems(args.server, args.parentID, limit));

		doGetItems.then(function (result) {
			// console.log(childItems.length);
			resolve(childItems);
		});
	});
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get folder metadata ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get folder metadata ' + folderId + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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
		// var url = server.url + '/documents/api/1.2/folders/' + parentID + '/items?limit=9999';
		var url = server.url + '/documents/api/1.2/folders' + (parentID === 'self' ? '' : '/' + parentID) + '/items?limit=9999';
		url = url + '&filterName=' + encodeURIComponent(filename);
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
				console.error('ERROR: failed to get folder child items ' + parentID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to find ' + (itemtype ? itemtype : ' File') + ': ' + filename + ' ' + msg + ' (ecid: ' + response.ecid + ')');
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
		if (filename) {
			form.append('primaryFile', contents, { filename: filename });
		} else {
			form.append('primaryFile', contents);
		}

		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/files/data/',
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: form
		};

		serverUtils.showRequestOptions(options);

		// console.log(' - uploading file ...');
		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create file "' + filename + '" (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to create file "' + filename + '" : ' + msg + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to read file ' + fFileGUID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to read file ' + fFileGUID + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get file ' + id + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get file ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to download file' + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to download file: ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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

/**
 * Download file from server by file id and save to local
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.downloadFileSave = function (args) {
	var url = args.server.url + '/documents/api/1.2/files/' + args.fFileGUID + '/data/';
	if (args.version) {
		url = url + '?version=' + args.version;
	}
	var noMsg = true;
	var writer = fs.createWriteStream(args.saveTo);
	return _executeGetStream(args.server, url, writer, noMsg);

};

/**
 * Download file from server by URL and save to local
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to update
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.downloadByURLSave = function (args) {
	var url = args.url;
	var noMsg = true;
	var noError = true;
	var headers = args.headers;
	var writer = fs.createWriteStream(args.saveTo);
	return _executeGetStream(args.server, url, writer, noMsg, noError, headers);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to delete file ' + fFileGUID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					// should not happen
				}

				resolve(data);
			} else {
				console.error('ERROR: failed to delete file ' + (filePath || fFileGUID) + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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

// Copy a file
var _copyFile = function (server, fileId, targetFolderId) {
	return new Promise(function (resolve, reject) {
		var body = {
			destinationID: targetFolderId
		};
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/files/' + fileId + '/copy',
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(body)
		};
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to copy file ' + fileId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// should not happen
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to copy file ' + fileId + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}

		});
	});
};
/**
 * Copy file on server with file GUID
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The DOCS GUID for the file to copy
 * @param {string} args.folderId The DOCS GUID for the target folder to copy to
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.copyFile = function (args) {
	return _copyFile(args.server, args.id, args.folderId);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get file version ' + fFileGUID + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get file version ' + fFileGUID + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

// Create folder public link on server
var _createFolderPublicLink = function (server, folderId, role) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents/api/1.2/publiclinks/folder/' + folderId;
		var payload = {
			roleName: role,
			assignedUsers: '@everybody'
		};
		var options = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload)
		};
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create folder public link ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve();
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve(data && data.id);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to create folder public link ' + folderId + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve();
			}
		});
	});
};
module.exports.createFolderPublicLink = function (args) {
	return _createFolderPublicLink(args.server, args.folderId, args.role);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get user ' + userName + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get user ' + userName + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

/**
 * Get user info on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of user.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getAllUsers = function (args) {
	var url = args.group ? '/osn/social/api/v1/groups/' + args.group + '/memberships' : '/osn/social/api/v1/people';
	var fields, q, orderBy;
	var showProgress = true;
	var limit = 400;
	return _getAllResources(args.server, url, 'users', fields, q, orderBy, limit, showProgress);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get folder users ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get folder users ' + folderId + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to share folder ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// in case result not json
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				var objName = body && body.user ? body.user.displayName : 'folder ' + folderId;
				var msg = body && body.errorMessage ? body.errorMessage : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to share ' + objName + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.delete(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to unshare folder ' + folderId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle non json
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.error('ERROR: failed to unshare folder ' + folderId + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
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

///////////////////////////////////////////////////////////
//                  Content Management APIs
///////////////////////////////////////////////////////////

var _getItem = function (server, id, expand, showError) {
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.error('ERROR: failed to get item ' + id + ' (ecid: ' + response.ecid + ')');
					console.error(error);
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
				return resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				if (showError) {
					console.error('ERROR: failed to get item ' + id + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				}
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
	var showError = args.hideError ? false : true;
	return _getItem(args.server, args.id, args.expand, showError);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get item relationships ' + id + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var i;
				if (data && data.data && data.data.references) {
					for (i = 0; i < data.data.references.length; i++) {
						referenceIds.push(data.data.references[i].id);
					}
				}
				if (data && data.data && data.data.referencedBy) {
					for (i = 0; i < data.data.referencedBy.length; i++) {
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
				console.error('ERROR: failed to get item relationships ' + id + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get item variations ' + id + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get item variations ' + id + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

/**
 * Get an item's versions on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.id The id of the item to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemVersions = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/items/' + args.id + '/versions', 'itemVersions');
};

/**
 * Get an item's rendition on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.id The id of the item to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemRendition = function (args) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/assets/' + args.id + '/' + args.rendition;
		var noMsg = true;
		_executeGet(args.server, url, noMsg)
			.then(function (result) {
				if (result.err) {
					return resolve(result);
				} else {
					return resolve({
						itemId: args.id,
						rendition: args.rendition,
						data: result
					});
				}
			});
	});
};


var _queryItems = function (useDelivery, server, queryString) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items';
		if (useDelivery) {
			url = server.url + '/content/published/api/v1.1/items';
		}
		if (queryString) {
			url = url + '?' + queryString;
		}

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = server.request || require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to query items with ' + query + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var msg = data && (data.title || data.detail) ? ((data.title || '') + ' ' + (data.detail || '')) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to query items with ' + query + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

var _queryAllItems = function (useDelivery, server, q, fields, orderBy, limit, offset, channelToken,
	includeAdditionalData, aggregationResults, defaultQuery, defaultOperator, rankBy, showInfo) {
	const QUERY_SIZE = 500;
	return new Promise(function (resolve, reject) {
		var queryString = [];

		if (q) {
			queryString.push('q=' + q);
		}
		if (orderBy) {
			queryString.push('orderBy=' + orderBy);
		}
		if (channelToken) {
			queryString.push('channelToken=' + channelToken);
		}
		if (fields) {
			queryString.push('fields=' + fields);
		}
		if (includeAdditionalData) {
			queryString.push('includeAdditionalData=true');
		}
		if (defaultQuery) {
			queryString.push('default=' + encodeURIComponent(defaultQuery));
			if (defaultOperator) {
				queryString.push('defaultOperator=' + defaultOperator);
			}
		}
		if (aggregationResults) {
			queryString.push('aggs={"name":"item_count_per_category","field":"id"}');
		}
		if (rankBy) {
			queryString.push('rankBy=' + rankBy);
		}
		var query = queryString.join('&');

		var groups = [];
		var offset2 = offset ? offset : 0;
		for (var i = 0; i < limit / QUERY_SIZE; i++) {
			groups.push({
				limit: limit < QUERY_SIZE ? limit : QUERY_SIZE,
				offset: offset2 + i * QUERY_SIZE
			});
		}

		// console.log(' - QUERY_SIZE: ' + QUERY_SIZE + ' limit: ' + limit + ' offset: ' + offset + ' groups: ' + groups.length);
		//
		// console.log(groups);

		var items = [];
		var aggregationResults = [];
		var hasMore;
		var returnLimit;

		var startTime = new Date();
		var doGetItems = groups.reduce(function (itemPromise, param) {
			return itemPromise.then(function (result) {
				let itemQueryString = queryString.join('&');
				if (itemQueryString) {
					itemQueryString = itemQueryString + '&';
				}
				itemQueryString = itemQueryString + 'limit=' + param.limit + '&offset=' + param.offset;
				return _queryItems(useDelivery, server, itemQueryString).then(function (result) {
					if (result.data) {
						// console.log(' - returned ' + result.data.length);
						items = items.concat(result.data);
						if (showInfo) {
							process.stdout.write(' - fetching items ' + items.length +
							' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
						}
					}
					hasMore = result.hasMore;
					returnLimit = result.limit;
					if (result.aggregationResults) {
						aggregationResults = aggregationResults.concat(result.aggregationResults);
					}
				});
			});
		},
		Promise.resolve({}));

		doGetItems.then(function (result) {
			if (showInfo && items.length > 0) {
				process.stdout.write(os.EOL);
			}
			return resolve({
				data: items,
				query: query,
				hasMore: hasMore,
				limit: returnLimit,
				aggregationResults: aggregationResults
			});
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
		serverUtils.showRequestOptions(options);

		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to scroll items with ' + query + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var msg = data && (data.title || data.detail) ? ((data.title || '') + ' ' + (data.detail || '')) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to scroll items with ' + query + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
var _scrollAllItems = function (useDelivery, server, q, fields, orderBy, limit, offset, channelToken, includeAdditionalData, defaultQuery, defaultOperator, rankBy) {
	var SCROLL_SIZE = 1000;
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/items';
		if (useDelivery) {
			url = server.url + '/content/published/api/v1.1/items';
		}
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
		if (defaultQuery) {
			url = url + '&default=' + encodeURIComponent(defaultQuery);
			if (defaultOperator) {
				url = url + '&defaultOperator=' + defaultOperator;
			}
		}
		if (rankBy) {
			url = url + '&rankBy=' + rankBy;
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

const MAX_ITEM_LIMIT = 10000;

/**
 * Get an item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.q The query expression
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.queryItems = function (args) {
	var showTotal = args.showTotal === undefined ? true : args.showTotal;
	return new Promise(function (resolve, reject) {
		// orderBy is required to make pagination / scroll work
		var orderBy = args.orderBy ? args.orderBy : (args.rankBy ? '' : 'id');
		// find out the total first
		_queryAllItems(args.useDelivery, args.server, args.q, args.fields, orderBy, 1, 0, args.channelToken,
			args.includeAdditionalData, args.aggregationResults, args.defaultQuery, args.defaultOperator, args.rankBy)
			.then(function (result) {
				var items = result && result.data || [];
				if (items.length == 0 || result.limit === args.limit) {
					return resolve(result);
				}

				var totalCount = result.limit;
				if (showTotal) {
					console.info(' - total items: ' + totalCount);
				}
				var offset = args.offset ? args.offset : 0;
				if (totalCount < MAX_ITEM_LIMIT || (args.limit && (offset + args.limit < MAX_ITEM_LIMIT))) {
					_queryAllItems(args.useDelivery, args.server, args.q, args.fields, orderBy, (args.limit || totalCount), args.offset, args.channelToken,
						args.includeAdditionalData, args.aggregationResults, args.defaultQuery, args.defaultOperator, args.rankBy, showTotal)
						.then(function (result) {
							return resolve(result);
						});
				} else {
					// console.log(' - scrolling items...');
					_scrollAllItems(args.useDelivery, args.server, args.q, args.fields, orderBy, args.limit, args.offset, args.channelToken,
						args.includeAdditionalData, args.defaultQuery, args.defaultOperator, args.rankBy)
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
		serverUtils.showRequestOptions(options);

		var query = url.substring(url.indexOf('?') + 1);
		// console.log(query);
		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get all item Ids ' + query + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var ids = [];
				if (data && data.items) {
					data.items.forEach(function (item) {
						if (item && item.id) {
							ids.push(item.id);
						}
					});
				}
				return resolve({
					data: data && data.items,
					query: query,
					hasMore: data && data.hasMore,
					limit: data && data.limit,
					ids: ids
				});
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get all item Ids ' + query + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

var _itemNativeFileExist = function (server, item) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/assets/' + item.id + '/native';
		var options = {
			url: url,
			encoding: null,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		if (server.cookies) {
			options.headers.Cookie = server.cookies;
		}
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.getStream(options, function (err, response, body) {
			if (err) {
				console.log(err);
				return resolve({
					item: item,
					nativeFileExist: false
				});
			}

			if (response && response.statusCode === 200) {

				return resolve({
					item: item,
					nativeFileExist: true
				});

			} else {
				return resolve({
					item: item,
					nativeFileExist: false
				});
			}
		});
	});
};
/**
 * Check if the native file exists for a digital asset
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.item the item
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.itemNativeFileExist = function (args) {
	return _itemNativeFileExist(args.server, args.item);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('Failed to create create ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('Failed to create item ' + name + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
						console.error(data);
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
var _createDigitalItem = function (server, repositoryId, type, filename, contents,
	fields, slug, translatable, language, masterId) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var FormData = require('form-data');
				var form = new FormData();
				var item = {
					name: filename,
					repositoryId: repositoryId,
					type: type
				};
				if (slug) {
					item.slug = slug;
				}
				if (translatable !== undefined) {
					item.translatable = translatable;
				}
				if (language) {
					item.language = language;
				}
				if (masterId) {
					item.languageIsMaster = false;
					item.sourceId = masterId;
				} else {
					item.languageIsMaster = true;
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create create digital item for ' + filename + ' (ecid: ' + response.ecid + ')');
						console.error(error);
						// Do we really want to resolve on an error?
						resolve({
							err: 'err'
						}, error, response, body);
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
						console.error('ERROR: Failed to create digital item for ' + filename + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.error(JSON.stringify(data['o:errorDetails'], null, 4));
						}
						// Shouldn't this reject on an error?
						resolve({
							err: 'err'
						}, error, response, body);
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
	return _createDigitalItem(args.server, args.repositoryId, args.type, args.filename, args.contents,
		args.fields, args.slug, args.translatable, args.language);
};


// Create digital item from Documents on server
var _createDigitalItemFromDocuments = function (server, repositoryId, type, docId, docName,
	fields, slug, translatable, language) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var item = {
					externalId: docId,
					type: type
				};

				if (slug) {
					item.slug = slug;
				}
				if (translatable !== undefined) {
					item.translatable = translatable;
				}
				if (language) {
					item.language = language;
				}
				if (fields && Object.keys(fields).length > 0) {
					item.fields = fields;
				}

				var payload = {
					operations: {
						addToRepository: {
							repositoryId: repositoryId,
							connectorId: 'Documents',
							externalItems: [item]
						}
					}
				};

				var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';
				var postData = {
					method: 'POST',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Prefer: 'respond-async',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('Failed to create digital asset from ' + docName + ' (ecid: ' + response.ecid + ')');
						console.error(error);
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

					var msg;

					if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
						var statusId = response.location || '';
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);

						console.info(' - submit request (job id: ' + statusId + ')');
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
									msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
									console.error('ERROR: failed to create digital asset from ' + docName + ': ' + msg + ' (ecid: ' + response.ecid + ')');

									return resolve({
										err: 'err'
									});
								}
								if (data.completed) {
									clearInterval(inter);
									if (console.showInfo()) {
										process.stdout.write(' - create digital asset in progress [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										process.stdout.write(os.EOL);
									}
									// console.log(JSON.stringify(data, null, 4));
									if (data.result && data.result.body && data.result.body.operations &&
										data.result.body.operations.addToRepository &&
										data.result.body.operations.addToRepository.items &&
										data.result.body.operations.addToRepository.items.length > 0) {
										var item = data.result.body.operations.addToRepository.items[0];
										return resolve(item);
									} else {
										msg = 'failed to create digital asset from ' + docName;
										if (data.result && data.result.body && data.result.body.operations &&
											data.result.body.operations.addToRepository &&
											data.result.body.operations.addToRepository.failedExternalIds &&
											data.result.body.operations.addToRepository.failedExternalIds.items) {
											msg = msg + ' : ' + Object.values(data.result.body.operations.addToRepository.failedExternalIds.items)[0];
										}
										console.error('ERROR: ' + msg);
										return resolve({
											err: 'err'
										});
									}

								} else {
									if (console.showInfo()) {
										process.stdout.write(' - create digital asset in progress [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								}
							});
						}, 6000);
					} else {
						msg = data ? (data.detail || data.title) : response.statusMessage;
						console.error('ERROR: Failed to create digital asset - ' + msg + ' (ecid: ' + response.ecid + ')');
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
module.exports.createDigitalItemFromDocuments = function (args) {
	return _createDigitalItemFromDocuments(args.server, args.repositoryId, args.type,
		args.docId, args.docName,
		args.fields, args.slug, args.translatable, args.language);
};

/**
 * create a digital item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.repositoryId target repository ID
 * @param {string} args.type asset type of the new asset
 * @param {string} args.filename the new asset name
 * @param {fs} args.contents file stream of the file to upload
 * @param {Object} args.fields field data for the new item
 * @param {string} args.slug new asset's slug
 * @param {string} args.language the asset's language
 * @param {string} args.masterId ID of the master variation
 */
module.exports.createDAVariation = function (args) {
	return _createDigitalItem(args.server, args.repositoryId, args.type, args.filename, args.contents,
		args.fields, args.slug, true, args.language, args.masterId);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update digital item ' + item.id + ' (ecid: ' + response.ecid + ')');
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.error('ERROR: Failed to update digital item ' + item.id + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.error(data['o:errorDetails']);
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

// Update content item on server
var _updateItem = function (server, item) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/items/' + item.id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server),
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(item)
				};

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update item ' + item.id + ' (ecid: ' + response.ecid + ')');
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.error('ERROR: Failed to update item ' + item.id + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.error(data['o:errorDetails']);
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
 * Update a content item on server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server the server object
 * @param {string} args.item the item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateItem = function (args) {
	return _updateItem(args.server, args.item);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create collection ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.log('ERROR: Failed to create collection ' + name + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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
 * Create collection on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the repository to create.
 * @param {string} args.repositoryId The id of the repository
 * @param {string} args.channels the list of channels, e.g [{id: id1}, {id: id2}]
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createCollection = function (args) {
	return _createCollection(args.server, args.repositoryId, args.name, args.channels);
};

var _updateCollection = function (server, repositoryId, collection) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections/' + collection.id;
				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(collection),
					json: true
				};
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update collection ' + collection.name + ' (ecid: ' + response.ecid + ')');
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = response.statusMessage || response.statusCode;
						console.error('ERROR: Failed to update collection ' + collection.name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
						if (data) {
							console.error(JSON.stringify(data, null, 4));
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
 * Update a collection
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.repositoryId The id of the repository
 * @param {string} args.collection The collection object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateCollection = function (args) {
	return _updateCollection(args.server, args.repositoryId, args.collection);
};

/**
 * Delete a collection
 * @param {object} args.server the server object
 * @param {string} args.repositoryId The id of the repository
 * @param {object} args.collection The collection object
 * @returns {Promise.<object>} The data object returned by the server.
 */

var _deleteCollection = function (server, repositoryId, collection) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections/' + collection.id;
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete collection ' + collection.name + ' (ecid: ' + response.ecid + ')');
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

					if (response && (response.statusCode === 200 || response.statusCode === 204)) {
						resolve(data);
					} else {
						var msg = response.statusMessage || response.statusCode;
						console.error('ERROR: Failed to delete collection ' + collection.name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
						if (data) {
							console.error(JSON.stringify(data, null, 4));
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
 * Delete a collection
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.repositoryId The id of the repository
 * @param {object} args.collection The collection object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteCollection = function (args) {
	return _deleteCollection(args.server, args.repositoryId, args.collection);
};

// Create channel on server
var _createChannel = function (server, name, channelType, description, publishPolicy, localizationPolicy, primaryChannelSupported) {
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

				if (primaryChannelSupported) {
					payload.primaryChannelSupported = primaryChannelSupported;
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create channel ' + name + ' (ecid: ' + response.ecid + ')');
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.error('ERROR: Failed to create channel ' + name + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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
		args.description, args.publishPolicy, args.localizationPolicy, args.primaryChannelSupported);
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete channel ' + id + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to delete channel ' + id + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete repository ' + id + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to delete repository ' + id + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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
var _deleteContentType = function (server, name) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/types/' + name;
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete contennt type ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to delete content type ' + name + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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
 * Delete content type on server
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to add channel ' + channelName + ' to repository ' + repository.name + ' (ecid: ' + response.ecid + ')');
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = data ? JSON.stringify(data) : (response.statusMessage || response.statusCode);
						console.error('ERROR: Failed to add channel ' + channelName + ' to repository ' + repository.name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

// Get a resource from server
var _getResource = function (server, endpoint, type) {
	return new Promise(function (resolve, reject) {
		var url = server.url + endpoint;
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
				console.error('ERROR: failed to get ' + type + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				console.error('ERROR: failed to get ' + type + '  : ' + msg + ' (ecid: ' + response.ecid + ')');
				console.log(data);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
/**
 * Get a scheduled publish job on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id The id of the channel to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getScheduledJob = function (args) {
	var endpoint = '/content/management/api/v1.1/publish/scheduledJobs/' + args.id;
	if (args.expand) {
		endpoint = endpoint + '?expand=' + args.expand;
	}
	return _getResource(args.server, endpoint, 'scheduledPublishJob');
};

/**
 * Get item activities
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.item The item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItemActivities = function (args) {
	var objectType = args.item.typeCategory === 'ContentType' ? 'Content Item' : 'Digital Asset';
	var endpoint = '/system/api/v1/auditlog/activities?q=objectType eq "' + objectType +
		'" and objectId eq "' + args.item.id + '"';
	endpoint = endpoint + '&expand=all&limit=1000';
	return _getResource(args.server, endpoint, 'item activities');
};

/**
 * Get activities of a type
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.objectType The item object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getAllActivities = function (args) {
	var endpoint = '/system/api/v1/auditlog/activities';
	var q = 'objectType eq "' + args.objectType + '"';
	if (args.objectId) {
		q = q + ' and objectId eq "' + args.objectId + '"';
	}
	if (args.eventCategory) {
		q = q + ' and eventCategory eq "' + args.eventCategory + '"';
	}
	if (args.afterDate) {
		q = q + ' and registeredAt ge "' + args.afterDate + '"';
	}
	if (args.beforeDate) {
		q = q + ' and registeredAt le "' + args.beforeDate + '"';
	}

	console.info(' - activity query: ' + q);
	endpoint = endpoint + '?q=' + q + '&expand=activityDetails,initiatedBy';
	return _getAllResources(args.server, endpoint, 'activities');
};

/**
 * Get activities of an asset (Content Item or Digital Asset)
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getAllAssetActivities = function (args) {
	return new Promise(function (resolve, reject) {
		var endpoint = '/system/api/v1/auditlog/activities';
		var q = '';
		var actPromises = [];
		var activities = [];

		if (args.assets && args.assets.length > 0) {
			var contentItems = [];
			var digitalAssets = [];
			args.assets.forEach(function (asset) {
				if (asset.typeCategory === 'DigitalAssetType') {
					digitalAssets.push(asset.id);
				} else {
					contentItems.push(asset.id);
				}
			});
			if (contentItems.length > 0) {
				q = 'objectType eq "Content Item"';
				let idq = '';
				contentItems.forEach(function (id) {
					if (idq) {
						idq = idq + ' or ';
					}
					idq = idq + 'objectId eq "' + id + '"';
				});
				q = q + ' and (' + idq + ')';
				if (args.eventCategory) {
					q = q + ' and eventCategory eq "' + args.eventCategory + '"';
				}
				if (args.afterDate) {
					q = q + ' and registeredAt ge "' + args.afterDate + '"';
				}
				if (args.beforeDate) {
					q = q + ' and registeredAt le "' + args.beforeDate + '"';
				}
				console.info(' - activity query: ' + q);
				actPromises.push(_getAllResources(args.server, endpoint + '?q=' + q + '&expand=activityDetails,initiatedBy', 'activities'));
			}
			if (digitalAssets.length > 0) {
				q = 'objectType eq "Digital Asset"';
				let idq = '';
				digitalAssets.forEach(function (id) {
					if (idq) {
						idq = idq + ' or ';
					}
					idq = idq + 'objectId eq "' + id + '"';
				});
				q = q + ' and (' + idq + ')';
				if (args.eventCategory) {
					q = q + ' and eventCategory eq "' + args.eventCategory + '"';
				}
				if (args.afterDate) {
					q = q + ' and registeredAt ge "' + args.afterDate + '"';
				}
				if (args.beforeDate) {
					q = q + ' and registeredAt le "' + args.beforeDate + '"';
				}
				console.info(' - activity query: ' + q);
				actPromises.push(_getAllResources(args.server, endpoint + '?q=' + q + '&expand=activityDetails,initiatedBy', 'activities'));
			}
		} else {
		// query both Asset Item and Digital Asset
			q = 'objectType eq "Content Item"';
			if (args.eventCategory) {
				q = q + ' and eventCategory eq "' + args.eventCategory + '"';
			}
			if (args.afterDate) {
				q = q + ' and registeredAt ge "' + args.afterDate + '"';
			}
			if (args.beforeDate) {
				q = q + ' and registeredAt le "' + args.beforeDate + '"';
			}
			console.info(' - activity query: ' + q);
			actPromises.push(_getAllResources(args.server, endpoint + '?q=' + q + '&expand=activityDetails,initiatedBy', 'activities'));

			q = 'objectType eq "Digital Asset"';
			if (args.eventCategory) {
				q = q + ' and eventCategory eq "' + args.eventCategory + '"';
			}
			if (args.afterDate) {
				q = q + ' and registeredAt ge "' + args.afterDate + '"';
			}
			if (args.beforeDate) {
				q = q + ' and registeredAt le "' + args.beforeDate + '"';
			}
			console.info(' - activity query: ' + q);
			actPromises.push(_getAllResources(args.server, endpoint + '?q=' + q + '&expand=activityDetails,initiatedBy', 'activities'));
		}

		Promise.all(actPromises).then(function (results) {
			if (results && results.length > 0) {
				activities = results[0];
				if (results[1] && results[1].length > 0) {
					activities = activities.concat(results[1]);
				}
			}
			return resolve(activities);
		});
	});
};

// CAAS query maximum limit for resources other than assets
const MAX_LIMIT = 200;

var _getResources = function (server, endpoint, type, fields, offset, q, orderBy, limit) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;

		var url = server.url + endpoint;

		if (url.indexOf('?') > 0) {
			url = url + '&links=none&limit=' + limit;
		} else {
			url = url + '?links=none&limit=' + limit;
		}

		if (offset) {
			url = url + '&offset=' + offset;
		}
		if (fields) {
			url = url + '&fields=' + fields;
		}
		if (q) {
			url = url + '&q=' + q;
		}
		if (orderBy) {
			url = url + '&orderBy=' + orderBy;
		}
		// console.log(' - GET ' + url);

		var options = {
			method: 'GET',
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
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				// console.log(data);
				resolve(data);
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get ' + type + '  : ' + msg + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

		});
	});
};


// get all resources with pagination
var _getAllResources = function (server, endpoint, type, fields, q, orderBy, limit, showProgress) {
	return new Promise(function (resolve, reject) {
		let limitToUse = limit ? limit : MAX_LIMIT;
		var groups = [];
		// 1000 * 100 = 100,000 should be enough
		for (var i = 1; i < 1000; i++) {
			groups.push(limitToUse * i);
		}

		var resources = [];

		var startTime = new Date();
		var needNewLine = false;
		var doGetResources = groups.reduce(function (resPromise, offset) {
			return resPromise.then(function (result) {
				if (result && result.items && result.items.length > 0) {
					resources = resources.concat(result.items);
					if (console.showInfo && showProgress) {
						process.stdout.write(' - querying ' + type +  ' ' + resources.length +
							' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						readline.cursorTo(process.stdout, 0);
						needNewLine = true;
					}
				}
				if (result && result.hasMore) {
					return _getResources(server, endpoint, type, fields, offset, q, orderBy, limitToUse);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise
		_getResources(server, endpoint, type, fields, 0, q, orderBy, limitToUse));

		doGetResources.then(function (result) {
			// console.log(resources.length);
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve(resources);
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
	return _getAllResources(args.server, '/content/management/api/v1.1/channels', 'channels', args.fields);
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get channel ' + channelId);
				console.error(error);
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
				console.error('ERROR: failed to get channel ' + channelId + '  : ' + msg);
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
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get channel ' + channelName);
				console.error(error);
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
					// console.error('ERROR:  channel ' + channelName + ' not found');
					return resolve({});
				}
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get channel ' + channelName + '  : ' + msg + ' (ecid: ' + response.ecid + ')');
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

				var i;
				var csrfToken = result && result.token;

				var q = '';
				if (queryString) {
					q = queryString;
				} else {
					for (i = 0; i < itemIds.length; i++) {
						if (q) {
							q = q + ' or ';
						}
						q = q + 'id eq "' + itemIds[i] + '"';
					}
				}

				var channels = [];
				for (i = 0; i < channelIds.length; i++) {
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
				if (operation === 'deleteItems' || operation === 'approve' || operation === 'setAsTranslated' || operation === 'submitForApproval') {
					operations[operation] = {
						value: 'true'
					};
				} else if (operation === 'reject') {
					operations['approve'] = {
						value: false
					};
				} else if (operation === 'addCollections' || operation === 'removeCollections') {
					operations[operation] = {
						collections: collections
					};
				} else if (operation === 'lock' || operation === 'unlock') {
					operations[operation] = {
						dependencies: !!actOnDependencies
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
				// console.log(q);
				// console.log(JSON.stringify(formData));

				var headers = {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				};
				if (async && async === 'true') {
					headers.Prefer = 'respond-async';
				}
				var postData = {
					method: 'POST',
					url: url,
					headers: headers,
					body: JSON.stringify(formData),
					json: true
				};
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to ' + operation + ' items ' + ' (ecid: ' + response.ecid + ')');
						console.error(error);
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
							data: data,
							ecid: response.ecid
						});
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.error('ERROR: Failed to ' + operation + ' items - ' + msg + ' (ecid: ' + response.ecid + ')');
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
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'deleteItems', [], args.itemIds, '', async);
};

/**
 * Approve items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.approveItems = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'approve', [], args.itemIds, '', async);
};

/**
 * Reject items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.rejectItems = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'reject', [], args.itemIds, '', async);
};

/**
 * submit items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.submitItemsForApproval = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'submitForApproval', [], args.itemIds, '', async);
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
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'validatePublish', [args.channelId], args.itemIds, '', async);
};

/**
 * Set items as translated on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items to publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.ItemsSetAsTranslated = function (args) {
	var async = args.async ? args.async : 'false';
	return _bulkOpItems(args.server, 'setAsTranslated', [], args.itemIds, '', async);
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
		serverUtils.showRequestOptions(options);

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


var _getItemOperationStatus = function (server, statusId, hideError) {
	var showError = hideError ? false : true;
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/bulkItemsOperations/' + statusId;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.error('ERROR: get item operation status');
					console.error(error);
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
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				if (showError) {
					console.error('ERROR: failed to get channel operation status' + '  : ' + msg);
				}
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
	return _getItemOperationStatus(args.server, args.statusId, args.hideError);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to copy assets ' + ' (ecid: ' + response.ecid + ')');
						console.error(error);
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

						console.info(' - submit request');
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
									console.error('ERROR: copy assets failed: ' + msg + ' (ecid: ' + response.ecid + ')');

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
									if (console.showInfo()) {
										process.stdout.write(' - copy assets in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								}
							});
						}, 6000);
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.error('ERROR: Failed to copy assets - ' + msg + ' (ecid: ' + response.ecid + ')');
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


/**
 * Get all language codes on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getLanguageCodes = function (args) {
	var url = '/content/management/api/v1.1/l10n/languageCodes';
	if (args.languageType) {
		url = url + '?q=languageType eq "' + args.languageType + '"';
	}
	return _getAllResources(args.server, url, 'languageCodes');
};

/**
 * Create custom language on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createCustomLanguageCode = function (args) {
	var url = '/content/management/api/v1.1/l10n/languageCodes';
	var param = {
		server: args.server,
		endpoint: '/content/management/api/v1.1/l10n/languageCodes',
		body: args.body,
		noMsg: true
	};
	return _executePost(param);
};

/**
 * Get all localization policies on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getLocalizationPolicies = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/localizationPolicies', 'localizationPolicies', args.fields);
};

/**
 * Get a localization policy with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the channel to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getLocalizationPolicWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}

		var endpoint = '/content/management/api/v1.1/localizationPolicies';
		endpoint = endpoint + '?q=(name mt "' + encodeURIComponent(args.name) + '")';

		_getAllResources(args.server, endpoint, 'localizationPolicies', args.fields)
			.then(function (result) {
				return resolve(result);
			});
	});
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get localization policy ' + id);
				console.error(error);
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
				console.error('ERROR: failed to get localization policy ' + id + ' : ' + msg);
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create localization policy ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to create localization policy ' + name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update localization policy ' + (name || id) + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to update localization policy ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete localization policy ' + id + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to delete localization policy ' + id + ' : ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
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

/**
 * Get all repositories on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRepositories = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/repositories', 'repositories', args.fields);
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get repository ' + repoId);
				console.error(error);
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
				console.error('ERROR: failed to get repository ' + repoId + ' : ' + msg);
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
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get repository ' + repoName);
				console.error(error);
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
				console.error('ERROR: failed to get repository ' + repoName + '  : ' + msg);
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
	return _getAllResources(args.server,
		'/content/management/api/v1.1/repositories/' + args.repositoryId + '/collections',
		'collections', args.fields);
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
			return resolve({});
		}
		var colName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/repositories/' + args.repositoryId + '/collections';
		url = url + '?q=(name mt "' + encodeURIComponent(colName) + '")';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get collection ' + colName);
				console.error(error);
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
				var collections = data && data.items || [];
				var collection;
				for (var i = 0; i < collections.length; i++) {
					if (collections[i].name && collections[i].name.toLowerCase() === colName.toLocaleLowerCase()) {
						collection = collections[i];
						break;
					}
				}
				if (collection) {
					resolve({
						data: collection
					});
				} else {
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get collection ' + colName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});

	});
};


var TAX_MAX_LIMIT = 100;
// Get taxonomies from server
var _getTaxonomies = function (server, fields, offset) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies?q=(status eq "all")';
		url = url + '&limit=' + TAX_MAX_LIMIT;
		if (fields) {
			url = url + '&fields=' + fields;
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get taxonomies');
				console.error(error);
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
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get taxonomies : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

// get all taxonomies with pagination
var _getAllTaxonomies = function (server, fields) {
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
					return _getTaxonomies(server, fields, offset);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise
		_getTaxonomies(server, fields));

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
	return _getAllTaxonomies(args.server, args.fields);
};

/**
 * Get a taxonomy with id on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTaxonomy = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.id) {
			return resolve({});
		}
		var showError = args.showError === undefined ? true : args.showError;
		var taxonomyId = args.id;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomyId;
		if (args.fields) {
			url = url + '?fields=' + args.fields;
		}

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
				if (showError) {
					console.error('ERROR: failed to get taxonomy ' + taxonomyId);
					console.error(error);
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
				return resolve(data);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				if (showError) {
					console.error('ERROR: failed to get taxonomy ' + taxonomyId + '  : ' + msg);
				}
				return resolve({
					err: 'err'
				});
			}
		});
	});
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
		url = url + '?q=(name mt "' + encodeURIComponent(taxonomyName) + '" AND status eq "all")';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get taxonomy ' + taxonomyName);
				console.error(error);
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
					// console.error('ERROR:  channel ' + channelName + ' not found');
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get taxonomy ' + taxonomyName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Get a taxonomy with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the taxonomy to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTaxonomiesWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}
		var taxonomyName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/taxonomies';
		url = url + '?q=(name mt "' + encodeURIComponent(taxonomyName) + '" AND status eq "all")';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get taxonomy matching name ' + taxonomyName);
				console.error(error);
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
				var results = [];
				for (var i = 0; i < taxonomies.length; i++) {
					if (taxonomies[i].name && taxonomies[i].name === taxonomyName) {
						results.push(taxonomies[i]);
					}
				}
				return resolve(results);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get taxonomy matching name ' + taxonomyName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

module.exports.getCategory = function (args) {
	return new Promise(function (resolve, reject) {
		var taxonomyId = args.taxonomyId,
			parentCategoryId = args.parentCategoryId,
			categoryName = args.categoryName;

		var url = '/content/management/api/v1.1/taxonomies/' + taxonomyId + '/categories';
		url += '?q=(parentId eq "' + parentCategoryId + '" and name eq "' + categoryName + '")';
		url += '&fields=ancestors,name,isSiteCategory&links=none';

		var noMsg = true;
		_executeGet(args.server, url, noMsg)
			.then(function (result) {
				var data;
				try {
					data = JSON.parse(result);
				} catch (e) {
					// in case result is no json
				}

				resolve({
					categories: (data && data.items || [])
				});
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
	return new Promise(function (resolve, reject) {
		// Currently this API returns duplicate entries when pagination
		// So use limit 10000 for now
		var query = args.q || '';
		if (args.status) {
			if (query) {
				query = query + ' AND ';
			}
			query = query + 'status eq "' + args.status + '"';
		}

		var url = '/content/management/api/v1.1/taxonomies/' + args.taxonomyId + '/categories';
		url = url + '?limit=10000';
		if (query) {
			url = url + '&q=' + query;
		}
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}
		if (args.orderBy) {
			url = url + '&orderBy=' + args.orderBy;
		}
		var noMsg = true;
		_executeGet(args.server, url, noMsg)
			.then(function (result) {
				var data;
				try {
					data = JSON.parse(result);
				} catch (e) {
					// in case result is no json
				}
				resolve({
					taxonomyName: args.taxonomyName,
					taxonomyId: args.taxonomyId,
					categories: (data && data.items || [])
				});
			});

		/*
				_getAllResources(args.server, '/content/management/api/v1.1/taxonomies/' + args.taxonomyId + '/categories',
					'categories', args.fields, q, args.orderBy)
					.then(function (result) {
						resolve({
							taxonomyName: args.taxonomyName,
							taxonomyId: args.taxonomyId,
							categories: result
						});
					});
				*/

	});
};

/**
 * Get all category properties of a taxonomy on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {object} args.taxonomyId the taxonomy Id
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getCategoryProperties = function (args) {
	return new Promise(function (resolve, reject) {
		_getAllResources(args.server, '/content/management/api/v1.1/taxonomies/' + args.taxonomyId + '/categoryProperties',
			'categoryProperties')
			.then(function (result) {
				resolve({
					taxonomyId: args.taxonomyId,
					categoryProperties: result
				});
			});
	});
};

var _getResourcePermissions = function (server, id, type, repositoryId) {
	return new Promise(function (resolve, reject) {
		var resourceType = type === 'repository' ? 'repositories' : (type + 's');
		var url;
		if (type === 'collection') {
			url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections/' + id + '/permissions';
		} else {
			url = server.url + '/content/management/api/v1.1/' + resourceType + '/' + id + '/permissions';
		}
		// console.log(url);
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
				console.error('ERROR: failed to get ' + type + ' permissions for ' + id);
				console.error(error);
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
				console.error('ERROR: failed to get ' + type + ' permissions for ' + id + ' : ' + msg);
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
 * @param {string} args.type The type of the resource to query [repository | type | collection]
 * @param {string} args.repositoryId The id of the repository of the collection
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getResourcePermissions = function (args) {
	return _getResourcePermissions(args.server, args.id, args.type, args.repositoryId);
};


/**
 * Get all permission sets of repository  on a oce server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} server the server object
 * @param {string} args.id The id of the repository to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getPermissionSets = function (args) {
	return new Promise(function (resolve, reject) {
		_getAllResources(args.server, '/content/management/api/v1.1/repositories/' + args.id + '/permissionSets', 'permissionSets')
			.then(function (result) {
				resolve({
					id: args.id,
					name: args.name,
					permissionSets: result
				});
			});
	});
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to ' + action + ' permission sets for ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to ' + action + ' permission sets for ' + name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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
var _createRepository = function (server, name, description, contentTypes, channels, defaultLanguage,
	repositoryType, additionalLangs, legacyRepo) {
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
				payload.defaultLanguage = (defaultLanguage || "");
				if (!payload.defaultLanguage) {
					payload.defaultLanguage = repositoryType && repositoryType === 'Business' ? 'und' : 'en-US';
				}

				payload.taxonomies = [];

				if (contentTypes && contentTypes.length > 0) {
					payload.contentTypes = contentTypes;
				}
				if (channels && channels.length > 0) {
					payload.channels = channels;
				}

				if (additionalLangs && additionalLangs.length > 0) {
					payload.languageOptions = additionalLangs;
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

				if (legacyRepo) {
					postData.headers.SKIP_SEEDED_DIGITAL_CHECK = true;
				}

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create repository ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to create repository ' + name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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
 * @param {array} args.additionalLanguages A list of language codes to apply to the repository's additional languages
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createRepository = function (args) {
	return _createRepository(args.server, args.name, args.description,
		args.contentTypes, args.channels, args.defaultLanguage, args.repositoryType, args.additionalLanguages,
		args.legacyRepo);
};

// Update repository
var _updateRepository = function (server, repository, contentTypes, channels,
	taxonomies, autoTagEnabled, languages, connectors, editorialRoles) {
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
				if (languages && languages.length > 0) {
					data.languageOptions = languages;
				}
				if (connectors && connectors.length > 0) {
					data.connectors = connectors;
				}
				if (editorialRoles) {
					data.editorialRoles = editorialRoles;
				}

				if (autoTagEnabled !== undefined) {
					data.autoTagEnabled = autoTagEnabled || false;
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update repository ' + repository.name + ' (ecid: ' + response.ecid + ')');
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.error('ERROR: Failed to update repository ' + repository.name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
						// console.log(data);
						if (data && data['o:errorDetails'] && data['o:errorDetails'].length > 0) {
							console.error(JSON.stringify(data['o:errorDetails'], null, 4));
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
	return _updateRepository(args.server, args.repository, args.contentTypes, args.channels,
		args.taxonomies, args.autoTagEnabled, args.languages, args.connectors,
		args.editorialRoles);
};

var _performPermissionOperation = function (server, operation, resourceId, resourceName, resourceType, role, users, groups, roleId) {
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
				var i;
				for (i = 0; i < users.length; i++) {
					userArr.push({
						name: users[i].loginName,
						type: 'user'
					});
				}

				for (i = 0; i < groups.length; i++) {
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
					// Role is not a default role. Assume the tyoe is 'editorial'.
					if (['manager', 'contributor', 'viewer'].indexOf(role) === -1) {
						operations[operation]['roles'] = [{
							id: roleId,
							name: role,
							users: userArr,
							type: 'editorial'
						}];
					} else {
						operations[operation]['roles'] = [{
							name: role,
							users: userArr
						}];
					}
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to ' + operation + ' resource ' + ' (ecid: ' + response.ecid + ')');
						console.error(error);
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

					var msg;
					if (response && response.statusCode === 200) {
						var failedRoles = data && data.operations[operation] && data.operations[operation].failedRoles;
						msg = '';
						if (failedRoles && failedRoles.length > 0) {
							// console.log(JSON.stringify(failedRoles, null, 2));
							for (var i = 0; i < failedRoles.length; i++) {
								for (var j = 0; j < failedRoles[i].users.length; j++) {
									msg = msg + ' ' + (failedRoles[i].users[j].name || failedRoles[i].users[j].id) + ': ' + failedRoles[i].users[j].message;
								}
							}
							console.error('ERROR: failed to ' + operation + ' resource: ' + msg + ' (ecid: ' + response.ecid + ')');
							resolve({
								err: 'err'
							});

						} else {
							resolve(data);
						}
					} else {
						msg = data ? (data.detail || data.title) : response.statusMessage;
						console.error('ERROR: failed to ' + operation + ' resource ' + msg + ' (ecid: ' + response.ecid + ')');
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
		args.operation, args.resourceId, args.resourceName, args.resourceType, args.role, args.users || [], args.groups || [], args.roleId);
};

/**
 * Get all editorial roles on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getEditorialRoles = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/editorialRoles',
		'editorialRoles', args.fields, '', 'name:asc');
};

/**
 * Get an editorial role with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the editorial role to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getEditorialRoleWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}
		var roleName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/editorialRoles';
		url = url + '?q=(name mt "' + encodeURIComponent(roleName) + '")';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get editorial role ' + roleName + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				var roles = data && data.items || [];
				var role;
				for (var i = 0; i < roles.length; i++) {
					if (roles[i].name && roles[i].name.toLowerCase() === roleName.toLocaleLowerCase()) {
						role = roles[i];
						break;
					}
				}
				if (role) {
					resolve({
						data: role
					});
				} else {
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get editorial role ' + roleName + '  : ' + msg + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

// Create an editorial role on server
var _createEditorialRole = function (server, name, description, contentPrivilegesToCreate, taxonomyPrivilegesToCreate) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var contentPrivileges = contentPrivilegesToCreate || [{
					typeId: '',
					typeName: 'any',
					operations: ['view']
				}];
				var taxonomyPrivileges = taxonomyPrivilegesToCreate || [{
					taxonomyId: 'any',
					categoryId: '',
					operations: ['view']
				}];

				var payload = {
					name: name,
					description: description || '',
					contentPrivileges: contentPrivileges,
					taxonomyPrivileges: taxonomyPrivileges
				};

				var url = server.url + '/content/management/api/v1.1/editorialRoles';
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create editorial role ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to create editorial role ' + name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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
 * Create editorial role on server by channel name
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the editorial role to create.
 * @param {string} args.description The description of the editorial role.
 * @param {string} args.contentPrivileges The contentPrivileges of the editorial role.
 * @param {string} args.taxonomyPrivileges The taxonomyPrivileges of the editorial role.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createEditorialRole = function (args) {
	return _createEditorialRole(args.server, args.name, args.description, args.contentPrivileges, args.taxonomyPrivileges);
};

// Update an editorial role on server
var _updateEditorialRole = function (server, role) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var payload = role;
				var url = server.url + '/content/management/api/v1.1/editorialRoles/' + role.id;
				var options = {
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
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.put(options, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update editorial role ' + role.name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to update editorial role ' + role.name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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
 * Update editorial role on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.role The editorial role json object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateEditorialRole = function (args) {
	return _updateEditorialRole(args.server, args.role);
};

// Delete an editorial role on server
var _deleteEditorialRole = function (server, id, name) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/editorialRoles/' + id;
				var options = {
					method: 'DELETE',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.delete(options, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete editorial role ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to delete editorial role ' + name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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
 * Delete editorial role on server by channel name
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the editorial role to create.
 * @param {string} args.id The id of the editorial role.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteEditorialRole = function (args) {
	return _deleteEditorialRole(args.server, args.id, args.name);
};


/**
 * Get all types on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentTypes = function (args) {
	// return _getContentTypes(args.server);
	return _getAllResources(args.server, '/content/management/api/v1.1/types', 'types');
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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				if (showError) {
					console.error('ERROR: failed to get type ' + typeName);
					console.error(error);
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
					console.error('ERROR: failed to get type ' + typeName + ' : ' + msg);
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create type ' + name + ' (ecid: ' + response.ecid + ')');
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
						console.error('ERROR: Failed to create type ' + name + ' - ' + msg + ' (ecid: ' + response.ecid + ')');
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

var _getUpdateTypeStatus = function (server, statusUrl) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'GET',
			url: statusUrl,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get update type status');
				console.error(error);
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
				console.error('ERROR: failed to get update type status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
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
						Prefer: 'respond-async',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(payload),
					json: true
				};

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update type ' + name);
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

					var statusUrl = response.location;
					if (response && response.statusCode >= 200 && response.statusCode < 300 && statusUrl) {
						console.info(' - submit request to update ' + name);
						var startTime = new Date();
						var needNewLine = false;
						var inter = setInterval(function () {
							var jobPromise = _getUpdateTypeStatus(server, statusUrl);
							jobPromise.then(function (data) {
								// console.log(data);
								if (!data || data.error || data.progress === 'failed') {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
									console.error('ERROR: update type ' + name + ' failed: ' + msg);

									return resolve({
										err: 'err'
									});
								}
								if (data.completed) {
									clearInterval(inter);
									if (console.showInfo()) {
										process.stdout.write(' - update type ' + name + ' in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										process.stdout.write(os.EOL);
									}

									// return the type itself
									return resolve(typeObj);
								} else {
									if (console.showInfo()) {
										process.stdout.write(' - update type ' + name + ' in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
										readline.cursorTo(process.stdout, 0);
										needNewLine = true;
									}
								}
							});
						}, 5000);
					} else {
						var msg = data && data.detail ? data.detail : (response.statusMessage || response.statusCode);
						console.error('ERROR: Failed to update type ' + name + ' - ' + msg);
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
					console.error(error);
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
					console.error(error);
				}
				resolve({
					err: 'err'
				});
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

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get taxonomy export status');
				console.error(error);
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
				console.error('ERROR: failed to get taxonomy export status' + '  : ' + msg);
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to export taxonomy ' + name + ' (ecid: ' + response.ecid + ')');
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
						var jobId = data && data.jobId;
						if (jobId) {
							console.info(' - job id: ' + jobId);
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
										console.error('ERROR: export taxonomy failed: ' + msg + ' (ecid: ' + response.ecid + ')');

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
										if (console.showInfo()) {
											count.push('.');
											process.stdout.write(' - export taxonomy in process ' + count.join(''));
											readline.cursorTo(process.stdout, 0);
											needNewLine = true;
										}
									}
								});
							}, 5000);
						} else {
							console.error('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to export taxonomy ' + name + ' - ' + msg);
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

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get taxonomy import status');
				console.error(error);
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
				console.error('ERROR: failed to get taxonomy import status' + '  : ' + msg);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to import taxonomy ' + name + ' (ecid: ' + response.ecid + ')');
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						var jobId = data && data.jobId;
						if (jobId) {
							console.info(' - job id: ' + jobId);
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
										console.error('ERROR: import taxonomy failed: ' + msg + ' (ecid: ' + response.ecid + ')');

										return resolve({
											err: 'err'
										});
									}
									if (data.status === 'COMPLETED') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										return resolve(data);

									} else {
										if (console.showInfo()) {
											count.push('.');
											process.stdout.write(' - import taxonomy in process ' + count.join(''));
											readline.cursorTo(process.stdout, 0);
											needNewLine = true;
										}
									}
								});
							}, 6000);
						} else {
							console.error('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to import taxonomy ' + name + ' - ' + msg);
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

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get ' + action + ' taxonomy  status');
				console.error(error);
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
				console.error('ERROR: failed to get ' + action + ' taxonomy status' + '  : ' + msg);
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
				} else if (action !== 'createDraft') {
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to ' + action + ' taxonomy ' + name);
						console.error(error);
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
							console.info(' - submit request (job id: ' + jobId + ')');
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
										console.error('ERROR: export taxonomy failed: ' + msg);

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
										if (console.showInfo()) {
											count.push('.');
											process.stdout.write(' - ' + action + ' taxonomy in process ' + count.join(''));
											readline.cursorTo(process.stdout, 0);
											needNewLine = true;
										}
									}
								});
							}, 5000);
						} else {
							console.error('ERROR: no job info is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to ' + action + ' taxonomy ' + name + ' - ' + msg);
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create taxonomy ' + name);
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.error('ERROR: Failed to create taxonomy ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Create a taxonomy on server
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to add category sibling ' + name);
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.error('ERROR: Failed to add category sibling ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Add a category to a taxonomy on server
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.delete(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to delete taxonomy ' + name);
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.error('ERROR: Failed to delete taxonomy ' + name + ' : ' + (response.statusMessage || response.statusCode));
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
 * Delete a taxonomy on server
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


/**
 * Get all recommendations on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRecommendations = function (args) {
	// return _getRecommendations(args.server, args.repositoryId, args.repositoryName);
	return new Promise(function (resolve, reject) {
		var q = '(repositoryId eq "' + args.repositoryId + '")';
		_getAllResources(args.server, '/content/management/api/v1.1/personalization/recommendations',
			'recommendations', args.fields, q)
			.then(function (result) {
				resolve({
					repositoryId: args.repositoryId,
					repositoryName: args.repositoryName,
					data: result
				});
			});
	});
};

var _getContentJobStatus = function (server, jobId, hideError, type) {
	return new Promise(function (resolve, reject) {
		var statusUrl = server.url + '/content/management/api/v1.1/content-templates/' + (type ? type : 'exportjobs') + '/' + jobId;
		var options = {
			url: statusUrl,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// serverUtils.showRequestOptions(options);

		var showError = hideError ? false : true;
		var request = require('./requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				if (showError) {
					console.error('ERROR: Failed to get job status' + ' (ecid: ' + response.ecid + ')');
					console.error(err);
				}
				return resolve({
					status: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					// in case result is not json
				}
				return resolve({
					status: 'success',
					type: type ? type : 'exportjobs',
					data: data
				});
			} else {
				if (showError) {
					console.error('ERROR: Failed to get job status: ' + response.statusCode + ' (ecid: ' + response.ecid + ')');
				}
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
	return _getContentJobStatus(args.server, args.jobId, args.hideError, args.type);
};

/**
 * Check export/import status on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentImportJobStatus = function (args) {
	return _getContentJobStatus(args.server, args.jobId, args.hideError, 'importjobs');
};

/**
 * Check import status on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getContentImportJobResult = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/content-templates/importjobs/' + args.jobId + '/results', 'importjobResults');
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
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.error('ERROR: Failed to export recommendation ' + name);
						console.error(err);
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
						console.error('ERROR: failed to export: ' + msg);
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

var _updateRecommendation = function (server, recommendation) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/personalization/recommendations/' + recommendation.id;
				var recommendation2 = {};
				var allowedFields = ['apiName', 'channels', 'contentTypes', 'defaults', 'description',
					'main', 'name', 'repositoryId'
				];
				Object.keys(recommendation).forEach(function (key) {
					if (allowedFields.includes(key)) {
						recommendation2[key] = recommendation[key];
					}
				});

				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(recommendation2),
					json: true
				};
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to update recommendation ' + recommendation.name);
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

					if (response && response.statusCode === 200) {
						resolve(data);
					} else {
						var msg = response.statusMessage || response.statusCode;
						console.error('ERROR: Failed to update recommendation ' + recommendation.name + ' : ' + msg);
						if (data) {
							console.error(JSON.stringify(data, null, 4));
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
 * Add channels to recommendation on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.channelIds the array of channel ids
 * @param {object} args.recommendation JavaScript object containing recommendation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addChannelToRecommendation = function (args) {
	var recommendation = args.recommendation;
	var channels = recommendation.channels || [];
	args.channelIds.forEach(function (id) {
		var found = false;
		for (var i = 0; i < channels.length; i++) {
			if (channels[i].id === id) {
				found = true;
				break;
			}
		}
		if (!found) {
			channels.push({
				id: id
			});
		}
	});
	recommendation.channels = channels;

	return _updateRecommendation(args.server, args.recommendation);
};

/**
 * remove channels from recommendation on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.channelIds the array of channel ids
 * @param {object} args.recommendation JavaScript object containing recommendation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeChannelFromRecommendation = function (args) {
	var recommendation = args.recommendation;
	var channels = recommendation.channels || [];
	args.channelIds.forEach(function (id) {
		var idx = undefined;
		for (var i = 0; i < channels.length; i++) {
			if (channels[i].id === id) {
				idx = i;
				break;
			}
		}
		if (idx !== undefined) {
			channels.splice(idx, 1);
		}
	});
	recommendation.channels = channels;

	return _updateRecommendation(args.server, args.recommendation);
};

var _getRecommendationActionStatus = function (server, url, action) {
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get ' + action + ' recommendation status');
				console.error(error);
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
				console.error('ERROR: failed to get ' + action + ' recommendation status' + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};
// Publish/Unpublish a recommendation
var _publishUnpublishRecommendation = function (server, id, name, channels, action) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var url = server.url + '/content/management/api/v1.1/personalization/recommendations/' + id + '/' + action;
				var payload = {
					channels: channels
				};
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
				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to ' + action + ' recommendation ' + name);
						console.error(error);
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
							console.info(' - submit request (job id: ' + jobId + ')');
							var startTime = new Date();
							var needNewLine = false;
							var inter = setInterval(function () {
								var jobPromise = _getRecommendationActionStatus(server, statusUrl, action);
								jobPromise.then(function (data) {
									if (!data || data.progress === 'failed' || data.progress === 'aborted') {
										clearInterval(inter);
										if (needNewLine) {
											process.stdout.write(os.EOL);
										}
										var msg = data && data.summary ? data.summary : '';
										console.error('ERROR: ' + action + ' recommendation failed: ' + msg);

										return resolve({
											err: 'err'
										});
									}
									if (data.completed && data.progress === 'succeeded') {
										clearInterval(inter);
										if (console.showInfo()) {
											process.stdout.write(' - ' + action + ' recommendation ' + name + ' in process [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
											readline.cursorTo(process.stdout, 0);
											process.stdout.write(os.EOL);
										}
										return resolve({});

									} else {
										if (console.showInfo()) {
											process.stdout.write(' - ' + action + ' recommendation in process [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
											readline.cursorTo(process.stdout, 0);
											needNewLine = true;
										}
									}
								});
							}, 5000);
						} else {
							console.error('ERROR: no job info is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to ' + action + ' recommendation ' + name + ' - ' + msg);
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
 * Publish recommendation on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {object} args.id the id of the recommendation
 * @param {object} args.name the name of the recommendation
 * @param {string} args.channels the array of channels
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.publishRecommendation = function (args) {
	return _publishUnpublishRecommendation(args.server, args.id, args.name, args.channels, 'publish');
};

/**
 * Unpublish recommendation on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {object} args.id the id of the recommendation
 * @param {object} args.name the name of the recommendation
 * @param {string} args.channels the array of channels
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.unpublishRecommendation = function (args) {
	return _publishUnpublishRecommendation(args.server, args.id, args.name, args.channels, 'unpublish');
};

var _importContent = function (server, fileId, repositoryId, channelId, update, channelIds, reuse) {
	return new Promise(function (resolve, reject) {
		serverUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;
				var url = server.url + '/content/management/api/v1.1/content-templates/importjobs';

				var channels = channelIds && channelIds.length > 0 ? channelIds : [];
				if (channelId) {
					channels.push(channelId);
				}
				var postData = {
					'exportDocId': fileId,
					'repositoryId': repositoryId,
					'channelIds': channels
				};
				if (reuse) {
					postData.source = 'reuseExisting';
				} else if (update) {
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
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.error('ERROR: Failed to import' + ' (ecid: ' + response.ecid + ')');
						console.error(err);
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
								jobId: jobId,
								ecid: response.ecid
							});
						}
					} else {
						// console.log(data);
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to import: ' + msg + ' (ecid: ' + response.ecid + ')');
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
			_importContent(args.server, args.fileId, args.repositoryId, args.channelId, args.update, args.channelIds, args.reuse)
				.then(function (result) {
					if (!result || result.err || !result.jobId) {
						return resolve(result);
					}

					var jobId = result.jobId;
					console.log(' - submit import job (' + jobId + ')' + (args.update ? ', updating content' : ''));
					var importEcid = result.ecid;
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
									console.error('ERROR: import failed: ' + data.errorDescription + ' (ecid: ' + importEcid + ')');
									if (!data.errorDescription) {
										console.error(data);
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
		return _importContent(args.server, args.fileId, args.repositoryId, args.channelId, args.update, args.channelIds, args.reuse);
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
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData)
				};
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.error('ERROR: Failed to export content item ' + (name || id));
						console.error(err);
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
						console.error('ERROR: failed to export: ' + msg);
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
			} else if (isMultiPart && !fs.existsSync(filepath)) {
				console.error('ERROR: updateRenditionStatus file ' + filepath + ' does not exist');
				resolve({err: 'file ' + filepath + ' does not exist'});
			}	else {
				var request = require('./requestUtils.js').request;
				var csrfToken = result && result.token,
					options = {
						method: 'POST',
						url: server.url + '/content/management/api/v1.1/contentRenditionJobs',
						headers: {
							'X-CSRF-TOKEN': csrfToken,
							'X-REQUESTED-WITH': 'XMLHttpRequest',
							Authorization: serverUtils.getRequestAuthorization(server)
						}
					};

				var job = {
					'jobId': jobId,
					'status': status,
					'progress': progress,
					'compiledAt': compiledAt
				};

				if (isMultiPart) {

					var FormData = require('form-data');
					var form = new FormData();

					// add in the "status" details
					form.append('status', JSON.stringify(job), {
						contentType: 'application/json'
					});

					console.log(filepath);
					// add in the "file" details
					form.append('file', fs.createReadStream(filepath), {
						contentType: 'application/zip'
					});

					options.body = form;

				} else {
					options.headers['Content-Type'] = 'application/json';
					options.body = JSON.stringify(job);
				}

				serverUtils.showRequestOptions(options);

				// console.log(' - uploading file ...');
				request.post(options, function (error, response, body) {
					if (error) {
						console.error('updateRenditionStatus: ' + error);
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
						console.error('updateRenditionStatus: ' + msg);
						return resolve({
							error: data
						});
					}
				});
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
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.error('ERROR: Failed to import compiled content from ' + filePath);
						console.error(err);
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
									console.error('ERROR: import compiled content failed: ' + msg);

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
						console.error('ERROR: failed to import compiled content : ' + msg);
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
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					},
					body: JSON.stringify(postData),
					json: true
				};
				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (err, response, body) {
					if (err) {
						console.error('ERROR: Failed to schedule publishing of items ' + name + ' (ecid: ' + response.ecid + ')');
						console.error(err);
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
						console.error('ERROR: failed to schedule publishing of items: ' + msg + ' (ecid: ' + response.ecid + ')');
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

/**
 * Get a site plan with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the site plan to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getSitePlansWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}

		var endpoint = '/content/management/api/v1.1/sitePlans';
		endpoint = endpoint + '?q=(name co "' + encodeURIComponent(args.name) + '")';

		_getAllResources(args.server, endpoint, 'sitePlans', args.fields)
			.then(function (result) {
				return resolve(result);
			});
	});
};

/**
 * create a site plan on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the site plan to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createSitePlan = function (args) {
	var url = '/content/management/api/v1.1/sitePlans';
	var body = {
		name: args.name,
		displayName: args.displayName,
		repositoryId: args.repositoryId,
		type: 'SeededSitePlanType'
	};
	if (args.description) {
		body.description = args.description;
	}

	var param = {
		server: args.server,
		endpoint: url,
		body: body,
		noMsg: true
	};
	return _executePost(param);
};

/////////////////////////////////////////////////////////
//  Social APIs
/////////////////////////////////////////////////////////

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
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get groups');
				console.error(error);
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
				console.error('ERROR: failed to get groups ' + msg);
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

		var items = [];
		var groups = [];
		var limit = 1000;
		// 1000 * 100 should be enough
		for (var i = 1; i < 100; i++) {
			groups.push(limit * i);
		}

		var startTime = new Date();
		var needNewLine = false;
		var doGetGroups = groups.reduce(function (groupPromise, offset) {
			return groupPromise.then(function (result) {
				if (result && result.items && result.items.length > 0) {
					items = items.concat(result.items);
				}
				if (items.length > 0 && console.showInfo) {
					process.stdout.write(' - querying groups ' + items.length +
							' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
				if (result && result.hasMore) {
					return _getGroups(args.server, limit, offset);
				}
			});
		},
		// Start with a previousPromise value that is a resolved promise
		_getGroups(args.server, limit, 0));

		doGetGroups.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve(items);
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get members of group ' + (name || id));
				console.error(error);
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
				console.error('ERROR: failed to get members of group ' + (name || id) + ' : ' + msg);
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
		var newSocialConnectionExpiryTime = function () {
			return Date.now() + 5 * 60000;
		}
		// If apiRandomID and cookieStore have already been cached, then just use them, as long as not too much time has elapsed.
		if (server.apiRandomID && server.cookieStore && server.socialConnectionExpiryTime > Date.now()) {
			server.socialConnectionExpiryTime = newSocialConnectionExpiryTime(); // reset social connection expiry time
			return resolve({
				apiRandomID: server.apiRandomID,
				cookieStore: server.cookieStore,
				socialUser: server.socialUser
			});
		}

		var url = server.url + '/osn/social/api/v1/connections';

		var postData = {
			method: 'POST',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			},
		};

		serverUtils.showRequestOptions(postData);

		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create connection' + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
				// Cache apiRandomID and cookieStore for re-use, so that we don't need to create a
				// connection for each API request.
				var apiRandomID = data && data.apiRandomID;
				cacheCookiesFromResponse(server, response);
				server.apiRandomID = apiRandomID;
				server.socialUser = data.user;
				server.socialConnectionExpiryTime = newSocialConnectionExpiryTime(); // social connection expires after period of idleness
				resolve({
					apiRandomID: apiRandomID,
					cookieStore: server.cookieStore,
					socialUser: data.user
				});
			} else {
				var msg = response.statusMessage || response.statusCode;
				console.error('ERROR: failed to create connection' + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				// console.error('ERROR: failed to get group ' + name);
				// console.error(error);
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
				// console.error('ERROR: failed to get group ' + name + ' ' + msg);
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
					addCachedCookiesForRequest(server, postData);

					serverUtils.showRequestOptions(postData);

					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: create group ' + name + ' (ecid: ' + response.ecid + ')');
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to create group ' + name + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
							return resolve({
								err: 'err'
							});
						}
					});
				}
			});
	});
};

function cacheCookiesFromResponse(server, response) {
	server.cookieStore = server.cookieStore || {};
	if (response.headers && response.headers.raw && typeof response.headers.raw === 'function') {
		let setCookie = response.headers.raw()['set-cookie'] || [];
		setCookie.forEach(cookie => {
			let nameValue = cookie.split(";")[0].split("=");
			server.cookieStore[nameValue[0]] = nameValue[1];
		});
	}
}

function addCachedCookiesForRequest(server, request) {
	if (server.cookieStore) {
		let cookieHeader = Object.keys(server.cookieStore).map(cookieName => cookieName + '=' + server.cookieStore[cookieName]).join("; ");
		request.headers.Cookie = cookieHeader;
	}
}

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
					addCachedCookiesForRequest(server, postData);

					serverUtils.showRequestOptions(postData);

					request.delete(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: delete group ' + (name || id) + ' (ecid: ' + response.ecid + ')');
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve({});
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to delete group ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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

var _addMemberToGroup = function (request, cookieStore, server, apiRandomID, id, name, memberId, memberName, role, isGroup) {
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
		addCachedCookiesForRequest(server, postData);

		serverUtils.showRequestOptions(postData);

		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: add member ' + (memberName || memberId) + ' to group ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
			cacheCookiesFromResponse(server, response);
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
				console.error('ERROR: add member ' + (memberName || memberId) + ' to group ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
	var results = [];
	return new Promise(function (resolve, reject) {
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve([{
						err: 'err'
					}]);
				} else {
					var apiRandomID = result.apiRandomID;
					var cookieStore = result.cookieStore;

					var doAddMember = members.reduce(function (addPromise, member) {
						return addPromise.then(function (result) {
							return _addMemberToGroup(request, cookieStore, server, apiRandomID, id, name, member.id,
								member.name, member.role, member.isGroup)
								.then(function (result) {
									results.push(result);
								});
						});
					},
					// Start with a previousPromise value that is a resolved promise
					Promise.resolve({}));

					doAddMember.then(function (result) {
						// console.log(resources.length);
						resolve(results);
					});
				}
			});
	});
};

var _removeMemberFromGroup = function (request, cookieStore, server, apiRandomID, id, name, memberId, memberName) {
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
		addCachedCookiesForRequest(server, postData);

		serverUtils.showRequestOptions(postData);

		request.delete(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: remove member ' + (memberName || memberId) + ' from group ' + (name || id) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
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
			cacheCookiesFromResponse(server, response);
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
				console.error('ERROR: remove member ' + (memberName || memberId) + ' from group ' + (name || id) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
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
					var cookieStore = result.cookieStore;
					var memberPromises = [];
					for (var i = 0; i < members.length; i++) {
						memberPromises.push(_removeMemberFromGroup(request, cookieStore, server, apiRandomID, id, name,
							members[i].id, members[i].name));
					}
					Promise.all(memberPromises).then(function (results) {
						return resolve(results);
					});
				}
			});
	});
};

/////////////////////////////////////////////////////////
//  Utilities
/////////////////////////////////////////////////////////

/**
 * Makes an HTTP GET request to a REST API endpoint on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server The server object
 * @param {string} args.endpoint The REST endpoint
 * @param {string} args.headers The additional headers
 * @returns {Promise.<object>} The data returned by the server.
 * @returns
 */
module.exports.executeGet = function (args) {
	return _executeGet(args.server, args.endpoint, args.noMsg, args.headers, args.returnContentType);
};

var _executeGet = function (server, endpoint, noMsg, headers, returnContentType) {
	return new Promise(function (resolve, reject) {
		var showDetail = noMsg ? false : true;
		var url;
		if (endpoint.startsWith('http')) {
			url = endpoint;
		} else {
			url = server.url + endpoint;
		}

		var hdrs = Object.assign(headers || {}, {
			Authorization: serverUtils.getRequestAuthorization(server)
		});

		var options = {
			url: url,
			encoding: null,
			headers: hdrs
		};
		if (server.cookies) {
			options.headers.Cookie = server.cookies;
		}

		serverUtils.showRequestOptions(options);

		if (showDetail) {
			console.log(' - executing endpoint: ' + endpoint);
		}

		var request = require('./requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to execute' + ' (ecid: ' + response.ecid + ')');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}
			if (showDetail) {
				console.log(' - status: ' + response.statusCode + ' (' + response.statusMessage + ')');
			}
			if (response && response.statusCode === 200) {
				if (returnContentType) {
					return resolve({data: body, contentType: response.headers.get('content-type')});
				} else {
					return resolve(body);
				}
			} else {
				console.error('ERROR: Failed to execute' + ' (ecid: ' + response.ecid + ')');
				var data;
				try {
					data = JSON.parse(body);
					console.error(JSON.stringify(data));
				} catch (e) {
					// in case result is not json
				}
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

module.exports.executeGetStream = function (args) {
	return _executeGetStream(args.server, args.endpoint, args.writer, args.noMsg, args.noError, args.headers);
};

var _executeGetStream = function (server, endpoint, writer, noMsg, noError, headers) {
	return new Promise(function (resolve, reject) {
		var showDetail = noMsg ? false : true;
		var showError = noError ? false : true;
		var url;
		if (endpoint.startsWith('http')) {
			url = endpoint;
		} else {
			url = server.url + endpoint;
		}

		var hdrs = Object.assign(headers || {}, {
			Authorization: serverUtils.getRequestAuthorization(server)
		});
		var options = {
			url: url,
			encoding: null,
			headers: hdrs
		};
		if (server.cookies) {
			options.headers.Cookie = server.cookies;
		}
		serverUtils.showRequestOptions(options);

		if (showDetail) {
			console.log(' - executing endpoint: ' + endpoint);
		}

		var request = require('./requestUtils.js').request;
		request.getStream(options, function (err, response, body) {
			if (err) {
				if (showError) {
					console.error('ERROR: Failed to execute' + ' (ecid: ' + response.ecid + ')');
					console.error(err);
				}
				return resolve({
					err: 'err',
					statusCode: response.statusCode,
					statusMessage: response.statusMessage
				});
			}
			if (showDetail) {
				console.log(' - status: ' + response.statusCode + ' (' + response.statusMessage + ')');
			}
			if (response && response.statusCode === 200) {
				if (showDetail) {
					console.log(' - writing result ...');
				}
				body.pipe(writer);
				body.on('end', function () {
					// console.log(' - ended');
					return resolve({});
				});
			} else {
				if (showError) {
					console.error('ERROR: Failed to execute ' + (response.statusMessage || response.statusCode) + ' (ecid: ' + response.ecid + ')');
				}
				var data;
				try {
					data = JSON.parse(body);
					console.error(data);
				} catch (e) {
					// in case result is not json
				}
				return resolve({
					err: 'err',
					statusCode: response.statusCode,
					statusMessage: response.statusMessage
				});
			}
		});
	});
};

/**
 * Makes an HTTP POST request to a REST API endpoint on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server The server object
 * @param {string} args.endpoint The REST endpoint
 * @param {string} args.contentType The request content type
 * @param {string} args.body The JSON object for the request payload
 * @param {boolean} args.async Send asynchronous request
 * @param {string} args.headers The additional headers
 * @returns
 */
module.exports.executePost = function (args) {
	return _executePost(args);
};

var _executePost = function (args) {
	return new Promise(function (resolve, reject) {
		var showDetail = args.noMsg ? false : true;
		var showError = args.noError ? false : true;
		var responseStatus = args.responseStatus ? true : false;
		var endpoint = args.endpoint;
		var isCAAS = endpoint.indexOf('/content/management/api/') === 0;
		var isSystem = endpoint.indexOf('/system/api/') === 0;

		var server = args.server;
		var url = server.url + args.endpoint;
		var body = args.body;
		var isFormDataStream = args.isStream;
		var async = args.async;
		var contentType = args.contentType;

		var caasTokenPromises = [];
		if (isCAAS) {
			caasTokenPromises.push(serverUtils.getCaasCSRFToken(server));
		} else if (isSystem) {
			caasTokenPromises.push(serverUtils.getSystemCSRFToken(server, args.noError));
		}

		Promise.all(caasTokenPromises)
			.then(function (results) {
				var csrfToken = results && results[0] && results[0].token;
				var hdrs = Object.assign(args.headers || {}, {
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				});
				var postData = {
					method: 'POST',
					url: url,
					headers: hdrs
				};
				if (csrfToken) {
					postData.headers['X-CSRF-TOKEN'] = csrfToken;
				}
				if (async) {
					postData.headers['Prefer'] = 'respond-async';
				}
				if (contentType) {
					postData.headers['Content-Type'] = contentType;
				}
				if (body) {
					if (isFormDataStream) {
						postData.body = body;
					}
					else if (Object.keys(body).length > 0) {
						postData.headers['Content-Type'] = 'application/json';
						postData.body = JSON.stringify(body);
					}
				}

				serverUtils.showRequestOptions(postData);

				if (showDetail) {
					console.info(' - executing endpoint: POST ' + endpoint);
				}
				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						if (showError) {
							console.error('ERROR: Failed to post ' + endpoint + ' (ecid: ' + response.ecid + ')');
							console.error(error);
						}
						return resolve({
							err: 'err'
						});
					}

					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						// in case result is not json
					}
					if (async) {
						if (showDetail) {
							console.log('Status: ' + response.statusCode + ' ' + response.statusMessage);
						}
						var statusUrl = response.location;
						if (statusUrl) {
							console.log(' - submit background job');
							console.log(' - job status: ' + statusUrl);
							var startTime = new Date();
							var needNewLine = false;
							var noMsg = true;
							var inter = setInterval(function () {
								_executeGet(server, statusUrl, noMsg)
									.then(function (result) {
										var data;
										try {
											data = JSON.parse(result);
										} catch (e) {
											// in case result is not json
										}
										// console.log(data);
										if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
											clearInterval(inter);
											if (needNewLine) {
												process.stdout.write(os.EOL);
											}
											var msg = data && data.error ? (data.error.detail || data.error.title) : '';
											console.error('ERROR: request failed: ' + msg + ' (ecid: ' + response.ecid + ')');
											console.log(data);
											return resolve({
												err: 'err'
											});
										} else if (data.completed && data.progress === 'succeeded') {
											clearInterval(inter);
											if (data.completedPercentage) {
												needNewLine = true;
												process.stdout.write(' - request in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
											}
											if (needNewLine) {
												process.stdout.write(os.EOL);
											}
											console.log(' - request finished [' + serverUtils.timeUsed(startTime, new Date()) + ']');
											// console.log(data);
											return resolve(data);
										} else {
											process.stdout.write(' - request in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
											readline.cursorTo(process.stdout, 0);
											needNewLine = true;
										}
									});
							}, 5000);
						} else {
							if (responseStatus) {
								// If there is an error and body is empty, then resolve with response statusCode and statusMessage.
								if (response.statusCode >= 400 && !data) {
									data = {
										statusCode: response.statusCode,
										statusMessage: response.statusMessage
									};
								}
							}
							return resolve(data);
						}

					} else {
						if (showDetail) {
							console.log('Status: ' + response.statusCode + ' ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
							if (response.location || response.url) {
								console.log('Result URL: ' + (response.location || response.url));
							}
						}
						if (responseStatus && response.statusCode >= 400) {
							// If there is an error and body is empty, then resolve with response statusCode and statusMessage.
							if (data) {
								if (!data.hasOwnProperty('statusCode')) {
									data.statusCode = response.statusCode;
								}
								if (!data.hasOwnProperty('statusMessage')) {
									data.statusMessage = response.statusMessage;
								}
							} else {
								data = {
									statusCode: response.statusCode,
									statusMessage: response.statusMessage
								};
							}

						}
						return resolve(data);
					}
				});
			});
	});
};


/**
 * Makes an HTTP PUT request to a REST API endpoint on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server The server object
 * @param {string} args.endpoint The REST endpoint
 * @param {string} args.body The JSON object for the request payload
 * @returns
 */
module.exports.executePut = function (args) {
	return new Promise(function (resolve, reject) {
		var showDetail = args.noMsg ? false : true;
		var endpoint = args.endpoint;
		var responseStatus = args.responseStatus ? true : false;
		var isCAAS = endpoint.indexOf('/content/management/api/') === 0;
		var isSystem = endpoint.indexOf('/system/api/') === 0;

		var server = args.server;
		var url = server.url + args.endpoint;
		var body = args.body;

		var caasTokenPromises = [];
		if (isCAAS) {
			caasTokenPromises.push(serverUtils.getCaasCSRFToken(server));
		} else if (isSystem) {
			caasTokenPromises.push(serverUtils.getSystemCSRFToken(server));
		}

		Promise.all(caasTokenPromises)
			.then(function (results) {
				var csrfToken = results && results[0] && results[0].token;

				var postData = {
					method: 'PUT',
					url: url,
					headers: {
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};
				if (csrfToken) {
					postData.headers['X-CSRF-TOKEN'] = csrfToken;
				}

				if (body && Object.keys(body).length > 0) {
					postData.headers['Content-Type'] = 'application/json';
					postData.body = JSON.stringify(body);
				}
				serverUtils.showRequestOptions(postData);

				if (showDetail) {
					console.info(' - executing endpoint: PUT ' + endpoint);
				}
				var request = require('./requestUtils.js').request;
				request.put(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to put ' + endpoint + ' (ecid: ' + response.ecid + ')');
						console.error(error);
						return resolve({
							err: 'err'
						});
					}
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {
						// in case result is not json
					}

					if (showDetail) {
						console.log('Status: ' + response.statusCode + ' ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
						if (response.location || response.url) {
							console.log('Result URL: ' + (response.location || response.url));
						}
					}
					// console.log(response);
					if (responseStatus && response.statusCode >= 400) {
						// If there is an error and body is empty, then resolve with response statusCode and statusMessage.
						if (data) {
							if (!data.hasOwnProperty('statusCode')) {
								data.statusCode = response.statusCode;
							}
							if (!data.hasOwnProperty('statusMessage')) {
								data.statusMessage = response.statusMessage;
							}
						} else {
							data = {
								statusCode: response.statusCode,
								statusMessage: response.statusMessage
							};
						}

					}
					return resolve(data);

				});
			});
	});
};

/**
 * Makes an HTTP PATCH request to a REST API endpoint on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server The server object
 * @param {string} args.endpoint The REST endpoint
 * @param {string} args.body The JSON object for the request payload
 * @returns
 */
module.exports.executePatch = function (args) {
	return new Promise(function (resolve, reject) {
		var showDetail = args.noMsg ? false : true;
		var responseStatus = args.responseStatus ? true : false;
		var endpoint = args.endpoint;
		var isCAAS = endpoint.indexOf('/content/management/api/') === 0;

		var server = args.server;
		var url = server.url + args.endpoint;
		var body = args.body;

		var caasTokenPromises = [];
		if (isCAAS) {
			caasTokenPromises.push(serverUtils.getCaasCSRFToken(server));
		}

		Promise.all(caasTokenPromises)
			.then(function (results) {
				var csrfToken = results && results[0] && results[0].token;

				var postData = {
					method: 'PATCH',
					url: url,
					headers: {
						'X-REQUESTED-WITH': 'XMLHttpRequest',
						Authorization: serverUtils.getRequestAuthorization(server)
					}
				};
				if (csrfToken) {
					postData.headers['X-CSRF-TOKEN'] = csrfToken;
				}

				if (body && Object.keys(body).length > 0) {
					postData.headers['Content-Type'] = 'application/json';
					postData.body = JSON.stringify(body);
				}
				serverUtils.showRequestOptions(postData);

				if (showDetail) {
					console.info(' - executing endpoint: PATCH ' + endpoint);
				}
				var request = require('./requestUtils.js').request;
				request.patch(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to patch ' + endpoint + ' (ecid: ' + response.ecid + ')');
						console.error(error);
						return resolve({
							err: 'err'
						});
					}
					var data;

					try {
						data = JSON.parse(body);
					} catch (e) {
						// in case result is not json
					}

					if (showDetail) {
						console.log('Status: ' + response.statusCode + ' ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
						if (response.location || response.url) {
							console.log('Result URL: ' + (response.location || response.url));
						}
					}

					if (responseStatus) {
						return resolve({
							data: data,
							statusCode: response.statusCode,
							statusMessage: response.statusMessage
						});
					} else {
						return resolve(data);
					}
				});
			});
	});
};

/**
 * Makes an HTTP DELETE request to a REST API endpoint on OCM server
 * @param {object} args JavaScript object containing parameters.
 * @param {string} args.server The server object
 * @param {string} args.endpoint The REST endpoint
 * @param {string} args.headers The additional headers
 * @returns
 */
module.exports.executeDelete = function (args) {
	return new Promise(function (resolve, reject) {
		var endpoint = args.endpoint;
		var isCAAS = endpoint.indexOf('/content/management/api/') === 0;
		var isSites = endpoint.indexOf('/sites/management/api/') === 0;
		var isSystem = endpoint.indexOf('/system/api/') === 0;

		var server = args.server;
		var url = server.url + args.endpoint;

		var caasTokenPromises = [];
		if (isCAAS) {
			caasTokenPromises.push(serverUtils.getCaasCSRFToken(server));
		} else if (isSystem) {
			caasTokenPromises.push(serverUtils.getSystemCSRFToken(server));
		}

		Promise.all(caasTokenPromises)
			.then(function (results) {
				var csrfToken = results && results[0] && results[0].token;
				var hdrs = Object.assign(args.headers || {}, {
					'Content-Type': 'application/json',
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				});
				var options = {
					method: 'DELETE',
					url: url,
					headers: hdrs
				};

				if (csrfToken) {
					options.headers['X-CSRF-TOKEN'] = csrfToken;
				}
				serverUtils.showRequestOptions(options);

				console.info(' - executing endpoint: DELETE ' + endpoint);
				var request = require('./requestUtils.js').request;
				request.delete(options, function (error, response, body) {

					if (error) {
						console.error('ERROR: Failed to delete ' + endpoint + ' (ecid: ' + response.ecid + ')');
						console.error(error);
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

					if (response && response.statusCode <= 300) {
						console.log(' - endpoint executed');
						return resolve({});
					} else {
						console.log('Status: ' + response.statusCode + ' ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
						if (data && !Buffer.isBuffer(data)) {
							console.log(JSON.stringify(data, null, 4));
						}
						return resolve({
							err: 'err',
							data: data
						});
					}

				});
			});
	});
};

/////////////////////////////////////////////////////////
//  Others
/////////////////////////////////////////////////////////


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

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to query scheduled jobs for: ' + repositoryId);
				console.error(error);
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
				console.error('ERROR: failed to query scheduled jobs for: ' + repositoryId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to cancel scheduled job: ' + id);
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
						var msg = response.statusMessage || response.statusCode;
						if (data && (data.detail || data.title)) {
							msg = (data.detail || data.title);
						}
						console.error('ERROR: Failed to cancel scheduled job: ' + id + ' : ' + msg);
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
 * Get translation jobs
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.jobType The translation job type
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTranslationJobs = function (args) {
	var fields;
	var q = args.q;
	var orderBy = args.orderBy || 'name:asc';
	var jobStatus = args.jobStatus;
	return new Promise(function (resolve, reject) {
		let url = '/content/management/api/v1.1/translationJobs?jobType=' + args.jobType;
		if (jobStatus) {
			url += '&jobStatus=' + jobStatus;
		}
		if (args.repositoryId) {
			url = url + '&repositoryId=' + args.repositoryId;
		}
		_getAllResources(args.server, url, 'translationJobs', fields, q, orderBy)
			.then(function (result) {
				return resolve({
					jobType: args.jobType,
					jobs: result
				});
			});
	});
};

var _createAssetTranslation = function (server, name, repositoryId, collectionId, contentIds, sourceLanguage, targetLanguages, connectorId, skipDependencies) {
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
						connectorId: connectorId,
						skipDependencies: skipDependencies
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

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: failed to create translation job ' + name);
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
					// console.log(data);
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						var statusUrl = response.location;
						if (statusUrl) {
							console.log(' - create translation job submitted, name: ' + name + ' status: ' + serverUtils.replaceAll(statusUrl, server.url, ''));
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
										console.error('ERROR: create translation failed: ' + msg);

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
							console.error('ERROR: no job Id is found');
							resolve({
								err: 'err'
							});
						}
					} else {
						var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
						console.error('ERROR: failed to create tanslation job ' + name + ' - ' + msg);
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
		args.sourceLanguage, args.targetLanguages, args.connectorId, args.skipDependencies);
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

				serverUtils.showRequestOptions(options);

				var request = require('./requestUtils.js').request;
				request.post(options, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to create category ' + name);
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
						console.error('ERROR: Failed to create category ' + name + ' : ' + (response.statusMessage || response.statusCode));
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

/**
 * Get all workflows on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getWorkflows = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/workflows', 'workflows', args.fields);
};

/**
 * Get all workflows on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getWorkflowPermissions = function (args) {
	return new Promise(function (resolve, reject) {
		_getAllResources(args.server, '/content/management/api/v1.1/workflows/' + args.id + '/permissions', 'workflow permissions', args.fields)
			.then(function (result) {
				return resolve({
					workflowId: args.id,
					permissions: result
				});
			});
	});
};

/**
 * Get workflows with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the workflow to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getWorkflowsWithName = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}
		var workflowName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/workflows';
		url = url + '?q=(name mt "' + encodeURIComponent(workflowName) + '")';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get workflow ' + workflowName);
				console.error(error);
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
				var workflows = data && data.items || [];
				return resolve(workflows);
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get workflow ' + workflowName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Get all ranking policies on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRankingPolicies = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/search/rankingPolicies', 'rankingPolicies', args.fields);
};

/**
 * Get all ranking policy descriptors on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getRankingPolicyDescriptors = function (args) {
	return _getAllResources(args.server, '/content/management/api/v1.1/search/rankingPolicyDescriptors', 'rankingPolicyDescriptors', args.fields);
};

/**
 * Get all scheduled publish jobs of a repository
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getScheduledJobs = function (args) {
	var endpoint = '/content/management/api/v1.1/publish/scheduledJobs?repositoryId=' + args.repositoryId;
	return _getAllResources(args.server, endpoint, 'scheduledJobs', args.fields);
};

/**
 * Get all publishing jobs of a repository
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getPublishingJobs = function (args) {
	var endpoint = '/content/management/api/v1.1/jobs/publishjobs?repositoryId=' + args.repositoryId;
	var fields;
	var q;
	var orderBy = 'jobCompletedDate:asc';
	return _getAllResources(args.server, endpoint, 'publishingJobs', fields, q, orderBy);
};

/**
 * Get a publishing job
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getPublishingJob = function (args) {
	var endpoint = '/content/management/api/v1.1/jobs/publishjobs/' + args.id;
	return _getResource(args.server, endpoint, 'publishingJob');
};



/**
 * Get a translation connector with name on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name The name of the translation connector to query.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getTranslationConnector = function (args) {
	return new Promise(function (resolve, reject) {
		if (!args.name) {
			return resolve({});
		}
		var connectorName = args.name;
		var server = args.server;

		var url = server.url + '/content/management/api/v1.1/connectors';
		url = url + '?q=(name mt "' + encodeURIComponent(connectorName) + '") AND (connectorType eq "translation")';
		url = url + '&links=none';
		if (args.fields) {
			url = url + '&fields=' + args.fields;
		}

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
				console.error('ERROR: failed to get translation connector ' + connectorName);
				console.error(error);
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
				var connectors = data && data.items || [];
				var connector;
				for (var i = 0; i < connectors.length; i++) {
					if (connectors[i].connectorName && connectors[i].connectorName === connectorName) {
						connector = connectors[i];
						break;
					}
				}
				if (connector) {
					resolve(connector);
				} else {
					return resolve({});
				}
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to get translation connector ' + connectorName + '  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
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

		// serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: get ' + action + ' translation status');
				console.error(error);
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
				console.error('ERROR: failed to get ' + action + ' translation status' + '  : ' + msg);
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

		serverUtils.showRequestOptions(postData);

		var request = require('./requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to ' + action + ' translation job ' + job.name);
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
								console.error('ERROR: ' + action + ' translation failed: ' + msg);

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
					console.error('ERROR: no job Id is found');
					resolve({
						err: 'err'
					});
				}
			} else {
				var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
				console.error('ERROR: failed to ' + action + ' tanslation job ' + job.name + ' - ' + msg);
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
								console.error('ERROR: failed to get translation file');
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

var _createConversation = function (server, name, isDiscoverable) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations';
					var payload = {
						name: name,
						discoverable: isDiscoverable
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
					addCachedCookiesForRequest(server, postData);

					serverUtils.showRequestOptions(postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: create conversation ' + name);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to create conversation ' + name + ' : ' + msg);
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
 * Create a conversation on the server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.name Name of the conversation
 * @param {boolean} args.isDiscoverable true if conversation is discoverable
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createConversation = function (args) {
	return _createConversation(args.server, args.name, args.isDiscoverable);
};

var _createAssetConversation = function (server, props = []) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/fc/RemoteJSONBatch?apmOps=Conversation.createConversationFromInfo';
		props = props.map(obj => ({
			...obj,
			'_class': 'XConversationCreateInfo'
		}));

		var body = [{
			'ModuleName': 'XConversationModule$Server',
			'MethodName': 'createConversationFromInfo',
			'Arguments': props
		}];

		// console.log("_setUserSocialPreferences body = ", body);
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							'Content-Type': 'application/json',
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID,
							'X-Waggle-APIVersion': '12100' // It is a range between 6100 - 12140
						},
						body: JSON.stringify(body),
						json: true
					};

					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: failed to create asset conversation ' + props);
							console.error(error);
							resolve({
								err: 'err'
							});
						}

						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							var data;
							var conversationData;
							try {
								data = JSON.parse(body);
								conversationData = (data && data.length > 0) ? data[0].returnValue : undefined;
								console.log(`INFO: _createAssetConversation(${JSON.stringify(props)}) returned`, JSON.stringify(data));
							} catch (e) {
								console.error(e.stack);
							}
							resolve(conversationData);
						} else {
							console.error('ERROR: failed to create asset conversation ' + props + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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
 * Create a conversation on the server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {object} args.props array of PropertyName, PropertyValue objects.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createAssetConversation = function (args) {
	return _createAssetConversation(args.server, args.props);
};

var _getConversation = function (server, conversationId) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId;
					var postData = {
						method: 'GET',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						json: true
					};
					addCachedCookiesForRequest(server, postData);
					serverUtils.showRequestOptions(postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: get conversation ' + conversationId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to get conversation ' + conversationId + ' : ' + msg);
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
 * Get a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id ID of the conversation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getConversation = function (args) {
	return _getConversation(args.server, args.id);
};

var _deleteConversation = function (server, conversationId) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId;
					var payload = {
						updater: {
							State: "CLOSED_DROPPED"
						}
					};
					var postData = {
						method: 'PATCH',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify(payload),
						json: true
					};
					addCachedCookiesForRequest(server, postData);
					serverUtils.showRequestOptions(postData);
					request.patch(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: delete conversation ' + conversationId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to delete conversation ' + conversationId + ' : ' + msg);
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
 * Delete a conversation by setting its state to CLOSED_DROPPED.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id ID of the conversation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteConversation = function (args) {
	return _deleteConversation(args.server, args.id);
};

var _removeMemberFromConversation = function (server, conversationId, memberId) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId + '/members/' + memberId;

					var postData = {
						method: 'DELETE',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						}
					};
					addCachedCookiesForRequest(server, postData);
					request.delete(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: remove conversation member ' + memberId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve({});
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to remove conversation member ' + memberId + ' : ' + msg);
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
 * Remove a member from a conversation.
 * If removing self as the last member of the conversation, that will discard the conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.conversationId the conversation id
 * @param {string} args.memberId the member id to remove from conversation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.removeMemberFromConversation = function (args) {
	return _removeMemberFromConversation(args.server, args.conversationId, args.memberId);
};

/**
 * Adds a member to a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.conversationId the conversation id
 * @param {string} args.memberId the member id to add to conversation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.addMemberToConversation = function (args) {
	return _addMemberToConversation(args.server, args.conversationId, args.memberId);
};

var _addMemberToConversation = function (server, conversationId, memberId) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId + '/members';
					var body = {
						'member': memberId
					};
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify(body),
						json: true
					};
					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: add conversation member ' + memberId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve({});
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to add conversation member ' + memberId + ' : ' + msg);
							return resolve({
								err: 'err'
							});
						}
					});
				}
			});
	});
};

var _getConversationMembers = function (server, id) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + id + '/members';

					var postData = {
						method: 'GET',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						}
					};
					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: get conversation members ' + id);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to get conversation members ' + id + ' : ' + msg);
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
 * Fetch conversation members
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.id conversation id
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getConversationMembers = function (args) {
	return _getConversationMembers(args.server, args.id);
};


var _postMessageToConversation = function (server, conversationId, text) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId + '/messages/';

					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify({
							message: text
						})
					};
					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: post conversation message ' + conversationId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to post conversation message ' + conversationId + ' : ' + msg);
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
 * Post a message to a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.conversationId the conversation id
 * @param {string} args.text the text to post to conversation
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.postMessageToConversation = function (args) {
	return _postMessageToConversation(args.server, args.conversationId, args.text);
};

var _postMessageToAssetConversation = function (server, props = []) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/osn/fc/RemoteJSONBatch?apmOps=Chat.createChatFromInfo';
		props = props.map(obj => ({
			...obj
		}));

		var body = [{
			'ModuleName': 'XChatModule$Server',
			'MethodName': 'createChatFromInfo',
			'Arguments': props
		}];

		// console.log("_setUserSocialPreferences body = ", body);
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							'Content-Type': 'application/json',
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID,
							'X-Waggle-APIVersion': '12100' // It is a range between 6100 - 12140
						},
						body: JSON.stringify(body),
						json: true
					};

					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: failed to add post to asset conversation ' + props);
							console.error(error);
							resolve({
								err: 'err'
							});
						}

						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							var data;
							var chatId;
							try {
								data = JSON.parse(body);
								chatId = (data && data.length > 0) ? data[0].returnValue : undefined;
								console.log(`INFO: _postMessageToAssetConversation(${JSON.stringify(props)}) returned`, JSON.stringify(data));
							} catch (e) {
								console.error(e.stack);
							}
							resolve(chatId);
						} else {
							console.error('ERROR: failed to add post to asset conversation ' + props + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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
 * Post a message to a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.props array of PropertyName, PropertyValue objects.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.postMessageToAssetConversation = function (args) {
	return _postMessageToAssetConversation(args.server, args.props);
};

var _postReplyToMessage = function (server, messageId, text) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/messages/' + messageId;

					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify({
							message: text
						})
					};
					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: post message reply ' + messageId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to post message reply ' + messageId + ' : ' + msg);
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
 * Post a reply to a message.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.messageId the message id
 * @param {string} args.text the text to post in the reply to the message
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.postReplyToMessage = function (args) {
	return _postReplyToMessage(args.server, args.messageId, args.text);
};

var _assignFlagOnMessage = function (server, messageId, assigneeId, flagType) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/messages/' + messageId + '/followups';

					var postData = {
						method: 'POST',
						url: url,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify({
							assignee: assigneeId,
							followupType: flagType
						})
					};
					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: assign flag to message ' + messageId);
							console.error(error);
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

						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode === 200) {
							resolve(data);
						} else {
							var msg = data && data.title ? data.title : (response.statusMessage || response.statusCode);
							console.error('ERROR: failed to assign flag to message ' + messageId + ' : ' + msg);
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
 * Assign a flag to someone on a message in a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.messageId the message id
 * @param {string} args.assigneeId the id of the user to assign the flag to
 * @param {string} args.flagType the type of flag to assign (one of "FOR_YOUR_INFORMATION", "PLEASE_REPLY", "PLEASE_REPLY_URGENT")
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.assignFlagOnMessage = function (args) {
	return _assignFlagOnMessage(args.server, args.messageId, args.assigneeId, args.flagType);
};

var _createFolderConversation = function (server, folderId, name) {
	return new Promise(function (resolve, reject) {
		var payload = {
			conversationName: name
		}
		var options = {
			method: 'POST',
			url: server.url + '/documents/api/1.2/folders/' + folderId + '/conversation',
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			json: true,
			body: JSON.stringify(payload)
		};
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create conversation for folder ' + folderId);
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					// in case result is not json
				}
				resolve(data);
			} else {
				console.error('ERROR: failed to create conversation for folder ' + folderId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}

		});
	});
};
/**
 * Create a conversation associated with a folder.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.folderId the folder id to create and associate a conversation with.
 * @param {string} args.name the conversation name.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createFolderConversation = function (args) {
	return _createFolderConversation(args.server, args.folderId, args.name);
};
var _createHybridLinkForConversation = function (server, conversationId, siteId) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var url = server.url + '/osn/social/api/v1/conversations/' + conversationId + '/hybridlinks';
					var payload = {
						'applicationInstanceID': siteId
					};
					var options = {
						method: 'POST',
						url: url,
						headers: {
							'Authorization': serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID
						},
						body: JSON.stringify(payload)
					};
					addCachedCookiesForRequest(server, options);
					request.post(options, function (error, response, body) {
						if (error) {
							console.error('ERROR: failed to create Hybrid Link for the conversation ' + conversationId);
							console.error(error);
							resolve({
								err: 'err'
							});
						}
						cacheCookiesFromResponse(server, response);
						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							var data;
							try {
								data = JSON.parse(body);
							} catch (e) {
								data = body;
							}
							resolve(data.hybridLinkID);
						} else {
							console.error('ERROR: failed to create Hybrid Link for conversation ' + conversationId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
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
 * Create a Hybrid Link for a conversation.
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.conversationId the conversation id for which hybrid link needs to be generated.
 * @param {string} args.siteId the site id with which hybrid link for a conversation gets associated.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.createHybridLinkForConversation = function (args) {
	return _createHybridLinkForConversation(args.server, args.conversationId, args.siteId);
};

var _getRankingPolicyEndpoint = function (server) {
	return `${server.url}/content/management/api/v1.1/search/rankingPolicies`;
};
module.exports.getRankingPolicyEndpoint = function (server) {
	return _getRankingPolicyEndpoint(server);
};

var _sendRankingPolicyRequest = function (server, method, url, payload, requestUtils) {
	return new Promise(function (resolve /*, reject*/) {
		var postData = {
			method: method,
			url,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			json: true
		};
		addCachedCookiesForRequest(server, postData);

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
			cacheCookiesFromResponse(server, response);
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
/**
 * Send different Ranking policy requests
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.method method name
 * @param {object} args.payload payload of Ranking policy for different actions like create, promote and publish
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.sendRankingPolicyRequest = function (args) {
	return _sendRankingPolicyRequest(args.server, args.method, args.url, args.payload, args.requestUtils);
}

var _getMe = function (server) {
	return new Promise(function (resolve, reject) {
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID || !result.socialUser) {
					return resolve({
						err: 'err'
					});
				} else {
					return resolve(result.socialUser);
				}
			});
	});
}

/**
 * Get social user information about the user associated with the given server object.
 * @param {object} args Javascript object containing parameters.
 * @param {object} args.server the server object
 * @returns {Promise.<object>} The social user data object.
 */
module.exports.getMe = function (args) {
	return _getMe(args.server);
}

var _setUserSocialPreferences = function (server, userId, props = []) {
	return new Promise(function (resolve, reject) {
		var body,
			url = server.url + '/osn/fc/RemoteJSONBatch?apmOps=Properties.setProperties';

		var usePropertiesAPI = props.some((prop) => !!prop['PropertyName']);
		if (usePropertiesAPI) {
			props = props.map(obj => ({
				...obj,
				'_class': 'XPropertyInfo'
			}));

			body = [{
				'ModuleName': 'XPropertiesModule$Server',
				'MethodName': 'setProperties',
				'Arguments': [userId, props]
			}];
		}
		else {
			// Use updateMyProfile API
			url = server.url + '/osn/fc/RemoteJSONBatch?apmOps=User.updateMyProfile';
			body = [{
				'ModuleName': 'XUserModule$Server',
				'MethodName': 'updateMyProfile',
				'Arguments': props
			}];
		}

		// console.log("_setUserSocialPreferences body = ", body);
		var request = require('./requestUtils.js').request;
		_createConnection(request, server)
			.then(function (result) {
				if (result.err || !result.apiRandomID) {
					return resolve({
						err: 'err'
					});
				} else {
					var postData = {
						method: 'POST',
						url: url,
						headers: {
							'Content-Type': 'application/json',
							Authorization: serverUtils.getRequestAuthorization(server),
							'X-Waggle-RandomID': result.apiRandomID,
							'X-Waggle-APIVersion': '12100' // It is a range between 6100 - 12140
						},
						body: JSON.stringify(body),
						json: true
					};

					addCachedCookiesForRequest(server, postData);
					request.post(postData, function (error, response, body) {
						if (error) {
							console.error('ERROR: failed to set user preferences ' + props);
							console.error(error);
							resolve({
								err: 'err'
							});
						}

						if (response && response.statusCode >= 200 && response.statusCode < 300) {
							var data;
							try {
								data = JSON.parse(body);
								console.log(`INFO: _setUserSocialPreferences(${JSON.stringify(props)}) returned`, JSON.stringify(data));
							} catch (e) {
								console.error(e.stack);
							}
							resolve(data);
						} else {
							console.error('ERROR: failed to set user preferences ' + props + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
							resolve({
								err: 'err'
							});
						}
					});
				}
			});
	});
}

/**
 * Set social user preferences. This is a non-RESTful call but needs _createConnection to work.
 * @param {object} args Javascript object containing parameters.
 * @param {object} args.server the server object
 * @param {object} args.userId the user's social ID
 * @param {object} args.props array of PropertyName, PropertyValue objects.
 * @returns {Promise.<object>} The social user data object.
 */
module.exports.setUserSocialPreferences = function (args) {
	return _setUserSocialPreferences(args.server, args.userId, args.props);
}

var _getAssetActivity = function (server, assetType, assetId) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/system/api/v1/auditlog/activities?q=objectType eq "' + assetType + '" and objectId eq "' + assetId + '"&limit=50&offset=0&expand=all';
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
				console.error('ERROR: failed to get activity for: ' + assetId);
				console.error(error);
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
				console.error('ERROR: failed to get activity for: ' + assetId + ' : ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Fetch asset activity
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {string} args.assetType asset type Digital Asset/Content Item
 * @param {string} args.assetId Id of asset
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getAssetActivity = function (args) {
	return _getAssetActivity(args.server, args.assetType, args.assetId);
};

/**
 * archive items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.operation The operation/action to perform - 'archive'
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */

module.exports.archiveItems = function (args) {
	var async = args.async ? args.async : 'false';
	return _archiveBulkOpItems(args.server, 'archive', args.itemIds, '', async);
};

/**
 * schedule archived items for restoration on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.operation The operation/action to perform - 'restore'
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */

module.exports.restoreArchivedItems = function (args) {
	var async = args.async ? args.async : 'false';
	return _archiveBulkOpItems(args.server, 'restore', args.itemIds, '', async);
};

/**
 * cancel restoration of archived items on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} args.server the server object
 * @param {array} args.operation The operation/action to perform - 'cancelRestore'
 * @param {array} args.itemIds The id of items
 * @returns {Promise.<object>} The data object returned by the server.
 */

module.exports.cancelRestoration = function (args) {
	var async = args.async ? args.async : 'false';
	return _archiveBulkOpItems(args.server, 'cancelRestore', args.itemIds, '', async);
};

var _archiveBulkOpItems = function (server, operation, itemIds, queryString, async) {
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

				var url = server.url + '/content/management/api/v1.1/';
				url += (operation === 'archive') ? 'bulkItemsOperations/' + operation : 'archive/items/.bulk/' + operation;

				var formData = {
					q: q,
				};

				var headers = {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-Requested-With': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				};

				if (async && async === 'true') {
					headers.Prefer = 'respond-async';
				}
				var postData = {
					method: 'POST',
					url: url,
					headers: headers,
					body: JSON.stringify(formData),
					json: true
				};

				serverUtils.showRequestOptions(postData);

				var request = require('./requestUtils.js').request;
				request.post(postData, function (error, response, body) {
					if (error) {
						console.error('ERROR: Failed to ' + operation + ' items ');
						console.error(error);
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
						console.log(' - submit request: ' + statusId + ' (ecid: ' + response.ecid + ')');
						statusId = statusId.substring(statusId.lastIndexOf('/') + 1);
						statusId = 'archive/' + statusId;
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
									var msg = data.message ? data.message : (data.error ? data.error : '');
									console.error('ERROR: Failed to ' + operation + ' items ' + msg);
									return resolve({
										err: 'err'
									});
								}
								if (data.completed) {
									clearInterval(inter);
									if (needNewLine) {
										process.stdout.write(os.EOL);
									}
									return resolve(data.result);
								} else {
									process.stdout.write(' - ' + operation + ' items in process [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									readline.cursorTo(process.stdout, 0);
									needNewLine = true;
								}
							});
						}, 6000);
					} else {
						var msg = data ? (data.detail || data.title) : response.statusMessage;
						console.error('ERROR: Failed to ' + operation + ' items - ' + msg);
						resolve({
							err: 'err'
						});
					}
				});
			}
		});
	});
};