/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * translation job library
 */

var path = require('path'),
	gulp = require('gulp'),
	fs = require('fs'),
	os = require('os'),
	childProcess = require('child_process'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverUtils = require('../test/server/serverUtils.js');


var cecDir = path.join(__dirname, ".."),
	connectorsDataDir = path.join(cecDir, 'data', 'connectors');

var projectDir,
	transSrcDir,
	connectionsSrcDir,
	connectorsSrcDir,
	serversSrcDir,
	transBuildDir;

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// reset source folders
	transSrcDir = path.join(srcfolder, 'translationJobs');
	connectorsSrcDir = path.join(srcfolder, 'connectors');
	connectionsSrcDir = path.join(srcfolder, 'connections');
	serversSrcDir = path.join(srcfolder, 'servers');

	var buildfolder = serverUtils.getBuildFolder(projectDir);
	transBuildDir = path.join(buildfolder, 'translationJobs');

	return true;
};

/**
 * Global variables 
 */
var _CSRFToken;

/** 
 * private 
 */
var localServer;
var _cmdEnd = function (done, success) {
	done(success);
	if (localServer) {
		localServer.close();
	}
};


/**
 * Query translation jobs on the server
 * 
 * @param {*} server 
 * @param {*} jobType 
 */
var _getTranslationJobs = function (server, jobType) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/translationJobs?jobType=' + jobType + '&limit=99999&offset=0&orderBy=name:asc';
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to query translation jobs');
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				var jobs = data && data.items || [];
				resolve({
					jobType: jobType,
					jobs: jobs
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to query translation jobs  : ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return jobPromise;
};

/**
 * Query translation job on the server
 * 
 * @param {*} server 
 * @param {*} jobType 
 */
var _getTranslationJob = function (server, jobId) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/translationJobs/' + jobId;
		var options = {
			method: 'GET',
			url: url,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to query translation job ' + jobId);
				console.log(error);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && response.statusCode === 200) {
				resolve({
					id: jobId,
					job: data
				});
			} else {
				var msg = data ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to query translation job ' + jobId + '  : ' + msg);
				console.log(data);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return jobPromise;
};


var _updateTranslationJobStatus = function (server, csrfToken, job, status) {
	var updatePromise = new Promise(function (resolve, reject) {

		var url = server.url + '/content/management/api/v1.1/translationJobs/' + job.id;
		job.status = status;
		var formDataStr = JSON.stringify(job);
		var postData = {
			method: 'PUT',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': csrfToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: formDataStr
		};
		// console.log(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.put(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to change translation job status ' + err);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (err) {}
				resolve({
					data
				});
			} else {
				console.log('ERROR: failed to change translation job status ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'err'
				});
			}
		});
	});
	return updatePromise;
};

/**
 * Get the data field of a job and return as an object
 * 
 * @param {*} job the result from /content/management/api/v1.1/translationJobs/{jobid}
 */
var _getJobData = function (job) {
	var data = {};
	if (job.data) {
		// console.log('Job: ' + job.name + ' data: ' + job.data + ' ' + typeof job.data);
		if (job.type === 'assets') {
			data = JSON.parse(job.data);
		} else {
			var arr = job.data.split('|');
			for (var i = 0; i < arr.length; i++) {
				var attr = arr[i].split('=');
				var name = attr.length > 0 ? attr[0] : '';
				var value = attr.length > 1 ? attr[1] : '';
				if (name) {
					data[name] = value;
				}
			}
		}
	}

	return data;
};

var _validateTranslationJobSCS = function (server, idcToken, jobName, file) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_IMPORT_SITE_TRANS';
		url = url + '&IsJson=1';
		url = url + '&jobName=' + jobName;
		url = url + '&fFileGUID=' + file.id;
		url = url + '&validationMode=validateOnly&useBackgroundThread=1';
		url = url + '&idcToken=' + idcToken;

		var params = {
			method: 'GET',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to submit import translation job (validate) ' + job.jobName);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to submit import translation job (validate) ' + job.jobName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);

		});
	});
	return importPromise;
};

var _deployTranslationJobSCS = function (server, idcToken, jobName, file) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_IMPORT_SITE_TRANS';
		url = url + '&IsJson=1';
		url = url + '&jobName=' + jobName;
		url = url + '&fFileGUID=' + (file.id);
		url = url + '&validationMode=validateAndImport&useBackgroundThread=1';
		url = url + '&idcToken=' + idcToken;

		var auth = serverUtils.getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to submit import translation job ' + job.jobName);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to submit import translation job ' + jobName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);

		});
	});
	return importPromise;
};

var _getImportValidateStatusSCS = function (server, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS';
		url = url + '&IsJson=1';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var params = {
			method: 'GET',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get import translation job status');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get import translation job status' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];
			var status = {};
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				status[attr] = rows[0][i];
			}
			return resolve(status);
		});
	});
	return statusPromise;
};

var _getJobReponseDataSCS = function (server, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_RESPONSE_DATA';
		url = url + '&IsJson=1';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var params = {
			method: 'GET',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get import translation job response data');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			var result = {};
			if (data && data.LocalData) {
				result['LocalData'] = data.LocalData;
				result['valid'] = data.LocalData.valid;
				result['sourceLanguage'] = data.LocalData.sourceLanguage;
				result['targetedLanguages'] = data.LocalData.targetedLanguages;
				result['SiteValidation'] = data.LocalData.SiteValidation;
				result['AssetValidation'] = data.LocalData.AssetValidation;

				var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
				var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];

				for (var i = 0; i < fields.length; i++) {
					var attr = fields[i].name;
					result[attr] = rows[0][i];
				}
			}
			return resolve(result);
		});
	});
	return statusPromise;
};


var _displayValidationResult = function (result, jobType, tempDir) {
	if (!result || !result.JobID) {
		console.log(' - no validation result found');
		return;
	}
	// console.log(result);

	console.log('Site: ' + result.SiteId);
	console.log('valid: ' + result.valid);
	console.log('sourceLanguage: ' + result.sourceLanguage);
	console.log('targetedLanguages: ' + result.targetedLanguages);
	console.log('Assets: ');
	var ident = '  ';
	var format = '  %-30s  %-s';
	if (result.AssetValidation) {
		var assetV = JSON.parse(result.AssetValidation);
		console.log(sprintf(format, 'languagesReturnedComplete: ', (assetV.languagesReturnedComplete || '')));
		console.log(sprintf(format, 'languagesNotReturned: ', (assetV.languagesNotReturned || '')));
		console.log(sprintf(format, 'languagesReturnedIncomplete: ', (assetV.languagesReturnedIncomplete || '')));
		var itemNames = [];
		for (var i = 0; i < assetV.itemsToBeImported.length; i++) {
			itemNames[i] = assetV.itemsToBeImported[i].name;
		}
		console.log(sprintf(format, 'itemsToBeImported: ', itemNames));
	}
	console.log('Site Content: ');
	if (result.SiteValidation) {
		var siteV = JSON.parse(result.SiteValidation);
		console.log(sprintf(format, 'languagesReturnedComplete: ', siteV.languagesReturnedComplete));
		console.log(sprintf(format, 'languagesNotReturned: ', siteV.languagesNotReturned));
		console.log(sprintf(format, 'languagesReturnedIncomplete: ', siteV.languagesReturnedIncomplete));
		console.log(sprintf(format, 'translationsMissed: ', siteV.translationsMissed));
		console.log(sprintf(format, 'translationsCorrupted: ', siteV.translationsCorrupted));
		console.log(sprintf(format, 'translationsInvalidEncoding: ', siteV.translationsInvalidEncoding));
		var pageNames = [];
		for (var i = 0; i < siteV.itemsToBeImported.length; i++) {
			pageNames[i] = siteV.itemsToBeImported[i].name;
		}
		console.log(sprintf(format, 'itemsToBeImported: ', pageNames));
	}
};

var _execdeployTranslationJob = function (server, validateonly, folder, filePath, jobName, jobType, tempDir, done) {
	var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
	// console.log(' - folder: ' + folder + ' filePath: ' + filePath + ' fileName: ' + fileName);
	var idcToken;
	var tokenPromise = serverUtils.getIdcToken(server);
	tokenPromise
		.then(function (result) {
			idcToken = result.idcToken;

			var folderPromises = [];
			if (folder) {
				folderPromises.push(serverRest.findFolderHierarchy({
					server: server,
					parentID: 'self',
					folderPath: folder
				}));
			}
			return Promise.all(folderPromises);
		})
		.then(function (results) {
			if (folder && (!results || results.length === 0 || !results[0] || !results[0].id)) {
				return Promise.reject();
			}

			var folderId = folder ? results[0].id : 'self';

			// upload file
			return serverRest.createFile({
				server: server,
				parentID: folderId,
				filename: fileName,
				contents: fs.createReadStream(filePath)
			});

		}).then(function (result) {
			if (!result || !result.id) {
				return Promise.reject();
			}
			console.log(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version);

			var file = result;

			if (validateonly) {
				//
				// validate
				//
				var validatePromise = _validateTranslationJobSCS(server, idcToken, jobName, file);
				validatePromise.then(function (result) {
						if (result.err) {
							return Promise.reject();
						}
						var jobId = result.LocalData.JobID;

						// wait validate to finish
						var inter = setInterval(function () {
							var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
							jobPromise.then(function (data) {
								if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
									clearInterval(inter);
									// try to get error message
									var jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
									jobDataPromise.then(function (data) {
										console.log('ERROR: validation failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
										_cmdEnd(done);
									});
								}
								if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
									clearInterval(inter);
									console.log(' - validate ' + jobName + ' finished');
									var jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
									jobDataPromise.then(function (data) {
										_displayValidationResult(data, jobType, tempDir);
										_cmdEnd(done, true);
									});
								} else {
									console.log(' - validating: percentage ' + data.JobPercentage);
								}
							});
						}, 5000);
					})
					.catch((error) => {
						_cmdEnd(done);
					});

			} else {
				//
				// Import
				//
				var importPromise = _deployTranslationJobSCS(server, idcToken, jobName, file);
				importPromise.then(function (result) {
						if (result.err) {
							return Promise.reject();
						}

						var jobId = result.LocalData.JobID;
						var idcToken = result.LocalData.idcToken;

						// wait import to finish
						var inter = setInterval(function () {
							var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
							jobPromise.then(function (data) {
								if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
									clearInterval(inter);
									// try to get error message
									var jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
									jobDataPromise.then(function (data) {
										console.log('ERROR: import failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
										_cmdEnd(done);
									});
								}
								if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
									clearInterval(inter);
									console.log(' - import ' + jobName + ' finished');
									_cmdEnd(done, true);

								} else {
									console.log(' - importing: percentage ' + data.JobPercentage);
								}
							});
						}, 5000);
					})
					.catch((error) => {
						_cmdEnd(done);
					});
			}

		})
		.catch((error) => {
			_cmdEnd(done);
		});
};


var _exportTranslationJobSCS = function (server, idcToken, jobName, siteInfo, targetLanguages, exportType, connectorId) {
	var exportPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_EXPORT_SITE_TRANS';
		url = url + '&IsJson=1';
		var data = {
			'idcToken': idcToken,
			'LocalData': {
				'IdcService': 'SCS_EXPORT_SITE_TRANS',
				'jobName': jobName,
				'exportType': exportType,
				'sourceLanguage': siteInfo.defaultLanguage,
				'targetLanguages': targetLanguages.toString(),
				'siteGUID': siteInfo.id,
				'useBackgroundThread': '1'
			}
		};

		if (connectorId) {
			data.LocalData.connectorId = connectorId;
		}

		var options = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(data)
		};
		// console.log(options);

		var request = require('../test/server/requestUtils.js').request;
		request.post(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create translation job');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0' || !data.LocalData.JobID) {
				console.log('ERROR: failed to create translation job ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			console.log(' - create translation job submitted (' + data.LocalData.JobID + ')');
			resolve(data);
		});
	});
	return exportPromise;
};

var _execCreateTranslationJob = function (server, idcToken, name, siteInfo, targetLanguages, exportType, connectorId, done) {
	var exportPromise = _exportTranslationJobSCS(server, idcToken, name, siteInfo, targetLanguages, exportType, connectorId);
	exportPromise.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// console.log(result);
			var jobId = result.LocalData.JobID;

			// wait export to finish
			var inter = setInterval(function () {
				var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
				jobPromise.then(function (data) {
					if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
						clearInterval(inter);
						console.log('ERROR: create translation job failed: ' + (data && data.JobMessage));
						console.log(data);
						_cmdEnd(done);
					}
					if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
						clearInterval(inter);
						console.log(' - translation job ' + name + ' created');
						_cmdEnd(done, true);

					} else {
						console.log(' - creating: percentage ' + data.JobPercentage);
					}
				});
			}, 5000);
		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			_cmdEnd(done);
		});
};

var _createTranslationJob = function (server, idcToken, site, name, langs, exportType, connectorName, done) {
	// console.log('site: ' + site + ' job name: ' + name + ' languages: ' + langs + ' export type: ' + exportType);
	var allLangs = [];
	var siteInfo;
	var connector;

	var connectorPromises = [];
	if (connectorName) {
		connectorPromises.push(serverUtils.browseTranslationConnectorsOnServer(server));
	}
	Promise.all(connectorPromises)
		.then(function (results) {
			if (connectorName) {
				var connectors = results && results[0] && results[0].data || [];
				for (var i = 0; i < connectors.length; i++) {
					if (connectorName === connectors[i].connectorName) {
						connector = connectors[i];
						break;
					}
				}
				if (!connector) {
					console.log('ERROR: translation connector ' + connectorName + ' does not exist');
					return Promise.reject();
				} else if (!connector.isEnabled || connector.isEnabled.toLowerCase() !== 'true') {
					console.log('ERROR: translation connector ' + connectorName + ' is disabled');
					return Promise.reject();
				}
			}

			// verify the name
			var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
			return Promise.all(jobPromises);
		})
		.then(function (values) {
			var found = false;
			for (var i = 0; i < values.length; i++) {
				for (var j = 0; j < values[i].jobs.length; j++) {
					if (values[i].jobs[j].name === name) {
						found = true;
						break;
					}
				}
				if (found) {
					break;
				}
			}
			if (found) {
				console.log('ERROR: job ' + name + ' already exists');
				return Promise.reject();
			}

			// query site
			return sitesRest.getSite({
				server: server,
				name: site,
				expand: 'channel'
			});

		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			//
			// validate site
			//
			siteInfo = result;

			if (!siteInfo.isEnterprise) {
				console.log('ERROR: site ' + site + ' is not an enterprise site');
				return Promise.reject();
			}
			var defaultLanguage = siteInfo.defaultLanguage;

			if (!defaultLanguage) {
				console.log('ERROR: site ' + site + ' has no default language, make it translatable first.');
				return Promise.reject();
			}
			console.log(' - site: ' + site + ', default language: ' + defaultLanguage);


			var policyId = siteInfo.channel.localizationPolicy;

			return serverRest.getLocalizationPolicy({
				server: server,
				id: policyId
			});
		})
		.then(function (result) {
			//
			// Get Localization policy
			//
			if (result.err) {
				return Promise.reject();
			}
			var policy = result;
			console.log(' - site localization policy: ' + policy.name);
			allLangs = policy.requiredValues;
			allLangs = allLangs.concat(policy.optionalValues);
			// console.log(' - policy languages: ' + allLangs);

			var targetLanguages = [];
			if (langs && langs.toLowerCase() !== 'all') {
				//
				// validate languages
				//
				langArr = langs.split(',');
				for (var i = 0; i < langArr.length; i++) {
					if (langArr[i] === siteInfo.defaultLanguage) {
						console.log('ERROR: language ' + langArr[i] + ' is the default language');
						return Promise.reject();
					}
					if (!allLangs.includes(langArr[i])) {
						console.log('ERROR: language ' + langArr[i] + ' is not in the localization policy');
						return Promise.reject();
					}
				}
				targetLanguages = langArr;
			} else {
				for (var i = 0; i < allLangs.length; i++) {
					if (allLangs[i] !== siteInfo.defaultLanguage) {
						targetLanguages.push(allLangs[i]);
					}
				}
			}
			if (targetLanguages.length === 0) {
				console.log('ERROR: no target language');
				return Promise.reject();
			}
			console.log(' - target languages: ' + targetLanguages);
			_execCreateTranslationJob(server, idcToken, name, siteInfo, targetLanguages, exportType,
				(connector && connector.connectorId), done);

		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			_cmdEnd(done);
		});

};

var _createConnectorJob = function (translationconnector, jobName) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = translationconnector.url + '/v1/job';

		var formData = {
			'name': jobName
		};

		var basicAuth = 'Basic ' + serverUtils.btoa(translationconnector.user + ':' + translationconnector.password);
		var headers = {};
		headers['Authorization'] = basicAuth;
		headers['Content-Type'] = 'application/json';
		for (var i = 0; i < translationconnector.fields.length; i++) {
			headers[translationconnector.fields[i].name] = translationconnector.fields[i].value;
			formData[translationconnector.fields[i].name] = translationconnector.fields[i].value;
		}
		var postData = {
			method: 'POST',
			url: url,
			headers: headers,
			body: JSON.stringify(formData)
		};
		// console.log(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to create job on the connector: ' + error);
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.log('ERROR: failed to create job on the connector: ' + response.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {}

			if (!data || !data.properties) {
				console.log('ERROR: failed to create job on the connector: no data returned');
				return resolve({
					err: 'err'
				});
			}
			return resolve(data);
		});
	});
	return jobPromise;
};

var _sendFileToConnector = function (translationconnector, jobId, filePath) {
	var filePromise = new Promise(function (resolve, reject) {
		var url = translationconnector.url + '/v1/job/' + jobId + '/translate';

		var basicAuth = 'Basic ' + serverUtils.btoa(translationconnector.user + ':' + translationconnector.password);
		var headers = {};
		headers['Authorization'] = basicAuth;
		headers['Content-type'] = 'application/octet-stream';
		for (var i = 0; i < translationconnector.fields.length; i++) {
			headers[translationconnector.fields[i].name] = translationconnector.fields[i].value;
		}
		var postData = {
			method: 'POST',
			url: url,
			headers: headers,
			body: fs.createReadStream(filePath)
		};
		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to send zip to the job: ' + error);
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.log('ERROR: failed to send zip to the job: ' + response.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {}

			return resolve(data);
		});
	});

	return filePromise;
};

var _refreshConnectorJob = function (translationconnector, connection, jobId) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = translationconnector.url + '/v1/job/' + jobId + '/refreshTranslation?connection=' + connection;

		var basicAuth = 'Basic ' + serverUtils.btoa(translationconnector.user + ':' + translationconnector.password);
		var headers = {};
		headers['Authorization'] = basicAuth;
		headers['Content-Type'] = 'application/json';
		for (var i = 0; i < translationconnector.fields.length; i++) {
			headers[translationconnector.fields[i].name] = translationconnector.fields[i].value;
		}
		var postData = {
			method: 'POST',
			url: url,
			headers: headers
		};
		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to refresh job on the connector: ' + error);
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.log('ERROR: failed to refresh job on the connector: ' + response.statusMessage);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {}

			if (!data || !data.properties) {
				console.log('ERROR: failed to refresh job on the connector: no data returned');
				return resolve({
					err: 'err'
				});
			}
			return resolve(data);
		});
	});
	return jobPromise;
};

var _getJobFromConnector = function (translationconnector, jobId, jobName) {
	var jobPromise = new Promise(function (resolve, reject) {
		var url = translationconnector.url + '/v1/job/' + jobId;
		var basicAuth = 'Basic ' + serverUtils.btoa(translationconnector.user + ':' + translationconnector.password);
		var headers = {};
		headers['Authorization'] = basicAuth;
		headers['Content-Type'] = 'application/json';
		for (var i = 0; i < translationconnector.fields.length; i++) {
			headers[translationconnector.fields[i].name] = translationconnector.fields[i].value;
		}

		var options = {
			url: url,
			headers: headers
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get job ' + jobName + ' from connector: ' + err);
				return resolve({
					err: 'err'
				});
			}

			var data = {};
			try {
				data = JSON.parse(body);
			} catch (err) {}

			if (!response || response.statusCode !== 200) {
				console.log('ERROR: Failed to get job ' + jobName + ' from connector: ' + (data && data.message));
				return resolve({
					err: 'err'
				});
			}
			return resolve(data);
		});
	});
	return jobPromise;
};

var _getTranslationFromConnector = function (translationconnector, jobId, targetFile) {
	var transPromise = new Promise(function (resolve, reject) {
		var url = translationconnector.url + '/v1/job/' + jobId + '/translation';

		var basicAuth = 'Basic ' + serverUtils.btoa(translationconnector.user + ':' + translationconnector.password);
		var headers = {};
		headers['Authorization'] = basicAuth;
		//headers['Content-Type'] = 'application/json';
		for (var i = 0; i < translationconnector.fields.length; i++) {
			headers[translationconnector.fields[i].name] = translationconnector.fields[i].value;
		}

		var options = {
			url: url,
			headers: headers,
			encoding: null
		};

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get translation from connector:');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			if (!response || response.statusCode !== 200) {
				console.log('ERROR: Failed to get translation from connector: ' + response.errorMessage);
				return resolve({
					'err': 'err'
				});
			} else {
				fs.writeFileSync(targetFile, body);
				return resolve(body);
			}

		});
	});
	return transPromise;
};


/**
 * Validate translation job file
 * @param {*} file 
 */
var _validateTranslationJobZip = function (file) {
	var validatePromise = new Promise(function (resolve, reject) {
		var name = file;
		if (name.indexOf('/') >= 0) {
			name = name.substring(name.lastIndexOf('/') + 1);
		}

		if (name.indexOf('.') > 0) {
			name = name.substring(0, name.indexOf('.'));
		}
		var tempDir = path.join(transBuildDir, name);
		// remove the folder
		fileUtils.remove(tempDir);

		fileUtils.extractZip(file, tempDir)
			.then(function (err) {
				if (err) {
					return resolve({
						filename: name,
						site: undefined,
						assets: undefined
					});
				}

				var sitejob, assetsjob;
				if (fs.existsSync(path.join(tempDir, 'site', 'job.json'))) {
					var jobstr = fs.readFileSync(path.join(tempDir, 'site', 'job.json'));
					sitejob = JSON.parse(jobstr);
				}
				if (fs.existsSync(path.join(tempDir, 'assets', 'job.json'))) {
					var jobstr = fs.readFileSync(path.join(tempDir, 'assets', 'job.json'));
					assetsjob = JSON.parse(jobstr);
				}
				if (assetsjob === undefined && fs.existsSync(path.join(tempDir, 'job.json'))) {
					var jobstr = fs.readFileSync(path.join(tempDir, 'job.json'));
					assetsjob = JSON.parse(jobstr);
				}

				var job = {
					filename: name,
					site: sitejob,
					assets: assetsjob
				};

				return resolve(job);
			});
	});
	return validatePromise;
};

var _importJob = function (jobPath, actionType) {
	var importPromise = new Promise(function (resolve, reject) {

		if (!path.isAbsolute(jobPath)) {
			jobPath = path.join(projectDir, jobPath);
		}
		jobPath = path.resolve(jobPath);

		if (!fs.existsSync(jobPath)) {
			console.log('ERROR: file ' + jobPath + ' does not exist');
			return resolve({
				err: 'err'
			});
		}

		var validatePromise = _validateTranslationJobZip(jobPath);
		validatePromise.then(function (result) {
			if (!result.site && !result.assets) {
				console.log('ERROR: file ' + jobPath + ' is not a valid translation job file');
				return resolve({
					err: 'err'
				});
			}

			console.log(' - validate translation file');
			var job = result.site || result.assets;
			var jobName = job.jobName || job.filename;

			var jobSrcPath = path.join(transSrcDir, jobName);

			fileUtils.extractZip(jobPath, jobSrcPath)
				.then(function (err) {
					if (err) {
						if (actionType && actionType === 'ingest') {
							console.log('ERROR: failed to ingest translation job ' + jobPath);
						} else {
							console.log('ERROR: failed to import translation job ' + jobPath);
						}
						console.log(err);
						return resolve({
							err: 'err'
						});
					}

					if (actionType && actionType === 'ingest') {
						console.log(' - translation job ingested to ' + jobSrcPath);
					} else {
						console.log(' - translation job imported to ' + jobSrcPath);
					}
					resolve({});
				});
		});
	});
	return importPromise;
};

/**
 * list translation jobs on the server
 */
var _listServerTranslationJobs = function (argv, done) {
	'use strict';

	projectDir = argv.projectDir || projectDir;

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	// console.log(' - server: ' + server.url);
	var type = argv.type;
	if (type && type !== 'sites' && type !== 'assets') {
		console.log('ERROR: invalid job type ' + type);
		done();
		return;
	}

	var _getConnectName = function (connectors, id) {
		var name;
		for (var i = 0; i < connectors.length; i++) {
			if (connectors[i].connectorId === id) {
				name = connectors[i].connectorName;
				break;
			}
		}
		return name;
	};

	var _getConnectorJobStatus = function (connectorJobs, jobName) {
		var data = {};
		for (var i = 0; i < connectorJobs.length; i++) {
			if (jobName === connectorJobs[i].connectorJobTitle) {
				data = {
					status: connectorJobs[i].connectorJobStatus,
					progress: connectorJobs[i].connectorJobProgress
				};
				break;
			}
		}
		return data;
	};

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		var connectors;
		var jobs = [];
		serverUtils.browseTranslationConnectorsOnServer(server)
			.then(function (result) {
				connectors = result && result.data || [];
				// console.log(connectors);

				var jobPromises = [];
				if (type) {
					jobPromises.push(_getTranslationJobs(server, type));
				} else {
					jobPromises.push(_getTranslationJobs(server, 'assets'));
					jobPromises.push(_getTranslationJobs(server, 'sites'));
				}

				return Promise.all(jobPromises);
			})
			.then(function (values) {
				var jobDetailPromises = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i] && values[i].jobs) {
						for (var j = 0; j < values[i].jobs.length; j++) {
							jobDetailPromises.push(_getTranslationJob(server, values[i].jobs[j].id));
						}
					}
				}

				return Promise.all(jobDetailPromises);
			})
			.then(function (values) {
				// merge the detail query result to the list
				var connectorJobPromises = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i].job) {
						jobs.push(values[i].job);

						if (values[i].job.id && values[i].job.connectorId) {
							connectorJobPromises.push(serverUtils.getTranslationConnectorJobOnServer(server, values[i].job.id));
						}
					}
				}

				return Promise.all(connectorJobPromises);

			})
			.then(function (results) {
				var connectorJobs = [];
				if (results) {
					for (var i = 0; i < results.length; i++) {
						if (results[i].data) {
							connectorJobs.push(results[i].data);
						}
					}
				}
				// console.log(connectorJobs);

				//
				// display 
				//
				var format = '%-40s %-14s %-15s %-36s %-36s %-s';

				if (!type || type === 'assets') {
					console.log('Asset translation jobs:');
					console.log(sprintf(format, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages', 'Connector Status'));
					for (var i = 0; i < jobs.length; i++) {
						if (jobs[i].type === 'assets') {
							var data = _getJobData(jobs[i]);
							var sourceLanguage = data && data.properties && data.properties.sourceLanguage || '';
							var targetlanguages = data && data.properties && data.properties.targetLanguages || '';
							var connStr = '';
							if (jobs[i].connectorId) {
								var connData = _getConnectorJobStatus(connectorJobs, jobs[i].name);
								connStr = _getConnectName(connectors, jobs[i].connectorId) + ' ' + (connData && connData.status ? connData.status : '');

							}
							console.log(sprintf(format, jobs[i].name, jobs[i].status, sourceLanguage, targetlanguages, jobs[i].assetPendingLanguages, connStr));
						}
					}
				}

				if (!type || type === 'sites') {
					console.log('Site translation jobs:');
					console.log(sprintf(format, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages', 'Connector Status'));
					for (var i = 0; i < jobs.length; i++) {
						if (jobs[i].type === 'sites') {
							var data = _getJobData(jobs[i]);
							var sourceLanguage = data && data.sourceLanguage || '';
							var targetlanguages = data && data.targetLanguages || '';
							var connStr = '';
							if (jobs[i].connectorId) {
								var connData = _getConnectorJobStatus(connectorJobs, jobs[i].name);
								connStr = _getConnectName(connectors, jobs[i].connectorId) + ' ' + (connData && connData.status ? connData.status : '');
							}
							console.log(sprintf(format, jobs[i].name, jobs[i].status, sourceLanguage, targetlanguages, jobs[i].sitePendingLanguages, connStr));
						}
					}
				}

				done(true);
			});
	});
};

var _getconnectorServerInfo = function (connectorServer, user, password) {
	var serverInfoPromise = new Promise(function (resolve, reject) {
		var url = connectorServer + '/v1/server';
		var options = {
			method: 'GET',
			url: url
		};
		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query translation connector: ' + err);
				return resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var fields = data && data.fields || [];
				resolve({
					fields: fields
				});
			} else {
				console.log('ERROR: failed to query translation connector: ' + response.statusCode);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return serverInfoPromise;
};

var _getJobType = function (jobName) {
	var jobDir = path.join(transSrcDir, jobName);
	var jobType;
	if (fs.existsSync(path.join(jobDir, 'site', 'job.json'))) {
		jobType = 'sites';
	} else if (fs.existsSync(path.join(jobDir, 'job.json'))) {
		jobType = 'assets';
	} else if (fs.existsSync(path.join(jobDir, 'assets', 'job.json'))) {
		jobType = 'sites';
	}
	return jobType;
};

/**
 * Ge the connection and jobID from the translation job
 * @param {*} jobName 
 */
var _getJobConnectionInfo = function (jobName) {
	var connectionpath = path.join(transSrcDir, jobName, 'connectionjob.json');
	var str = fs.existsSync(connectionpath) ? fs.readFileSync(connectionpath) : undefined;
	var jobconnectionjson = str ? JSON.parse(str) : undefined;
	return jobconnectionjson;
};

/**
 * Get connection config from connection.json
 * @param {*} name connection name
 */
var _getConnectionInfo = function (connection) {
	if (!connection) {
		return undefined;
	}
	var connectionfile = path.join(connectionsSrcDir, connection, 'connection.json');
	if (!fs.existsSync(connectionfile)) {
		console.log('ERROR: connection ' + connection + ' does not exist');
		return;
	}
	var connectionstr = fs.readFileSync(connectionfile).toString();
	var connectionjson = connectionstr ? JSON.parse(connectionstr) : undefined;
	return connectionjson;
};


///////////////////////////////////////////////////////////////////////////////////
//
// Tasks
//

/**
 * Download a translation job from the server
 */
module.exports.downloadTranslationJob = function (argv, done) {
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

	var jobName = argv.name;

	if (!jobName) {
		console.error('ERROR: please run as npm run download-server-translation-job -- --name <job name> [--output <the folder for the translation zip file>]');
		done();
		return;
	}

	// download the zip to dist 
	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		// verify the name
		var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
		Promise.all(jobPromises).then(function (values) {
			var job;
			for (var i = 0; i < values.length; i++) {
				for (var j = 0; j < values[i].jobs.length; j++) {
					if (values[i].jobs[j].name === jobName) {
						job = values[i].jobs[j];
						break;
					}
				}
				if (job) {
					break;
				}
			}
			if (!job) {
				console.log('ERROR: job ' + jobName + ' does not exist');
				done();
				return;
			}
			if (job.status === 'PREPARING') {
				console.log(' - the trabslation job is under preparing, try to download later');
				done();
				return;
			}
			// console.log(job);
			var fFileGUID = job.fFileGUID;
			var downloadPromise = serverRest.downloadFile({
				server: server,
				fFileGUID: job.fFileGUID
			});
			downloadPromise.then(function (result) {
				if (result.err) {
					done();
					return;
				}
				var fileName = jobName + '.zip';
				var filePath = path.join(destdir, fileName);
				fs.writeFileSync(filePath, result.data);
				console.log(' - translation job downloaded to ' + filePath);
				if (job.status === 'READY') {
					// change to INPROGRESS
					var tokenPromise = serverUtils.getCaasCSRFToken(server);
					tokenPromise
						.then(function (result) {
							if (result.err) {
								done();
								return;
							}
							var token = result && result.token;
							// console.log('token: ' + token);
							return _updateTranslationJobStatus(server, token, job, 'INPROGRESS');
						})
						.then(function (result) {
							if (!result.err) {
								console.log(' - update the translation job status to INPROGRESS');
							}

							// import into local
							var importPromise = _importJob(filePath);
							importPromise.then(function (result) {
								if (result && result.err) {
									done();
								} else {
									done(true);
								}
							});
						});
				} else {
					// no need to change status

					// import into local
					var importPromise = _importJob(filePath);
					importPromise.then(function (result) {
						if (result && result.err) {
							done();
						} else {
							done(true);
						}
					});
				}
			}); // job zip downloaded

		}); // query jobs
	});
};

/**
 * Upload a translation job to the server
 */
module.exports.uploadTranslationJob = function (argv, done) {
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

	var validateonly = typeof argv.validateonly === 'string' && argv.validateonly.toLowerCase() === 'true';

	var name = argv.name;

	// verify the job exists
	var jobs = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	var jobExist = false;
	for (var i = 0; i < jobs.length; i++) {
		if (name === jobs[i]) {
			jobExist = true;
			break;
		}
	}
	if (!jobExist) {
		console.error('ERROR: translation job ' + name + ' does not exist');
		done();
		return;
	}

	// folder path on the server
	var folder = argv.folder && argv.folder.toString();
	if (folder === '/') {
		folder = '';
	} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
		console.log('ERROR: invalid folder');
		done();
		return;
	}

	var jobSrcPath = path.join(transSrcDir, name);
	var connectionjobfile = path.join(jobSrcPath, 'connectionjob.json');
	// zip the job first
	gulp.src([jobSrcPath + '/**', '!' + connectionjobfile])
		.pipe(zip(name + '.zip'))
		.pipe(gulp.dest(path.join(projectDir, 'dist')))
		.on('end', function () {
			var zippath = path.join(projectDir, 'dist', name + '.zip');
			console.log(' - created translation job zip file ' + zippath);

			var loginPromise = serverUtils.loginToServer(server);
			loginPromise.then(function (result) {
				if (!result.status) {
					console.log(' - failed to connect to the server');
					done();
					return;
				}

				var tempDir = path.join(transBuildDir, name);
				var jobType = _getJobType(name);
				// console.log(' - job: ' + name + ' type: ' + jobType + ' zip: ' + zippath);
				_execdeployTranslationJob(server, validateonly, folder, zippath, name, jobType, tempDir, done);

			}); // login to server
		});
};

/**
 * Create a translation job on the server
 */
module.exports.createTranslationJob = function (argv, done) {
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
	var site = argv.site;

	if (!name || !site) {
		console.error('ERROR: please run as npm run create-translation-job -- --name <name> --site <site name>');
		done();
		return;
	}

	if (name.match(/[`/\\*\"\<\>\|\?\'\:]/)) {
		console.error('ERROR: The job name should not contain the following characters: /\\*\"<>|?\':"');
		done();
		return;
	}
	if (!site) {
		console.error('ERROR: please use --site to specify the site');
		done();
		return;
	}

	var langs = argv.languages;

	var exportType = argv.type || 'siteAll';
	var connector = argv.connector;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var idcToken;

		serverUtils.getIdcToken(server)
			.then(function (result) {
				idcToken = result && result.idcToken;
				if (!idcToken) {
					console.log('ERROR: failed to get idcToken');
					done();
				} else {

					console.log(' - establish user session');
					_createTranslationJob(server, idcToken, site, name, langs, exportType, connector, done);
				}
			});
	});
};

/**
 * list local translation jobs
 */
module.exports.listTranslationJobs = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (argv.server) {
		_listServerTranslationJobs(argv, done);
		return;
	}

	//
	// local translation jobs
	//

	var jobNames = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	if (jobNames.length === 0) {
		console.log(' - no local translation job available');
		done();
		return;
	}

	var jobs = [];
	for (var i = 0; i < jobNames.length; i++) {
		var jobpath = path.join(transSrcDir, jobNames[i]);
		var jobjson;
		if (fs.existsSync(path.join(jobpath, 'site', 'job.json'))) {
			var jobstr = fs.readFileSync(path.join(jobpath, 'site', 'job.json'));
			jobjson = JSON.parse(jobstr);
		}
		if (jobjson === undefined && fs.existsSync(path.join(jobpath, 'assets', 'job.json'))) {
			var jobstr = fs.readFileSync(path.join(jobpath, 'assets', 'job.json'));
			jobjson = JSON.parse(jobstr);
		}
		if (jobjson === undefined && fs.existsSync(path.join(jobpath, 'job.json'))) {
			var jobstr = fs.readFileSync(path.join(jobpath, 'job.json'));
			jobjson = JSON.parse(jobstr);
		}
		if (jobjson) {
			jobs.push(jobjson);
		}
	}
	if (jobs.length === 0) {
		console.log(' - no valid translation job available');
		done(true);
		return;
	}

	// check jobs sent the connector
	var connectJobPromises = [];

	for (var i = 0; i < jobs.length; i++) {
		var jobConnectionInfo = _getJobConnectionInfo(jobs[i].jobName);
		if (jobConnectionInfo && jobConnectionInfo.connection && jobConnectionInfo.jobId) {
			jobs[i]['connectionJobStatus'] = jobConnectionInfo.status;
			jobs[i]['connectionJobId'] = jobConnectionInfo.jobId;
			if (jobConnectionInfo.status !== 'INGESTED') {
				var connectionjson = _getConnectionInfo(jobConnectionInfo.connection);
				connectJobPromises.push(_getJobFromConnector(connectionjson, jobConnectionInfo.jobId, jobs[i].jobName));
			}
		}
	}

	Promise.all(connectJobPromises).then(function (result) {
		// console.log(result);
		var format = '%-40s %-16s %-15s %-40s';
		console.log('Local translation jobs:');
		console.log(sprintf(format, 'Name', 'Status', 'Source Language', 'Target Languages'));
		for (var i = 0; i < jobs.length; i++) {
			var connectionJobStatus = jobs[i]['connectionJobStatus'];
			var connectionJobId = jobs[i]['connectionJobId'];
			if (connectionJobId && result && result.length > 0) {
				for (var j = 0; j < result.length; j++) {
					if (result[j].properties && result[j].properties.id === connectionJobId) {
						connectionJobStatus = result[j].properties.status;
						break;
					}
				}
			}
			var status = 'DOWNLOADED';
			if (connectionJobStatus) {
				status = connectionJobStatus === 'INGESTED' ? 'TRANSLATED' : (connectionJobStatus === 'TRANSLATED' ? 'READY TO INGEST' : 'INPROGRESS');
			}
			console.log(sprintf(format, jobs[i].jobName, status, jobs[i].sourceLanguage, jobs[i].targetLanguages));
		}

		done(true);
	});
};


/**
 * Submit translation job to translation connector
 */
module.exports.submitTranslationJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;

	// verify the job exists
	var jobs = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	var jobExist = false;
	for (var i = 0; i < jobs.length; i++) {
		if (name === jobs[i]) {
			jobExist = true;
			break;
		}
	}
	if (!jobExist) {
		console.error('ERROR: translation job ' + name + ' does not exist');
		done();
		return;
	}

	var connection = argv.connection;

	// verify the connection
	var connectionjson = _getConnectionInfo(connection);
	if (!connectionjson) {
		done();
		return;
	}

	var jobSrcPath = path.join(transSrcDir, name);

	// zip the job first
	gulp.src(jobSrcPath + '/**')
		.pipe(zip(name + '.zip'))
		.pipe(gulp.dest(path.join(projectDir, 'dist')))
		.on('end', function () {
			var zippath = path.join(projectDir, 'dist', name + '.zip');
			console.log(' - created translation job zip file ' + zippath);

			// 
			// create connector job
			//
			var jobPromise = _createConnectorJob(connectionjson, name);
			var jobId, projectId;
			jobPromise
				.then(function (result) {
					if (result.err) {
						done();
						return;
					}
					jobId = result.properties.id;
					projectId = result.properties.projectId;
					console.log(' - create translation job on the connector: ' + jobId);
					return _sendFileToConnector(connectionjson, jobId, zippath);

				})
				.then(function (result) {
					if (!result || result.err) {
						done();
						return;
					}
					console.log(' - send file ' + zippath + ' to the connector');

					// save the job id to download the translation later
					var jobjson = {
						connection: connection,
						jobId: jobId,
						status: ''
					};
					var connectionJobJsonPath = path.join(transSrcDir, name, 'connectionjob.json');
					fs.writeFileSync(connectionJobJsonPath, JSON.stringify(jobjson));
					done(true);
				});
		});
};

/**
 * ingest translated job from translation connector
 */
module.exports.ingestTranslationJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (argv.server) {
		_ingestServerTranslationJob(argv, done);
		return;
	}

	var name = argv.name;

	// verify the job exists
	var jobs = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	var jobExist = false;
	for (var i = 0; i < jobs.length; i++) {
		if (name === jobs[i]) {
			jobExist = true;
			break;
		}
	}
	if (!jobExist) {
		console.error('ERROR: translation job ' + name + ' does not exist');
		done();
		return;
	}

	var jobConnectionInfo = _getJobConnectionInfo(name);
	if (!jobConnectionInfo || !jobConnectionInfo.jobId) {
		console.log('ERROR: job ' + name + ' has not been submmitted to translation connector yet');
		done();
		return;
	}
	if (!jobConnectionInfo.connection) {
		console.log('ERROR: no connection found for job ' + name);
		done();
		return;
	}

	var connection = jobConnectionInfo.connection;
	console.log(' - use connection ' + connection);

	// get connection
	var connectionjson = _getConnectionInfo(connection);
	if (!connectionjson) {
		done();
		return;
	}

	var connectionJobId = jobConnectionInfo.jobId;

	console.log(' - query translation connection to get job status');
	
	var connectionJobPromise = _getJobFromConnector(connectionjson, connectionJobId, name);
	connectionJobPromise.then(function (result) {
		if (result.err || !result.properties) {
			done();
			return;
		}

		if (result.properties.status !== 'TRANSLATED') {
			console.log(' - translation is still in progress, try later');
			done();
			return;
		}

		console.log(' - get translation');
		var targetFileName = name + '-translated.zip';
		var target = path.join(projectDir, 'dist', targetFileName);
		var getTransPromise = _getTranslationFromConnector(connectionjson, connectionJobId, target);
		getTransPromise.then(function (result) {
			if (result.err) {
				done();
				return;
			}

			// import into local
			var importPromise = _importJob(target, 'ingest');
			importPromise.then(function (result) {
				if (result.err) {
					done();
					return;
				}

				// save the status
				jobConnectionInfo.status = 'INGESTED';

				var connectionJobJsonPath = path.join(transSrcDir, name, 'connectionjob.json');
				fs.writeFileSync(connectionJobJsonPath, JSON.stringify(jobConnectionInfo));
				done(true);
			});
		});
	});

};

var _ingestServerTranslationJob = function (argv, done) {
	projectDir = argv.projectDir || projectDir;

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var name = argv.name;

	// console.log(' - server: ' + server.url);

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		var connectors;
		var job;
		var idcToken;
		serverUtils.browseTranslationConnectorsOnServer(server)
			.then(function (result) {
				connectors = result && result.data || [];

				// verify the name
				var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
				return Promise.all(jobPromises);
			})
			.then(function (values) {
				var found = false;
				for (var i = 0; i < values.length; i++) {
					for (var j = 0; j < values[i].jobs.length; j++) {
						if (values[i].jobs[j].name === name) {
							found = true;
							job = values[i].jobs[j];
							break;
						}
					}
					if (found) {
						break;
					}
				}
				if (!found) {
					console.log('ERROR: job ' + name + ' does not exist on server');
					return Promise.reject();
				}

				// console.log(job);
				if (!job.connectorId) {
					console.log('ERROR: job ' + name + ' is not translated by translation connector');
					return Promise.reject();
				}

				return serverUtils.getTranslationConnectorJobOnServer(server, job.id);

			})
			.then(function (result) {
				if (!result || result.err || !result.data) {
					return Promise.reject();
				}

				var connJob = result.data;

				if (connJob.connectorJobStatus !== 'TRANSLATED') {
					console.log('ERROR: job ' + name + ' is not ready to ingest yet: ' + connJob.connectorJobStatus);
					return Promise.reject();
				}
				console.log(' - verify job');

				return serverUtils.getIdcToken(server);
			})
			.then(function (result) {
				idcToken = result.idcToken;

				return _ingestTranslationJobSCS(server, idcToken, job.id, job.connectorId);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var jobId = result.LocalData.JobID;
				idcToken = result.LocalData.idcToken;

				// wait ingest to finish
				var inter = setInterval(function () {
					var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
					jobPromise.then(function (data) {
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							// try to get error message
							var jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
							jobDataPromise.then(function (data) {
								console.log('ERROR: ingest failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
								_cmdEnd(done);
							});
						}
						if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);
							console.log(' - ingest ' + name + ' finished');
							done(true);

						} else {
							console.log(' - ingesting: percentage ' + data.JobPercentage);
						}
					});
				}, 5000);
			})
			.catch((error) => {
				done();
			});
	});
};
var _ingestTranslationJobSCS = function (server, idcToken, jobId, connectorId) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=SCS_IMPORT_SITE_TRANS';
		url = url + '&IsJson=1';
		url = url + '&jobId=' + jobId;
		url = url + '&connectorId=' + connectorId;
		url = url + '&validationMode=validateAndImport&useBackgroundThread=1';
		url = url + '&idcToken=' + idcToken;

		var params = {
			method: 'GET',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to submit ingest translation job ' + jobId);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to submit ingest translation job ' + jobId + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);

		});
	});
	return importPromise;
};

var _refreshTranslationJobSCS = function (server, idcToken, jobId, connectorId) {
	var refreshPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/integration?IdcService=REFRESH_CONNECTOR_JOB';
		url = url + '&IsJson=1';
		url = url + '&idcToken=' + idcToken;
		url = url + '&jobId=' + jobId;

		var params = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: serverUtils.getRequestAuthorization(server)
			}
		};
		// console.log(params);

		var request = require('../test/server/requestUtils.js').request;
		request.post(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to submit refresh translation job ' + job.jobName);
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to submit refresh translation job ' + jobId + ' - ' + (data && data.LocalData ? data.LocalData.StatusMessage : (response.statusMessage || response.statusCode)));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);

		});
	});
	return refreshPromise;
};
var _refreshServerTranslationJob = function (argv, done) {
	projectDir = argv.projectDir || projectDir;

	var serverName = argv.server && argv.server === '__cecconfigserver' ? '' : argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var name = argv.name;

	// console.log(' - server: ' + server.url);

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		var connectors;
		var job;
		var idcToken;
		serverUtils.browseTranslationConnectorsOnServer(server)
			.then(function (result) {
				connectors = result && result.data || [];

				// verify the name
				var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
				return Promise.all(jobPromises);
			})
			.then(function (values) {
				var found = false;
				for (var i = 0; i < values.length; i++) {
					for (var j = 0; j < values[i].jobs.length; j++) {
						if (values[i].jobs[j].name === name) {
							found = true;
							job = values[i].jobs[j];
							break;
						}
					}
					if (found) {
						break;
					}
				}
				if (!found) {
					console.log('ERROR: job ' + name + ' does not exist on server');
					return Promise.reject();
				}

				// console.log(job);
				if (!job.connectorId) {
					console.log('ERROR: job ' + name + ' is not translated by translation connector');
					return Promise.reject();
				}

				return serverUtils.getIdcToken(server);
			})
			.then(function (result) {
				idcToken = result.idcToken;

				return _refreshTranslationJobSCS(server, idcToken, job.id, job.connectorId);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				console.log(' - send refresh request to connection, check status with command list-translation-jobs');
				done(true);
			})
			.catch((error) => {
				done();
			});
	});
};

/**
 * Refresh translation job from translation connector
 */
module.exports.refreshTranslationJob = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	if (argv.server) {
		_refreshServerTranslationJob(argv, done);
		return;
	}

	var name = argv.name;

	// verify the job exists
	var jobs = fs.existsSync(transSrcDir) ? fs.readdirSync(transSrcDir) : [];
	var jobExist = false;
	for (var i = 0; i < jobs.length; i++) {
		if (name === jobs[i]) {
			jobExist = true;
			break;
		}
	}
	if (!jobExist) {
		console.error('ERROR: translation job ' + name + ' does not exist');
		done();
		return;
	}


	// verify the connection
	var jobConnectionInfo = _getJobConnectionInfo(name);
	if (!jobConnectionInfo || !jobConnectionInfo.jobId) {
		console.log('ERROR: job ' + name + ' has not been submmitted to translation connector yet');
		done();
		return;
	}
	if (!jobConnectionInfo.connection) {
		console.log('ERROR: no connection found for job ' + name);
		done();
		return;
	}

	var connection = jobConnectionInfo.connection;
	console.log(' - use connection ' + connection);

	// get connection
	var connectionjson = _getConnectionInfo(connection);
	if (!connectionjson) {
		done();
		return;
	}

	_refreshConnectorJob(connectionjson, jobConnectionInfo.connection, jobConnectionInfo.jobId)
		.then(function (result) {
			if (!result || result.err) {
				done();
				return;
			}

			jobConnectionInfo.status = '';

			var connectionJobJsonPath = path.join(transSrcDir, name, 'connectionjob.json');
			fs.writeFileSync(connectionJobJsonPath, JSON.stringify(jobConnectionInfo));

			console.log(' - send refresh request to connection, check status with command list-translation-jobs');

			done(true);
		});

};

/**
 * Register translation connector and save to cec.properties
 */
module.exports.registerTranslationConnector = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;

	var connectorName = argv.connector;
	// verify the connector
	var connectors = serverUtils.getTranslationConnectors(projectDir);
	var validConnector = false;
	for (var i = 0; i < connectors.length; i++) {
		if (connectorName === connectors[i].name) {
			validConnector = true;
			break;
		}
	}
	if (!validConnector) {
		console.log('ERROR: connector ' + connectorName + ' does not exist');
		done();
		return;
	}

	var connectorServer = argv.server;
	// remove traling /
	if (connectorServer.length > 1 && connectorServer.substring(connectorServer.length - 1) === '/') {
		connectorServer = connectorServer.substring(0, connectorServer.length - 1);
	}
	var user = argv.user;
	var password = argv.password;
	var serverInfoPromise = _getconnectorServerInfo(connectorServer, user, password);
	var fields = argv.fields ? argv.fields.split(',') : [];
	serverInfoPromise.then(function (result) {
		if (result.err) {
			done();
			return;
		}
		var serverfields = result.fields;
		var requirefFiels = [];
		for (var i = 0; i < serverfields.length; i++) {
			if (serverfields[i].ID !== 'ProxyHost' && serverfields[i].ID !== 'ProxyPort' && serverfields[i].ID !== 'ProxyScheme') {
				requirefFiels.push(serverfields[i].ID);
			}
		}
		// console.log(' - required fields: ' + requirefFiels + ' fields: ' + fields);
		var missingFields = [];
		var fieldValues = [];
		for (var i = 0; i < requirefFiels.length; i++) {
			var fieldValue = undefined;
			for (var j = 0; j < fields.length; j++) {
				var vals = fields[j].split(':');
				if (vals.length === 2 && vals[0] === requirefFiels[i]) {
					fieldValue = vals[1];
					break;
				}
			}
			if (fieldValue == undefined) {
				missingFields.push(requirefFiels[i]);
			} else {
				fieldValues.push({
					name: requirefFiels[i],
					value: fieldValue
				});
			}
		}
		if (missingFields.length > 0) {
			console.log('ERROR: missing required fields ' + missingFields);
			done();
			return;
		}

		// create the connection file
		if (!fs.existsSync(connectionsSrcDir)) {
			fs.mkdirSync(connectionsSrcDir);
		}
		var connectionpath = path.join(connectionsSrcDir, name);
		if (!fs.existsSync(connectionpath)) {
			fs.mkdirSync(connectionpath);
		}
		var connectionfile = path.join(connectionpath, 'connection.json');
		var connectionConfig = {
			connector: connectorName,
			url: connectorServer,
			user: user,
			password: password,
			fields: fieldValues
		};

		fs.writeFileSync(connectionfile, JSON.stringify(connectionConfig));
		console.log(' - translation connection registered in ' + connectionfile);
		done(true);
	});
};

module.exports.createTranslationConnector = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;
	var sourceFileName = argv.source;

	var connectors = fs.existsSync(connectorsSrcDir) ? fs.readdirSync(connectorsSrcDir) : [];
	var connectorExist = false;
	for (var i = 0; i < connectors.length; i++) {
		if (name === connectors[i]) {
			connectorExist = true;
			break;
		}
	}
	if (connectorExist) {
		console.error('ERROR: connector ' + name + ' already exists. Please specify a different name.');
		done();
		return;
	}

	var connectorZip = path.join(connectorsDataDir, sourceFileName + '.zip');
	var connectorSrcPath = path.join(connectorsSrcDir, name);

	fileUtils.extractZip(connectorZip, connectorSrcPath)
		.then(function (err) {
			if (err) {
				console.log('ERROR: failed to unzip ' + connectorZip);
				done();
			}

			console.log(` - translation connector ${name} created at ${connectorSrcPath}`);

			console.log(' - install connector');
			var installCmd = childProcess.spawnSync(npmCmd, ['install', '--prefix', connectorSrcPath, connectorSrcPath], {
				projectDir,
				stdio: 'inherit'
			});

			console.log('Start the connector: cec start-translation-connector ' + name + ' [-p <port>]');

			if (sourceFileName === 'lingotekTranslationConnector') {
				console.log('\x1b[33m');
				console.log('When registering the Lingotek connector make sure you have a valid token and workflow id.');
				console.log('e.g.  cec register-translation-connector ... -f "X-CEC-BearerToken:69ea110c-####-####-####-############,X-CEC-WorkflowId:c675bd20-####-####-####-############"');
				console.log('\x1b[0m');
			}

			done(true);
		});
};

module.exports.startTranslationConnector = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var name = argv.name;

	var connectors = fs.existsSync(connectorsSrcDir) ? fs.readdirSync(connectorsSrcDir) : [];
	var connectorExist = false;
	for (var i = 0; i < connectors.length; i++) {
		if (name === connectors[i]) {
			connectorExist = true;
			break;
		}
	}
	if (!connectorExist) {
		console.error('ERROR: connector ' + name + ' does not exist.');
		done();
		return;
	}

	var port = argv.port || '8084';
	process.env['CECLSP_PORT'] = port;

	var connectPath = path.join(connectorsSrcDir, name);
	var args = argv.debug ? ['start', '--node-options', '--inspect', '--prefix', connectPath] : ['start', '--prefix', connectPath];

	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
};