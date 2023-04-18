/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

const e = require('express');


var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	componentUtils = require('./component.js').utils,
	contentUtils = require('./content.js').utils,
	fs = require('fs'),
	fse = require('fs-extra'),
	gulp = require('gulp'),
	os = require('os'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf,
	vsprintf = require('sprintf-js').vsprintf,
	path = require('path'),
	zip = require('gulp-zip');

var console = require('../test/server/logger.js').console;

var projectDir,
	buildDir,
	componentsSrcDir,
	contentSrcDir,
	localizationPoliciesSrcDir,
	templatesSrcDir,
	typesSrcDir,
	wordTemplatesSrcDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	buildDir = serverUtils.getBuildFolder(projectDir);

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	componentsSrcDir = path.join(srcfolder, 'components');
	contentSrcDir = path.join(srcfolder, 'content');
	localizationPoliciesSrcDir = path.join(srcfolder, 'localizationPolicies');
	templatesSrcDir = path.join(srcfolder, 'templates');
	typesSrcDir = path.join(srcfolder, 'types');

	wordTemplatesSrcDir = path.join(srcfolder, 'msword');

	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

var _getRefTypes = function (server, name, refTypes, queriedNames) {
	return new Promise(function (resolve, reject) {
		serverRest.getContentType({ server: server, name: name })
			.then(function (result) {
				var refTypePromises = [];
				if (result && result.id) {
					if (!queriedNames.includes(result.name)) {
						queriedNames.push(result.name);
					}
					var fields = result.fields;
					var types = [];
					var typesToQuery = [];
					for (let i = 0; i < fields.length; i++) {
						if (fields[i].referenceType && fields[i].referenceType.types && fields[i].referenceType.types.length > 0) {
							for (let j = 0; j < fields[i].referenceType.types.length; j++) {
								let refTypeName = fields[i].referenceType.types[j];
								if (!types.includes(refTypeName)) {
									types.push(refTypeName);
								}
								if (!queriedNames.includes(refTypeName)) {
									queriedNames.push(refTypeName);
									typesToQuery.push(refTypeName);
								}
							}
						}
					}
					refTypes.push({ name: name, refs: types });
					typesToQuery.forEach(function (type) {
						refTypePromises.push(_getRefTypes(server, type, refTypes, queriedNames));
					});
				}
				Promise.all(refTypePromises)
					.then(function (result) {
						return resolve({});
					})
			});

	});
};


var _getAllTypes = function (server, types) {
	return new Promise(function (resolve, reject) {
		var refTypes = [];
		var queriedNames = [];
		var doQueryType = types.reduce(function (typePromise, type) {
			return typePromise.then(function (result) {
				if (!queriedNames.includes(type.name)) {
					return _getRefTypes(server, type.name, refTypes, queriedNames)
						.then(function (result) {
							// continue till down
						});
				}
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQueryType.then(function (result) {
			resolve(refTypes);
		});

	});
};

var _getTypesWithName = function (server, names) {
	return new Promise(function (resolve, reject) {
		var typePromises = [];
		names.forEach(function (name) {
			typePromises.push(serverRest.getContentType({ server: server, name: name }));
		});
		Promise.all(typePromises)
			.then(function (results) {
				return resolve(results);
			});
	});
};

/**
 * List all content types on the server
 */
module.exports.listServerContentTypes = function (argv, done) {
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

	var names = argv.names ? argv.names.split(',') : [];
	var repoName = argv.repository;

	var showRef = typeof argv.expand === 'string' && argv.expand.toLowerCase() === 'true';
	var validate = typeof argv.validate === 'string' && argv.validate.toLowerCase() === 'true';

	var types = [];
	var repo;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repoPromises = [];
		if (repoName) {
			repoPromises.push(serverRest.getRepositoryWithName({ server: server, name: repoName, fields: 'contentTypes' }));
		}
		Promise.all(repoPromises)
			.then(function (results) {
				var repoTypeNames = [];
				if (repoName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
					repo = results[0].data;
					if (!repo || !repo.id) {
						console.error('ERROR: repository ' + repoName + ' does not exist');
						return Promise.reject();
					}
					let repoTypes = repo.contentTypes || [];
					repoTypes.forEach(function (type) {
						repoTypeNames.push(type.name);
					});
				}
				var typePromise;
				if (repoName) {
					typePromise = typePromise = _getTypesWithName(server, repoTypeNames);
				} else if (names.length > 0) {
					typePromise = _getTypesWithName(server, names);
				} else {
					typePromise = serverRest.getContentTypes({
						server: server
					});
				}

				return typePromise;
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				types = [];
				if (repoName) {
					for (let i = 0; i < result.length; i++) {
						if (result[i].id) {
							types.push(result[i]);
						}
					}
				}
				if (names.length > 0) {
					if (repo) {
						var repoTypes = [];
						names.forEach(function (name) {
							let type;
							for (let i = 0; i < types.length; i++) {
								if (name === types[i].name) {
									type = types[i];
									break;
								}
							}
							if (!type) {
								console.error('ERROR: type ' + name + ' is not in repository ' + repoName);
							} else {
								repoTypes.push(type);
							}
						});
						if (repoTypes.length === 0) {
							return Promise.reject();
						}
						types = repoTypes;

					} else {
						for (let i = 0; i < result.length; i++) {
							if (result[i].id) {
								types.push(result[i]);
							}
						}
					}

				} else if (!repoName) {
					// all types
					types = result;
				}

				var typeFound = false;
				if (types && types.length > 0) {
					var byName = types.slice(0);
					byName.sort(function (a, b) {
						var x = a.name;
						var y = b.name;
						return (x < y ? -1 : x > y ? 1 : 0);
					});
					types = byName;
					var format = '   %-40s  %-20s';
					var labelShown = false;
					var count = 0;
					for (var i = 0; i < types.length; i++) {
						if (types[i].name !== 'DigitalAsset') {
							if (!labelShown) {
								console.log(sprintf(format, 'Name', 'Type Category'));
								labelShown = true;
							}
							console.log(sprintf(format, types[i].name, types[i].typeCategory));
							typeFound = true;
							count += 1;
						}
					}
					if (count > 0) {
						console.log('Total: ' + count);
					}
				}
				if (!typeFound) {
					if (repo) {
						console.log(' - no content type in repository ' + repoName);
					} else {
						console.log(' - no content type on the server');
					}
				}

				var _saveTypesToFile = function (output, types, dependencies) {
					if (output) {
						var toSave = {
							types: types,
							typeDependency: dependencies || []
						};
						fs.writeFileSync(output, JSON.stringify(toSave, null, 4));
						console.log('');
						console.log(' - type properties saved to ' + output);
					}
				};

				if (validate) {
					types.forEach(function (type) {
						var fields = type.fields;
						var fieldEditors = [];
						for (let i = 0; i < fields.length; i++) {
							let field = fields[i];
							if (field.settings && field.settings.caas && field.settings.caas.editor &&
								field.settings.caas.editor.options && field.settings.caas.editor.options.name &&
								field.settings.caas.editor.isCustom) {
								if (!fieldEditors.includes(field.settings.caas.editor.options.name)) {
									fieldEditors.push(field.settings.caas.editor.options.name);
								}
							}
						}

						for (let i = 0; i < fieldEditors.length; i++) {
							if (!type.properties || !type.properties.customEditors || !type.properties.customEditors.includes(fieldEditors[i])) {
								console.log('ERROR: type ' + type.name + ' custom field editor ' + fieldEditors[i] + ' is not included in properties.customEditors');
							}
						}
					});
				}
				if (showRef) {
					_getAllTypes(server, types)
						.then(function (result) {
							var dependencies = result || [];
							var hasDep = false;
							for (let i = 0; i < dependencies.length; i++) {
								if (dependencies[i].name && dependencies[i].refs.length > 0) {
									hasDep = true;
									break;
								}
							}
							if (hasDep) {
								console.log('');
								console.log('Type dependency hierarchy')
								let format = '   %-40s  %-s';
								console.log(sprintf(format, 'Name', 'Reference Types'));
								dependencies.forEach(function (dep) {
									console.log(sprintf(format, dep.name, dep.refs));
								});
							}

							_saveTypesToFile(output, types, dependencies);
							done(true);
						});
				} else {
					_saveTypesToFile(output, types);
					done(true);
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


module.exports.createRepository = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var repoType = argv.type && argv.type === 'business' ? 'Business' : 'Standard';
	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var desc = argv.description;
	var defaultLanguage = argv.defaultlanguage;

	var channels = [];
	var contentTypes = [];
	var exitCode;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		serverRest.getRepositories({
			server: server
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// get repositories
				var repositories = result || [];
				for (var i = 0; i < repositories.length; i++) {
					if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
						console.log(' - repository ' + name + ' already exists');
						exitCode = 2;
						return Promise.reject();
					}
				}
				console.info(' - verify repository name');

				// get content types
				var typePromises = [];
				for (let i = 0; i < typeNames.length; i++) {
					typePromises.push(serverRest.getContentType({
						server: server,
						name: typeNames[i]
					}));
				}

				return Promise.all(typePromises);
			})
			.then(function (results) {
				for (var i = 0; i < results.length; i++) {
					if (results[i].err) {
						return Promise.reject();
					}
				}
				if (typeNames.length > 0) {
					console.info(' - verify content types');
				}

				// get channels
				var channelPromises = [];
				if (channelNames.length > 0) {
					channelPromises.push(serverRest.getChannels({
						server: server
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
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
						return Promise.reject();
					}
				}
				if (channelNames.length > 0) {
					console.info(' - verify channels');
				}

				for (let i = 0; i < typeNames.length; i++) {
					contentTypes.push({
						name: typeNames[i]
					});
				}

				return serverRest.createRepository({
					server: server,
					name: name,
					description: desc,
					defaultLanguage: defaultLanguage,
					contentTypes: contentTypes,
					channels: channels,
					repositoryType: repoType
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// console.log(result);
				console.log(' - repository ' + name + ' created');

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

module.exports.controlRepository = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var action = argv.action;
	var name = argv.repository;
	var repoNames = argv.repository ? argv.repository.split(',') : [];
	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var taxNames = argv.taxonomies ? argv.taxonomies.split(',') : [];
	var languages = argv.languages ? argv.languages.split(',') : [];
	var connectorNames = argv.translationconnectors ? argv.translationconnectors.split(',') : [];
	var roleNames = argv.editorialroles ? argv.editorialroles.split(',') : [];

	var allRepos = [];
	var allRepoNames = [];
	var channels = [];
	var types = [];
	var taxonomies = [];
	var finalTypeNames = [];
	var finaleChannelNames = [];
	var finalTaxNames = [];
	var connectors = [];
	var finalConnectorNames = [];
	var editorialRoles = [];
	var finalRoleNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var exitCode;
		// Need to get all fields for updating 
		serverRest.getRepositories({
			server: server,
			fields: 'all'
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// get repositories
				var repositories = result || [];
				repoNames.forEach(function (name) {
					var found = false;
					for (var i = 0; i < repositories.length; i++) {
						if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
							var repoType = repositories[i].repositoryType;
							if (repoType && repoType.toLowerCase() === 'business' && (action === 'add-channel' || action === 'remove-channel')) {
								if (action === 'add-channel') {
									console.error('ERROR: repository ' + name + ' is a business repository');
								} else if (action === 'remove-channel') {
									console.error(' - repository ' + name + ' is a business repository');
									exitCode = 2;
								}
							} else {
								allRepos.push(repositories[i]);
								allRepoNames.push(name);
							}
							found = true;
							break;
						}
					}
					if (!found) {
						exitCode = 1;
						console.error('ERROR: repository ' + name + ' does not exist');
					}
				});

				if (allRepos.length === 0) {
					return Promise.reject();
				}
				console.info(' - verify ' + (allRepos.length === 1 ? 'repository' : 'repositories'));

				var typePromises = [];
				for (var i = 0; i < typeNames.length; i++) {
					typePromises.push(serverRest.getContentType({
						server: server,
						name: typeNames[i]
					}));
				}

				return Promise.all(typePromises);
			})
			.then(function (results) {
				var allTypes = results || [];
				for (var i = 0; i < typeNames.length; i++) {
					for (var j = 0; j < allTypes.length; j++) {
						if (allTypes[j].name && typeNames[i].toLowerCase() === allTypes[j].name.toLowerCase()) {
							types.push({
								name: allTypes[j].name
							});
							finalTypeNames.push(typeNames[i]);
							break;
						}
					}
				}
				// console.log(types);

				if (typeNames.length > 0) {
					if (types.length === 0) {
						return Promise.reject();
					}
					console.info(' - verify content types');
				}

				// get channels
				var channelPromises = [];
				if (channelNames.length > 0) {
					channelPromises.push(serverRest.getChannels({
						server: server
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
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
							finaleChannelNames.push(channelNames[i]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: channel ' + channelNames[i] + ' does not exist');
					}
				}
				if (channelNames.length > 0) {
					if (channels.length === 0) {
						return Promise.reject();
					}
					console.info(' - verify channels');
				}

				// get taxonomies
				var taxPromises = [];
				if (taxNames.length > 0) {
					taxPromises.push(serverRest.getTaxonomies({
						server: server,
						fields: 'availableStates'
					}));
				}

				return Promise.all(taxPromises);
			})
			.then(function (results) {
				var allTaxonomies = results.length > 0 ? results[0] : [];
				for (var i = 0; i < taxNames.length; i++) {
					var found = false;
					var foundPromoted = false;
					for (var j = 0; j < allTaxonomies.length; j++) {
						if (taxNames[i].toLowerCase() === allTaxonomies[j].name.toLowerCase()) {
							found = true;
							var availableStates = allTaxonomies[j].availableStates || [];
							availableStates.forEach(function (state) {
								if (state.status === 'promoted') {
									foundPromoted = true;
								}
							});

							if (foundPromoted) {
								taxonomies.push({
									id: allTaxonomies[j].id,
									name: allTaxonomies[j].name,
									shortName: allTaxonomies[j].shortName
								});
								finalTaxNames.push(taxNames[i]);
							}
							break;
						}
					}
					if (!found) {
						console.error('ERROR: taxonomy ' + taxNames[i] + ' does not exist');
						// return Promise.reject();
					} else if (!foundPromoted) {
						console.error('ERROR: taxonomy ' + taxNames[i] + ' does not have promoted version');
						// return Promise.reject();
					}
				}
				if (finalTaxNames.length > 0) {
					console.info(' - verify ' + (finalTaxNames.length > 1 ? 'taxonomies' : 'taxonomy'));
				} else if (taxNames.length > 0) {
					return Promise.reject();
				}

				// get translation connectors
				var connectorPromises = [];
				for (let i = 0; i < connectorNames.length; i++) {
					connectorPromises.push(serverRest.getTranslationConnector({
						server: server,
						name: connectorNames[i],
						fields: 'all'
					}));
				}

				return Promise.all(connectorPromises);

			})
			.then(function (results) {

				var allConnectors = results || [];
				connectorNames.forEach(function (connectorName) {
					var connectorExist = false;
					for (var i = 0; i < allConnectors.length; i++) {
						var connector = allConnectors[i];
						if (connector && connector.connectorId && connector.connectorName === connectorName) {
							connectors.push({
								connectorId: connector.connectorId
							});
							finalConnectorNames.push(connector.connectorName);
							connectorExist = true;
							break;
						}
					}
					if (!connectorExist) {
						console.error('ERROR: translation connector ' + connectorName + ' does not exist or is not enabled');
					}
				});
				if (connectorNames.length > 0) {
					if (finalConnectorNames.length > 0) {
						console.info(' - verify translation connector' + (finalConnectorNames.length > 1 ? 's' : ''));
					} else {
						return Promise.reject();
					}
				}

				// get editorial roles
				var rolePromises = [];
				for (var i = 0; i < roleNames.length; i++) {
					rolePromises.push(serverRest.getEditorialRoleWithName({
						server: server,
						name: roleNames[i]
					}));
				}

				return Promise.all(rolePromises);

			})
			.then(function (results) {

				if (roleNames.length > 0) {
					var allRoles = results || [];
					roleNames.forEach(function (name) {
						var roleExist = false;
						for (var i = 0; i < allRoles.length; i++) {
							var role = allRoles[i] && allRoles[i].data;
							if (role && role.name && role.name.toLowerCase() === name.toLowerCase()) {
								editorialRoles.push({
									id: role.id,
									name: role.name
								});
								finalRoleNames.push(name);
								roleExist = true;
								break;
							}
						}
						if (!roleExist) {
							console.error('ERROR: editorial role ' + name + ' does not exist');
						}
					});
					if (finalRoleNames.length > 0) {
						console.info(' - verify editorial role' + (finalRoleNames.length > 1 ? 's' : ''));
					} else {
						return Promise.reject();
					}
				}

				return _controlRepositories(server, allRepos, action, types, finalTypeNames,
					channels, finaleChannelNames, taxonomies, finalTaxNames, languages,
					connectors, finalConnectorNames, editorialRoles, finalRoleNames);

			})
			.then(function (result) {
				if (result && result.err) {
					done();
				} else {
					done(true);
				}
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done(exitCode);
			});
	});
};

var _controlRepositories = function (server, repositories, action, types, typeNames,
	channels, channelNames, taxonomies, taxonomyNames, languages,
	connectors, connectorNames, editorialRoles, roleNames) {
	return new Promise(function (resolve, reject) {
		var err;
		var doUpdateRepos = repositories.reduce(function (updatePromise, repository) {
			var name = repository.name;

			return updatePromise.then(function (result) {
				var finalTypes = repository.contentTypes;
				var finalChannels = repository.channels;
				var finalTaxonomies = repository.taxonomies;
				var finalLanguages = repository.languageOptions;
				var finalConnectors = repository.connectors;
				var finalEditorialRoles = repository.editorialRoles;
				var idx;
				var i, j;

				if (action === 'add-type') {
					finalTypes = finalTypes.concat(types);
				} else if (action === 'remove-type') {
					for (i = 0; i < typeNames.length; i++) {
						idx = undefined;
						for (j = 0; j < finalTypes.length; j++) {
							if (typeNames[i].toLowerCase() === finalTypes[j].name.toLowerCase()) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalTypes.splice(idx, 1);
						}
					}
				} else if (action === 'add-channel') {
					finalChannels = finalChannels.concat(channels);
				} else if (action === 'remove-channel') {
					for (i = 0; i < channels.length; i++) {
						idx = undefined;
						for (j = 0; j < finalChannels.length; j++) {
							if (channels[i].id === finalChannels[j].id) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalChannels.splice(idx, 1);
						}
					}
				} else if (action === 'add-taxonomy') {

					finalTaxonomies = finalTaxonomies.concat(taxonomies);

				} else if (action === 'remove-taxonomy') {
					for (i = 0; i < taxonomies.length; i++) {
						idx = undefined;
						for (j = 0; j < finalTaxonomies.length; j++) {
							if (taxonomies[i].id === finalTaxonomies[j].id) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalTaxonomies.splice(idx, 1);
						}
					}
				} else if (action === 'add-language') {
					finalLanguages = finalLanguages.concat(languages);
				} else if (action === 'remove-language') {
					for (i = 0; i < languages.length; i++) {
						idx = undefined;
						for (j = 0; j < finalLanguages.length; j++) {
							if (languages[i] === finalLanguages[j]) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalLanguages.splice(idx, 1);
						}
					}
				} else if (action === 'add-translation-connector') {
					finalConnectors = finalConnectors.concat(connectors);
				} else if (action === 'remove-translation-connector') {
					for (i = 0; i < connectors.length; i++) {
						idx = undefined;
						for (j = 0; j < finalConnectors.length; j++) {
							if (connectors[i].connectorId === finalConnectors[j].connectorId) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalConnectors.splice(idx, 1);
						}
					}
				} else if (action === 'add-role') {
					finalEditorialRoles = finalEditorialRoles.concat(editorialRoles);
				} else if (action === 'remove-role') {
					for (i = 0; i < editorialRoles.length; i++) {
						idx = undefined;
						for (j = 0; j < finalEditorialRoles.length; j++) {
							if (editorialRoles[i].id === finalEditorialRoles[j].id) {
								idx = j;
								break;
							}
						}
						if (idx !== undefined) {
							finalEditorialRoles.splice(idx, 1);
						}
					}
				} else if (action === 'enable-not-ready') {

					repository.notReadyEnabled = true;

				} else if (action === 'disable-not-ready') {

					repository.notReadyEnabled = false;

				}
				else {
					console.error('ERROR: invalid action ' + action);
				}

				return serverRest.updateRepository({
					server: server,
					repository: repository,
					contentTypes: finalTypes,
					channels: finalChannels,
					taxonomies: finalTaxonomies,
					languages: finalLanguages,
					connectors: finalConnectors,
					editorialRoles: finalEditorialRoles
				}).then(function (result) {

					if (result.err) {
						err = 'err';
					} else {
						// console.log(result);
						if (action === 'add-type') {
							console.log(' - added type ' + typeNames + ' to repository ' + name);
						} else if (action === 'remove-type') {
							console.log(' - removed type ' + typeNames + ' from repository ' + name);
						} else if (action === 'add-channel') {
							console.log(' - added channel ' + channelNames + ' to repository ' + name);
						} else if (action === 'remove-channel') {
							console.log(' - removed channel ' + channelNames + ' from repository ' + name);
						} else if (action === 'add-taxonomy') {
							console.log(' - added taxonomy ' + taxonomyNames + ' to repository ' + name);
						} else if (action === 'remove-taxonomy') {
							console.log(' - removed taxonomy ' + taxonomyNames + ' from repository ' + name);
						} else if (action === 'add-language') {
							console.log(' - added language ' + languages + ' to repository ' + name);
						} else if (action === 'remove-language') {
							console.log(' - removed language ' + languages + ' from repository ' + name);
						} else if (action === 'add-translation-connector') {
							console.log(' - added translation connector ' + connectorNames + ' to repository ' + name);
						} else if (action === 'remove-translation-connector') {
							console.log(' - removed translation connector ' + connectorNames + ' from repository ' + name);
						} else if (action === 'add-role') {
							console.log(' - added editorial role ' + roleNames + ' to repository ' + name);
						} else if (action === 'remove-role') {
							console.log(' - removed editorial-role ' + roleNames + ' from repository ' + name);
						} else if (action === 'enable-not-ready') {
							console.log(' - enable not ready for use assets in repository ' + name);
						} else if (action === 'disable-not-ready') {
							console.log(' - disable not ready for use assets in repository ' + name);
						}

					}
				});

			});
		},
			Promise.resolve({})
		);

		doUpdateRepos.then(function (result) {
			if (err) {
				resolve({
					err: 'err'
				});
			} else {
				resolve({});
			}
		});
	});
};


module.exports.shareRepository = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;
	var shareTypes = typeof argv.types === 'string' && argv.types.toLowerCase() === 'true';
	var typeRole = argv.typerole || role;

	var repository;
	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];
	var typeNames = [];
	var usersToGrant = [];
	var groupsToGrant = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getRepositories({
			server: server,
			fields: 'contentTypes'
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// get repositories
				var repositories = result || [];
				for (var i = 0; i < repositories.length; i++) {
					if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
						repository = repositories[i];
						break;
					}
				}
				if (!repository) {
					console.error('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify repository');

				if (repository.contentTypes) {
					for (let i = 0; i < repository.contentTypes.length; i++) {
						if (!['Image', 'File', 'Video'].includes(repository.contentTypes[i].name)) {
							typeNames.push(repository.contentTypes[i].name);
						}
					}
				}
				if (shareTypes) {
					if (typeNames.length === 0) {
						console.info(' - no content types in the repository');
					} else {
						console.info(' - repository includes content type ' + typeNames.join(', '));
					}
				}

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
							// return Promise.reject();
						}
					}
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
					var found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName && allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.getResourcePermissions({
					server: server,
					id: repository.id,
					type: 'repository'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var existingPermissions = result && result.permissions || [];
				// console.log(existingPermissions);

				for (var i = 0; i < groups.length; i++) {
					var groupGranted = false;
					for (var j = 0; j < existingPermissions.length; j++) {
						var perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'group' &&
							perm.groupType === groups[i].groupOriginType && perm.fullName === groups[i].name) {
							groupGranted = true;
							break;
						}
					}
					if (groupGranted) {
						console.log(' - group ' + groups[i].name + ' already granted with role ' + role + ' on repository ' + name);
					} else {
						groupsToGrant.push(groups[i]);
						goodGroupNames.push(groups[i].name);
					}
				}

				for (let i = 0; i < users.length; i++) {
					var granted = false;
					for (let j = 0; j < existingPermissions.length; j++) {
						let perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'user' && perm.id === users[i].loginName) {
							granted = true;
							break;
						}
					}
					if (granted) {
						console.log(' - user ' + users[i].loginName + ' already granted with role ' + role + ' on repository ' + name);
					} else {
						usersToGrant.push(users[i]);
						goodUserName.push(users[i].loginName);
					}
				}

				// Role is not a default role. Get the role Id.
				if (['manager', 'contributor', 'viewer'].indexOf(role) === -1) {
					return serverRest.getEditorialRoleWithName({
						server: server,
						name: role
					});
				} else {
					return Promise.resolve();
				}
			})
			.then(function (roleResult) {
				var roleId;
				if (roleResult) {
					roleId = roleResult.data && roleResult.data.id;
					if (!roleId) {
						console.error(`ERROR: role ${role} not found`);
						return Promise.reject();
					}
				}
				return serverRest.performPermissionOperation({
					server: server,
					operation: 'share',
					resourceId: repository.id,
					resourceType: 'repository',
					role: role,
					roleId: roleId,
					users: usersToGrant,
					groups: groupsToGrant
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (goodUserName.length > 0) {
					console.log(' - user ' + (goodUserName.join(', ')) + ' granted with role ' + role + ' on repository ' + name);
				}

				if (goodGroupNames.length > 0) {
					console.log(' - group ' + (goodGroupNames.join(', ')) + ' granted with role ' + role + ' on repository ' + name);
				}

				if (shareTypes && typeNames.length > 0) {
					var goodTypeNames = [];
					var typePromises = [];
					for (var i = 0; i < typeNames.length; i++) {
						typePromises.push(serverRest.getContentType({
							server: server,
							name: typeNames[i]
						}));
					}
					var success = true;

					Promise.all(typePromises).then(function (results) {
						for (var i = 0; i < results.length; i++) {
							if (results[i].id) {
								goodTypeNames.push(results[i].name);
							}
						}

						if (goodTypeNames.length === 0) {
							return Promise.reject();
						}

						var typePermissionPromises = [];
						for (let i = 0; i < goodTypeNames.length; i++) {
							typePermissionPromises.push(serverRest.getResourcePermissions({
								server: server,
								id: goodTypeNames[i],
								type: 'type'
							}));
						}

						Promise.all(typePermissionPromises)
							.then(function (results) {
								var shareTypePromises = [];

								for (var i = 0; i < results.length; i++) {
									var resource = results[i].resource;
									var perms = results[i] && results[i].permissions || [];
									var typeUsersToGrant = [];
									var typeGroupsToGrant = [];

									groups.forEach(function (group) {
										var granted = false;
										for (var j = 0; j < perms.length; j++) {
											if (perms[j].roleName === typeRole && perms[j].fullName === group.name &&
												perms[j].type === 'group' && perms[j].groupType === group.groupOriginType) {
												granted = true;
												break;
											}
										}
										if (granted) {
											console.log(' - group ' + group.name + ' already granted with role ' + typeRole + ' on type ' + resource);
										} else {
											typeGroupsToGrant.push(group);
										}
									});

									users.forEach(function (user) {
										var granted = false;
										for (var j = 0; j < perms.length; j++) {
											if (perms[j].roleName === typeRole && perms[j].type === 'user' && perms[j].id === user.loginName) {
												granted = true;
												break;
											}
										}
										if (granted) {
											console.log(' - user ' + user.loginName + ' already granted with role ' + typeRole + ' on type ' + resource);
										} else {
											typeUsersToGrant.push(user);
										}
									});

									shareTypePromises.push(serverRest.performPermissionOperation({
										server: server,
										operation: 'share',
										resourceName: resource,
										resourceType: 'type',
										role: typeRole,
										users: typeUsersToGrant,
										groups: typeGroupsToGrant
									}));
								}

								return Promise.all(shareTypePromises);
							})
							.then(function (results) {

								for (var i = 0; i < results.length; i++) {
									if (results[i].operations) {
										var obj = results[i].operations.share;
										var resourceName = obj.resource && obj.resource.name;
										var grants = obj.roles && obj.roles[0] && obj.roles[0].users || [];
										var userNames = [];
										var groupNames = [];
										grants.forEach(function (grant) {
											if (grant.type === 'group') {
												groupNames.push(grant.name);
											} else {
												userNames.push(grant.name);
											}
										});
										if (userNames.length > 0 || groupNames.length > 0) {
											var msg = ' -';
											if (userNames.length > 0) {
												msg = msg + ' user ' + userNames.join(', ');
											}
											if (groupNames.length > 0) {
												msg = msg + ' group ' + groupNames.join(', ');
											}
											msg = msg + ' granted with role ' + typeRole + ' on type ' + resourceName;
											console.log(msg);
										}
									}
								}

								done(true);

							});
					})
						.catch((error) => {
							done(success);
						});
				} else {
					done(true);
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


module.exports.unShareRepository = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var unshareTypes = typeof argv.types === 'string' && argv.types.toLowerCase() === 'true';

	var repository;
	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];
	var typeNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getRepositories({
			server: server,
			fields: 'contentTypes'
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// get repositories
				var repositories = result || [];
				for (var i = 0; i < repositories.length; i++) {
					if (name.toLowerCase() === repositories[i].name.toLowerCase()) {
						repository = repositories[i];
						break;
					}
				}
				if (!repository) {
					console.error('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify repository');

				if (repository.contentTypes) {
					for (let i = 0; i < repository.contentTypes.length; i++) {
						typeNames.push(repository.contentTypes[i].name);
					}
				}
				if (unshareTypes) {
					if (typeNames.length === 0) {
						console.info(' - no content types in the repository');
					} else {
						console.info(' - repository includes content type ' + typeNames.join(', '));
					}
				}

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
								goodGroupNames.push(groupNames[i]);
								break;
							}
						}
						if (!found) {
							console.error('ERROR: group ' + groupNames[i] + ' does not exist');
							// return Promise.reject();
						}
					}
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
					var found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
							users.push(allUsers[i]);
							goodUserName.push(userNames[k]);
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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'unshare',
					resourceId: repository.id,
					resourceType: 'repository',
					users: users,
					groups: groups
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (goodUserName.length > 0) {
					console.log(' - the access of user ' + (goodUserName.join(', ')) + ' to repository ' + name + ' removed');
				}
				if (goodGroupNames.length > 0) {
					console.log(' - the access of group ' + (goodGroupNames.join(', ')) + ' to repository ' + name + ' removed');
				}

				if (unshareTypes && typeNames.length > 0) {
					var typePromises = [];
					for (var i = 0; i < typeNames.length; i++) {
						typePromises.push(serverRest.getContentType({
							server: server,
							name: typeNames[i]
						}));
					}
					Promise.all(typePromises).then(function (results) {
						var shareTypePromises = [];
						for (var i = 0; i < results.length; i++) {
							if (results[i].id) {
								shareTypePromises.push(serverRest.performPermissionOperation({
									server: server,
									operation: 'unshare',
									resourceName: results[i].name,
									resourceType: 'type',
									users: users,
									groups: groups
								}));
							}
						}
						return Promise.all(shareTypePromises);
					})
						.then(function (results) {
							var unsharedTypes = [];
							for (var i = 0; i < results.length; i++) {
								var obj = results[i].operations.unshare;
								if (obj.resource && obj.resource.name) {
									unsharedTypes.push(obj.resource.name);
								}
							}
							if (unsharedTypes.length > 0) {
								if (goodUserName.length > 0) {
									console.log(' - the access of user ' + (goodUserName.join(', ')) + ' to type ' + unsharedTypes.join(', ') + ' removed');
								}
								if (goodGroupNames.length > 0) {
									console.log(' - the access of group ' + (goodGroupNames.join(', ')) + ' to type ' + unsharedTypes.join(', ') + ' removed');
								}
							}
							done(true);
						});
				} else {
					done(true);
				}
			})
			.catch((error) => {
				done();
			});
	});
};

module.exports.describeRepository = function (argv, done) {
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

	var name = argv.name;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var repo;
		var channels = [];
		var taxonomies = [];

		// need all fields, otherwise channel language not returned
		serverRest.getRepositoryWithName({
			server: server,
			name: name,
			fields: 'all'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repo = result.data;
				// console.log(repo);
				if (!repo || !repo.id) {
					console.error('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}

				if (output) {
					fs.writeFileSync(output, JSON.stringify(repo, null, 4));
					console.log(' - repository properties saved to ' + output);
				}

				var channelPromises = [];
				if (repo.channels && repo.channels.length > 0) {
					repo.channels.forEach(function (channel) {
						channelPromises.push(serverRest.getChannel({
							server: server,
							id: channel.id
						}));
					});
				}

				return Promise.all(channelPromises);

			})
			.then(function (results) {

				channels = results || [];

				var taxonomyPromises = [];

				if (repo.taxonomies && repo.taxonomies.length > 0) {
					repo.taxonomies.forEach(function (tax) {
						taxonomyPromises.push(serverRest.getTaxonomy({
							server: server,
							id: tax.id
						}));
					});
				}

				return Promise.all(taxonomyPromises);

			})
			.then(function (results) {
				var taxonomies = results || [];
				var taxNames = [];
				taxonomies.forEach(function (tax) {
					if (tax && tax.id && tax.name) {
						taxNames.push(tax.name);
					}
				});

				var channelNames = [];
				channels.forEach(function (channel) {
					if (channel && channel.id && channel.name) {
						channelNames.push(channel.name);
					}
				});

				var assetTypes = [];
				if (repo.contentTypes && repo.contentTypes.length > 0) {
					repo.contentTypes.forEach(function (type) {
						assetTypes.push(type.displayName || type.name);
					});
				}

				var editorialRoles = [];
				if (repo.editorialRoles && repo.editorialRoles.length > 0) {
					repo.editorialRoles.forEach(function (role) {
						editorialRoles.push(role.name);
					});
				}

				var format1 = '%-38s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', repo.id));
				console.log(sprintf(format1, 'Name', repo.name));
				console.log(sprintf(format1, 'Description', repo.description || ''));
				console.log(sprintf(format1, 'Created', repo.createdDate.value + ' by ' + repo.createdBy));
				console.log(sprintf(format1, 'Updated', repo.updatedDate.value + ' by ' + repo.updatedBy));
				console.log(sprintf(format1, 'Asset types', assetTypes.sort()));
				console.log(sprintf(format1, 'Publishing channels', channelNames.sort()));
				console.log(sprintf(format1, 'Taxonomies', taxNames.sort()));
				console.log(sprintf(format1, 'Default language', repo.defaultLanguage));
				console.log(sprintf(format1, 'Channel languages', repo.configuredLanguages));
				console.log(sprintf(format1, 'Additional languages', repo.languageOptions));
				console.log(sprintf(format1, 'Editorial roles', editorialRoles));
				console.log('');

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


module.exports.shareType = function (argv, done) {
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

	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;

	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.info(' - verify type');

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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.getResourcePermissions({
					server: server,
					id: name,
					type: 'type'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var existingPermissions = result && result.permissions || [];
				var i, j;
				var groupsToGrant = [];
				for (i = 0; i < groups.length; i++) {
					var groupGranted = false;
					for (j = 0; j < existingPermissions.length; j++) {
						var perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'group' &&
							perm.groupType === groups[i].groupOriginType && perm.fullName === groups[i].name) {
							groupGranted = true;
							break;
						}
					}
					if (groupGranted) {
						console.log(' - group ' + groups[i].name + ' already granted with role ' + role + ' on type ' + name);
					} else {
						groupsToGrant.push(groups[i]);
						goodGroupNames.push(groups[i].name);
					}
				}

				var usersToGrant = [];
				for (i = 0; i < users.length; i++) {
					var granted = false;
					for (j = 0; j < existingPermissions.length; j++) {
						let perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'user' && perm.id === users[i].loginName) {
							granted = true;
							break;
						}
					}
					if (granted) {
						console.log(' - user ' + users[i].loginName + ' already granted with role ' + role + ' on type ' + name);
					} else {
						usersToGrant.push(users[i]);
						goodUserName.push(users[i].loginName);
					}
				}

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'share',
					resourceName: name,
					resourceType: 'type',
					role: role,
					users: usersToGrant,
					groups: groupsToGrant
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				if (goodUserName.length > 0) {
					console.log(' - user ' + (goodUserName.join(', ')) + ' granted with role ' + role + ' on type ' + name);
				}
				if (goodGroupNames.length > 0) {
					console.log(' - group ' + (goodGroupNames.join(', ')) + ' granted with role ' + role + ' on type ' + name);
				}
				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

module.exports.unshareType = function (argv, done) {
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

	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];

	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

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
								goodGroupNames.push(groupNames[i]);
								break;
							}
						}
						if (!found) {
							console.error('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
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
					var found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
							users.push(allUsers[i]);
							goodUserName.push(userNames[k]);
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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'unshare',
					resourceName: name,
					resourceType: 'type',
					users: users,
					groups: groups
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (goodUserName.length > 0) {
					console.log(' - the access of user ' + (goodUserName.join(', ')) + ' to type ' + name + ' removed');
				}
				if (goodGroupNames.length > 0) {
					console.log(' - the access of group ' + (goodGroupNames.join(', ')) + ' to type ' + name + ' removed');
				}
				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

module.exports.downloadType = function (argv, done) {
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

	var names = argv.name.split(',');
	var goodNames = [];
	var types = [];

	var customEditors = [];
	var customForms = [];
	var contentLayouts = [];
	var comps = [];

	var excludeComponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var typepromises = [];
		names.forEach(function (name) {
			typepromises.push(serverRest.getContentType({
				server: server,
				name: name,
				expand: 'all'
			}));
		});

		Promise.all(typepromises)
			.then(function (results) {
				var allTypes = results || [];

				for (var i = 0; i < names.length; i++) {
					var found = false;
					for (var j = 0; j < allTypes.length; j++) {
						if (names[i] === allTypes[j].name && !goodNames.includes(names[i])) {
							found = true;
							goodNames.push(names[i]);
							types.push(allTypes[j]);
							break;
						}
					}
				}

				if (types.length === 0) {
					return Promise.reject();
				}

				// save types to local
				if (!fs.existsSync(typesSrcDir)) {
					fs.mkdirSync(typesSrcDir);
				}

				types.forEach(function (typeObj) {
					var folderPath = path.join(typesSrcDir, typeObj.name);
					if (!fs.existsSync(folderPath)) {
						fs.mkdirSync(folderPath);
					}

					var filePath = path.join(folderPath, typeObj.name + '.json');
					fs.writeFileSync(filePath, JSON.stringify(typeObj, null, 4));

					console.log(' - save type ' + filePath);

					if (!excludeComponents) {
						var typeCustomEditors = typeObj.properties && typeObj.properties.customEditors || [];
						for (var i = 0; i < typeCustomEditors.length; i++) {
							if (!customEditors.includes(typeCustomEditors[i])) {
								customEditors.push(typeCustomEditors[i]);
								comps.push(typeCustomEditors[i]);
							}
						}
						var typeCustomForms = typeObj.properties && typeObj.properties.customForms || [];
						for (let i = 0; i < typeCustomForms.length; i++) {
							if (!customForms.includes(typeCustomForms[i])) {
								customForms.push(typeCustomForms[i]);
								comps.push(typeCustomForms[i]);
							}
						}

						var typeContentLayouts = serverUtils.getTypeContentLayouts(typeObj);
						for (let i = 0; i < typeContentLayouts.length; i++) {
							if (!contentLayouts.includes(typeContentLayouts[i])) {
								contentLayouts.push(typeContentLayouts[i]);
								comps.push(typeContentLayouts[i]);
							}
						}
					}

				});

				if (customEditors.length > 0) {
					console.info(' - will download content field editor ' + customEditors.join(', '));
				}
				if (customForms.length > 0) {
					console.info(' - will download content form ' + customForms.join(', '));
				}
				if (contentLayouts.length > 0) {
					console.info(' - will download content layout ' + contentLayouts.join(', '));
				}

				if (comps.length === 0) {
					done(true);
				} else {
					var noMsg = console.showInfo() ? false : true;
					componentUtils.downloadComponents(server, comps, argv, noMsg)
						.then(function (result) {
							done(result.err ? false : true);
						});
				}

			})
			.catch((error) => {
				done();
			});
	});

};


module.exports.uploadType = function (argv, done) {
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

	console.info(' - server: ' + server.url);

	var isFile = typeof argv.file === 'string' && argv.file.toLowerCase() === 'true';
	var allNames = argv.name.split(',');
	var names = [];
	var typePaths = [];
	var comps = [];
	var customEditors = [];
	var customForms = [];
	var contentLayouts = [];

	var excludeComponents = typeof argv.excludecomponents === 'string' && argv.excludecomponents.toLowerCase() === 'true';

	// varify the types on local
	allNames.forEach(function (name) {
		var filePath;
		if (isFile) {
			filePath = name;

			if (!path.isAbsolute(filePath)) {
				filePath = path.join(projectDir, filePath);
			}
			filePath = path.resolve(filePath);

			if (!fs.existsSync(filePath)) {
				console.error('ERROR: file ' + filePath + ' does not exist');
			} else {
				var typeObj;
				try {
					typeObj = JSON.parse(fs.readFileSync(filePath));
				} catch (e) {
					// handle invalid json
				}
				if (!typeObj || !typeObj.id || !typeObj.name || !typeObj.typeCategory) {
					console.error('ERROR: file ' + filePath + ' is not a valid type definition');
				} else {
					if (!names.includes(typeObj.name)) {
						names.push(typeObj.name);
						typePaths.push(filePath);
					}
				}
			}

		} else {
			filePath = path.join(typesSrcDir, name, name + '.json');
			if (!fs.existsSync(filePath)) {
				console.error('ERROR: type ' + name + ' does not exist');
			} else if (!names.includes(name)) {
				names.push(name);
				typePaths.push(filePath);
			}
		}

	});

	if (names.length === 0) {
		// no type to upload
		done();
		return;
	}

	// get all editors and content forms in the type files
	if (!excludeComponents) {
		typePaths.forEach(function (filePath) {
			var i;
			var typeObj = JSON.parse(fs.readFileSync(filePath));

			var typeCustomEditors = typeObj.properties && typeObj.properties.customEditors || [];
			for (i = 0; i < typeCustomEditors.length; i++) {
				if (!customEditors.includes(typeCustomEditors[i])) {
					customEditors.push(typeCustomEditors[i]);
					comps.push(typeCustomEditors[i]);
				}
			}
			var typeCustomForms = typeObj.properties && typeObj.properties.customForms || [];
			for (i = 0; i < typeCustomForms.length; i++) {
				if (!customForms.includes(typeCustomForms[i])) {
					customForms.push(typeCustomForms[i]);
					comps.push(typeCustomForms[i]);
				}
			}

			var typeContentLayouts = serverUtils.getTypeContentLayouts(typeObj);
			for (i = 0; i < typeContentLayouts.length; i++) {
				if (!contentLayouts.includes(typeContentLayouts[i])) {
					contentLayouts.push(typeContentLayouts[i]);
					comps.push(typeContentLayouts[i]);
				}
			}
		});
	}

	var typesToCreate = [];
	var typeNamesToCreate = [];
	var typesToUpdate = [];
	var typeNamesToUpdate = [];

	var hasError = false;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		if (customEditors.length > 0) {
			console.info(' - will upload content field editor ' + customEditors.join(', '));
		}
		if (customForms.length > 0) {
			console.info(' - will upload content form ' + customForms.join(', '));
		}
		if (contentLayouts.length > 0) {
			console.info(' - will upload content layout ' + contentLayouts.join(', '));
		}

		_uploadTypeComponents(server, comps)
			.then(function (result) {

				var typepromises = [];
				names.forEach(function (name) {
					typepromises.push(serverRest.getContentType({
						server: server,
						name: name,
						showError: false
					}));
				});

				return Promise.all(typepromises);
			})
			.then(function (results) {
				var allTypes = results || [];

				for (var i = 0; i < names.length; i++) {
					var found = false;
					for (var j = 0; j < allTypes.length; j++) {
						if (names[i] === allTypes[j].name) {
							found = true;
							break;
						}
					}
					if (found) {
						typeNamesToUpdate.push(names[i]);
						typesToUpdate.push(typePaths[i]);
					} else {
						typeNamesToCreate.push(names[i]);
						typesToCreate.push(typePaths[i]);
					}
				}

				if (typesToCreate.length > 0) {
					console.info(' - will create type ' + typeNamesToCreate.join(', '));
				}
				if (typesToUpdate.length > 0) {
					console.info(' - will update type ' + typeNamesToUpdate.join(', '));
				}

				return _createContentTypes(server, typesToCreate);
			})
			.then(function (results) {
				// console.log(results);
				var createdTypes = results || [];
				createdTypes.forEach(function (createdType) {
					if (createdType.id) {
						console.log(' - type ' + createdType.name + ' created');
					}
					if (createdType.err) {
						hasError = true;
					}
				});

				var updateTypePromises = [];
				typesToUpdate.forEach(function (filePath) {
					var typeObj;
					try {
						typeObj = JSON.parse(fs.readFileSync(filePath));
					} catch (e) {
						console.log(e);
					}
					if (typeObj && typeObj.name) {
						updateTypePromises.push(serverRest.updateContentType({
							server: server,
							type: typeObj
						}));
					}
				});

				return Promise.all(updateTypePromises);
			})
			.then(function (results) {
				var updatedTypes = results || [];
				updatedTypes.forEach(function (updatedType) {
					if (updatedType.id) {
						console.log(' - type ' + updatedType.name + ' updated');
					}
					if (updatedType.err) {
						hasError = true;
					}
				});

				done(!hasError);
			})
			.catch((error) => {
				done();
			});
	});

};

var _uploadTypeComponents = function (server, allcomps) {
	var comps = [];
	allcomps.forEach(function (comp) {
		if (fs.existsSync(path.join(componentsSrcDir, comp))) {
			comps.push(comp);
		} else {
			console.error('ERROR: component ' + comp + ' does not exist');
		}
	});

	return new Promise(function (resolve, reject) {
		if (comps.length === 0) {
			return resolve({});
		} else {
			var argv = {
				projectDir: projectDir,
				component: comps.join(','),
				noOptimize: true
			};
			componentUtils.exportComponents(argv)
				.then(function (result) {
					var folder = 'Home';
					var folderId = 'self';
					var publish = true;

					var doUploadComp = comps.reduce(function (compPromise, comp) {
						return compPromise.then(function (result) {
							var name = comp;
							var zipfile = path.join(projectDir, "dist", name) + ".zip";
							var noMsg = console.showInfo() ? false : true;
							return componentUtils.uploadComponent(server, folder, folderId, zipfile, name, publish, noMsg)
								.then(function (result) {
									if (result && result.fileId) {
										// delete the zip file
										return serverRest.deleteFile({
											server: server,
											fFileGUID: result.fileId
										}).then(function (result) {
											// done
										});
									}

								});
						});
					},
						// Start with a previousPromise value that is a resolved promise 
						Promise.resolve({}));

					doUploadComp.then(function (result) {
						resolve({});
					});
				})
				.catch((error) => {
					resolve({
						err: 'err'
					});
				});
		}
	});
};

var _createContentTypes = function (server, typePaths) {
	return new Promise(function (resolve, reject) {
		var results = [];
		var doCreateType = typePaths.reduce(function (typePromise, filePath) {
			return typePromise.then(function (result) {
				var typeObj;
				try {
					typeObj = JSON.parse(fs.readFileSync(filePath));
				} catch (e) {
					console.log(e);
				}

				return serverRest.createContentType({
					server: server,
					type: typeObj
				}).then(function (result) {
					results.push(result);
				});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doCreateType.then(function (result) {
			resolve(results);
		});

	});
};

module.exports.copyType = function (argv, done) {
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

	var srcTypeName = argv.source;
	var name = argv.name;
	var displayName = argv.displayname || name;
	var description = argv.description ? argv.description : '';

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: srcTypeName,
			expand: 'all'
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				console.info(' - validate type ' + srcTypeName);
				var typeObj = result;
				typeObj.name = name;
				typeObj.displayName = displayName;
				typeObj.description = description;

				return serverRest.createContentType({
					server: server,
					type: typeObj
				});

			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				console.log(' - type copied (name: ' + result.name + ' display name: ' + result.displayName + ' typeCategory: ' + result.typeCategory + ')');
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

module.exports.describeType = function (argv, done) {
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

	var showRef = typeof argv.expand === 'string' && argv.expand.toLowerCase() === 'true';
	var name = argv.name;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
			server: server,
			name: name,
			expand: 'all'
		})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				var type = result;
				// console.log(JSON.stringify(type, null, 4));

				var allowSlug = type.properties.caas && type.properties.caas.slug && type.properties.caas.slug.enabled;
				var allowForwardSlash = type.properties.caas && type.properties.caas.slug && type.properties.caas.slug['allow-forward-slash'];

				var format1 = '%-38s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', type.id));
				console.log(sprintf(format1, 'Name', type.name));
				console.log(sprintf(format1, 'Description', type.description || ''));
				console.log(sprintf(format1, 'Category', type.typeCategory));
				console.log(sprintf(format1, 'Created', type.createdDate.value + ' by ' + type.createdBy));
				console.log(sprintf(format1, 'Updated', type.updatedDate.value + ' by ' + type.updatedBy));
				console.log(sprintf(format1, 'Enable friendly item name for URL', allowSlug ? '√' : ''));
				if (allowSlug) {
					console.log(sprintf(format1, 'Allow forwad slash', allowForwardSlash ? '√' : ''));
				}
				if (allowSlug) {
					console.log(sprintf(format1, 'Slug pattern', type.properties.caas.slug.pattern));
				}

				// fileds
				console.log(sprintf(format1, 'Definition', ''));
				var groups = type.properties.groups || [
					{
						title: 'Content Item Data Fields',
						collapse: false
					}
				];
				for (let i = 0; i < groups.length; i++) {
					var group = groups[i];
					var groupAttr = group.hidden ? 'Hidden' : (group.collapse ? 'Collapsed by default' : 'Expanded by default');
					console.log(sprintf('  %-s', group.title + ' (' + groupAttr + ')'));

					var fieldFormat = '    %-20s  %-40s  %-8s %-8s %-9s %-11s  %-30s %-s';
					console.log(sprintf(fieldFormat, 'Type', 'Name', 'Required', 'Multiple', 'Do not', 'Inherit', 'Reference types', 'Custom FieldEditor'));
					console.log(sprintf(fieldFormat, '', '', '', '', 'translate', 'from master', '', ''));
					type.fields.forEach(function (field) {
						if (field.settings && (!field.settings.hasOwnProperty('groupIndex') || field.settings.groupIndex === i)) {
							let required = field.required ? '   √' : '';
							let multiple = field.valuecount === 'list' ? '   √' : '';
							let translation = field.properties && field.properties['caas-translation'] || {};
							let notranslate = translation.hasOwnProperty('translate') && !translation.translate ? '   √' : '';
							let inheritFromMaster = translation.hasOwnProperty('inheritFromMaster') && translation.inheritFromMaster ? '   √' : '';
							let refTypes = field.hasOwnProperty('referenceType') ? (field.referenceType.type ? field.referenceType.types : 'DigitalAsset') : '';
							let fieldEditor = '';
							if (field.settings && field.settings.caas && field.settings.caas.editor &&
								field.settings.caas.editor.options && field.settings.caas.editor.options.name &&
								field.settings.caas.editor.isCustom) {
								fieldEditor = field.settings.caas.editor.options.name;
							}
							console.log(sprintf(fieldFormat, field.datatype, field.name, required, multiple, notranslate, inheritFromMaster, refTypes, fieldEditor));
						}
					});
					console.log('');
				}

				// content layout mappings
				console.log(sprintf(format1, 'Content Layout', ''));
				serverUtils.displayContentLayoutMapping(type.layoutMapping.data);

				console.log(sprintf(format1, 'Default preview layout', type.properties.previewLayout ? type.properties.previewLayout.layout : 'Content Form View'));
				console.log(sprintf(format1, 'Content item editor', type.properties.customForms && type.properties.customForms.length > 0 ? type.properties.customForms : 'System Form'));
				console.log(sprintf(format1, 'Content field editors', type.properties.customEditors && type.properties.customEditors.length > 0 ? type.properties.customEditors : ''));

				if (type.inplacePreview && type.inplacePreview.data && type.inplacePreview.data.length > 0) {
					var previewFormat = '%-38s  %-30s  %-s';
					console.log(sprintf(previewFormat, 'In-place content preview', 'Site', 'Page'));
					type.inplacePreview.data.forEach(function (preview) {
						console.log(sprintf(previewFormat, '', preview.siteName, preview.pageName));
					});
				}

				console.log('');

				var _saveTypeToFile = function (output, type, dependencies) {
					if (output) {
						var toSave = {
							properties: type,
							typeDependency: dependencies || []
						};
						fs.writeFileSync(output, JSON.stringify(toSave, null, 4));
						console.log('');
						console.log(' - type properties saved to ' + output);
					}
				};
				if (showRef) {
					let types = [type];
					_getAllTypes(server, types)
						.then(function (result) {
							var dependencies = result || [];
							var hasDep = false;
							for (let i = 0; i < dependencies.length; i++) {
								if (dependencies[i].name && dependencies[i].refs.length > 0) {
									hasDep = true;
									break;
								}
							}
							if (hasDep) {
								console.log('Type dependency hierarchy')
								let format = '   %-40s  %-s';
								console.log(sprintf(format, 'Name', 'Reference Types'));
								dependencies.forEach(function (dep) {
									console.log(sprintf(format, dep.name, dep.refs));
								});
							}

							_saveTypeToFile(output, type, dependencies);
							done(true);
						});
				} else {
					_saveTypeToFile(output, type);
					done(true);
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

module.exports.createCollection = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var repositoryName = argv.repository;
	var channelNames = argv.channels ? argv.channels.split(',') : [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var repository;
		var defaultChannels = [];
		var defaultChannelNames = [];

		var exitCode;

		serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName,
			fields: 'channels'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.info(' - get repository (Id: ' + repository.id + ')');

				return serverRest.getCollections({
					server: server,
					repositoryId: repository.id
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var repoCollections = result || [];
				var found = false;
				for (var i = 0; i < repoCollections.length; i++) {
					if (name.toLowerCase() === repoCollections[i].name.toLowerCase()) {
						found = true;
						break;
					}
				}
				if (found) {
					console.log(' - collection ' + name + ' already exists');
					exitCode = 2;
					return Promise.reject();
				}

				var channelPromises = [];
				if (channelNames.length > 0) {
					channelNames.forEach(function (channelName) {
						channelPromises.push(serverRest.getChannelWithName({
							server: server,
							name: channelName
						}));
					});
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
				// console.log(results);
				if (channelNames.length > 0) {
					channelNames.forEach(function (channelName) {
						var channel;
						var channelExist = false;
						for (var i = 0; i < results.length; i++) {
							channel = results[i] && results[i].data;
							if (channel && channel.name && channel.name.toLowerCase() === channelName.toLowerCase()) {
								channelExist = true;
								break;
							}
						}

						if (!channelExist) {
							console.error('ERROR: channel ' + channelName + ' does not exist');
						} else {
							// check if the channel is added to the repository
							var channelInRepo = false;
							for (let i = 0; i < repository.channels.length; i++) {
								if (channel.id === repository.channels[i].id) {
									channelInRepo = true;
									break;
								}
							}
							if (!channelInRepo) {
								console.error('ERROR: channel ' + channelName + ' is not a publishing channel for repository ' + repositoryName);
							} else {
								defaultChannels.push({
									id: channel.id,
									name: channel.name
								});
								defaultChannelNames.push(channel.name);
							}
						}
					});

					console.info(' - default channels: ' + defaultChannelNames);
				}

				return serverRest.createCollection({
					server: server,
					name: name,
					repositoryId: repository.id,
					channels: defaultChannels
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - collection ' + name + ' created (Id: ' + result.id + ')');

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done(exitCode);
			});
	});
};

module.exports.controlCollection = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var action = argv.action;
	var repositoryName = argv.repository;
	var collectionNames = argv.collections ? argv.collections.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repository;
		var collections = [];

		serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName,
			fields: 'channels'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.info(' - get repository (Id: ' + repository.id + ')');

				// Get all fields for updating
				return serverRest.getCollections({
					server: server,
					repositoryId: repository.id,
					fields: 'all'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var repoCollections = result || [];
				var repoCollectionNames = [];
				repoCollections.forEach(function (col) {
					repoCollectionNames.push(col.name);
				});
				if (repoCollectionNames.length > 0) {
					console.info(' - repository collections: ' + repoCollectionNames);
				}

				collectionNames.forEach(function (name) {
					var found = false;
					for (var i = 0; i < repoCollections.length; i++) {
						if (name.toLowerCase() === repoCollections[i].name.toLowerCase()) {
							found = true;
							collections.push(repoCollections[i]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: collection ' + name + ' does not exist');
					}
				});

				if (collections.length === 0) {
					return Promise.reject();
				}

				var controlPromise = action === 'add-channel' || action === 'remove-channel' ?
					_updateCollection(server, repository, collections, channelNames, action) :
					_updateCollectionPermission(server, repository, collections, userNames, groupNames, role, action);

				return controlPromise;
			})
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
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

// update collection to add/remove channels
var _updateCollection = function (server, repository, collections, channelNames, action) {
	return new Promise(function (resolve, reject) {
		var defaultChannels = [];
		var defaultChannelNames = [];

		var channelPromises = [];
		channelNames.forEach(function (channelName) {
			channelPromises.push(serverRest.getChannelWithName({
				server: server,
				name: channelName
			}));
		});

		Promise.all(channelPromises)
			.then(function (results) {
				// console.log(results);
				channelNames.forEach(function (channelName) {
					var channel;
					var channelExist = false;
					for (var i = 0; i < results.length; i++) {
						channel = results[i] && results[i].data;
						if (channel && channel.name && channel.name.toLowerCase() === channelName.toLowerCase()) {
							channelExist = true;
							break;
						}
					}

					if (!channelExist) {
						console.error('ERROR: channel ' + channelName + ' does not exist');
					} else {
						// check if the channel is added to the repository
						var channelInRepo = false;
						for (let i = 0; i < repository.channels.length; i++) {
							if (channel.id === repository.channels[i].id) {
								channelInRepo = true;
								break;
							}
						}
						if (!channelInRepo) {
							console.error('ERROR: channel ' + channelName + ' is not a publishing channel for repository ' + repository.name);
						} else {
							defaultChannels.push({
								id: channel.id,
								name: channel.name
							});
							defaultChannelNames.push(channel.name);
						}
					}
				});

				console.info(' - channels to ' + action.substring(0, action.indexOf('-')) + ': ' + defaultChannelNames);

				var updateCollectionPromises = [];

				if (defaultChannels.length === 0) {
					console.error('ERROR: no valid channel to add or remove');
					return Promise.reject();

				} else {

					collections.forEach(function (collection) {
						var finalChannels = collection.channels || [];

						if (action === 'add-channel') {
							for (var i = 0; i < defaultChannels.length; i++) {
								var idx = undefined;
								for (var j = 0; j < finalChannels.length; j++) {
									if (defaultChannels[i].id === finalChannels[j].id) {
										idx = j;
										break;
									}
								}
								if (idx === undefined) {
									finalChannels.push(defaultChannels[i]);
								}
							}
						} else if (action === 'remove-channel') {
							for (let i = 0; i < defaultChannels.length; i++) {
								let idx = undefined;
								for (let j = 0; j < finalChannels.length; j++) {
									if (defaultChannels[i].id === finalChannels[j].id) {
										idx = j;
										break;
									}
								}
								if (idx !== undefined) {
									finalChannels.splice(idx, 1);
								}
							}
						}

						collection.channels = finalChannels;
						updateCollectionPromises.push(serverRest.updateCollection({
							server: server,
							repositoryId: repository.id,
							collection: collection
						}));
					});
				}

				return Promise.all(updateCollectionPromises);
			})
			.then(function (results) {
				var err;
				collections.forEach(function (collection) {
					var found = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].id === collection.id) {
							found = true;
							break;
						}
					}
					if (found) {
						console.log(' - channel ' + defaultChannelNames + ' ' +
							(action === 'add-channel' ? 'added to collection ' : 'removed from collection ') + collection.name);
					} else {
						err = 'err';
					}
				});

				resolve({
					err: err
				});

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

// share / unshare 
var _updateCollectionPermission = function (server, repository, collections, userNames, groupNames, role, action) {
	return new Promise(function (resolve, reject) {
		var users = [];
		var groups = [];
		var goodUserName = [];
		var goodGroupNames = [];

		var groupPromises = [];
		groupNames.forEach(function (gName) {
			groupPromises.push(
				serverRest.getGroup({
					server: server,
					name: gName
				}));
		});
		Promise.all(groupPromises).then(function (result) {

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
							goodGroupNames.push(groupNames[i]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: group ' + groupNames[i] + ' does not exist');
					}
				}
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
					var found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
							users.push(allUsers[i]);
							goodUserName.push(userNames[k]);
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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				// query the collection's existing grants
				var permissionPromises = [];
				collections.forEach(function (collection) {
					permissionPromises.push(
						serverRest.getResourcePermissions({
							server: server,
							id: collection.id,
							repositoryId: repository.id,
							type: 'collection'
						}));
				});

				return Promise.all(permissionPromises);

			})
			.then(function (results) {
				// console.log(JSON.stringify(results, null, 4));
				var actionErr;
				var doAction = collections.reduce(function (permPromise, collection) {
					return permPromise.then(function (result) {

						if (action === 'share') {
							goodUserName = [];
							goodGroupNames = [];
							var existingPermissions = [];
							var i, j;

							for (i = 0; i < results.length; i++) {
								if (results[i] && results[i].resource === collection.id) {
									existingPermissions = results[i].permissions || [];
									break;
								}
							}

							var groupsToGrant = [];
							for (i = 0; i < groups.length; i++) {
								var groupGranted = false;
								for (j = 0; j < existingPermissions.length; j++) {
									var perm = existingPermissions[j];
									if (perm.roleName === role && perm.type === 'group' &&
										perm.groupType === groups[i].groupOriginType && perm.fullName === groups[i].name) {
										groupGranted = true;
										break;
									}
								}
								if (groupGranted) {
									console.log(' - group ' + groups[i].name + ' already granted with role ' + role + ' on collection ' + collection.name);
								} else {
									groupsToGrant.push(groups[i]);
									goodGroupNames.push(groups[i].name);
								}
							}

							var usersToGrant = [];
							for (i = 0; i < users.length; i++) {
								var granted = false;
								for (j = 0; j < existingPermissions.length; j++) {
									let perm = existingPermissions[j];
									if (perm.roleName === role && perm.type === 'user' && perm.id === users[i].loginName) {
										granted = true;
										break;
									}
								}
								if (granted) {
									console.log(' - user ' + users[i].loginName + ' already granted with role ' + role + ' on collection ' + collection.name);
								} else {
									usersToGrant.push(users[i]);
									goodUserName.push(users[i].loginName);
								}
							}

							return serverRest.performPermissionOperation({
								server: server,
								operation: 'share',
								resourceId: collection.id,
								resourceType: 'collection',
								role: role,
								users: usersToGrant,
								groups: groupsToGrant
							}).then(function (result) {
								if (result.err) {
									actionErr = 'err';
								} else {
									if (goodUserName.length > 0) {
										console.log(' - user ' + (goodUserName.join(', ')) + ' granted with role ' + role + ' on collection ' + collection.name);
									}
									if (goodGroupNames.length > 0) {
										console.log(' - group ' + (goodGroupNames.join(', ')) + ' granted with role ' + role + ' on collection ' + collection.name);
									}
								}
							});

						} else {

							return serverRest.performPermissionOperation({
								server: server,
								operation: 'unshare',
								resourceId: collection.id,
								resourceType: 'collection',
								users: users,
								groups: groups
							}).then(function (result) {
								if (result.err) {
									actionErr = 'err';
								} else {
									if (goodUserName.length > 0) {
										console.log(' - the access of user ' + (goodUserName.join(', ')) + ' to collection ' + collection.name + ' removed');
									}
									if (goodGroupNames.length > 0) {
										console.log(' - the access of group ' + (goodGroupNames.join(', ')) + ' to collection ' + collection.name + ' removed');
									}
								}
							});
						}
					});
				},
					Promise.resolve({}));

				doAction.then(function (result) {
					resolve({
						err: actionErr
					});
				});

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


module.exports.createChannel = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var channelType = argv.type || 'public';
	var publishPolicy = argv.publishpolicy || 'anythingPublished';
	var localizationPolicyName = argv.localizationpolicy;

	var localizationId;
	var exitCode;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getChannels({
			server: server
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var channels = result || [];
				for (var i = 0; i < channels.length; i++) {
					if (name.toLowerCase() === channels[i].name.toLowerCase()) {
						console.log(' - channel ' + name + ' already exists');
						exitCode = 2;
						return Promise.reject();
					}
				}
				var localizationPolicyPromises = [];
				if (localizationPolicyName) {
					localizationPolicyPromises.push(serverRest.getLocalizationPolicies({
						server: server
					}));
				}
				return Promise.all(localizationPolicyPromises);
			})
			.then(function (results) {
				var policies = results.length > 0 ? results[0] : [];
				for (var i = 0; i < policies.length; i++) {
					if (localizationPolicyName === policies[i].name) {
						localizationId = policies[i].id;
						break;
					}
				}

				if (localizationPolicyName && !localizationId) {
					console.error('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
					return Promise.reject();
				}
				if (localizationPolicyName) {
					console.info(' - verify localization policy ');
				}

				return serverRest.createChannel({
					server: server,
					name: name,
					description: desc,
					channelType: channelType,
					publishPolicy: publishPolicy,
					localizationPolicy: localizationId
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// console.log(result);
				console.log(' - channel ' + name + ' created');

				done(true);
			})
			.catch((error) => {
				done(exitCode);
			});
	});
};

module.exports.shareChannel = function (argv, done) {
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

	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;

	var channel;
	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		serverRest.getChannelWithName({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			} else if (!result.data) {
				console.error('ERROR: channel ' + name + ' not found');
				return Promise.reject();
			}
			channel = result.data;

			if (channel.isSiteChannel) {
				console.error('ERROR: channel ' + name + ' is a site channel');
				return Promise.reject();
			}

			console.info(' - verify channel');

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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.getResourcePermissions({
					server: server,
					id: channel.id,
					type: 'channel'
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var existingPermissions = result && result.permissions || [];
				var i, j;
				var groupsToGrant = [];
				for (i = 0; i < groups.length; i++) {
					var groupGranted = false;
					for (j = 0; j < existingPermissions.length; j++) {
						var perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'group' &&
							perm.groupType === groups[i].groupOriginType && perm.fullName === groups[i].name) {
							groupGranted = true;
							break;
						}
					}
					if (groupGranted) {
						console.log(' - group ' + groups[i].name + ' already granted with role ' + role + ' on channel' + name);
					} else {
						groupsToGrant.push(groups[i]);
						goodGroupNames.push(groups[i].name);
					}
				}

				var usersToGrant = [];
				for (i = 0; i < users.length; i++) {
					var granted = false;
					for (j = 0; j < existingPermissions.length; j++) {
						let perm = existingPermissions[j];
						if (perm.roleName === role && perm.type === 'user' && perm.id === users[i].loginName) {
							granted = true;
							break;
						}
					}
					if (granted) {
						console.log(' - user ' + users[i].loginName + ' already granted with role ' + role + ' on channel ' + name);
					} else {
						usersToGrant.push(users[i]);
						goodUserName.push(users[i].loginName);
					}
				}

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'share',
					resourceId: channel.id,
					resourceType: 'channel',
					role: role,
					users: usersToGrant,
					groups: groupsToGrant
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				if (goodUserName.length > 0) {
					console.log(' - user ' + (goodUserName.join(', ')) + ' granted with role ' + role + ' on channel ' + name);
				}
				if (goodGroupNames.length > 0) {
					console.log(' - group ' + (goodGroupNames.join(', ')) + ' granted with role ' + role + ' on channel ' + name);
				}
				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

module.exports.unshareChannel = function (argv, done) {
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

	console.info(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var channel;
	var users = [];
	var groups = [];
	var goodUserName = [];
	var goodGroupNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getChannelWithName({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			} else if (!result.data) {
				console.error('ERROR: channel ' + name + ' not found');
				return Promise.reject();
			}
			channel = result.data;

			if (channel.isSiteChannel) {
				console.error('ERROR: channel ' + name + ' is a site channel');
				return Promise.reject();
			}

			console.info(' - verify channel');

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
								goodGroupNames.push(groupNames[i]);
								break;
							}
						}
						if (!found) {
							console.error('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
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
					var found = false;
					for (let i = 0; i < allUsers.length; i++) {
						if (allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
							users.push(allUsers[i]);
							goodUserName.push(userNames[k]);
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

				if (users.length === 0 && groups.length === 0) {
					return Promise.reject();
				}

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'unshare',
					resourceId: channel.id,
					resourceType: 'channel',
					users: users,
					groups: groups
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (goodUserName.length > 0) {
					console.log(' - the access of user ' + (goodUserName.join(', ')) + ' to type ' + name + ' removed');
				}
				if (goodGroupNames.length > 0) {
					console.log(' - the access of group ' + (goodGroupNames.join(', ')) + ' to type ' + name + ' removed');
				}
				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

module.exports.describeChannel = function (argv, done) {
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

	var name = argv.name;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var channel;
		var policyName;

		serverRest.getChannelWithName({
			server: server,
			name: name,
			fields: 'channelType,publishPolicy,localizationPolicy,channelTokens'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				channel = result.data;
				if (!channel || !channel.id) {
					console.error('ERROR: channel ' + name + ' does not exist');
					return Promise.reject();
				}

				if (output) {
					fs.writeFileSync(output, JSON.stringify(channel, null, 4));
					console.log(' - channel properties saved to ' + output);
				}

				var policyPromises = [];
				if (channel.localizationPolicy) {
					policyPromises.push(serverRest.getLocalizationPolicy({
						server: server,
						id: channel.localizationPolicy
					}));
				}

				return Promise.all(policyPromises);

			})
			.then(function (results) {
				var policies = results || [];
				policyName = '';
				if (policies && policies[0] && policies[0].id && policies[0].name) {
					policyName = policies[0].name;
				}

				var repoPromises = [];
				if (channel.repositories && channel.repositories.length > 0) {
					channel.repositories.forEach(function (repo) {
						if (repo.id) {
							repoPromises.push(serverRest.getRepository({
								server: server,
								id: repo.id
							}));
						}
					});
				}

				return Promise.all(repoPromises);

			})
			.then(function (results) {
				var repos = results || [];
				var repoNames = [];
				repos.forEach(function (repo) {
					if (repo && repo.id && repo.name) {
						repoNames.push(repo.name);
					}
				});

				var tokens = channel.channelTokens || [];
				var channelToken;
				for (var i = 0; i < tokens.length; i++) {
					if (tokens[i].name === 'defaultToken') {
						channelToken = tokens[i].token;
						break;
					}
				}

				var format1 = '%-38s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', channel.id));
				console.log(sprintf(format1, 'Token', channelToken));
				console.log(sprintf(format1, 'Name', channel.name));
				console.log(sprintf(format1, 'Description', channel.description || ''));
				console.log(sprintf(format1, 'Created', channel.createdDate.value + ' by ' + channel.createdBy));
				console.log(sprintf(format1, 'Updated', channel.updatedDate.value + ' by ' + channel.updatedBy));
				console.log(sprintf(format1, 'Site channel', channel.isSiteChannel ? '√' : ''));
				console.log(sprintf(format1, 'Publishing', channel.publishPolicy));
				console.log(sprintf(format1, 'Localization', policyName));
				console.log(sprintf(format1, 'Access to published resources', channel.channelType));
				/*
				if (repoNames.length > 0) {
					console.log(sprintf(format1, 'Repositories', repoNames.sort()));
				}
				*/
				console.log('');
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


/**
 * List Editorial Permissions
 */
module.exports.listEditorialPermission = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repository;

		serverRest.getRepositoryWithName({
			server: server,
			name: name
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}

				console.info(' - get repository (Id: ' + repository.id + ')');

				return serverRest.getPermissionSets({
					server: server,
					id: repository.id,
					name: repository.name
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var permissionSets = result && result.permissionSets;

				_listPermissionSets(permissionSets);

				// console.log(JSON.stringify(permissionSets, null, 4));

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

var _listPermissionSets = function (data) {
	// console.log(JSON.stringify(data, null, 4));
	// order by user/group name
	var byName = data.slice(0);
	byName.sort(function (a, b) {
		var x = a.principal.name;
		var y = b.principal.name;
		return (x < y ? -1 : x > y ? 1 : 0);
	});
	data = byName;

	data.forEach(function (item) {
		// sort by asset type name (Any Type on top)
		if (item.contentPrivileges.length > 1) {
			var byAssetName = item.contentPrivileges.slice(0);
			byAssetName.sort(function (a, b) {
				var x = a.typeName;
				var y = b.typeName;
				return (!x ? -1 : (!y ? 1 : (x < y ? -1 : x > y ? 1 : 0)));
			});
			item.contentPrivileges = byAssetName;
		}

		// sort by category name (Any Category on top)
		if (item.taxonomyPrivileges.length > 1) {
			var byCatName = item.taxonomyPrivileges.slice(0);
			byCatName.sort(function (a, b) {
				var x = a.taxonomyShortName;
				var y = b.taxonomyShortName;
				return (!x ? -1 : (!y ? 1 : (x < y ? -1 : x > y ? 1 : 0)));
			});
			item.taxonomyPrivileges = byCatName;
		}
	});

	console.log('');
	var format1 = '%-30s  %-53s  %-s';
	console.log(sprintf(format1, 'Users & Groups', 'Assets', 'Taxonomies'));

	var format2 = '%-30s  %-20.20s  %-4s  %-6s  %-6s  %-6s     %-30.30s  %-6s  %-12s  %-s';
	console.log(sprintf(format2, '', '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize', 'Create Site'));

	data.forEach(function (item) {
		// console.log(item.principal);
		// console.log(item.contentPrivileges);
		// console.log(JSON.stringify(item.taxonomyPrivileges, null, 4));
		var idx = 0;
		var max = Math.max(item.contentPrivileges.length, item.taxonomyPrivileges.length);
		for (var i = 0; i < max; i++) {
			var user = idx === 0 ? item.principal.name : '';
			var typeLabel = '',
				typeView = '',
				typeUpdate = '',
				typeCreate = '',
				typeDelete = '';
			var catLabel = '',
				catView = '',
				catCategorize = '',
				catCreateSite = '';
			if (idx < item.contentPrivileges.length) {
				typeLabel = item.contentPrivileges[idx].typeName ? item.contentPrivileges[idx].typeName : 'Any Type';
				typeView = item.contentPrivileges[idx].operations.includes('view') ? '  √' : '';
				typeUpdate = item.contentPrivileges[idx].operations.includes('update') ? '  √' : '';
				typeCreate = item.contentPrivileges[idx].operations.includes('create') ? '  √' : '';
				typeDelete = item.contentPrivileges[idx].operations.includes('delete') ? '  √' : '';
			}
			if (idx < item.taxonomyPrivileges.length) {
				if (item.taxonomyPrivileges[idx].categoryId) {
					catLabel = item.taxonomyPrivileges[idx].taxonomyShortName;
					if (item.taxonomyPrivileges[idx].nodes && item.taxonomyPrivileges[idx].nodes.length > 0) {
						var nodeNames = [];
						for (var j = 0; j < item.taxonomyPrivileges[idx].nodes.length; j++) {
							nodeNames.push(item.taxonomyPrivileges[idx].nodes[j].name);
						}
						catLabel = catLabel + '|' + nodeNames.join('/');
					}
				} else {
					catLabel = 'Any Category';
				}
				catView = item.taxonomyPrivileges[idx].operations.includes('view') ? '  √' : '';
				catCategorize = item.taxonomyPrivileges[idx].operations.includes('categorize') ? '  √' : '';
				catCreateSite = item.taxonomyPrivileges[idx].operations.includes('createSite') ? '  √' : '';
			}

			console.log(sprintf(format2, user, typeLabel, typeView, typeUpdate, typeCreate, typeDelete,
				catLabel, catView, catCategorize, catCreateSite));

			//move to next one
			idx += 1;
		}
	});
	console.log('');
};

/**
 * Set Editorial Permissions
 */
module.exports.setEditorialPermission = function (argv, done) {
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
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var typeNames = argv.assettypes ? argv.assettypes.split(',') : [];
	var assetPermission = argv.assetpermission;
	var categoryNames = argv.categories ? argv.categories.split(',') : [];
	var categoryPermission = argv.categorypermission;
	if (categoryPermission && categoryPermission.toLowerCase() === 'createsite') {
		categoryPermission = 'createSite';
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		const ANY_TYPE = '__cecanytype';
		const ANY_CATEGORY = '__cecanycategory';
		const DELETE_TYPE = '__cecdeletetype';
		const DELETE_CATEGORY = '__cecdeletecategory';

		var repository;
		var goodUserNames = [];
		var goodGroupNames = [];
		var types = [];
		var goodTypeNames = [];
		var taxonomies = [];
		var goodTaxonomyNames = [];
		var goodCateNames = [];
		var taxCategories = [];

		var principals = [];
		var permissionSets = [];

		var toAdd = [];
		var toUpdate = [];

		var err;
		serverRest.getRepositoryWithName({
			server: server,
			name: name
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}

				console.info(' - get repository (Id: ' + repository.id + ')');

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
					// verify groups
					var allGroups = result || [];
					for (var i = 0; i < groupNames.length; i++) {
						var found = false;
						for (var j = 0; j < allGroups.length; j++) {
							if (allGroups[j].name && groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
								found = true;
								goodGroupNames.push(allGroups[j].name);
								principals.push({
									name: allGroups[j].name,
									type: 'group',
									scope: allGroups[j].groupOriginType
								});
								break;
							}
						}
						if (!found) {
							console.warn(' - WARNING: group ' + groupNames[i] + ' does not exist');
						}
					}
					if (goodGroupNames.length) {
						console.info(' - valid groups: ' + goodGroupNames);
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
					// verify users
					for (var k = 0; k < userNames.length; k++) {
						var found = false;
						for (let i = 0; i < allUsers.length; i++) {
							if (allUsers[i].loginName && allUsers[i].loginName.toLowerCase() === userNames[k].toLowerCase()) {
								principals.push({
									name: allUsers[i].loginName,
									type: 'user'
								});
								goodUserNames.push(allUsers[i].loginName);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found) {
							console.warn(' - WARNING: user ' + userNames[k] + ' does not exist');
						}
					}
					if (goodUserNames.length) {
						console.info(' - valid user: ' + goodUserNames);
					}
					// console.log(users);
				}

				if (principals.length === 0) {
					console.error('ERROR: no valid user nor group');
					return Promise.reject();
				}

				var typesPromises = [];
				for (let i = 0; i < typeNames.length; i++) {
					if (typeNames[i] !== ANY_TYPE) {
						typesPromises.push(serverRest.getContentType({
							server: server,
							name: typeNames[i],
							showError: false
						}));
					}
				}

				return Promise.all(typesPromises);

			})
			.then(function (results) {

				if (typeNames.length > 0) {
					// verify types
					var allTypes = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].id) {
							allTypes = allTypes.concat(results[i]);
						}
					}

					for (var k = 0; k < typeNames.length; k++) {
						var found = false;
						for (let i = 0; i < allTypes.length; i++) {
							if (allTypes[i].name.toLowerCase() === typeNames[k].toLowerCase()) {
								types.push(allTypes[i]);
								goodTypeNames.push(typeNames[k]);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found && typeNames[k] !== ANY_TYPE) {
							console.warn(' - WARNING: asset type ' + typeNames[k] + ' does not exist, ignore');
						}
					}

					if (goodTypeNames.length > 0) {
						console.info(' - valid asset types: ' + goodTypeNames);
					}
					if (typeNames.includes(ANY_TYPE)) {
						types.push({
							id: '',
							name: 'any'
						});
					}
					// console.log(types);
				}

				var taxonomiesPromises = [];
				var taxNames = [];
				for (let i = 0; i < categoryNames.length; i++) {
					if (categoryNames[i].indexOf(':') > 0) {
						var taxName = categoryNames[i].substring(0, categoryNames[i].indexOf(':'));
						if (!taxNames.includes(taxName)) {
							taxonomiesPromises.push(serverRest.getTaxonomyWithName({
								server: server,
								name: taxName
							}));
							taxNames.push(taxName);
						}
					}
				}

				return Promise.all(taxonomiesPromises);

			})
			.then(function (results) {

				if (categoryNames.length > 0) {
					// verify taxonomies
					var allTaxonomies = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].data && results[i].data.name) {
							allTaxonomies.push(results[i].data);
						}
					}

					for (var k = 0; k < categoryNames.length; k++) {
						if (categoryNames[k] !== ANY_CATEGORY) {
							var taxName = categoryNames[k].substring(0, categoryNames[k].indexOf(':'));
							var found = false;
							for (let i = 0; i < allTaxonomies.length; i++) {
								if (allTaxonomies[i].name === taxName) {
									if (!goodTaxonomyNames.includes(taxName)) {
										if (categoryPermission === 'createSite' && !allTaxonomies[i].isForSiteManagement) {
											console.warn(' - WARNING: taxonomy ' + taxName + ' is not for site security management');
										} else {
											taxonomies.push(allTaxonomies[i]);
											goodTaxonomyNames.push(taxName);
										}
									}
									found = true;
									break;
								}
							}
							if (!found) {
								console.warn(' - WARNING: taxonomy ' + taxName + ' does not exist, ignore');
							}
						}
					}


					// console.log(taxonomies);
				}

				var categoryPromises = [];
				for (let i = 0; i < taxonomies.length; i++) {
					// Need all to get whole hierarchy
					categoryPromises.push(serverRest.getCategories({
						server: server,
						taxonomyId: taxonomies[i].id,
						taxonomyName: taxonomies[i].name,
						fields: 'all'
					}));
				}

				return Promise.all(categoryPromises);

			})
			.then(function (results) {

				if (categoryNames.length > 0) {
					// verify categories
					var allCategories = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].categories) {
							allCategories.push(results[i]);
						}
					}

					for (var k = 0; k < categoryNames.length; k++) {
						var found = false;
						var cateName;
						if (categoryNames[k] !== ANY_CATEGORY) {
							var taxName = categoryNames[k].substring(0, categoryNames[k].indexOf(':'));
							cateName = categoryNames[k].substring(categoryNames[k].indexOf(':') + 1);
							// console.log(' - category name: ' + cateName);
							for (let i = 0; i < allCategories.length; i++) {
								if (allCategories[i].taxonomyName === taxName &&
									allCategories[i].categories && allCategories[i].categories.length > 0) {
									for (var j = 0; j < allCategories[i].categories.length; j++) {
										var cateFullPath = '';
										var ancestors = allCategories[i].categories[j].ancestors || [];
										ancestors.forEach(function (ancestor) {
											if (cateFullPath) {
												cateFullPath = cateFullPath + '/';
											}
											cateFullPath = cateFullPath + ancestor.name;
										});
										if (cateFullPath) {
											cateFullPath = cateFullPath + '/';
										}
										cateFullPath = cateFullPath + allCategories[i].categories[j].name;

										if (cateName.indexOf('/') > 0) {
											if (cateFullPath === cateName) {
												found = true;
											}
										} else {
											if (allCategories[i].categories[j].name === cateName) {
												found = true;
											}
										}
										if (found) {
											taxCategories.push({
												taxonomyId: allCategories[i].taxonomyId,
												taxonomyName: allCategories[i].taxonomyName,
												categoryId: allCategories[i].categories[j].id,
												categoryName: allCategories[i].categories[j].name
											});
											goodCateNames.push(allCategories[i].taxonomyName + '|' + cateFullPath);
											break;
										}
									}
								}
								if (found) {
									break;
								}
							}

							if (!found) {
								console.warn(' - WARNING: category ' + cateName + ' does not exist, ignore');
							}
						}
					}

					if (goodCateNames.length > 0) {
						console.info(' - valid categories: ' + goodCateNames);
					}

					if (categoryNames.includes(ANY_CATEGORY)) {
						taxCategories.push({
							taxonomyId: 'any',
							taxonomyName: 'any',
							categoryId: ''
						});
					}

					// console.log(taxCategories);
				}

				if (types.length === 0 && taxCategories.length === 0) {
					console.error('ERROR: no valid asset type nor category');
					return Promise.reject();
				}

				return serverRest.getPermissionSets({
					server: server,
					id: repository.id,
					name: repository.name
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				permissionSets = result && result.permissionSets || [];
				// console.log(JSON.stringify(permissionSets, null, 4));

				var assetOps = [];
				if (assetPermission) {
					if (assetPermission === 'view') {
						assetOps = ['view'];
					} else if (assetPermission === 'update') {
						assetOps = ['view', 'update'];
					} else if (assetPermission === 'create') {
						assetOps = ['view', 'update', 'create'];
					} else if (assetPermission === 'delete') {
						assetOps = ['view', 'update', 'create', 'delete'];
					}
				}

				var catOps = [];
				if (categoryPermission) {
					if (categoryPermission === 'view') {
						catOps = ['view'];
					} else if (categoryPermission === 'categorize') {
						catOps = ['view', 'categorize'];
					} else if (categoryPermission === 'createSite') {
						catOps = ['view', 'categorize', 'createSite'];
					}
				}

				// console.log(principals);
				principals.forEach(function (pal) {

					var found = false;
					var permissionId;
					var contentPrivileges = [];
					var taxonomyPrivileges = [];
					for (var i = 0; i < permissionSets.length; i++) {
						if (permissionSets[i].principal.type === pal.type && permissionSets[i].principal.name === pal.name) {
							found = true;
							permissionId = permissionSets[i].id;
							contentPrivileges = permissionSets[i].contentPrivileges;
							taxonomyPrivileges = permissionSets[i].taxonomyPrivileges;
							break;
						}
					}

					for (var j = 0; j < types.length; j++) {
						var foundType = false;

						for (var k = 0; k < contentPrivileges.length; k++) {
							if (!types[j].id && !contentPrivileges[k].typeId ||
								types[j].id === contentPrivileges[k].typeId) {
								foundType = true;
								if (assetPermission !== DELETE_TYPE) {
									// update the permissions
									contentPrivileges[k].operations = assetOps;
								} else {
									// delete the type
									contentPrivileges.splice(k, 1);
								}
								break;
							}
						}

						if (!foundType && assetPermission !== DELETE_TYPE) {
							// append 
							contentPrivileges.push({
								typeId: types[j].id,
								typeName: types[j].name,
								isValid: true,
								operations: assetOps
							});
						}
					}

					for (let j = 0; j < taxCategories.length; j++) {
						var foundCat = false;

						for (let k = 0; k < taxonomyPrivileges.length; k++) {
							if (!taxonomyPrivileges[k].taxonomyId && taxCategories[j].taxonomyId === 'any' ||
								(taxonomyPrivileges[k].taxonomyId === taxCategories[j].taxonomyId &&
									taxonomyPrivileges[k].categoryId === taxCategories[j].categoryId)) {
								foundCat = true;
								if (!taxonomyPrivileges[k].taxonomyId) {
									taxonomyPrivileges[k].taxonomyId = 'any';
								}
								if (categoryPermission !== DELETE_CATEGORY) {
									// update the permissions
									taxonomyPrivileges[k].operations = catOps;
								} else {
									// delete the category
									taxonomyPrivileges.splice(k, 1);
								}
								break;
							}
						}

						if (!foundCat && categoryPermission !== DELETE_CATEGORY) {
							// append
							taxonomyPrivileges.push({
								taxonomyId: taxCategories[j].taxonomyId,
								categoryId: taxCategories[j].categoryId,
								isValid: true,
								operations: catOps
							});
						}
					}

					var anyTypeExist = false;
					for (let i = 0; i < contentPrivileges.length; i++) {
						if (!contentPrivileges[i].typeId) {
							anyTypeExist = true;
							break;
						}
					}

					var anyTaxExist = false;
					for (let i = 0; i < taxonomyPrivileges.length; i++) {
						if (!taxonomyPrivileges[i].categoryId) {
							anyTaxExist = true;
							break;
						}
					}

					if (!anyTypeExist && !anyTaxExist) {
						console.error('ERROR: "Any" content type rule and "Any" taxonomy category rule are missing for ' + pal.name);
					} else if (!anyTypeExist) {
						console.error('ERROR: "Any" content type rule is missing for ' + pal.name);
					} else if (!anyTaxExist) {
						console.error('ERROR: "Any" taxonomy category rule is missing for ' + pal.name);
					} else {
						if (found) {
							// update permission for the principal
							toUpdate.push({
								id: permissionId,
								principal: pal,
								contentPrivileges: contentPrivileges,
								taxonomyPrivileges: taxonomyPrivileges
							});
						} else if (assetPermission !== DELETE_TYPE || categoryPermission !== DELETE_CATEGORY) {
							// create new permission for the principal
							if (contentPrivileges.length > 0 || taxonomyPrivileges.length > 0)
								toAdd.push({
									principal: pal,
									contentPrivileges: contentPrivileges,
									taxonomyPrivileges: taxonomyPrivileges
								});
						}
					}

				});

				// console.log(' - to add: ' + JSON.stringify(toAdd, null, 4));
				// console.log(' - to update: ' + JSON.stringify(toUpdate, null, 4));

				return _setPermissions(server, repository, toAdd, 'add');

			})
			.then(function (result) {
				if (result.err) {
					err = 'err';
				}

				return _setPermissions(server, repository, toUpdate, 'update');

			})
			.then(function (result) {
				if (result.err) {
					err = 'err';
				}

				// query again
				return serverRest.getPermissionSets({
					server: server,
					id: repository.id,
					name: repository.name
				});
			})
			.then(function (result) {

				var newPermissionSets = result && result.permissionSets || [];
				if (toAdd.length > 0 || toUpdate.length > 0) {
					_listPermissionSets(newPermissionSets);
					done(!err);
				} else {
					done();
				}

			})
			.catch((error) => {
				if (error) {
					console.error(error);
					done();
				}
				done();
			});
	});

};

var _setPermissions = function (server, repository, permissions, action) {
	return new Promise(function (resolve, reject) {
		if (permissions.length === 0) {
			return resolve({});
		}
		var err;
		var doSet = permissions.reduce(function (setPromise, permission) {
			return setPromise.then(function (result) {
				return serverRest.setPermissionSets({
					server: server,
					id: repository.id,
					name: repository.name,
					permissions: permission,
					action: action
				})
					.then(function (result) {
						if (!result || result.err) {
							err = 'err';
						} else {
							console.log(' - ' + action + ' editorial permissions for ' + (result.principal && result.principal.name));
						}
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doSet.then(function (result) {
			resolve({
				err: err
			});
		});
	});
};

/**
 * List Editorial Roles
 */
module.exports.listEditorialRole = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getEditorialRoles({
			server: server,
			fields: 'all'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var roles = result;
				var exitCode;
				if (roles.length === 0) {
					console.log(' - no editorial role');
				} else {
					var displayed = false;
					roles.forEach(function (role) {
						if (!name || name.toLowerCase() === role.name.toLowerCase()) {
							_listEditorialRoles(role);
							displayed = true;
						}
					});
					if (name && !displayed) {
						console.error('ERROR: editorial role ' + name + ' does not exist');
						exitCode = 1;
					}
				}

				if (exitCode === 1) {
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
	});
};

// list type and taxonomy settings for one editorial role
var _listEditorialRoles = function (item) {

	// sort by asset type name (Any Type on top)
	if (item.contentPrivileges.length > 1) {
		var byAssetName = item.contentPrivileges.slice(0);
		byAssetName.sort(function (a, b) {
			var x = a.typeName;
			var y = b.typeName;
			return (!x ? -1 : (!y ? 1 : (x < y ? -1 : x > y ? 1 : 0)));
		});
		item.contentPrivileges = byAssetName;
	}

	// sort by category name (Any Category on top)
	if (item.taxonomyPrivileges.length > 1) {
		var byCatName = item.taxonomyPrivileges.slice(0);
		byCatName.sort(function (a, b) {
			var x = a.taxonomyShortName;
			var y = b.taxonomyShortName;
			return (!x ? -1 : (!y ? 1 : (x < y ? -1 : x > y ? 1 : 0)));
		});
		item.taxonomyPrivileges = byCatName;
	}

	console.log('');
	var format1 = '  %-63s  %-s';
	// console.log(sprintf(format1, '', 'Assets', 'Taxonomies'));

	var format2 = '  %-30s  %-4s  %-6s  %-6s  %-6s     %-36.36s  %-6s  %-12s  %-s';
	// console.log(sprintf(format2, '', '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize'));


	console.log(item.name + '  ' + (item.description ? ('(' + item.description + ')') : ''));

	console.log(sprintf(format1, 'Assets', 'Taxonomies'));
	console.log(sprintf(format2, '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize', 'Create Site'));

	// console.log(item.principal);
	// console.log(item.contentPrivileges);
	// console.log(JSON.stringify(item.taxonomyPrivileges, null, 4));
	var idx = 0;
	var max = Math.max(item.contentPrivileges.length, item.taxonomyPrivileges.length);
	for (var i = 0; i < max; i++) {
		var typeLabel = '',
			typeView = '',
			typeUpdate = '',
			typeCreate = '',
			typeDelete = '';
		var catLabel = '',
			catView = '',
			catCategorize = '',
			catCreateSite = '';
		if (idx < item.contentPrivileges.length) {
			typeLabel = item.contentPrivileges[idx].typeName ? item.contentPrivileges[idx].typeName : 'Any Type';
			typeView = item.contentPrivileges[idx].operations.includes('view') ? '  √' : '';
			typeUpdate = item.contentPrivileges[idx].operations.includes('update') ? '  √' : '';
			typeCreate = item.contentPrivileges[idx].operations.includes('create') ? '  √' : '';
			typeDelete = item.contentPrivileges[idx].operations.includes('delete') ? '  √' : '';
		}
		if (idx < item.taxonomyPrivileges.length) {
			if (item.taxonomyPrivileges[idx].categoryId) {
				catLabel = item.taxonomyPrivileges[idx].taxonomyShortName;
				if (item.taxonomyPrivileges[idx].nodes && item.taxonomyPrivileges[idx].nodes.length > 0) {
					var nodeNames = [];
					for (var j = 0; j < item.taxonomyPrivileges[idx].nodes.length; j++) {
						nodeNames.push(item.taxonomyPrivileges[idx].nodes[j].name);
					}
					catLabel = catLabel + '|' + nodeNames.join('/');
				}
			} else {
				catLabel = 'Any Category';
			}
			catView = item.taxonomyPrivileges[idx].operations.includes('view') ? '  √' : '';
			catCategorize = item.taxonomyPrivileges[idx].operations.includes('categorize') ? '  √' : '';
			catCreateSite = item.taxonomyPrivileges[idx].operations.includes('createSite') ? '  √' : '';
		}

		console.log(sprintf(format2, typeLabel, typeView, typeUpdate, typeCreate, typeDelete,
			catLabel, catView, catCategorize, catCreateSite));

		//move to next one
		idx += 1;
	}

};

/**
 * Create Editorial Role
 */
module.exports.createEditorialRole = function (argv, done) {
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
	var desc = argv.description;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}
		var exitCode;
		// CAAS API does not support specific field
		serverRest.getEditorialRoleWithName({
			server: server,
			name: name,
			fields: 'all'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var role = result && result.data;
				if (role && role.id) {
					console.log(' - editorial role already exists');
					_listEditorialRoles(role);
					exitCode = 2;
					return Promise.reject();
				}

				return serverRest.createEditorialRole({
					server: server,
					name: name,
					description: desc
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - editorial role created');
				_listEditorialRoles(result);

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

/**
 * delete Editorial Role
 */
module.exports.setEditorialRole = function (argv, done) {
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
	var typeNames = argv.assettypes ? argv.assettypes.split(',') : [];
	var assetPermission = argv.assetpermission;
	var categoryNames = argv.categories ? argv.categories.split(',') : [];
	var categoryPermission = argv.categorypermission;
	if (categoryPermission && categoryPermission.toLowerCase() === 'createsite') {
		categoryPermission = 'createSite';
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		const ANY_TYPE = '__cecanytype';
		const ANY_CATEGORY = '__cecanycategory';
		const DELETE_TYPE = '__cecdeletetype';
		const DELETE_CATEGORY = '__cecdeletecategory';

		var types = [];
		var goodTypeNames = [];
		var taxonomies = [];
		var goodTaxonomyNames = [];
		var goodCateNames = [];
		var taxCategories = [];

		var role;

		// CAAS API does not support specific field
		serverRest.getEditorialRoleWithName({
			server: server,
			name: name,
			fields: 'all'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				role = result && result.data;
				if (!role || !role.id) {
					console.error('ERROR: editorial role ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify editorial role');

				var typesPromises = [];
				for (var i = 0; i < typeNames.length; i++) {
					if (typeNames[i] !== ANY_TYPE) {
						typesPromises.push(serverRest.getContentType({
							server: server,
							name: typeNames[i],
							showError: false
						}));
					}
				}

				return Promise.all(typesPromises);
			})
			.then(function (results) {

				if (typeNames.length > 0) {
					// verify types
					var allTypes = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].id) {
							allTypes = allTypes.concat(results[i]);
						}
					}

					for (var k = 0; k < typeNames.length; k++) {
						var found = false;
						for (let i = 0; i < allTypes.length; i++) {
							if (allTypes[i].name.toLowerCase() === typeNames[k].toLowerCase()) {
								types.push(allTypes[i]);
								goodTypeNames.push(typeNames[k]);
								found = true;
								break;
							}
							if (found) {
								break;
							}
						}
						if (!found && typeNames[k] !== ANY_TYPE) {
							console.warn(' - WARNING: asset type ' + typeNames[k] + ' does not exist, ignore');
						}
					}

					if (goodTypeNames.length > 0) {
						console.info(' - valid asset types: ' + goodTypeNames);
					}
					if (typeNames.includes(ANY_TYPE)) {
						types.push({
							id: '',
							name: 'any'
						});
					}
					// console.log(types);
				}

				var taxonomiesPromises = [];
				var taxNames = [];
				for (let i = 0; i < categoryNames.length; i++) {
					if (categoryNames[i].indexOf(':') > 0) {
						var taxName = categoryNames[i].substring(0, categoryNames[i].indexOf(':'));
						if (!taxNames.includes(taxName)) {
							taxonomiesPromises.push(serverRest.getTaxonomyWithName({
								server: server,
								name: taxName
							}));
							taxNames.push(taxName);
						}
					}
				}

				return Promise.all(taxonomiesPromises);

			})
			.then(function (results) {

				if (categoryNames.length > 0) {
					// verify taxonomies
					var allTaxonomies = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].data && results[i].data.name) {
							allTaxonomies.push(results[i].data);
						}
					}

					for (var k = 0; k < categoryNames.length; k++) {
						if (categoryNames[k] !== ANY_CATEGORY) {
							var taxName = categoryNames[k].substring(0, categoryNames[k].indexOf(':'));
							var found = false;
							for (let i = 0; i < allTaxonomies.length; i++) {
								if (allTaxonomies[i].name === taxName) {
									if (!goodTaxonomyNames.includes(taxName)) {
										taxonomies.push(allTaxonomies[i]);
										goodTaxonomyNames.push(taxName);
									}
									found = true;
									break;
								}
							}
							if (!found) {
								console.warn(' - WARNING: taxonomy ' + taxName + ' does not exist, ignore');
							}
						}
					}

					// console.log(taxonomies);
				}

				var categoryPromises = [];
				for (let i = 0; i < taxonomies.length; i++) {
					// Need all to get whole hierarchy
					categoryPromises.push(serverRest.getCategories({
						server: server,
						taxonomyId: taxonomies[i].id,
						taxonomyName: taxonomies[i].name,
						fields: 'all'
					}));
				}

				return Promise.all(categoryPromises);

			})
			.then(function (results) {

				if (categoryNames.length > 0) {
					// verify categories
					var allCategories = [];
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].categories) {
							allCategories.push(results[i]);
						}
					}

					for (var k = 0; k < categoryNames.length; k++) {
						var found = false;
						var cateName;
						if (categoryNames[k] !== ANY_CATEGORY) {
							var taxName = categoryNames[k].substring(0, categoryNames[k].indexOf(':'));
							cateName = categoryNames[k].substring(categoryNames[k].indexOf(':') + 1);
							// console.log(' - category name: ' + cateName);
							for (let i = 0; i < allCategories.length; i++) {
								if (allCategories[i].taxonomyName === taxName &&
									allCategories[i].categories && allCategories[i].categories.length > 0) {
									for (var j = 0; j < allCategories[i].categories.length; j++) {
										var cateFullPath = '';
										var ancestors = allCategories[i].categories[j].ancestors || [];
										ancestors.forEach(function (ancestor) {
											if (cateFullPath) {
												cateFullPath = cateFullPath + '/';
											}
											cateFullPath = cateFullPath + ancestor.name;
										});
										if (cateFullPath) {
											cateFullPath = cateFullPath + '/';
										}
										cateFullPath = cateFullPath + allCategories[i].categories[j].name;

										if (cateName.indexOf('/') > 0) {
											if (cateFullPath === cateName) {
												found = true;
											}
										} else {
											if (allCategories[i].categories[j].name === cateName) {
												found = true;
											}
										}
										if (found) {
											taxCategories.push({
												taxonomyId: allCategories[i].taxonomyId,
												taxonomyName: allCategories[i].taxonomyName,
												categoryId: allCategories[i].categories[j].id,
												categoryName: allCategories[i].categories[j].name
											});
											goodCateNames.push(allCategories[i].taxonomyName + '|' + cateFullPath);
											break;
										}
									}
								}
								if (found) {
									break;
								}
							}

							if (!found) {
								console.warn(' - WARNING: category ' + cateName + ' does not exist, ignore');
							}
						}
					}

					if (goodCateNames.length > 0) {
						console.info(' - valid categories: ' + goodCateNames);
					}

					if (categoryNames.includes(ANY_CATEGORY)) {
						taxCategories.push({
							taxonomyId: 'any',
							taxonomyName: 'any',
							categoryId: ''
						});
					}

					// console.log(taxCategories);
				}

				if (types.length === 0 && taxCategories.length === 0) {
					console.error('ERROR: no valid asset type nor category');
					return Promise.reject();
				}

				var assetOps = [];
				if (assetPermission) {
					if (assetPermission === 'view') {
						assetOps = ['view'];
					} else if (assetPermission === 'update') {
						assetOps = ['view', 'update'];
					} else if (assetPermission === 'create') {
						assetOps = ['view', 'update', 'create'];
					} else if (assetPermission === 'delete') {
						assetOps = ['view', 'update', 'create', 'delete'];
					}
				}

				var catOps = [];
				if (categoryPermission) {
					if (categoryPermission === 'view') {
						catOps = ['view'];
					} else if (categoryPermission === 'categorize') {
						catOps = ['view', 'categorize'];
					} else if (categoryPermission === 'createSite') {
						catOps = ['view', 'categorize', 'createSite'];
					}
				}

				var contentPrivileges = role.contentPrivileges || [];
				var taxonomyPrivileges = role.taxonomyPrivileges || [];

				for (let j = 0; j < types.length; j++) {
					var foundType = false;

					for (let k = 0; k < contentPrivileges.length; k++) {
						if (!types[j].id && !contentPrivileges[k].typeId ||
							types[j].id === contentPrivileges[k].typeId) {
							foundType = true;
							if (assetPermission !== DELETE_TYPE) {
								// update the permissions
								contentPrivileges[k].operations = assetOps;
							} else {
								// delete the type
								contentPrivileges.splice(k, 1);
							}
							break;
						}
					}

					if (!foundType && assetPermission !== DELETE_TYPE) {
						// append 
						contentPrivileges.push({
							typeId: types[j].id,
							typeName: types[j].name,
							isValid: true,
							operations: assetOps
						});
					}
				}

				for (let j = 0; j < taxCategories.length; j++) {
					var foundCat = false;

					for (let k = 0; k < taxonomyPrivileges.length; k++) {
						if (!taxonomyPrivileges[k].taxonomyId && taxCategories[j].taxonomyId === 'any' ||
							(taxonomyPrivileges[k].taxonomyId === taxCategories[j].taxonomyId &&
								taxonomyPrivileges[k].categoryId === taxCategories[j].categoryId)) {
							foundCat = true;
							if (!taxonomyPrivileges[k].taxonomyId) {
								taxonomyPrivileges[k].taxonomyId = 'any';
							}
							if (categoryPermission !== DELETE_CATEGORY) {
								// update the permissions
								taxonomyPrivileges[k].operations = catOps;
							} else {
								// delete the category
								taxonomyPrivileges.splice(k, 1);
							}
							break;
						}
					}

					if (!foundCat && categoryPermission !== DELETE_CATEGORY) {
						// append
						taxonomyPrivileges.push({
							taxonomyId: taxCategories[j].taxonomyId,
							categoryId: taxCategories[j].categoryId,
							isValid: true,
							operations: catOps
						});
					}
				}

				var anyTypeExist = false;
				for (let i = 0; i < contentPrivileges.length; i++) {
					if (!contentPrivileges[i].typeId) {
						anyTypeExist = true;
						break;
					}
				}

				var anyTaxExist = false;
				for (let i = 0; i < taxonomyPrivileges.length; i++) {
					if (!taxonomyPrivileges[i].categoryId) {
						anyTaxExist = true;
						break;
					}
				}

				if (!anyTypeExist && !anyTaxExist) {
					console.error('ERROR: "Any" content type rule and "Any" taxonomy category rule are missing for ' + name);
					return Promise.reject();
				} else if (!anyTypeExist) {
					console.error('ERROR: "Any" content type rule is missing for ' + name);
					return Promise.reject();
				} else if (!anyTaxExist) {
					console.error('ERROR: "Any" taxonomy category rule is missing for ' + name);
					return Promise.reject();
				}
				// console.log(contentPrivileges);
				// console.log(taxonomyPrivileges);
				role.contentPrivileges = contentPrivileges;
				role.taxonomyPrivileges = taxonomyPrivileges;

				return serverRest.updateEditorialRole({
					server: server,
					role: role
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - editorial role updated');
				_listEditorialRoles(result);

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

/**
 * delete Editorial Role
 */
module.exports.deleteEditorialRole = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getEditorialRoleWithName({
			server: server,
			name: name
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var role = result && result.data;
				if (!role || !role.id) {
					console.error('ERROR: editorial role ' + name + ' does not exist');
					return Promise.reject();
				}

				return serverRest.deleteEditorialRole({
					server: server,
					id: role.id,
					name: role.name
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - editorial role ' + name + ' deleted');

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


module.exports.createLocalizationPolicy = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var requiredLanguages = argv.requiredlanguages.split(',');
	var defaultLanguage = argv.defaultlanguage;
	var optionalLanguages = argv.optionallanguages ? argv.optionallanguages.split(',') : [];
	var exitCode;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getLocalizationPolicies({
			server: server
		})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				// verify if the localization policy exists
				var policies = result || [];
				for (var i = 0; i < policies.length; i++) {
					if (name === policies[i].name) {
						console.log(' - localization policy ' + name + ' already exists');
						exitCode = 2;
						return Promise.reject();
					}
				}

				console.info(' - verify localization policy name');

				return serverRest.createLocalizationPolicy({
					server: server,
					name: name,
					description: desc,
					defaultLanguage: defaultLanguage,
					requiredLanguages: requiredLanguages,
					optionalLanguages: optionalLanguages
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				// console.log(result);
				console.log(' - localization policy ' + name + ' created');

				done(true);
			})
			.catch((error) => {
				done(exitCode);
			});
	});
};


module.exports.downloadLocalizationPolicy = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var names = argv.name.split(',');
	var goodNames = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var customLanguages = [];
		// Get all custom language codes
		serverRest.getLanguageCodes({ server: server, languageType: 'custom' })
			.then(function (result) {
				customLanguages = result && result || [];
				// console.info(' - total custom languages: ' + customLanguages.length);

				var policyPromises = [];
				names.forEach(function (name) {
					policyPromises.push(serverRest.getLocalizationPolicWithName({
						server: server,
						name: name
					}));
				});

				return Promise.all(policyPromises);

			})
			.then(function (results) {

				names.forEach(function (name) {
					var policy = undefined;
					for (var i = 0; i < results.length; i++) {
						for (var j = 0; j < results[i].length; j++) {
							// localization policy name is case sensitive
							if (results[i][j] && results[i][j].id && results[i][j].name === name) {
								policy = results[i][j];
								break;
							}
						}
						if (policy) {
							break;
						}
					}
					if (policy) {
						if (!goodNames.includes(policy.name)) {
							goodNames.push(policy.name);
							// save to local
							if (!fs.existsSync(localizationPoliciesSrcDir)) {
								fs.mkdirSync(localizationPoliciesSrcDir);
							}

							var folderPath = path.join(localizationPoliciesSrcDir, policy.name);
							if (!fs.existsSync(folderPath)) {
								fs.mkdirSync(folderPath);
							}

							var filePath = path.join(folderPath, policy.name + '.json');
							fs.writeFileSync(filePath, JSON.stringify(policy, null, 4));

							console.log(' - save localization policy ' + filePath);

							// save custom language code for this localization policy if the policy contains any
							var policyCustomLangCodes = [];
							var codeNames = [];
							customLanguages.forEach(function (customLangCode) {
								for (var i = 0; i < policy.requiredValues.length; i++) {
									if (policy.requiredValues[i] === customLangCode.code && !codeNames.includes(customLangCode.code)) {
										codeNames.push(customLangCode.code);
										policyCustomLangCodes.push(customLangCode);
									}
								}
								for (let i = 0; i < policy.optionalValues.length; i++) {
									if (policy.optionalValues[i] === customLangCode.code && !codeNames.includes(customLangCode.code)) {
										codeNames.push(customLangCode.code);
										policyCustomLangCodes.push(customLangCode);
									}
								}
							});
							if (policyCustomLangCodes.length > 0) {
								// console.info(' - total policy custom languages: ' + policyCustomLangCodes.length);
								var codeFilePath = path.join(folderPath, 'CustomLanguages.json');
								var codeObj = {
									format: 'BCP_47',
									version: '1.0',
									values: policyCustomLangCodes
								};
								fs.writeFileSync(codeFilePath, JSON.stringify(codeObj, null, 4));
								console.info(' - save custom language code ' + codeFilePath);
							}
						}
					} else {
						console.error('ERROR: localization policy ' + name + ' does not exist');
					}
				});

				if (goodNames.length === 0) {
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
	});
};

module.exports.uploadLocalizationPolicy = function (argv, done) {
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

	var isFile = typeof argv.file === 'string' && argv.file.toLowerCase() === 'true';
	var allNames = argv.name.split(',');
	var customLanguageCodesFile = argv.customlanguagecodes;

	var names = [];
	var policyPaths = [];
	var policyCustomLangCodeNames = [];
	var policyCustomLangCodes = [];

	// varify the localization policies on local
	allNames.forEach(function (name) {
		var filePath;
		if (isFile) {
			filePath = name;

			if (!path.isAbsolute(filePath)) {
				filePath = path.join(projectDir, filePath);
			}
			filePath = path.resolve(filePath);

			if (!fs.existsSync(filePath)) {
				console.error('ERROR: file ' + filePath + ' does not exist');
			} else {
				var policyObj;
				try {
					policyObj = JSON.parse(fs.readFileSync(filePath));
				} catch (e) {
					// handle invalid json
				}
				if (!policyObj || !policyObj.id || !policyObj.name) {
					console.error('ERROR: file ' + filePath + ' is not a valid localization policy definition');
				} else {
					if (!names.includes(policyObj.name)) {
						names.push(policyObj.name);
						policyPaths.push(filePath);
					}
				}
			}

		} else {
			filePath = path.join(localizationPoliciesSrcDir, name, name + '.json');
			if (!fs.existsSync(filePath)) {
				console.error('ERROR: localization policy ' + name + ' does not exist');
			} else if (!names.includes(name)) {
				names.push(name);
				policyPaths.push(filePath);
			}
			// custom languages
			filePath = path.join(localizationPoliciesSrcDir, name, 'CustomLanguages.json');
			if (fs.existsSync(filePath)) {
				var customLangObj;
				try {
					customLangObj = JSON.parse(fs.readFileSync(filePath));
				} catch (e) {
					// handle invalid json
				}
				if (customLangObj && customLangObj.values && customLangObj.values.length > 0) {
					customLangObj.values.forEach(function (customLang) {
						if (!policyCustomLangCodeNames.includes(customLang.code)) {
							policyCustomLangCodeNames.push(customLang.code);
							policyCustomLangCodes.push(customLang);
						}
					});
				}
			}
		}

	});

	if (names.length === 0) {
		// no type to upload
		done();
		return;
	}

	if (customLanguageCodesFile) {
		var langFilePath = customLanguageCodesFile;
		if (!path.isAbsolute(langFilePath)) {
			langFilePath = path.join(projectDir, langFilePath);
		}
		langFilePath = path.resolve(langFilePath);

		if (!fs.existsSync(langFilePath)) {
			console.error('ERROR: file ' + langFilePath + ' does not exist');
		} else {
			var langsObj;
			try {
				langsObj = JSON.parse(fs.readFileSync(langFilePath));
			} catch (e) {
				// handle invalid json
			}
			if (!langsObj || !langsObj.values || langsObj.values.length === 0) {
				console.warn('WARNING: file ' + langFilePath + ' does not have any custom language code');
			} else {
				langsObj.values.forEach(function (customLang) {
					if (customLang.code && !policyCustomLangCodeNames.includes(customLang.code)) {
						policyCustomLangCodeNames.push(customLang.code);
						policyCustomLangCodes.push(customLang);
					}
				});
			}
		}
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var policiesToCreate = [];
		var policyNamesToCreate = [];
		var policiesToUpdate = [];
		var policyNamesToUpdate = [];

		var customLanguages = [];
		var customLangToCreate = [];
		var customLangCodeNameToCreate = [];

		var hasError = false;

		// Get all custom language codes
		serverRest.getLanguageCodes({ server: server, languageType: 'custom' })
			.then(function (result) {
				customLanguages = result && result || [];
				// console.info(' - total custom languages: ' + customLanguages.length);

				// find out the custom lagnauges to create
				policyCustomLangCodes.forEach(function (policyCustomLang) {
					var found = false;
					for (var i = 0; i < customLanguages.length; i++) {
						if (policyCustomLang.code === customLanguages[i].code) {
							found = true;
							break;
						}
					}
					if (!found && !customLangCodeNameToCreate.includes(policyCustomLang.code)) {
						customLangCodeNameToCreate.push(policyCustomLang.code);
						customLangToCreate.push(policyCustomLang);
					}
				});

				return _createCustomLanguages(server, customLangToCreate);

			})
			.then(function (result) {
				if (result && result.length > 0) {
					console.info(' - created custom language code ' + result.join(', '));
				}

				var policyPromises = [];
				names.forEach(function (name) {
					policyPromises.push(serverRest.getLocalizationPolicWithName({
						server: server,
						name: name
					}));
				});

				return Promise.all(policyPromises);
			})
			.then(function (results) {

				for (var idx = 0; idx < names.length; idx++) {

					var policy = undefined;
					for (var i = 0; i < results.length; i++) {
						for (var j = 0; j < results[i].length; j++) {
							// localization policy name is case sensitive
							if (results[i][j] && results[i][j].id && results[i][j].name === names[idx]) {
								policy = results[i][j];
								break;
							}
						}
						if (policy) {
							break;
						}
					}
					if (policy) {
						policyNamesToUpdate.push(names[idx]);
						policiesToUpdate.push({ id: policy.id, filePath: policyPaths[idx] });
					} else {
						policyNamesToCreate.push(names[idx]);
						policiesToCreate.push(policyPaths[idx]);
					}
				}

				if (policiesToCreate.length > 0) {
					console.info(' - will create localization policy ' + policyNamesToCreate.join(', '));
				}
				if (policiesToUpdate.length > 0) {
					console.info(' - will update localization policy ' + policyNamesToUpdate.join(', '));
				}

				var createPolicyPromises = [];
				policiesToCreate.forEach(function (filePath) {
					var policyObj;
					try {
						policyObj = JSON.parse(fs.readFileSync(filePath));
					} catch (e) {
						console.log(e);
					}
					if (policyObj && policyObj.id) {
						createPolicyPromises.push(serverRest.createLocalizationPolicy({
							server: server,
							name: policyObj.name || '',
							description: policyObj.description || '',
							requiredLanguages: policyObj.requiredValues || [],
							defaultLanguage: policyObj.defaultValue || '',
							optionalLanguages: policyObj.optionalValues || []
						}));
					}
				});

				return Promise.all(createPolicyPromises);

			})
			.then(function (results) {

				results.forEach(function (createdPolicy) {
					if (createdPolicy.id) {
						console.info(' - localization policy ' + createdPolicy.name + ' created');
					}
					if (createdPolicy.err) {
						hasError = true;
					}

				});

				var updatePolicyPromises = [];
				policiesToUpdate.forEach(function (toUpdate) {
					var policyObj;
					try {
						policyObj = JSON.parse(fs.readFileSync(toUpdate.filePath));
					} catch (e) {
						console.log(e);
					}
					if (policyObj && policyObj.id) {
						updatePolicyPromises.push(serverRest.updateLocalizationPolicy({
							server: server,
							id: toUpdate.id,
							name: policyObj.name,
							data: policyObj
						}));
					}
				});

				return Promise.all(updatePolicyPromises);

			})
			.then(function (results) {

				results.forEach(function (updatedPolicy) {
					if (updatedPolicy.id) {
						console.info(' - localization policy ' + updatedPolicy.name + ' updated');
					}
					if (updatedPolicy.err) {
						hasError = true;
					}
				});

				done(!hasError);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});

	});

};

var _createCustomLanguages = function (server, customLanguages) {
	return new Promise(function (resolve, reject) {
		if (customLanguages.length === 0) {
			return resolve({});
		} else {
			console.info(' - creating custom language codes ...');
			var createdLangCodeNames = [];
			var doCreatelangs = customLanguages.reduce(function (langPromise, customLang) {
				return langPromise.then(function (result) {
					return serverRest.createCustomLanguageCode({
						server: server,
						body: customLang
					}).then(function (result) {
						if (result && result.code) {
							createdLangCodeNames.push(result.code);
						}
					})
				});
			},
				// Start with a previousPromise value that is a resolved promise
				Promise.resolve({}));

			doCreatelangs.then(function (result) {
				// console.log(' - total custom languages: ' + total + ' created: ' + createdLangCodeNames.length);
				resolve(createdLangCodeNames);
			});
		}
	});
};

module.exports.describeWorkflow = function (argv, done) {
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

	var name = argv.name;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var workflows;

		serverRest.getWorkflowsWithName({
			server: server,
			name: name,
			fields: 'repositories,roles,properties'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				} else if (result.length === 0) {
					console.error('ERROR: workflow ' + name + ' not found');
					return Promise.reject();
				}
				workflows = result;

				var permissionPromises = [];
				workflows.forEach(function (wf) {
					permissionPromises.push(serverRest.getWorkflowPermissions({
						server: server,
						id: wf.id
					}));
				});

				return Promise.all(permissionPromises);

			})
			.then(function (results) {

				var allPermissions = results || [];

				workflows.forEach(function (workflow) {
					var permissions = [];

					for (var i = 0; i < allPermissions.length; i++) {
						if (allPermissions[i] && allPermissions[i].workflowId === workflow.id) {
							permissions = allPermissions[i].permissions;
							break;
						}
					}

					var repositories = [];
					if (workflow.repositories && workflow.repositories.length > 0) {
						workflow.repositories.forEach(function (repo) {
							if (repo.name) {
								repositories.push(repo.name);
							}
						});
					}

					var format1 = '%-38s  %-s';
					var format2 = '    %-s';
					console.log('');
					console.log(sprintf(format1, 'Id', workflow.id));
					console.log(sprintf(format1, 'Name', workflow.name));
					console.log(sprintf(format1, 'Description', workflow.description || ''));
					console.log(sprintf(format1, 'Registered', workflow.createdDate.value + ' by ' + workflow.createdBy));
					console.log(sprintf(format1, 'Updated', workflow.updatedDate.value + ' by ' + workflow.updatedBy));
					console.log(sprintf(format1, 'Application name', workflow.applicationName));
					console.log(sprintf(format1, 'Revision', workflow.revision));
					console.log(sprintf(format1, 'External Id', workflow.externalId));
					console.log(sprintf(format1, 'Source', workflow.source));
					console.log(sprintf(format1, 'Enabled', workflow.isEnabled));
					console.log(sprintf(format1, 'Assigned repositories', repositories));
					console.log(sprintf(format1, 'Role name', workflow.roleName));
					console.log(sprintf(format1, 'Workflow roles:', ''));
					if (workflow.roles && workflow.roles.length > 0) {
						workflow.roles.forEach(function (role) {
							console.log(sprintf(format2, role));
						});
					}

					console.log(sprintf(format1, 'Workflow permissions:', ''));
					var format3 = '  %-32s  %-12s  %-10s  %-32s  %-s';
					if (permissions.length > 0) {
						console.log(sprintf(format3, 'Id', 'Role name', 'Type', 'Full name', 'Email'));
						permissions.forEach(function (perm) {
							console.log(sprintf(format3, perm.id, perm.roleName, perm.type, perm.fullName, (perm.email || '')));
						});
					}
				});

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


module.exports.listAssets = function (argv, done) {
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
	console.info(' - server: ' + server.url);

	var channelName = argv.channel;
	var query = argv.query;
	var repositoryName = argv.repository;
	var collectionName = argv.collection;
	if (collectionName && !repositoryName) {
		console.error('ERROR: no repository is specified');
		done();
		return;
	}

	var total, limit;
	var repository, collection, channel, channelToken;
	var items = [];
	var startTime;

	var showURLS = typeof argv.urls === 'boolean' ? argv.urls : argv.urls === 'true';

	var orderBy = argv.orderby;
	var ranking = argv.rankby;
	var rankingApiName;

	var validate = typeof argv.validate === 'boolean' ? argv.validate : argv.validate === 'true';

	const allowedProperties = ['id', 'name', 'type', 'language', 'slug', 'status', 'createdDate', 'createdBy', 'updatedDate', 'updatedBy', 'version', 'publishedVersion', 'size'];
	const defaultProperties = ['type', 'id', 'version', 'status', 'language', 'size', 'name'];
	var properties = argv.properties ? argv.properties.split(',') : [];
	var propertiesToShow = [];
	properties.forEach(function (name) {
		if (allowedProperties.includes(name)) {
			propertiesToShow.push(name);
		} else {
			console.warn('WARNING: invalid property name ' + name);
		}
	});
	if (propertiesToShow.length === 0) {
		propertiesToShow = defaultProperties;
	}
	console.log(' - properties to show: ' + propertiesToShow);

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repositoryPromises = [];
		if (repositoryName) {
			repositoryPromises.push(serverRest.getRepositoryWithName({
				server: server,
				name: repositoryName
			}));
		}
		Promise.all(repositoryPromises).then(function (results) {
			if (repositoryName) {
				if (!results || !results[0] || results[0].err) {
					return Promise.reject();
				} else if (!results[0].data) {
					console.error('ERROR: repository ' + repositoryName + ' not found');
					return Promise.reject();
				}
				repository = results[0].data;
				console.info(' - validate repository (Id: ' + repository.id + ')');
			}

			var collectionPromises = [];
			if (collectionName) {
				collectionPromises.push(serverRest.getCollectionWithName({
					server: server,
					repositoryId: repository.id,
					name: collectionName
				}));
			}

			return Promise.all(collectionPromises);
		})
			.then(function (results) {
				if (collectionName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					} else if (!results[0].data) {
						console.error('ERROR: collection ' + collectionName + ' not found');
						return Promise.reject();
					}
					collection = results[0].data;
					console.info(' - validate collection (Id: ' + collection.id + ')');
				}

				var rankingPromises = [];
				if (ranking) {
					rankingPromises.push(serverRest.getRankingPolicies({
						server: server
					}));
				}

				return Promise.all(rankingPromises);

			})
			.then(function (results) {
				if (ranking) {
					// check if the ranking is valid
					var rankings = results && results[0] || [];
					for (var i = 0; i < rankings.length; i++) {
						if (rankings[i].apiName.toLowerCase() === ranking.toLowerCase()) {
							rankingApiName = rankings[i].apiName;
							break;
						}
					}
					if (!rankingApiName) {
						// try to match with name
						for (let i = 0; i < rankings.length; i++) {
							if (rankings[i].name.toLowerCase() === ranking.toLowerCase()) {
								rankingApiName = rankings[i].apiName;
								break;
							}
						}
					}
					if (!rankingApiName) {
						console.warn(' - WARNING: ranking policy is not found with API name ' + ranking);
					} else {
						console.info(' - verify ranking policy (API name: ' + rankingApiName + ')');
					}
				}

				var channelPromises = [];
				if (channelName) {
					channelPromises.push(serverRest.getChannelWithName({
						server: server,
						name: channelName,
						fields: 'channelTokens'
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
				if (channelName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					} else if (!results[0].data) {
						console.error('ERROR: channel ' + channelName + ' not found');
						return Promise.reject();
					}
					channel = results[0].data;

					var token;
					var tokens = channel.channelTokens;
					if (tokens && tokens.length === 1) {
						token = tokens[0].token;
					} else if (tokens && tokens.length > 0) {
						for (var j = 0; j < tokens.length; j++) {
							if (tokens[j].name === 'defaultToken') {
								token = tokens[j].token;
								break;
							}
						}
						if (!token) {
							token = tokens[0].channelToken;
						}
					}
					channelToken = token;
					console.info(' - validate channel (Id: ' + channel.id + ' token: ' + channelToken + ')');
				}

				// query items
				var q = '';
				if (repository) {
					q = '(repositoryId eq "' + repository.id + '")';
				}
				if (collection) {
					if (q) {
						q = q + ' AND ';
					}
					q = q + '(collections co "' + collection.id + '")';
				}
				if (channel) {
					if (q) {
						q = q + ' AND ';
					}
					q = q + '(channels co "' + channel.id + '")';
				}
				if (query) {
					if (q) {
						q = q + ' AND ';
					}
					q = q + '(' + query + ')';
				}

				if (q) {
					console.info(' - query: ' + q);
				} else {
					console.info(' - query all assets');
				}

				startTime = new Date();
				return serverRest.queryItems({
					server: server,
					q: q,
					fields: 'name,status,slug,language,publishedChannels,languageIsMaster,translatable,createdDate,createdBy,updatedDate,updatedBy,version,versionInfo',
					includeAdditionalData: true,
					orderBy: orderBy,
					rankBy: rankingApiName
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var timeSpent = serverUtils.timeUsed(startTime, new Date());
				items = result && result.data || [];
				total = items.length;
				limit = result.limit;

				console.log(' - items: ' + total + ' of ' + limit + ' [' + timeSpent + ']');

				if (total > 0) {
					_displayAssets(server, propertiesToShow, repository, collection, channel, channelToken, items, showURLS, rankingApiName);
					console.log(' - items: ' + total + ' of ' + limit + ' [' + timeSpent + ']');

					var itemsWithForwardSlashSlug = [];
					items.forEach(function (item) {
						if (item.slug && item.slug.indexOf('/') >= 0) {
							itemsWithForwardSlashSlug.push(item);
						}
					});
					if (itemsWithForwardSlashSlug.length > 0) {
						console.log(' - items with forward slash in slug:');
						let format = '   %-38s %-38s %-10s %-38s %-s';
						console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name', 'Slug'));
						itemsWithForwardSlashSlug.forEach(function (item) {
							console.log(sprintf(format, item.type, item.id, item.language, item.name, item.slug));
						});
					}

					var translationsInDraft = [];
					items.forEach(function (item) {
						if (item.translatable && !item.languageIsMaster && item.status === 'draft') {
							translationsInDraft.push(item);
						}
					});
					if (translationsInDraft.length > 0) {
						console.log(' - non-master translatable items in draft:');
						let format = '   %-38s %-38s %-10s %-s';
						console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name'));
						translationsInDraft.forEach(function (item) {
							console.log(sprintf(format, item.type, item.id, item.language, item.name));
						});
					}
				}

				var validatePromises = [];
				if (validate && items.length > 0) {
					var ids = [];
					items.forEach(function (item) {
						ids.push(item.id);
					});
					validatePromises.push(contentUtils.queryItemsWithIds(server, '', ids, 'typeCategory,language,name'));
				}

				return Promise.all(validatePromises);

			})
			.then(function (results) {
				if (validate && items.length > 0) {
					var notFound = [];
					var validatedItems = results[0];
					if (validatedItems.length !== items.length) {
						items.forEach(function (item) {
							var found = false;
							for (var i = 0; i < validatedItems.length; i++) {
								if (item.id === validatedItems[i].id) {
									found = true;
									break;
								}
							}
							if (!found) {
								notFound.push(item);
							}
						});
					}
					if (notFound.length > 0) {
						console.log(' - items not found:');
						var format = '   %-38s %-38s %-s';
						console.log(sprintf(format, 'Type', 'Id', 'Name'));
						notFound.forEach(function (item) {
							console.log(sprintf(format, item.type, item.id, item.name));
						});
						console.log(JSON.stringify(notFound, null, 4));
					}
					var digitalAssets = [];
					validatedItems.forEach(function (item) {
						if (item.typeCategory === 'DigitalAssetType') {
							digitalAssets.push(item);
						}

					});

					console.log(' - digital items: ' + digitalAssets.length);
					_validateDigitalAssetNativeFile(server, digitalAssets)
						.then(function (result) {
							var noNativeFileItems = result || [];
							if (noNativeFileItems.length > 0) {
								console.log(' - items without native file:');
								let format = '   %-38s %-38s %-10s %-s';
								console.log(sprintf(format, 'Type', 'Id', 'Language', 'Name'));
								noNativeFileItems.forEach(function (item) {
									console.log(sprintf(format, item.type, item.id, item.language, item.name));
								});
							}
							console.log(' - validation finished');
						});

				}

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

var _validateDigitalAssetNativeFile = function (server, items) {
	return new Promise(function (resolve, reject) {
		var total = items.length;
		var groups = [];
		var limit = 10;
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
		var badItems = [];
		var needNewLine = false;
		var startTime = new Date();

		var doValidateAsset = groups.reduce(function (assetPromise, param) {
			return assetPromise.then(function (result) {
				var assetPromises = [];
				for (let i = param.start; i <= param.end; i++) {
					assetPromises.push(serverRest.itemNativeFileExist({ server: server, item: items[i] }));
				}
				return Promise.all(assetPromises)
					.then(function (results) {
						if (console.showInfo()) {
							process.stdout.write(' - validating digital item native files [' + param.start + ', ' + param.end + '] [' + serverUtils.timeUsed(startTime, new Date()) + ']');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
						}
						for (let i = 0; i < results.length; i++) {
							if (results[i].item && !results[i].nativeFileExist) {
								badItems.push(results[i].item);
							}
						}
					})
			});
		},
			Promise.resolve({})
		);

		doValidateAsset.then(function (result) {
			if (needNewLine) {
				process.stdout.write(os.EOL);
			}
			resolve(badItems);
		});
	});
};

var _displayAssets = function (server, propertiesToShow, repository, collection, channel, channelToken, items, showURLS, ranking) {
	var types = [];
	var allIds = [];
	for (var i = 0; i < items.length; i++) {
		allIds.push(items[i].id);
		if (!types.includes(items[i].type)) {
			types.push(items[i].type);
		}
	}

	// help to find item issues
	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir);
	}
	fs.writeFileSync(path.join(buildDir, '__cec_la_itemids.json'), JSON.stringify(allIds.sort(), null, 4));

	// sort types
	var byType = types.slice(0);
	byType.sort(function (a, b) {
		var x = a;
		var y = b;
		return (x < y ? -1 : x > y ? 1 : 0);
	});
	types = byType;

	var list = [];
	for (let i = 0; i < types.length; i++) {
		list.push({
			type: types[i],
			items: []
		});
	}

	for (let i = 0; i < items.length; i++) {
		for (var j = 0; j < list.length; j++) {
			if (items[i].type === list[j].type) {
				list[j].items.push(items[i]);
			}
		}
	}

	// sort name
	/*
	for (var i = 0; i < list.length; i++) {
		var byName = list[i].items.slice(0);
		byName.sort(function (a, b) {
			var x = a.name;
			var y = b.name;
			return (x < y ? -1 : x > y ? 1 : 0);
		});
		list[i].items = byName;
	}
	*/

	var format = '   %-15s %-s';
	if (repository) {
		console.log(sprintf(format, 'Repository:', repository.name));
	}
	if (collection) {
		console.log(sprintf(format, 'Collection:', collection.name));
	}
	if (channel) {
		console.log(sprintf(format, 'Channel:', channel.name));
	}
	console.log(sprintf(format, 'Items:', ''));
	var format2;

	if (showURLS) {
		//
		// Not used anymore
		//
		format2 = '   %-s';
		// console.log(sprintf(format2, 'Name', 'URLs'));
		items.forEach(function (item) {
			var managementUrl = server.url + '/content/management/api/v1.1/items/' + item.id;
			console.log(sprintf(format2, item.name));
			console.log(sprintf(format2, managementUrl));
			if (channelToken && item.status === 'published') {
				var deliveryUrl = server.url + '/content/published/api/v1.1/items/' + item.id + '?channelToken=' + channelToken;
				console.log(sprintf(format2, deliveryUrl));
			}
			console.log('');
		});

	} else {
		// format2 = '   %-38s %-38s %-7s %-10s %-8s %-10s %-s';
		// console.log(sprintf(format2, 'Type', 'Id', 'Version', 'Status', 'Language', 'Size', 'Name'));
		var labels = [];
		format2 = '   ';
		for (let i = 0; i < propertiesToShow.length; i++) {
			let name = propertiesToShow[i];
			labels.push(name[0].toUpperCase() + name.slice(1));
			let f = '%-10s ';
			if (i === propertiesToShow.length - 1) {
				f = '%-s';
			} else {
				if (name === 'id' || name === 'type') {
					f = '%-38s ';
				}
				if (name === 'name') {
					f = '%-30s ';
				}
				if (name === 'version') {
					f = '%-7s ';
				}
				if (name === 'publishedVersion') {
					f = '%-16s ';
				}
				if (name === 'status') {
					f = '%-10s ';
				}
				if (name === 'language') {
					f = '%-8s ';
				}
				if (name === 'size') {
					f = '%-10s ';
				}
				if (name === 'createdBy' || name === 'updatedBy') {
					f = '%-26s ';
				}
				if (name === 'updatedDate' || name === 'createdDate') {
					f = '%-26s ';
				}
			}
			format2 += f;
		}
		// console.log(format2);

		// labels
		console.log(vsprintf(format2, labels));

		var totalSize = 0;
		if (propertiesToShow.includes('type')) {
			for (let i = 0; i < list.length; i++) {
				for (let j = 0; j < list[i].items.length; j++) {
					let item = list[i].items[j];
					if (item.fields && item.fields.size) {
						totalSize = totalSize + item.fields.size;
					}
					// console.log(item);
					/*
					var typeLabel = j === 0 ? item.type : '';
					var sizeLabel = item.fields && item.fields.size ? item.fields.size : '';
					var languageLabel = item.language ? item.language : '';
					console.log(sprintf(format2, typeLabel, item.id, item.latestVersion, item.status, languageLabel, sizeLabel, item.name));
					*/
					let values = [];
					propertiesToShow.forEach(function (name) {
						let value = '';
						if (item.hasOwnProperty(name)) {
							if (name === 'updatedDate' || name === 'createdDate') {
								value = item[name].value;
							} else {
								value = item[name];
							}
						} else {
							if (name === 'size') {
								value = item.fields && item.fields.size ? item.fields.size : '';
							}
						}
						if (name === 'type') {
							if (j > 0) {
								value = '';
							}
						}
						if (value === undefined) {
							value = '';
						}
						values.push(value);
					});
					console.log(vsprintf(format2, values));
				}
			}
		} else {
			for (let i = 0; i < items.length; i++) {
				let values = [];
				let item = items[i];
				if (item.fields && item.fields.size) {
					totalSize = totalSize + item.fields.size;
				}
				propertiesToShow.forEach(function (name) {
					let value = '';
					if (item.hasOwnProperty(name)) {
						if (name === 'updatedDate' || name === 'createdDate') {
							value = item[name].value;
						} else {
							value = item[name];
						}
					} else {
						if (name === 'size') {
							value = item.fields && item.fields.size ? item.fields.size : '';
						}
					}
					if (value === undefined) {
						value = '';
					}
					values.push(value);
				});
				console.log(vsprintf(format2, values));
			}
		}
		console.log('');
		if (propertiesToShow.includes('size') && totalSize > 0) {
			console.log(' - total file size: ' + (Math.floor(totalSize / 1024)) + 'k');
		}
	}

};

module.exports.describeAsset = function (argv, done) {
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
	var item;
	var masterItemId;
	var repository;
	var collections = [];
	var channels = [];
	var itemPublishedChannels = [];
	var referenceItems = [];
	var referencedByItems = [];
	var activities = [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getItem({ server: server, id: id, expand: 'all' })
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				item = result;
				// console.log(JSON.stringify(item, null, 4));

				if (!item.languageIsMaster && item.variations && item.variations.data && item.variations.data.length > 0 && item.variations.data[0].varType === 'language') {
					masterItemId = item.variations.data[0].masterItem;
				}

				if (item.publishedChannels && item.publishedChannels.data && item.publishedChannels.data.length > 0) {
					item.publishedChannels.data.forEach(function (channel) {
						itemPublishedChannels.push(channel.id);
					});
				}
				// get the repository
				return serverRest.getRepository({ server: server, id: item.repositoryId });

			})
			.then(function (result) {

				repository = result && result.id ? result : {};

				// get collections in this repository
				return serverRest.getCollections({ server: server, repositoryId: repository.id });

			})
			.then(function (result) {

				collections = result || [];

				var channelPromises = [];
				if (item.channels && item.channels.data && item.channels.data.length > 0) {
					item.channels.data.forEach(function (channel) {
						channelPromises.push(serverRest.getChannel({ server: server, id: channel.id }));
					});
				}

				return Promise.all(channelPromises);

			})
			.then(function (results) {

				if (results && results.length > 0) {
					results.forEach(function (channel) {
						if (channel && channel.id) {
							channels.push(channel);
						}
					});
				}

				// query item translations

				// query item relations
				var itemReferencesPromises = [];
				if (item.relationships && item.relationships.data && item.relationships.data.references && item.relationships.data.references.length > 0) {
					var refIds = [];
					item.relationships.data.references.forEach(function (refItem) {
						refIds.push(refItem.id);
					});
					if (refIds.length > 0) {
						itemReferencesPromises.push(contentUtils.queryItemsWithIds(server, '', refIds));
					}
				}

				return Promise.all(itemReferencesPromises);

			})
			.then(function (results) {

				referenceItems = results && results[0] || [];

				var referencedByPromises = [];
				if (item.relationships && item.relationships.data && item.relationships.data.referencedBy && item.relationships.data.referencedBy.length > 0) {
					var refByIds = [];
					item.relationships.data.referencedBy.forEach(function (byItem) {
						refByIds.push(byItem.id);
					});
					if (refByIds.length > 0) {
						referencedByPromises.push(contentUtils.queryItemsWithIds(server, '', refByIds));
					}
				}

				return Promise.all(referencedByPromises);

			})
			.then(function (results) {

				referencedByItems = results && results[0] || [];

				// get item's activities
				return serverRest.getItemActivities({ server: server, item: item });

			})
			.then(function (result) {
				activities = result && result.items || [];

				// Display 
				//
				var format1 = '%-38s  %-s';
				var format2 = '  %-36s  %-51s  %-32s  %-s';
				var format3 = '  %-36s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', item.id));
				console.log(sprintf(format1, 'Name', item.name));
				console.log(sprintf(format1, 'Description', item.description || ''));
				console.log(sprintf(format1, 'Created', item.createdDate.value + ' by ' + item.createdBy));
				console.log(sprintf(format1, 'Updated', item.updatedDate.value + ' by ' + item.updatedBy));
				console.log(sprintf(format1, 'Slug', item.slug));
				console.log(sprintf(format1, 'Asset type', item.type));
				console.log(sprintf(format1, 'Status', item.status));
				console.log(sprintf(format1, 'Version', item.version));
				console.log(sprintf(format1, 'Language', item.language || ''));
				console.log(sprintf(format1, 'Translatable', item.translatable ? '√' : ''));
				console.log(sprintf(format1, 'Master', item.languageIsMaster ? '√' : ''));
				if (masterItemId) {
					console.log(sprintf(format1, 'Master item Id', masterItemId));
				}
				console.log(sprintf(format1, 'Published', item.isPublished ? '√' : ''));
				console.log(sprintf(format1, 'Repository', repository.name + ' (Id: ' + repository.id + ')'));
				console.log(sprintf(format1, 'Collections', ''));
				if (collections.length > 0) {
					console.log(sprintf(format3, 'Name', 'Id'));
					collections.forEach(function (col) {
						console.log(sprintf(format3, col.name, col.id));
					});
				}
				console.log(sprintf(format1, 'Channels', ''));
				if (channels.length > 0) {
					console.log(sprintf(format2, 'Name', 'Id', 'Token', 'Published to'));
					channels.forEach(function (channel) {
						var tokens = channel.channelTokens || [];
						var channelToken = '';
						for (var i = 0; i < tokens.length; i++) {
							if (tokens[i].name === 'defaultToken') {
								channelToken = tokens[i].token;
								break;
							}
						}
						var pubished = itemPublishedChannels.includes(channel.id) ? '   √' : '';
						console.log(sprintf(format2, channel.name, channel.id, channelToken, pubished));
					});
				}

				if (item.fields && item.fields.renditions && item.fields.renditions.length > 0) {
					var customRenditions = [];
					item.fields.renditions.forEach(function (rendition) {
						if (rendition.type === 'customrendition') {
							customRenditions.push(rendition.name);
						}
					});
					if (customRenditions.length > 0) {
						console.log(sprintf(format1, 'Custom rendition', customRenditions.join(', ')));
					}
				}
				// translations
				if (item.languageIsMaster && item.variations && item.variations.data && item.variations.data.length > 0 && item.variations.data[0].varType === 'language') {
					var translations = item.variations.data[0].items || [];
					if (translations.length > 1) {
						console.log(sprintf(format1, 'Translations', ''));
						var transFormat = '  %-36s  %-8s  %-10s  %-9s  %-s';
						console.log(sprintf(transFormat, 'Id', 'Language', 'Status', 'Published', 'Name'));
						translations.forEach(function (transItem) {
							if (transItem.id !== item.id) {
								console.log(sprintf(transFormat, transItem.id, transItem.value, transItem.status, transItem.isPublished ? '   √' : '', transItem.name));
							}
						});
					}
				}

				var itemFormat = '  %-36s  %-40s  %-s';
				console.log(sprintf(format1, 'Dependencies', ''));
				if (referenceItems.length > 0) {
					console.log(sprintf(itemFormat, 'Id', 'Type', 'Name'));
					referenceItems.forEach(function (refItem) {
						console.log(sprintf(itemFormat, refItem.id, refItem.type, refItem.name));
					});
				}

				console.log(sprintf(format1, 'Referenced by', ''));
				if (referencedByItems.length > 0) {
					console.log(sprintf(itemFormat, 'Id', 'Type', 'Name'));
					referencedByItems.forEach(function (refItem) {
						console.log(sprintf(itemFormat, refItem.id, refItem.type, refItem.name));
					});
				}

				if (item.taxonomies && item.taxonomies.data && item.taxonomies.data.length > 0) {
					let catFormat = '  %-s';
					console.log(sprintf(format1, 'Categories', ''));
					let taxonomies = item.taxonomies.data;
					// console.log(JSON.stringify(taxonomies, null, 4));
					for (let i = 0; i < taxonomies.length; i++) {
						let tax = taxonomies[i];
						if (tax.categories && tax.categories.length > 0) {
							for (let j = 0; j < tax.categories.length; j++) {
								let cat = tax.categories[j];
								console.log(sprintf(catFormat, tax.shortName + ' | ' + cat.name + ' (' + cat.apiName + ')', ''));

								var nodeStr = '';
								cat.nodes.forEach(function (node) {
									if (nodeStr) {
										nodeStr += ' > ';
									}
									nodeStr += node.name;
								})
								console.log(sprintf(catFormat, nodeStr));
							}
						}

					}
				}

				console.log(sprintf(format1, 'Activity', ''));
				if (activities.length > 0) {
					var actFormat = '  %-10s  %-10s  %-s';
					console.log(sprintf(actFormat, 'Version', 'Language', 'Details'));
					activities.forEach(function (act) {
						var details = act.activityDetails;
						var message = act.message;
						var version = details && details.version || '';
						var event = details && details.source || '';
						var lang = details && details.language || '';
						console.log(sprintf(actFormat, version, lang, event));
						console.log(sprintf(actFormat, '', '', act.registeredAt + ' by ' + act.initiatedBy.displayName));
						if (act.message && act.message.text) {
							console.log(sprintf(actFormat, '', '', act.message.text));
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

/**
 * List scheduled publish jobs
 */
module.exports.listScheduledJobs = function (argv, done) {
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

	var repositoryName = argv.repository;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repositories = [];

		var repositoryPromise;
		if (repositoryName) {
			repositoryPromise = serverRest.getRepositoryWithName({
				server: server,
				name: repositoryName
			});
		} else {
			// get all repositories
			repositoryPromise = serverRest.getRepositories({ server: server });
		}
		repositoryPromise.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			if (repositoryName) {
				if (!result.data) {
					console.error('ERROR: repository ' + repositoryName + ' not found');
					return Promise.reject();
				}
				repositories.push(result.data);
				console.info(' - validate repository (Id: ' + repositories[0].id + ')');

			} else {
				repositories = result || [];
				if (repositories.length === 0) {
					console.error('ERROR: no repository');
					return Promise.reject();
				}
				// console.info(' - total repositories: ' + repositories.length);
			}

			return _getScheduledJobs(server, repositories);
		})
			.then(function (result) {
				// console.log(result);
				var allJobs = result || [];
				var repoJobs = [];
				allJobs.forEach(function (jobs) {
					var repo;
					if (jobs && jobs.length > 0) {
						for (var i = 0; i < repositories.length; i++) {
							if (repositories[i].id === jobs[0].repositoryId) {
								repo = repositories[i];
								break;
							}
						}
					}
					if (repo) {
						repoJobs.push({
							repository: repo,
							jobs: jobs
						});
					}
				});

				if (repoJobs.length === 0) {
					console.log(' - no scheduled job');
				} else {
					console.log('');
				}
				// display
				var format = '   %-32s  %-32s  %-10s  %-12s  %-24s  %-24s  %-s';
				repoJobs.forEach(function (repoJob) {
					var repo = repoJob.repository;
					var jobs = repoJob.jobs;
					if (jobs.length > 0) {
						console.log('Repository: ' + repo.name + ' (Id: ' + repo.id + ')');
						// console.log(JSON.stringify(jobs, null, 4));
						console.log(sprintf(format, 'Id', 'Name/Description', 'Status', 'Frequency', 'Next Run', 'CreatedAt', 'CreatedBy'));
						for (var i = 0; i < jobs.length; i++) {
							var job = jobs[i];
							// child jobs do not have ID
							if (job.id) {
								var frequency = job.schedule && job.schedule.frequency || '';
								var nextrun = job.nextRunTime && job.nextRunTime.value || '';
								var createdAt = job.createdAt && job.createdAt.value || '';
								var createdBy = job.createdBy ? (job.createdBy.displayName || job.createdBy.username) : '';
								console.log(sprintf(format, job.id, job.name || job.description, job.status, frequency, nextrun, createdAt, createdBy));
							}
						}
						console.log('  total jobs: ' + jobs.length);
						console.log('');
					}
				});

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

var _getScheduledJobs = function (server, repositories) {
	return new Promise(function (resolve, reject) {
		var total = repositories.length;
		var groups = [];
		var limit = 10;
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

		var jobData = [];

		var doGetJobs = groups.reduce(function (jobPromise, param) {
			return jobPromise.then(function (result) {
				var jobPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					jobPromises.push(serverRest.getScheduledJobs({
						server: server,
						repositoryId: repositories[i].id
					}));
				}

				return Promise.all(jobPromises).then(function (results) {
					jobData = jobData.concat(results);
				});

			});
		},
			// Start with a previousPromise value that is a resolved promise
			Promise.resolve({}));

		doGetJobs.then(function (result) {
			resolve(jobData);
		});

	});
};


/**
 * List properties of a scheduled publish job
 */
module.exports.describeScheduledJob = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var job;
		var repository;
		var items = [];

		serverRest.getScheduledJob({ server: server, id: id, expand: 'items,validationResults' })
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				job = result;

				return serverRest.getRepository({ server: server, id: job.repositoryId });

			})
			.then(function (result) {

				repository = result && result.id ? result : {};

				var itemsPromises = [];
				if (job.items && job.items.length > 0) {
					var itemIds = job.items.concat(job.dependencies);
					itemsPromises.push(contentUtils.queryItemsWithIds(server, '', itemIds));
				}

				return Promise.all(itemsPromises);

			})
			.then(function (results) {

				if (job.items && job.items.length > 0) {
					items = results && results[0] || [];
				}

				// console.log(JSON.stringify(job, null, 4));

				var schedule = job.schedule && job.schedule.at ? (job.schedule.at.date + ' ' + job.schedule.at.time + ' ' + job.schedule.at.timezone) : '';

				var format1 = '%-38s  %-s';
				console.log('');
				console.log(sprintf(format1, 'Id', job.id));
				if (job.parentJobId && job.id !== job.parentJobId) {
					console.log(sprintf(format1, 'ParentJobId', job.parentJobId));
				}
				console.log(sprintf(format1, 'Name', job.name));
				console.log(sprintf(format1, 'Description', job.description || ''));
				console.log(sprintf(format1, 'Repositiory', repository.name + ' (Id: ' + job.repositoryId + ')'));
				console.log(sprintf(format1, 'Created', job.createdAt.value + ' by ' + (job.createdBy.displayName || job.createdBy.username)));
				console.log(sprintf(format1, 'Updated', job.updatedAt.value + ' by ' + (job.updatedBy.displayName || job.updatedBy.username)));
				console.log(sprintf(format1, 'Schedule', schedule));
				console.log(sprintf(format1, 'Frequency', job.schedule && job.schedule.frequency || ''));
				console.log(sprintf(format1, 'Next run', job.nextRunTime && job.nextRunTime.value || ''));
				console.log(sprintf(format1, 'Status', job.status));

				if (job.validationResults && job.validationResults.data && job.validationResults.data.length > 0) {
					var policyValidation = job.validationResults.data[0].policyValidation;
					if (policyValidation && policyValidation.channels && policyValidation.channels.length > 0) {
						console.log(sprintf(format1, 'Validation:', ''));
						var format3 = '  %-38s  %-38s  %-s';
						var validLabel = policyValidation.valid ? '  √' : '';
						console.log(sprintf(format3, 'Channel', 'Policy', 'Valid'));
						policyValidation.channels.forEach(function (channel) {
							var policy = channel.variationPolicies && channel.variationPolicies.length > 0 ? channel.variationPolicies[0].name : '';
							console.log(sprintf(format3, channel.name, policy, validLabel));
						});
					}
				}

				if (items.length > 0) {
					console.log(sprintf(format1, 'Items:', ''));
					var format2 = '  %-38s  %-30s  %-10s  %-s';
					console.log(sprintf(format2, 'Id', 'Type', 'Language', 'Name'));
					items.forEach(function (item) {
						console.log(sprintf(format2, item.id, item.type, item.language, item.name));
					});
				}

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

/**
 * List properties of a scheduled publish job
 */
module.exports.updateRenditionJob = function (argv, done) {
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

	var jobValues;
	try {
		jobValues = JSON.parse(argv.job);
	} catch (e) {
		console.error('Error: the rendition job is invalid: ' + argv.job);
		done();
		return;
	}

	var jobId = jobValues.jobId;
	if (!jobId) {
		console.error('Error: no job Id is specified: ' + argv.job);
		done();
		return;
	}

	var filePath = argv.file;
	var fileName;
	if (filePath) {
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(projectDir, filePath);
		}
		filePath = path.resolve(filePath);
		fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

		if (!fs.existsSync(filePath)) {
			console.error('ERROR: file ' + filePath + ' does not exist');
			done();
			return;
		}
		if (fs.statSync(filePath).isDirectory()) {
			console.error('ERROR: ' + filePath + ' is not a file');
			done();
			return;
		}
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		if (filePath) {
			jobValues.multipart = true;
			jobValues.filePath = filePath;
			jobValues.filename = fileName;
		}
		console.log(jobValues);

		jobValues.server = server;

		serverRest.getItemOperationStatus({ server: server, statusId: jobId, hideError: true })
			.then(function (result) {
				if (!result || result.err || !result.id || result.id !== jobId) {
					console.error('ERROR: invalid job Id: ' + jobId);
					return Promise.reject();
				}

				if (jobValues.progress === '100' && !filePath) {
					console.error('ERROR: job data file is not provided');
					return Promise.reject();
				}
				// console.log(result);
				if (result.completedPercentage === 100) {
					console.log(' - the job is already completed');
					done(true);
				} else {
					// update the job
					serverRest.updateRenditionStatus(jobValues)
						.then(function (result) {
							if (!result || result.error) {
								console.log(result);
								done();
							} else {
								console.log(' - rendition job updated');
								done(true);
							}
						});
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


/**
 * Rename asset ids
 */
module.exports.renameAssetIds = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var templateName = argv.template;

	if (!fs.existsSync(path.join(templatesSrcDir, templateName))) {
		console.error('ERROR: template ' + templateName + ' does not exist');
		done();
		return;
	}
	console.info(' - template ' + templateName);

	var contentNames = argv.content ? argv.content.split(',') : [];
	var goodContent = [];
	if (contentNames.length > 0 && fs.existsSync(contentSrcDir)) {
		contentNames.forEach(function (name) {
			if (fs.existsSync(path.join(contentSrcDir, name))) {
				goodContent.push(name);
			} else {
				console.error('ERROR: content ' + name + ' does not exist');
			}
		});
	}
	if (goodContent.length > 0) {
		console.info(' - other content ' + goodContent);
	}

	_renameAssetIds(argv, templateName, goodContent)
		.then(function (result) {
			console.log(' - finished');
			done(true);
		});
};

var _renameAssetIds = function (argv, templateName, goodContent) {
	verifyRun(argv);

	return new Promise(function (resolve, reject) {
		var idMap = new Map();

		var _processItems = function (itemsPath) {
			console.info(' - process content items in ' + itemsPath.substring(projectDir.length + 1));
			var types = fs.readdirSync(itemsPath);
			types.forEach(function (type) {
				if (type !== 'VariationSets') {
					var typePath = path.join(itemsPath, type);

					var items = fs.readdirSync(typePath);
					for (var i = 0; i < items.length; i++) {
						var fileName = items[i];
						if (serverUtils.endsWith(fileName, '.json')) {
							var itemId = fileName.substring(0, fileName.length - 5);

							var newId;
							if (idMap.get(itemId)) {
								newId = idMap.get(itemId);
								// console.log('*** id already created');
							} else {
								var isMedia = itemId.startsWith('CONT');
								newId = serverUtils.createAssetGUID(isMedia);
								// console.log('*** new id ' + newId);
								idMap.set(itemId, newId);
							}

							// rename the json file
							var newFile = newId + '.json';
							fs.renameSync(path.join(typePath, fileName), path.join(typePath, newFile));
							// console.log(' - rename file ' + fileName + ' => ' + newFile);

						}
					}

					if (fs.existsSync(path.join(typePath, 'files'))) {
						// rename the folder name under files
						var files = fs.readdirSync(path.join(typePath, 'files'));
						files.forEach(function (folder) {
							var folderPath = path.join(typePath, 'files', folder);
							var stat = fs.statSync(folderPath);
							if (stat.isDirectory()) {
								var newFolder = idMap.get(folder);
								if (newFolder) {
									fse.moveSync(folderPath, path.join(typePath, 'files', newFolder));
									// console.log(' - rename folder ' + folder + ' => ' + newFolder);
								}
							}
						});
					}
				}
			});
		};

		// collect all asset ids from template
		var itemsFolder = path.join(templatesSrcDir, templateName, 'assets', 'contenttemplate',
			'Content Template of ' + templateName, 'ContentItems');
		if (fs.existsSync(itemsFolder)) {
			_processItems(itemsFolder);
		}

		// collect all asset ids from other content
		goodContent.forEach(function (content) {
			var itemsFolder = path.join(contentSrcDir, content, 'contentexport', 'ContentItems');
			if (fs.existsSync(itemsFolder)) {
				_processItems(itemsFolder);
			}
		});

		console.info(' - total Ids: ' + idMap.size);
		// console.log(idMap);

		// update all json files under content assets
		var contentFolders = [];
		contentFolders.push(path.join(templatesSrcDir, templateName, 'assets', 'contenttemplate'));
		goodContent.forEach(function (content) {
			contentFolders.push(path.join(contentSrcDir, content, 'contentexport'));
		});
		// console.log(contentFolders);

		// update ids in site pages
		contentFolders.push(path.join(templatesSrcDir, templateName, 'pages'));

		var doIdUpdate = contentFolders.reduce(function (idPromise, contentPath) {
			return idPromise.then(function (result) {
				return _updateIdInFiles(contentPath, idMap).then(function (result) {
					// done
				})
					.catch((error) => {
						// 
					});
			});
		},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doIdUpdate.then(function (result) {
			var doZip = goodContent.reduce(function (zipPromise, content) {
				return zipPromise.then(function (result) {
					var contentpath = path.join(contentSrcDir, content);
					// same file name as in the upload script from transfer-site-content
					var contentfilename = content + '_export.zip';
					return _zipContent(contentpath, contentfilename).then(function (result) {
						// done
					})
						.catch((error) => {
							// 
						});
				});
			},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doZip.then(function (result) {
				return resolve({});
			});
		});
	});
};

var _updateIdInFiles = function (folderPath, idMap) {
	console.info(' - replace Id in files under ' + folderPath.substring(projectDir.length + 1));
	return new Promise(function (resolve, reject) {
		serverUtils.paths(folderPath, function (err, paths) {
			if (err) {
				console.error(err);
			} else {
				var files = paths.files;
				for (var i = 0; i < files.length; i++) {
					var filePath = files[i];
					if (filePath.endsWith('.json')) {
						var fileSrc = fs.readFileSync(filePath).toString();
						// update slug 
						try {
							var fileJson = JSON.parse(fileSrc);
							if (fileJson && fileJson.id && fileJson.slug) {
								fileJson.slug = fileJson.slug + '_' + fileJson.id;
								fileSrc = JSON.stringify(fileJson);
							}
						} catch (e) {
							// handle invalid json
						}

						var newFileSrc = fileSrc;
						for (const [id, newId] of idMap.entries()) {
							newFileSrc = serverUtils.replaceAll(newFileSrc, id, newId);
						}

						if (fileSrc !== newFileSrc) {
							fs.writeFileSync(filePath, newFileSrc);
							// console.log('    ' + filePath.replace((projectDir + path.sep), ''));
						}
					}
				}
			}
			return resolve({});
		});
	});
};

var _zipContent = function (contentpath, contentfilename) {
	return new Promise(function (resolve, reject) {
		//
		// create the content zip file
		// 
		gulp.src(contentpath + '/**', {
			base: contentpath
		})
			.pipe(zip(contentfilename, {
				buffer: false
			}))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', function () {
				var zippath = path.join(projectDir, 'dist', contentfilename);
				console.info(' - created content file ' + zippath);
				return resolve({});
			});

	});
};


//////////////////////////////////////////////////////////////////////////
//    MS word support
//////////////////////////////////////////////////////////////////////////
/** 
 * 2021-08-20 removed
var MSWord = require('./msword/js/msWord.js');
var Files = require('./msword/js/files.js');
const {
	type
} = require('os');

module.exports.createMSWordTemplate = function (argv, done) {
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

	var type = argv.type;
	var name = argv.name;
	var templateName = name || type;
	var format = argv.format || 'form';

	if (!fs.existsSync(wordTemplatesSrcDir)) {
		fs.mkdirSync(wordTemplatesSrcDir);
	}
	var destFld = path.join(wordTemplatesSrcDir, templateName);

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		serverRest.getContentType({
				server: server,
				name: type
			}).then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				console.log(' - verify type ' + type);
				console.log(' - template format ' + format);

				_generateWordTemplate(result, destFld, templateName, format)
					.then(function (result) {
						done(true);
					});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done();
			});
	});

};

var _generateWordTemplate = function (type, destFld, templateName, format) {
	var cecDir = path.join(__dirname, "..");
	return new Promise(function (resolve, reject) {
		var msWord = new MSWord();
		var main = {
			extensionPath: path.join(cecDir, 'bin', 'msword'),
			destFld: destFld,
			templateName: templateName,
			rootTmpDir: wordTemplatesSrcDir
		};
		msWord.init(main);

		var contentTypeFields = [];
		type.fields.forEach(function (field) {
			const item = {
				description: field.description,
				datatype: field.datatype,
				name: field.name,
				defaultValue: field.defaultValue,
				referenceType: null,
				referenceFields: [],
				settings: {
					type: '',
					options: {
						min: null,
						max: null,
						labelOn: null,
						labelOff: null,
						label: null,
						mediaTypes: []
					}
				}
			};

			if (Object.prototype.hasOwnProperty.call(field, "referenceType")) {
				item.referenceType = field.referenceType.type;
				if (item.referenceType.toLowerCase() === 'digitalasset') {
					if (Object.prototype.hasOwnProperty.call(field.settings.caas.editor.options, "mediaTypes") &&
						field.settings.caas.editor.options.mediaTypes.length) {
						item.settings.options.mediaTypes = field.settings.caas.editor.options.mediaTypes.slice();
					}
				} else { // Other content types
					// params.contentTypeReferences.push(item.referenceType);
					// console.log('*** other content type ignored');
				}
			}

			if (field.settings.caas.customValidators.length) {
				item.settings.options.min = field.settings.caas.customValidators[0].options.min;
				item.settings.options.max = field.settings.caas.customValidators[0].options.max;
			}
			if (item.datatype === "boolean") {
				item.settings.type = field.settings.caas.editor.name; // boolean-switch; boolean-checkbox

				if (Object.prototype.hasOwnProperty.call(field.settings.caas.editor.options, "labels")) {
					item.settings.options.labelOn = field.settings.caas.editor.options.labels.on;
					item.settings.options.labelOff = field.settings.caas.editor.options.labels.off;
				}
				if (Object.prototype.hasOwnProperty.call(field.settings.caas.editor.options, "label")) {
					item.settings.options.label = field.settings.caas.editor.options.label;
				}
			}
			// console.log('******');
			// console.log(JSON.stringify(item, null, 4));
			contentTypeFields.push(item);
		});
		// console.log(contentTypeFields);

		var info = {
			projectDir: projectDir,
			exportType: true,
			frmBase: format === 'form',
			contentTypeName: type.name,
			fields: contentTypeFields
		};

		msWord.exportData(info);
		resolve({});

	});
};


module.exports.createContentItem = function (argv, done) {
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

	var filePath = argv.file;
	if (!path.isAbsolute(filePath)) {
		filePath = path.join(projectDir, filePath);
	}
	filePath = path.resolve(filePath);

	if (!fs.existsSync(filePath)) {
		console.log('ERROR: file ' + filePath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(filePath).isFile()) {
		console.log('ERROR: file ' + filePath + ' is not a file');
		done();
		return;
	}

	var type = argv.type;

	var repositoryName = argv.repository;
	var repository;
	var wordItem;
	var hasError;

	// local timezone
	process.env.TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var repositoryPromise = serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName
		});
		repositoryPromise.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.log(' - get repository (Id: ' + repository.id + ' language: ' + repository.defaultLanguage + ')');

				if (type === 'word') {
					_createItemFromWord(server, filePath, repository)
						.then(function (result) {
							if (result.err) {
								return Promise.reject();
							}

							wordItem = result;
							// console.log(wordItem.fields);

							hasError = false;
							var createDigitalAssetPromises = [];
							for (var i = 0; i < wordItem.fields.length; i++) {
								var field = wordItem.fields[i];
								if (field.datatype === 'reference_image' || field.datatype === 'reference_path') {
									if (!fs.existsSync(field.val)) {
										console.log('ERROR: file ' + field.val + ' does not exist');
										hasError = true;
										break;
									} else {

										createDigitalAssetPromises.push(serverRest.createDigitalItem({
											server: server,
											repositoryId: repository.id,
											type: 'Image',
											filename: field.val.substring(field.val.lastIndexOf(path.sep) + 1),
											contents: fs.createReadStream(field.val)
										}));

									}
								}
							}
							if (hasError) {
								return Promise.reject();
							}

							if (createDigitalAssetPromises.length > 0) {
								console.log(' - creating digital assets...');
							}

							return Promise.all(createDigitalAssetPromises);

						})
						.then(function (results) {
							var digitalAssets = results || [];
							hasError = false;
							for (var i = 0; i < digitalAssets.length; i++) {
								if (digitalAssets[i].filePath && (digitalAssets[i].err || !digitalAssets[i].assetId)) {
									hasError = true;
								} else {
									console.log(' - create digital asset ' + digitalAssets[i].fileName + ' (Id: ' + digitalAssets[i].assetId + ')');
								}
							}
							if (hasError) {
								return Promise.reject();
							}

							var fields = {};
							for (var i = 0; i < wordItem.fields.length; i++) {
								var field = wordItem.fields[i];
								if (field.datatype === 'reference_image' || field.datatype === 'reference_path') {
									for (var j = 0; j < digitalAssets.length; j++) {
										if (digitalAssets[j].filePath === field.val) {
											fields[field.name] = {
												type: 'DigitalAsset',
												id: digitalAssets[j].assetId,
												name: digitalAssets[j].fileName
											};
										}
									}
								} else if (field.datatype === 'datetime') {
									var dateVal = field.val;
									var timeZoneOffset = ('00' + ((new Date(dateVal)).getTimezoneOffset() / 60)).slice(-2);
									var time = serverUtils.replaceAll(dateVal, 'Z', '.000-' + timeZoneOffset + ':00');
									// console.log(field.val + ' => ' + time);
									fields[field.name] = {
										value: time,
										timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
									};
								} else {
									fields[field.name] = field.val;
								}
							}
							var item = {
								type: wordItem.contentTypeName,
								name: wordItem.contentItemName,
								description: wordItem.contentItemDesc ? wordItem.contentItemDesc : '',
								fields: fields
							};
							// console.log(item);
							return serverRest.createItem({
								server: server,
								repositoryId: repository.id,
								type: item.type,
								name: item.name,
								desc: item.desc,
								fields: item.fields,
								language: repository.defaultLanguage
							});
						})
						.then(function (result) {
							if (result.err || !result.id) {
								return Promise.reject();
							}
							// console.log(result);
							console.log(' - create content item ' + result.name + ' (Id: ' + result.id + ')');

							done(true);
						})
						.catch((error) => {
							if (error) {
								console.log(error);
							}
							done();
						});

				} else {

					console.log(' - item source type ' + type + ' not supported yet');
					done();
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

var _createItemFromWord = function (server, filePath, repository) {
	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir);
	}
	var itemsBuildPath = path.join(buildDir, 'items');
	if (!fs.existsSync(itemsBuildPath)) {
		fs.mkdirSync(itemsBuildPath);
	}
	return new Promise(function (resolve, reject) {
		var fileName = filePath.substring(filePath.lastIndexOf(path.sep) + 1);
		if (fileName.indexOf('.') > 0) {
			fileName = fileName.substring(0, fileName.lastIndexOf('.'));
		}

		var itemDir = path.join(itemsBuildPath, fileName);
		if (fs.existsSync(itemDir)) {
			fileUtils.remove(itemDir);
		}
		fs.mkdirSync(itemDir);

		// unzip the docx file
		fileUtils.extractZip(filePath, itemDir)
			.then(function (result) {
				if (result === 'err') {
					return Promise.reject();
				}

				// verify the docx
				if (!fs.existsSync(path.join(itemDir, '[Content_Types].xml'))) {
					console.log('ERROR: file ' + filePath + ' is not a valid docx file');
					return Promise.reject();
				}

				console.log(' - unzip file');

				var msWord = new MSWord();
				var main = {
					xmlRootFld: itemDir
				};
				msWord.init(main);

				msWord.importData().then(function (data) {
					// console.log(data);
					if (data && data.contentTypeName && data.contentItemName && data.fields && data.fields.length > 0) {
						console.log(' - get content item info');

						return resolve(data);

					} else {
						console.log('ERROR: failed to get item info');
						return resolve({
							err: 'err'
						});
					}
				});

			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});

	});
};
*/

// export non "command line" utility functions
module.exports.utils = {
	renameAssetIds: _renameAssetIds
};
