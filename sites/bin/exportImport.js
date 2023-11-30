/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverRest = require('../test/server/serverRest.js'),
	serverUtils = require('../test/server/serverUtils.js'),
	exportImportRest = require('../test/server/exportImportRest.js'),
	exportserviceutils = require('./exportserviceutils.js').utils,
	sitesRest = require('../test/server/sitesRest.js'),
	site = require('./site.js'),
	assetUtils = require('./asset.js').utils,
	sprintf = require('sprintf-js').sprintf,
	formatter = require('./formatter.js'),
	fs = require('fs'),
	path = require('path');

var projectDir;

var verifyRun = function (argv) {

	if (process.shim) {
		return true;
	}
	projectDir = argv.projectDir;

	return true;
}

/**
 * unblock import job
 */
module.exports.unblockImportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var ignorewarnings = typeof argv.ignorewarnings === 'string' && argv.ignorewarnings.toLowerCase() === 'true',
				url = '/system/export/api/v1/imports/' + argv.id + '/unblock',
				body = {
					"action": "ignoreCurrentValidationWarnings",
					"ignoreCurrentValidationWarnings": {
						"reportETag": "",
						"import": {
							"policies": {
								"ignoreAllValidationWarnings": ignorewarnings
							}
						}
					}
				}

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				body: body,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to unblock import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Unblocked import job ' + argv.id);
					console.info('To monitor the job progress and download the report, run the following command:');
					console.info('cec describe-import-job ' + argv.id + ' -d -s ' + serverName);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * retry import job
 */
module.exports.retryImportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/imports/' + argv.id + '/retry';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to retry import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Retry import job ' + argv.id);
					console.info('To monitor the job progress and download the report, run the following command:');
					console.info('cec describe-import-job ' + argv.id + ' -d -s ' + serverName);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * cancel export job
 */
module.exports.cancelExportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/exports/' + argv.id + '/cancel';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to cancel export job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Canceled export job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * cancel import job
 */
module.exports.cancelImportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/imports/' + argv.id + '/cancel';

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executePost({
				server: server,
				endpoint: url,
				noMsg: true,
				responseStatus: true,
				headers: headers
			}).then(function (data) {
				if (data) {
					console.info('Failed to cancel import job ' + argv.id + ' : ' + (data['o:errorCode'] ? data.title : data.statusMessage));
				} else {
					console.info('Canceled import job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * delete export job
 */
module.exports.deleteExportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/exports/' + argv.id;

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executeDelete({
				server: server,
				endpoint: url,
				headers: headers
			}).then(function (data) {
				if (data.err) {
					console.info('Failed to delete export job ' + argv.id + ' : ' + (data.data['o:errorCode'] ? data.data.title : data.data));
				} else {
					console.info('Deleted export job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * delete import job
 */
module.exports.deleteImportJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/imports/' + argv.id;

			// Note: Export service on dev instances requires additional header
			var headers;
			if (server.env === 'dev_ec') {
				headers = { 'IDCS_REMOTE_USER': server.username };
			}

			serverRest.executeDelete({
				server: server,
				endpoint: url,
				headers: headers
			}).then(function (data) {
				if (data.err) {
					console.info('Failed to delete import job ' + argv.id + ' : ' + (data.data['o:errorCode'] ? data.data.title : data.data));
				} else {
					console.info('Deleted import job ' + argv.id);
				}

				done(true);
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

var _getRepository = function (repositoryId, server) {
	return new Promise(function (resolve, reject) {
		var url = '/content/management/api/v1.1/repositories/' + repositoryId;
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
		}).catch((siteError) => {
			console.error('Failed to get repository details');
			resolve();
		});
	});
};

var _getSourceForExportJob = function (id, server) {
	return new Promise(function (resolve, reject) {
		var url = '/system/export/api/v1/exports/' + id;
		url += '?fields=sources.select.type,sources.select.site.id,sources.select.site.name,sources.select.repository.id,sources.select.repository.name,sources.apply.policies';

		exportserviceutils.executeGetExportService({
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
			// Support single site for now
			var source = data.sources.at(0);
			if (source.select.type === 'site') {
				sitesRest.getSite({
					server: server,
					id: source.select.site.id,
					showInfo: false
				}).then(site => {
					source.select.site.name = site.name;
					resolve(source);
				}).catch((siteError) => {
					console.error('Failed to get site details');
					resolve(source);
				});
			} else {
				_getRepository(source.select.repository.id, server).then(repo => {
					source.select.repository.name = repo.name;
					resolve(source);
				}).catch((repoError) => {
					console.error('Failed to get repository details');
					resolve(source);
				});
			}
		}).catch((jobError) => {
			console.error('Failed to get job details');
			resolve();
		})
	});
};

var _getTargetForImportJob = function (id, server) {
	return new Promise(function (resolve, reject) {
		var url = '/system/export/api/v1/imports/' + id;
		url += '?fields=targets.select.type,targets.select.type,targets.select.site.id,targets.select.site.name,targets.select.repository.id,targets.select.repository.name,targets.apply.policies';

		exportserviceutils.executeGetExportService({
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
			// Support single site for now
			if (data.targets) {
				var target = data.targets.at(0);
				resolve(target);
			} else {
				resolve({});
			}
		}).catch((jobError) => {
			console.error('Failed to get job details ' + jobError);
			resolve({});
		})
	});
};

var duration = function (beginTimeString, endTimeString) {
	if (!beginTimeString || !endTimeString) {
		return '';
	}

	var beginTime = new Date(Date.parse(beginTimeString)),
		endTime = new Date(Date.parse(endTimeString));

	return ((endTime.getTime() - beginTime.getTime()) / 1000).toFixed(0) + 's';
}

/**
 * list export jobs
 */
module.exports.listExportJobs = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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
			var url = '/system/export/api/v1/exports';
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed';

			exportserviceutils.executeGetExportService({
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
				if (!data.err && data.items) {

					var sitePromises = [];
					data.items.forEach(job => {
						sitePromises.push(_getSourceForExportJob(job.id, server));
					});

					Promise.all(sitePromises).then(sites => {
						data.items.forEach(function (job, index) {
							var site = sites.at(index);
							if (site.select.type === 'repository') {
								job.augmentedSiteName = site && site.select.repository && site.select.repository.name;
							} else {
								job.augmentedSiteName = site && site.select.site && site.select.site.name;
							}
							job.policies = site.apply && site.apply.policies;
						});

						var titleFormat = '%-26s  %-32s  %-16s  %-9s  %-10s  %-24s  %-10s  %-26s';
						console.log('Export jobs:');
						console.log(sprintf(titleFormat, 'Target Name', 'Id', 'Policies', 'Completed', 'Progress', 'Created At', 'Duration', 'Job Name'));
						data.items.forEach(function (job) {
							var rowFormat = `%-26s  %-${formatter.exportJobColSize(32, job.id)}s  %-16s  %-9s  %-10s  %-24s  %-10s  %-26s`;
							if (job.completed) {
								console.log(sprintf(rowFormat, job.augmentedSiteName || '', formatter.exportJobFormat(job.id), job.policies, job.completed, job.progress, job.createdAt || '', duration(job.createdAt, job.completedAt), job.name));
							} else {
								console.log(sprintf(rowFormat, job.augmentedSiteName || '', formatter.exportJobFormat(job.id), job.policies, job.completed, job.progress, job.createdAt || '', '', job.name));
							}
						});
						done(true);
					}).catch((e) => {
						console.error(e);
						done();
					});
				} else {
					done(true);
				}
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * describe export job
 */
module.exports.describeExportJob = function (argv, done) {
	'use strict';
	var self = this;

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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
			exportImportRest.getExportJobSources({
				server: server,
				id: argv.id
			}).then(function (data) {
				if (data.err) {
					done();
					return;
				}

				var job = data.job;
				if (job.sources.length > 0) {
					var source = job.sources.at(0);
					if (source.select.type === 'repository') {
						return assetUtils.describeRepositoryExportJob(server, argv.id, argv.download, data, projectDir, done);
					} else {
						return site.describeSiteExportJob(argv, done);
					}
				}
			})
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * list import jobs
 */
module.exports.listImportJobs = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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

			var url = '/system/export/api/v1/imports';

			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed';

			exportserviceutils.executeGetExportService({
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
				if (!data.err && data.items) {
					var sitePromises = [];
					data.items.forEach(job => {
						sitePromises.push(_getTargetForImportJob(job.id, server));
					});

					Promise.all(sitePromises).then(sites => {
						if (Array.isArray(sites)) {
							data.items.forEach(function (job, index) {
								var site = sites.at(index);
								if (site && site.select) {
									if (site.select.type === 'repository') {
										job.augmentedSiteName = site.select.repository && site.select.repository.name;
									} else {
										job.augmentedSiteName = site.select.site && site.select.site.name;
									}
									job.policies = site.apply && site.apply.policies;
								}
							});
						}

						var titleFormat = '%-26s  %-32s  %-16s  %-9s  %-10s  %-22s  %-24s  %-10s  %-26s';
						console.log('Import jobs:');
						console.log(sprintf(titleFormat, 'Target Name', 'Id', 'Policies', 'Completed', 'Progress', 'State', 'Created At', 'Duration', 'Job Name'));
						data.items.forEach(function (job) {
							var rowFormat = `%-26s  %-${formatter.importJobColSize(32)}s  %-16s  %-9s  %-10s  %-22s  %-24s  %-10s  %-26s`;
							var state = job.state || '';
							if (job.completed) {
								console.log(sprintf(rowFormat, job.augmentedSiteName || '', formatter.importJobFormat(job.id), job.policies, job.completed, job.progress, state, job.createdAt || '', duration(job.createdAt, job.completedAt), job.name));
							} else {
								console.log(sprintf(rowFormat, job.augmentedSiteName || '', formatter.importJobFormat(job.id), job.policies, job.completed, job.progress, state, job.createdAt || '', '', job.name));
							}
						});
						done(true);
					}).catch((e) => {
						console.log('ERROR: Retrieving job details failed.');
						done();
					});
				} else {
					done(true);
				}
			});
		});
	} catch (e) {
		console.error(e);
		done();
	}
};

/**
 * describe import job
 */
module.exports.describeImportJob = function (argv, done) {
	'use strict';
	var self = this;

	if (!verifyRun(argv)) {
		done();
		return;
	}

	try {
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
			exportImportRest.getImportJobTargets({
				server: server,
				id: argv.id
			}).then(function (data) {
				if (data.err) {
					done();
					return;
				}

				var job = data.job;
				if (job.targets && job.targets.length > 0) {
					var target = job.targets.at(0);
					if (target.apply.policies === 'updateRepository') {
						return assetUtils.describeRepositoryImportJob(server, argv.id, argv.download, data, projectDir, done);
					} else {
						return site.describeSiteImportJob(argv, done);
					}
				} else {
					done();
				}
			})
		});
	} catch (e) {
		console.error(e);
		done();
	}
};
