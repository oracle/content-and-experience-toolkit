/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	componentUtils = require('./component.js').utils,
	contentUtils = require('./content.js').utils,
	fs = require('fs'),
	fse = require('fs-extra'),
	gulp = require('gulp'),
	sprintf = require('sprintf-js').sprintf,
	path = require('path'),
	zip = require('gulp-zip');

var projectDir,
	buildDir,
	componentsSrcDir,
	contentSrcDir,
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
	templatesSrcDir = path.join(srcfolder, 'templates');
	typesSrcDir = path.join(srcfolder, 'types');

	wordTemplatesSrcDir = path.join(srcfolder, 'msword');

	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
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
	console.log(' - server: ' + server.url);

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
			console.log(result.statusMessage);
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
				console.log(' - verify repository name');

				// get content types
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
				for (var i = 0; i < results.length; i++) {
					if (results[i].err) {
						return Promise.reject();
					}
				}
				if (typeNames.length > 0) {
					console.log(' - verify content types');
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
						console.log('ERROR: channel ' + channelNames[i] + ' does not exist');
						return Promise.reject();
					}
				}
				if (channelNames.length > 0) {
					console.log(' - verify channels');
				}

				for (var i = 0; i < typeNames.length; i++) {
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
					console.log(error);
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
	console.log(' - server: ' + server.url);

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
			console.log(result.statusMessage);
			done();
			return;
		}

		var exitCode;
		serverRest.getRepositories({
				server: server
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
									console.log('ERROR: repository ' + name + ' is a business repository');
								} else if (action === 'remove-channel') {
									console.log(' - repository ' + name + ' is a business repository');
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
						console.log('ERROR: repository ' + name + ' does not exist');
					}
				});

				if (allRepos.length === 0) {
					return Promise.reject();
				}
				console.log(' - verify ' + (allRepos.length === 1 ? 'repository' : 'repositories'));

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
					console.log(' - verify content types');
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
						console.log('ERROR: channel ' + channelNames[i] + ' does not exist');
					}
				}
				if (channelNames.length > 0) {
					if (channels.length === 0) {
						return Promise.reject();
					}
					console.log(' - verify channels');
				}

				// get taxonomies
				var taxPromises = [];
				if (taxNames.length > 0) {
					taxPromises.push(serverRest.getTaxonomies({
						server: server
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
						console.log('ERROR: taxonomy ' + taxNames[i] + ' does not exist');
						// return Promise.reject();
					} else if (!foundPromoted) {
						console.log('ERROR: taxonomy ' + taxNames[i] + ' does not have promoted version');
						// return Promise.reject();
					}
				}
				if (finalTaxNames.length > 0) {
					console.log(' - verify ' + (finalTaxNames.length > 1 ? 'taxonomies' : 'taxonomy'));
				} else if (taxNames.length > 0) {
					return Promise.reject();
				}

				// get translation connectors
				var connectorPromises = [];
				for (var i = 0; i < connectorNames.length; i++) {
					connectorPromises.push(serverRest.getTranslationConnector({
						server: server,
						name: connectorNames[i]
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
						console.log('ERROR: translation connector ' + connectorName + ' does not exist or is not enabled');
					}
				});
				if (connectorNames.length > 0) {
					if (finalConnectorNames.length > 0) {
						console.log(' - verify translation connector' + (finalConnectorNames.length > 1 ? 's' : ''));
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
							console.log('ERROR: editorial role ' + name + ' does not exist');
						}
					});
					if (finalRoleNames.length > 0) {
						console.log(' - verify editorial role' + (finalRoleNames.length > 1 ? 's' : ''));
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
					console.log(error);
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
						finalConnectors = finalChannels.concat(connectors);
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
					} else {
						console.log('ERROR: invalid action ' + action);
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
	console.log(' - server: ' + server.url);

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
			console.log(result.statusMessage);
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
						repository = repositories[i];
						break;
					}
				}
				if (!repository) {
					console.log('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}
				console.log(' - verify repository');

				if (repository.contentTypes) {
					for (var i = 0; i < repository.contentTypes.length; i++) {
						if (!['Image', 'File', 'Video'].includes(repository.contentTypes[i].name)) {
							typeNames.push(repository.contentTypes[i].name);
						}
					}
				}
				if (shareTypes) {
					if (typeNames.length === 0) {
						console.log(' - no content types in the repository');
					} else {
						console.log(' - repository includes content type ' + typeNames.join(', '));
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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
							// return Promise.reject();
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}
				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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

				for (var i = 0; i < users.length; i++) {
					var granted = false;
					for (var j = 0; j < existingPermissions.length; j++) {
						var perm = existingPermissions[j];
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

				return serverRest.performPermissionOperation({
					server: server,
					operation: 'share',
					resourceId: repository.id,
					resourceType: 'repository',
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
							for (var i = 0; i < goodTypeNames.length; i++) {
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
	console.log(' - server: ' + server.url);

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
			console.log(result.statusMessage);
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
						repository = repositories[i];
						break;
					}
				}
				if (!repository) {
					console.log('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}
				console.log(' - verify repository');

				if (repository.contentTypes) {
					for (var i = 0; i < repository.contentTypes.length; i++) {
						typeNames.push(repository.contentTypes[i].name);
					}
				}
				if (unshareTypes) {
					if (typeNames.length === 0) {
						console.log(' - no content types in the repository');
					} else {
						console.log(' - repository includes content type ' + typeNames.join(', '));
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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
							// return Promise.reject();
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
			console.log('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.log('ERROR: ' + outputFolder + ' is not a folder');
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

		serverRest.getRepositoryWithName({
				server: server,
				name: name
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repo = result.data;
				// console.log(repo);
				if (!repo || !repo.id) {
					console.log('ERROR: repository ' + name + ' does not exist');
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

	console.log(' - server: ' + server.url);

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

				console.log(' - verify type');

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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
						var perm = existingPermissions[j];
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

	console.log(' - server: ' + server.url);

	var name = argv.name;
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];

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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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

	console.log(' - server: ' + server.url);

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
			console.log(result.statusMessage);
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
						for (var i = 0; i < typeCustomForms.length; i++) {
							if (!customForms.includes(typeCustomForms[i])) {
								customForms.push(typeCustomForms[i]);
								comps.push(typeCustomForms[i]);
							}
						}

						var typeContentLayouts = serverUtils.getTypeContentLayouts(typeObj);
						for (var i = 0; i < typeContentLayouts.length; i++) {
							if (!contentLayouts.includes(typeContentLayouts[i])) {
								contentLayouts.push(typeContentLayouts[i]);
								comps.push(typeContentLayouts[i]);
							}
						}
					}

				});

				if (customEditors.length > 0) {
					console.log(' - will download content field editor ' + customEditors.join(', '));
				}
				if (customForms.length > 0) {
					console.log(' - will download content form ' + customForms.join(', '));
				}
				if (contentLayouts.length > 0) {
					console.log(' - will download content layout ' + contentLayouts.join(', '));
				}

				if (comps.length === 0) {
					done(true);
				} else {
					componentUtils.downloadComponents(server, comps, argv)
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

	console.log(' - server: ' + server.url);
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
				console.log('ERROR: file ' + filePath + ' does not exist');
			} else {
				var typeObj;
				try {
					typeObj = JSON.parse(fs.readFileSync(filePath));
				} catch (e) {

				}
				if (!typeObj || !typeObj.id || !typeObj.name || !typeObj.typeCategory) {
					console.log('ERROR: file ' + filePath + ' is not a valid type definition');
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
				console.log('ERROR: type ' + name + ' does not exist');
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
			console.log(' - will upload content field editor ' + customEditors.join(', '));
		}
		if (customForms.length > 0) {
			console.log(' - will upload content form ' + customForms.join(', '));
		}
		if (contentLayouts.length > 0) {
			console.log(' - will upload content layout ' + contentLayouts.join(', '));
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
					console.log(' - will create type ' + typeNamesToCreate.join(', '));
				}
				if (typesToUpdate.length > 0) {
					console.log(' - will update type ' + typeNamesToUpdate.join(', '));
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
			console.log('ERROR: component ' + comp + ' does not exist');
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
								return componentUtils.uploadComponent(server, folder, folderId, zipfile, name, publish)
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
			console.log(result.statusMessage);
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

				console.log(' - validate type ' + srcTypeName);
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
	console.log(' - server: ' + server.url);

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
				name: repositoryName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.log(' - get repository (Id: ' + repository.id + ')');

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
							console.log('ERROR: channel ' + channelName + ' does not exist');
						} else {
							// check if the channel is added to the repository
							var channelInRepo = false;
							for (var i = 0; i < repository.channels.length; i++) {
								if (channel.id === repository.channels[i].id) {
									channelInRepo = true;
									break;
								}
							}
							if (!channelInRepo) {
								console.log('ERROR: channel ' + channelName + ' is not a publishing channel for repository ' + repositoryName);
							} else {
								defaultChannels.push({
									id: channel.id,
									name: channel.name
								});
								defaultChannelNames.push(channel.name);
							}
						}
					});

					console.log(' - default channels: ' + defaultChannelNames);
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
	console.log(' - server: ' + server.url);

	var action = argv.action;
	var repositoryName = argv.repository;
	var collectionNames = argv.collections ? argv.collections.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];
	var role = argv.role;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var repository;
		var collections = [];

		serverRest.getRepositoryWithName({
				server: server,
				name: repositoryName
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.log(' - get repository (Id: ' + repository.id + ')');

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
				var repoCollectionNames = [];
				repoCollections.forEach(function (col) {
					repoCollectionNames.push(col.name);
				});
				if (repoCollectionNames.length > 0) {
					console.log(' - repository collections: ' + repoCollectionNames);
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
						console.log('ERROR: collection ' + name + ' does not exist');
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
						console.log('ERROR: channel ' + channelName + ' does not exist');
					} else {
						// check if the channel is added to the repository
						var channelInRepo = false;
						for (var i = 0; i < repository.channels.length; i++) {
							if (channel.id === repository.channels[i].id) {
								channelInRepo = true;
								break;
							}
						}
						if (!channelInRepo) {
							console.log('ERROR: channel ' + channelName + ' is not a publishing channel for repository ' + repository.name);
						} else {
							defaultChannels.push({
								id: channel.id,
								name: channel.name
							});
							defaultChannelNames.push(channel.name);
						}
					}
				});

				console.log(' - channels to ' + action.substring(0, action.indexOf('-')) + ': ' + defaultChannelNames);

				var updateCollectionPromises = [];

				if (defaultChannels.length === 0) {
					console.log('ERROR: no valid channel to add or remove');
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
							for (var i = 0; i < defaultChannels.length; i++) {
								var idx = undefined;
								for (var j = 0; j < finalChannels.length; j++) {
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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
										var perm = existingPermissions[j];
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
					console.log(error);
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
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var channelType = argv.type || 'public';
	var publishPolicy = argv.publishpolicy || 'anythingPublished';
	var localizationPolicyName = argv.localizationpolicy;

	var localizationId;
	var exitCode;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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
					console.log('ERROR: localization policy ' + localizationPolicyName + ' does not exist');
					return Promise.reject();
				}
				if (localizationPolicyName) {
					console.log(' - verify localization policy ');
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

	console.log(' - server: ' + server.url);

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
					console.log('ERROR: channel ' + name + ' not found');
					return Promise.reject();
				}
				channel = result.data;

				if (channel.isSiteChannel) {
					console.log('ERROR: channel ' + name + ' is a site channel');
					return Promise.reject();
				}

				console.log(' - verify channel');

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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
						var perm = existingPermissions[j];
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

	console.log(' - server: ' + server.url);

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
					console.log('ERROR: channel ' + name + ' not found');
					return Promise.reject();
				}
				channel = result.data;

				if (channel.isSiteChannel) {
					console.log('ERROR: channel ' + name + ' is a site channel');
					return Promise.reject();
				}

				console.log(' - verify channel');

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
					console.log(' - verify groups');

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
							console.log('ERROR: group ' + groupNames[i] + ' does not exist');
						}
					}
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
					console.log(' - verify users');
				}

				// verify users
				for (var k = 0; k < userNames.length; k++) {
					var found = false;
					for (var i = 0; i < allUsers.length; i++) {
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
						console.log('ERROR: user ' + userNames[k] + ' does not exist');
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
			console.log('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.log('ERROR: ' + outputFolder + ' is not a folder');
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

		var channel;
		var policyName;

		serverRest.getChannelWithName({
				server: server,
				name: name
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				channel = result.data;
				if (!channel || !channel.id) {
					console.log('ERROR: channel ' + name + ' does not exist');
					return Promise.reject();
				}

				if (output) {
					fs.writeFileSync(output, JSON.stringify(repo, null, 4));
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
			console.log(result.statusMessage);
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
					console.log('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}

				console.log(' - get repository (Id: ' + repository.id + ')');

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
					console.log(error);
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
	var format1 = '%-20s  %-53s  %-s';
	console.log(sprintf(format1, 'Users & Groups', 'Assets', 'Taxonomies'));

	var format2 = '%-20s  %-20s  %-4s  %-6s  %-6s  %-6s     %-30s  %-6s  %-s';
	console.log(sprintf(format2, '', '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize'));

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
				catCategorize = '';
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
			}

			console.log(sprintf(format2, user, typeLabel, typeView, typeUpdate, typeCreate, typeDelete,
				catLabel, catView, catCategorize));

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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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
					console.log('ERROR: repository ' + name + ' does not exist');
					return Promise.reject();
				}

				console.log(' - get repository (Id: ' + repository.id + ')');

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
							console.log(' - WARNING: group ' + groupNames[i] + ' does not exist');
						}
					}
					if (goodGroupNames.length) {
						console.log(' - valid groups: ' + goodGroupNames);
					}
					// console.log(groups);
				}

				var usersPromises = [];
				for (var i = 0; i < userNames.length; i++) {
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
						for (var i = 0; i < allUsers.length; i++) {
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
							console.log(' - WARNING: user ' + userNames[k] + ' does not exist');
						}
					}
					if (goodUserNames.length) {
						console.log(' - valid user: ' + goodUserNames);
					}
					// console.log(users);
				}

				if (principals.length === 0) {
					console.log('ERROR: no valid user nor group');
					return Promise.reject();
				}

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
						for (var i = 0; i < allTypes.length; i++) {
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
							console.log(' - WARNING: asset type ' + typeNames[k] + ' does not exist, ignore');
						}
					}

					if (goodTypeNames.length > 0) {
						console.log(' - valid asset types: ' + goodTypeNames);
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
				for (var i = 0; i < categoryNames.length; i++) {
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
							for (var i = 0; i < allTaxonomies.length; i++) {
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
								console.log(' - WARNING: taxonomy ' + taxName + ' does not exist, ignore');
							}
						}
					}

					// console.log(taxonomies);
				}

				var categoryPromises = [];
				for (var i = 0; i < taxonomies.length; i++) {
					categoryPromises.push(serverRest.getCategories({
						server: server,
						taxonomyId: taxonomies[i].id,
						taxonomyName: taxonomies[i].name
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
							for (var i = 0; i < allCategories.length; i++) {
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
								console.log(' - WARNING: category ' + cateName + ' does not exist, ignore');
							}
						}
					}

					if (goodCateNames.length > 0) {
						console.log(' - valid categories: ' + goodCateNames);
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
					console.log('ERROR: no valid asset type nor category');
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

					for (var j = 0; j < taxCategories.length; j++) {
						var foundCat = false;

						for (var k = 0; k < taxonomyPrivileges.length; k++) {
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
					for (var i = 0; i < contentPrivileges.length; i++) {
						if (!contentPrivileges[i].typeId) {
							anyTypeExist = true;
							break;
						}
					}

					var anyTaxExist = false;
					for (var i = 0; i < taxonomyPrivileges.length; i++) {
						if (!taxonomyPrivileges[i].categoryId) {
							anyTaxExist = true;
							break;
						}
					}

					if (!anyTypeExist && !anyTaxExist) {
						console.log('ERROR: "Any" content type rule and "Any" taxonomy category rule are missing for ' + pal.name);
					} else if (!anyTypeExist) {
						console.log('ERROR: "Any" content type rule is missing for ' + pal.name);
					} else if (!anyTaxExist) {
						console.log('ERROR: "Any" taxonomy category rule is missing for ' + pal.name);
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
					console.log(error);
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
			console.log(result.statusMessage);
			done();
			return;
		}

		serverRest.getEditorialRoles({
				server: server
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
						console.log('ERROR: editorial role ' + name + ' does not exist');
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
					console.log(error);
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

	var format2 = '  %-30s  %-4s  %-6s  %-6s  %-6s     %-36s  %-6s  %-s';
	// console.log(sprintf(format2, '', '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize'));


	console.log(item.name + '  ' + (item.description ? ('(' + item.description + ')') : ''));

	console.log(sprintf(format1, 'Assets', 'Taxonomies'));
	console.log(sprintf(format2, '', 'View', 'Update', 'Create', 'Delete', '', 'View', 'Categorize'));

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
			catCategorize = '';
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
		}

		console.log(sprintf(format2, typeLabel, typeView, typeUpdate, typeCreate, typeDelete,
			catLabel, catView, catCategorize));

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
			console.log(result.statusMessage);
			done();
			return;
		}
		var exitCode;
		serverRest.getEditorialRoleWithName({
				server: server,
				name: name
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
					console.log(error);
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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

		serverRest.getEditorialRoleWithName({
				server: server,
				name: name
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				role = result && result.data;
				if (!role || !role.id) {
					console.log('ERROR: editorial role ' + name + ' does not exist');
					return Promise.reject();
				}
				console.log(' - verify editorial role');

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
						for (var i = 0; i < allTypes.length; i++) {
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
							console.log(' - WARNING: asset type ' + typeNames[k] + ' does not exist, ignore');
						}
					}

					if (goodTypeNames.length > 0) {
						console.log(' - valid asset types: ' + goodTypeNames);
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
				for (var i = 0; i < categoryNames.length; i++) {
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
							for (var i = 0; i < allTaxonomies.length; i++) {
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
								console.log(' - WARNING: taxonomy ' + taxName + ' does not exist, ignore');
							}
						}
					}

					// console.log(taxonomies);
				}

				var categoryPromises = [];
				for (var i = 0; i < taxonomies.length; i++) {
					categoryPromises.push(serverRest.getCategories({
						server: server,
						taxonomyId: taxonomies[i].id,
						taxonomyName: taxonomies[i].name
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
							for (var i = 0; i < allCategories.length; i++) {
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
								console.log(' - WARNING: category ' + cateName + ' does not exist, ignore');
							}
						}
					}

					if (goodCateNames.length > 0) {
						console.log(' - valid categories: ' + goodCateNames);
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
					console.log('ERROR: no valid asset type nor category');
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
					}
				}

				var contentPrivileges = role.contentPrivileges || [];
				var taxonomyPrivileges = role.taxonomyPrivileges || [];

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

				for (var j = 0; j < taxCategories.length; j++) {
					var foundCat = false;

					for (var k = 0; k < taxonomyPrivileges.length; k++) {
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
				for (var i = 0; i < contentPrivileges.length; i++) {
					if (!contentPrivileges[i].typeId) {
						anyTypeExist = true;
						break;
					}
				}

				var anyTaxExist = false;
				for (var i = 0; i < taxonomyPrivileges.length; i++) {
					if (!taxonomyPrivileges[i].categoryId) {
						anyTaxExist = true;
						break;
					}
				}

				if (!anyTypeExist && !anyTaxExist) {
					console.log('ERROR: "Any" content type rule and "Any" taxonomy category rule are missing for ' + pal.name);
					return Promise.reject();
				} else if (!anyTypeExist) {
					console.log('ERROR: "Any" content type rule is missing for ' + pal.name);
					return Promise.reject();
				} else if (!anyTaxExist) {
					console.log('ERROR: "Any" taxonomy category rule is missing for ' + pal.name);
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
					console.log(error);
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
			console.log(result.statusMessage);
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
					console.log('ERROR: editorial role ' + name + ' does not exist');
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
					console.log(error);
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
	console.log(' - server: ' + server.url);

	var name = argv.name;
	var desc = argv.description;
	var requiredLanguages = argv.requiredlanguages.split(',');
	var defaultLanguage = argv.defaultlanguage;
	var optionalLanguages = argv.optionallanguages ? argv.optionallanguages.split(',') : [];
	var exitCode;
	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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

				console.log(' - verify localization policy name');

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
			console.log('ERROR: folder ' + outputFolder + ' does not exist');
			done();
			return;
		}

		if (!fs.statSync(outputFolder).isDirectory()) {
			console.log('ERROR: ' + outputFolder + ' is not a folder');
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

		var workflows;

		serverRest.getWorkflowsWithName({
				server: server,
				name: name
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				} else if (result.length === 0) {
					console.log('ERROR: workflow ' + name + ' not found');
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
					console.log(error);
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
	console.log(' - server: ' + server.url);

	var channelName = argv.channel;
	var query = argv.query;
	var repositoryName = argv.repository;
	var collectionName = argv.collection;
	if (collectionName && !repositoryName) {
		console.log('ERROR: no repository is specified');
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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
						console.log('ERROR: repository ' + repositoryName + ' not found');
						return Promise.reject();
					}
					repository = results[0].data;
					console.log(' - validate repository (Id: ' + repository.id + ')');
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
						console.log('ERROR: collection ' + collectionName + ' not found');
						return Promise.reject();
					}
					collection = results[0].data;
					console.log(' - validate collection (Id: ' + collection.id + ')');
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
						for (var i = 0; i < rankings.length; i++) {
							if (rankings[i].name.toLowerCase() === ranking.toLowerCase()) {
								rankingApiName = rankings[i].apiName;
								break;
							}
						}
					}
					if (!rankingApiName) {
						console.log(' - WARNING: ranking policy is not found with API name ' + ranking);
					} else {
						console.log(' - verify ranking policy (API name: ' + rankingApiName + ')');
					}
				}

				var channelPromises = [];
				if (channelName) {
					channelPromises.push(serverRest.getChannelWithName({
						server: server,
						name: channelName
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
				if (channelName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					} else if (!results[0].data) {
						console.log('ERROR: channel ' + channelName + ' not found');
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
					console.log(' - validate channel (Id: ' + channel.id + ' token: ' + channelToken + ')');
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
					console.log(' - query: ' + q);
				} else {
					console.log(' - query all assets');
				}

				startTime = new Date();
				return serverRest.queryItems({
					server: server,
					q: q,
					fields: 'name,status,slug,language,publishedChannels',
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
				fs.writeFileSync(path.join(projectDir, 'Netsuite_Headstart_items.json'), JSON.stringify(result.data, null, 2));
				items = result && result.data || [];
				total = items.length;
				limit = result.limit;

				console.log(' - items: ' + total + ' of ' + limit + ' [' + timeSpent + ']');

				if (total > 0) {
					_displayAssets(server, repository, collection, channel, channelToken, items, showURLS, rankingApiName);
					console.log(' - items: ' + total + ' of ' + limit + ' [' + timeSpent + ']');
				}

				var validatePromises = [];
				if (validate && items.length > 0) {
					var ids = [];
					items.forEach(function (item) {
						ids.push(item.id);
					});
					validatePromises.push(contentUtils.queryItemsWithIds(server, '', ids));
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
					} else {
						console.log(' - validation finished');
					}
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

var _displayAssets = function (server, repository, collection, channel, channelToken, items, showURLS, ranking) {
	var types = [];
	var allIds = [];
	for (var i = 0; i < items.length; i++) {
		allIds.push(items[i].id);
		if (!types.includes(items[i].type)) {
			types.push(items[i].type);
		}
	}


	// sort types
	var byType = types.slice(0);
	byType.sort(function (a, b) {
		var x = a;
		var y = b;
		return (x < y ? -1 : x > y ? 1 : 0);
	});
	types = byType;

	var list = [];
	for (var i = 0; i < types.length; i++) {
		list.push({
			type: types[i],
			items: []
		});
	}

	for (var i = 0; i < items.length; i++) {
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
		format2 = '   %-38s %-38s %-7s %-10s %-8s %-10s %-s';
		console.log(sprintf(format2, 'Type', 'Id', 'Version', 'Status', 'Language', 'Size', 'Name'));
		var totalSize = 0;
		for (var i = 0; i < list.length; i++) {
			for (var j = 0; j < list[i].items.length; j++) {
				var item = list[i].items[j];
				if (item.fields && item.fields.size) {
					totalSize = totalSize + item.fields.size;
				}
				// console.log(item);
				var typeLabel = j === 0 ? item.type : '';
				var sizeLabel = item.fields && item.fields.size ? item.fields.size : '';
				var languageLabel = item.language ? item.language : '';
				console.log(sprintf(format2, typeLabel, item.id, item.latestVersion, item.status, languageLabel, sizeLabel, item.name));
			}
		}

		console.log('');
		if (totalSize > 0) {
			console.log(' - total file size: ' + (Math.floor(totalSize / 1024)) + 'k');
		}
	}

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
	console.log(' - template ' + templateName);

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
		console.log(' - other content ' + goodContent);
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
			console.log(' - process content items in ' + itemsPath.substring(projectDir.length + 1));
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

		console.log(' - total Ids: ' + idMap.size);
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
	console.log(' - replace Id in files under ' + folderPath.substring(projectDir.length + 1));
	return new Promise(function (resolve, reject) {
		serverUtils.paths(folderPath, function (err, paths) {
			if (err) {
				console.log(err);
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
						} catch (e) {}

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
				console.log(' - created content file ' + zippath);
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