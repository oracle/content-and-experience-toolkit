/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
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
	path = require('path'),
	sprintf = require('sprintf-js').sprintf,
	zip = require('gulp-zip');

var Client = require('node-rest-client').Client;

var projectDir,
	contentSrcDir,
	serversSrcDir,
	templatesSrcDir;

/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function (argv) {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	contentSrcDir = path.join(srcfolder, 'content');
	serversSrcDir = path.join(srcfolder, 'servers');
	templatesSrcDir = path.join(srcfolder, 'templates');

	return true;
};

var _cmdEnd = function (done, success) {
	done(success);
};

module.exports.downloadContent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var publishedassets = typeof argv.publishedassets === 'string' && argv.publishedassets.toLowerCase() === 'true';

	var serverName = argv.server;
	var server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}
	console.log(' - server: ' + server.url);

	var channel = argv.channel;

	if (!channel) {
		console.error('ERROR: please run as npm run export-server-content -- --channel <channel name> [--output <the folder for the export zip file>]');
		done();
		return;
	}

	_downloadContent(server, channel, publishedassets).then(function (result) {
		if (result && result.err) {
			done();
		} else {
			done(true);
		}
	});
};

var _downloadContent = function (server, channel, publishedassets) {
	return new Promise(function (resolve, reject) {
		var destdir = path.join(projectDir, 'dist');
		if (!fs.existsSync(destdir)) {
			fs.mkdirSync(destdir);
		}

		var request = _getRequest();

		var channelsPromise = _getChannelsFromServer(server);
		channelsPromise.then(function (result) {
			// console.log(result);
			var channels = result && result.channels || [];
			var channelId = '';
			var channelName = '';
			var channelToken = '';
			for (var i = 0; i < channels.length; i++) {
				// supports channel id or name
				if (channels[i].id === channel || channels[i].name.toLowerCase() === channel.toLowerCase()) {
					channelId = channels[i].id;
					channelName = channels[i].name;
					channelToken = channels[i].token;
					break;
				}
			}

			if (!channelId) {
				console.log('ERROR: channel ' + channel + ' does not exist');
				return resolve({
					err: 'err'
				});
			}

			console.log(' - validate channel ' + channelName + ' (id: ' + channelId + ')');

			var exportfilepath = path.join(destdir, channelName + '_export.zip');

			var exportPromise = _exportChannelContent(request, server, channelId, channelName, publishedassets, exportfilepath);
			exportPromise.then(function (result) {
				if (result.err) {
					return resolve({
						err: result.err
					});
				}

				if (!fs.existsSync(contentSrcDir)) {
					fs.mkdirSync(contentSrcDir);
				}

				// unzip to src/content
				var contentPath = path.join(contentSrcDir, channelName);
				if (fs.existsSync(contentPath)) {
					fse.removeSync(contentPath);
				}
				fs.mkdirSync(contentPath);

				extract(exportfilepath, {
					dir: contentPath
				}, function (err) {
					if (err) {
						return resolve({
							err: 'err'
						});
					} else {
						console.log(' - ' + (publishedassets ? 'published' : 'all') + ' assets from channel ' + channelName + ' are available at ' + contentPath);
						resolve({
							channelId: channelId,
							channeName: channelName
						});
					}
				});

			});

		});
	});
};

var _getRequest = function () {
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
	return request;
};

/**
 * Get channels from server
 */
var _getChannelsFromServer = function (server) {
	var channelsPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'err'
			});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/channels?limit=99999';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200 && data) {
				var channels = [];
				if (data.channels) {
					for (var i = 0; i < data.channels.length; i++) {
						var channel = data.channels[i];
						var tokens = channel.tokens;
						var token;
						if (tokens && tokens.length > 0) {
							if (tokens.length === 1) {
								token = tokens[0].channelToken;
							} else if (tokens.length > 0)
								for (var j = 0; j < tokens.length; j++) {
									if (tokens[j].tokenName === 'defaultToken') {
										token = tokens[j].channelToken;
										break;
									}
								}
							if (!token) {
								token = tokens[0].channelToken;
							}
						}
						channels.push({
							'id': channel.id,
							'name': channel.name,
							'token': token
						});
					}
					return resolve({
						channels
					});
				} else if (data.items) {
					var channelPromises = [];
					for (var i = 0; i < data.items.length; i++) {
						channelPromises[i] = _getChannelDetailsFromServer(server, data.items[i].id);
					}
					Promise.all(channelPromises).then(function (values) {
						for (var i = 0; i < values.length; i++) {
							var channel = values[i];
							if (channel && channel.channelTokens) {
								var token;
								var tokens = channel.channelTokens;
								if (tokens && tokens.length === 1) {
									token = tokens[0].token;
								} else if (tokens && tokens.length > 0) {
									for (var j = 0; j < tokens.length; j++) {
										if (tokens[j].name === 'defaultToken') {
											token = tokens[j].token;
											break;
										}
									}
									if (!token) {
										token = tokens[0].channelToken;
									}
								}

								channels.push({
									'id': channel.id,
									'name': channel.name,
									'token': token
								});
							}
						}

						return resolve({
							channels
						});
					});
				}

			} else {
				console.log('status=' + response && response.statusCode);
				return resolve({
					err: 'err'
				});
			}
		});

	});
	return channelsPromise;
};



var _getChannelDetailsFromServer = function (server, channelId) {
	var channelPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/channels/' + channelId;
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200 && data) {
				return resolve(data);
			} else {
				// console.log(' - ' + (data ? (data.detail || data.title) : 'failed to get channel: id=' + channelId));
				return resolve({});
			}
		});
	});
	return channelPromise;
};

/**
 * Call CAAS to create and export content template
 * @param {*} channelId 
 */
var _exportChannelContent = function (request, server, channelId, channelName, publishedassets, exportfilepath) {
	var exportPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'err'
			});
		}

		var auth = {
			user: server.username,
			password: server.password
		};
		// Get CSRF token
		var csrfTokenPromise = new Promise(function (resolve, reject) {
			var tokenUrl = server.url + '/content/management/api/v1.1/token';

			var options = {
				url: tokenUrl,
				'auth': auth
			};
			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get CSRF token');
					console.log(err);
					return resolve({
						err: 'err'
					});
				}
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					return resolve(data);
				} else {
					console.log('ERROR: Failed to get CSRF token, status=' + response.statusCode);
					return resolve({
						err: 'err'
					});
				}
			});
		});

		csrfTokenPromise.then(function (result) {
			var csrfToken = result && result.token;
			if (!csrfToken) {
				// console.log('ERROR: Failed to get CSRF token');
				return resolve({
					err: 'err'
				});
			}
			console.log(' - get CSRF token');

			var url = server.url + '/content/management/api/v1.1/content-templates/exportjobs';
			var contentTemplateName = 'contentexport';
			var postData = {
				'name': contentTemplateName,
				'channelIds': [{
					'id': channelId
				}],
				'exportPublishedItems': publishedassets ? 'true' : 'false'
			};

			var options = {
				method: 'POST',
				url: url,
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest'
				},
				auth: auth,
				body: JSON.stringify(postData)
			};
			// console.log(JSON.stringify(options));

			request(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to export');
					console.log(err);
					resolve({
						err: 'err'
					});
				}
				if (response && (response.statusCode === 200 || response.statusCode === 201)) {
					var data = JSON.parse(body);
					var jobId = data && data.jobId;
					if (!jobId) {
						return resolve({
							err: 'err'
						});
					}
					console.log(' - submit export job');

					// Wait for job to finish
					var inter = setInterval(function () {
						var checkExportStatusPromise = _checkJobStatus(request, server, jobId);
						checkExportStatusPromise.then(function (result) {
							if (result.status !== 'success') {
								return resolve({
									err: 'err'
								});
							}

							var data = result.data;
							var status = data.status;
							// console.log(data);
							if (status && status === 'SUCCESS') {
								clearInterval(inter);
								var downloadLink = data.downloadLink[0].href;
								if (downloadLink) {
									options = {
										url: downloadLink,
										auth: auth,
										headers: {
											'Content-Type': 'application/zip'
										},
										encoding: null
									};
									//
									// Download the export zip
									request.get(options, function (err, response, body) {
										if (err) {
											console.log('ERROR: Failed to download');
											console.log(err);
											return resolve({
												err: 'err'
											});
										}
										if (response && response.statusCode === 200) {
											console.log(' - download export file');
											fs.writeFileSync(exportfilepath, body);
											console.log(' - save export to ' + exportfilepath);

											return resolve({});
										} else {
											console.log('ERROR: Failed to download, status=' + response.statusCode);
											return resolve({
												err: 'err'
											});
										}
									});
								}
							} else if (status && status === 'FAILED') {
								clearInterval(inter);
								console.log('ERROR: export failed: ' + data.errorDescription);
								return resolve({
									err: 'err'
								});
							} else if (status && status === 'INPROGRESS') {
								console.log(' - export job in progress...');
							}

						});

					}, 5000);

				} else {
					console.log(' - failed to export: ' + response.statusCode);
					console.log(body);
					return resolve({
						err: 'err'
					});
				}
			});
		});
	});
	return exportPromise;
};

/**
 * private
 */
var _checkJobStatus = function (request, server, jobId) {
	var checkExportStatusPromise = new Promise(function (resolve, reject) {
		var statusUrl = server.url + '/content/management/api/v1.1/content-templates/exportjobs/' + jobId;
		var auth = {
			user: server.username,
			password: server.password
		};
		var options = {
			url: statusUrl,
			'auth': auth
		};
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get export job status');
				console.log(err);
				return resolve({
					status: 'err'
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				return resolve({
					status: 'success',
					data: data
				});
			} else {
				console.log('ERROR: Failed to get export job status: ' + response.statusCode);
				return resolve({
					status: response.statusCode
				});
			}
		});
	});
	return checkExportStatusPromise;
};

var _uploadContentFromZip = function (args) {
	var contentpath = args.contentpath,
		contentfilename = args.contentfilename;
	return new Promise(function (resolve, reject) {
		//
		// create the content zip file
		// 
		var exportzippath = path.join(contentpath, 'export.zip');
		gulp.src([contentpath + '/**', '!' + exportzippath])
			.pipe(zip(contentfilename))
			.pipe(gulp.dest(path.join(projectDir, 'dist')))
			.on('end', function () {
				var zippath = path.join(projectDir, 'dist', contentfilename);
				console.log(' - created content file ' + zippath);
				args.zippath =zippath;
				_uploadContentFromZipFile(args).then(function (result) {
					return resolve(result);
				});
			});
	});
};

var _uploadContentFromZipFile = function (args) {
	var server = args.server,
		contentpath = args.contentpath,
		contentfilename = args.contentfilename,
		zippath = args.zippath,
		repositoryName = args.repositoryName,
		repositoryId = args.repositoryId,
		channelName = args.channelName,
		channelId = args.channelId,
		collectionName = args.collectionName,
		collectionId = args.collectionId,
		updateContent = args.updateContent,
		errorMessage;

	var request = _getRequest();

	return new Promise(function (resolve, reject) {

		// 
		// upload content zip file
		//
		var createFilePromise = serverRest.createFile({
			server: server,
			parentID: 'self',
			filename: contentfilename,
			contents: fs.readFileSync(zippath)
		});

		var contentZipFileId;

		createFilePromise.then(function (result) {
				if (!result || !result.id) {
					errorMessage = 'Error: failed to upload zip file to server.';
					console.log(errorMessage);
					return resolve({
						err: errorMessage
					});
				}

				contentZipFileId = result.id;
				// console.log(' - file uploaded, id: ' + contentZipFileId + ' version: ' + result.version);
				console.log(' - upload content file ' + zippath);

				return serverUtils.getCaasCSRFToken(server);
			})
			.then(function (result) {
				if (result.err) {
					return resolve(result);
				}
				var token = result && result.token;
				console.log(' - get CSRF token');

				var importPromise = _importContent(request, server, token, contentZipFileId, repositoryId, channelId, collectionId, updateContent);
				var importSuccess = false;
				importPromise.then(function (result) {
					if (!result.err) {
						console.log(' - content imported:');
						var format = '   %-15s %-s';
						if (typeof repositoryName === 'string') {
							console.log(sprintf(format, 'repository', repositoryName));
						}
						if (typeof collectionName === 'string') {
							console.log(sprintf(format, 'collection', collectionName));
						}
						if (typeof channelName === 'string') {
							console.log(sprintf(format, 'channel', channelName));
						}
						importSuccess = true;
					}
					// delete the zip file
					var deleteFilePromise = serverRest.deleteFile({
						server: server,
						fFileGUID: contentZipFileId
					});
					deleteFilePromise.then(function (result) {
						// all done
						return importSuccess ? resolve({}) : resolve({
							err: 'err'
						});
					});
				});
			});
	});
};
module.exports.uploadContent = function (argv, done) {
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

	console.log(' - server: ' + server.url);

	var name = argv.name;
	var contentpath;
	var contentfilename;

	var isTemplate = typeof argv.template === 'string' && argv.template.toLowerCase() === 'true';
	var isFile = typeof argv.file === 'string' && argv.file.toLowerCase() === 'true';
	var filePath, fileChannelName;
	if (isFile) {
		filePath = name;
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(projectDir, filePath);
		}
		filePath = path.resolve(filePath);

		if (!fs.existsSync(filePath)) {
			console.log('ERROR: file ' + filePath + ' does not exist');
			done();
			return;
		}
		contentpath = filePath.substring(0, filePath.lastIndexOf('/'));
		contentfilename = filePath.substring(filePath.lastIndexOf('/') + 1);
		fileChannelName = contentfilename.substring(0, contentfilename.indexOf('.'));

	} else if (isTemplate) {
		var templatepath = path.join(templatesSrcDir, name);
		if (!fs.existsSync(templatepath)) {
			console.log('ERROR: template folder ' + templatepath + ' does not exist');
			done();
			return;
		}

		// check if the template has content
		contentpath = path.join(templatepath, 'assets', 'contenttemplate');
		if (!fs.existsSync(contentpath)) {
			console.log('ERROR: template ' + name + ' does not have content');
			done();
			return;
		}
		contentfilename = name + '_export.zip';
	} else {
		contentpath = path.join(contentSrcDir, name);
		if (!fs.existsSync(contentpath)) {
			console.log('ERROR: content folder ' + contentpath + ' does not exist');
			done();
			return;
		}
		contentfilename = name + '.zip';
	}

	var repositoryName = argv.repository;
	var channelName = argv.channel || (isFile ? fileChannelName : name);
	var collectionName = argv.collection;
	var updateContent = typeof argv.update === 'string' && argv.update.toLowerCase() === 'true';

	var createZip = isFile ? false : true;
	_uploadContent(server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip)
		.then(function (result) {
			if (result && result.err) {
				done();
			} else {
				done(true);
			}
		});
};

var _uploadContent = function (server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip) {
	return new Promise(function (resolve, reject) {
		var request = _getRequest();

		var repository, repositoryId;
		var channelId;
		var collectionId;

		var getCollectionsPromises = [];
		var createChannelPromises = [];
		var addChannelToRepositoryPromises = [];

		var repositoryPromise = serverUtils.getRepositoryFromServer(request, server, repositoryName);
		repositoryPromise.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				repository = result.data;
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				repositoryId = repository.id;
				console.log(' - get repository');

				if (collectionName) {
					getCollectionsPromises.push(serverUtils.getRepositoryCollections(request, server, repositoryId));
				}
				return Promise.all(getCollectionsPromises);
			})
			.then(function (results) {
				//
				// get collections in the repository
				//
				if (results.length > 0) {
					if (results[0].err) {
						return Promise.reject();
					}

					var collections = results[0] && results[0].data;
					for (var i = 0; i < collections.length; i++) {
						if (collections[i].name.toLowerCase() === collectionName.toLowerCase()) {
							collectionId = collections[i].id;
							break;
						}
					}

					if (!collectionId) {
						console.log('ERROR: collection ' + collectionName + ' does not exist in repository ' + repositoryName);
						return Promise.reject();
					}

					console.log(' - get collection');
				}

				return _getChannelsFromServer(server);

			})
			.then(function (result) {
				//
				// Get channel
				//
				if (!result || result.err) {
					return Promise.reject();
				}

				var channels = result.channels || [];
				for (var i = 0; i < channels.length; i++) {
					if (channels[i].name.toLowerCase() === channelName.toLowerCase()) {
						channelId = channels[i].id;
						break;
					}
				}

				if (!channelId) {
					// need to create the channel first
					createChannelPromises.push(serverRest.createChannel({
						server: server,
						name: channelName
					}));
				} else {
					console.log(' - get channel');
				}

				return Promise.all(createChannelPromises);
			})
			.then(function (results) {
				//
				// Create channel
				//
				if (results.length > 0) {
					if (results[0].err) {
						return Promise.reject();
					}

					console.log(' - create channel ' + channelName);
					channelId = results[0] && results[0].id;
				}

				// check if the channel is associated with the channel
				var repositoryChannels = repository.channels || [];
				var channelInRepository = false;
				for (var i = 0; i < repositoryChannels.length; i++) {
					if (repositoryChannels[i].id === channelId) {
						channelInRepository = true;
						break;
					}
				}

				if (!channelInRepository) {
					addChannelToRepositoryPromises.push(serverRest.addChannelToRepository({
						server: server,
						id: channelId,
						name: channelName,
						repository: repository
					}));
				}

				return Promise.all(addChannelToRepositoryPromises);
			})
			.then(function (results) {
				//
				// add channel to repository
				//
				if (results.length > 0) {
					if (results[0].err) {
						return Promise.reject();
					}

					console.log(' - add channel ' + channelName + ' to repository ' + repositoryName);
				}

				var args = {
					server: server,
					contentpath: contentpath,
					contentfilename: contentfilename,
					zippath: path.join(contentpath, contentfilename),
					projectDir: projectDir,
					repositoryName: repositoryName,
					repositoryId: repositoryId,
					channelName: channelName,
					channelId: channelId,
					collectionName: collectionName,
					collectionId: collectionId,
					updateContent: updateContent
				};
				var uploadPromize = createZip ? _uploadContentFromZip(args) : _uploadContentFromZipFile(args);

				uploadPromize.then(function (result) {
					if (result.err) {
						return resolve({
							err: 'err'
						});
					} else {
						return resolve({});
					}
				});
			}) // get repository
			.catch((error) => {
				return resolve({
					err: 'err'
				});
			});

	});
};

var _importContent = function (request, server, csrfToken, contentZipFileId, repositoryId, channelId, collectionId, updateContent) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/content-templates/importjobs';

		var auth = {
			user: server.username,
			password: server.password
		};

		var postData = {
			'exportDocId': contentZipFileId,
			'repositoryId': repositoryId,
			'channelIds': [channelId],
		};

		if (updateContent) {
			// update the existing content items (if any) instead of creating new ones
			postData.source = 'sites';
		}

		if (collectionId) {
			postData.collections = [collectionId];
		}

		var options = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': csrfToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest'
			},
			auth: auth,
			body: JSON.stringify(postData)
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to import');
				console.log(err);
				resolve({
					err: 'err'
				});
			}
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var data = JSON.parse(body);
				var jobId = data && data.jobId;
				if (!jobId) {
					return resolve({
						err: 'err'
					});
				}
				console.log(' - submit import job' + (updateContent ? ', updating content' : ''));

				// Wait for job to finish
				var inter = setInterval(function () {
					var checkImportStatusPromise = _checkJobStatus(request, server, jobId);
					checkImportStatusPromise.then(function (result) {
						if (result.status !== 'success') {
							return resolve({
								err: 'err'
							});
						}

						var data = result.data;
						var status = data.status;

						if (status && status === 'SUCCESS') {
							clearInterval(inter);
							return resolve({});
						} else if (!status || status === 'FAILED') {
							clearInterval(inter);
							console.log('ERROR: import failed: ' + data.errorDescription);
							return resolve({
								err: 'err'
							});
						} else if (status && status === 'INPROGRESS') {
							console.log(' - import job in progress...');
						}
					});

				}, 5000);
			} else {
				console.log(' - failed to import: ' + response.statusCode);
				console.log(body);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return importPromise;
};
module.exports.uploadContentFromTemplate = function (args) {
	var projectDir = args.projectDir,
		registeredServerName = args.registeredServerName,
		siteInfo = args.siteInfo,
		templateName = args.templateName,
		updateContent = args.updateContent;

	verifyRun({
		projectDir: projectDir
	});

	var server = serverUtils.verifyServer(registeredServerName, projectDir);
	if (!server || !server.valid) {
		return Promise.resolve({
			err: 'Invalid server'
		});
	}

	var contentpath;
	var contentfilename;

	var templatepath = path.join(templatesSrcDir, templateName);
	var errorMessage;

	if (!fs.existsSync(templatepath)) {
		errorMessage = 'ERROR: template folder ' + templatepath + ' does not exist';
		console.log(errorMessage);
		return Promise.resolve({
			err: errorMessage
		});
	}

	// check if the template has content
	contentpath = path.join(templatepath, 'assets', 'contenttemplate');
	if (!fs.existsSync(contentpath)) {
		errorMessage = 'ERROR: template ' + templateName + ' does not have content';
		console.log(errorMessage);
		return Promise.resolve({
			err: errorMessage
		});
	}
	contentfilename = templateName + '_export.zip';

	return _uploadContentFromZip({
		server: server,
		contentpath: contentpath,
		contentfilename: contentfilename,
		projectDir: projectDir,
		repositoryId: siteInfo.repositoryId,
		channelId: siteInfo.channelId,
		collectionId: siteInfo.arCollectionId,
		updateContent: updateContent
	}).then(function (result) {
		if (result.err) {
			console.log(' - failed to upload content');
			console.log(result.err);
		}
		return Promise.resolve({
			error: result.err
		});
	});
};

module.exports.controlContent = function (argv, done, sucessCallback, errorCallback) {
	'use strict';

	var cmdEnd = errorCallback ? errorCallback : _cmdEnd,
		cmdSuccess = sucessCallback ? sucessCallback : _cmdEnd;

	try {
		if (!verifyRun(argv)) {
			return cmdEnd(done);
		}

		var serverName = argv.server;
		var server = serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		console.log(' - server: ' + server.url);

		var channelName = argv.channel;
		var action = argv.action;

		var request = serverUtils.getRequest();

		var channel, channelToken;
		var itemIds = [];
		var toPublishItemIds = [];
		var hasPublishedItems = false;

		var chanelsPromise = serverRest.getChannels({
			server: server
		});
		chanelsPromise.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var channels = result || [];
				var channelId;
				for (var i = 0; i < channels.length; i++) {
					if (channelName.toLowerCase() === channels[i].name.toLowerCase()) {
						channelId = channels[i].id;
						break;
					}
				}

				if (!channelId) {
					console.log('ERROR: channel ' + channelName + ' does not exist');
					return Promise.reject();
				}

				//
				// get channel detail
				//
				return serverRest.getChannel({
					server: server,
					id: channelId
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				channel = result;
				var tokens = channel.channelTokens;
				for (var i = 0; i < tokens.length; i++) {
					if (tokens[i].name === 'defaultToken') {
						channelToken = tokens[i].token;
						break;
					}
				}
				if (!channelToken && tokens.length > 0) {
					channelToken = tokens[0].token;
				}

				console.log(' - get channel (token: ' + channelToken + ')');

				//
				// get items in the channel
				//
				return serverRest.getChannelItems({
					server: server,
					channelToken: channelToken,
					fields: 'isPublished,status'
				});
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				var items = result || [];
				if (items.length === 0) {
					console.log(' - no item in the channel');
					return cmdSuccess(done);
				}

				console.log(' - channel has ' + items.length + (items.length > 1 ? ' items' : ' item'));

				// publish policy: anythingPublished | onlyApproved
				var publishPolicy = channel.publishPolicy;
				if (action === 'publish') {
					console.log(' - publish policy: ' + (publishPolicy === 'onlyApproved' ? 'only approved items can be published' : 'anything can be published'));
				}

				for (var i = 0; i < items.length; i++) {
					var item = items[i];

					// all items include rejected, use for unpublish / remove
					itemIds.push(item.id);

					if (publishPolicy === 'onlyApproved') {
						if (item.status === 'approved') {
							toPublishItemIds.push(item.id);
						}
					} else {
						if (item.status !== 'rejected' && item.status !== 'published') {
							toPublishItemIds.push(item.id);
						}
					}

					if (item.isPublished) {
						hasPublishedItems = true;
					}
				}

				if (action === 'publish' && toPublishItemIds.length === 0) {
					console.log(' - no item to publish');
					return Promise.reject();
				}

				if (action === 'unpublish' && !hasPublishedItems) {
					console.log(' - all items are already draft');
					return Promise.reject();
				}

				if (action === 'publish') {
					var opPromise = _performOneOp(server, action, channel.id, toPublishItemIds, true);
					opPromise.then(function (result) {
						if (result.err) {
							return cmdEnd(done);
						} else {
							return cmdSuccess(done, true);
						}
					});

				} else if (action === 'unpublish') {
					var opPromise = _performOneOp(server, action, channel.id, itemIds, true);
					opPromise.then(function (result) {
						if (result.err) {
							return cmdEnd(done);
						} else {
							return cmdSuccess(done, true);
						}
					});

				} else if (action === 'remove') {
					var unpublishPromises = [];
					if (hasPublishedItems) {
						unpublishPromises.push(_performOneOp(server, 'unpublish', channel.id, itemIds, false));
					}
					Promise.all(unpublishPromises).then(function (result) {
						// continue to remove
						var removePromise = _performOneOp(server, action, channel.id, itemIds, true);
						removePromise.then(function (result) {
							if (result.err) {
								console.log('ERROR: removing items from channel');
								return cmdEnd(done);
							}
							console.log(' - ' + itemIds.length + ' items removed from channel');
							return cmdSuccess(done, true);
						});
					});
				} else {
					console.log('ERROR: action ' + action + ' not supported');
					return cmdEnd(done);
				}
			})
			.catch((error) => {
				cmdEnd(done);
			});

	} catch (e) {
		console.log(e);
		return cmdEnd(done);
	}
};

var _performOneOp = function (server, action, channelId, itemIds, showerror) {
	return new Promise(function (resolve, reject) {
		var opPromise;
		if (action === 'publish') {
			opPromise = serverRest.publishChannelItems({
				server: server,
				channelId: channelId,
				itemIds: itemIds
			});
		} else if (action === 'unpublish') {
			opPromise = serverRest.unpublishChannelItems({
				server: server,
				channelId: channelId,
				itemIds: itemIds
			});
		} else {
			opPromise = serverRest.removeItemsFromChanel({
				server: server,
				channelId: channelId,
				itemIds: itemIds
			});
		}
		opPromise.then(function (result) {
			if (result.err) {
				return resolve({
					err: 'err'
				});
			}

			if (action === 'remove') {
				return resolve({});
			} else {
				//
				// wait the action to finish
				//
				var statusId = result && result.statusId;
				if (!statusId) {
					console.log('ERROR: failed to submit operation ' + action);
					return resolve({
						err: 'err'
					});
				}

				console.log(' - submit operation ' + action);

				var inter = setInterval(function () {
					var jobPromise = serverRest.getItemOperationStatus({
						server: server,
						statusId: statusId
					});
					jobPromise.then(function (data) {
						if (!data || data.error || data.progress === 'failed') {
							clearInterval(inter);
							var msg = data && data.error ? (data.error.detail ? data.error.detail : data.error.title) : '';
							if (showerror) {
								console.log('ERROR: ' + action + ' failed: ' + msg);
								if (data && data.error && data.error.validation) {
									_displayValidation(data.error.validation, action);
								}
							}
							return resolve({
								err: 'err'
							});
						}
						if (data.completed) {
							clearInterval(inter);
							console.log(' - ' + action + 'ed ' + itemIds.length + ' items');
							return resolve({});
						} else {
							console.log(' - ' + action + ' in process: percentage ' + data.completedPercentage);
						}
					});
				}, 6000);
			}
		});
	});
};

var _displayValidation = function (validations, action) {
	var policyValidation;
	for (var i = 0; i < validations.length; i++) {
		var val = validations[i];
		Object.keys(val).forEach(function (key) {
			if (key === 'policyValidation') {
				policyValidation = val[key];
			}
		});
	}

	var variationSets = policyValidation.variationSets;
	var blockingItems = [];
	for (var i = 0; i < variationSets.length; i++) {
		var variation = variationSets[i];
		for (var j = 0; j < variation.validations.length; j++) {
			var val = variation.validations[j];
			if (val.blocking && val.results.length > 0) {
				// console.log(val.results);
				for (var k = 0; k < val.results.length; k++) {
					if (val.results[k].itemId) {
						blockingItems.push({
							id: val.results[k].itemId,
							name: val.results[k].value,
							message: val.results[k].message
						});
					}
				}
			}
		}
	}
	console.log('Failed to ' + action + ' the following items: ' + policyValidation.error);
	var format = '  %-36s  %-60s  %-s';
	console.log(sprintf(format, 'Id', 'Name', 'Message'));
	for (var i = 0; i < blockingItems.length; i++) {
		console.log(sprintf(format, blockingItems[i].id, blockingItems[i].name, blockingItems[i].message));
	}

};

//////////////////////////////////////////////////////////////////////////
//    Sync server event handlers
//////////////////////////////////////////////////////////////////////////

module.exports.syncPublishUnpublishItems = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcServer = argv.server;
	console.log(' - source server: ' + srcServer.url);

	var destServer = argv.destination;
	console.log(' - destination server: ' + destServer.url);

	var channelId = argv.id;
	var contentGuids = argv.contentGuids;
	var action = argv.action || 'publish';

	var channelName, channelIdSrc, channelIdDest;

	_getChannelsFromServer(srcServer)
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			var channels = result.channels || [];
			for (var i = 0; i < channels.length; i++) {
				if (channels[i].id === channelId) {
					channelIdSrc = channels[i].id;
					channelName = channels[i].name;
					break;
				}
			}

			if (!channelIdSrc) {
				console.log('ERROR: channel ' + channel + ' does not exist on server ' + srcServer.name);
				return Promise.reject();
			}

			console.log(' - validate channel on source server: ' + channelName + '(Id: ' + channelIdSrc + ')');

			return _getChannelsFromServer(destServer);
		})
		.then(function (result) {
			var channels = result.channels || [];
			for (var i = 0; i < channels.length; i++) {
				if (channels[i].name.toLowerCase() === channelName.toLowerCase()) {
					channelIdDest = channels[i].id;
					break;
				}
			}

			if (!channelIdDest) {
				console.log('ERROR: channel ' + channelName + ' does not exist on server ' + destServer.name);
				return Promise.reject();
			}

			console.log(' - validate channel on destination server: ' + channelName + '(Id: ' + channelIdDest + ')');

			return _performOneOp(destServer, action, channelIdDest, contentGuids, true);

		})
		.then(function (result) {
			if (result && result.err) {
				return Promise.reject();
			}

			console.log(' - items ' + (action === 'publish' ? 'published to channel ' : 'unpublished from channel ') + channelName + ' on server ' + destServer.name);
			done();
		})
		.catch((error) => {
			done();
		});

};

module.exports.syncCreateUpdateItem = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcServer = argv.server;
	console.log(' - source server: ' + srcServer.url);

	var destServer = argv.destination;
	console.log(' - destination server: ' + destServer.url);

	var id = argv.id;
	var repositoryId = argv.repositoryId;

	var item, srcRepository, destRepository;
	var srcChannel;

	// Verify item
	serverRest.getItem({
			server: srcServer,
			id: id
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			item = result;
			console.log(' - validate item on source server: name: ' + item.name + ' (type: ' + item.type + ' id: ' + item.id + ')');

			return serverRest.getRepositories({
				server: srcServer
			});
		})
		.then(function (result) {
			var repositories = result || [];
			for (var i = 0; i < repositories.length; i++) {
				if (repositories[i].id === repositoryId) {
					srcRepository = repositories[i];
					break;
				}
			}

			if (!srcRepository || !srcRepository.id) {
				console.log('ERROR: repository ' + repositoryId + ' does not exist on server ' + srcServer.name);
				return Promise.reject();
			}

			console.log(' - validate repository on source server: ' + srcRepository.name + ' (id: ' + srcRepository.id + ')');

			return serverRest.getRepositories({
				server: destServer
			});
		})
		.then(function (result) {
			var repositories = result || [];
			for (var i = 0; i < repositories.length; i++) {
				if (repositories[i].name.toLowerCase() === srcRepository.name.toLowerCase()) {
					destRepository = repositories[i];
					break;
				}
			}

			if (!destRepository || !destRepository.id) {
				console.log('ERROR: repository ' + srcRepository.name + ' does not exist on server ' + destServer.name);
				return Promise.reject();
			}

			console.log(' - validate repository on destination server: ' + destRepository.name + ' (id: ' + destRepository.id + ')');

			// create a new channel to export the item
			var channelName = 'SyncItemChannel' + serverUtils.createGUID();
			return serverRest.createChannel({
				server: srcServer,
				name: channelName
			});

		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			srcChannel = result;
			console.log(' - create channel ' + srcChannel.name);

			return serverRest.addChannelToRepository({
				server: srcServer,
				id: srcChannel.id,
				name: srcChannel.name,
				repository: srcRepository
			});

		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log(' - add channel to repository ' + srcRepository.name);

			// add item to the channel
			return serverRest.addItemsToChanel({
				server: srcServer,
				channelId: srcChannel.id,
				itemIds: [id]
			});

		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log(' - add the item to channel');

			// download content from source
			return _downloadContent(srcServer, srcChannel.id, false);
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			// delete the channel
			return serverRest.deleteChannel({
				server: srcServer,
				id: srcChannel.id
			});
		})
		.then(function (result) {
			if (!result.err) {
				console.log(' - delete channel ' + srcChannel.name + ' on server ' + srcServer.name);
			}

			// upload content to destination 
			var updateContent = true;
			var contentpath = path.join(contentSrcDir, srcChannel.name);
			var contentfilename = srcChannel.name + '.zip';
			return _uploadContent(destServer, destRepository.name, '', srcChannel.name, updateContent, contentpath, contentfilename, true);

		})
		.then(function (result) {
			// clean up local resource
			fse.removeSync(path.join(contentSrcDir, srcChannel.name));
			fse.removeSync(path.join(projectDir, 'dist', srcChannel.name + '.zip'));
			fse.removeSync(path.join(projectDir, 'dist', srcChannel.name + '_export.zip'));

			return serverRest.getChannels({
				server: destServer
			});
		})
		.then(function (result) {
			var channels = result || [];
			var channelId;
			for (var i = 0; i < channels.length; i++) {
				if (srcChannel.name.toLowerCase() === channels[i].name.toLowerCase()) {
					channelId = channels[i].id;
					break;
				}
			}
			if (channelId) {
				serverRest.deleteChannel({
					server: destServer,
					id: channelId
				}).then(function (result) {
					if (!result.err) {
						console.log(' - delete channel ' + srcChannel.name + ' on server ' + destServer.name);
					}

					console.log(' - item ' + item.name + (argv.action === 'CREATE' ? ' created ' : ' updated ') + ' on server ' + destServer.name);
					done(true);
				})
			} else {
				console.log(' - item ' + item.name + (argv.action === 'CREATE' ? ' created ' : ' updated ') + ' on server ' + destServer.name);
				done(true);
			}
		})
		.catch((error) => {
			done();
		});

};


module.exports.syncDeleteItem = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var srcServer = argv.server;
	console.log(' - source server: ' + srcServer.url);

	var destServer = argv.destination;
	console.log(' - destination server: ' + destServer.url);

	var id = argv.id;
	var name = argv.name;

	// delete
	serverRest.deleteItems({
			server: destServer,
			itemIds: [id]
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}
			var failedItems = result && result.data && result.data.operations && result.data.operations.deleteItems && result.data.operations.deleteItems.failedItems || [];
			if (failedItems.length > 0) {
				console.log('ERROR: failed to delete the item - ' + failedItems[0].message);
				done();
			} else {
				console.log(' - item ' + (name || id) + ' deleted on server ' + destServer.name);
				done(true);
			}
		})
		.catch((error) => {
			done();
		});
};