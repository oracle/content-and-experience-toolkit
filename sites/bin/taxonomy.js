/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
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

var _getTaxonomy = function (id, status, server) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/taxonomies/' + id;
		url += '?q=(status eq "' + status + '")&fields=all';

		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			resolve(data);
		}).catch((error) => {
			console.error('Failed to get taxonomy');
			reject();
		})
	});
};

var _getTaxonomyPermissions = function (id, server) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/taxonomies/' + id + '/permissions';

		serverRest.executeGet({
			server: server,
			endpoint: url,
			noMsg: true
		}).then(function (body) {
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			resolve(data);
		}).catch((error) => {
			console.error('ERROR: Failed to get taxonomy permissions');
			reject();
		})
	});
};

var _putTaxonomy = function (tax, status, server) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/taxonomies/' + tax.id;
		url += '?q=(status eq "' + status + '")&fields=all';

		serverRest.executePut({
			server: server,
			endpoint: url,
			body: tax,
			noMsg: true
		}).then(function (result) {
			if (result && result.err) {
				console.error('Failed to update taxonomy');
				reject();
			} else {
				if (Object.prototype.hasOwnProperty.call(result, 'o:errorCode')) {
					console.error(JSON.stringify(result, null, 4));
					reject();
				} else {
					resolve();
				}
			}
		}).catch((error) => {
			console.error('Failed to update taxonomy');
			reject();
		})
	});
};

var _findTaxonomyByName = function (name, server) {
	return new Promise(function (resolve, reject) {
		serverRest.getTaxonomiesWithName({
			server: server,
			name: name,
			fields: 'availableStates,publishedChannels'
		}).then(function (result) {
			var taxonomies = result || [];
			var nameMatched = [];
			for (var i = 0; i < taxonomies.length; i++) {
				if (name && taxonomies[i].name === name) {
					nameMatched.push(taxonomies[i]);
				}
			}

			if (nameMatched.length === 0) {
				console.error('ERROR: taxonomy ' + name + ' does not exist');
				return reject();
			} else {
				// Return first one.
				resolve(nameMatched.at(0));
			}

		}).catch((error) => {
			console.error('Failed to find taxonomy');
			reject();
		})
	});
};

var _findTaxonomyByStatus = function (name, status, server) {
	return new Promise(function (resolve, reject) {
		_findTaxonomyByName(name, server).then((tax) => {
			var statusMatch = tax.availableStates.find((state) => {
				return state.status === status;
			});

			if (statusMatch) {
				resolve(tax);
			} else {
				// Create draft
				serverRest.controlTaxonomy({
					server: server,
					id: tax.id,
					name: tax.name,
					action: 'createDraft'
				}).then(() => {
					console.info(' - Created draft of ' + name + ' taxonomy');
					resolve(tax);
				}).catch((error) => {
					console.info(' - Failed to create draft of ' + name + ' taxonomy');
					reject();
				});
			}

		}).catch((error) => {
			reject();
		});
	});
}

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

module.exports.updateTaxonomy = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var name = argv.name,
			publishableArg = typeof argv.publishable !== 'undefined',
			isPublishable = typeof argv.publishable === 'string' && argv.publishable.toLowerCase() === 'true',
			sitesecurityArg = typeof argv.sitesecurity !== 'undefined',
			isForSiteManagement = typeof argv.sitesecurity === 'string' && argv.sitesecurity.toLowerCase() === 'true';

		_findTaxonomyByStatus(name, 'draft', server).then((tax) => {
			_getTaxonomy(tax.id, 'draft', server).then((drafttax) => {
				if ((publishableArg && (drafttax.isPublishable !== isPublishable)) || (sitesecurityArg && (drafttax.isForSiteManagement !== isForSiteManagement))) {
					if (publishableArg) {
						drafttax.isPublishable = isPublishable;
					}
					if (sitesecurityArg) {
						drafttax.isForSiteManagement = isForSiteManagement
					}
					_putTaxonomy(drafttax, 'draft', server).then(() => {
						if (publishableArg) {
							var verb = isPublishable ? 'Enabled' : 'Disabled';
							console.info(' - ' + verb + ' ' + tax.name + ' taxonomy for publishing');
						}
						if (sitesecurityArg) {
							verb = isForSiteManagement ? 'Enabled' : 'Disabled';
							console.info(' - ' + verb + ' ' + tax.name + ' taxonomy for Site security management use');
						}
						done(true);
					}).catch((error) => {
						done();
					})
				} else {
					console.info('Specified input settings matches current settings. Update not necessary');
					done(true);
				}
			}).catch((error) => {
				done();
			})
		}).catch((error) => {
			console.error('Taxonomy ' + name + ' not found');
			done();
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
		var promotedVersion;
		var publishedVersion;
		var format1 = '%-38s  %-s';

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

				console.log('');
				console.log(sprintf(format1, 'Id', tax.id));
				console.log(sprintf(format1, 'Name', tax.name));
				console.log(sprintf(format1, 'Abbreviation', tax.shortName));
				console.log(sprintf(format1, 'description', tax.description || ''));
				console.log(sprintf(format1, 'Created', tax.createdDate.value + ' by ' + tax.createdBy));
				console.log(sprintf(format1, 'Updated', tax.updatedDate.value + ' by ' + tax.updatedBy));
				console.log(sprintf(format1, 'Allow publishing', tax.isPublishable));
				console.log(sprintf(format1, 'Use for Site security management', tax.isForSiteManagement));
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

				return _getTaxonomyPermissions(tax.id, server);

			})
			.then(function (result) {
				var taxPermissions = result && result.items || [];
				// console.log(taxPermissions);
				let taxManagers = [];
				let taxEditors = [];
				taxPermissions.forEach(function (perm) {
					if (perm.roleName === 'manager') {
						taxManagers.push(perm.id);
					} else if (perm.roleName === 'editor') {
						taxEditors.push(perm.id);
					}
				});
				console.log(sprintf(format1, 'Managers', taxManagers));
				console.log(sprintf(format1, 'Editors', taxEditors));


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

var _addTaxonomyPermission = function (server, csrfToken, taxonomy, grantee, type, role) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/permissions';

		var granteeId = type === 'user' ? grantee.loginName : grantee.name;
		var payload = {
			id: granteeId,
			roleName: role,
			type: type
		};
		if (type === 'group') {
			payload.groupType = grantee.groupOriginType;
		}

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

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to add permission to taxonomy ' + taxonomy.name + ' for ' + type + ' ' + granteeId + ' (ecid: ' + response.ecid + ')');
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

			let result = {
				type: type,
				id: granteeId
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve({
					permission: result
				});
			} else {
				var msg = response.statusCode + ' ' + response.statusMessage + ' ' + (data && data['o:errorCode'] ? data['o:errorCode'] : '');
				console.error('ERROR: failed to add permission to taxonomy ' + taxonomy.name + ' for ' + type + ' ' + granteeId + ' ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err',
					permission: result
				});
			}
		});
	});
};

var _updateTaxonomyPermission = function (server, csrfToken, taxonomy, grantee, type, role) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/permissions/' + grantee.permissionId;

		var granteeId = type === 'user' ? grantee.loginName : grantee.name;
		var payload = {
			roleName: role
		};

		var postData = {
			method: 'PATCH',
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

		var request = require('../test/server/requestUtils.js').request;
		request.patch(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to update permission to taxonomy ' + taxonomy.name + ' for ' + type + ' ' + granteeId + ' (ecid: ' + response.ecid + ')');
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

			let result = {
				type: type,
				id: granteeId
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve({
					permission: result
				});
			} else {
				var msg = response.statusCode + ' ' + response.statusMessage + ' ' + (data && data['o:errorCode'] ? data['o:errorCode'] : '');
				console.error('ERROR: failed to update permission to taxonomy ' + taxonomy.name + ' for ' + type + ' ' + granteeId + ' ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err',
					permission: result
				});
			}
		});
	});
};

module.exports.shareTaxonomy = function (argv, done) {
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

	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var taxonomy;
		var users = [];
		var groups = [];
		var goodUserNames = [];
		var goodGroupNames = [];
		var groupsToGrant = [];
		var groupsToUpdate = [];
		var usersToGrant = [];
		var usersToUpdate = [];
		var creator;

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
				creator = taxonomy.createdBy;
				console.info(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ' createdBy: ' + creator + ')');

				var groupPromises = [];
				groupNames.forEach(function (gName) {
					groupPromises.push(
						serverRest.getGroup({
							server: server,
							name: gName
						}));
				});
				return Promise.all(groupPromises);

			})
			.then(function (result) {

				if (groupNames.length > 0) {
					console.info(' - verify groups');

					// verify groups
					var allGroups = result || [];
					for (var i = 0; i < groupNames.length; i++) {
						var found = false;
						for (var j = 0; j < allGroups.length; j++) {
							if (allGroups[j].name && groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
								found = true;
								groups.push(allGroups[j]);
								break;
							}
						}
						if (!found) {
							console.error('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
					// console.log(groups);
				}

				var usersPromises = [];
				for (let i = 0; i < userNames.length; i++) {
					usersPromises.push(serverRest.getUser({
						server: server,
						name: userNames[i]
					}));
				}

				return Promise.all(usersPromises);
			})
			.then(function (results) {
				var allUsers = [];
				for (var i = 0; i < results.length; i++) {
					if (results[i].items) {
						allUsers = allUsers.concat(results[i].items);
					}
				}
				if (userNames.length > 0) {
					console.info(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					let found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
							users.push(allUsers[i]);
							found = true;
							break;
						}
						if (found) {
							break;
						}
					}

					if (!found) {
						console.error('ERROR: user ' + userNames[k] + ' does not exist');
					}
					// console.log(users);
				}

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return _getTaxonomyPermissions(taxonomy.id, server);

			})
			.then(function (result) {
				var taxPermissions = result && result.items || [];
				// console.log(taxPermissions);

				var userMgr;
				var totalUserManagers = 0;
				taxPermissions.forEach(function (perm) {
					if (perm.roleName === 'manager' && perm.type === 'user') {
						totalUserManagers += 1;
						userMgr = perm;
					}
				});
				// console.log(totalUserManagers + ' ' + JSON.stringify(userMgr));

				for (let i = 0; i < groups.length; i++) {
					var groupGranted = false;
					let needUpdate = false;
					for (let j = 0; j < taxPermissions.length; j++) {
						var perm = taxPermissions[j];
						if (perm.type === 'group' &&
							perm.groupType === groups[i].groupOriginType &&
							(perm.fullName === groups[i].name || perm.id.toLowerCase() === groups[i].name.toLowerCase())) {
							if (perm.roleName === role) {
								groupGranted = true;
							} else {
								needUpdate = true;
								groups[i].permissionId = perm.permissionId;
							}
							break;
						}
					}
					if (groupGranted) {
						console.log(' - group ' + groups[i].name + ' already granted with role ' + role + ' on taxonomy ' + name);
					} else {
						if (needUpdate) {
							groupsToUpdate.push(groups[i]);
						} else {
							groupsToGrant.push(groups[i]);
						}
						goodGroupNames.push(groups[i].name);
					}
				}

				for (let i = 0; i < users.length; i++) {
					var granted = false;
					let needUpdate = false;
					for (let j = 0; j < taxPermissions.length; j++) {
						let perm = taxPermissions[j];
						if (perm.type === 'user' && perm.id === users[i].loginName) {
							if (perm.roleName === role) {
								granted = true;
							} else {
								needUpdate = true;
								if (role === 'editor' && totalUserManagers === 1 && perm.id === userMgr.id) {
									console.error('ERROR: user ' + userMgr.id + ' is the only user manager for taxonomy ' + name + ', cannot change to editor');
									return Promise.reject();
								}
								users[i].permissionId = perm.permissionId;
							}
							break;
						}
					}
					if (granted) {
						console.log(' - user ' + users[i].loginName + ' already granted with role ' + role + ' on taxonomy ' + name);
					} else {
						if (needUpdate) {
							usersToUpdate.push(users[i]);
						} else {
							usersToGrant.push(users[i]);
						}
						goodUserNames.push(users[i].loginName);
					}
				}

				return serverUtils.getCaasCSRFToken(server);

			}).then(function (result) {
				var csrfToken;
				if (result.err) {
					return Promise.reject();
				} else {
					csrfToken = result && result.token;
				}

				var permissionPromises = [];
				groupsToGrant.forEach(function (group) {
					permissionPromises.push(_addTaxonomyPermission(server, csrfToken, taxonomy, group, 'group', role));
				});
				groupsToUpdate.forEach(function (group) {
					permissionPromises.push(_updateTaxonomyPermission(server, csrfToken, taxonomy, group, 'group', role));
				});
				usersToGrant.forEach(function (user) {
					permissionPromises.push(_addTaxonomyPermission(server, csrfToken, taxonomy, user, 'user', role));
				});
				usersToUpdate.forEach(function (user) {
					permissionPromises.push(_updateTaxonomyPermission(server, csrfToken, taxonomy, user, 'user', role));
				});

				return Promise.all(permissionPromises);

			})
			.then(function (results) {
				var failed = false;
				let grantedGroups = [];
				let grantedUsers = [];
				results.forEach(function (result) {
					if (result.err) {
						failed = true;
					} else {
						if (result.permission.type === 'user') {
							grantedUsers.push(result.permission.id)
						} else {
							grantedGroups.push(result.permission.id);
						}
					}
				});

				if (grantedUsers.length > 0) {
					console.log(' - user ' + (grantedUsers.join(', ')) + ' granted with role ' + role + ' on taxonomy ' + name);
				}
				if (grantedGroups.length > 0) {
					console.log(' - group ' + (grantedGroups.join(', ')) + ' granted with role ' + role + ' on taxonomy ' + name);
				}

				done(!failed);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

var _deleteTaxonomyPermission = function (server, csrfToken, taxonomy, perm) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/permissions/' + perm.permissionId;

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

		var request = require('../test/server/requestUtils.js').request;
		request.delete(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to delete permission to taxonomy ' + taxonomy.name + ' for ' + perm.type + ' ' + perm.id + ' (ecid: ' + response.ecid + ')');
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

			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				resolve({
					permission: perm
				});
			} else {
				var msg = response.statusCode + ' ' + response.statusMessage + ' ' + (data && data['o:errorCode'] ? data['o:errorCode'] : '');
				console.error('ERROR: failed to delete permission to taxonomy ' + taxonomy.name + ' for ' + perm.type + ' ' + perm.id + ' ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err',
					permission: perm
				});
			}
		});
	});
};

module.exports.unshareTaxonomy = function (argv, done) {
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

	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var taxonomy;
		var users = [];
		var groups = [];
		var goodUserNames = [];
		var goodGroupNames = [];
		var permsToDelete = [];
		var creator;

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
				creator = taxonomy.createdBy;
				console.info(' - validate taxonomy ' + taxonomy.name + ' (id: ' + taxonomy.id + ' createdBy: ' + creator + ')');

				var groupPromises = [];
				groupNames.forEach(function (gName) {
					groupPromises.push(
						serverRest.getGroup({
							server: server,
							name: gName
						}));
				});
				return Promise.all(groupPromises);

			})
			.then(function (result) {

				if (groupNames.length > 0) {
					console.info(' - verify groups');

					// verify groups
					var allGroups = result || [];
					for (var i = 0; i < groupNames.length; i++) {
						var found = false;
						for (var j = 0; j < allGroups.length; j++) {
							if (allGroups[j].name && groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
								found = true;
								groups.push(allGroups[j]);
								break;
							}
						}
						if (!found) {
							console.error('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
					// console.log(groups);
				}

				var usersPromises = [];
				for (let i = 0; i < userNames.length; i++) {
					usersPromises.push(serverRest.getUser({
						server: server,
						name: userNames[i]
					}));
				}

				return Promise.all(usersPromises);
			})
			.then(function (results) {
				var allUsers = [];
				for (var i = 0; i < results.length; i++) {
					if (results[i].items) {
						allUsers = allUsers.concat(results[i].items);
					}
				}
				if (userNames.length > 0) {
					console.info(' - verify users');
				}

				// verify users
				for (let k = 0; k < userNames.length; k++) {
					if (userNames[k].toLowerCase() === creator.toLowerCase()) {
						console.error('ERROR: user ' + userNames[k] + ' is the taxonomy creator, cannot delete permission');
					} else {
						var found = false;
						for (let i = 0; i < allUsers.length; i++) {
							if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
								users.push(allUsers[i]);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found) {
							console.error('ERROR: user ' + userNames[k] + ' does not exist');
						}
					}
				}

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return _getTaxonomyPermissions(taxonomy.id, server);

			})
			.then(function (result) {
				var taxPermissions = result && result.items || [];
				// console.log(taxPermissions);

				var userMgr;
				var totalUserManagers = 0;
				taxPermissions.forEach(function (perm) {
					if (perm.roleName === 'manager' && perm.type === 'user') {
						totalUserManagers += 1;
						userMgr = perm;
					}
				});

				for (let i = 0; i < groups.length; i++) {
					let groupToDelete = undefined;
					for (let j = 0; j < taxPermissions.length; j++) {
						var perm = taxPermissions[j];
						if (perm.type === 'group' &&
							perm.groupType === groups[i].groupOriginType &&
							(perm.fullName === groups[i].name || perm.id.toLowerCase() === groups[i].name.toLowerCase())) {
							groupToDelete = perm;
							break;
						}
					}
					if (!groupToDelete) {
						console.log(' - group ' + groups[i].name + ' has no permission on taxonomy ' + name);
					} else {
						permsToDelete.push(groupToDelete);
						goodGroupNames.push(groups[i].name);
					}
				}

				for (let i = 0; i < users.length; i++) {
					let userToDelete = undefined;
					for (let j = 0; j < taxPermissions.length; j++) {
						let perm = taxPermissions[j];
						if (perm.type === 'user' && perm.id === users[i].loginName) {
							if (totalUserManagers === 1 && perm.id === userMgr.id) {
								console.error('ERROR: user ' + userMgr.id + ' is the only user manager for taxonomy ' + name + ', cannot delete');
								return Promise.reject();
							} else {
								userToDelete = perm;
								break;
							}
						}
					}
					if (!userToDelete) {
						console.log(' - user ' + users[i].loginName + ' has no permission on taxonomy ' + name);
					} else {
						permsToDelete.push(userToDelete);
						goodUserNames.push(users[i].loginName);
					}
				}

				return serverUtils.getCaasCSRFToken(server);

			}).then(function (result) {
				var csrfToken;
				if (result.err) {
					return Promise.reject();
				} else {
					csrfToken = result && result.token;
				}

				var deletePromises = [];
				permsToDelete.forEach(function (perm) {
					deletePromises.push(_deleteTaxonomyPermission(server, csrfToken, taxonomy, perm));
				});

				return Promise.all(deletePromises);

			})
			.then(function (results) {
				let deletedUsers = [];
				let deletedGroups = [];
				let failed = false;
				results.forEach(function (result) {
					if (result.err) {
						failed = true;
					} else {
						if (result.permission.type === 'user') {
							deletedUsers.push(result.permission.id)
						} else {
							deletedGroups.push(result.permission.id);
						}
					}
				});

				if (deletedUsers.length > 0) {
					console.log(' - the access of user ' + (deletedUsers.join(', ')) + ' to taxonomy ' + name + ' removed');
				}
				if (deletedGroups.length > 0) {
					console.log(' - the access of group ' + (deletedGroups.join(', ')) + ' to taxonomy ' + name + ' removed');
				}

				done(!failed);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};
