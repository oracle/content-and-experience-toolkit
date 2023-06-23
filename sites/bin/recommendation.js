/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Site library
 */
var serverUtils = require('../test/server/serverUtils.js'),
	fileUtils = require('../test/server/fileUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	extract = require('extract-zip'),
	fs = require('fs'),
	gulp = require('gulp'),
	os = require('os'),
	path = require('path'),
	readline = require('readline'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var console = require('../test/server/logger.js').console;

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
	var published = typeof argv.published === 'string' && argv.published.toLowerCase() === 'true';

	var repositoryName = argv.repository;
	var channelName = argv.channel;

	var recommendation;
	var repositories;
	var repository;
	var queryChannel = false;
	var channel;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
						console.error('ERROR: repository ' + repositoryName + ' does not exist');
						return Promise.reject();
					}
					console.info(' - verify repository');
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
							if (name === recommendations[i].name || name.toLowerCase() === recommendations[i].name.toLowerCase()) {
								nameMatched.push(recommendations[i]);
								if (repository && repository.id === recommendations[i].repositoryId) {
									recommendation = recommendations[i];
								}
							}
						}
					}
				});

				if (nameMatched.length === 0) {
					console.error('ERROR: recommendation ' + name + ' does not exist');
					return Promise.reject();
				}
				if (repository && !recommendation) {
					console.error('ERROR: recommendation ' + name + ' is not found in repository ' + repository.name);
					return Promise.reject();
				}
				if (!repository && nameMatched.length > 1) {
					console.error('ERROR: there are more than one recommendations with name ' + name + '. Please specify the repository and run again.');
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

				if (published && !recommendation.isPublished) {
					console.error('ERROR: recommendation ' + name + ' has not been published yet');
					return Promise.reject();
				}

				console.info(' - verify recommendation (Id: ' + recommendation.id + ' repository: ' + repository.name + ')');

				var channelPromises = [];
				if (published && recommendation.publishedChannels && recommendation.publishedChannels.length > 0) {
					queryChannel = true;
					recommendation.publishedChannels.forEach(function (channel) {
						channelPromises.push(serverRest.getChannel({
							server: server,
							id: channel.id
						}));
					});
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {
				if (queryChannel) {
					var channels = [];
					var i;
					for (i = 0; i < results.length; i++) {
						if (!results[i].err && results[i].id) {
							channels.push(results[i]);
						}
					}
					if (channels.length === 0) {
						console.error('ERROR: no published channel is found');
						return Promise.reject();
					}

					for (i = 0; i < channels.length; i++) {
						if (channelName.toLowerCase() === channels[i].name.toLowerCase()) {
							channel = channels[i];
							break;
						}
					}

					if (!channel) {
						console.error('ERROR: recommendation ' + name + ' is not published to channel ' + channelName);
						return Promise.reject();
					}
				}

				return serverRest.exportRecommendation({
					server: server,
					id: recommendation.id,
					name: recommendation.name,
					published: published,
					publishedChannelId: channel && channel.id
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.jobId) {
					return Promise.reject();
				}

				var jobId = result.jobId;
				console.info(' - submit export job (' + jobId + ')');
				// Wait for job to finish
				var inter = setInterval(function () {
					var checkExportStatusPromise = serverRest.getContentJobStatus({
						server: server,
						jobId: jobId
					});
					checkExportStatusPromise.then(function (result) {
						if (result.status !== 'success') {
							clearInterval(inter);
							return Promise.reject();
						}

						var data = result.data;
						var status = data.status;
						// console.log(data);
						if (status && status === 'SUCCESS') {
							clearInterval(inter);
							var downloadLink = data.downloadLink[0].href;
							if (downloadLink) {
								var options = {
									url: downloadLink,
									headers: {
										'Content-Type': 'application/zip',
										Authorization: serverUtils.getRequestAuthorization(server)
									},
									encoding: null
								};

								serverUtils.showRequestOptions(options);

								//
								// Download the export zip
								var request = require('../test/server/requestUtils.js').request;
								request.get(options, function (err, response, body) {
									if (err) {
										console.error('ERROR: Failed to download');
										console.error(err);
										done();
									}
									if (response && response.statusCode === 200) {

										console.info(' - download export file');
										var destdir = path.join(projectDir, 'dist');
										if (!fs.existsSync(destdir)) {
											fs.mkdirSync(destdir);
										}
										var exportfilepath = path.join(destdir, name + '_export.zip');
										fs.writeFileSync(exportfilepath, body);
										console.info(' - save export to ' + exportfilepath);

										if (!fs.existsSync(recommendationSrcDir)) {
											fs.mkdirSync(recommendationSrcDir);
										}

										// unzip to src/recommendations
										var recoPath = path.join(recommendationSrcDir, name);
										fileUtils.remove(recoPath);

										fs.mkdirSync(recoPath);

										fileUtils.extractZip(exportfilepath, recoPath)
											.then(function (err) {
												if (err) {
													done();
												} else {
													console.log(' - recommendation ' + name + ' is available at ' + recoPath);
													done(true);
												}
											});

									} else {
										console.error('ERROR: Failed to download, status=' + response.statusCode);
										done();
									}
								});
							}
						} else if (status && status === 'FAILED') {
							clearInterval(inter);
							// console.log(data);
							console.error('ERROR: export failed: ' + data.errorDescription);
							clearInterval(inter);
							done();
						} else if (status && status === 'INPROGRESS') {
							console.info(' - export job in progress...');
						}

					})
						.catch((error) => {
							if (error) {
								console.error(error);
							}
							done();
						});

				}, 5000);

			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});

};

var _zipRecommendation = function (srcPath, fileName) {
	return new Promise(function (resolve, reject) {
		//
		// create the content zip file
		//
		var exportzippath = path.join(srcPath, 'export.zip');
		gulp.src([srcPath + '/**', '!' + exportzippath])
			.pipe(zip(fileName))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', function () {
				var zippath = path.join(projectDir, 'dist', fileName);
				return resolve({
					zipPath: zippath
				});
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
		console.error('ERROR: recommendation folder ' + recommendationPath + ' does not exist');
		done();
		return;
	}

	var recommendation;
	var repositories;
	var repository;

	var fileName = name + '_export.zip';
	var fileId;

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
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
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}
				console.info(' - verify repository');

				return _zipRecommendation(recommendationPath, fileName);
			})
			.then(function (result) {
				if (!result || !result.zipPath) {
					return Promise.reject();
				}

				var zipPath = result.zipPath;
				console.info(' - created file ' + zipPath);

				// upload file
				return serverRest.createFile({
					server: server,
					parentID: 'self',
					filename: fileName,
					contents: fs.createReadStream(zipPath)
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}
				fileId = result.id;
				console.info(' - upload file ' + result.name + ' (Id: ' + fileId + ' version: ' + result.version + ')');

				return serverRest.importContent({
					server: server,
					fileId: fileId,
					repositoryId: repository.id,
					update: true
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.jobId) {
					return Promise.reject();
				}

				var jobId = result.jobId;
				console.info(' - submit import job (' + jobId + ')');

				var importEcid = result.ecid;

				// Wait for job to finish
				var inter = setInterval(function () {
					var checkExportStatusPromise = serverRest.getContentJobStatus({
						server: server,
						jobId: jobId
					});
					checkExportStatusPromise.then(function (result) {
						if (result.status !== 'success') {
							clearInterval(inter);
							return Promise.reject();
						}

						var data = result.data;
						var status = data.status;

						if (status && status === 'SUCCESS') {
							clearInterval(inter);
							console.log(' - recommendation imported');
							// delete the zip file
							serverRest.deleteFile({
								server: server,
								fFileGUID: fileId
							}).then(function (result) {
								done(true);
							});

						} else if (status && status === 'FAILED') {
							clearInterval(inter);
							// console.log(data);
							console.error('ERROR: import failed: ' + data.errorDescription + ' (ecid: ' + importEcid + ')');
							clearInterval(inter);
							done();
						} else if (status && status === 'INPROGRESS') {
							console.info(' - import job in progress...');
						}

					})
						.catch((error) => {
							if (error) {
								console.error(error);
							}
							done();
						});

				}, 5000);
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				done();
			});
	});
};

module.exports.controlRecommendation = function (argv, done) {
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

	var action = argv.action;
	var repositoryName = argv.repository;
	var recommendationNames = argv.recommendations ? argv.recommendations.split(',') : [];
	var channelNames = argv.channels ? argv.channels.split(',') : [];

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.error(result.statusMessage);
			done();
			return;
		}

		var repository;
		var recommendations = [];

		serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName,
			fields: 'channels'
		})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.error('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				console.info(' - get repository (Id: ' + repository.id + ')');

				return serverRest.getRecommendations({
					server: server,
					repositoryId: repository.id,
					repositoryName: repository.name,
					fields: 'all'
				});

			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				var repoRecommendations = result.data || [];
				// console.log(repoRecommendations);
				recommendationNames.forEach(function (name) {
					var found = false;
					for (var i = 0; i < repoRecommendations.length; i++) {
						if (name.toLowerCase() === repoRecommendations[i].name.toLowerCase()) {
							found = true;
							recommendations.push(repoRecommendations[i]);
							break;
						}
					}
					if (!found) {
						console.error('ERROR: recommendation ' + name + ' does not exist');
					}
				});

				if (recommendations.length === 0) {
					return Promise.reject();
				}

				var actionPromise = action === 'publish' || action === 'unpublish' ?
					_publishUnpublishRecommendation(server, recommendations, channelNames, action) :
					_updateRecommendation(server, repository, recommendations, channelNames, action);

				return actionPromise;
			})
			.then(function (result) {
				if (result.err) {
					done();
				} else {
					done(true);
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

// update recommendation to add/remove channels
var _updateRecommendation = function (server, repository, recommendations, channelNames, action) {
	return new Promise(function (resolve, reject) {
		var channelIds = [];
		var goodChannelNames = [];

		var channelPromises = [];
		channelNames.forEach(function (channelName) {
			channelPromises.push(serverRest.getChannelWithName({
				server: server,
				name: channelName
			}));
		});

		Promise.all(channelPromises)
			.then(function (results) {
				// console.log(results);
				channelNames.forEach(function (channelName) {
					var channel;
					var channelExist = false;
					var i;
					for (i = 0; i < results.length; i++) {
						channel = results[i] && results[i].data;
						if (channel && channel.name && channel.name.toLowerCase() === channelName.toLowerCase()) {
							channelExist = true;
							break;
						}
					}

					if (!channelExist) {
						console.error('ERROR: channel ' + channelName + ' does not exist');
					} else {
						// check if the channel is added to the repository
						var channelInRepo = false;
						for (i = 0; i < repository.channels.length; i++) {
							if (channel.id === repository.channels[i].id) {
								channelInRepo = true;
								break;
							}
						}
						if (!channelInRepo) {
							console.error('ERROR: channel ' + channelName + ' is not a publishing channel for repository ' + repository.name);
						} else {
							channelIds.push(channel.id);
							goodChannelNames.push(channel.name);
						}
					}
				});

				var updateRecommendationPromises = [];

				if (channelIds.length === 0) {
					console.error('ERROR: no channel to ' + (action === 'add-channel' ? 'add' : 'remove'));
					return Promise.reject();

				} else {
					console.info(' - channels to ' + action.substring(0, action.indexOf('-')) + ': ' + goodChannelNames);

					recommendations.forEach(function (recommendation) {

						if (action === 'add-channel') {
							updateRecommendationPromises.push(serverRest.addChannelToRecommendation({
								server: server,
								recommendation: recommendation,
								channelIds: channelIds
							}));
						} else if (action === 'remove-channel') {
							updateRecommendationPromises.push(serverRest.removeChannelFromRecommendation({
								server: server,
								recommendation: recommendation,
								channelIds: channelIds
							}));
						}

					});
				}

				return Promise.all(updateRecommendationPromises);
			})
			.then(function (results) {
				var err;
				recommendations.forEach(function (recommendation) {
					var found = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i] && results[i].id === recommendation.id) {
							found = true;
							break;
						}
					}

					if (found) {
						console.log(' - channel ' + goodChannelNames + ' ' +
							(action === 'add-channel' ? 'added to recommendation ' : 'removed from recommendation ') + recommendation.name);
					} else {
						err = 'err';
					}
				});

				resolve({
					err: err
				});

			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};

// update recommendation to add/remove channels
var _publishUnpublishRecommendation = function (server, recommendations, channelNames, action) {
	return new Promise(function (resolve, reject) {
		var channels = [];
		var recommendationsToAct = [];

		var channelPromises = [];
		channelNames.forEach(function (channelName) {
			channelPromises.push(serverRest.getChannelWithName({
				server: server,
				name: channelName
			}));
		});

		Promise.all(channelPromises)
			.then(function (results) {
				channelNames.forEach(function (channelName) {
					var channel;
					var channelExist = false;
					for (var i = 0; i < results.length; i++) {
						channel = results[i] && results[i].data;
						if (channel && channel.name && channel.name.toLowerCase() === channelName.toLowerCase()) {
							channelExist = true;
							break;
						}
					}

					if (!channelExist) {
						console.error('ERROR: channel ' + channelName + ' does not exist');
					} else {
						channels.push(channel);
					}
				});

				if (channelNames.length > 0 && channels.length === 0) {
					// no valid channel
					console.error('ERROR: no channel to ' + action);
					return Promise.reject();
				}

				// check if the channels are added to the recommendations
				recommendations.forEach(function (recommendation) {
					var recoChannels = recommendation.channels || [];
					var channelsToAct = [];
					var goodChannelNames = [];

					if (channelNames.length > 0) {
						for (var i = 0; i < channels.length; i++) {
							var found = false;
							for (var j = 0; j < recoChannels.length; j++) {
								if (channels[i].id === recoChannels[j].id) {
									found = true;
									break;
								}
							}
							if (!found) {
								console.error('ERROR: channel ' + channels[i].name + ' is not a publishing channel for recommendation ' + recommendation.name);
							} else {
								channelsToAct.push({
									id: channels[i].id
								});
								goodChannelNames.push(channels[i].name);
							}
						}
					} else {
						// no channel specified, action on all channels added to the recommendation
						channelsToAct = recoChannels;
					}

					if (channelsToAct.length === 0) {
						console.error('ERROR: no channel to ' + action + ' recommendation ' + recommendation.name);
					} else {
						recommendation.channelsToAct = channelsToAct;
						recommendation.goodChannelNames = goodChannelNames;
						recommendationsToAct.push(recommendation);
					}
				});

				if (recommendationsToAct.length === 0) {
					return Promise.reject();
				}

				var err;
				var doRecommendationAction = recommendationsToAct.reduce(function (recoPromise, recommendation) {
					return recoPromise.then(function (result) {
						var channelPromises = [];
						for (var i = 0; i < recommendation.channelsToAct.length; i++) {
							channelPromises.push(serverRest.getChannel({
								server: server,
								id: recommendation.channels[i].id
							}));
						}
						Promise.all(channelPromises)
							.then(function (results) {
								// get the name of channels to act on (in case of all recommendation channels)
								for (var i = 0; i < recommendation.channelsToAct.length; i++) {
									for (var j = 0; j < results.length; j++) {
										if (results[j] && results[j].name && recommendation.channelsToAct[i].id === results[j].id) {
											if (!recommendation.goodChannelNames.includes(results[j].name)) {
												recommendation.goodChannelNames.push(results[j].name);
											}
										}
									}
								}

								var actionPromise = action === 'publish' ?
									serverRest.publishRecommendation({
										server: server,
										id: recommendation.id,
										name: recommendation.name,
										channels: recommendation.channelsToAct
									}) : serverRest.unpublishRecommendation({
										server: server,
										id: recommendation.id,
										name: recommendation.name,
										channels: recommendation.channelsToAct
									});

								actionPromise.then(function (result) {
									if (result.err) {
										err = 'err';
									} else {
										if (action === 'publish') {
											console.log(' - recommendation ' + recommendation.name + ' published to channel ' + recommendation.goodChannelNames.sort());
										} else {
											console.log(' - recommendation ' + recommendation.name + ' unpublished from channel ' + recommendation.goodChannelNames.sort());
										}
									}
								});
							});
					});
				},
				// Start with a previousPromise value that is a resolved promise
				Promise.resolve({}));

				doRecommendationAction.then(function (result) {
					resolve({
						err: err
					});
				});
			})
			.catch((error) => {
				if (error) {
					console.error(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};