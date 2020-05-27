/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

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

	var name = argv.name;
	var id = argv.id;
	var status = argv.status;

	var taxonomy;

	if (!fs.existsSync(taxonomiesSrcDir)) {
		fs.mkdirSync(taxonomiesSrcDir);
	}

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getTaxonomies({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var taxonomies = result || [];
				var nameMatched = [];
				var idMatched;
				for (var i = 0; i < taxonomies.length; i++) {
					if (name && taxonomies[i].name === name) {
						nameMatched.push(taxonomies[i]);
					}
					if (id && taxonomies[i].id === id) {
						idMatched = taxonomies[i];
					}
				}

				if (!idMatched && nameMatched.length === 0) {
					console.log('ERROR: taxonomy does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.log('ERROR: there are ' + nameMatched.length + ' taxonomies with name ' + name + ':');
					var format = '   %-32s  %-12s  %-24s  %-12s %-s';
					console.log(sprintf(format, 'Id', 'Abbreviation', 'Creation Date', 'Publishable', 'Status'));
					nameMatched.forEach(function (tax) {
						var availableStates = tax.availableStates;
						var status = [];
						for (var i = 0; i < availableStates.length; i++) {
							status.push(availableStates[i].status + (availableStates[i].published ? '(published)' : ''));
						}
						console.log(sprintf(format, tax.id, tax.shortName, tax.createdDate && tax.createdDate.value,
							(tax.isPublishable ? '    √' : ''), status.join(', ')));
					});
					console.log('Please try again with the taxonomy Id');
					return Promise.reject();
				}

				taxonomy = idMatched || nameMatched[0];
				console.log(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ')');
				// console.log(taxonomy);
				var availableStates = taxonomy.availableStates || [];

				var foundPublished = false;
				var foundPromoted = false;
				availableStates.forEach(function (state) {
					if (state.status === 'promoted') {
						foundPromoted = true;
						if (state.published) {
							foundPublished = true;
						}
					} else if (state.status === 'published') {
						foundPublished = true;
					}
				});

				if (status === 'promoted' && !foundPromoted) {
					console.log('ERROR: taxonomy ' + taxonomy.name + ' does not have promoted version');
					return Promise.reject();
				}
				if (status === 'published' && !foundPublished) {
					console.log('ERROR: taxonomy ' + taxonomy.name + ' has not been published yet');
					return Promise.reject();
				}

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

	var name = argv.taxonomy;
	var isFile = typeof argv.file === 'string' && argv.file.toLowerCase() === 'true';

	var jsonPath, jsonFile;

	if (isFile) {
		jsonPath = name;
		if (!path.isAbsolute(jsonPath)) {
			jsonPath = path.join(projectDir, jsonPath);
		}
		jsonPath = path.resolve(jsonPath);

		if (!fs.existsSync(jsonPath)) {
			console.log('ERROR: file ' + jsonPath + ' does not exist');
			done();
			return;
		}

		jsonFile = jsonPath.substring(jsonPath.lastIndexOf(path.sep) + 1);
		if (!serverUtils.endsWith(jsonFile, '.json')) {
			console.log('ERROR: file ' + jsonPath + ' is not a JSON file');
			done();
			return;
		}

	} else {
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
		jsonPath = path.join(taxonomiesSrcDir, name, jsonFile);
	}
	var jsonData;
	var taxonomyId, taxonomyName, taxonomyAbbr, taxonomyDesc;
	try {
		var str = fs.readFileSync(jsonPath);
		jsonData = JSON.parse(str);
		taxonomyId = jsonData && jsonData.id;
		taxonomyName = jsonData && jsonData.name;
		taxonomyAbbr = jsonData && jsonData.shortName;
		taxonomyDesc = jsonData && jsonData.description;
	} catch (e) {}

	if (!taxonomyId || !taxonomyName) {
		console.log('ERROR: file ' + jsonPath + ' is not a valid taxonomy JSON file');
		done();
		return;
	}

	var createNew = typeof argv.createnew === 'string' && argv.createnew.toLowerCase() === 'true';
	var newName = argv.name;
	var newAbbr = argv.abbreviation;
	var newDesc = argv.description;

	var fileId;
	var taxonomy;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
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
					if (taxonomies[i].id === taxonomyId) {
						taxonomy = taxonomies[i];
						break;
					}
				}
				if (taxonomy && taxonomy.id) {
					console.log(' - taxonomy ' + taxonomyName + ' (Id: ' + taxonomyId + ') exists');
					// console.log(taxonomy);
					var availableStates = taxonomy.availableStates || [];
					var foundDraft = false;
					availableStates.forEach(function (state) {
						if (state.status === 'draft') {
							foundDraft = true;
						}
					});
					if (foundDraft && !createNew) {
						console.log('ERROR: taxonomy ' + name + ' already has a draft version, promote it first');
						return Promise.reject();
					}
					if (createNew) {
						console.log(' - will create new taxonomy ' + (newName || taxonomyName));
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
					isNew: createNew || !taxonomy,
					hasNewIds: createNew,
					taxonomy: createNew ? {
						name: newName || taxonomyName,
						shortName: newAbbr || taxonomyAbbr,
						description: newDesc || taxonomyDesc
					} : {}
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				if (createNew || !taxonomy) {
					console.log(' - taxonomy ' + (newName || taxonomyName) + ' created');
				} else {
					console.log(' - new draft created for ' + taxonomy.name);
				}

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

	var action = argv.action;
	var name = argv.name;
	var id = argv.id;
	var isPublishable = typeof argv.publishable === 'string' && argv.publishable.toLowerCase() === 'true';
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var channelRequired = action === 'publish' || action === 'unpublish';

	var taxonomy;
	var channels = [];
	var channels2 = [];
	var publishedChannelNames = [];

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getTaxonomies({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var taxonomies = result || [];
				var nameMatched = [];
				var idMatched;
				for (var i = 0; i < taxonomies.length; i++) {
					if (name && taxonomies[i].name === name) {
						nameMatched.push(taxonomies[i]);
					}
					if (id && taxonomies[i].id === id) {
						idMatched = taxonomies[i];
					}
				}

				if (!idMatched && nameMatched.length === 0) {
					console.log('ERROR: taxonomy does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.log('ERROR: there are ' + nameMatched.length + ' taxonomies with name ' + name + ':');
					var format = '   %-32s  %-12s  %-24s  %-12s %-s';
					console.log(sprintf(format, 'Id', 'Abbreviation', 'Creation Date', 'Publishable', 'Status'));
					nameMatched.forEach(function (tax) {
						// console.log(tax);
						var availableStates = tax.availableStates;
						var status = [];
						for (var i = 0; i < availableStates.length; i++) {
							status.push(availableStates[i].status + (availableStates[i].published ? '(published)' : ''));
						}
						console.log(sprintf(format, tax.id, tax.shortName, tax.createdDate && tax.createdDate.value,
							(tax.isPublishable ? '    √' : ''), status.join(', ')));
					});
					console.log('Please try again with the taxonomy Id');
					return Promise.reject();
				}

				taxonomy = idMatched || nameMatched[0];
				console.log(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ')');
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
						console.log('ERROR: taxonomy ' + taxonomy.name + ' does not have draft version');
						return Promise.reject();
					}
				} else if (action === 'publish') {
					if (!foundPromoted) {
						console.log('ERROR: taxonomy ' + taxonomy.name + ' does not have promoted version');
						return Promise.reject();
					}
					if (!taxonomy.isPublishable) {
						console.log('ERROR: taxonomy ' + taxonomy.name + ' is not publishable');
						return Promise.reject();
					}
				} else if (action === 'unpublish') {
					if (!taxonomy.isPublishable) {
						console.log('ERROR: taxonomy ' + taxonomy.name + ' is not publishable');
						return Promise.reject();
					}
					if (!taxonomy.publishedChannels || taxonomy.publishedChannels.length === 0) {
						console.log('ERROR: taxonomy ' + taxonomy.name + ' is not currently published');
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

							var promotedPublished = true;
							for (i = 0; i < taxonomy.availableStates.length; i++) {
								if (taxonomy.availableStates[i].status === 'promoted' && !taxonomy.availableStates[i].published) {
									promotedPublished = false;
									break;
								}
							}
							if (alreadyPublished && promotedPublished) {
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
					console.log(' - taxonomy ' + taxonomy.name + ' published to channel ' + publishedChannelNames.join(', '));
				} else if (action === 'unpublish') {
					console.log(' - taxonomy ' + taxonomy.name + ' unpublished from channel ' + publishedChannelNames.join(', '));
				} else if (action === 'promote') {
					console.log(' - taxonomy ' + taxonomy.name + ' promoted');
				}

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done();
			});
	});
};