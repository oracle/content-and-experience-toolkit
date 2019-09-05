/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */
var request = require('request'),
	Client = require('node-rest-client').Client,
	siteUtils = require('./serverUtils');

var _utils = {
	getAuth: function (server) {
		var auth = server.env !== 'dev_ec' ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		return {
			user: server.username,
			password: server.password
		};
	}
};

//
// Folder CRUD
//

// Create Folder on server
var _createFolder = function (server, parentID, foldername) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/folders/' + parentID,
			args = {
				headers: {
					"Content-Type": "application/json"
				},
				data: {
					'name': foldername,
					'description': ''
				}
			};

		client.post(url, args, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.log('Failed to create Folder: ' + foldername);
				// continue
				resolve();
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
		})
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/folders/' + fFolderGUID;

		client.delete(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.log('Failed to delete Folder: ' + fFileGUID);
				// continue
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
var _getChildItems = function (server, parentID, limit) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/folders/' + parentID + '/items';
		if (limit) {
			url = url + '?limit=' + limit;
		}

		var req = client.get(url, function (data, response) {
			// try to find the requested folder
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get folder child items: ' + (response.statusMessage || response.statusCode));
				return resolve();
			}
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve();
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
	return _getChildItems(args.server, args.parentID, args.limit);
};

// Find file by name with the parent folder
var _findFile = function (server, parentID, filename, showError, itemtype) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/folders/' + parentID + '/items';

		var req = client.get(url, function (data, response) {
			// try to find the requested folder
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
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
				var msg = data.title || data.errorMessage || '';
				console.log('ERROR: failed to find ' + (itemtype ? itemtype : ' File') + ': ' + filename + ' ' + msg);
			}
			return resolve({
				err: data.errorCode || 'err'
			});
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve({
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
			auth: {
				user: server.username,
				password: server.password
			},
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

		request(options, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(JSON.parse(response.body));
			} else {
				console.log('Failed to create file: ' + filename);
				// continue 
				resolve();
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';

		client.get(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				// continue 
				resolve();
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

var _downloadFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var auth = {
			user: server.username,
			password: server.password
		};
		url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/';
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

// Update file on server
var _updateFile = function (server, fFileGUID, contents) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data/',
			args = {
				data: contents
			};

		client.post(url, args, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.log('Failed to update file: ' + fFileGUID);
				// continue 
				resolve();
			}
		});
	});
};
/**
 * Update file from server by file GUID
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {string} args.fFileGUID The DOCS GUID for the file to update
 * @param {stream} args.contents The filestream to upload
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.updateFile = function (args) {
	return _updateFile(args.server, args.fFileGUID, args.contents);
};

// Delete file from server
var _deleteFile = function (server, fFileGUID) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/files/' + fFileGUID;

		client.delete(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				console.log('Failed to delete file: ' + fFileGUID);
				// continue 
				resolve();
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/versions';

		client.get(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data && data.items);
			} else {
				// continue 
				console.log('ERROR: file ' + fFileGUID + ' ' + response.statusMessage);
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/items/' + id;
		if (expand) {
			url = url + '?expand=' + expand;
		}
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get item: ' + (response.statusMessage || response.statusCode));
				resolve({
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
 * @param {string} args.expand The comma-separated list of field names or all to get child resources.
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.getItem = function (args) {
	return _getItem(args.server, args.id, args.expand);
};

// Create channel on server
var _createChannel = function (server, name, channelType, description, publishPolicy, localizationPolicy) {
	return new Promise(function (resolve, reject) {
		siteUtils.getCaasCSRFToken(server).then(function (result) {
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
					payload.localizationPolicy = localizationPolicy
				}

				var client = new Client({
						user: server.username,
						password: server.password
					}),
					url = server.url + '/content/management/api/v1.1/channels',
					args = {
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-TOKEN': csrfToken,
							'X-REQUESTED-WITH': 'XMLHttpRequest'
						},
						data: payload
					};

				client.post(url, args, function (data, response) {
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.log('Failed to create channel: ' + name + ' - ' + response.statusMessage);
						// continue
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
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var client = new Client({
						user: server.username,
						password: server.password
					}),
					url = server.url + '/content/management/api/v1.1/channels/' + id,
					args = {
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-TOKEN': csrfToken,
							'X-REQUESTED-WITH': 'XMLHttpRequest'
						}
					};

				client.delete(url, args, function (data, response) {
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.log('Failed to delete channel: ' + id + ' - ' + response.statusMessage);
						// continue
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

// Add channel to repository
var _addChannelToRepository = function (server, channelId, channelName, repository) {
	return new Promise(function (resolve, reject) {
		siteUtils.getCaasCSRFToken(server).then(function (result) {
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

				var auth = {
					user: server.username,
					password: server.password
				};
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
					if (response && response.statusCode === 200) {
						var data;
						try {
							data = JSON.parse(body);
						} catch (error) {};
						resolve({
							data
						});
					} else {
						console.log('Failed to add channel ' + channelName + ' to repository ' + repository.name + ' ' + response.statusMessage);
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/channels?limit=99999&fields=all';

		var req = client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				console.log('ERROR: failed to get channels: ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve({
				err: 'err'
			});
		})
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/channels/' + channelId;

		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get channel: ' + (response.statusMessage || response.statusCode));
				resolve({
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


// Get all items in a channel from server
var _getChannelItems = function (server, channelToken, fields) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/items?limit=9999&channelToken=' + channelToken;
		if (fields) {
			url = url + '&fields=' + fields;
		}

		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				console.log('ERROR: failed to get channel items: ' + (response.statusMessage || response.statusCode));
				resolve({
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
var _opChannelItems = function (server, operation, channelIds, itemIds, queryString) {
	return new Promise(function (resolve, reject) {
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {

				var csrfToken = result && result.token;

				var request = siteUtils.getRequest();

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

				var url = server.url + '/content/management/api/v1.1/bulkItemsOperations';

				var auth = {
					user: server.username,
					password: server.password
				};

				var operations = {};
				if (operation === 'deleteItems') {
					operations[operation] = {
						value: 'true'
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
					};

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
	return _opChannelItems(args.server, 'publish', [args.channelId], args.itemIds);
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
	return _opChannelItems(args.server, 'unpublish', [args.channelId], args.itemIds);
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
	return _opChannelItems(args.server, 'removeChannels', [args.channelId], args.itemIds);
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
	return _opChannelItems(args.server, 'addChannels', [args.channelId], args.itemIds);
};

/**
 * Delete items (translatable items with all tts variations) on server 
 * @param {object} args JavaScript object containing parameters. 
 * @param {object} args.server the server object
 * @param {array} args.itemIds The id of items 
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.deleteItems = function (args) {
	return _opChannelItems(args.server, 'deleteItems', [], args.itemIds);
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
	return _opChannelItems(args.server, 'validatePublish', [args.channelId], args.itemIds);
};

var _getItemOperationStatus = function (server, statusId) {
	return statusPromise = new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/bulkItemsOperations/' + statusId;

		client.get(url, function (data, response) {
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get channel operation status ' + (response.statusMessage || response.statusCode));
				resolve({
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

// Get localization policies from server
var _getLocalizationPolicies = function (server) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/localizationPolicies?limit=99999';

		var req = client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				console.log('ERROR: failed to get localization policies: ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve({
				err: 'err'
			});
		})
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/localizationPolicies/' + id;

		var req = client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get localization policy: ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve({
				err: 'err'
			});
		})
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
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var client = new Client({
						user: server.username,
						password: server.password
					}),
					url = server.url + '/content/management/api/v1.1/localizationPolicies',
					payload = {};

				payload.name = name;
				payload.description = description || '';
				payload.requiredValues = requiredLanguages;
				payload.defaultValue = defaultLanguage;
				payload.optionalValues = optionalLanguages || [];

				var args = {
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					data: payload
				};

				client.post(url, args, function (data, response) {
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.log('ERROR: failed to create localization policy: ' + name + ' - ' + (data && data.detail ? data.detail : response.statusMessage));
						// continue
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

// Get repositories from server
var _getRepositories = function (server) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/repositories?limit=99999&fields=all';

		var req = client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data && data.items);
			} else {
				console.log('ERROR: failed to get repositories: ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
		req.on('error', function (err) {
			console.log('ERROR: ' + err);
			resolve({
				err: 'err'
			});
		})

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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/repositories/' + repoId;

		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get repository: ' + (response.statusMessage || response.statusCode));
				resolve({
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

// Get a repository from server
var _getResourcePermissions = function (server, id, type) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			resourceType = type === 'repository' ? 'repositories' : (type === 'type' ? 'types' : type),
			url = server.url + '/content/management/api/v1.1/' + resourceType + '/' + id + '/permissions';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve({
					resource: id,
					resourceType: type,
					permissions: data && data.items
				});
			} else {
				console.log('ERROR: failed to get ' + type + ' permissions for ' + id + ' : ' + (response.statusMessage || response.statusCode));
				resolve({
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
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var client = new Client({
						user: server.username,
						password: server.password
					}),
					url = server.url + '/content/management/api/v1.1/repositories',
					payload = {};
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

				var args = {
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-TOKEN': csrfToken,
						'X-REQUESTED-WITH': 'XMLHttpRequest'
					},
					data: payload
				};

				client.post(url, args, function (data, response) {
					if (response && response.statusCode >= 200 && response.statusCode < 300) {
						resolve(data);
					} else {
						console.log('ERROR: failed to create repository: ' + name + ' - ' + (data && data.detail ? data.detail : response.statusMessage));
						// continue
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
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var data = repository;
				data.contentTypes = contentTypes;
				data.channels = channels;

				var request = require('request');
				var url = server.url + '/content/management/api/v1.1/repositories/' + repository.id;

				var auth = {
					user: server.username,
					password: server.password
				};
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
					if (response && response.statusCode === 200) {
						var data;
						try {
							data = JSON.parse(body);
						} catch (error) {
							data = body;
						};
						resolve(data);
					} else {
						console.log('Failed to update repository repository ' + repository.name + ' - ' + response.statusMessage);
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

var _performPermissionOperation = function (server, operation, resourceId, resourceName, resourceType, role, users) {
	return new Promise(function (resolve, reject) {
		siteUtils.getCaasCSRFToken(server).then(function (result) {
			if (result.err) {
				resolve(result);
			} else {
				var csrfToken = result && result.token;

				var request = siteUtils.getRequest();

				var url = server.url + '/content/management/api/v1.1/permissionOperations';

				var auth = {
					user: server.username,
					password: server.password
				};

				var userArr = [];
				for (var i = 0; i < users.length; i++) {
					userArr.push({
						id: users[i].loginName
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
					};

					if (response && response.statusCode === 200) {
						var failedRoles = data && data.operations[operation] && data.operations[operation].failedRoles;
						if (failedRoles && failedRoles.length > 0) {
							console.log('ERROR: failed to ' + operation + ' resource: ');
							for (var i = 0; i < failedRoles.length; i++) {
								for (var j = 0; j < failedRoles[i].users.length; j++) {
									console.log(failedRoles[i].users[j].message);
								}
							}
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
 * @param {array} args.users The list of the users or groups
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.performPermissionOperation = function (args) {
	return _performPermissionOperation(args.server,
		args.operation, args.resourceId, args.resourceName, args.resourceType, args.role, args.users);
};

// Get typefrom server
var _getContentType = function (server, typeName) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/content/management/api/v1.1/types/' + typeName;

		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to get type ' + typeName + ' : ' + (response.statusMessage || response.statusCode));
				resolve({
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/users/items?info=' + userName;

		client.get(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve(data);
			} else {
				// continue 
				resolve();
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId + '/items';

		client.get(url, function (data, response) {
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
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
				// continue 
				resolve();
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
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId,
			args = {
				headers: {
					"Content-Type": "application/json"
				},
				data: {
					'userID': userId,
					'role': role
				}
			};

		if (createNew) {
			client.post(url, args, function (data, response) {
				resolve(data);
			});
		} else {
			url = url + '/role';
			client.put(url, args, function (data, response) {
				resolve(data);
			});
		}
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
	return _shareFolder(server.server, args.id, args.userId, args.role, args.create === undefined ? true : args.create);
};

var _unshareFolder = function (server, folderId, userId) {
	return new Promise(function (resolve, reject) {
		var client = new Client({
				user: server.username,
				password: server.password
			}),
			url = server.url + '/documents/api/1.2/shares/' + folderId + '/user',
			args = {
				headers: {
					"Content-Type": "application/json"
				},
				data: {
					'userID': userId
				}
			};

		client.delete(url, args, function (data, response) {
			resolve(data);
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