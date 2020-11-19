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
	fileUtils = require('../test/server/fileUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	sitesRest = require('../test/server/sitesRest.js'),
	documentUtils = require('./document.js').utils,
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
	templatesSrcDir;
var buildfolder;
var distFolder;

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

	buildfolder = serverUtils.getBuildFolder(projectDir);
	if (!fs.existsSync(buildfolder)) {
		fs.mkdirSync(buildfolder);
	}

	distFolder = path.join(projectDir, 'dist');
	if (!fs.existsSync(distFolder)) {
		fs.mkdirSync(distFolder);
	}

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

	/*
	if (!channel) {
		console.error('ERROR: please run as npm run export-server-content -- --channel <channel name> [--output <the folder for the export zip file>]');
		done();
		return;
	}
	*/

	var name = argv.name;

	var repositoryName = argv.repository;
	var collectionName = argv.collection;
	if (collectionName && !repositoryName) {
		console.log('ERROR: no repository is specified');
		done();
		return;
	}

	var query = argv.query;

	var assetGUIDS = argv.assets ? argv.assets.split(',') : [];

	serverUtils.loginToServer(server, serverUtils.getRequest(), true).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}
		_downloadContent(server, channel, name, publishedassets, repositoryName, collectionName, query, assetGUIDS).then(function (result) {
			if (result && result.err) {
				done();
			} else {
				done(true);
			}
		});
	});
};

var _downloadContentUtil = function (argv) {
	verifyRun(argv);
	return _downloadContent(argv.server, argv.channel, argv.name, argv.publishedassets,
		argv.repositoryName, argv.collectionName, argv.query, argv.assetGUIDS);
};

var _downloadContent = function (server, channel, name, publishedassets, repositoryName, collectionName, query, assetGUIDS) {
	return new Promise(function (resolve, reject) {
		var destdir = path.join(projectDir, 'dist');
		if (!fs.existsSync(destdir)) {
			fs.mkdirSync(destdir);
		}

		var request = serverUtils.getRequest();

		var channelId = '';
		var channelName = '';
		var repository, collection;
		var q = '';

		var channelPromises = [];
		if (channel) {
			channelPromises.push(serverRest.getChannelWithName({
				server: server,
				name: channel
			}));
		}
		Promise.all(channelPromises)
			.then(function (results) {
				// console.log(results);
				if (channel) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.log('ERROR: channel ' + channel + ' does not exist');
						return Promise.reject();
					}

					channelId = results[0].data.id;
					channelName = results[0].data.name;
					channelToken = results[0].data.token;

					if (!channelId) {
						console.log('ERROR: channel ' + channel + ' does not exist');
						return Promise.reject();
					}

					console.log(' - validate channel ' + channelName + ' (id: ' + channelId + ')');
				}

				var repositoryPromises = [];
				if (repositoryName) {
					repositoryPromises.push(serverRest.getRepositoryWithName({
						server: server,
						name: repositoryName
					}));
				}

				return Promise.all(repositoryPromises);
			})
			.then(function (results) {
				var collectionPromises = [];

				if (repositoryName) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.log('ERROR: repository ' + repositoryName + ' not found');
						return Promise.reject();
					}

					repository = results[0].data;

					console.log(' - validate repository');
					collectionPromises.push(serverRest.getCollections({
						server: server,
						repositoryId: repository.id
					}));
				}

				return Promise.all(collectionPromises);

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
						console.log('ERROR: collection ' + collectionName + ' not found in repository ' + repositoryName);
						return Promise.reject();
					}

					console.log(' - validate collection');
				}

				var queryItemPromises = [];
				if (query || repository || collection) {
					q = '';
					if (repository) {
						q = '(repositoryId eq "' + repository.id + '")';
					}
					if (collection) {
						if (q) {
							q = q + ' AND ';
						}
						q = '(collections co "' + collection.id + '")';
					}
					if (query) {
						if (q) {
							q = q + ' AND ';
						}
						q = q + '(' + query + ')';
					}
					if (channelId) {
						q = q + ' AND (channels co "' + channelId + '")';
					}
					console.log(' - query: ' + q);

					queryItemPromises.push(serverRest.queryItems({
						server: server,
						q: q
					}));
				}

				return Promise.all(queryItemPromises);

			})
			.then(function (results) {
				var guids = [];
				if (query || repository || collection) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
					var items = results[0].data || [];
					console.log(' - total items from query: ' + items.length);

					// the export items have to be in both query result and specified item list
					for (var i = 0; i < items.length; i++) {
						var add = true;
						if (assetGUIDS && assetGUIDS.length > 0) {
							add = false;
							for (var j = 0; j < assetGUIDS.length; j++) {
								if (items[i].id === assetGUIDS[j]) {
									add = true;
									break;
								}
							}
						}

						if (add) {
							guids.push(items[i].id);
						}
					}
				} else {
					guids = assetGUIDS;
				}
				if (assetGUIDS && assetGUIDS.length > 0 || q) {
					if (q) {
						console.log(' - total items to export: ' + guids.length);
					}
					if (guids.length === 0) {
						console.log('ERROR: no asset to export');
						return Promise.reject();
					}
				}

				var exportfilepath = path.join(destdir, (name || channelName || repositoryName) + '_export.zip');

				var exportPromise = _exportChannelContent(request, server, channelId, publishedassets, guids, exportfilepath);
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
					var contentPath = path.join(contentSrcDir, (name || channelName || repositoryName));
					fileUtils.remove(contentPath);

					fs.mkdirSync(contentPath);

					fileUtils.extractZip(exportfilepath, contentPath)
						.then(function (err) {
							if (err) {
								return resolve({
									err: 'err'
								});
							} else {
								console.log(' - the assets are available at ' + contentPath);
								resolve({
									channelId: channelId,
									channeName: channelName
								});
							}
						});

				});

			})
			.catch((error) => {
				resolve({
					err: 'err'
				});
			});
	});
};

var _getChannelToken = function (channel) {
	var tokens = channel.channelTokens || [];
	var channelToken;
	for (var i = 0; i < tokens.length; i++) {
		if (tokens[i].name === 'defaultToken') {
			channelToken = tokens[i].token;
			break;
		}
	}
	if (!channelToken && tokens.length > 0) {
		channelToken = tokens[0].token;
	}

	return channelToken;
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
		serverRest.getChannels({
				server: server
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve({
						err: 'err'
					});
				} else {
					var values = result || [];
					var channels = [];
					for (var i = 0; i < values.length; i++) {
						var channel = values[i];
						if (channel && channel.channelTokens) {
							var token = _getChannelToken(channel);

							channels.push({
								'id': channel.id,
								'name': channel.name,
								'token': token,
								'isSiteChannel': channel.isSiteChannel
							});
						}
					}

					return resolve({
						channels
					});
				}
			});
	});
	return channelsPromise;
};


/**
 * Call CAAS to create and export content template
 * @param {*} channelId 
 */
var _exportChannelContent = function (request, server, channelId, publishedassets, assetGUIDS, exportfilepath) {
	var exportPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'err'
			});
		}

		var auth = serverUtils.getRequestAuth(server);
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
				'exportPublishedItems': publishedassets ? 'true' : 'false'
			};

			if (assetGUIDS && assetGUIDS.length > 0) {
				postData['items'] = {
					'contentItems': assetGUIDS
				};
			} else if (channelId) {
				postData.channelIds = [{
					'id': channelId
				}];
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
			// console.log(JSON.stringify(options));

			request(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to export');
					console.log(err);
					resolve({
						err: 'err'
					});
				}
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					data = body;
				}
				if (response && (response.statusCode === 200 || response.statusCode === 201)) {
					var jobId = data && data.jobId;
					if (!jobId) {
						return resolve({
							err: 'err'
						});
					}
					console.log(' - submit export job (' + jobId + ')');

					// Wait for job to finish
					var needNewline = false;
					var startTime = new Date();
					var inter = setInterval(function () {
						var checkExportStatusPromise = _checkJobStatus(request, server, jobId);
						checkExportStatusPromise.then(function (result) {
							if (result.status !== 'success') {
								clearInterval(inter);
								if (needNewline) {
									process.stdout.write(os.EOL);
								}
								return resolve({
									err: 'err'
								});
							}

							var data = result.data;
							var status = data.status;
							// console.log(data);
							if (status && status === 'SUCCESS') {
								clearInterval(inter);
								if (needNewline) {
									process.stdout.write(os.EOL);
								}
								// console.log(data);
								var downloadLink = data.downloadLink[0].href;
								if (downloadLink) {
									options = {
										url: downloadLink,
										auth: auth,
										headers: {
											'Content-Type': 'application/zip'
										},
										timeout: 3600000,
										encoding: null
									};
									//
									// Download the export zip
									console.log(' - downloading export ' + downloadLink);
									startTime = new Date();
									request.get(options, function (err, response, body) {
										if (err) {
											console.log('ERROR: Failed to download');
											console.log(err);
											return resolve({
												err: 'err'
											});
										}
										if (response && response.statusCode === 200) {
											console.log(' - download export file [' + serverUtils.timeUsed(startTime, new Date()) + ']');
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
								if (needNewline) {
									process.stdout.write(os.EOL);
								}
								// console.log(data);
								console.log('ERROR: export failed: ' + data.errorDescription);
								return resolve({
									err: 'err'
								});
							} else if (status && status === 'INPROGRESS') {
								process.stdout.write(' - export job in progress [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
								readline.cursorTo(process.stdout, 0);
								needNewline = true;
							}

						});

					}, 6000);

				} else {
					process.stdout.write(os.EOL);
					var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
					console.log('ERROR: failed to export: ' + msg);
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
		var auth = serverUtils.getRequestAuth(server);
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

var _contentHasTaxonomy = function (name, isTemplate, isFile, filePath) {
	return new Promise(function (resolve, reject) {
		var hasTax = false;
		var taxpath;

		var getContentDir = function (topDir) {
			var cntDir = '';
			var items = fs.readdirSync(topDir);
			for (var i = 0; i < items.length; i++) {
				if (fs.statSync(path.join(topDir, items[i])).isDirectory() &&
					(items[i] === 'contentexport' || items[i].indexOf('Content Template of ')) >= 0) {
					cntDir = path.join(topDir, items[i]);
					break;
				}
			}
			// console.log(cntDir);
			return cntDir;
		};

		var checkTaxFiles = function (tpath) {
			var found = false;
			if (tpath && fs.existsSync(tpath) && fs.statSync(tpath).isDirectory()) {
				var files = fs.readdirSync(tpath);
				for (var i = 0; i < files.length; i++) {
					if (files[i].indexOf('.json') > 0) {
						found = true;
						break;
					}
				}
			}
			return found;
		};

		try {
			if (isFile) {
				var folderName = filePath.substring(filePath.lastIndexOf(path.sep) + 1);
				folderName = folderName.substring(0, folderName.lastIndexOf('.'));
				var contentDir = path.join(buildfolder, folderName);
				if (fs.existsSync(contentDir)) {
					fileUtils.remove(contentDir);
				}
				fileUtils.extractZip(filePath, contentDir)
					.then(function (err) {
						if (err) {
							console.log(err);
						}

						taxpath = path.join(getContentDir(contentDir), 'Taxonomies');

						hasTax = checkTaxFiles(taxpath);
						if (hasTax) {
							console.log(' - the content includes taxonomies');
						}
						return resolve({
							hasTax: hasTax
						});
					});

			} else {
				if (isTemplate) {
					taxpath = path.join(templatesSrcDir, name, 'assets', 'contenttemplate', 'Content Template of ' + name, 'Taxonomies');
				} else {
					taxpath = path.join(getContentDir(path.join(contentSrcDir, name)), 'Taxonomies');
				}
				hasTax = checkTaxFiles(taxpath);
				if (hasTax) {
					console.log(' - the content includes taxonomies');
				}
				return resolve({
					hasTax: hasTax
				});
			}
		} catch (e) {
			return resolve({
				hasTax: hasTax
			});
		}
	});
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
				args.zippath = zippath;
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
		typesOnly = args.typesOnly,
		hasTax = args.hasTax,
		errorMessage;

	var request = serverUtils.getRequest();

	var format = '   %-15s %-s';
	var importSuccess = false;
	var token;

	return new Promise(function (resolve, reject) {

		// 
		// upload content zip file
		//
		var createFilePromise = serverRest.createFile({
			server: server,
			parentID: 'self',
			filename: contentfilename,
			contents: fs.createReadStream(zippath)
		});

		var contentZipFileId;
		console.log(' - uploading file ...');
		var startTime = new Date();
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
				console.log(' - upload content file ' + zippath + ' [' + serverUtils.timeUsed(startTime, new Date()) + ']');

				return serverUtils.getCaasCSRFToken(server);
			})
			.then(function (result) {
				if (!result || result.err) {
					return resolve(result);
				}
				token = result && result.token;
				console.log(' - get CSRF token');

				var importTypes = typesOnly || hasTax;
				return _importContent(request, server, token, contentZipFileId, repositoryId, channelId, collectionId, updateContent, importTypes);

			}).then(function (result) {

				if (!result.err) {
					if (typesOnly || hasTax) {
						console.log(' - content types imported:');
					} else {
						console.log(' - content imported:');
					}
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

				var importAgainPromises = [];
				if (!typesOnly && hasTax) {
					importTypes = false;
					importSuccess = false;
					importAgainPromises.push(
						_importContent(request, server, token, contentZipFileId, repositoryId, channelId, collectionId, updateContent, importTypes));
				}

				return Promise.all(importAgainPromises);

			})
			.then(function (results) {
				var result = results && results[0];
				if (!typesOnly && hasTax && result && !result.err) {

					console.log(' - content imported:');
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

				var deleteArgv = {
					file: contentfilename,
					permanent: 'true'
				};
				var deleteFilePromise = documentUtils.deleteFile(deleteArgv, server, false);

				deleteFilePromise.then(function (result) {
					// all done
					return importSuccess ? resolve({}) : resolve({
						err: 'err'
					});
				});
			})
			.catch((error) => {
				resolve({
					err: 'err'
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
		contentpath = filePath.substring(0, filePath.lastIndexOf(path.sep));
		contentfilename = filePath.substring(filePath.lastIndexOf(path.sep) + 1);
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
	var typesOnly = typeof argv.types === 'string' && argv.types.toLowerCase() === 'true';

	var createZip = isFile ? false : true;

	serverUtils.loginToServer(server, serverUtils.getRequest(), true).then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		_contentHasTaxonomy(name, isTemplate, isFile, filePath)
			.then(function (result) {
				var hasTax = result && result.hasTax;

				_uploadContent(server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip, typesOnly, hasTax)
					.then(function (result) {
						if (result && result.err) {
							done();
						} else {
							done(true);
						}
					});
			});
	});
};

var _uploadContent = function (server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip, typesOnly, hasTax) {
	return new Promise(function (resolve, reject) {
		var request = serverUtils.getRequest();

		var repository, repositoryId;
		var channelId;
		var collectionId;

		var getCollectionsPromises = [];
		var createChannelPromises = [];
		var addChannelToRepositoryPromises = [];

		var repositoryPromise = serverRest.getRepositoryWithName({
			server: server,
			name: repositoryName
		});
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
					getCollectionsPromises.push(serverRest.getCollections({
						server: server,
						repositoryId: repositoryId
					}));
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

					var collections = results[0];
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

				return serverRest.getChannelWithName({
					server: server,
					name: channelName
				});

			})
			.then(function (result) {

				//
				// Get channel
				//
				if (!result || result.err) {
					return Promise.reject();
				}

				channelId = result.data && result.data.id;

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
					updateContent: updateContent,
					typesOnly: typesOnly,
					hasTax: hasTax
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
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});

	});
};

var _importContent = function (request, server, csrfToken, contentZipFileId, repositoryId, channelId, collectionId, updateContent, typesOnly) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/content-templates/importjobs';

		var auth = serverUtils.getRequestAuth(server);

		var postData = {
			'exportDocId': contentZipFileId,
			'repositoryId': repositoryId,
			'channelIds': channelId ? [channelId] : []
		};

		if (updateContent) {
			// update the existing content items (if any) instead of creating new ones
			postData.source = 'sites';
		}

		if (collectionId) {
			postData.collections = [collectionId];
		}

		if (typesOnly) {
			url = url + '?import=types';
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
		// console.log(options);
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
				console.log(' - submit import job (' + jobId + ')' + (updateContent ? ', updating content' : ''));

				// Wait for job to finish
				var startTime = new Date();
				var count = [];
				var needNewline = false;
				var inter = setInterval(function () {
					var checkImportStatusPromise = _checkJobStatus(request, server, jobId);
					checkImportStatusPromise.then(function (result) {
						if (result.status !== 'success') {
							clearInterval(inter);
							if (needNewline) {
								process.stdout.write(os.EOL);
							}
							return resolve({
								err: 'err'
							});
						}

						var data = result.data;
						var status = data.status;

						if (status && status === 'SUCCESS') {
							clearInterval(inter);
							if (needNewline) {
								process.stdout.write(os.EOL);
							}
							return resolve({});
						} else if (!status || status === 'FAILED') {
							clearInterval(inter);
							if (needNewline) {
								process.stdout.write(os.EOL);
							}
							console.log('ERROR: import failed: ' + data.errorDescription);
							if (!data.errorDescription) {
								console.log(data);
							}
							return resolve({
								err: 'err'
							});
						} else if (status && status === 'INPROGRESS') {
							needNewline = true;
							process.stdout.write(' - import job in progress [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
							readline.cursorTo(process.stdout, 0);
						}
					});

				}, 6000);
			} else {
				process.stdout.write(os.EOL);
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
		server = args.server,
		siteInfo = args.siteInfo,
		templateName = args.templateName,
		updateContent = args.updateContent;

	verifyRun({
		projectDir: projectDir
	});

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

	var isTemplate = true;
	var isFile = false;
	return _contentHasTaxonomy(templateName, isTemplate, isFile)
		.then(function (result) {
			var hasTax = result && result.hasTax;
			return _uploadContentFromZip({
				server: server,
				contentpath: contentpath,
				contentfilename: contentfilename,
				projectDir: projectDir,
				repositoryId: siteInfo.repositoryId,
				channelId: siteInfo.channelId,
				collectionId: siteInfo.arCollectionId,
				updateContent: updateContent,
				hasTax: hasTax
			}).then(function (result) {
				if (result.err) {
					console.log(' - failed to upload content');
					console.log(result.err);
				}
				return Promise.resolve({
					error: result.err
				});
			});
		});
};

module.exports.controlContent = function (argv, done, sucessCallback, errorCallback, loginServer) {
	'use strict';

	var cmdEnd = errorCallback ? errorCallback : _cmdEnd,
		cmdSuccess = sucessCallback ? sucessCallback : _cmdEnd;

	try {
		if (!verifyRun(argv)) {
			return cmdEnd(done);
		}

		var serverName = argv.server;
		var server = loginServer ? loginServer : serverUtils.verifyServer(serverName, projectDir);
		if (!server || !server.valid) {
			done();
			return;
		}

		console.log(' - server: ' + server.url);

		var request = serverUtils.getRequest();

		var loginPromise = serverUtils.loginToServer(server, request);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server');
				done();
				return;
			}

			var channelName = argv.channel;
			var collectionName = argv.collection;
			var action = argv.action;
			var repositoryName = argv.repository;
			var assetGUIDS = argv.assets ? argv.assets.split(',') : [];

			var repository;
			var channel, channelToken;
			var collection;
			var itemIds = [];
			var toPublishItemIds = [];
			var hasPublishedItems = false;

			var repositoryPromises = [];
			if (repositoryName) {
				repositoryPromises.push(serverRest.getRepositoryWithName({
					server: server,
					name: repositoryName
				}));
			}

			Promise.all(repositoryPromises)
				.then(function (results) {
					if (repositoryName) {
						if (!results || !results[0] || results[0].err || !results[0].data) {
							console.log('ERROR: repository ' + repositoryName + ' does not exist');
							return Promise.reject();
						}
						repository = results[0].data;
						console.log(' - get repository');
					}

					var channelPromises = [];
					if (channelName) {
						channelPromises.push(serverRest.getChannelWithName({
							server: server,
							name: channelName
						}));
					}

					return Promise.all(channelPromises);
				})
				.then(function (results) {
					if (channelName) {
						if (!results || !results[0] || results[0].err || !results[0].data) {
							console.log('ERROR: channel ' + channelName + ' does not exist');
							return Promise.reject();
						}
						channel = results[0].data;

						channelToken = _getChannelToken(channel);

						console.log(' - get channel (token: ' + channelToken + ')');

					}

					var collectionPromises = [];
					if (collectionName) {
						collectionPromises.push(serverRest.getCollectionWithName({
							server: server,
							repositoryId: repository.id,
							name: collectionName
						}));
					}

					return Promise.all(collectionPromises);

				})
				.then(function (results) {
					if (collectionName) {
						if (!results || !results[0] || results[0].err || !results[0].data) {
							console.log('ERROR: collection ' + collectionName + ' does not exist in repository ' + repositoryName);
							return Promise.reject();
						}
						collection = results[0].data;
						console.log(' - get collection');
					}

					//
					// get items in the channel or collection
					//
					// query items
					var q = '';
					if (action === 'add') {
						if (repository) {
							q = '(repositoryId eq "' + repository.id + '")';
						}
					} else {
						if (collection) {
							if (q) {
								q = q + ' AND ';
							}
							q = q + '(collections co "' + collection.id + '")';
						}
						if (channel) {
							if (q) {
								q = q + ' AND ';
							}
							q = q + '(channels co "' + channel.id + '")';
						}
					}
					// console.log(' - q: ' + q);

					return serverRest.queryItems({
						server: server,
						q: q,
						fields: 'name,status,isPublished'
					});
				})
				.then(function (result) {
					if (!result || result.err) {
						return Promise.reject();
					}

					var items = result.data || [];
					if (items.length === 0) {
						if (action === 'add') {
							console.log(' - no item in the repository');
						} else if (channel) {
							console.log(' - no item in the channel');
						} else if (collection) {
							console.log(' - no item in the collection');
						} else {
							console.log(' - no item');
						}

						return cmdSuccess(done);
					}

					if (assetGUIDS.length === 0) {
						if (action === 'add') {
							console.log(' - repository has ' + items.length + (items.length > 1 ? ' items' : ' item'));
						} else if (channel) {
							console.log(' - channel has ' + items.length + (items.length > 1 ? ' items' : ' item'));
						} else if (collection) {
							console.log(' - collection has ' + items.length + (items.length > 1 ? ' items' : ' item'));
						}
					} else {
						var badGUIDS = [];
						var goodItems = [];
						if (assetGUIDS.length > 0) {
							assetGUIDS.forEach(function (id) {
								var found = false;
								for (var i = 0; i < items.length; i++) {
									if (id === items[i].id) {
										goodItems.push(items[i]);
										found = true;
										break;
									}
								}
								if (!found) {
									badGUIDS.push(id);
								}
							});

							if (badGUIDS.length > 0) {
								var label = action === 'add' ? 'repository' : (channel ? 'channel' : 'collection');
								console.log('ERROR: asset ' + badGUIDS + ' not found in the ' + label);
							}

							if (goodItems.length === 0) {
								return Promise.reject();
							}

							items = goodItems;
						}
					}

					// publish policy: anythingPublished | onlyApproved

					var publishPolicy = channel && channel.publishPolicy;
					if (action === 'publish') {
						console.log(' - publish policy: ' + (publishPolicy === 'onlyApproved' ? 'only approved items can be published' : 'anything can be published'));
					}

					for (var i = 0; i < items.length; i++) {
						var item = items[i];

						// all items include rejected, use for unpublish / remove
						itemIds.push(item.id);

						if (publishPolicy) {
							if (publishPolicy === 'onlyApproved') {
								if (item.status === 'approved') {
									toPublishItemIds.push(item.id);
								}
							} else {
								if (item.status !== 'rejected' && item.status !== 'published') {
									toPublishItemIds.push(item.id);
								}
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

					} else if (action === 'add') {

						var opPromise = _performOneOp(server, action, channel ? channel.id : '', itemIds, true, 'true', collection ? collection.id : '');
						opPromise.then(function (result) {
							if (result.err) {
								return cmdEnd(done);
							} else {
								console.log(' - ' + itemIds.length + ' items added to ' + (channel ? 'channel' : 'collection'));
								return cmdSuccess(done, true);
							}
						});

					} else if (action === 'remove') {
						var unpublishPromises = [];
						if (hasPublishedItems && channel) {
							unpublishPromises.push(_performOneOp(server, 'unpublish', channel.id, itemIds, false));
						}
						Promise.all(unpublishPromises).then(function (result) {
							// continue to remove
							var removePromise = _performOneOp(server, action, channel ? channel.id : '', itemIds, true, 'true', collection ? collection.id : '');
							removePromise.then(function (result) {
								var label = channel ? 'channel' : 'collection';
								if (result.err) {
									console.log('ERROR: removing items from ' + label);
									return cmdEnd(done);
								}
								console.log(' - ' + itemIds.length + ' items removed from ' + label);
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
		});
	} catch (e) {
		console.log(e);
		return cmdEnd(done);
	}
};

var _performOneOp = function (server, action, channelId, itemIds, showerror, async, collectionId) {
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
		} else if (action === 'add') {
			opPromise = channelId ? serverRest.addItemsToChanel({
				server: server,
				channelId: channelId,
				itemIds: itemIds,
				async: async
			}) : serverRest.addItemsToCollection({
				server: server,
				collectionId: collectionId,
				itemIds: itemIds,
				async: async
			});
		} else {
			opPromise = channelId ? serverRest.removeItemsFromChanel({
				server: server,
				channelId: channelId,
				itemIds: itemIds,
				async: async
			}) : serverRest.removeItemsFromCollection({
				server: server,
				collectionId: collectionId,
				itemIds: itemIds,
				async: async
			});
		}
		opPromise.then(function (result) {
			if (result.err) {
				return resolve({
					err: 'err'
				});
			}

			if (!result || !result.statusId) {
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
				var count = [];
				var startTime = new Date();
				var needNewLine = false;
				var inter = setInterval(function () {
					var jobPromise = serverRest.getItemOperationStatus({
						server: server,
						statusId: statusId
					});
					jobPromise.then(function (data) {
						if (!data || data.error || data.progress === 'failed') {
							clearInterval(inter);
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
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
							if (needNewLine) {
								process.stdout.write(os.EOL);
							}
							console.log(' - ' + action + ' ' + itemIds.length + ' items finished');
							return resolve({});
						} else {
							count.push('.');
							process.stdout.write(' - ' + action + ' in progress [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
							readline.cursorTo(process.stdout, 0);
							needNewLine = true;
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

	console.log(JSON.stringify(policyValidation, null, 4));
	console.log('Failed to ' + action + ' the following items: ' + policyValidation.error ? policyValidation.error : '');
	var format = '  %-36s  %-60s  %-s';
	console.log(sprintf(format, 'Id', 'Name', 'Message'));
	for (var i = 0; i < blockingItems.length; i++) {
		console.log(sprintf(format, blockingItems[i].id, blockingItems[i].name, blockingItems[i].message));
	}

};

module.exports.copyAssets = function (argv, done) {
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

	var repositoryName = argv.repository;
	var targetName = argv.target;

	var collectionName = argv.collection;
	var channelName = argv.channel;

	var query = argv.query;
	var assetGUIDS = argv.assets ? argv.assets.split(',') : [];
	var validAssetGUIDS = [];

	var repository;
	var targetRepository;
	var channel;
	var collection;

	serverUtils.loginToServer(server, serverUtils.getRequest(), true).then(function (result) {
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

				var repositories = result || [];
				for (var i = 0; i < repositories.length; i++) {
					if (repositories[i].name.toLowerCase() === repositoryName.toLowerCase()) {
						repository = repositories[i];
					} else if (repositories[i].name.toLowerCase() === targetName.toLowerCase()) {
						targetRepository = repositories[i];
					}
					if (repository && targetRepository) {
						break;
					}
				}
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}
				if (!targetRepository || !targetRepository.id) {
					console.log('ERROR: repository ' + targetName + ' does not exist');
					return Promise.reject();
				}
				console.log(' - verify source repository ' + repository.name + ' (Id: ' + repository.id + ')');
				console.log(' - verify target repository ' + targetRepository.name + ' (Id: ' + targetRepository.id + ')');

				var collectionPromises = [];
				if (collectionName) {
					collectionPromises.push(serverRest.getCollectionWithName({
						server: server,
						repositoryId: repository.id,
						name: collectionName
					}));
				}

				return Promise.all(collectionPromises);
			})
			.then(function (results) {
				if (collectionName) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.log('ERROR: collection ' + collectionName + ' not found in repository ' + repositoryName);
						return Promise.reject();
					}
					collection = results[0].data;
					console.log(' - validate collection (Id: ' + collection.id + ')');
				}

				var channelPromises = [];
				if (channelName) {
					channelPromises.push(serverRest.getChannelWithName({
						server: server,
						name: channelName
					}));
				}

				return Promise.all(channelPromises);
			})
			.then(function (results) {

				if (channelName) {
					if (!results || !results[0] || results[0].err || !results[0].data) {
						console.log('ERROR: channel ' + channelName + ' does not exist');
						return Promise.reject();
					}
					channel = results[0].data;

					console.log(' - verify channel ' + channel.name + ' (Id: ' + channel.id + ')');

					// verify the channel is in the repository
					var channelInRepository = false;
					for (var i = 0; i < repository.channels.length; i++) {
						if (repository.channels[i].id === channel.id) {
							channelInRepository = true;
							break;
						}
					}
					if (!channelInRepository) {
						console.log('ERROR: channel ' + channelName + ' is not associated with repository ' + repositoryName);
						return Promise.reject();
					}
				}
				var queryItemPromises = [];
				var q;
				if (assetGUIDS && assetGUIDS.length > 0) {
					q = '';
					for (var i = 0; i < assetGUIDS.length; i++) {
						if (q) {
							q = q + ' or ';
						}
						q = q + 'id eq "' + assetGUIDS[i] + '"';
					}
					queryItemPromises.push(serverRest.queryItems({
						server: server,
						q: q
					}));
				}

				return Promise.all(queryItemPromises);

			})
			.then(function (results) {
				if (assetGUIDS && assetGUIDS.length > 0) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
					var items = results[0].data || [];
					for (var j = 0; j < assetGUIDS.length; j++) {
						var found = false;
						for (var i = 0; i < items.length; i++) {
							if (items[i].id === assetGUIDS[j]) {
								found = true;
								validAssetGUIDS.push(assetGUIDS[j]);
								break;
							}
						}
						if (!found) {
							console.log('ERROR: item with GUID ' + assetGUIDS[j] + ' not found');
						}
					}
				}

				var queryItemPromises = [];
				var q;
				if (query) {
					q = '';
					if (repository) {
						q = '(repositoryId eq "' + repository.id + '")';
					}
					if (collection) {
						if (q) {
							q = q + ' AND ';
						}
						q = q + '(collections co "' + collection.id + '")';
					}
					if (channel) {
						if (q) {
							q = q + ' AND ';
						}
						q = q + '(channels co "' + channel.id + '")';
					}

					if (q) {
						q = q + ' AND ';
					}
					q = q + '(' + query + ')';

					console.log(' - query: ' + q);

					queryItemPromises.push(serverRest.queryItems({
						server: server,
						q: q
					}));
				}

				return Promise.all(queryItemPromises);
			})
			.then(function (results) {
				var guids = [];
				if (query) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}
					var items = results[0].data || [];
					console.log(' - total items from query: ' + items.length);

					// the copy items have to be in both query result and specified item list
					for (var i = 0; i < items.length; i++) {
						var add = true;
						if (validAssetGUIDS.length > 0) {
							add = false;
							for (var j = 0; j < validAssetGUIDS.length; j++) {
								if (items[i].id === validAssetGUIDS[j]) {
									add = true;
									break;
								}
							}
						}

						if (add) {
							guids.push(items[i].id);
						}
					}
				} else {
					guids = validAssetGUIDS;
				}

				if (assetGUIDS && assetGUIDS.length > 0 || query) {
					console.log(' - total items to copy: ' + guids.length);
					if (guids.length === 0) {
						console.log('ERROR: no asset to copy');
						return Promise.reject();
					}
				}

				return serverRest.copyAssets({
					server: server,
					repositoryId: repository.id,
					targetRepositoryId: targetRepository.id,
					collection: collection,
					channel: channel,
					itemIds: guids
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				console.log(' - assets copied to repository ' + targetName);

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


module.exports.migrateContent = function (argv, done) {
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
	if (server.env !== 'pod_ic') {
		console.log('ERROR: server ' + server.url + ' is not a valid source to migrate content');
		done();
		return;
	}

	var destServerName = argv.destination;
	var destServer = serverUtils.verifyServer(destServerName, projectDir);
	if (!destServer || !destServer.valid) {
		done();
		return;
	}
	if (destServer.env === 'pod_ic') {
		console.log('ERROR: server ' + destServer.url + ' is not a valid destination to migrate content');
		done();
		return;
	}

	var collectionName = argv.name;

	var repositoryName = argv.repository;
	var channelName = argv.channel;
	var destCollectionName = argv.collection || collectionName;

	var collectionId;
	var repository, repositoryId;
	var channelId;
	var newChannel = false;
	var destCollectionId;
	var newCollection = false;

	var exportFilePath, exportFileName;

	var request = serverUtils.getRequest();

	var loginPromise = serverUtils.loginToServer(server, request);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(' - failed to connect to the server');
			done();
			return;
		}

		var express = require('express');
		var app = express();

		var port = '9191';
		var localhost = 'http://localhost:' + port;

		var idcToken;

		var auth = serverUtils.getRequestAuth(server);

		serverUtils.getIdcToken(server)
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}

				return serverUtils.browseCollectionsOnServer(request, server);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				// console.log(result);
				var collections = result && result.data ? result.data : [];
				for (var i = 0; i < collections.length; i++) {
					if (collections[i].fFolderName === collectionName) {
						collectionId = collections[i].fFolderGUID;
						break;
					}
				}
				if (!collectionId) {
					console.log('ERROR: collection ' + collectionName + ' does not exist on server ' + server.url);
					return Promise.reject();
				}

				console.log(' - verify collection ' + collectionName + '(Id: ' + collectionId + ')');

				return serverRest.getRepositoryWithName({
					server: destServer,
					name: repositoryName
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.data) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				repository = result.data;
				repositoryId = result.data && result.data.id;
				console.log(' - verify repository (Id: ' + repositoryId + ')');

				return _getChannelsFromServer(destServer);

			})
			.then(function (result) {
				//
				// Get channel
				//
				if (!result || result.err) {
					return Promise.reject();
				}

				var channels = result.channels || [];
				var createChannelPromises = [];
				if (channelName) {
					for (var i = 0; i < channels.length; i++) {
						if (channels[i].name.toLowerCase() === channelName.toLowerCase()) {
							channelId = channels[i].id;
							break;
						}
					}

					if (!channelId) {
						// need to create the channel first
						createChannelPromises.push(serverRest.createChannel({
							server: destServer,
							name: channelName
						}));
						newChannel = true;
					} else {
						console.log(' - get channel (Id: ' + channelId + ')');
					}
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

					channelId = results[0] && results[0].id;
					console.log(' - create channel ' + channelName + ' (Id: ' + channelId + ')');
				}

				var addChannelToRepositoryPromises = [];

				if (channelId) {
					// check if the channel is associated with the repository
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
							server: destServer,
							id: channelId,
							name: channelName,
							repository: repository
						}));
					}
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

				return serverRest.getCollections({
					server: destServer,
					repositoryId: repositoryId
				});

			})
			.then(function (result) {
				//
				// get collections in the repository
				//
				if (!result || result.err) {
					return Promise.reject();
				}

				var collections = result;
				for (var i = 0; i < collections.length; i++) {
					if (collections[i].name.toLowerCase() === destCollectionName.toLowerCase()) {
						destCollectionId = collections[i].id;
						break;
					}
				}

				var createCollectionPromises = [];
				if (!destCollectionId) {
					createCollectionPromises.push(serverRest.createCollection({
						server: destServer,
						repositoryId: repositoryId,
						name: destCollectionName,
						channels: channelId ? [{
							id: channelId
						}] : [],
					}));
				} else {
					console.log(' - get collection');
				}

				return Promise.all(createCollectionPromises);
			})
			.then(function (results) {
				if (!destCollectionId) {
					if (results[0].err || !results[0].id) {
						return Promise.reject();
					}
					destCollectionId = results[0].id;
					newCollection = true;
					console.log(' - create collection ' + destCollectionName + ' (Id: ' + destCollectionId + ')');
				}

				exportFileName = collectionId + '_export.zip';
				exportFilePath = path.join(buildfolder, exportFileName);
				fileUtils.remove(exportFilePath);

				return _exportContentIC(request, server, collectionId, exportFilePath);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				if (!fs.existsSync(exportFilePath)) {
					console.log('ERROR: failed to export content');
					return Promise.reject();
				}

				var args = {
					server: destServer,
					contentpath: buildfolder,
					contentfilename: exportFileName,
					zippath: exportFilePath,
					projectDir: projectDir,
					repositoryName: repositoryName,
					repositoryId: repositoryId,
					channelName: channelName,
					channelId: channelId,
					collectionName: destCollectionName,
					collectionId: destCollectionId,
					updateContent: true
				};
				return _uploadContentFromZipFile(args);
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
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

var _checkJobStatusIC = function (request, server, jobId) {
	var checkExportStatusPromise = new Promise(function (resolve, reject) {
		var statusUrl = server.url + '/content/management/api/v1/content-templates/exportjobs/' + jobId;
		var auth = serverUtils.getRequestAuth(server);
		var options = {
			url: statusUrl,
			'auth': auth,
			headers: {
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Cookie: server.cookies
			},
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
var _exportContentIC = function (request, server, collectionId, exportfilepath) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1/content-templates/exportjobs';
		var contentTemplateName = 'contentexport';
		var postData = {
			'name': contentTemplateName,
			'targetIds': [{
				id: collectionId
			}]
		};

		var auth = serverUtils.getRequestAuth(server);

		var options = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Cookie: server.cookies
			},
			auth: auth,
			body: JSON.stringify(postData)
		};
		// console.log(options);
		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to export');
				console.log(err);
				resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				data = body;
			}
			if (response && (response.statusCode === 200 || response.statusCode === 201)) {
				var jobId = data && data.jobId;
				if (!jobId) {
					return resolve({
						err: 'err'
					});
				}
				console.log(' - submit export job');

				// Wait for job to finish
				var inter = setInterval(function () {
					var checkExportStatusPromise = _checkJobStatusIC(request, server, jobId);
					checkExportStatusPromise.then(function (result) {
						if (result.status !== 'success') {
							clearInterval(inter);
							return resolve({
								err: 'err'
							});
						}

						var data = result.data;
						var status = data.status;

						if (status && status === 'SUCCESS') {
							clearInterval(inter);
							var downloadLink = data.downloadLink && data.downloadLink.href;
							// console.log(' - download link: ' + downloadLink);
							if (downloadLink) {
								options = {
									url: downloadLink,
									auth: auth,
									headers: {
										'Content-Type': 'application/zip',
										Cookie: server.cookies
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
							var statusFile = path.join(buildfolder, 'export_content_status.json');
							fs.writeFileSync(statusFile, JSON.stringify(data, null, 4));
							console.log('ERROR: export failed: ' + data.errorDescription);
							console.log('  find more info in ' + statusFile);
							return resolve({
								err: 'err'
							});
						} else if (status && status === 'INPROGRESS') {
							console.log(' - export job in progress...');
						}

					});

				}, 5000);
			} else {
				var msg = data && (data.detail || data.title) ? (data.detail || data.title) : (response.statusMessage || response.statusCode);
				console.log('ERROR: failed to export: ' + msg);
				return resolve({
					err: 'err'
				});
			}
		});
	});

};


/**
 * Create transfer enterprise site content scripts
 */
module.exports.transferSiteContent = function (argv, done) {
	'use strict';

	if (!verifyRun(argv)) {
		done();
		return;
	}

	var serverName = argv.server;
	var server;
	server = serverUtils.verifyServer(serverName, projectDir);
	if (!server || !server.valid) {
		done();
		return;
	}

	var destServerName = argv.destination;
	var destServer = serverUtils.verifyServer(destServerName, projectDir);
	if (!destServer || !destServer.valid) {
		done();
		return;
	}

	if (server.url === destServer.url) {
		console.log('ERROR: source and destination server are the same');
		done();
		return;
	}

	var executeScripts = typeof argv.execute === 'string' && argv.execute.toLowerCase() === 'true';
	var publishedassets = typeof argv.publishedassets === 'string' && argv.publishedassets.toLowerCase() === 'true';
	var siteName = argv.name;
	var repositoryName = argv.repository;
	var limit = argv.number || 500;
	var repositorymappings = argv.repositorymappings ? argv.repositorymappings.split(',') : [];

	var repoMappings = [];
	repositorymappings.forEach(function (mapping) {
		var pair = mapping.split(':');
		if (pair.length === 2) {
			repoMappings.push({
				srcName: pair[0],
				destName: pair[1],
				items: []
			});
		}
	});

	var items = [];
	var otherItems = [];
	var site;
	var channelId;
	var channelName;
	var channelToken;

	var isWindows = /^win/.test(process.platform) ? true : false;

	var siteName2 = serverUtils.replaceAll(siteName, ' ', '');
	var downloadContentFileName = siteName2 + '_downloadcontent' + (isWindows ? '.bat' : '');
	var uploadContentFileName = siteName2 + '_uploadcontent' + (isWindows ? '.bat' : '');
	var downloadContentFilePath = path.join(projectDir, downloadContentFileName);
	var uploadContentFilePath = path.join(projectDir, uploadContentFileName);

	var request = serverUtils.getRequest();
	serverUtils.loginToServer(server, request)
		.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer, request);
		})
		.then(function (result) {
			if (!result.status) {
				console.log(' - failed to connect to the server ' + destServer.url);
				return Promise.reject();
			}

			// verify site on source server
			return sitesRest.getSite({
				server: server,
				name: siteName,
				expand: 'channel,repository'
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}
			site = result;
			// console.log(site);
			if (!site.isEnterprise) {
				console.log('ERROR: site ' + siteName + ' is not Enterprise Site');
				return Promise.reject();
			}

			console.log(' - verify site (Id: ' + site.id + ')');
			console.log(' - site repository (Id: ' + site.repository.id + ' name: ' + site.repository.name + ')');

			if (!site.channel || !site.channel.id) {
				console.log('ERROR: site channel is not found');
				return Promise.reject();
			}

			channelId = site.channel.id;
			channelName = site.channel.name;
			channelToken = _getChannelToken(site.channel);

			console.log(' - site channel (Id: ' + channelId + ' token: ' + channelToken + ')');

			// query the respotiory on the destination server
			return serverRest.getRepositoryWithName({
				server: destServer,
				name: repositoryName
			});

		})
		.then(function (result) {
			if (!result || result.err || !result.data) {
				console.log('ERROR: repository ' + repositoryName + ' does not exist');
				return Promise.reject();
			}

			var srcRepoPromises = [];
			repoMappings.forEach(function (mapping) {
				srcRepoPromises.push(serverRest.getRepositoryWithName({
					server: server,
					name: mapping.srcName
				}));
			});

			return Promise.all(srcRepoPromises);

		})
		.then(function (results) {
			if (repoMappings.length > 0) {
				var srcRepoNames = [];
				for (var j = 0; j < repoMappings.length; j++) {
					var found = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i].data && results[i].data.name === repoMappings[j].srcName) {
							found = true;
							repoMappings[j].srcId = results[i].data.id;
							srcRepoNames.push(results[i].data.name);
							break;
						}
					}
					if (!found) {
						console.log('ERROR: repository ' + repoMappings[j].srcName + ' does not exist on server ' + server.name);
						return Promise.reject();
					}
				}
				console.log(' - verify repository ' + srcRepoNames + ' on server ' + server.name);
			}
			var destRepoPromises = [];
			repoMappings.forEach(function (mapping) {
				destRepoPromises.push(serverRest.getRepositoryWithName({
					server: destServer,
					name: mapping.destName
				}));
			});

			return Promise.all(destRepoPromises);

		})
		.then(function (results) {
			if (repoMappings.length > 0) {
				var destRepoNames = [];
				for (var j = 0; j < repoMappings.length; j++) {
					var found = false;
					for (var i = 0; i < results.length; i++) {
						if (results[i].data && results[i].data.name === repoMappings[j].destName) {
							found = true;
							repoMappings[j].destId = results[i].data.id;
							destRepoNames.push(results[i].data.name);
							break;
						}
					}
					if (!found) {
						console.log('ERROR: repository ' + repoMappings[j].destName + ' does not exist on server ' + destServer.name);
						return Promise.reject();
					}
				}
				console.log(' - verify repository ' + destRepoNames + ' on server ' + destServer.name);
			}

			// query all items in the channel
			var q = 'channels co "' + channelId + '"';
			return serverRest.queryItems({
				server: server,
				q: q
			});

		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var allItems = result.data;
			if (!allItems || allItems.length === 0) {
				console.log('ERROR: no item in the site channle');
				return Promise.reject();
			}

			// check items from other repositories
			allItems.forEach(function (item) {
				if (item.repositoryId !== site.repository.id) {
					otherItems.push(item);
				} else {
					items.push(item);
				}
			});

			var total = items.length;
			console.log(' - total items from site repository:    ' + total);
			console.log(' - total items from other repositories: ' + otherItems.length);

			if (repoMappings.length > 0 && otherItems.length > 0) {
				otherItems.forEach(function (item) {
					var found = false;
					for (var i = 0; i < repoMappings.length; i++) {
						if (repoMappings[i].srcId === item.repositoryId) {
							found = true;
							item.targetRepositoryId = repoMappings[i].destId;
							repoMappings[i].items.push(item.id);
							break;
						}
					}
					if (!found) {
						console.log(' - item (id: ' + item.id + ' name: ' + item.name + ') will be placed in the site repository');
					}
				});
			} else {
				// If no mapping, all go into site repository
				items = allItems;
			}

			var downloadScript = 'cd ' + projectDir + os.EOL + os.EOL;
			var uploadScript = 'cd ' + projectDir + os.EOL + os.EOL;
			var cmd;
			var winCall = isWindows ? 'call ' : '';
			var zipPath;

			var count = 0;
			var ids = [];
			var groups = [];
			var groupName;
			items.forEach(function (item) {
				ids.push(item.id);
				count += 1;

				if (count === limit) {
					groups.push(ids.toString());
					ids = [];
					count = 0;
				}
			});
			if (ids.length > 0) {
				groups.push(ids.toString());
			}
			// console.log(groups);

			console.log(' - total batches: ' + groups.length);

			for (var i = 0; i < groups.length; i++) {
				ids = groups[i];
				groupName = siteName2 + '_content_batch_' + i.toString();

				// download command for this group
				cmd = winCall + 'cec download-content ' + channelName;
				if (publishedassets) {
					cmd += ' -p';
				}
				cmd += ' -n ' + groupName;
				cmd += ' -s ' + serverName;
				cmd += ' -a ' + ids;

				downloadScript += 'echo "*** download-content ' + groupName + '"' + os.EOL;
				downloadScript += cmd + os.EOL + os.EOL;

				// upload command for this group
				zipPath = path.join(distFolder, groupName + '_export.zip');
				cmd = winCall + 'cec upload-content ' + zipPath + ' -f -u';
				cmd += ' -r "' + repositoryName + '"';
				cmd += ' -c ' + channelName;
				cmd += ' -s ' + destServerName;

				uploadScript += 'echo "*** upload-content ' + groupName + '"' + os.EOL;
				uploadScript += cmd + os.EOL + os.EOL;

			}

			// download / upload for other repositories
			// console.log(repoMappings);
			for (var i = 0; i < repoMappings.length; i++) {
				if (repoMappings[i].items.length > 0) {
					groupName = siteName2 + '_content_batch_others_' + i.toString();

					cmd = winCall + 'cec download-content ' + channelName;
					if (publishedassets) {
						cmd += ' -p';
					}
					cmd += ' -n ' + groupName;
					cmd += ' -s ' + serverName;
					cmd += ' -a ' + repoMappings[i].items;

					downloadScript += 'echo "*** download-content ' + groupName + '"' + os.EOL;
					downloadScript += cmd + os.EOL + os.EOL;

					zipPath = path.join(distFolder, groupName + '_export.zip');
					cmd = winCall + 'cec upload-content ' + zipPath + ' -f -u';
					cmd += ' -r "' + repoMappings[i].destName + '"';
					cmd += ' -c ' + channelName;
					cmd += ' -s ' + destServerName;

					uploadScript += 'echo "*** upload-content ' + groupName + '"' + os.EOL;
					uploadScript += cmd + os.EOL + os.EOL;
				}
			}

			fs.writeFileSync(downloadContentFilePath, downloadScript);
			fs.writeFileSync(uploadContentFilePath, uploadScript);
			fs.chmodSync(downloadContentFilePath, '755');
			fs.chmodSync(uploadContentFilePath, '755');

			console.log(' - create script ' + downloadContentFilePath);
			console.log(' - create script ' + uploadContentFilePath);

			if (executeScripts) {
				var childProcess = require('child_process');
				console.log('');
				console.log('Executing script ' + downloadContentFileName + ' ...');
				var downloadCmd = childProcess.execSync(downloadContentFilePath, {
					stdio: 'inherit'
				});

				console.log('');
				console.log('Executing script ' + uploadContentFileName + ' ...');
				var uploadCmd = childProcess.execSync(uploadContentFilePath, {
					stdio: 'inherit'
				});

				console.log('');
				process.exitCode = 0;
				done(true);
			} else {
				console.log('Please execute ' + downloadContentFileName + ' first to download content from the source server, then execute ' + uploadContentFileName + ' to upload the content to the destination server.');
				done(true);
			}
		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
			done();
		});

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

	serverRest.getChannel({
			server: srcServer,
			id: channelId
		})
		.then(function (result) {
			if (result.err || !result.id) {
				return Promise.reject();
			}

			channelIdSrc = result.id;
			channelName = result.name;

			if (!channelIdSrc) {
				console.log('ERROR: channel does not exist on server ' + srcServer.name);
				return Promise.reject();
			}

			console.log(' - validate channel on source server: ' + channelName + '(Id: ' + channelIdSrc + ')');

			return serverRest.getChannelWithName({
				server: destServer,
				name: channelName
			});
		})
		.then(function (result) {

			channelIdDest = result && result.data && result.data.id;

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
			done(true);
		})
		.catch((error) => {
			done();
		});

};

var _syncExportItemFromSource = function (request, server, id, name, filePath) {
	return new Promise(function (resolve, reject) {
		serverRest.exportContentItem({
				server: server,
				id: id,
				name: name
			}).then(function (result) {
				if (!result || result.err || !result.jobId) {
					return Promise.reject();
				}
				console.log(' - submit export job');
				var jobId = result.jobId;
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
								var downloadLink = data.downloadLink[0].href;
								if (downloadLink) {
									options = {
										url: downloadLink,
										auth: serverUtils.getRequestAuth(server),
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

											fs.writeFileSync(filePath, body);
											console.log(' - save export to ' + filePath);

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
								// console.log(data);
								console.log('ERROR: export failed: ' + data.errorDescription);
								return resolve({
									err: 'err'
								});
							} else if (status && status === 'INPROGRESS') {
								console.log(' - export job in progress...');
							}

						})
						.catch((error) => {
							if (error) {
								console.log(error);
							}
							return resolve({
								err: 'err'
							});
						});

				}, 5000);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve({
					err: 'err'
				});
			});
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

	var fileId;
	var fileName = id + '_export.zip';
	var filePath = path.join(projectDir, 'dist', fileName);
	var destdir = path.join(projectDir, 'dist');
	if (!fs.existsSync(destdir)) {
		fs.mkdirSync(destdir);
	}

	var request = serverUtils.getRequest();

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

			return serverRest.getRepository({
				server: srcServer,
				id: repositoryId
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			var srcRepository = result;

			if (!srcRepository || !srcRepository.id) {
				console.log('ERROR: repository ' + repositoryId + ' does not exist on server ' + srcServer.name);
				return Promise.reject();
			}

			console.log(' - validate repository on source server: ' + srcRepository.name + ' (id: ' + srcRepository.id + ')');

			return serverRest.getRepositoryWithName({
				server: destServer,
				name: srcRepository.name
			});
		})
		.then(function (result) {

			destRepository = result && result.data;

			if (!destRepository || !destRepository.id) {
				console.log('ERROR: repository ' + srcRepository.name + ' does not exist on server ' + destServer.name);
				return Promise.reject();
			}

			console.log(' - validate repository on destination server: ' + destRepository.name + ' (id: ' + destRepository.id + ')');


			return _syncExportItemFromSource(request, srcServer, id, item.name, filePath);
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			// upload file
			return serverRest.createFile({
				server: destServer,
				parentID: 'self',
				filename: fileName,
				contents: fs.createReadStream(filePath)
			});
		})
		.then(function (result) {
			if (!result || result.err || !result.id) {
				return Promise.reject();
			}
			fileId = result.id;
			console.log(' - upload file ' + result.name + ' (Id: ' + fileId + ' version: ' + result.version + ')');

			return serverRest.importContent({
				server: destServer,
				fileId: fileId,
				repositoryId: destRepository.id,
				update: true
			});
		})
		.then(function (result) {
			if (!result || result.err || !result.jobId) {
				return Promise.reject();
			}

			console.log(' - submit import job');
			var jobId = result.jobId;
			// Wait for job to finish
			var inter = setInterval(function () {
				var checkExportStatusPromise = serverRest.getContentJobStatus({
					server: destServer,
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
							console.log(' - content item imported');
							// delete the zip file
							serverRest.deleteFile({
								server: destServer,
								fFileGUID: fileId
							}).then(function (result) {
								done(true);
							});

						} else if (status && status === 'FAILED') {
							clearInterval(inter);
							// console.log(data);
							console.log('ERROR: import failed: ' + data.errorDescription);
							clearInterval(inter);
							done();
						} else if (status && status === 'INPROGRESS') {
							console.log(' - import job in progress...');
						}

					})
					.catch((error) => {
						if (error) {
							console.log(error);
						}
						done();
					});

			}, 5000);
		})
		.catch((error) => {
			if (error) {
				console.log(error);
			}
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
				var retry = failedItems[0].message && failedItems[0].message.indexOf('referred by other') >= 0;
				done(false, retry);
			} else {
				console.log(' - item ' + (name || id) + ' deleted on server ' + destServer.name);
				done(true);
			}
		})
		.catch((error) => {
			done();
		});
};

module.exports.syncApproveItem = function (argv, done) {
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
	serverRest.approveItems({
			server: destServer,
			itemIds: [id]
		})
		.then(function (result) {
			if (result.err) {
				return Promise.reject();
			}

			console.log(' - item ' + (name || id) + ' approved on server ' + destServer.name);
			done(true);
		})
		.catch((error) => {
			done();
		});
};

// export non "command line" utility functions
module.exports.utils = {
	downloadContent: _downloadContentUtil
};