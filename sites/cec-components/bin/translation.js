/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * translation job library
 */

var path = require('path'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	sprintf = require('sprintf-js').sprintf,
	serverUtils = require('../test/server/serverUtils.js');
var Client = require('node-rest-client').Client;

var projectDir = path.join(__dirname, '..'),
	transBuildDir = path.join(projectDir, 'src', 'build', 'translations');

/**
 * Global variables 
 */
var _CSRFToken;

/** 
 * private 
 */

var _cmdEnd = function (done) {
	done();
	process.exit(0);
};

var _getIdcToken = function (request, server) {
	var tokenPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

		var isPod = server.env === 'pod_ec';
		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get idcToken');
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
				console.log('ERROR: Failed to get IdcToken' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			return resolve({
				idcToken: data && data.LocalData && data.LocalData.idcToken
			});
		});
	});
	return tokenPromise;
};

/**
 * Query translation jobs on the server
 * 
 * @param {*} server 
 * @param {*} jobType 
 */
var _getTranslationJobs = function (server, jobType) {
	var jobPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/translationJobs?jobType=' + jobType + '&limit=999&offset=0&orderBy=name:asc';
		client.get(url, function (data, response) {
			var jobs = [];
			if (response && response.statusCode === 200) {
				jobs = data && data.items || [];
				resolve({
					jobType: jobType,
					jobs: jobs
				});
			} else {
				console.log('ERROR: failed to query translation jobs: ' + response.statusCode);
				resolve({
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
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/translationJobs/' + jobId;
		client.get(url, function (data, response) {
			var jobs = [];
			if (response && response.statusCode === 200) {
				resolve({
					id: jobId,
					job: data
				});
			} else {
				console.log('ERROR: failed to query translation job: ' + response.statusCode);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return jobPromise;
};

/**
 * Download file from server
 * 
 * @param {*} server 
 * @param {*} fFileGUID 
 */
var _downloadFile = function (server, fFileGUID, jobName) {
	var downloadPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/documents/api/1.2/files/' + fFileGUID + '/data';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve({
					data: data
				});
			} else {
				var result;
				try {
					result = JSON.parse(data);
				} catch (error) {};
				var msg = response.statusCode;
				if (result && result.errorMessage) {
					msg = result.errorMessage;
				} else {
					if (response.statusCode === 403) {
						msg = 'No read permission';
					} else if (response.statusCode === 404) {
						msg = 'File id is not found';
					}
				}
				console.log('ERROR: failed to download job: ' + msg);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return downloadPromise;
};

var _updateTranslationJobStatus = function (server, csrfToken, job, status) {
	var updatePromise = new Promise(function (resolve, reject) {

		var request = require('request');
		request = request.defaults({
			jar: true,
			proxy: null
		});

		var url = server.url + '/content/management/api/v1.1/translationJobs/' + job.id;
		job.status = status;
		var formDataStr = JSON.stringify(job);
		var auth = {
			user: server.username,
			password: server.password
		};
		var postData = {
			method: 'PUT',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': csrfToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest'
			},
			body: formDataStr
		};

		request(postData, function (error, response, body) {
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
				} catch (error) {};
				resolve({
					data
				});
			} else {
				console.log('ERROR: failed to change translation job status ' + response.statusCode);
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

var _validateTranslationJob = function (request, server, translationJobType, job, file) {
	var validatePromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/translationJobs';
		var formData = {
			jobType: 'import',
			properties: {
				jobName: job.jobName,
				translationJobType: translationJobType,
				jobId: job.jobId,
				fFileGUID: file.LocalData && file.LocalData.fFileGUID,
				validationMode: 'validateOnly'
			}
		};
		// console.log(formData);
		var formDataStr = JSON.stringify(formData);
		var auth = {
			user: server.username,
			password: server.password
		};
		var postData = {
			method: 'POST',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': _CSRFToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest'
			},
			body: formDataStr
		};
		request(postData, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to submit validate translation job ' + job.jobName);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
				var statusUrl = response.headers && response.headers.location || '';
				return resolve({
					statusUrl: statusUrl
				});
			} else {
				// console.log(data);
				var err = data ? (data.detail || data.title) : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to validate translation job - ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return validatePromise;
};

var _importTranslationJob = function (request, server, translationJobType, job, file) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/translationJobs';
		var formData = {
			jobType: 'import',
			properties: {
				jobName: job.jobName,
				translationJobType: translationJobType,
				jobId: job.jobId,
				fFileGUID: file.LocalData && file.LocalData.fFileGUID,
				repositoryId: job.repositoryId,
				validationMode: 'validateAndImport'
			}
		};
		// console.log(formData);
		var formDataStr = JSON.stringify(formData);
		var auth = {
			user: server.username,
			password: server.password
		};
		var postData = {
			method: 'POST',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': _CSRFToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest'
			},
			body: formDataStr
		};
		request(postData, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to submit import translation job ' + job.jobName);
				console.log(err);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {};

			if (response && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 202)) {
				var statusUrl = response.headers && response.headers.location || '';
				return resolve({
					statusUrl: statusUrl
				});
			} else {
				// console.log(data);
				var err = data ? (data.detail || data.title) : (response ? response.statusCode + response.statusMessage : '');
				console.log('ERROR: Failed to import translation job - ' + err);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return importPromise;
};

var _importTranslationJobSCS = function (request, server, idcToken, job, file) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_IMPORT_SITE_TRANS';
		url = url + '&jobName=' + job.jobName;
		url = url + '&fFileGUID=' + (file.LocalData && file.LocalData.fFileGUID);
		url = url + '&validationMode=validateAndImport&useBackgroundThread=1';
		url = url + '&idcToken=' + idcToken;

		var isPod = server.env === 'pod_ec';
		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(params, function (error, response, body) {
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
				console.log('ERROR: Failed to submit import translation job ' + job.jobName + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			return resolve(data);

		});
	});
	return importPromise;
};

var _getImportValidateStatusSCS = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var isPod = server.env === 'pod_ec';
		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(params, function (error, response, body) {
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

var _getImportValidateStatus = function (server, request, statusUrl) {
	var statusPromise = new Promise(function (resolve, reject) {
		var auth = {
			user: server.username,
			password: server.password
		};
		var params = {
			method: 'GET',
			url: statusUrl,
			auth: auth,
		};

		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: failed to get validation status ' + err);
				resolve({
					err: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data;
				try {
					data = JSON.parse(body);
				} catch (error) {};
				resolve(data);
			} else {
				console.log('ERROR: failed to get validation status ' + response.statusCode);
				resolve({
					err: 'err'
				});
			}
		});
	});
	return statusPromise;
};

var _displayValidationResult = function (result, jobType, tempDir) {
	if (!result || !result.body || !result.body.validation) {
		console.log(' - no validation result found');
		return;
	}
	var validation = result.body.validation;
	// console.log(result);
	if (validation.valid) {
		console.log(' - translation job ' + result.body.jobName + ' is valid');
		var format = '%-40s %-40s';
		console.log(sprintf(format, 'Language', 'Import Status'));
		for (var i = 0; i < validation.languagesReturnedComplete.length; i++) {
			var lang = validation.languagesReturnedComplete[i];
			console.log(sprintf(format, lang, 'Will be imported'));
		}

		var items = validation.itemsToBeImported;
		var byName = items.slice(0);
		byName.sort(function (a, b) {
			var x = a.name;
			var y = b.name;
			return (x < y ? -1 : x > y ? 1 : 0);
		});
		items = byName;
		console.log('');
		console.log(sprintf(format, 'Asset', 'Import Status'));
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			console.log(sprintf(format, item.name, 'Will be imported'));
		}
		if (jobType === 'sites') {
			var files = fs.readdirSync(path.join(tempDir, 'site'));
			var siteStructure;
			for (var i = 0; i < files.length; i++) {
				if (fs.existsSync(path.join(tempDir, 'site', files[i], 'structure.json'))) {
					var structurestr = fs.readFileSync(path.join(tempDir, 'site', files[i], 'structure.json'));
					siteStructure = JSON.parse(structurestr);
				}
				if (siteStructure && siteStructure.pages.length > 0) {
					break;
				}
			}

			var pages = siteStructure && siteStructure.pages || [];
			// sort by name
			var byName = pages.slice(0);
			byName.sort(function (a, b) {
				var x = a.name;
				var y = b.name;
				return (x < y ? -1 : x > y ? 1 : 0);
			});
			pages = byName;

			console.log('');
			console.log(sprintf(format, 'Page', 'Import Status'));
			for (var i = 0; i < pages.length; i++) {
				var page = pages[i];
				console.log(sprintf(format, page.name + ' ' + page.id + '.json', 'Will be imported'));
			}
			console.log(sprintf(format, 'siteinfo.json', 'Will be imported'));
			console.log(sprintf(format, 'structure.json', 'Will be imported'));
		}
	} else {
		// console.log(validation);
		var _getItemNames = function (items) {
			var names = [];
			for (var j = 0; j < items.length; j++) {
				names.push(items[j].name);
			}

			return '[' + names.join(', ') + ']';
		}
		var _displayTranslationResult = function (name) {
			if (!validation.hasOwnProperty(name)) {
				return;
			}
			var values = validation[name];
			if (values.length === 0) {
				console.log((' ' + name + ':'), validation[name]);
			} else {
				console.log(' ' + name + ':');
				for (var i = 0; i < values.length; i++) {
					console.log('   language: ' + values[i].language + '  items: ' + _getItemNames(values[i].items));
				}
			}
		};
		console.log(' - translation job ' + result.body.jobName + ' is NOT valid:');
		console.log(' languagesNotReturned:', validation.languagesNotReturned);
		console.log(' languagesReturnedComplete:', validation.languagesReturnedComplete);
		console.log(' languagesReturnedIncomplete:', validation.languagesReturnedIncomplete);
		_displayTranslationResult('translationsMissed');
		_displayTranslationResult('translationsCorrupted');
		_displayTranslationResult('translationsInvalidEncoding');
		console.log(' nonTranslatableItems: ' + _getItemNames(validation.nonTranslatableItems));
		console.log(' deletedMasterItems: ' + _getItemNames(validation.deletedMasterItems));
		console.log(' itemsToBeImported: ' + _getItemNames(validation.itemsToBeImported));
	}
};

var _execImportTranslationJob = function (server, request, validateonly, folder, filePath, job, jobType, tempDir, done) {

	var tokenPromise = serverUtils.getCaasCSRFToken(server);
	tokenPromise.then(function (result) {
			_CSRFToken = result && result.token;

			return serverUtils.uploadFileToServer(request, server, folder, filePath);
		})
		.then(function (result) {
			if (result.err) {
				done();
				return;
			}
			var file = result;
			if (validateonly) {
				//
				// validate
				//
				var validatePromise = _validateTranslationJob(request, server, jobType, job, file);
				validatePromise.then(function (result) {
					if (result.err) {
						_cmdEnd(done);
					}
					var statusUrl = result.statusUrl;
					if (!statusUrl) {
						console.log('ERROR: failed to get validate status');
						_cmdEnd(done);
					}
					// console.log(statusUrl);

					// wait validate to finish
					var inter = setInterval(function () {
						var jobPromise = _getImportValidateStatus(server, request, statusUrl);
						jobPromise.then(function (data) {
							if (!data || data.error || data.progress === 'failed') {
								clearInterval(inter);
								console.log('ERROR: validation failed: ' + (data && data.error && data.error.detail || data && data.status));
								_cmdEnd(done);
							}
							if (data.completed) {
								clearInterval(inter);
								// console.log(' - validation ' + job.jobName + ' finished');
								_displayValidationResult(data.result, jobType, tempDir);
								_cmdEnd(done);
							} else {
								console.log(' - validating: percentage ' + data.completedPercentage);
							}
						});
					}, 5000);
				})

			} else {
				//
				// Import
				//
				var tokenPromise = _getIdcToken(request, server);
				tokenPromise.then(function (result) {
					if (result.err) {
						_cmdEnd(done);
					}
					var idcToken = result.idcToken;

					var importPromise = _importTranslationJobSCS(request, server, idcToken, job, file);
					return importPromise;
				}).then(function (result) {
					if (result.err) {
						_cmdEnd(done);
					}

					var jobId = result.LocalData.JobID;
					var idcToken = result.LocalData.idcToken;

					// wait import to finish
					var inter = setInterval(function () {
						var jobPromise = _getImportValidateStatusSCS(server, request, idcToken, jobId);
						jobPromise.then(function (data) {
							if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
								clearInterval(inter);
								console.log('ERROR: import failed: ' + (data && data.JobMessage));
								_cmdEnd(done);
							}
							if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
								clearInterval(inter);
								console.log(' - import ' + job.jobName + ' finished');
								_cmdEnd(done);

							} else {
								console.log(' - importing: percentage ' + data.JobPercentage);
							}
						});
					}, 5000);
				});
			}

		});
};

var _getSiteInfoFile = function (request, localhost, site) {
	var siteInfoFilePromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_GET_SITE_INFO_FILE&siteId=' + site + '&IsJson=1';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site info');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			try {
				var data = JSON.parse(body);
				if (!data) {
					console.log('ERROR: Failed to get site info');
					return resolve({
						'err': 'error'
					});
				}
				if (data.LocalData && data.LocalData.StatusCode === '-32') {
					console.log('ERROR: site ' + site + ' does not exist');
					return resolve({
						'err': 'site does not exist'
					});
				}
				if (response && response.statusCode !== 200) {
					console.log('ERROR: Failed to get site info');
					return resolve({
						'err': response.statusCode
					});
				}
				resolve({
					'data': data
				});
			} catch (error) {
				console.log('ERROR: Failed to get site info');
				console.log(error);
				return resolve({
					'err': 'error'
				});
			}
		});
	});
	return siteInfoFilePromise;
};

var _getSiteGUID = function (request, localhost, site) {
	var sitesPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_BROWSE_SITES';
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get site Id');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get site Id ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
			var sites = []
			for (var j = 0; j < rows.length; j++) {
				sites.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					sites[j][attr] = rows[j][i];
				}
			}
			var siteGUID;
			for(var i = 0; i < sites.length; i++) {
				if (sites[i]['fFolderName'] === site) {
					siteGUID = sites[i]['fFolderGUID'];
					break;
				}
			}
			return resolve({
				siteGUID: siteGUID
			});
		});
	});
	return sitesPromise;
};

var _getLocalizationPolicy = function (request, localhost, policyId) {
	var policyPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/content/management/api/v1.1/policy/' + policyId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get policy with id ' + policyId);
				console.log(err);
				return resolve({
					'err': err
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				resolve(data);
			} else {
				console.log('ERROR: Failed to get policy with id ' + policyId);
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return policyPromise;
};

var _exportTranslationJobSCS = function (request, localhost, idcToken, jobName, siteInfo, targetLanguages, exportType) {
	var exportPromise = new Promise(function (resolve, reject) {
		var url = localhost + '/documents/web?IdcService=SCS_EXPORT_SITE_TRANS';
		url = url + '&idcToken=' + idcToken;
		url = url + '&jobName=' + jobName;
		url = url + '&exportType=' + exportType;
		url = url + '&sourceLanguage=' + siteInfo.defaultLanguage;
		url = url + '&targetLanguages=' + targetLanguages;
		url = url + '&siteGUID=' + siteInfo.siteGUID;

		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to create translation job');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			if (response && (response.statusCode === 200 || response.statusCode === 202)) {
				var data = JSON.parse(body);
				console.log(' - create translation job submitted');
				resolve(data);
			} else {
				console.log('ERROR: Failed to create translation job');
				console.log(response ? response.statusCode + response.statusMessage : '');
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return exportPromise;
};

var _execCreateTranslationJob = function (server, request, localhost, idcToken, name, siteInfo, targetLanguages, exportType, done) {
	var exportPromise = _exportTranslationJobSCS(request, localhost, idcToken, name, siteInfo, targetLanguages, exportType);
	exportPromise.then(function (result) {
		if (result.err) {
			_cmdEnd(done);
		}
		// console.log(result);
		var jobId = result.LocalData.JobID;

		// wait export to finish
		var inter = setInterval(function () {
			var jobPromise = _getImportValidateStatusSCS(server, request, idcToken, jobId);
			jobPromise.then(function (data) {
				if (!data || data.err || !data.JobStatus || data.JobStatus === 'FAILED') {
					clearInterval(inter);
					console.log('ERROR: create translation job failed: ' + (data && data.JobMessage));
					_cmdEnd(done);
				}
				if (data.JobStatus === 'COMPLETE' || data.JobPercentage === '100') {
					clearInterval(inter);
					console.log(' - translation job ' + name + ' created');
					_cmdEnd(done);

				} else {
					console.log(' - creating: percentage ' + data.JobPercentage);
				}
			});
		}, 5000);
	});
};

var _createTranslationJob = function (server, request, localhost, idcToken, site, name, langs, exportType, done) {
	// console.log('site: ' + site + ' job name: ' + name + ' languages: ' + langs + ' export type: ' + exportType);
	var allLangs = [];
	var siteInfo;

	// verify the name
	var jobPromises = [_getTranslationJobs(server, 'assets'), _getTranslationJobs(server, 'sites')];
	Promise.all(jobPromises)
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
				_cmdEnd(done);
				return;
			}

			return _getSiteInfoFile(request, localhost, site);
		})
		.then(function (result) {
			//
			// validate site
			//
			if (result.err) {
				_cmdEnd(done);
				return;
			}
			siteInfo = result.data.base.properties;
			var defaultLanguage = siteInfo.defaultLanguage;
			console.log(' - site: ' + site + ', default language: ' + defaultLanguage);

			return _getSiteGUID(request, localhost, site);
		})
		.then(function (result) {
			//
			// ger site GUID
			//
			if (result.err) {
				_cmdEnd(done);
				return;
			}
			siteInfo.siteGUID = result.siteGUID;

			return _getLocalizationPolicy(request, localhost, siteInfo.localizationPolicy);
		})
		.then(function (result) {
			//
			// Get Localization policy
			//
			if (result.err) {
				return resolve(result);
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
						_cmdEnd(done);
						return;
					}
					if (!allLangs.includes(langArr[i])) {
						console.log('ERROR: language ' + langArr[i] + ' is not in the localization policy');
						_cmdEnd(done);
						return;
					}
				}
				targetLanguages = langArr;
			} else {
				for(var i = 0; i < allLangs.length; i++) {
					if (allLangs[i] !== siteInfo.defaultLanguage) {
						targetLanguages.push(allLangs[i]);
					}
				}
			}
			console.log(' - target languages: ' + targetLanguages);
			_execCreateTranslationJob(server, request, localhost, idcToken, name, siteInfo, targetLanguages, exportType, done);

		});

};

///////////////////////////////////////////////////////////////////////////////////
//
// Tasks
//

/**
 * list translation jobs on the server
 */
module.exports.listServerTranslationJobs = function (argv, done) {
	'use strict';

	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}
	var type = argv.type;
	if (type && type !== 'sites' && type !== 'assets') {
		console.log('ERROR: invalid job type ' + type);
		done();
		return;
	}
	var jobPromises = [];
	if (type) {
		jobPromises.push(_getTranslationJobs(server, type));
	} else {
		jobPromises.push(_getTranslationJobs(server, 'assets'));
		jobPromises.push(_getTranslationJobs(server, 'sites'));
	}
	var jobs = [];
	Promise.all(jobPromises)
		.then(function (values) {
			var jobDetailPromises = [];
			for (var i = 0; i < values.length; i++) {
				for (var j = 0; j < values[i].jobs.length; j++) {
					jobDetailPromises.push(_getTranslationJob(server, values[i].jobs[j].id));
				}
			}

			return Promise.all(jobDetailPromises);
		})
		.then(function (values) {
			// merge the detail query result to the list
			for (var i = 0; i < values.length; i++) {
				if (values[i].job) {
					jobs.push(values[i].job);
				}
			}
			// console.log(jobs);
			//
			// display 
			//
			var format = '%-40s %-14s %-15s %-40s %-40s';

			if (!type || type === 'assets') {
				console.log('Asset translation jobs:');
				console.log(sprintf(format, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages'));
				for (var i = 0; i < jobs.length; i++) {
					if (jobs[i].type === 'assets') {
						var data = _getJobData(jobs[i]);
						var sourceLanguage = data && data.properties && data.properties.sourceLanguage || '';
						var targetlanguages = data && data.properties && data.properties.targetLanguages || '';
						console.log(sprintf(format, jobs[i].name, jobs[i].status, sourceLanguage, targetlanguages, jobs[i].assetPendingLanguages));
					}
				}
			}

			if (!type || type === 'sites') {
				console.log('Site translation jobs:');
				console.log(sprintf(format, 'Name', 'Status', 'Source Language', 'Target Languages', 'Pending Languages'));
				for (var i = 0; i < jobs.length; i++) {
					if (jobs[i].type === 'sites') {
						var data = _getJobData(jobs[i]);
						var sourceLanguage = data && data.sourceLanguage || '';
						var targetlanguages = data && data.targetLanguages || '';
						console.log(sprintf(format, jobs[i].name, jobs[i].status, sourceLanguage, targetlanguages, jobs[i].sitePendingLanguages));
					}
				}
			}

			done();
		});
};


/**
 * Download a translation job from the server
 */
module.exports.downloadServerTranslationJob = function (argv, done) {
	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}

	var jobName = argv.name;

	if (!jobName) {
		console.error('ERROR: please run as npm run download-server-translation-job -- --name <job name> [--output <the folder for the translation zip file>]');
		done();
		return;
	}

	var output = argv.output;
	if (output && !path.isAbsolute(output)) {
		output = path.join('..', output);
	}
	if (output && !fs.existsSync(path.resolve(output))) {
		console.log('ERROR: invalid output folder');
		done();
		return;
	}
	var destdir = output ? path.resolve(output) : projectDir;

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
		var downloadPromise = _downloadFile(server, job.fFileGUID, jobName);
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
						done();
					});
			} else {
				// no need to change status
				done();
			}
		}); // job zip downloaded

	}); // query jobs
};

/**
 * Import a translation job to the server
 */
module.exports.importTranslationJob = function (argv, done) {
	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		done();
		return;
	}

	var validateonly = typeof argv.validateonly === 'string' && argv.validateonly.toLowerCase() === 'true';

	if (!argv.file || typeof argv.file !== 'string') {
		console.error('Usage: npm run import-translation-job -- --file <translation zip file>');
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

	// 
	// make sure the zip is a valid translation job file
	//
	var name = filePath;
	if (name.indexOf('/') >= 0) {
		name = name.substring(name.lastIndexOf('/') + 1);
	}
	if (name.indexOf('.') > 0) {
		name = name.substring(0, name.indexOf('.'));
	}
	var tempDir = path.join(transBuildDir, name);
	if (fs.existsSync(tempDir)) {
		// remove the folder
		fse.removeSync(tempDir);
	}

	extract(filePath, {
		dir: tempDir
	}, function (err) {
		if (err) {
			console.log(err);
		}
		var job, jobType;
		if (fs.existsSync(path.join(tempDir, 'site', 'job.json'))) {
			jobType = 'sites';
			var jobstr = fs.readFileSync(path.join(tempDir, 'site', 'job.json'));
			job = JSON.parse(jobstr);
		} else if (fs.existsSync(path.join(tempDir, 'job.json'))) {
			jobType = 'assets';
			var jobstr = fs.readFileSync(path.join(tempDir, 'job.json'));
			job = JSON.parse(jobstr);
		} else if (fs.existsSync(path.join(tempDir, 'assets', 'job.json'))) {
			jobType = 'sites';
			var jobstr = fs.readFileSync(path.join(tempDir, 'assets', 'job.json'));
			job = JSON.parse(jobstr);
		}

		if (!job || !job.jobName || !job.jobId) {
			console.log('ERROR: file ' + filePath + ' is not a valid translation job file');
			done()
			return;
		}
		// console.log(job);

		// folder path on the server
		var folder = argv.folder && argv.folder.toString();
		if (folder === '/') {
			folder = '';
		} else if (folder && !serverUtils.replaceAll(folder, '/', '')) {
			console.log('ERROR: invalid folder');
			done();
			return;
		}

		var request = require('request');
		request = request.defaults({
			headers: {
				connection: 'keep-alive'
			},
			pool: {
				maxSockets: 50
			},
			jar: true,
			proxy: null
		});

		var isPod = server.env === 'pod_ec';
		var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			_execImportTranslationJob(server, request, validateonly, folder, filePath, job, jobType, tempDir, done);

		}); // login to server

	}); // open zip file
};

/**
 * Create a translation job on the server
 */
module.exports.createTranslationJob = function (argv, done) {
	var server = serverUtils.getConfiguredServer();
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
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

	var request = require('request');
	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		pool: {
			maxSockets: 50
		},
		jar: true,
		proxy: null
	});

	var isPod = server.env === 'pod_ec';
	var loginPromise = isPod ? serverUtils.loginToPODServer(server) : serverUtils.loginToDevServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var auth = isPod ? {
			bearer: server.oauthtoken
		} : {
			user: server.username,
			password: server.password
		};

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var dUser = '';
		var idcToken;

		app.get('/*', function (req, res) {
			// console.log('GET: ' + req.url);
			if (req.url.indexOf('/documents/') >= 0 || req.url.indexOf('/content/') >= 0) {
				var url = server.url + req.url;

				var options = {
					url: url,
					auth: auth
				};

				request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					serverUtils.fixHeaders(response, res);
				}).pipe(res);

			} else {
				console.log('ERROR: request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('SCS_EXPORT_SITE_TRANS') > 0) {
				var params = serverUtils.getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				var idcToken = params.idcToken;
				var jobName = params.jobName;
				var exportType = params.exportType;
				var sourceLanguage = params.sourceLanguage;
				var targetLanguages = params.targetLanguages;
				var siteGUID = params.siteGUID;

				var exportUrl = server.url + '/documents/web?IdcService=SCS_EXPORT_SITE_TRANS';
				var data = {
					'idcToken': idcToken,
					'jobName': jobName,
					'exportType': exportType,
					'sourceLanguage': sourceLanguage,
					'targetLanguages': targetLanguages,
					'siteGUID': siteGUID,
					'useBackgroundThread': '1',
				};
				var postData = {
					method: 'POST',
					url: exportUrl,
					'auth': auth,
					'form': data
				};
				// console.log(postData)
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						serverUtils.fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - submit create translation job finished');
						res.end();
					});

			} else {
				console.log('ERROR: request not supported: ' + req.url);
				res.write({});
				res.end();
			}
		});

		var localServer = app.listen(port, function () {
			var total = 0;
			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data;
					try {
						data = JSON.parse(body);
					} catch(err) {}

					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						console.log(' - establish user session');
						_createTranslationJob(server, request, localhost, idcToken, site, name, langs, exportType, done);
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						console.log('ERROR: disconnect from the server, try again');
						_cmdEnd(done);
					}
				});
			}, 6000);

		});
	});
};