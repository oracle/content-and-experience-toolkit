/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var os = require('os'),
	readline = require('readline'),
	serverUtils = require('./serverUtils'),
	sprintf = require('sprintf-js').sprintf;

var console = require('./logger.js').console;

if (process.shim) {
	process.stdout.write = console.log;
}

var _getBackgroundJobStatus = function (server, url) {
	return new Promise(function (resolve, reject) {
		var augmentedUrl = (url.indexOf('?') !== -1) ? url : url + '?links=none';
		var options = {
			url: augmentedUrl,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		// Note: Export service on dev instances requires additional header
		if (url.indexOf('/system/export') !== -1 && server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		var endpoint = serverUtils.replaceAll(augmentedUrl, server.url);
		if (endpoint.indexOf('/') > 0) {
			endpoint = endpoint.substring(endpoint.indexOf('/'));
		}

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {

			if (error) {
				console.error('ERROR: failed to get status from ' + endpoint + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
				data.ecid = response.ecid;
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to get status from ' + endpoint + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

var _exportSite = function (server, name, siteName, siteId, folderId, includeUnpublishedAssets) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/exports';

		var payload = {
			name: name,
			target: {
				provider: "docs",
				docs: {
					folderId: folderId
				}
			},
			sources: [{
				select: {
					type: "site",
					site: {
						id: siteId
					}
				},
				apply: {
					policies: "exportSite",
					exportSite: {
						includeUnpublishedAssets: includeUnpublishedAssets
					}
				}
			}]
		};

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to export site ' + (siteName) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - submit background job');
				console.info(' - job status: ' + statusUrl);
				statusUrl += '?fields=id,name,description,progress,completed,message,completedPercentage,sources,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports';
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine && console.showInfo()) {
									process.stdout.write(os.EOL);
								}
								console.error('ERROR: Export Site job ' + data.id + ' ' + data.progress + ' (ecid: ' + response.ecid + ')');
								return resolve({
									err: 'err',
									job: data,
									reports: _getReports(response.location, data)
								});
							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									if (data.completedPercentage) {
										process.stdout.write(' - Export Site job in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									}
									process.stdout.write(os.EOL);
								}
								console.info(' - Export Site job ' + data.id + ' completed [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve({
									job: data,
									reports: _getReports(response.location, data)
								});
							} else {
								if (console.showInfo()) {
									process.stdout.write(' - Export Site job in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								}
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to export site ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err',
					job: data
				});
			}

		});
	});
};

/**
 * Export a site on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} name of the export
 * @param {string} siteId of the site for export
 * @param {string} folderId on Documents to export to
 * @param {string} includeunpublishedassets flag to include unpublished assets or not
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportSite = function (args) {
	var server = args.server;
	return _exportSite(server, args.name, args.siteName, args.siteId, args.folderId, args.includeunpublishedassets);
};

var _createArchive = function (server, folderId, archiveType) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/archives';

		var payload = {
			provider: "docs",
			docs: {
				folderId: folderId
			}
		};

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create archive ' + (folderId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - job status: ' + statusUrl);
				console.info(' - submit background job for create archive for archive type ' + archiveType);
				if (archiveType === 'repository') {
					// TODO: Pending confirmation from server team on the fields for repository.
					statusUrl += '?fields=id,entries,provider,docs.entries.repository,entries.repository.id,entries.repository.name';
				} else {
					statusUrl += '?fields=id,entries.entityName,entries.entityType,provider,entries.site.id,entries.site.name,entries.site.isEnterprise,entries.site.defaultLanguage,entries.site.channel,entries.site.channel,entries.site.channel.localizationPolicy,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName';
				}
				var startTime = new Date();
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							if (!data || data.error) {
								clearInterval(inter);
								var msg = data && data.error ? (data.error.detail || data.error.title) : '';
								console.error('ERROR: Create archive failed: ' + msg + ' (ecid: ' + response.ecid + ')');
								return resolve({
									err: 'err'
								});
							} else {
								clearInterval(inter);
								console.info(' - Create archive finished [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve(data);
							}
						});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to create archive ' + (folderId) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Create archive
 * @param {object} args
 * @param {string} folderId on Documents to create archive from
 * @param {string} archiveType empty for backward compatibility for site, 'repository
 * @returns
 */
module.exports.createArchive = function (args) {
	var server = args.server;
	return _createArchive(server, args.folderId, args.archiveType);
};

var _showValidationResults = function (source, job) {
	var results = job.validationResults;

	if (!results) {
		return;
	}

	var jobFormat = '   %-28s  %-s',
		v1Format = '     %-26s  %-s',
		v2Format = '       %-24s  %-s',
		v3Format = '         %-22s  %-s';

	if ((job.validationSummary && job.validationSummary.messagesByEntityTypes.length > 0) || (job.validationResults && job.validationResults.items.length > 0)) {
		console.log(sprintf(jobFormat, 'Validation', ''));

		if (job.validationSummary && job.validationSummary.messagesByEntityTypes.length > 0) {
			job.validationSummary.messagesByEntityTypes.forEach((entity) => {
				if (entity.countsByLevel.error > 0) {
					console.log(sprintf(v1Format, 'error count', entity.countsByLevel.error));
				}
				if (entity.countsByLevel.warning > 0) {
					console.log(sprintf(v1Format, 'warning count', entity.countsByLevel.warning));
				}
				if (entity.countsByLevel.info > 0) {
					console.log(sprintf(v1Format, 'info count', entity.countsByLevel.info));
				}
			})
		}

		if (job.validationResults && job.validationResults.items.length > 0) {
			job.validationResults.items.forEach((item) => {
				console.log(sprintf(v2Format, item.entityType, item.entityName));
				item.messages.items.forEach(function (message) {
					console.log(sprintf(v3Format, message.level, message.text));
				});
			});
		}
		console.info('');
	}
};

var _pollImportJob = function (server, statusUrl, type, resolve, reject, response) {
	var typeText = 'import';
	if (type === 'site') {
		typeText = 'import site';
	} else if (type === 'repository') {
		typeText = 'import repository';
	}
	console.info(' - submit background job for ' + typeText);
	console.info(' - job status: ' + statusUrl);
	var url = statusUrl + '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed,completedPercentage,reports';

	if (type === 'site') {
		url += ',targets.select.type,targets.select.site,id,targets.select.site.name';
		url += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
		url += ',validationResults.entityName,validationResults.entityType,validationResults.assetType.source.typeCategory,validationResults.assetType.target.typeCategory,validationResults.messages,validationResults.messages.level,validationResults.messages.text';
	} else if (type === 'repository') {
		url += ',targets.apply.policies';
		url += ',targets.apply.updateRepository,targets.apply.updateRepository.repository';
		url += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
		url += ',validationResults.entityName,validationResults.entityType,validationResults.assetType.source.typeCategory,validationResults.assetType.target.typeCategory,validationResults.messages,validationResults.messages.level,validationResults.messages.text';
	}

	var startTime = new Date();
	var needNewLine = false;
	var inter = setInterval(function () {
		_getBackgroundJobStatus(server, url)
			.then(function (data) {
				if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'blocked' || data.progress === 'aborted') {
					clearInterval(inter);
					if (needNewLine && console.showInfo()) {
						process.stdout.write(os.EOL);
					}
					if (response) {
						console.error('ERROR: ' + typeText + ' job ' + data.id + ' ' + data.progress + ' (ecid: ' + response.ecid + ')');
					}
					_showValidationResults(' - ' + typeText, data);
					return resolve({
						err: 'error',
						job: data,
						reports: _getReports(statusUrl, data)
					});
				} else if (data.completed && data.progress === 'succeeded') {
					clearInterval(inter);
					if (console.showInfo()) {
						if (data.completedPercentage) {
							process.stdout.write(' - ' + typeText + ' job in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						}
						process.stdout.write(os.EOL);
					}
					if (data.state === 'allCompleted') {
						console.info(' - ' + typeText + ' job ' + data.id + ' ' + data.state + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					} else {
						console.warn('WARNING: ' + typeText + ' job ' + data.id + ' ' + data.state + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					}
					return resolve({
						job: data,
						reports: _getReports(statusUrl, data)
					});
				} else {
					if (console.showInfo()) {
						process.stdout.write(' - ' + typeText + ' job in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
					}
					readline.cursorTo(process.stdout, 0);
					needNewLine = true;
				}
			});
	}, 10000);
};

/**
 * Poll import site job
 * @param {object} args
 * @returns
 */
module.exports.pollImportJobStatus = function (args) {
	return new Promise(function (resolve, reject) {

		var server = args.server,
			statusUrl = server.url + '/system/export/api/v1/imports/' + args.id,
			type = args.type;

		_pollImportJob(server, statusUrl, type, resolve, reject);
	});
};

var _importSite = function (server, name, archiveId, siteId, repositoryId, localizationPolicyId, sitePrefix, policies, assetspolicy, newsite, ignorewarnings) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/imports';

		var payload = {
			name: name,
			source: {
				"provider": "archive",
				"archive": {
					"id": archiveId
				}
			},
			targets: [{
				select: {
					type: "site",
					site: {
						id: siteId
					}
				},
				apply: {
					policies: policies
				}
			}],
			"policies": {
				"ignoreAllValidationWarnings": ignorewarnings
			}
		};

		if (repositoryId) {
			switch (policies) {
			case 'createSite':
				payload.targets[0].apply.createSite = {
					"assetsPolicy": assetspolicy,
					"site": {
						"repository": {
							"id": repositoryId
						}
					}
				}
				break;
			case 'updateSite':
				payload.targets[0].apply.updateSite = {
					"assetsPolicy": assetspolicy,
					"site": {
						"repository": {
							"id": repositoryId
						}
					}
				}
				break;
			case 'duplicateSite':
				payload.targets[0].apply.duplicateSite = {
					"assetsPolicy": 'duplicate',
					"site": {
						"name": newsite,
						"sitePrefix": sitePrefix,
						"repository": {
							"id": repositoryId
						},
						channel: {
							"localizationPolicy": {
								"id": localizationPolicyId
							}
						}
					}
				}
				break;
			default:
			}
		} else {
			payload.targets[0].apply.policies = policies;
			if (policies === 'duplicateSite') {
				payload.targets[0].apply.duplicateSite = {
					"site": {
						"name": newsite
					}
				}
			}
		}

		console.info(' - Import Site payload ' + JSON.stringify(payload));

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to import site ' + (archiveId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
				return;
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				_pollImportJob(server, statusUrl, 'site', resolve, reject, response);
			} else {
				console.info(' - Import Site job status: No statusUrl');
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to import site ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Import a site to server
 * @param {object} args
 * @returns
 */
module.exports.importSite = function (args) {
	var server = args.server;
	return _importSite(server, args.name, args.archiveId, args.siteId, args.repositoryId, args.localizationPolicyId, args.sitePrefix, args.policies, args.assetspolicy, args.newsite, args.ignorewarnings);
};

var _getExportJobSources = function (server, id) {
	return new Promise(function (resolve, reject) {
		var stem = server.url + '/system/export/api/v1/exports/' + id,
			url = stem + '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed,completedPercentage,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports,sources.select.type,sources.apply';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get export job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get export job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Get export job sources
 * @param {object} args
 * @returns
 */
module.exports.getExportJobSources = function (args) {
	var server = args.server;
	return _getExportJobSources(server, args.id);
};

var _describeExportJob = function (server, id, type) {
	return new Promise(function (resolve, reject) {

		var stem = server.url + '/system/export/api/v1/exports/' + id;
		var url = stem;

		if (type === 'site') {
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed,completedPercentage,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports,sources.select.type,sources.select.site.id,sources.apply.exportSite.includeUnpublishedAssets';
		} else if (type === 'repository') {
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,completed,completedPercentage,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports';
			url += ',sources.select.type,sources.select.repository,sources.apply,sources.apply.exportRepository,sources.apply.exportRepository.assetOptions,sources.apply.exportRepository.assetOptions.assetTypeOptions';
			url += ',sources.apply.exportRepository.assetOptions.channelOptions';
		}

		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get export job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get export job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Describe export job
 * @param {object} args
 * @returns
 */
module.exports.describeExportJob = function (args) {
	var server = args.server;
	return _describeExportJob(server, args.id, args.type);
};

var _getImportJobTargets = function (server, id) {
	return new Promise(function (resolve, reject) {
		var stem = server.url + '/system/export/api/v1/imports/' + id,
			url = stem + '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed,reports,targets.apply.policies';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get import job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get import job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Get import job targets
 * @param {object} args
 * @returns
 */
module.exports.getImportJobTargets = function (args) {
	var server = args.server;
	return _getImportJobTargets(server, args.id);
};

var _describeImportJob = function (server, id, type) {
	return new Promise(function (resolve, reject) {

		var stem = server.url + '/system/export/api/v1/imports/' + id;
		var url = stem;

		if (type === 'site') {
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed,reports';
			url += ',source,source.archive,targets.select.type,targets.select.site,id,targets.select.site.name';
			url += ',targets.select.site.channel.name,targets.select.site.channel.localizationPolicy.name,targets.select.site.defaultLanguage,targets.apply.policies';
			url += ',targets.apply.createSite.site.repository,targets.apply.createSite.assetsPolicy';
			url += ',targets.apply.updateSite.site.repository,targets.apply.updateSite.assetsPolicy';
			url += ',targets.apply.duplicateSite.site.repository,targets.apply.duplicateSite.assetsPolicy';
			url += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
			url += ',validationResults.entityName,validationResults.entityType,validationResults.assetType.source.typeCategory,validationResults.assetType.target.typeCategory,validationResults.messages,validationResults.messages.level,validationResults.messages.text';
		} else if (type === 'repository') {
			url += '?fields=id,name,description,createdBy,createdAt,completedAt,progress,state,completed,reports';
			url += ',source.archive';
			url += ',targets.apply.policies';
			url += ',targets.apply.updateRepository,targets.apply.updateRepository.repository';
			url += ',validationSummary.messagesByEntityTypes.entityType,validationSummary.messagesByEntityTypes.countsByLevel.warning,validationSummary.messagesByEntityTypes.countsByLevel.error,validationSummary.messagesByEntityTypes.countsByLevel.info';
			url += ',validationResults.entityName,validationResults.entityType,validationResults.assetType.source.typeCategory,validationResults.assetType.target.typeCategory,validationResults.messages,validationResults.messages.level,validationResults.messages.text';
		}
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}
		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to get import job (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
				return;
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			if (response && response.statusCode === 200) {
				resolve({
					job: data,
					reports: _getReports(stem, data)
				});
			} else {
				console.error('ERROR: failed to get import job ' + id + ' : ' + (response ? (response.statusMessage || response.statusCode) : '') + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: 'err'
				});
			}
		});
	});
};

/**
 * Describe export job
 * @param {object} args
 * @returns
 */
module.exports.describeImportJob = function (args) {
	var server = args.server;
	return _describeImportJob(server, args.id, args.type);
};

var _getReports = function (location, job) {
	var urls = [];
	((job.reports && job.reports.items) || []).forEach(function (report) {
		urls.push(location + '/reports/' + report.id + '/package');
	});
	return urls;
}

var _exportRepository = function (server, name, repositoryName, repositoryId, folderId, includeoptions, includeassets, query, includetypes, includechannels, includelocalizationpolicy, includecustomcomponents, includetaxonomies, includecollections) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/exports';

		var payload = {
			name: name,
			target: {
				provider: "docs",
				docs: {
					folderId: folderId
				}
			},
			sources: [{
				select: {
					type: "repository",
					repository: {
						id: repositoryId
					}
				},
				apply: {
					policies: "exportRepository",
					exportRepository: {
						assetOptions: {}
					}
				}
			}]
		};

		if (includeoptions) {
			payload.sources[0].apply.exportRepository = JSON.parse(includeoptions);
		} else {
			if (includeassets) {
				if (query) {
					payload.sources[0].apply.exportRepository.assetOptions.q = query;
				}
				if (includetaxonomies) {
					payload.sources[0].apply.exportRepository.assetOptions.includeTaxonomies = includetaxonomies;
				}
				if (includecollections) {
					payload.sources[0].apply.exportRepository.assetOptions.includeCollections = includecollections;
				}
			}
			if (includetypes) {
				// TODO: Use includeAssetType now. Wiki page said includeAssetTypes
				payload.sources[0].apply.exportRepository.assetOptions.includeAssetType = includetypes;
				payload.sources[0].apply.exportRepository.assetOptions.assetTypeOptions = {
					includeCustomComponents: includecustomcomponents
				};
			}
			if (includechannels) {
				payload.sources[0].apply.exportRepository.assetOptions.includeChannels = includechannels;
				payload.sources[0].apply.exportRepository.assetOptions.channelOptions = {
					includeLocalizationPolicy: includelocalizationpolicy
				}
			}
			payload.sources[0].apply.exportRepository.includeAssets = includeassets;
		}

		console.info(' - Export Repository payload ' + JSON.stringify(payload));

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to export repository ' + (repositoryName) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				console.info(' - submit background job');
				console.info(' - job status: ' + statusUrl);
				statusUrl += '?fields=id,name,description,progress,completed,message,completedPercentage,sources,target.provider,target.docs.folderId,target.docs.result.folderId,target.docs.result.folderName,reports';
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					_getBackgroundJobStatus(server, statusUrl)
						.then(function (data) {
							if (!data || data.error || !data.progress || data.progress === 'failed' || data.progress === 'aborted') {
								clearInterval(inter);
								if (needNewLine && console.showInfo()) {
									process.stdout.write(os.EOL);
								}
								console.error('ERROR: Export Repository job ' + data.id + ' ' + data.progress + ' (ecid: ' + response.ecid + ')');
								return resolve({
									err: 'err',
									reports: _getReports(response.location, data)
								});
							} else if (data.completed && data.progress === 'succeeded') {
								clearInterval(inter);
								if (console.showInfo()) {
									if (data.completedPercentage) {
										process.stdout.write(' - Export Repository job in process percentage ' + data.completedPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
									}
									process.stdout.write(os.EOL);
								}
								console.info(' - Export Repository job ' + data.id + ' completed [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								return resolve({
									job: data,
									reports: _getReports(response.location, data)
								});
							} else {
								if (console.showInfo()) {
									process.stdout.write(' - Export Repository job in process' + (data.completedPercentage !== undefined ? ' percentage ' + data.completedPercentage : '') + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								}
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						});
				}, 5000);
			} else {
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to export repository ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}
		});
	});
};

/**
 * Export a site on server
 * @param {object} args JavaScript object containing parameters.
 * @param {object} server the server object
 * @param {string} name of the export
 * @param {string} repositoryName of the repository for export
 * @param {string} repositoryId of the repository for export
 * @param {string} folderId on Documents to export to
 * @returns {Promise.<object>} The data object returned by the server.
 */
module.exports.exportRepository = function (args) {
	var server = args.server;
	return _exportRepository(server, args.name, args.repositoryName, args.repositoryId, args.folderId, args.options, args.includeassets, args.query, args.includetypes,
		args.includechannels, args.includelocalizationpolicy, args.includecustomcomponents, args.includetaxonomies, args.includecollections);
};

var _importRepository = function (server, name, archiveId, archiveRepoId, repositoryId, includeoptions, includeassets, includetypes, includecustomcomponents,
	includetaxonomies, includetaxonomymappings, includecollections, includecollectionmappings, includechannels, includechannelmappings,
	updatepolicy, slugprefix, ignorewarnings) {
	return new Promise(function (resolve, reject) {

		var url = '/system/export/api/v1/imports';

		var payload = {
			name: name,
			source: {
				"provider": "archive",
				"archive": {
					"id": archiveId
				}
			},
			targets: [{
				select: {
					type: "repository",
					repository: {
						id: archiveRepoId
					}
				},
				apply: {
					policies: "updateRepository",
					updateRepository: {
						repository: {
							id: repositoryId
						},
						assetOptions: {
							updatePolicy: updatepolicy,
						},
						includeAssets: false,
						includeAssetTypes: false,
						includeChannels: false,
						includeTaxonomies: false,
						includeCustomComponents: false,
						includeCollections: false
					}
				}
			}],
			"policies": {
				"ignoreAllValidationWarnings": ignorewarnings
			}
		}

		if (includeoptions) {
			var parsedoption = JSON.parse(includeoptions);

			if (!parsedoption.repository || !parsedoption.repository.id) {
				parsedoption.repository = { id: repositoryId };
			}

			payload.targets[0].apply.updateRepository = parsedoption;
		} else {
			payload.targets[0].apply.updateRepository.includeAssets = includeassets;
			payload.targets[0].apply.updateRepository.includeAssetTypes = includetypes;
			payload.targets[0].apply.updateRepository.includeCustomComponents = includecustomcomponents;
			payload.targets[0].apply.updateRepository.includeTaxonomies = includetaxonomies;
			payload.targets[0].apply.updateRepository.assetOptions.includeTaxonomyMappings = includetaxonomymappings;
			if (includetaxonomymappings) {
				payload.targets[0].apply.updateRepository.assetOptions.taxonomyMappingOptions = {
					updatePolicy: "createOrUpdate"
				};
			}
			payload.targets[0].apply.updateRepository.includeCollections = includecollections;
			payload.targets[0].apply.updateRepository.assetOptions.includeCollectionMappings = includecollectionmappings;
			if (includecollectionmappings) {
				payload.targets[0].apply.updateRepository.assetOptions.collectionMappingOptions = {
					updatePolicy: "createOrUpdate"
				};
			}
			payload.targets[0].apply.updateRepository.includeChannels = includechannels;
			payload.targets[0].apply.updateRepository.assetOptions.includeChannelMappings = includechannelmappings;
			if (includechannelmappings) {
				payload.targets[0].apply.updateRepository.assetOptions.channelMappingOptions = {
					updatePolicy: "merge"
				};
			}
		}

		if (updatepolicy === 'duplicate') {
			payload.targets[0].apply.updateRepository.assetOptions.slugPrefix = slugprefix;
		}

		console.info(' - Import Repository payload ' + JSON.stringify(payload));

		var options = {
			method: 'POST',
			url: server.url + url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(payload),
			json: true
		};

		// Note: Export service on dev instances requires additional header
		if (server.env === 'dev_ec') {
			options.headers.IDCS_REMOTE_USER = server.username;
		}

		serverUtils.showRequestOptions(options);

		var request = require('./requestUtils.js').request;
		request.post(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to import repository ' + (archiveId) + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: error
				});
				return;
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}

			var statusUrl = response.location;
			if (statusUrl) {
				_pollImportJob(server, statusUrl, 'repository', resolve, reject, response);
			} else {
				console.info(' - Import Repository job status: No statusUrl');
				var msg = (data && (data.detail || data.title)) ? (data.detail || data.title) : (response ? (response.statusMessage || response.statusCode) : '');
				console.error('ERROR: failed to import repository ' + (name) + ' : ' + msg + ' (ecid: ' + response.ecid + ')');
				resolve({
					err: msg || 'err'
				});
			}

		});
	});
};

/**
 * Import a repository to server
 * @param {object} args
 * @returns
 */
module.exports.importRepository = function (args) {
	return _importRepository(args.server, args.name, args.archiveId, args.archiveRepoId, args.repositoryId, args.options,
		args.includeassets, args.includetypes, args.includecustomcomponents, args.includetaxonomies, args.includetaxonomymappings,
		args.includecollections, args.includecollectionmappings, args.includechannels, args.includechannelmappings,
		args.updatepolicy, args.slugprefix, args.ignorewarnings);
};
