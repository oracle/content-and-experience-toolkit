/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */


var sprintf = require('sprintf-js').sprintf,
	serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js');

var console = require('../test/server/logger.js').console;

var projectDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done
 */
var verifyRun = function (argv) {
	if (process.shim) {
		return true;
	}
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

module.exports.listGroups = function (argv, done) {
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		serverRest.getGroups({
			server: server
		})
			.then(function (result) {
				var groups = result || [];
				// console.log(groups);

				if (groups.length > 0) {
					console.log('');

					// sort by name
					var byName = groups.slice(0);
					byName.sort(function (a, b) {
						var x = a.name.toLowerCase();
						var y = b.name.toLowerCase();
						return (x < y ? -1 : x > y ? 1 : 0);
					});
					groups = byName;

					let format = '  %-3s  %-10s  %-60s  %-14s  %-24s  %-s';
					console.log(sprintf(format, 'IAM', 'Id', 'Name', 'Type', 'Created on', 'Created by'));

					groups.forEach(function(group) {
						let isIAM = group.groupOriginType === 'IDP' ? ' √' : '';
						console.log(sprintf(format, isIAM, group.id, group.name, group.groupType, group.createdDateInISO8601Format, (group.createdByUserDisplayName || group.createdByUserName)));
					});
					console.log('');
				}
				console.log(' - total groups: ' + groups.length);
				if (groups.length > 0) {
					console.info(' - use command cec execute-get \'/osn/social/api/v1/groups/<id>\' to get the details of a group');
					// console.info(' - use command cec execute-get \'/osn/social/api/v1/groups/<groupid>/memberships\' to get the members of a group');
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

module.exports.listUsers = function (argv, done) {
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

	var groupName = argv.group;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var groupPromises = [];
		if (groupName) {
			groupPromises.push(serverRest.getGroup({server: server, name: groupName}));
		}

		Promise.all(groupPromises)
			.then(function (results) {

				var group;
				if (groupName) {
					if (!results || !results[0] || results[0].err || !results[0].id) {
						console.error('ERROR: group ' + groupName + ' does not exist');
						return Promise.reject();
					}
					group = results[0];
					console.info(' - verify group (Name: ' + group.name + ' Id: ' + group.id + ')');
				}

				return serverRest.getAllUsers({server: server, group: group && group.id});

			})
			.then(function (result) {

				var users = result || [];

				if (users.length > 0) {
					console.log('');

					// sort by name
					var byName = users.slice(0);
					byName.sort(function (a, b) {
						var x = a.name.toLowerCase();
						var y = b.name.toLowerCase();
						return (x < y ? -1 : x > y ? 1 : 0);
					});
					users = byName;

					let format = '  %-10s  %-40s  %-40s  %-24s  %-s';
					console.log(sprintf(format, 'Id', 'Name', 'Display name', 'Created on', 'Created by'));

					users.forEach(function(user) {

						console.log(sprintf(format,  user.id, user.name, user.displayName, user.createdDateInISO8601Format, (user.createdByUserDisplayName || user.createdByUserName)));
					});
					console.log('');
				}
				console.log(' - total users: ' + users.length);
				if (users.length > 0) {
					console.info(' - use command cec execute-get \'/osn/social/api/v1/people/<id>\' to get the details of a user');
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