/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	sprintf = require('sprintf-js').sprintf;

var console = require('../test/server/logger.js').console;

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


	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getTaxonomies({
			server: server,
			fields: 'availableStates'
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
					console.error('ERROR: taxonomy does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.error('ERROR: there are ' + nameMatched.length + ' taxonomies with name ' + name + ':');
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
				console.info(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ')');
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
					console.error('ERROR: taxonomy ' + taxonomy.name + ' does not have promoted version');
					return Promise.reject();
				}
				if (status === 'published' && !foundPublished) {
					console.error('ERROR: taxonomy ' + taxonomy.name + ' has not been published yet');
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

				console.info(' - taxonomy exported');

				var downloadLink = result.downloadLink;
				if (downloadLink) {
					var options = {
						url: downloadLink,
						headers: {
							Authorization: serverUtils.getRequestAuthorization(server)
						},
						encoding: null
					};

					serverUtils.showRequestOptions(options);

					//
					// Download the export zip
					var request = require('../test/server/requestUtils.js').request;
					request.get(options, function (err, response, body) {
						if (err) {
							console.error('ERROR: Failed to download');
							console.error(err);
							return Promise.reject();
						}
						if (response && response.statusCode === 200) {
							var taxPath = path.join(taxonomiesSrcDir, name);
							if (!fs.existsSync(taxPath)) {
								fs.mkdirSync(taxPath);
							}
							var fileName = downloadLink.substring(downloadLink.lastIndexOf('/') + 1);
							var filePath = path.join(taxPath, fileName);
							console.info(' - download export file');
							fs.writeFileSync(filePath, body);
							console.log(' - save export to ' + filePath);

							done(true);
						} else {
							console.error('ERROR: Failed to download, status=' + response.statusCode);
							return Promise.reject();
						}
					});
				} else {
					console.error('ERROR: no download link');
					return Promise.reject();
				}

			})
			.catch((error) => {
				if (error) {
					console.error(error);
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
			console.error('ERROR: file ' + jsonPath + ' does not exist');
			done();
			return;
		}

		jsonFile = jsonPath.substring(jsonPath.lastIndexOf(path.sep) + 1);
		if (!serverUtils.endsWith(jsonFile, '.json')) {
			console.error('ERROR: file ' + jsonPath + ' is not a JSON file');
			done();
			return;
		}

	} else {
		var taxPath = path.join(taxonomiesSrcDir, name);

		if (!fs.existsSync(taxPath)) {
			console.error('ERROR: taxonomy ' + name + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(taxPath).isDirectory()) {
			console.error('ERROR: ' + name + ' is not a valid taxonomy');
			done();
			return;
		}
		var files = fs.readdirSync(taxPath);
		if (!files || files.length === 0) {
			console.error('ERROR: no JSON file found for ' + name);
			done();
			return;
		}

		files.forEach(function (fileName) {
			if (serverUtils.endsWith(fileName, '.json')) {
				jsonFile = fileName;
			}
		});
		if (!jsonFile) {
			console.error('ERROR: no JSON file found for ' + name);
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
	} catch (e) {
		// in case file is not valid json
	}

	if (!taxonomyId || !taxonomyName) {
		console.error('ERROR: file ' + jsonPath + ' is not a valid taxonomy JSON file');
		done();
		return;
	}

	var createNew = typeof argv.createnew === 'string' && argv.createnew.toLowerCase() === 'true';
	var newName = argv.name;
	var newAbbr = argv.abbreviation;
	var newDesc = argv.description;

	var fileId;
	var taxonomy;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		serverRest.getTaxonomies({
			server: server,
			fields: 'availableStates'
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
					console.info(' - taxonomy ' + taxonomyName + ' (Id: ' + taxonomyId + ') exists');
					// console.log(taxonomy);
					var availableStates = taxonomy.availableStates || [];
					var foundDraft = false;
					availableStates.forEach(function (state) {
						if (state.status === 'draft') {
							foundDraft = true;
						}
					});
					if (foundDraft && !createNew) {
						console.error('ERROR: taxonomy ' + name + ' already has a draft version, promote it first');
						return Promise.reject();
					}
					if (createNew) {
						console.info(' - will create new taxonomy ' + (newName || taxonomyName));
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
				console.info(' - upload taxonomy file ' + jsonPath);
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
					console.error(error);
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

	var exitCode;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getTaxonomies({
			server: server,
			fields: 'availableStates,publishedChannels'
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
					console.error('ERROR: taxonomy does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.error('ERROR: there are ' + nameMatched.length + ' taxonomies with name ' + name + ':');
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
				console.info(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ')');
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
						console.error('ERROR: taxonomy ' + taxonomy.name + ' does not have draft version');
						return Promise.reject();
					}
				} else if (action === 'publish') {
					if (!foundPromoted) {
						console.error('ERROR: taxonomy ' + taxonomy.name + ' does not have promoted version');
						return Promise.reject();
					}
					if (!taxonomy.isPublishable) {
						console.error('ERROR: taxonomy ' + taxonomy.name + ' is not publishable');
						return Promise.reject();
					}
				} else if (action === 'unpublish') {
					if (!taxonomy.isPublishable) {
						console.error('ERROR: taxonomy ' + taxonomy.name + ' is not publishable');
						return Promise.reject();
					}
					if (!taxonomy.publishedChannels || taxonomy.publishedChannels.length === 0) {
						console.error('ERROR: taxonomy ' + taxonomy.name + ' is not currently published');
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
							console.error('ERROR: channel ' + channelNames[i] + ' does not exist');
						}
					}

					if (channels.length === 0) {
						// console.error('ERROR: no valid channel is defined');
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
								exitCode = 2;
								console.log(' - the taxonomy is already published to channel ' + channel.name +
									'. A new promoted version is required to publish it again');
							} else {
								channels2.push(channel);
								publishedChannelNames.push(channel.name);
							}
						});

						if (channels2.length === 0) {
							// console.error('ERROR: no channel to publish');
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
								exitCode = 2;
								console.log(' - the taxonomy has not been published to channel ' + channel.name);
							} else {
								channels2.push(channel);
								publishedChannelNames.push(channel.name);
							}
						});

						if (channels2.length === 0) {
							// console.error('ERROR: no channel to publish');
							return Promise.reject();
						}
					}

					console.info(' - verify channels');
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
					console.error(error);
				}
				done(exitCode);
			});
	});
};

module.exports.describeTaxonomy = function (argv, done) {
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

	var id = argv.id;
	var output = argv.file;

	if (output) {
		if (!path.isAbsolute(output)) {
			output = path.join(projectDir, output);
		}
		output = path.resolve(output);

		var outputFolder = output.substring(output, output.lastIndexOf(path.sep));
		// console.log(' - result file: ' + output + ' folder: ' + outputFolder);
		if (!fs.existsSync(outputFolder)) {
			console.error('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.error('ERROR: ' + outputFolder + ' is not a folder');
			done();
			return;
		}
	}

	var name = argv.name;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var tax;

		serverRest.getTaxonomiesWithName({
			server: server,
			name: name,
			fields: 'availableStates,publishedChannels'
		})
			.then(function (result) {
				if (!result || result.err || result.length === 0) {
					console.error('ERROR: taxonomy ' + name + ' does not exist');
					return Promise.reject();
				}
				if (output) {
					fs.writeFileSync(output, JSON.stringify(result, null, 4));
					console.log(' - taxonomy properties saved to ' + output);
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
					console.error('ERROR: taxonomy ' + name + ' does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.error('There are ' + nameMatched.length + ' taxonomies with name ' + name + ':');
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

				tax = idMatched || nameMatched[0];

				var promotedVersion;
				var publishedVersion;
				if (tax.availableStates && tax.availableStates.length > 0) {
					tax.availableStates.forEach(function (state) {
						if (state.status === 'promoted') {
							promotedVersion = state.version;
							if (state.published && !publishedVersion) {
								publishedVersion = promotedVersion;
							}
						} else if (state.status === 'published') {
							publishedVersion = state.version;
						}
					});
				}
				var channelNames = [];
				if (tax.publishedChannels && tax.publishedChannels.length > 0) {
					tax.publishedChannels.forEach(function (channel) {
						channelNames.push(channel.name || channel.id);
					});
				}

				var format1 = '%-38s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', tax.id));
				console.log(sprintf(format1, 'Name', tax.name));
				console.log(sprintf(format1, 'Abbreviation', tax.shortName));
				console.log(sprintf(format1, 'description', tax.description || ''));
				console.log(sprintf(format1, 'Created', tax.createdDate.value + ' by ' + tax.createdBy));
				console.log(sprintf(format1, 'Updated', tax.updatedDate.value + ' by ' + tax.updatedBy));
				console.log(sprintf(format1, 'Allow publishing', tax.isPublishable));
				console.log(sprintf(format1, 'Status', tax.status));
				if (promotedVersion) {
					console.log(sprintf(format1, 'Promoted', 'v' + promotedVersion));
				}
				if (publishedVersion) {
					console.log(sprintf(format1, 'Published', 'v' + publishedVersion));
				}
				if (channelNames.length > 0) {
					console.log(sprintf(format1, 'Channels', channelNames.sort()));
				}

				return serverRest.getCategories({
					server: server,
					taxonomyId: tax.id,
					taxonomyName: tax.name,
					status: promotedVersion ? 'promoted' : 'draft',
					fields: 'all',
					orderBy: 'position:asc'
				});

			})
			.then(function (result) {
				var categories = result && result.categories || [];

				if (categories.length > 0) {
					var usedAPINames = [];
					var duplicatedAPINames = [];
					categories.forEach(function (cat) {
						if (usedAPINames.length > 0 && usedAPINames.includes(cat.apiName)) {
							duplicatedAPINames.push(cat.apiName);
						}
						usedAPINames.push(cat.apiName);
					});
					console.log('Categories:');
					console.log('');
					var ident = '  ';
					_displayCategories(tax.id, categories, ident, duplicatedAPINames);

					console.log('');
					console.log(' - total categories: ' + categories.length);
					if (duplicatedAPINames.length > 0) {
						if (duplicatedAPINames.length > 1) {
							console.warn('WARN: there are ' + duplicatedAPINames.length + ' duplicated api names');
						} else {
							console.warn('WARN: there is a duplicated api name');
						}
					}
				}

				console.log('');
				done(true);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

var _displayCategories = function (parentId, categories, ident, duplicatedAPINames) {

	var i;
	for (i = 0; i < categories.length; i++) {
		var cat = categories[i];
		if (parentId === cat.parentId) {
			var label = duplicatedAPINames.includes(cat.apiName) ? ' !!! DUPLICATED !!!' : '';
			console.log(ident + cat.name + '  (' + cat.apiName + ')' + label);

			if (cat.children && cat.children.count > 0) {
				_displayCategories(cat.id, categories, ident + '    ', duplicatedAPINames);
			}
		}
	}

};