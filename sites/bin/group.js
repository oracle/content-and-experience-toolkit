/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js');

var console = require('../test/server/logger.js').console;

var projectDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	return true;
};

module.exports.createGroup = function (argv, done) {
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
	// console.log(' - server: ' + server.url);

	var name = argv.name;
	var type = argv.type || 'PUBLIC_OPEN';

	var exitCode;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getGroup({
			server: server,
			name: name
		})
			.then(function (result) {

				var found = result && result.name;

				if (found) {
					console.log(' - group ' + name + ' already exists');
					exitCode = 2;
					return Promise.reject();
				}

				return serverRest.createGroup({
					server: server,
					name: name,
					type: type
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - group ' + name + ' created');
				done(true);
			})
			.catch((error) => {
				done(exitCode);
			});
	});

};

module.exports.deleteGroup = function (argv, done) {
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
	// console.log(' - server: ' + server.url);

	var name = argv.name;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getGroup({
			server: server,
			name: name
		})
			.then(function (result) {

				var groupId = result && result.id;

				if (!groupId) {
					console.error('ERROR: group ' + name + ' does not exist');
					return Promise.reject();
				}

				return serverRest.deleteGroup({
					server: server,
					id: groupId,
					name: name
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - group ' + name + ' deleted');
				done(true);
			})
			.catch((error) => {
				done();
			});
	});

};

module.exports.addMemberToGroup = function (argv, done) {
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
	var role = 'GROUP_' + argv.role.toUpperCase();
	var userNames = argv.users ? argv.users.split(',') : [];
	var groupNames = argv.groups ? argv.groups.split(',') : [];

	var groupId;
	var users = [];
	var groups = [];
	var i;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}


		serverRest.getGroup({
			server: server,
			name: name
		}).then(function (result) {

			console.info(' - verify group');

			groupId = result && result.id;
			if (!groupId) {
				console.error('ERROR: group ' + name + ' does not exist');
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
					for (i = 0; i < groupNames.length; i++) {
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
							return Promise.reject();
						}
					}
				}

				var usersPromises = [];
				for (i = 0; i < userNames.length; i++) {
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
					for (i = 0; i < allUsers.length; i++) {
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

				var members = [];
				for (i = 0; i < users.length; i++) {
					members.push({
						id: users[i].id,
						name: users[i].loginName,
						isGroup: false,
						role: role
					});
				}
				for (i = 0; i < groups.length; i++) {
					members.push({
						id: groups[i].id,
						name: groups[i].name,
						isGroup: true,
						role: role
					});
				}

				return serverRest.addMembersToGroup({
					server: server,
					id: groupId,
					name: name,
					members: members
				});
			})
			.then(function (results) {
				var success = true;
				for (var i = 0; i < results.length; i++) {
					if (results[i].err) {
						success = false;
					} else {
						var member = results[i];
						var typeLabel = serverUtils.includes(userNames, member.name) ? 'user' : 'group';
						console.log(' - ' + typeLabel + ' ' + member.name + ' added to group ' + name);
					}
				}
				done(success);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

module.exports.removeMemberFromGroup = function (argv, done) {
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
	var memberNames = argv.members ? argv.members.split(',') : [];

	var groupId;
	var members = [];

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getGroup({
			server: server,
			name: name
		})
			.then(function (result) {
				console.info(' - verify group');

				// verify group
				groupId = result && result.id;
				if (!groupId) {
					console.error('ERROR: group ' + name + ' does not exist');
					return Promise.reject();
				}

				return serverRest.getGroupMembers({
					server: server,
					id: groupId,
					name: name
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				console.info(' - verify members');
				var allMembers = result || [];
				for (var i = 0; i < memberNames.length; i++) {
					var found = false;
					for (var j = 0; j < allMembers.length; j++) {
						if (memberNames[i].toLowerCase() === allMembers[j].name.toLowerCase()) {
							found = true;
							members.push(allMembers[j]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: ' + memberNames[i] + ' is not a member of group ' + name);
					}
				}
				if (members.length === 0) {
					return Promise.reject();
				}

				return serverRest.removeMembersFromGroup({
					server: server,
					id: groupId,
					name: name,
					members: members
				});

			})
			.then(function (results) {
				var success = true;
				for (var i = 0; i < results.length; i++) {
					if (results[i].err) {
						success = false;
					} else {
						var member = results[i];
						console.log(' - ' + member.name + ' removed from group ' + name);
					}
				}
				done(success);
			})
			.catch((error) => {
				done();
			});
	});

};