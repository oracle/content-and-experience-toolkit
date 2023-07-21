/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	path = require('path'),
	os = require('os'),
	readline = require('readline'),
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

	if (process.shim) {
		return true;
	}
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	serversSrcDir = path.join(srcfolder, 'servers');
	taxonomiesSrcDir = path.join(srcfolder, 'taxonomies');

	var buildfolder = serverUtils.getBuildFolder(projectDir);
	taxonomiesBuildDir = path.join(buildfolder, 'taxonomies');

	return true;
};

var _getTaxonomy = function(id, status, server) {
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


var _createTaxonomyCategoryPropertyTypes = function (server, taxonomy, types) {
	return new Promise(function (resolve, reject) {
		var createdTypes = [];
		if (types.length === 0) {
			return resolve(createdTypes);
		} else {
			var doCreateTypes = types.reduce(function (typePromise, type) {
				return typePromise.then(function (result) {
					var createUrl = '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/categoryProperties';
					var displayName = type.displayName;
					// server API generates apiName based on displayName
					type.displayName = type.apiName;
					return serverRest.executePost({
						server: server,
						endpoint: createUrl,
						body: type,
						noMsg: true,
						responseStatus: true
					}).then(function (result) {
						if (result && result.id) {
							createdTypes.push(result);
							console.info(' - created custom property type ' + result.displayName + ' (' + result.apiName + ')');
							if (result.displayName !== displayName) {
								// update the newly created property type with its original display name
								let url = '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/categoryProperties/' + result.id;
								let newType = {
									displayName: displayName
								}
								return serverRest.executePatch({
									server: server,
									endpoint: url,
									body: newType,
									noMsg: true
								}).then(function (result) {
									if (result && result.updatedBy && result.updatedDate) {
										console.info(' - updated custom property type display name to ' + displayName);
									} else {
										if (result) {
											console.error(JSON.stringify(result, null, 4));
										}
									}
								})
							}
						} else {
							if (result) {
								console.error('ERROR: failed to create custom property type ' + type.displayName + ' (' + type.apiName + ')');
								console.error(JSON.stringify(result, null));
							}
						}
					})
				});
			},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

			doCreateTypes.then(function (result) {
				resolve(createdTypes);
			});
		}
	});
};

var _updateTaxonomyCategoryPropertyTypes = function (server, taxonomy, types) {
	return new Promise(function (resolve, reject) {
		var updatedTypes = [];
		if (types.length === 0) {
			return resolve(updatedTypes);
		} else {
			var doUpdateTypes = types.reduce(function (typePromise, type) {
				return typePromise.then(function (result) {
					var url = '/content/management/api/v1.1/taxonomies/' + taxonomy.id + '/categoryProperties/' + type.id;
					delete type.id;
					let apiName = type.apiName;
					let displayName = type.displayName;
					// Due to server bug, donot set if no change
					if (type.removeDisplayName) {
						delete type.displayName;
					}
					delete type.removeDisplayName;
					return serverRest.executePatch({
						server: server,
						endpoint: url,
						body: type,
						responseStatus: true,
						noMsg: true
					}).then(function (result) {
						if (result && result.statusCode < 400) {
							console.info(' - updated custom property type ' + displayName + ' (' + apiName + ')');
							updatedTypes.push(result);
						} else {
							if (result) {
								console.error(JSON.stringify(result, null, 4));
							}
						}
					})
				});
			},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

			doUpdateTypes.then(function (result) {
				resolve(updatedTypes);
			});
		}
	});
};

var _getCategoryData = function (server, taxonomyId, ids, status) {
	return new Promise(function (resolve, reject) {

		var total = ids.length;
		var groups = [];
		var limit = 30;
		var start, end;
		for (var i = 0; i < total / limit; i++) {
			start = i * limit;
			end = start + limit - 1;
			if (end >= total) {
				end = total - 1;
			}
			groups.push({
				start: start,
				end: end
			});
		}
		if (end < total - 1) {
			groups.push({
				start: end + 1,
				end: total - 1
			});
		}

		var needNewLine = false;
		var startTime = new Date();
		var cats = [];
		var doGetCategories = groups.reduce(function (catPromise, param) {
			return catPromise.then(function (result) {
				var catPromises = [];
				for (let i = param.start; i <= param.end; i++) {
					var url = '/content/management/api/v1.1/taxonomies/' + taxonomyId + '/categories/' + ids[i] + '?fields=all';
					if (status) {
						url = url + '&q=(status eq "' + status + '")';
					}
					// console.log(url);
					catPromises.push(serverRest.executeGet({
						server: server,
						endpoint: url,
						noMsg: true
					}));
				}
				return Promise.all(catPromises)
					.then(function (results) {
						if (console.showInfo()) {
							process.stdout.write(' - getting categories [' + param.start + ', ' + param.end + '] [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
						for (let i = 0; i < results.length; i++) {
							if (results[i] && !results[i].err) {
								try {
									let data = JSON.parse(results[i]);
									let onecat = data && data.id ? data : undefined;
									if (onecat) {
										cats.push(onecat);
									}
								} catch (e) {
									// invalid result
								}
							}
						}
					})
			});
		},
		Promise.resolve({})
		);

		doGetCategories.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve(cats);
		});
	})
};

var _updateCategories = function (server, taxonomyId, categories) {
	return new Promise(function (resolve, reject) {
		var updatedCategories = [];
		if (categories.length === 0) {
			return resolve(updatedCategories);
		} else {
			var doUpdateCategory = categories.reduce(function (catPromise, cat) {
				return catPromise.then(function (result) {
					var url = '/content/management/api/v1.1/taxonomies/' + taxonomyId + '/categories/' + cat.id;
					url = url + '?q=(status eq "draft")';
					return serverRest.executePut({
						server: server,
						endpoint: url,
						body: cat,
						noMsg: true
					}).then(function (result) {
						if (result && result.id) {
							console.info(' - updated category ' + result.name + ' (' + result.apiName + ')');
							updatedCategories.push(result);
						} else {
							if (result) {
								console.error('ERROR: failed to update category ' + cat.name + ' (' + cat.apiName + ') : ' + JSON.stringify(result));
							}
						}
					})
				});
			},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

			doUpdateCategory.then(function (result) {
				resolve(updatedCategories);
			});
		}
	});
};

module.exports.transferCategoryProperty = function (argv, done) {
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

	var destServerName = argv.destination;
	var destServer = serverUtils.verifyServer(destServerName, projectDir);
	if (!destServer || !destServer.valid) {
		done();
		return;
	}

	if (server.url === destServer.url) {
		console.error('ERROR: source and destination server are the same');
		done();
		return;
	}

	var name = argv.name;
	var id = argv.id;
	var status = argv.status || 'promoted';

	var taxonomy;
	var destTaxonomy;
	var categoryPropertyTypes = [];
	var destCategoryPropertyTypes = [];
	var categoryPropertyTypesToCreate = [];
	var categoryPropertyTypesToUpdate = [];
	var categories = [];
	var destCategories = [];
	var goodCategoryIds = [];
	var categoryData = [];
	var destCategoryData = [];
	var categoriesToUpdate = [];

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.error(result.statusMessage + ' ' + destServer.url);
				return Promise.reject();
			}

			return serverRest.getTaxonomiesWithName({
				server: server,
				name: name,
				fields: 'availableStates'
			});

		})
		.then(function (result) {
			if (!result || result.err || result.length === 0) {
				console.error('ERROR: taxonomy ' + name + ' does not exist on the source server');
				return Promise.reject();
			}

			let taxonomies = result || [];
			let nameMatched = [];
			let idMatched;
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

			taxonomy = idMatched || nameMatched[0];

			console.info(' - validate taxonomy ' + taxonomy.name +  '(' + taxonomy.shortName + ') (id: ' + taxonomy.id + ') on the source server');
			// console.log(taxonomy);
			var availableStates = taxonomy.availableStates || [];

			var foundPromoted = false;
			var foundDraft = false;
			availableStates.forEach(function (state) {
				if (state.status === 'promoted') {
					foundPromoted = true;
				}
				if (state.status === 'draft') {
					foundDraft = true;
				}
			});

			if (status === 'promoted' && !foundPromoted) {
				console.error('ERROR: taxonomy ' + taxonomy.name + ' does not have promoted version');
				return Promise.reject();
			}
			if (status === 'draft' && !foundDraft) {
				console.error('ERROR: taxonomy ' + taxonomy.name + ' does not have draft version');
				return Promise.reject();
			}

			return serverRest.getTaxonomiesWithName({
				server: destServer,
				name: name,
				fields: 'availableStates'
			});

		})
		.then(function (result) {
			if (!result || result.err || result.length === 0) {
				console.error('ERROR: taxonomy ' + name + ' does not exist on the destination server');
				return Promise.reject();
			}

			let taxonomies = result || [];
			for (let i = 0; i < taxonomies.length; i++) {
				if (taxonomies[i].name === taxonomy.name && taxonomies[i].shortName === taxonomy.shortName) {
					destTaxonomy = taxonomies[i];
					break;
				}
			}
			if (!destTaxonomy || !destTaxonomy.id) {
				console.error('ERROR: taxonomy ' + name + '(' + taxonomy.shortName + ') does not exist on the destination server');
				return Promise.reject();
			}

			let availableStates = destTaxonomy.availableStates || [];
			let foundDraft = false;
			availableStates.forEach(function (state) {
				if (state.status === 'draft') {
					foundDraft = true;
				}
			});
			if (foundDraft ) {
				console.error('ERROR: taxonomy ' + name + ' already has a draft version on the destination server, promote it first');
				return Promise.reject();
			}

			console.info(' - validate taxonomy ' + destTaxonomy.name +  '(' + destTaxonomy.shortName + ') (id: ' + destTaxonomy.id + ') on the destination server');

			return serverRest.getCategoryProperties({server: server, taxonomyId: taxonomy.id});

		})
		.then(function (result) {
			categoryPropertyTypes = result && result.categoryProperties || [];
			if (categoryPropertyTypes.length === 0) {
				console.error('ERROR: failed to get taxonomy category property types on the source server');
				return Promise.reject();
			}
			// console.log(categoryPropertyTypes);

			return serverRest.getCategoryProperties({server: destServer, taxonomyId: destTaxonomy.id});

		})
		.then(function (result) {
			destCategoryPropertyTypes = result && result.categoryProperties || [];
			if (destCategoryPropertyTypes.length === 0) {
				console.error('ERROR: failed to get taxonomy category property types on the destination server');
				return Promise.reject();
			}
			// console.log(destCategoryPropertyTypes);

			categoryPropertyTypes.forEach(function (srcType) {
				if (!srcType.isSystemManaged) {
					let destType = undefined;
					for (let i = 0; i < destCategoryPropertyTypes.length; i++) {
						if (srcType.apiName === destCategoryPropertyTypes[i].apiName) {
							destType = destCategoryPropertyTypes[i];
							break;
						}
					}
					if (destType) {
						let obj = {
							id: destType.id,
							apiName: destType.apiName,
							displayName: srcType.displayName,
							description: srcType.description,
							isPublishable: srcType.isPublishable,
							valueCount: srcType.valueCount,
							defaultValues: srcType.defaultValues,
							settings: srcType.settings
						};
						obj.removeDisplayName = srcType.displayName === destType.displayName
						categoryPropertyTypesToUpdate.push(obj);
					} else {
						categoryPropertyTypesToCreate.push(srcType);
					}
				}
			});

			console.info(' - total custom property types to create: ' + categoryPropertyTypesToCreate.length);
			console.info(' - total custom property types to update: ' + categoryPropertyTypesToUpdate.length);

			// query categories on the source server, either draft or promoted
			return serverRest.getCategories({
				server: server,
				taxonomyId: taxonomy.id,
				taxonomyName: taxonomy.name,
				status: status
			});

		})
		.then(function (result) {
			categories = result && result.categories || [];
			// console.log(categories);

			// query categories on the destination server, the promoted version
			return serverRest.getCategories({
				server: destServer,
				taxonomyId: destTaxonomy.id,
				taxonomyName: destTaxonomy.name
			});

		})
		.then(function (result) {
			destCategories = result && result.categories || [];
			// console.log(destCategories);

			categories.forEach(function (cat) {
				let found = false;
				for (let i = 0; i < destCategories.length; i++) {
					if (cat.id === destCategories[i].id) {
						found = true;
						break;
					}
				}
				if (!found) {
					console.warn('WARNING: category ' + cat.name + ' (' + cat.apiName + ') does not exist on the destination server');
				} else {
					goodCategoryIds.push(cat.id);
				}
			});
			if (goodCategoryIds.length === 0) {
				console.error('ERROR: no category to transfer');
				return Promise.reject();
			}
			console.info(' - will update ' + goodCategoryIds.length + ' categories');

			// get category details on the source server
			return _getCategoryData(server, taxonomy.id, goodCategoryIds, status);

		})
		.then(function (result) {

			categoryData = result;
			// console.log(JSON.stringify(categoryData, null, 2));

			// get category details on the destination server
			return _getCategoryData(destServer, destTaxonomy.id, goodCategoryIds);

		})
		.then(function (result) {

			destCategoryData = result;

			// create a draft first on the destination server
			let url = '/content/management/api/v1.1/taxonomies/' + destTaxonomy.id + '/createDraft';
			return serverRest.executePost({
				server: destServer,
				endpoint: url,
				body: {status: 'promoted'},
				noMsg: true,
				responseStatus: true
			});

		})
		.then(function (result) {

			if (result && result.status >= 400) {
				// failed to create draft
				console.error('ERROR: failed to create draft on the destination server');
				console.error(JSON.stringify(result, null, 4));
				return Promise.reject();
			}

			// create new custom property types on the destination server
			return _createTaxonomyCategoryPropertyTypes(destServer, destTaxonomy, categoryPropertyTypesToCreate);
		})
		.then(function (result) {

			if (categoryPropertyTypesToCreate.length > 0 && result.length !== categoryPropertyTypesToCreate.length) {
				return Promise.reject();
			}

			// update existing custom property types on the destination server
			return _updateTaxonomyCategoryPropertyTypes(destServer, destTaxonomy, categoryPropertyTypesToUpdate);

		})
		.then(function (result) {

			if (categoryPropertyTypesToUpdate.length > 0 && result.length !== categoryPropertyTypesToUpdate.length) {
				return Promise.reject();
			}

			categoryData.forEach(function (srcCat) {
				let destCat = undefined;
				for (let i = 0; i < destCategoryData.length; i++) {
					if (srcCat.id === destCategoryData[i].id) {
						destCat = destCategoryData[i];
						break;
					}
				}
				if (destCat) {
					destCat.keywords = srcCat.keywords;
					destCat.synonyms = srcCat.synonyms;
					destCat.relatedCategories = srcCat.relatedCategories;
					destCat.customProperties = srcCat.customProperties;
					categoriesToUpdate.push(destCat);
				} else {
					console.warn('WARNING: category ' + srcCat.name + ' (' + srcCat.apiName + ') not found on the destination server');
				}
			});
			fs.writeFileSync(path.join(projectDir, 'categoriesToUpdate.json'), JSON.stringify(categoriesToUpdate, null, 4));

			// update all categories on the destination server.
			// Fow now only update the following fields:
			// keywords, synonyms, relatedCategories, customProperties
			return _updateCategories(destServer, destTaxonomy.id, categoriesToUpdate);

		})
		.then(function (result) {
			console.log(' - updated ' + result.length + ' categories');
			if (categoriesToUpdate.length !== result.length) {
				done();
			} else {
				done(true);
			}
		})
		.catch((error) => {
			if (error) {
				console.error(error);
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

var _updateAssets = function () {

	console.log(projectDir);
	var contentPath = path.join(projectDir, 'src', 'content');
	var folders = fs.readdirSync(contentPath);
	var total = 0;
	folders.forEach(function (batchName) {
		var assetFolder = path.join(contentPath, batchName, 'contentexport', 'ContentItems', 'IR-ProductCategoryPage-v1');
		if (fs.existsSync(assetFolder)) {
			var files = fs.readdirSync(assetFolder);
			if (files && files.length > 0) {
				let batchTotal = 0;
				files.forEach(function (file) {
					let filePath = path.join(assetFolder, file);
					let str = fs.readFileSync(filePath);
					let asset;
					try {
						asset = JSON.parse(str);
						if (asset && asset.fields && asset.fields.related_items_background_image_position && asset.fields.related_items_background_image_position.length > 0) {
							total += 1;
							batchTotal += 1;
							asset.fields.related_items_background_image_position = null;
							fs.writeFileSync(filePath, JSON.stringify(asset));
						}
					} catch (e) {
						console.log('ERROR: ' + file);
					}
				});
				if (batchTotal > 0) {
					console.log('batch: ' + batchName + ' total IR-ProductCategoryPage-v1: ' + files.length + ' related_items_background_image_position is array: ' + batchTotal);
				}
			}
		}
	});
	console.log('Total: ' + total);
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

				return serverRest.getCategoryProperties({server: server, taxonomyId: tax.id});

			})
			.then(function (result) {

				let categoryProperties = result && result.categoryProperties || [];
				let customCatProperties = [];
				categoryProperties.forEach(function (cat) {
					if (!cat.isSystemManaged) {
						customCatProperties.push(cat);
					}
				});

				console.log('');
				console.log('Custom Property Types:');
				let typeFormat = '   %-34s   %-34s  %-12s  %-s';
				if (customCatProperties.length > 0) {
					console.log(sprintf(typeFormat, 'Name', 'apiName', 'Value Count', 'Publishable'));
				}
				customCatProperties.forEach(function (cat) {
					console.log(sprintf(typeFormat, cat.displayName, cat.apiName, (cat.valueCount === 'single' ? 'Single' : 'Multiple'), (cat.isPublishable ? '    √' : '')));
				});
				console.log('');

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

module.exports.describeCategory = function (argv, done) {
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

	var apiName = argv.apiname;
	var taxName = argv.taxonomy;
	var id = argv.id;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var tax;
		var promotedVersion;
		var publishedVersion;
		var categoryProperties;

		serverRest.getTaxonomiesWithName({
			server: server,
			name: taxName,
			fields: 'availableStates,publishedChannels'
		})
			.then(function (result) {
				if (!result || result.err || result.length === 0) {
					console.error('ERROR: taxonomy ' + taxName + ' does not exist');
					return Promise.reject();
				}

				var taxonomies = result || [];
				var nameMatched = [];
				var idMatched;
				for (var i = 0; i < taxonomies.length; i++) {
					if (taxName && taxonomies[i].name === taxName) {
						nameMatched.push(taxonomies[i]);
					}
					if (id && taxonomies[i].id === id) {
						idMatched = taxonomies[i];
					}
				}

				if (!idMatched && nameMatched.length === 0) {
					console.error('ERROR: taxonomy ' + taxName + ' does not exist');
					return Promise.reject();
				}
				if (!idMatched && nameMatched.length > 1) {
					console.error('There are ' + nameMatched.length + ' taxonomies with name ' + taxName + ':');
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
				console.info(' - verify taxonomy ' + tax.name + ' (Id: ' + tax.id + ')');

				return serverRest.getCategoryProperties({server: server, taxonomyId: tax.id});

			})
			.then(function (result) {
				categoryProperties = result && result.categoryProperties || [];

				return serverRest.getCategories({
					server: server,
					taxonomyId: tax.id,
					taxonomyName: tax.name,
					status: promotedVersion ? 'promoted' : 'draft',
					q: 'apiName eq "' + apiName + '"'});

			})
			.then(function (result) {

				var categories = result && result.categories || [];
				if (categories.length === 0) {
					console.error('ERROR: category ' + apiName + ' is not found');
					return Promise.reject();
				}

				// query category data
				var url = '/content/management/api/v1.1/taxonomies/' + tax.id + '/categories/' + categories[0].id;
				url = url + '?fields=idPath,namePath,keywords,synonyms,relatedCategories,customProperties';
				url = url + '&q=(status eq "' +  (promotedVersion ? 'promoted' : 'draft') + '")';

				return serverRest.executeGet({
					server: server,
					endpoint: url,
					noMsg: true
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var cat;
				try {
					cat = JSON.parse(result);
				} catch (e) {
					cat = result;
				}

				if (!cat || !cat.id) {
					console.error('ERROR: category ' + apiName + ' is not found');
					return Promise.reject();
				}

				if (output) {
					let data = {
						taxonomy: tax,
						category: cat
					}
					fs.writeFileSync(output, JSON.stringify(data, null, 4));
					console.log(' - taxonomy category properties saved to ' + output);
				}

				var namePath = cat.namePath;
				if (namePath.startsWith('/')) {
					namePath = namePath.substring(1);
				}
				// console.log(cat);
				console.log('');
				var format1 = '%-38s  %-s';
				console.log(sprintf(format1, 'Id', cat.id));
				console.log(sprintf(format1, 'Name', cat.name));
				console.log(sprintf(format1, 'Description', cat.description));
				console.log(sprintf(format1, 'Taxonomy path', namePath.split('/').join(' / ')));
				console.log(sprintf(format1, 'API name', cat.apiName));
				console.log(sprintf(format1, 'Keywords', cat.keywords));
				console.log(sprintf(format1, 'Synonyms', cat.synonyms));
				console.log(sprintf(format1, 'Related categories', cat.relatedCategories));
				// console.log(categoryProperties);
				if (cat.customProperties) {
					categoryProperties.forEach(function (catType) {
						if (!catType.isSystemManaged) {
							let typeName = catType.apiName;
							let values = [];
							if (cat.customProperties[typeName] && cat.customProperties[typeName].values) {
								cat.customProperties[typeName].values.forEach(function (obj) {
									if (obj.value) {
										values.push(obj.value);
									}
								});
							}
							console.log(sprintf(format1, typeName, values.join(', ')));
						}
					});
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
