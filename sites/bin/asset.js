/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sprintf = require('sprintf-js').sprintf,
	path = require('path');

var projectDir,
	serversSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

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
	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];
	var desc = argv.description;
	var defaultLanguage = argv.defaultlanguage;

	var channels = [];
	var contentTypes = [];

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
					console.log('ERROR: repository ' + name + ' already exists');
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
				channels: channels
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
			done();
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

	var typeNames = argv.contenttypes ? argv.contenttypes.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];

	var repository;
	var channels = [];
	var types = [];

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

			var typePromises = [];
			for (var i = 0; i < typeNames.length; i++) {
				typePromises.push(serverRest.getContentType({
					server: server,
					name: typeNames[i]
				}));
				types.push({
					name: typeNames[i]
				});
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

			var finalTypes = repository.contentTypes;
			var finalChannels = repository.channels;
			if (action === 'add-type') {
				finalTypes = finalTypes.concat(types);
			} else if (action === 'remove-type') {
				for (var i = 0; i < typeNames.length; i++) {
					var idx = undefined;
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
					var idx = undefined;
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
			}

			return serverRest.updateRepository({
				server: server,
				repository: repository,
				contentTypes: finalTypes,
				channels: finalChannels
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			if (action === 'add-type') {
				console.log(' - added type ' + typeNames + ' to repository ' + name);
			} else if (action === 'remove-type') {
				console.log(' - removed type ' + typeNames + ' from repository ' + name);
			} else if (action === 'add-channel') {
				console.log(' - added channel ' + channelNames + ' to repository ' + name);
			} else if (action === 'remove-channel') {
				console.log(' - removed channel ' + channelNames + ' from repository ' + name);
			}

			done(true);
		})
		.catch((error) => {
			done();
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

			return serverRest.getGroups({
				server: server
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			if (groupNames.length > 0) {
				console.log(' - verify groups');
			}
			// verify groups
			var allGroups = result || [];
			for (var i = 0; i < groupNames.length; i++) {
				var found = false;
				for (var j = 0; j < allGroups.length; j++) {
					if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
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
			var revokeGroups = [];
			for (var i = 0; i < groups.length; i++) {
				for (var j = 0; j < existingPermissions.length; j++) {
					var perm = existingPermissions[j];
					if (perm.type === 'group' && perm.fullName === groups[i].name) {
						revokeGroups.push(groups[i]);
						break;
					}
				}
			}

			return serverRest.performPermissionOperation({
				server: server,
				operation: 'unshare',
				resourceId: repository.id,
				resourceType: 'repository',
				groups: revokeGroups
			});
		})
		.then(function (result) {

			return serverRest.performPermissionOperation({
				server: server,
				operation: 'share',
				resourceId: repository.id,
				resourceType: 'repository',
				role: role,
				users: users,
				groups: groups
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
								var revokeGroups = [];
								var unshareTypePromises = [];
								for (var i = 0; i < results.length; i++) {
									var resource = results[i].resource;
									var perms = results[i] && results[i].permissions || [];
									var revokeGroups = [];
									for (var j = 0; j < perms.length; j++) {
										if (perms[j].type === 'group') {
											for (var k = 0; k < groups.length; k++) {
												if (perms[j].fullName === groups[k].name) {
													revokeGroups.push(groups[k]);
													break;
												}
											}

										}
									}
									if (revokeGroups.length > 0) {
										unshareTypePromises.push(serverRest.performPermissionOperation({
											server: server,
											operation: 'unshare',
											resourceName: resource,
											resourceType: 'type',
											groups: revokeGroups
										}));
									}
								}

								return Promise.all(unshareTypePromises);

							})
							.then(function (results) {

								var shareTypePromises = [];
								for (var i = 0; i < goodTypeNames.length; i++) {
									shareTypePromises.push(serverRest.performPermissionOperation({
										server: server,
										operation: 'share',
										resourceName: goodTypeNames[i],
										resourceType: 'type',
										role: typeRole,
										users: users,
										groups: groups
									}));
								}
								return Promise.all(shareTypePromises);
							})
							.then(function (results) {
								var sharedTypes = [];
								for (var i = 0; i < results.length; i++) {
									if (results[i].operations) {
										var obj = results[i].operations.share;
										if (obj.resource && obj.resource.name) {
											sharedTypes.push(obj.resource.name);
										}
									}
								}
								if (sharedTypes.length > 0) {
									if (goodUserName.length > 0) {
										console.log(' - user ' + (goodUserName.join(', ')) + ' granted with role ' + typeRole + ' on type ' + sharedTypes.join(', '));
									}
									if (goodGroupNames.length > 0) {
										console.log(' - group ' + (goodGroupNames.join(', ')) + ' granted with role ' + typeRole + ' on type ' + sharedTypes.join(', '));
									}
								}
								done(true);


							});
					})
					.catch((error) => {
						done(success);
					});
			} // types

		})
		.catch((error) => {
			done();
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

			return serverRest.getGroups({
				server: server
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			if (groupNames.length > 0) {
				console.log(' - verify groups');
			}
			// verify groups
			var allGroups = result || [];
			for (var i = 0; i < groupNames.length; i++) {
				var found = false;
				for (var j = 0; j < allGroups.length; j++) {
					if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
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

	serverRest.getContentType({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log(' - verify type');

			return serverRest.getGroups({
				server: server
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			if (groupNames.length > 0) {
				console.log(' - verify groups');
			}
			// verify groups
			var allGroups = result || [];
			for (var i = 0; i < groupNames.length; i++) {
				var found = false;
				for (var j = 0; j < allGroups.length; j++) {
					if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
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
			var revokeGroups = [];
			for (var i = 0; i < groups.length; i++) {
				for (var j = 0; j < existingPermissions.length; j++) {
					var perm = existingPermissions[j];
					if (perm.type === 'group' && perm.fullName === groups[i].name) {
						revokeGroups.push(groups[i]);
						break;
					}
				}
			}

			return serverRest.performPermissionOperation({
				server: server,
				operation: 'unshare',
				resourceName: name,
				resourceType: 'type',
				groups: revokeGroups
			});
		})
		.then(function (result) {

			return serverRest.performPermissionOperation({
				server: server,
				operation: 'share',
				resourceName: name,
				resourceType: 'type',
				role: role,
				users: users,
				groups: groups
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

	serverRest.getContentType({
			server: server,
			name: name
		}).then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			return serverRest.getGroups({
				server: server
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			if (groupNames.length > 0) {
				console.log(' - verify groups');
			}
			// verify groups
			var allGroups = result || [];
			for (var i = 0; i < groupNames.length; i++) {
				var found = false;
				for (var j = 0; j < allGroups.length; j++) {
					if (groupNames[i].toLowerCase() === allGroups[j].name.toLowerCase()) {
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
					console.log('ERROR: channel ' + name + ' already exists');
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
			done();
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
					console.log('ERROR: localization policy ' + name + ' already exists');
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

			done(done);
		})
		.catch((error) => {
			done();
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

	var total;
	var repository, collection, channel;

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
				console.log(' - validate channel (Id: ' + channel.id + ')');
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
				fields: 'name,status'
			});
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var items = result && result.data || [];
			total = items.length;

			console.log(' - total items: ' + total);

			if (total > 0) {
				_displayAssets(repository, collection, channel, items);
			}

			done(true);
		})
		.catch((error) => {
			done();
		});
};

var _displayAssets = function (repository, collection, channel, items) {
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

	var format2 = '   %-38s %-38s %-11s %-s';
	console.log(sprintf(format2, 'Type', 'Id', 'Status', 'Name'));
	for (var i = 0; i < list.length; i++) {
		for (var j = 0; j < list[i].items.length; j++) {
			var item = list[i].items[j];
			var typeLabel = j === 0 ? item.type : '';
			console.log(sprintf(format2, typeLabel, item.id, item.status, item.name));
		}
	}
};