/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverRest = require('../test/server/serverRest.js'),
	fs = require('fs'),
	path = require('path'),
	fileUtils = require('../test/server/fileUtils.js');


var _executeGetExportService = function (args) {
	var server = args.server,
		url = args.endpoint,
		noMsg = args.noMsg;

	// Note: Export service on dev instances requires additional header
	var addheaders;
	if (server.env === 'dev_ec') {
		addheaders = { 'IDCS_REMOTE_USER': server.username };
	}

	return serverRest.executeGet({
		server: server,
		endpoint: url,
		noMsg: noMsg,
		headers: addheaders
	});
};

var _downloadReport = function (url, name, server, projectDir, type) {
	return new Promise(function (resolve, reject) {
		console.info(' - Download reports from ' + url);
		var targetStem,
			namePrefix;

		if (url.indexOf('/system/export/api/v1/exports/') !== -1) {
			targetStem = type + 'Export';
			namePrefix = 'Export_';
		} else if (url.indexOf('/system/export/api/v1/imports/') !== -1) {
			targetStem = type + 'Import';
			namePrefix = 'Import_';
		}

		var targetPath = path.join(projectDir, 'src', targetStem);
		// Create target path
		fs.mkdirSync(targetPath, {
			recursive: true
		});

		targetPath = path.join(targetPath, namePrefix + name + '_Report.zip');
		console.info(' - Save reports to ' + targetPath);
		// Note: Export service on dev instances requires additional header
		var addheaders;
		if (server.env === 'dev_ec') {
			addheaders = { 'IDCS_REMOTE_USER': server.username };
		}

		var downloadArgs = {
			server: server,
			url: url,
			saveTo: targetPath,
			headers: addheaders
		}
		serverRest.downloadByURLSave(downloadArgs).then(function () {
			resolve(targetPath);
		}).catch((error) => {
			console.error('Failed to download reports');
			resolve();
		});
	});
};

var _downloadReports = function (args) {
	var reports = args.reports,
		type = args.type,
		name = args.name,
		server = args.server,
		projectDir = args.projectDir;

	var downloadPromises = [];
	(reports || []).forEach(function (report) {
		downloadPromises.push(_downloadReport(report, name, server, projectDir, type));
	});

	return Promise.all(downloadPromises);
};

// For backward compatibility of usage in site.js
var _downloadSiteReports = function (reports, name, server, projectDir) {
	return _downloadReports({
		reports: reports,
		type: 'site',
		name: name,
		server: server,
		projectDir: projectDir
	});
}

var _writeErrorDetail = function(args) {
	var reportPath = args.reportPath;

	return new Promise(function (resolve, reject) {
		// Just trim the '.zip' from reportPath
		var extractPath = reportPath.substring(0, reportPath.lastIndexOf('.zip'));

		// Remove target path if exists.
		if (fs.existsSync(extractPath)) {
			fileUtils.remove(extractPath);
		}

		// Create extraction directory
		fs.mkdirSync(extractPath);

		fileUtils.extractZip(reportPath, extractPath).then(function() {
			console.info(' - Extracted report to ' + extractPath);
			var reportFilePath = path.join(extractPath, 'Report.json');
			if (fs.existsSync(reportFilePath)) {
				var reportStr = fs.readFileSync(reportFilePath);
				var reportJson = JSON.parse(reportStr);
				console.info('ERROR Detail: ' + reportJson.errorDetail);
			}
			resolve();
		});
	});
};

module.exports.utils = {
	executeGetExportService: _executeGetExportService,
	downloadReport: _downloadReport,
	downloadReports: _downloadReports,
	downloadSiteReports: _downloadSiteReports,
	writeErrorDetail: _writeErrorDetail
}