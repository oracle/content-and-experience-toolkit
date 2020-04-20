/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Site library
 */
var serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	extract = require('extract-zip'),
	fs = require('fs'),
	fse = require('fs-extra'),
	gulp = require('gulp'),
	os = require('os'),
	path = require('path'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var projectDir,
	contentSrcDir,
	serversSrcDir,
	recommendationSrcDir;
var buildfolder;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	contentSrcDir = path.join(srcfolder, 'content');
	serversSrcDir = path.join(srcfolder, 'servers');
	recommendationSrcDir = path.join(srcfolder, 'recommendations');

	buildfolder = serverUtils.getBuildFolder(projectDir);
	if (!fs.existsSync(buildfolder)) {
		fs.mkdirSync(buildfolder);
	}

	return true;
};

module.exports.downloadRecommendation = function (argv, done) {
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
	var repositoryName = argv.repository;
	var recommendation;
	var repositories;
	var repository;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getRepositories({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repositories = result || [];
				var promises = [];
				repositories.forEach(function (repo) {
					if (repositoryName && repositoryName.toLowerCase() === repo.name.toLowerCase()) {
						repository = repo;
					}
					promises.push(serverRest.getRecommendations({
						server: server,
						repositoryId: repo.id,
						repositoryName: repo.name
					}));
				});

				if (repositoryName) {
					if (!repository) {
						console.log('ERROR: repository ' + repositoryName + ' does not exist');
						return Promise.reject();
					}
					console.log(' - verify repository');
				}

				return Promise.all(promises);
			})
			.then(function (results) {
				if (!results || results.err) {
					return Promise.reject();
				}

				var nameMatched = [];
				var allRecommendations = results.length > 0 ? results : [];
				allRecommendations.forEach(function (value) {
					if (value && value.repositoryId && value.data) {
						var recommendations = value.data;
						for (var i = 0; i < recommendations.length; i++) {
							if (name.toLowerCase() === recommendations[i].name.toLowerCase()) {
								nameMatched.push(recommendations[i]);
								if (repository && repository.id === recommendations[i].repositoryId) {
									recommendation = recommendations[i];
								}
							}
						}
					}
				});

				if (nameMatched.length === 0) {
					console.log('ERROR: recommendation ' + name + ' does not exist');
					return Promise.reject();
				}
				if (repository && !recommendation) {
					console.log('ERROR: recommendation ' + name + ' is not found in repository ' + repository.name);
					return Promise.reject();
				}
				if (!repository && nameMatched.length > 1) {
					console.log('ERROR: there are more than one recommendations with name ' + name + '. Please specify the repository and run again.');
					return Promise.reject();
				}

				recommendation = recommendation || nameMatched[0];
				if (!repository) {
					for (var i = 0; i < repositories.length; i++) {
						if (recommendation.repositoryId === repositories[i].id) {
							repository = repositories[i];
							break;
						}
					}
				}

				console.log(' - verify recommendation (Id: ' + recommendation.id + ' repository: ' + repository.name + ')');

				console.log('export recommendation under development...');
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

module.exports.uploadRecommendation = function (argv, done) {
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
	var repositoryName = argv.repository;

	// verify the recommendation
	var recommendationPath = path.join(recommendationSrcDir, name);
	if (!fs.existsSync(recommendationPath)) {
		console.log('ERROR: recommendation folder ' + recommendationPath + ' does not exist');
		done();
		return;
	}

	var recommendation;
	var repositories;
	var repository;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		serverRest.getRepositories({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repositories = result || [];
				repositories.forEach(function (repo) {
					if (repositoryName && repositoryName.toLowerCase() === repo.name.toLowerCase()) {
						repository = repo;
					}
				});

				if (!repository) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}
				console.log(' - verify repository');

				console.log('import recommendation under development...');
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