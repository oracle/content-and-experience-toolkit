/**
 * Copyright (c) 2021 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */


/**
 * translation job library
 */

var path = require('path'),
	gulp = require('gulp'),
	fs = require('fs'),
	os = require('os'),
	readline = require('readline'),
	childProcess = require('child_process'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip'),
	contentUtils = require('./content.js').utils,
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverUtils = require('../test/server/serverUtils.js'),
	formatter = require('./formatter.js');

var console = require('../test/server/logger.js').console;

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

if (process.shim) {
	verifyRun = (argv) => true;
}

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
	return serverRest.getTranslationJobs({
		server: server,
		jobType: jobType
	});
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

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to query translation job ' + jobId);
				console.error(error);
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
				console.error('ERROR: failed to query translation job ' + jobId + '  : ' + msg);
				console.error(JSON.stringify(data, null, 4));
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

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.put(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to change translation job status ' + error);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (err) {
					// handle invalid json
				}
				resolve({
					data
				});
			} else {
				console.error('ERROR: failed to change translation job status ' + (response.statusMessage || response.statusCode));
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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to submit import translation job (validate) ' + jobName);
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to submit import translation job (validate) ' + jobName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to submit import translation job ' + jobName);
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to submit import translation job ' + jobName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to get import translation job status');
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to get import translation job status' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to get import translation job response data');
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

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
		for (let i = 0; i < siteV.itemsToBeImported.length; i++) {
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
			console.info(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version);

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
									console.error('ERROR: validation failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
									_cmdEnd(done);
								});
							}
							if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
								clearInterval(inter);
								console.log(' - validate ' + jobName + ' finished');
								let jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
								jobDataPromise.then(function (data) {
									_displayValidationResult(data, jobType, tempDir);
									_cmdEnd(done, true);
								});
							} else {
								console.info(' - validating: percentage ' + data.JobPercentage);
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
									console.error('ERROR: import failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
									_cmdEnd(done);
								});
							}
							if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
								clearInterval(inter);
								console.log(' - import ' + jobName + ' finished');
								_cmdEnd(done, true);

							} else {
								console.info(' - importing: percentage ' + data.JobPercentage);
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

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.post(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to create translation job' + ' (ecid: ' + response.ecid + ')');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0' || !data.LocalData.JobID) {
				console.error('ERROR: failed to create translation job ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : '') + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			console.info(' - create translation job submitted (' + data.LocalData.JobID + ')');
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
		var startTime = new Date();
		var needNewLine = false;
		var inter = setInterval(function () {
			var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
			jobPromise.then(function (data) {
				if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
					clearInterval(inter);
					if (needNewLine) {
						process.stdout.write(os.EOL);
					}
					console.error('ERROR: create translation job failed: ' + (data && data.JobMessage));
					console.error(data);
					_cmdEnd(done);
				}
				if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
					clearInterval(inter);
					if (console.showInfo()) {
						process.stdout.write(' - creating: percentage ' + data.JobPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						readline.cursorTo(process.stdout, 0);
						process.stdout.write(os.EOL);
					}
					console.log(' - translation job ' + name + ' created');
					_cmdEnd(done, true);

				} else {
					if (console.showInfo()) {
						process.stdout.write(' - creating: percentage ' + data.JobPercentage + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');
						readline.cursorTo(process.stdout, 0);
						needNewLine = true;
					}
				}
			});
		}, 5000);
	})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			_cmdEnd(done);
		});
};

var _createTranslationJob = function (server, site, name, langs, exportType, connector, done) {
	// console.log('site: ' + site + ' job name: ' + name + ' languages: ' + langs + ' export type: ' + exportType);
	var allLangs = [];
	var siteInfo;
	var idcToken;
	serverUtils.getIdcToken(server)
		.then(function (result) {
			idcToken = result && result.idcToken;
			if (!idcToken) {
				console.error('ERROR: failed to get idcToken');
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
				console.error('ERROR: site ' + site + ' is not an enterprise site');
				return Promise.reject();
			}
			var defaultLanguage = siteInfo.defaultLanguage;

			if (!defaultLanguage) {
				console.error('ERROR: site ' + site + ' has no default language, make it translatable first.');
				return Promise.reject();
			}
			console.info(' - site: ' + site + ', default language: ' + defaultLanguage);


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
			console.info(' - site localization policy: ' + policy.name);
			allLangs = policy.requiredValues;
			allLangs = allLangs.concat(policy.optionalValues);
			// console.log(' - policy languages: ' + allLangs);

			var targetLanguages = [];
			if (langs && langs.toLowerCase() !== 'all') {
				//
				// validate languages
				//
				var langArr = langs.split(',');
				for (var i = 0; i < langArr.length; i++) {
					if (langArr[i] === siteInfo.defaultLanguage) {
						console.error('ERROR: language ' + langArr[i] + ' is the default language');
						return Promise.reject();
					}
					if (!allLangs.includes(langArr[i])) {
						console.error('ERROR: language ' + langArr[i] + ' is not in the localization policy');
						return Promise.reject();
					}
				}
				targetLanguages = langArr;
			} else {
				for (let i = 0; i < allLangs.length; i++) {
					if (allLangs[i] !== siteInfo.defaultLanguage) {
						targetLanguages.push(allLangs[i]);
					}
				}
			}
			if (targetLanguages.length === 0) {
				console.error('ERROR: no target language');
				return Promise.reject();
			}
			console.info(' - target languages: ' + targetLanguages);
			_execCreateTranslationJob(server, idcToken, name, siteInfo, targetLanguages, exportType,
				(connector && connector.connectorId), done);

		})
		.catch((error) => {
			if (error) {
				console.error(error);
			}
			done();
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

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to create job on the connector: ' + error + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.error('ERROR: failed to create job on the connector: ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				// handle invalid json
			}

			if (!data || !data.properties) {
				console.error('ERROR: failed to create job on the connector: no data returned' + ' (ecid: ' + response.ecid + ')');
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

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to send zip to the job: ' + error + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.error('ERROR: failed to send zip to the job: ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				// handle invalid json
			}

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

		serverUtils.showRequestOptions(postData);

		var request = require('../test/server/requestUtils.js').request;
		request.post(postData, function (error, response, body) {
			if (error) {
				console.error('ERROR: failed to refresh job on the connector: ' + error + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			if (response.statusCode != 200) {
				console.error('ERROR: failed to refresh job on the connector: ' + response.statusMessage + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				// handle invalid json
			}

			if (!data || !data.properties) {
				console.error('ERROR: failed to refresh job on the connector: no data returned' + ' (ecid: ' + response.ecid + ')');
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

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to get job ' + jobName + ' from connector: ' + err);
				return resolve({
					err: 'err'
				});
			}

			var data = {};
			try {
				data = JSON.parse(body);
			} catch (err) {
				// handle invalid json
			}

			if (!response || response.statusCode !== 200) {
				console.error('ERROR: Failed to get job ' + jobName + ' from connector: ' + (data && data.message));
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

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: Failed to get translation from connector:');
				console.error(err);
				return resolve({
					err: 'err'
				});
			}

			if (!response || response.statusCode !== 200) {
				console.error('ERROR: Failed to get translation from connector: ' + response.errorMessage);
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
		if (name.indexOf(path.sep) >= 0) {
			name = name.substring(name.lastIndexOf(path.sep) + 1);
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
				var jobstr;
				if (fs.existsSync(path.join(tempDir, 'site', 'job.json'))) {
					jobstr = fs.readFileSync(path.join(tempDir, 'site', 'job.json'));
					sitejob = JSON.parse(jobstr);
				}
				if (fs.existsSync(path.join(tempDir, 'assets', 'job.json'))) {
					jobstr = fs.readFileSync(path.join(tempDir, 'assets', 'job.json'));
					assetsjob = JSON.parse(jobstr);
				}
				if (assetsjob === undefined && fs.existsSync(path.join(tempDir, 'job.json'))) {
					jobstr = fs.readFileSync(path.join(tempDir, 'job.json'));
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
			console.error('ERROR: file ' + jobPath + ' does not exist');
			return resolve({
				err: 'err'
			});
		}

		var validatePromise = _validateTranslationJobZip(jobPath);
		validatePromise.then(function (result) {
			if (!result.site && !result.assets) {
				console.error('ERROR: file ' + jobPath + ' is not a valid translation job file');
				return resolve({
					err: 'err'
				});
			}

			console.info(' - validate translation file');
			var job = result.site || result.assets;
			var jobName = job.jobName || job.filename;

			var jobSrcPath = path.join(transSrcDir, jobName);

			fileUtils.extractZip(jobPath, jobSrcPath)
				.then(function (err) {
					if (err) {
						if (actionType && actionType === 'ingest') {
							console.error('ERROR: failed to ingest translation job ' + jobPath);
						} else {
							console.error('ERROR: failed to import translation job ' + jobPath);
						}
						console.error(err);
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
		console.error('ERROR: invalid job type ' + type);
		done();
		return;
	}

	var status = argv.status;
	if (status && status === 'INPROGRESS') {
		status += ',IMPORTING';
	}

	var orderBy = 'name:asc';
	if (argv.orderby) {
		if (argv.orderby === 'updatedDate') {
			orderBy = 'lastUpdatedDate:desc';
		} else {
			orderBy = argv.orderby + ':asc';
		}
	}

	var repoName = argv.repository;

	var q = argv.namefilter ? ('name co "' + argv.namefilter + '"') : '';

	var _getConnectName = function (connectors, id) {
		var name = '';
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
			console.error(result.statusMessage);
			done();
			return;
		}

		var repositoryId;
		var jobs = [];

		var repoPromises = [];
		if (repoName) {
			repoPromises.push(serverRest.getRepositoryWithName({server: server, name: repoName}));
		}

		Promise.all(repoPromises)
			.then(function (results) {
				if (repoName) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.error('ERROR: repository ' + repoName + ' does not exist');
						return Promise.reject();
					}

					repositoryId = results[0].data.id;
					console.info(' - verify repository (name: ' + repoName + ' Id: ' + repositoryId + ')');
				}

				var jobPromises = [];
				if (type) {
					jobPromises.push(serverRest.getTranslationJobs({server: server, jobType: type, jobStatus: status, repositoryId: repositoryId, q: q, orderBy: orderBy}));
				} else {
					jobPromises.push(serverRest.getTranslationJobs({server: server, jobType: 'assets', jobStatus: status, repositoryId: repositoryId, q: q, orderBy: orderBy}));
					jobPromises.push(serverRest.getTranslationJobs({server: server, jobType: 'sites', jobStatus: status, repositoryId: repositoryId, q: q, orderBy: orderBy}));
				}

				return Promise.all(jobPromises);
			})
			.then(function (values) {

				let jobIds = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i] && values[i].jobs) {
						for (var j = 0; j < values[i].jobs.length; j++) {
							jobIds.push(values[i].jobs[j].id);
						}
					}
				}

				console.info(' - total jobs: ' + jobIds.length);

				return _getJobsDetails(server, jobIds);

			})
			.then(function (values) {

				var connectorJobs = [];
				for (var i = 0; i < values.length; i++) {
					if (values[i].job) {
						jobs.push(values[i].job);

						if (values[i].connectorJob) {
							connectorJobs.push(values[i].connectorJob);
						}
					}
				}
				// console.log(jobs);
				// console.log(connectorJobs);

				//
				// display
				//
				var titleFormat = '%-40s %-14s %-15s %-36s %-36s %-s';
				var rowFormat;

				if (!type || type === 'assets') {
					console.log('Asset translation jobs:');
					console.log(sprintf(titleFormat, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages', 'Connector Status'));
					let assetJobs = 0;
					for (let i = 0; i < jobs.length; i++) {
						if (jobs[i].type === 'assets') {
							var data = _getJobData(jobs[i]);
							var sourceLanguage = data && data.properties && data.properties.sourceLanguage || '';
							var targetlanguages = data && data.properties && data.properties.targetLanguages || '';
							var connStr = '';
							if (jobs[i].connectorId) {
								var connData = _getConnectorJobStatus(connectorJobs, jobs[i].name);
								let connectorName = jobs[i].connectorName || '';
								connStr = connectorName + ' ' + (connData && connData.status ? connData.status : '');

							}
							rowFormat = `%-${40, formatter.translationJobColSize(40, jobs[i].name)}s %-14s %-15s %-36s %-36s %-s`;
							console.log(sprintf(rowFormat, formatter.translationJobFormat(jobs[i].name), jobs[i].status, sourceLanguage, targetlanguages, jobs[i].assetPendingLanguages, connStr));
							assetJobs += 1;
						}
					}
					console.log(' - total asset jobs: ' + assetJobs);
					console.log('');
				}

				if (!type || type === 'sites') {
					console.log('Site translation jobs:');
					console.log(sprintf(titleFormat, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages', 'Connector Status'));
					let siteJobs = 0;
					for (let i = 0; i < jobs.length; i++) {
						if (jobs[i].type === 'sites') {
							let data = _getJobData(jobs[i]);
							let sourceLanguage = data && data.sourceLanguage || '';
							let targetlanguages = data && data.targetLanguages || '';
							let connStr = '';
							if (jobs[i].connectorId) {
								let connData = _getConnectorJobStatus(connectorJobs, jobs[i].name);
								let connectorName = jobs[i].connectorName || '';
								connStr = connectorName + ' ' + (connData && connData.status ? connData.status : '');
							}
							rowFormat = `%-${40, formatter.translationJobColSize(40, jobs[i].name)}s %-14s %-15s %-36s %-36s %-s`;
							console.log(sprintf(rowFormat, formatter.translationJobFormat(jobs[i].name), jobs[i].status, sourceLanguage, targetlanguages, jobs[i].sitePendingLanguages, connStr));
							siteJobs += 1;
						}
					}
					console.log(' - total site jobs: ' + siteJobs);
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

var _getconnectorServerInfo = function (connectorServer, user, password) {
	var serverInfoPromise = new Promise(function (resolve, reject) {
		var url = connectorServer + '/v1/server';
		var options = {
			method: 'GET',
			url: url
		};

		serverUtils.showRequestOptions(options);

		var request = require('../test/server/requestUtils.js').request;
		request.get(options, function (err, response, body) {
			if (err) {
				console.error('ERROR: failed to query translation connector: ' + err);
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
				console.error('ERROR: failed to query translation connector: ' + response.statusCode);
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

var _getJob = function (jobName) {
	var jobDir = path.join(transSrcDir, jobName);
	var job = {};
	var jobstr;
	if (fs.existsSync(path.join(jobDir, 'site', 'job.json'))) {
		jobstr = fs.readFileSync(path.join(jobDir, 'site', 'job.json'));
		job = JSON.parse(jobstr);
	} else if (fs.existsSync(path.join(jobDir, 'job.json'))) {
		jobstr = fs.readFileSync(path.join(jobDir, 'job.json'));
		job = JSON.parse(jobstr);
	} else if (fs.existsSync(path.join(jobDir, 'assets', 'job.json'))) {
		jobstr = fs.readFileSync(path.join(jobDir, 'assets', 'job.json'));
		job = JSON.parse(jobstr);
	}
	return job;
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
		console.error('ERROR: connection ' + connection + ' does not exist');
		return;
	}
	var connectionstr = fs.readFileSync(connectionfile).toString();
	var connectionjson = connectionstr ? JSON.parse(connectionstr) : undefined;
	return connectionjson;
};

var _getJobAllInfo = function (server, jobId) {
	return new Promise(function (resolve, reject) {
		_getTranslationJob(server, jobId).then(function (result) {
			let job = result && result.job;
			if (job && job.id && job.connectorId) {
				serverUtils.getTranslationConnectorJobOnServer(server, job.id)
					.then(function (result) {
						return resolve({
							job: job,
							connectorJob: result && result.data
						});
					});
			} else {
				return resolve({job: job});
			}
		});
	});
};
var _getJobsDetails = function (server, jobIds) {
	return new Promise(function (resolve, reject) {
		var total = jobIds.length;
		var groups = [];
		var limit = 26;
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

		var totalJobs = [];
		var startTime = new Date();
		var doGetJobs = groups.reduce(function (jobPromise, param) {
			return jobPromise.then(function (result) {
				var jobPromises = [];
				for (var i = param.start; i <= param.end; i++) {
					jobPromises.push(_getJobAllInfo(server, jobIds[i]));
				}

				return Promise.all(jobPromises).then(function (results) {
					results.forEach(function (result) {
						if (result.job) {
							totalJobs.push(result);
						}
					});
					if (console.showInfo()) {
						process.stdout.write(' - querying job ' + totalJobs.length + ' [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
						readline.cursorTo(process.stdout, 0);
					}
				});

			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doGetJobs.then(function (result) {
			if (totalJobs.length > 0 && console.showInfo()) {
				process.stdout.write(os.EOL);
			}
			resolve(totalJobs);
		});

	});
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
			console.error(result.statusMessage);
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
				console.error('ERROR: job ' + jobName + ' does not exist');
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
								console.info(' - update the translation job status to INPROGRESS');
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
		console.error('ERROR: invalid folder');
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
			console.info(' - created translation job zip file ' + zippath);

			var loginPromise = serverUtils.loginToServer(server);
			loginPromise.then(function (result) {
				if (!result.status) {
					console.error(result.statusMessage);
					done();
					return;
				}

				var tempDir = path.join(transBuildDir, name);
				var jobType = _getJobType(name);
				// console.log(' - job: ' + name + ' type: ' + jobType + ' zip: ' + zippath);
				if (jobType === 'assets') {
					_uploadAssetTranslationJob(server, validateonly, folder, zippath, name, tempDir)
						.then(function (result) {
							if (result.err) {
								done();
							} else {
								done(true);
							}
						});
				} else {
					_execdeployTranslationJob(server, validateonly, folder, zippath, name, jobType, tempDir, done);
				}

			}); // login to server
		});
};

var _uploadAssetTranslationJob = function (server, validateOnly, folder, filePath, name, tempDir) {
	return new Promise(function (resolve, reject) {
		var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

		var folderPromises = [];
		if (folder) {
			folderPromises.push(serverRest.findFolderHierarchy({
				server: server,
				parentID: 'self',
				folderPath: folder
			}));
		}
		Promise.all(folderPromises)
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
				console.info(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + result.version);

				var file = result;

				var jobjson = _getJob(name);
				var job = {
					name: name,
					repositoryId: jobjson.repositoryId
				};

				return serverRest.importAssetTranslation({
					server: server,
					job: job,
					fFileGUID: file.id,
					validateOnly: validateOnly
				});

			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (validateOnly) {
					var validateResult = result && result.result && result.result.body && result.result.body.validation;
					if (validateResult) {
						var format = '  %-30s  %-s';
						console.log(sprintf(format, 'Job:', name));
						console.log(sprintf(format, 'valid:', validateResult.valid));
						console.log(sprintf(format, 'languagesReturnedComplete: ', (validateResult.languagesReturnedComplete || '')));
						console.log(sprintf(format, 'languagesNotReturned: ', (validateResult.languagesNotReturned || '')));
						console.log(sprintf(format, 'languagesReturnedIncomplete: ', (validateResult.languagesReturnedIncomplete || '')));
						console.log(sprintf(format, 'itemsToBeImported: ', ''));
						var format2 = '      %-36s  %-s';
						console.log(sprintf(format2, 'Id', 'Name'));
						for (var i = 0; i < validateResult.itemsToBeImported.length; i++) {
							var item = validateResult.itemsToBeImported[i];
							console.log(sprintf(format2, item.id, item.name));
						}

					} else {
						console.log(' - no validation result returned');
					}
				} else {
					console.log(' - translation job ' + name + ' imported');
				}

				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({
					err: 'err'
				});
			});
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

	if (name.match(/[`/\\*"<>|?':]/)) {
		console.error('ERROR: The job name should not contain the following characters: /\\*"<>|?\':"');
		done();
		return;
	}

	var site = argv.site;
	var repositoryName = argv.repository;

	var langs = argv.languages;

	var exportType = argv.type || 'siteAll';
	var connectorName = argv.connector;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var idcToken;
		var connector;

		serverUtils.getIdcToken(server)
			.then(function (result) {
				idcToken = result && result.idcToken;
				if (!idcToken) {
					console.error('ERROR: failed to get idcToken');
					return Promise.reject();
				}

				var connectorPromises = [];
				if (connectorName) {
					connectorPromises.push(serverUtils.browseTranslationConnectorsOnServer(server));
				}
				return Promise.all(connectorPromises);
			})
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
						console.error('ERROR: translation connector ' + connectorName + ' does not exist');
						return Promise.reject();
					} else if (!connector.isEnabled || connector.isEnabled.toLowerCase() !== 'true') {
						console.error('ERROR: translation connector ' + connectorName + ' is disabled');
						return Promise.reject();
					}
				}

				// verify the job name
				var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
				return Promise.all(jobPromises);
			})
			.then(function (values) {
				var found = false;
				for (var i = 0; i < values.length; i++) {
					if (values[i].jobs) {
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
				}
				if (found) {
					console.error('ERROR: job ' + name + ' already exists');
					return Promise.reject();
				}

				if (site) {
					_createTranslationJob(server, site, name, langs, exportType, connector, done);
				} else {
					let skipDependencies = typeof argv.skipdependencies === 'string' && argv.skipdependencies.toLowerCase() === 'true';
					_createAssetTranslationJob(server, repositoryName, name, langs, connector, argv.collection, argv.query, argv.assets, argv.sourcelanguage, skipDependencies, argv.jobsize)
						.then(function (result) {
							if (!result || result.err) {
								done();
							}

							done(true);
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

var _createAssetTranslationJob = function (server, repositoryName, name, langs, connector, collectionName, query, assetGUIDStr, sourcelanguage, skipDependencies, jobSize) {
	return new Promise(function (resolve, reject) {
		var repository;
		var collection;
		var allLangs = [];
		var targetLanguages = [];
		var assetGUIDs = assetGUIDStr ? assetGUIDStr.split(',') : [];
		var jobs;

		serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName,
			fields: 'defaultLanguage,languageOptions,configuredLanguages'
		})
			.then(function (result) {
				if (!result || result.err || !result.data) {
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				repository = result.data;
				// console.log(repository);
				console.info(' - repository (Id: ' + repository.id + ' defaultLanguage: ' + repository.defaultLanguage + ' configuredLanguages: ' + repository.configuredLanguages + ')');

				if (repository.configuredLanguages.length <= 1) {
					console.error('ERROR: repository ' + repositoryName + ' has no other assigned languages');
					return Promise.reject();
				}

				allLangs = repository.configuredLanguages;

				if (sourcelanguage) {
					if (!allLangs.includes(sourcelanguage)) {
						console.error('ERROR: source language ' + sourcelanguage + ' is not configured for the repository');
						return Promise.reject();
					}
				}
				if (langs && langs.toLowerCase() !== 'all') {
					//
					// validate languages
					//
					var langArr = langs.split(',');
					for (var i = 0; i < langArr.length; i++) {
						if (langArr[i] === repository.defaultLanguage) {
							console.warn('WARNING: language ' + langArr[i] + ' is the default language');
						} else if (!allLangs.includes(langArr[i])) {
							console.warn('WARNING: language ' + langArr[i] + ' is not configured for the repository');
						} else {
							targetLanguages.push(langArr[i]);
						}
					}
				} else {
					for (let i = 0; i < allLangs.length; i++) {
						if (allLangs[i] !== repository.defaultLanguage) {
							targetLanguages.push(allLangs[i]);
						}
					}
				}
				if (targetLanguages.length === 0) {
					console.error('ERROR: no target language');
					return Promise.reject();
				}
				console.info(' - source languages: ' + (sourcelanguage || repository.defaultLanguage));
				console.info(' - target languages: ' + targetLanguages);

				var queryCollectionPromises = [];
				if (collectionName) {
					queryCollectionPromises.push(serverRest.getCollections({
						server: server,
						repositoryId: repository.id
					}));
				}

				return Promise.all(queryCollectionPromises);

			})
			.then(function (results) {

				if (collectionName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}

					var collections = results[0];
					for (var i = 0; i < collections.length; i++) {
						if (collections[i].name.toLowerCase() === collectionName.toLowerCase()) {
							collection = collections[i];
							break;
						}
					}

					if (!collection) {
						console.error('ERROR: collection ' + collectionName + ' not found in repository ' + repository.name);
						return Promise.reject();
					}

					console.info(' - validate collection (Id: ' + collection.id + ')');
				}

				var queryItemPromises = [];
				if (!collectionName) {
					var q = q = 'repositoryId eq "' + repository.id + '" AND translatable eq "true"';
					if (sourcelanguage) {
						q = q + ' AND language eq "' + sourcelanguage + '"';
					} else {
						q = q + ' AND languageIsMaster eq "true"';
					}
					if (query) {
						q = '(' + q + ') AND (' + query + ')';
					}
					console.info(' - query: ' + q);

					if (assetGUIDs.length > 0) {
						queryItemPromises.push(contentUtils.queryItemsWithIds(server, q, assetGUIDs));
					} else {
						queryItemPromises.push(serverRest.queryItems({server: server, q: q}));
					}
				}

				return Promise.all(queryItemPromises);

			})
			.then(function (results) {
				var guids = [];
				if (!collectionName) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
					var items = assetGUIDs.length > 0 ? (results[0] || []) : (results[0].data || []);

					if (assetGUIDs.length > 0) {
						for (var j = 0; j < assetGUIDs.length; j++) {
							var found = false;
							for (var i = 0; i < items.length; i++) {
								if (items[i].id === assetGUIDs[j]) {
									found = true;
									break;
								}
							}
							if (!found) {
								console.error('ERROR: item with GUID ' + assetGUIDs[j] + ' not found or not translatable');
							}
						}
					}

					console.info(' - total items to translate ' + items.length);

					if (items.length === 0) {
						console.error('ERROR: no asset to translate');
						return Promise.reject();
					}

					items.forEach(function (item) {
						guids.push(item.id);
					});

				}

				jobs = 1;
				if (jobSize) {
					jobs = Math.ceil(guids.length / jobSize);
					console.info(' - total jobs: ' + jobs);
				}

				return jobs === 1 ? serverRest.createAssetTranslation({
					server: server,
					name: name,
					repositoryId: repository.id,
					collectionId: collection ? collection.id : '',
					contentIds: guids,
					sourceLanguage: sourcelanguage || repository.defaultLanguage,
					targetLanguages: targetLanguages,
					connectorId: connector ? connector.connectorId : '',
					skipDependencies: skipDependencies
				}) : _createAssetJobs(server, name, repository.id, guids, sourcelanguage || repository.defaultLanguage, targetLanguages, connector ? connector.connectorId : '', skipDependencies, jobSize)
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				if (jobs === 1) {
					console.log(' - translation job ' + name + ' created');
				}
				return resolve({});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				return resolve({
					err: 'err'
				});
			});
	});
};

var _createAssetJobs = function (server, name, repositoryId, contentIds, sourceLanguage, targetLanguages, connectorId, skipDependencies, jobSize) {
	return new Promise(function (resolve, reject) {
		var total = contentIds.length;
		var groups = [];
		var limit = jobSize;
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

		var idx = 1;
		var err;
		var doCreateJobs = groups.reduce(function (jobPromise, param) {
			return jobPromise.then(function (result) {
				var guids = [];
				for (var i = param.start; i <= param.end; i++) {
					guids.push(contentIds[i]);
				}

				let jobName = name + '_' + serverUtils.lpad((idx).toString(), '0', 2);
				return serverRest.createAssetTranslation({
					server: server,
					name: jobName,
					repositoryId: repositoryId,
					contentIds: guids,
					sourceLanguage: sourceLanguage,
					targetLanguages: targetLanguages,
					connectorId: connectorId,
					skipDependencies: skipDependencies
				}).then(function (result) {
					if (!result || result.err) {
						err = 'err';
					} else {
						console.log(' - translation job ' + jobName + ' created');
					}
					// next job
					idx += 1;
				});
			});
		},
		// Start with a previousPromise value that is a resolved promise
		Promise.resolve({}));

		doCreateJobs.then(function (result) {
			if (err) {
				return resolve({
					err: 'err'
				});
			} else {
				return resolve({});
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


	if (argv.server || process.shim) {
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
		var jobjson = undefined;
		var jobstr;
		if (fs.existsSync(path.join(jobpath, 'site', 'job.json'))) {
			jobstr = fs.readFileSync(path.join(jobpath, 'site', 'job.json'));
			jobjson = JSON.parse(jobstr);
		}
		if (jobjson === undefined && fs.existsSync(path.join(jobpath, 'assets', 'job.json'))) {
			jobstr = fs.readFileSync(path.join(jobpath, 'assets', 'job.json'));
			jobjson = JSON.parse(jobstr);
		}
		if (jobjson === undefined && fs.existsSync(path.join(jobpath, 'job.json'))) {
			jobstr = fs.readFileSync(path.join(jobpath, 'job.json'));
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

	for (let i = 0; i < jobs.length; i++) {
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
		var titleFormat = '%-40s %-10s %-16s %-15s %-40s';
		console.log('Local translation jobs:');
		console.log(sprintf(titleFormat, 'Name', 'Type', 'Status', 'Source Language', 'Target Languages'));
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
			var typeLabel = jobs[i].siteGUID ? 'Site' : 'Asset';
			var rowFormat = `%-${formatter.translationJobColSize(40, jobs[i].jobName)}s %-10s %-16s %-15s %-40s`;
			console.log(sprintf(rowFormat, formatter.translationJobFormat(jobs[i].jobName), typeLabel, status, jobs[i].sourceLanguage, jobs[i].targetLanguages));
		}

		done(true);
	});
};

module.exports.describeTranslationJob = function (argv, done) {
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var q = 'name co "' + name + '"';
		var jobPromises = [];

		jobPromises.push(serverRest.getTranslationJobs({
			server: server,
			jobType: 'sites',
			q: q
		}));
		jobPromises.push(serverRest.getTranslationJobs({
			server: server,
			jobType: 'assets',
			q: q
		}));

		var _sortByName = function (data) {
			if (data.length > 0) {
				var byName = data.slice(0);
				byName.sort(function (a, b) {
					var x = a.name;
					var y = b.name;
					return (x < y ? -1 : x > y ? 1 : 0);
				});
				data = byName;
			}
			return data;
		};
		var _displayAssets = function (assets) {
			let assetFormat = '  %-38s  %-60s  %-12s  %-12s  %-12s  %-s';
			console.log(sprintf(assetFormat, 'Id', 'Name', 'Translatable', 'Native File', 'Native File', 'Detail'));
			console.log(sprintf(assetFormat, '', '', '', '', 'Translatable', ''));
			assets.forEach(function (asset) {
				let name = asset.name.length <= 60 ? asset.name : (asset.name.substring(0, 57) + '...');
				let translatable = asset.metadata && asset.metadata.translate ? '     √' : '';
				let nativeFile = asset.hasOwnProperty('file') ? '    √' : '';
				let nativeFileTranslatable = asset.file && asset.file.translate ? '    √' : '';
				let detail = asset.metadata && asset.metadata.detail || '';
				if (asset.file && asset.file.detail) {
					if (detail) {
						detail += ' ';
					}
					detail += asset.metadata.detail;
				}
				console.log(sprintf(assetFormat, asset.id, name, translatable, nativeFile, nativeFileTranslatable, detail));
			});
		};

		var job;
		Promise.all(jobPromises)
			.then(function (results) {
				let jobs = [];
				if (results && results[0] && results[0].jobs) {
					jobs = jobs.concat(results[0].jobs);
				}
				if (results && results[1] && results[1].jobs) {
					jobs = jobs.concat(results[1].jobs);
				}

				for (var i = 0; i < jobs.length; i++) {
					if (name.toLowerCase() === jobs[i].name.toLowerCase()) {
						job = jobs[i];
						break;
					}
				}
				if (!job || !job.id) {
					console.error('ERROR: translation job ' + name + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify translation job (name: ' + name + ' Id: ' + job.id + ' connectorId: ' + (job.connectorId || '') + ')');

				jobPromises = [];
				jobPromises.push(_getTranslationJob(server, job.id));
				if (job.connectorId) {
					jobPromises.push(serverUtils.getTranslationConnectorJobOnServer(server, job.id));
				}
				if (job.repositoryId) {
					jobPromises.push(serverRest.getRepository({server: server, id: job.repositoryId}));
				}

				return Promise.all(jobPromises);

			})
			.then(function (results) {
				var jobInfo = results[0] && results[0].job
				if (!jobInfo || !jobInfo.id) {
					return Promise.reject();
				}

				var connectorJob = job.connectorId ? results[1] && results[1].data : undefined;
				var repo = job.repositoryId ? (job.connectorId ? results[2] : results[1]) : results[1];

				// console.log(jobInfo);
				// console.log(connectorJob);

				var jobData = _getJobData(jobInfo);

				console.log('');
				var format1 = '%-38s  %-s';
				console.log(sprintf(format1, 'Id', jobInfo.id));
				console.log(sprintf(format1, 'Name', jobInfo.name));

				var siteJobType = '';
				if (jobInfo.type === 'sites' && jobInfo.data) {
					let dataStr = jobInfo.data;
					if (dataStr && dataStr.indexOf('exportType=') >= 0) {
						let exportParams = dataStr.split('|');
						let exportType;
						for (let i = 0; i < exportParams.length; i++) {
							if (exportParams[i].startsWith('exportType=')) {
								exportType = serverUtils.trimString(exportParams[i], 'exportType=');
							}
						}
						if (exportType) {
							siteJobType = ' (' + exportType + ')';
						}
					}
				}
				console.log(sprintf(format1, 'Type', jobInfo.type + siteJobType));

				if (repo) {
					console.log(sprintf(format1, 'Repository', repo.name + ' (' + repo.id + ')'));
				}
				console.log(sprintf(format1, 'Status', jobInfo.status));
				console.log(sprintf(format1, 'Created', jobInfo.createdDate.value + ' by ' + jobInfo.createdBy));
				console.log(sprintf(format1, 'Updated', jobInfo.updatedDate.value + ' by ' + jobInfo.updatedBy));
				if (connectorJob) {
					let msg = jobInfo.connectorName + ' ' + connectorJob.connectorJobStatus;
					if (connectorJob.translationDate) {
						msg += ' (' + connectorJob.translationDate + ')';
					}
					if (connectorJob.statusMessage) {
						msg += ' ' + connectorJob.statusMessage;
					}
					console.log(sprintf(format1, 'Connector status', msg));
				}
				if (jobData && jobData.properties) {
					var sourceLanguage = jobData.properties.sourceLanguage || '';
					var targetlanguages = jobData.properties.targetLanguages || '';
					console.log(sprintf(format1, 'Source language', sourceLanguage));
					console.log(sprintf(format1, 'Target languages', targetlanguages));
				}
				if (connectorJob && connectorJob.notificationData) {
					let objsInJob;
					try {
						let data = JSON.parse(connectorJob.notificationData);
						if (data && data.assetValidation) {
							objsInJob = JSON.parse(data.assetValidation);
						}

					} catch (e) {
						// invalid data
					}

					let assets = objsInJob && objsInJob.assetsInJob;
					let pages = objsInJob && objsInJob.pagesInJob;
					if (jobInfo.type === 'assets') {
						console.log(sprintf(format1, 'List of assets (' + assets.length + ')', ''));
						// console.log(assets);
						if (assets.length > 0) {
							assets = _sortByName(assets);
							_displayAssets(assets);
							console.log('');
						}
					}
					if (jobInfo.type === 'sites') {
						console.log(sprintf(format1, 'List of assets (' + assets.length + ')', ''));
						// console.log(assets);
						if (assets.length > 0) {
							assets = _sortByName(assets);
							_displayAssets(assets);
							console.log('');
						}
						console.log('');
						console.log(sprintf(format1, 'List of pages (' + pages.length + ')', ''));
						pages = _sortByName(pages);
						let pageFormat = '  %-100s  %-12s  %-12s  %-s';
						console.log(sprintf(pageFormat, 'Page', 'Has Content', 'Translatable', 'Detail'));
						pages.forEach(function (page) {
							let content = page.content && !page.content.empty ? '     √' : '';
							let translatable = content && page.content.translate ? '     √' : '';
							let detail = page.content && page.content.detail || '';
							console.log(sprintf(pageFormat, page.name, content, translatable, detail));
						});
						console.log('');
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
			console.info(' - created translation job zip file ' + zippath);

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
					console.info(' - create translation job on the connector: ' + jobId);
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
		console.error('ERROR: job ' + name + ' has not been submmitted to translation connector yet');
		done();
		return;
	}
	if (!jobConnectionInfo.connection) {
		console.error('ERROR: no connection found for job ' + name);
		done();
		return;
	}

	var connection = jobConnectionInfo.connection;
	console.info(' - use connection ' + connection);

	// get connection
	var connectionjson = _getConnectionInfo(connection);
	if (!connectionjson) {
		done();
		return;
	}

	var connectionJobId = jobConnectionInfo.jobId;

	console.info(' - query translation connection to get job status');

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

		console.info(' - get translation');
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
			console.error(result.statusMessage);
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
					console.error('ERROR: job ' + name + ' does not exist on server');
					return Promise.reject();
				}

				if (!job.connectorId) {
					console.error('ERROR: job ' + name + ' is not translated by translation connector');
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
					console.error('ERROR: job ' + name + ' is not ready to ingest yet: ' + connJob.connectorJobStatus);
					return Promise.reject();
				}
				console.info(' - verify job (Id: ' + job.id + ' name: ' + job.name + ' type: ' + job.type + ')');

				return serverUtils.getIdcToken(server);
			})
			.then(function (result) {
				idcToken = result.idcToken;

				return job.type === 'assets' ? serverRest.importAssetTranslation({
					server: server,
					job: job
				}) : _ingestTranslationJobSCS(server, idcToken, job.id, job.connectorId);
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}
				console.log(' - ingest finished');
				done(true);
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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.get(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to submit ingest translation job ' + jobId);
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to submit ingest translation job ' + jobId + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			} else {
				var jobId = data.LocalData.JobID;
				idcToken = data.LocalData.idcToken;
				if (console.showInfo()) {
					console.info(' - submit validate and import background job (JobId: ' + jobId + ')');
					console.info(' - If this command is terminated, use the following command to continue to monitor the background job:');
					console.info('   cec describe-background-job ' + jobId);
				}
				// wait ingest to finish
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = _getImportValidateStatusSCS(server, idcToken, jobId);
					jobPromise.then(function (data) {
						if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							// try to get error message
							var jobDataPromise = _getJobReponseDataSCS(server, idcToken, jobId);
							jobDataPromise.then(function (data) {
								console.error('ERROR: ingest failed: ' + (data && data.LocalData && data.LocalData.StatusMessage));
								return resolve({
									err: 'err'
								});
							});
						}
						if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
							clearInterval(inter);
							if (console.showInfo()) {
								process.stdout.write(' - ingesting: percentage  ' + data.JobPercentage + '% [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								process.stdout.write(os.EOL);
							}
							return resolve({});

						} else {
							if (console.showInfo()) {
								process.stdout.write(' - ingesting: percentage ' + data.JobPercentage + '% [' + serverUtils.timeUsed(startTime, new Date()) + ']');
								readline.cursorTo(process.stdout, 0);
								needNewLine = true;
							}
						}
					});
				}, 5000);
			}

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

		serverUtils.showRequestOptions(params);

		var request = require('../test/server/requestUtils.js').request;
		request.post(params, function (error, response, body) {
			if (error) {
				console.error('ERROR: Failed to submit refresh translation job ' + jobId + ' (ecid: ' + response.ecid + ')');
				console.error(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				// handle invalid json
			}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.error('ERROR: Failed to submit refresh translation job ' + jobId + ' - ' + (data && data.LocalData ? data.LocalData.StatusMessage : (response.statusMessage || response.statusCode)) + ' (ecid: ' + response.ecid + ')');
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
			console.error(result.statusMessage);
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
					console.error('ERROR: job ' + name + ' does not exist on server');
					return Promise.reject();
				}

				// console.log(job);
				if (!job.connectorId) {
					console.error('ERROR: job ' + name + ' is not translated by translation connector');
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
		console.error('ERROR: job ' + name + ' has not been submmitted to translation connector yet');
		done();
		return;
	}
	if (!jobConnectionInfo.connection) {
		console.error('ERROR: no connection found for job ' + name);
		done();
		return;
	}

	var connection = jobConnectionInfo.connection;
	console.info(' - use connection ' + connection);

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
		console.error('ERROR: connector ' + connectorName + ' does not exist');
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
		for (let i = 0; i < requirefFiels.length; i++) {
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
			console.error('ERROR: missing required fields ' + missingFields);
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
				console.error('ERROR: failed to unzip ' + connectorZip);
				done();
			}

			console.log(` - translation connector ${name} created at ${connectorSrcPath}`);

			console.log(' - install connector');
			var installCmd = childProcess.spawnSync(npmCmd, ['install', '--prefix', connectorSrcPath, connectorSrcPath], {
				projectDir,
				shell: (process.platform === 'win32'),
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
		shell: (process.platform === 'win32'),
		stdio: 'inherit'
	});
	done();
};