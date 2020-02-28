/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	zip = require('gulp-zip');

var projectDir,
	serversSrcDir,
	taxonomiesSrcDir,
	taxonomiesBuildDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');
	taxonomiesSrcDir = path.join(srcfolder, 'taxonomies');

	var buildfolder = serverUtils.getBuildFolder(projectDir);
	taxonomiesBuildDir = path.join(buildfolder, 'taxonomies');

	return true;
};

module.exports.downloadTaxonomy = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var status = argv.status;

	var taxonomy;

	if (!fs.existsSync(taxonomiesSrcDir)) {
		fs.mkdirSync(taxonomiesSrcDir);
	}

	serverRest.getTaxonomies({
			server: server
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var taxonomies = result || [];
			for (var i = 0; i < taxonomies.length; i++) {
				if (taxonomies[i].name === name) {
					taxonomy = taxonomies[i];
					break;
				}
			}

			if (!taxonomy) {
				console.log('ERROR: taxonomy ' + name + ' does not exist');
				return Promise.reject();
			}

			console.log(' - validate taxonomy ' + name + ' (id: ' + taxonomy.id + ')');

			return serverRest.exportTaxonomy({
				server: server,
				id: taxonomy.id,
				name: name,
				status: status
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			console.log(' - taxonomy exported');

			var downloadLink = result.downloadLink;
			if (downloadLink) {
				var options = {
					url: downloadLink,
					auth: serverUtils.getRequestAuth(server),
					headers: {
						'Content-Type': 'application/json'
					},
					encoding: null
				};
				//
				// Download the export zip
				var request = serverUtils.getRequest();
				request.get(options, function (err, response, body) {
					if (err) {
						console.log('ERROR: Failed to download');
						console.log(err);
						return Promise.reject();
					}
					if (response && response.statusCode === 200) {
						var taxPath = path.join(taxonomiesSrcDir, name);
						if (!fs.existsSync(taxPath)) {
							fs.mkdirSync(taxPath);
						}
						var fileName = downloadLink.substring(downloadLink.lastIndexOf('/') + 1);
						var filePath = path.join(taxPath, fileName);
						console.log(' - download export file');
						fs.writeFileSync(filePath, body);
						console.log(' - save export to ' + filePath);

						done(true);
					} else {
						console.log('ERROR: Failed to download, status=' + response.statusCode);
						return Promise.reject();
					}
				});
			} else {
				console.log('ERROR: no download link');
				return Promise.reject();
			}

		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			done();
		});
};

module.exports.uploadTaxonomy = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var taxPath = path.join(taxonomiesSrcDir, name);
	if (!fs.existsSync(taxPath)) {
		console.log('ERROR: taxonomy ' + name + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(taxPath).isDirectory()) {
		console.log('ERROR: ' + name + ' is not a valid taxonomy');
		done();
		return;
	}
	var files = fs.readdirSync(taxPath);
	if (!files || files.length === 0) {
		console.log('ERROR: no JSON file found for ' + name);
		done();
		return;
	}
	var jsonFile;
	files.forEach(function (fileName) {
		if (serverUtils.endsWith(fileName, '.json')) {
			jsonFile = fileName;
		}
	});
	if (!jsonFile) {
		console.log('ERROR: no JSON file found for ' + name);
		done();
		return;
	}
	var jsonPath = path.join(taxonomiesSrcDir, name, jsonFile);
	var jsonData;
	var taxonomyId, taxonomyName;
	try {
		var str = fs.readFileSync(jsonPath);
		jsonData = JSON.parse(str);
		taxonomyId = jsonData && jsonData.id;
		taxonomyName = jsonData && jsonData.name;
	} catch (e) {}

	if (!taxonomyId || !taxonomyName) {
		console.log('ERROR: invalid taxonomy JSON file for ' + name);
		done();
		return;
	}

	var fileId;
	var taxonomy;

	serverRest.getTaxonomies({
			server: server
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var taxonomies = result || [];
			for (var i = 0; i < taxonomies.length; i++) {
				if (taxonomies[i].id === taxonomyId) {
					taxonomy = taxonomies[i];
					break;
				}
			}
			if (taxonomy && taxonomy.id) {
				console.log(' - taxonomy ' + taxonomyName + ' (Id ' + taxonomyId + ' exists');
				// console.log(taxonomy);
				var availableStates = taxonomy.availableStates || [];
				var foundDraft = false;
				availableStates.forEach(function (state) {
					if (state.status === 'draft') {
						foundDraft = true;
					}
				});
				if (foundDraft) {
					console.log('ERROR: taxonomy ' + name + ' already has a draft version, promote it first');
					return Promise.reject();
				}
			}

			return serverRest.createFile({
				server: server,
				parentID: 'self',
				filename: jsonFile,
				contents: fs.createReadStream(jsonPath)
			});
		})
		.then(function (result) {
			if (!result || result.err || !result.id) {
				return Promise.reject();
			}
			console.log(' - upload taxonomy file ' + jsonPath);
			fileId = result.id;

			return serverRest.importTaxonomy({
				server: server,
				fileId: fileId,
				name: taxonomyName,
				isNew: !taxonomy
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			console.log(' - taxonomy ' + name + ' imported');

			return serverRest.deleteFile({
				server: server,
				fFileGUID: fileId
			});
		})
		.then(function (result) {
			done(true);
		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			done();
		});

};


module.exports.controlTaxonomy = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var action = argv.action;
	var name = argv.taxonomy;
	var isPublishable = typeof argv.publishable === 'string' && argv.publishable.toLowerCase() === 'true';
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var channelRequired = action === 'publish' || action === 'unpublish';

	var taxonomy;
	var channels = [];
	var channels2 = [];
	var publishedChannelNames = [];

	serverRest.getTaxonomies({
			server: server
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var taxonomies = result || [];
			for (var i = 0; i < taxonomies.length; i++) {
				if (taxonomies[i].name === name) {
					taxonomy = taxonomies[i];
					break;
				}
			}

			if (!taxonomy) {
				console.log('ERROR: taxonomy ' + name + ' does not exist');
				return Promise.reject();
			}

			console.log(' - validate taxonomy ' + name + ' (id: ' + taxonomy.id + ')');
			// console.log(taxonomy);

			var availableStates = taxonomy.availableStates || [];

			var foundDraft = false;
			var foundPromoted = false;
			availableStates.forEach(function (state) {
				if (state.status === 'draft') {
					foundDraft = true;
				}
				if (state.status === 'promoted') {
					foundPromoted = true;
				}
			});
			if (action === 'promote') {
				if (!foundDraft) {
					console.log('ERROR: taxonomy ' + name + ' does not have draft version');
					return Promise.reject();
				}
			} else if (action === 'publish') {
				if (!foundPromoted) {
					console.log('ERROR: taxonomy ' + name + ' does not have promoted version');
					return Promise.reject();
				}
				if (!taxonomy.isPublishable) {
					console.log('ERROR: taxonomy ' + name + ' is not publishable');
					return Promise.reject();
				}
			} else if (action === 'unpublish') {
				if (!taxonomy.isPublishable) {
					console.log('ERROR: taxonomy ' + name + ' is not publishable');
					return Promise.reject();
				}
				if (!taxonomy.publishedChannels || taxonomy.publishedChannels.length === 0) {
					console.log('ERROR: taxonomy ' + name + ' is not currently published');
					return Promise.reject();
				}
			}

			var channelPromises = [];
			if (channelRequired) {
				channelPromises.push(serverRest.getChannels({
					server: server
				}));
			}

			return Promise.all(channelPromises);
		})
		.then(function (results) {
			if (channelRequired) {
				var allChannels = results.length > 0 ? results[0] : [];
				for (var i = 0; i < channelNames.length; i++) {
					var found = false;
					for (var j = 0; j < allChannels.length; j++) {
						if (channelNames[i].toLowerCase() === allChannels[j].name.toLowerCase()) {
							found = true;
							channels.push({
								id: allChannels[j].id,
								name: allChannels[j].name
							});
							break;
						}
					}
					if (!found) {
						console.log('ERROR: channel ' + channelNames[i] + ' does not exist');
					}
				}

				if (channels.length === 0) {
					// console.log('ERROR: no valid channel is defined');
					return Promise.reject();
				}

				var publishedChannels = taxonomy.publishedChannels || [];

				if (action === 'publish') {
					channels.forEach(function (channel) {
						var alreadyPublished = false;
						for (var i = 0; i < publishedChannels.length; i++) {
							if (channel.id === publishedChannels[i].id) {
								alreadyPublished = true;
								break;
							}
						}
						if (alreadyPublished) {
							console.log('ERROR: the taxonomy is already published to channel ' + channel.name +
								'. A new promoted version is required to publish it again');
						} else {
							channels2.push(channel);
							publishedChannelNames.push(channel.name);
						}
					});

					if (channels2.length === 0) {
						// console.log('ERROR: no channel to publish');
						return Promise.reject();
					}
				} else if (action === 'unpublish') {
					channels.forEach(function (channel) {
						var alreadyPublished = false;
						for (var i = 0; i < publishedChannels.length; i++) {
							if (channel.id === publishedChannels[i].id) {
								alreadyPublished = true;
								break;
							}
						}
						if (!alreadyPublished) {
							console.log('ERROR: the taxonomy has not been published to channel ' + channel.name);
						} else {
							channels2.push(channel);
							publishedChannelNames.push(channel.name);
						}
					});

					if (channels2.length === 0) {
						// console.log('ERROR: no channel to publish');
						return Promise.reject();
					}
				}

				console.log(' - verify channels');
			}

			return serverRest.controlTaxonomy({
				server: server,
				id: taxonomy.id,
				name: name,
				action: action,
				isPublishable: isPublishable,
				channels: channels2
			});

		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			if (action === 'publish') {
				console.log(' - taxonomy ' + name + ' published to channel ' + publishedChannelNames.join(', '));
			} else if (action === 'unpublish') {
				console.log(' - taxonomy ' + name + ' unpublished from channel ' + publishedChannelNames.join(', '));
			} else if (action === 'promote') {
				console.log(' - taxonomy ' + name + ' promoted');
			}

			done(true);
		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			done();
		});
};