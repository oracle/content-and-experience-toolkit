/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */


var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	componentUtils = require('./component.js').utils,
	fs = require('fs'),
	fse = require('fs-extra'),
	gulp = require('gulp'),
	sprintf = require('sprintf-js').sprintf,
	path = require('path'),
	zip = require('gulp-zip');

var projectDir,
	buildDir,
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	var allRepos = [];
	var allRepoNames = [];
	var channels = [];
	var types = [];
	var taxonomies = [];
	var finalTypeNames = [];
	var finaleChannelNames = [];
	var finalTaxNames = [];

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

				return _controlRepositories(server, allRepos, action, types, finalTypeNames,
					channels, finaleChannelNames, taxonomies, finalTaxNames);

			})
			.then(function (result) {

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

var _controlRepositories = function (server, repositories, action, types, typeNames,
	channels, channelNames, taxonomies, taxonomyNames) {
	return new Promise(function (resolve, reject) {
		var startTime;
		var doUpdateRepos = repositories.reduce(function (updatePromise, repository) {
				var name = repository.name;

				return updatePromise.then(function (result) {
					var finalTypes = repository.contentTypes;
					var finalChannels = repository.channels;
					var finalTaxonomies = repository.taxonomies;
					var idx;

					if (action === 'add-type') {
						finalTypes = finalTypes.concat(types);
					} else if (action === 'remove-type') {
						for (var i = 0; i < typeNames.length; i++) {
							idx = undefined;
							for (var j = 0; j < finalTypes.length; j++) {
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
						for (var i = 0; i < channels.length; i++) {
							idx = undefined;
							for (var j = 0; j < finalChannels.length; j++) {
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
						for (var i = 0; i < taxonomies.length; i++) {
							idx = undefined;
							for (var j = 0; j < finalTaxonomies.length; j++) {
								if (taxonomies[i].id === finalTaxonomies[j].id) {
									idx = j;
									break;
								}
							}
							if (idx !== undefined) {
								finalTaxonomies.splice(idx, 1);
							}
						}
					}

					serverRest.updateRepository({
						server: server,
						repository: repository,
						contentTypes: finalTypes,
						channels: finalChannels,
						taxonomies: finalTaxonomies
					}).then(function (result) {
						if (result.err) {

						} else {
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
							}
						}
					});

				});
			},
			Promise.resolve({})
		);

		doUpdateRepos.then(function (result) {
			resolve(result);
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

					var typeCustomEditors = typeObj.properties && typeObj.properties.customEditors || [];
					for (var i = 0; i < typeCustomEditors.length; i++) {
						if (!customEditors.includes(typeCustomEditors[i])) {
							customEditors.push(typeCustomEditors[i]);
						}
					}
					var typeCustomForms = typeObj.properties && typeObj.properties.customForms || [];
					for (var i = 0; i < typeCustomForms.length; i++) {
						if (!customForms.includes(typeCustomForms[i])) {
							customForms.push(typeCustomForms[i]);
						}
					}

				});

				if (customEditors.length > 0) {
					console.log(' - will download content field editor ' + customEditors.join(', '));
				}
				if (customForms.length > 0) {
					console.log(' - will download content form ' + customForms.join(', '));
				}

				if (customEditors.length === 0 && customForms.length === 0) {
					done(true);
				} else {
					componentUtils.downloadComponents(server, customEditors.concat(customForms), argv)
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

	var allNames = argv.name.split(',');
	var names = [];
	var comps = [];
	var customEditors = [];
	var customForms = [];

	// varify the types on local
	allNames.forEach(function (name) {
		var filePath = path.join(typesSrcDir, name, name + '.json');
		if (!fs.existsSync(filePath)) {
			console.log('ERROR: type ' + name + ' does not exist');
		} else if (!names.includes(name)) {
			names.push(name);
			var typeObj = JSON.parse(fs.readFileSync(filePath));
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
		}
	});

	if (names.length === 0) {
		// no type to upload
		done();
		return;
	}

	var typesToCreate = [];
	var typesToUpdate = [];

	var hasError = false;

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		if (customEditors.length > 0) {
			console.log(' - will upload content field editor ' + customEditors.join(', '));
		}
		if (customForms.length > 0) {
			console.log(' - will upload content form ' + customForms.join(', '));
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
						typesToUpdate.push(names[i]);
					} else {
						typesToCreate.push(names[i]);
					}
				}

				if (typesToCreate.length > 0) {
					console.log(' - will create type ' + typesToCreate.join(', '));
				}
				if (typesToUpdate.length > 0) {
					console.log(' - will update type ' + typesToUpdate.join(', '));
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
				typesToUpdate.forEach(function (name) {
					var filePath = path.join(typesSrcDir, name, name + '.json');
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

var _uploadTypeComponents = function (server, comps) {

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

					var importsPromise = [];
					for (var i = 0; i < comps.length; i++) {
						var name = comps[i];
						var zipfile = path.join(projectDir, "dist", name) + ".zip";

						importsPromise.push(componentUtils.uploadComponent(server, folder, folderId, zipfile, name, publish));
					}
					return Promise.all(importsPromise);
				})
				.then(function (results) {
					// console.log(results);
					var files = results || [];
					var deleteFilePromises = [];
					for (var i = 0; i < files.length; i++) {
						if (files[i].fileId) {
							deleteFilePromises.push(serverRest.deleteFile({
								server: server,
								fFileGUID: files[i].fileId
							}));
						}
					}

					return Promise.all(deleteFilePromises);
				})
				.then(function (results) {
					resolve({});
				})
				.catch((error) => {
					resolve({
						err: 'err'
					});
				});
		}
	});
};

var _createContentTypes = function (server, names) {
	return new Promise(function (resolve, reject) {
		var results = [];
		var doCreateType = names.reduce(function (typePromise, name) {
				return typePromise.then(function (result) {
					var filePath = path.join(typesSrcDir, name, name + '.json');
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
	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

				_listPermissionSets(repository, permissionSets);

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

var _listPermissionSets = function (repository, data) {
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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
					_listPermissionSets(repository, newPermissionSets);
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
	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

	var showURLS = typeof argv.urls === 'boolean' ? argv.urls : argv.urls === 'true';

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

				return serverRest.queryItems({
					server: server,
					q: q,
					fields: 'name,status,slug,publishedChannels',
					includeAdditionalData: true
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				items = result && result.data || [];
				total = items.length;
				limit = result.limit;

				console.log(' - items: ' + total + ' of ' + limit);

				if (total > 0) {
					_displayAssets(server, repository, collection, channel, channelToken, items, showURLS);
					console.log(' - items: ' + total + ' of ' + limit);
				}

				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

var _displayAssets = function (server, repository, collection, channel, channelToken, items, showURLS) {
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
	for (var i = 0; i < list.length; i++) {
		var byName = list[i].items.slice(0);
		byName.sort(function (a, b) {
			var x = a.name;
			var y = b.name;
			return (x < y ? -1 : x > y ? 1 : 0);
		});
		list[i].items = byName;
	}

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
		format2 = '   %-38s %-38s %-11s %-10s %-s';
		console.log(sprintf(format2, 'Type', 'Id', 'Status', 'Size', 'Name'));

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
				console.log(sprintf(format2, typeLabel, item.id, item.status, sizeLabel, item.name));
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
			.pipe(zip(contentfilename))
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

	serverUtils.loginToServer(server, serverUtils.getRequest()).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

		/*
			.then(function (result) {

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				resolve({err; 'err'});
			});
			*/
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

	var request = serverUtils.getRequest();
	serverUtils.loginToServer(server, request).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
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

// export non "command line" utility functions
module.exports.utils = {
	renameAssetIds: _renameAssetIds
};