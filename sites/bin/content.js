/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

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

var _cmdEnd = function (done, exitCode) {
	done(exitCode);
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

	var assetsFile = argv.assetsfile;
	if (assetsFile) {
		var filePath = assetsFile;
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(projectDir, filePath);
		}
		filePath = path.resolve(filePath);

		if (!fs.existsSync(filePath)) {
			console.log('ERROR: file ' + filePath + ' does not exist');
			done();
			return;
		}
		if (fs.statSync(filePath).isDirectory()) {
			console.log('ERROR: file ' + filePath + ' is not a file');
			done();
			return;
		}

		var assetsInFile = [];
		try {
			assetsInFile = JSON.parse(fs.readFileSync(filePath));
		} catch (e) {
			console.log(e);
		}
		if (assetsInFile.length === 0) {
			console.log('ERROR: file ' + filePath + ' does not contain any asset GUID');
			done();
			return;
		}
		// console.log(' - total asset GUIDs in file ' + assetsFile + ': ' + assetsInFile.length);
		assetGUIDS = assetGUIDS.concat(assetsInFile);
	}

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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
		argv.repositoryName, argv.collectionName, argv.query, argv.assetGUIDS,
		argv.requiredContentPath, argv.requiredContentTemplateName);
};

var _downloadContent = function (server, channel, name, publishedassets, repositoryName, collectionName, query, assetGUIDS,
	requiredContentPath, requiredContentTemplateName) {
	return new Promise(function (resolve, reject) {
		var destdir = path.join(projectDir, 'dist');
		if (!fs.existsSync(destdir)) {
			fs.mkdirSync(destdir);
		}

		var request = require('../test/server/requestUtils.js').request;

		var channelId = '';
		var channelName = '';
		var repository, collection;
		var q = '';
		var exportfilepath;
		var contentPath;

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

				if (query || repository || collection || (assetGUIDS && assetGUIDS.length > 0)) {
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

					if (publishedassets) {
						if (q) {
							q = q + ' AND ';
						}
						q = q + 'status eq "published" AND publishedChannels co "' + channelId + '"';
					} else {
						if (channelId) {
							if (q) {
								q = q + ' AND ';
							}
							q = q + '(channels co "' + channelId + '")';
						}
					}
					console.log(' - query: ' + q);
				}

				return _queryItems(server, q, assetGUIDS);

			})
			.then(function (result) {
				var guids = [];
				if (query || repository || collection || (assetGUIDS && assetGUIDS.length > 0)) {

					var items = result || [];
					console.log(' - total items from query: ' + items.length);

					if (assetGUIDS && assetGUIDS.length > 0) {
						var notFoundAssets = [];
						assetGUIDS.forEach(function (id) {
							var found = false;
							for (var i = 0; i < items.length; i++) {
								if (items[i].id === id) {
									found = true;
									break;
								}
							}
							if (!found) {
								notFoundAssets.push(id);
							}
						});
						if (notFoundAssets.length > 0) {
							console.log('WRONG: the following assets not found: ' + notFoundAssets);
						}
					}

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

				exportfilepath = path.join(destdir, (name || channelName || repositoryName) + '_export.zip');

				var exportPromise = _exportChannelContent(request, server, channelId, publishedassets, guids, exportfilepath, requiredContentTemplateName);

				return exportPromise;
			})
			.then(function (result) {
				if (result.err) {
					return Promise.reject();
				}

				if (!fs.existsSync(contentSrcDir)) {
					fs.mkdirSync(contentSrcDir);
				}

				// unzip to src/content
				if (requiredContentPath) {
					contentPath = requiredContentPath;
				} else {
					contentPath = path.join(contentSrcDir, (name || channelName || repositoryName));
					fileUtils.remove(contentPath);

					fs.mkdirSync(contentPath);
				}
				// console.log(' - unzip to: ' + contentPath);

				return fileUtils.extractZip(exportfilepath, contentPath);

			})
			.then(function (err) {
				if (err) {
					return Promise.reject();
				}

				console.log(' - the assets are available at ' + contentPath);
				resolve({
					channelId: channelId,
					channeName: channelName
				});
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				resolve({
					err: 'err'
				});
			});
	});
};

var _queryItems = function (server, qstr, assetGUIDS) {
	return new Promise(function (resolve, reject) {
		var items = [];
		if (!qstr && (!assetGUIDS || assetGUIDS.length === 0)) {

			return resolve(items);

		} else if (!assetGUIDS || assetGUIDS.length === 0) {

			return serverRest.queryItems({
				server: server,
				q: qstr
			}).then(function (result) {
				items = result && result.data || [];
				return resolve(items);
			});

		} else {

			var total = assetGUIDS.length;
			// console.log(' - total number of assets: ' + total);
			var groups = [];
			var limit = 100;
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
			// console.log(groups);

			var items = [];

			var doQueryItems = groups.reduce(function (itemPromise, param) {
					return itemPromise.then(function (result) {
						var q = qstr;
						var idq = '';
						for (var i = param.start; i <= param.end; i++) {
							if (idq) {
								idq = idq + ' OR ';
							}
							idq = idq + 'id eq "' + assetGUIDS[i] + '"';
						}
						if (q) {
							q = q + ' AND ';
						}
						q = q + '(' + idq + ')';
						// console.log(q);

						return serverRest.queryItems({
							server: server,
							q: q
						}).then(function (result) {
							if (result && result.data && result.data.length > 0) {
								items = items.concat(result.data);
							}
						});

					});
				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve({}));

			doQueryItems.then(function (result) {
				resolve(items);
			});
		}
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
var _exportChannelContent = function (request, server, channelId, publishedassets, assetGUIDS, exportfilepath, requiredContentTemplateName) {
	var exportPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'err'
			});
		}

		// Get CSRF token
		var csrfTokenPromise = new Promise(function (resolve, reject) {
			var tokenUrl = server.url + '/content/management/api/v1.1/token';

			var options = {
				url: tokenUrl,
				headers: {
					Authorization: serverUtils.getRequestAuthorization(server)
				}
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
			var contentTemplateName = requiredContentTemplateName || 'contentexport';
			var postData = {
				'name': contentTemplateName,
				'exportPublishedItems': publishedassets ? 'true' : 'false'
			};

			if (assetGUIDS && assetGUIDS.length > 0) {
				postData['items'] = {
					'contentItems': assetGUIDS
				};
			}
			if (channelId) {
				postData.channelIds = [{
					'id': channelId
				}];
			}
			// console.log(postData);
			var options = {
				method: 'POST',
				url: url,
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-TOKEN': csrfToken,
					'X-REQUESTED-WITH': 'XMLHttpRequest',
					Authorization: serverUtils.getRequestAuthorization(server)
				},
				body: JSON.stringify(postData)
			};
			// console.log(JSON.stringify(options));

			request.post(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to export' + ' (ecid: ' + response.ecid + ')');
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
						var checkExportStatusPromise = serverRest.getContentJobStatus({
							server: server,
							jobId: jobId
						});
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
										headers: {
											'Content-Type': 'application/zip',
											Authorization: serverUtils.getRequestAuthorization(server)
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
								console.log('ERROR: export failed: ' + data.errorDescription + ' (ecid: ' + response.ecid + ')');
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
					console.log('ERROR: failed to export: ' + msg + ' (ecid: ' + response.ecid + ')');
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
		repositoryType = args.repositoryType,
		channelName = args.channelName,
		channelId = args.channelId,
		collectionName = args.collectionName,
		collectionId = args.collectionId,
		updateContent = args.updateContent,
		reuseContent = args.reuseContent,
		typesOnly = args.typesOnly,
		hasTax = args.hasTax,
		errorMessage;

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
				return _importContent(server, token, contentZipFileId, repositoryId, channelId, collectionId, updateContent, importTypes, reuseContent);

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
					if (channelId && typeof channelName === 'string') {
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
						_importContent(server, token, contentZipFileId, repositoryId, channelId, collectionId, updateContent, importTypes, reuseContent));
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
	var channelName = argv.channel || (isFile ? '' : name);
	var collectionName = argv.collection;
	var updateContent = typeof argv.update === 'string' && argv.update.toLowerCase() === 'true';
	var reuseContent = typeof argv.reuse === 'string' && argv.reuse.toLowerCase() === 'true';
	var typesOnly = typeof argv.types === 'string' && argv.types.toLowerCase() === 'true';

	var createZip = isFile ? false : true;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		serverRest.getRepositoryWithName({
				server: server,
				name: repositoryName
			})
			.then(function (result) {
				if (!result || result.err) {
					done();
					return;
				}

				var repository = result.data;
				if (!repository || !repository.id) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					done();
					return;
				}

				if (argv.channel && repository.repositoryType && repository.repositoryType === 'Business') {
					console.log(' - ' + repositoryName + ' is a business repository, channel will not be added to the repository');
				}

				_contentHasTaxonomy(name, isTemplate, isFile, filePath)
					.then(function (result) {
						var hasTax = result && result.hasTax;

						_uploadContent(server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip, typesOnly, hasTax, reuseContent)
							.then(function (result) {
								if (result && result.err) {
									done();
								} else {
									done(true);
								}
							});
					});
			});
	});
};

var _uploadContentUtil = function (args) {
	verifyRun(args.argv);

	return new Promise(function (resolve, reject) {
		var server = args.server;
		var name = args.name;
		var isTemplate = args.isTemplate;
		var isFile = args.isFile;
		var filePath = args.filePath;
		var repositoryName = args.repositoryName;
		var collectionName = args.collectionName;
		var channelName = args.channelName;
		var updateContent = args.updateContent;
		var reuseContent = args.reuseContent;
		var contentpath = args.contentpath;
		var contentfilename = args.contentfilename;
		var typesOnly = args.typesOnly;

		var createZip = isFile ? false : true;

		_contentHasTaxonomy(name, isTemplate, isFile, filePath)
			.then(function (result) {
				var hasTax = result && result.hasTax;

				_uploadContent(server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip, typesOnly, hasTax, reuseContent)
					.then(function (result) {
						return resolve(result);
					});

			});
	});
};

var _uploadContent = function (server, repositoryName, collectionName, channelName, updateContent, contentpath, contentfilename, createZip, typesOnly, hasTax, reuseContent) {
	return new Promise(function (resolve, reject) {

		var repository, repositoryId;
		var channelId;
		var collectionId;
		var isBusinessRepo;

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
				isBusinessRepo = repository.repositoryType && repository.repositoryType === 'Business';
				console.log(' - get repository (type: ' + (isBusinessRepo ? 'Business' : 'Asset') + ')');

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

				var channelPromises = isBusinessRepo ? [] : [serverRest.getChannelWithName({
					server: server,
					name: channelName
				})];

				return Promise.all(channelPromises);

			})
			.then(function (results) {

				//
				// Get channel
				//
				if (!isBusinessRepo) {
					if (!results || !results[0] || results[0].err) {
						return Promise.reject();
					}

					channelId = results[0].data && results[0].data.id;

					if (channelName) {
						if (!channelId) {
							// need to create the channel first
							createChannelPromises.push(serverRest.createChannel({
								server: server,
								name: channelName
							}));
						} else {
							console.log(' - get channel (Id: ' + channelId + ')');
						}
					}
				}
				return Promise.all(createChannelPromises);
			})
			.then(function (results) {
				//
				// Create channel
				//
				if (!isBusinessRepo && channelName) {
					if (results.length > 0) {
						if (results[0].err) {
							return Promise.reject();
						}

						channelId = results[0] && results[0].id;
						console.log(' - create channel ' + channelName + ' (Id: ' + channelId + ')');
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
				}

				return Promise.all(addChannelToRepositoryPromises);
			})
			.then(function (results) {
				//
				// add channel to repository
				//
				if (!isBusinessRepo && channelName) {
					if (results.length > 0) {
						if (results[0].err) {
							return Promise.reject();
						}

						console.log(' - add channel ' + channelName + ' to repository ' + repositoryName);
					}
				}

				var args = {
					server: server,
					contentpath: contentpath,
					contentfilename: contentfilename,
					zippath: path.join(contentpath, contentfilename),
					projectDir: projectDir,
					repositoryName: repositoryName,
					repositoryId: repositoryId,
					repositoryType: repository.repositoryType,
					channelName: channelName,
					channelId: channelId,
					collectionName: collectionName,
					collectionId: collectionId,
					updateContent: updateContent,
					reuseContent: reuseContent,
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

var _importContent = function (server, csrfToken, contentZipFileId, repositoryId, channelId, collectionId, updateContent, typesOnly, reuseContent) {
	var importPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1.1/content-templates/importjobs';

		var postData = {
			'exportDocId': contentZipFileId,
			'repositoryId': repositoryId,
			'channelIds': channelId ? [channelId] : []
		};

		if (reuseContent) {
			// does not update existing content if the content in repo is newer than content being imported
			postData.source = 'reuseExisting';
		} else if (updateContent) {
			// update the existing content items (if any) instead of creating new ones
			postData.source = 'alwaysUpdate';
		}

		if (collectionId) {
			postData.collections = [collectionId];
		}

		// Support downgrade if advanced video not enabled
		postData.allowVideoDowngrade = true;

		if (typesOnly) {
			url = url + '?import=types';
		}

		var options = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-TOKEN': csrfToken,
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server)
			},
			body: JSON.stringify(postData)
		};
		// console.log(options);

		var request = require('../test/server/requestUtils.js').request;
		request.post(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to import' + ' (ecid: ' + response.ecid + ')');
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
				console.log(' - submit import job (' + jobId + ')' + (reuseContent ? ', reuse existing content' : (updateContent ? ', updating content' : '')));

				// Wait for job to finish
				var startTime = new Date();
				var needNewline = false;
				var inter = setInterval(function () {
					var checkImportStatusPromise = serverRest.getContentJobStatus({
						server: server,
						jobId: jobId
					});
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
							console.log('ERROR: import failed: ' + data.errorDescription + ' (ecid: ' + response.ecid + ')');
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
				console.log('ERROR: failed to import: ' + response.statusCode + ' (ecid: ' + response.ecid + ')');
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
		reuseContent = args.reuseContent,
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
				reuseContent: reuseContent,
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

		var exitCode;

		var loginPromise = serverUtils.loginToServer(server);
		loginPromise.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage);
				done();
				return;
			}

			var channelName = argv.channel;
			var collectionName = argv.collection;
			var action = argv.action;
			var dateToPublish = argv.date;
			var publishingJobName = argv.name;
			var repositoryName = argv.repository;
			var assetGUIDS = argv.assets ? argv.assets.split(',') : [];
			var query = argv.query;

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
					}
					if (query) {
						if (q) {
							q = q + ' AND ';
						}
						q = q + '(' + query + ')';
					}
					console.log(' - q: ' + q);

					return serverRest.queryItems({
						server: server,
						q: q,
						fields: 'name,status,isPublished,publishedChannels'
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

						// Get published channels
						var publishedChannels = [];
						if (item.publishedChannels && item.publishedChannels.data && item.publishedChannels.data.length > 0) {
							item.publishedChannels.data.forEach(function (channel) {
								if (channel.id && !publishedChannels.includes(channel.id)) {
									publishedChannels.push(channel.id);
								}
							});
						}

						if (publishPolicy) {
							if (publishPolicy === 'onlyApproved') {
								if (item.status === 'approved') {
									toPublishItemIds.push(item.id);
								}
							} else {
								if (item.status !== 'rejected' && (item.status !== 'published' || channel && !publishedChannels.includes(channel.id))) {
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
						exitCode = 2;
						return Promise.reject();
					}

					if (action === 'unpublish' && !hasPublishedItems) {
						console.log(' - all items are already draft');
						exitCode = 2;
						return Promise.reject();
					}

					if (action === 'publish') {
						if (dateToPublish) {
							var dateObj = new Date(dateToPublish);

							// make sure we had a valid date 
							if (isNaN(dateObj.valueOf())) {
								console.log('ERROR: invalid date - "' + dateToPublish + '"');
								return cmdEnd(done);
							}

							var date = ("0" + dateObj.getDate()).slice(-2),
								month = ("0" + (dateObj.getMonth() + 1)).slice(-2),
								year = dateObj.getFullYear(),
								hours = ("0" + dateObj.getHours()).slice(-2),
								minutes = ("0" + dateObj.getMinutes()).slice(-2),
								seconds = ("0" + dateObj.getSeconds()).slice(-2),
								timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

							var opPromise = serverRest.publishLaterChannelItems({
								server: server,
								channelId: channel.id,
								repositoryId: repository.id,
								itemIds: toPublishItemIds,
								name: publishingJobName,
								schedule: {
									frequency: 'one-off',
									at: {
										date: year + "-" + month + "-" + date,
										time: hours + ":" + minutes + ":" + seconds,
										zone: timezone
									}
								}
							});
							opPromise.then(function (result) {
								if (result.err) {
									return cmdEnd(done);
								} else {
									return cmdSuccess(done, true);
								}
							});
						} else {
							var plPromise = _performOneOp(server, action, channel.id, toPublishItemIds, true);
							plPromise.then(function (result) {
								if (result.err) {
									return cmdEnd(done);
								} else {
									return cmdSuccess(done, true);
								}
							});
						}

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
					cmdEnd(done, exitCode);
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

	// console.log(JSON.stringify(policyValidation, null, 4));
	console.log('Failed to ' + action + ' the following items: ' + (policyValidation.error ? policyValidation.error : ''));
	var format = '  %-36s  %-60s  %-s';
	console.log(sprintf(format, 'Id', 'Name', 'Message'));
	for (var i = 0; i < blockingItems.length; i++) {
		console.log(sprintf(format, blockingItems[i].id, blockingItems[i].name, blockingItems[i].message));
	}

};

module.exports.createDigitalAsset = function (argv, done) {
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

	var documents = typeof argv.documents === 'string' && argv.documents.toLowerCase() === 'true';

	var srcFiles = [];

	var sources = argv.from.split(',');
	// console.log(sources);

	if (!documents) {
		sources.forEach(function (srcPath) {
			if (srcPath.indexOf('~/') === 0) {
				srcPath = srcPath.replace('~', os.homedir());
			}

			if (!path.isAbsolute(srcPath)) {
				srcPath = path.join(projectDir, srcPath);
			}
			srcPath = path.resolve(srcPath);

			if (!fs.existsSync(srcPath)) {
				console.log('ERROR: ' + srcPath + ' does not exist');
			} else {

				if (fs.statSync(srcPath).isFile()) {
					srcFiles.push(srcPath);
				} else {
					// get folder content
					var items = fs.readdirSync(srcPath);
					for (var i = 0; i < items.length; i++) {
						if (fs.statSync(path.join(srcPath, items[i])).isFile()) {
							srcFiles.push(path.join(srcPath, items[i]));
						}
					}
				}
			}
		});
		if (srcFiles.length === 0) {
			done();
			return;
		}
	}
	// console.log(srcFiles);

	var attributes;
	if (argv.attributes) {
		var attrsFilePath = argv.attributes;
		if (!path.isAbsolute(attrsFilePath)) {
			attrsFilePath = path.join(projectDir, attrsFilePath);
		}
		attrsFilePath = path.resolve(attrsFilePath);
		if (!fs.existsSync(attrsFilePath)) {
			console.log('ERROR: ' + attrsFilePath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(attrsFilePath).isFile()) {
			console.log('ERROR: ' + attrsFilePath + ' is not a file');
			done();
			return;
		}

		try {
			attributes = JSON.parse(fs.readFileSync(attrsFilePath));
		} catch (e) {
			// console.log(e);
			console.log('ERROR: file ' + attrsFilePath + ' is not valid json file');
			done();
			return;
		}
		// console.log(attributes);
	}

	var repositoryName = argv.repository;
	var typeName = argv.type;
	var slug = argv.slug;
	var language = argv.language;
	var nontranslatable = typeof argv.nontranslatable === 'string' && argv.nontranslatable.toLowerCase() === 'true';
	const isBuiltinDT = ['Image', 'Video', 'File'].includes(typeName);

	var repository;
	var contentType;
	var docs;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var getDocumentsPromises = [];
		if (documents) {
			getDocumentsPromises.push(_getDocumentForAssets(server, sources));
		}

		Promise.all(getDocumentsPromises)
			.then(function (results) {
				docs = results && results[0] || [];
				if (documents && docs.length === 0) {
					return Promise.reject();
				}

				return serverRest.getRepositoryWithName({
					server: server,
					name: repositoryName
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.data) {
					console.log('ERROR: repository ' + repositoryName + ' does not exist');
					return Promise.reject();
				}

				repository = result.data;
				if (!repository.contentTypes || repository.contentTypes.length === 0) {
					console.log('ERROR: repository ' + repositoryName + ' has no content type');
					return Promise.reject();
				}

				console.log(' - verify repository (Id: ' + repository.id + ')');
				console.log(' - repository configured languages: ' + repository.configuredLanguages);

				if (language && !repository.configuredLanguages.includes(language)) {
					console.log('ERROR: repository is not configured with language ' + language);
					return Promise.reject();
				}

				return serverRest.getContentType({
					server: server,
					name: typeName
				});
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					// console.log('ERROR: type ' + typeName + ' does not exist');
					return Promise.reject();
				}

				contentType = result;
				if (contentType.typeCategory !== 'DigitalAssetType') {
					console.log('ERROR: type ' + typeName + ' is not a digital asset type');
					return Promise.reject();
				}

				// check if the type is associated with the repository
				var foundType = false;
				for (var i = 0; i < repository.contentTypes.length; i++) {
					if (repository.contentTypes[i].name === typeName) {
						foundType = true;
						break;
					}
				}
				if (!foundType) {
					console.log('ERROR: type ' + typeName + ' is not associated with the repository');
					return Promise.reject();
				}

				console.log(' - verify type (allowed file types: ' + contentType.allowedFileTypes + ')');

				if (isBuiltinDT && language) {
					console.log(' - cannot set language for type ' + typeName);
				}

				var translatable = isBuiltinDT || repository.repositoryType === 'Business' ? undefined : !nontranslatable;
				var langToUse = isBuiltinDT || repository.repositoryType === 'Business' ? undefined : language;

				return documents ? _createDigitalAssetsFromDocuments(server, repository.id, typeName, docs, attributes, slug, translatable, langToUse) :
					_createDigitalAssets(server, repository.id, typeName, srcFiles, attributes, slug, translatable, langToUse);
			})
			.then(function (result) {

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

var _getDocumentForAssets = function (server, sources) {
	return new Promise(function (resolve, reject) {
		var srcDocuments = [];

		var doGetDoc = sources.reduce(function (docPromise, srcPath) {
				return docPromise.then(function (result) {
					var folderPath = srcPath === '/' ? [] : srcPath.split('/');
					return documentUtils.findFolder(server, 'self', folderPath, false)
						.then(function (result) {
							if (result && result.id) {
								if (result.id === 'self' || result.type === 'folder') {
									// Get all child files
									return serverRest.getChildItems({
										server: server,
										parentID: result.id,
										limit: 10000
									}).then(function (result) {
										var items = result && result.items || [];
										for (var i = 0; i < items.length; i++) {
											if (items[i].type === 'file') {
												srcDocuments.push({
													id: items[i].id,
													name: items[i].name,
													path: srcPath + '/' + items[i].name
												});
											}
										}
									});
								} else {
									// it is a file
									srcDocuments.push({
										id: result.id,
										name: result.name,
										path: srcPath
									});
								}
							} else {
								console.log('ERROR: document ' + srcPath + ' does not exist');
							}
						});
				});
			},
			Promise.resolve({})
		);

		doGetDoc.then(function (result) {
			resolve(srcDocuments);
		});
	});
};

var _createDigitalAssets = function (server, repositoryId, type, srcFiles, attributes, slug, translatable, language) {

	return new Promise(function (resolve, reject) {
		var created = [];
		var doCreateAsset = srcFiles.reduce(function (assetPromise, file) {
				return assetPromise.then(function (result) {
					var fileName = file.substring(file.lastIndexOf(path.sep) + 1);
					return serverRest.createDigitalItem({
						server: server,
						repositoryId: repositoryId,
						type: type,
						filename: fileName,
						contents: fs.createReadStream(file),
						fields: attributes,
						slug: (srcFiles.length === 1 ? slug : ''),
						translatable: translatable,
						language: language
					}).then(function (result) {
						if (result && result.id) {
							created.push(result);
							console.log(' - created ' + type + ' asset (name: ' + result.name + ' Id: ' + result.id + ' slug: ' + result.slug +
								' translatable: ' + result.translatable + ' language: ' + result.language + ')');
						}
					});
				});
			},
			Promise.resolve({})
		);

		doCreateAsset.then(function (result) {
			resolve(created);
		});
	});
};

var _createDigitalAssetsFromDocuments = function (server, repositoryId, type, srcDocs, attributes, slug, translatable, language) {

	return new Promise(function (resolve, reject) {
		var created = [];
		var doCreateAsset = srcDocs.reduce(function (assetPromise, doc) {
				return assetPromise.then(function (result) {
					return serverRest.createDigitalItemFromDocuments({
						server: server,
						repositoryId: repositoryId,
						type: type,
						docId: doc.id,
						docName: doc.name,
						fields: attributes,
						slug: (srcDocs.length === 1 ? slug : ''),
						translatable: translatable,
						language: language
					}).then(function (result) {
						if (result && result.id) {
							// query item
							return serverRest.getItem({
									server: server,
									id: result.id
								})
								.then(function (result) {
									if (result && result.id) {
										created.push(result);
										console.log(' - created ' + type + ' asset (name: ' + result.name + ' Id: ' + result.id + ' slug: ' + result.slug +
											' translatable: ' + result.translatable + ' language: ' + result.language + ')');
									}
								});
						}
					});
				});
			},
			Promise.resolve({})
		);

		doCreateAsset.then(function (result) {
			resolve(created);
		});
	});
};

module.exports.updateDigitalAsset = function (argv, done) {
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

	var srcPath = argv.from;
	if (srcPath) {
		if (!path.isAbsolute(srcPath)) {
			srcPath = path.join(projectDir, srcPath);
		}
		srcPath = path.resolve(srcPath);

		if (!fs.existsSync(srcPath)) {
			console.log('ERROR: ' + srcPath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(srcPath).isFile()) {
			console.log('ERROR: ' + srcPath + ' is not a file');
			done();
		}
	}
	var attributes;
	if (argv.attributes) {
		var attrsFilePath = argv.attributes;
		if (!path.isAbsolute(attrsFilePath)) {
			attrsFilePath = path.join(projectDir, attrsFilePath);
		}
		attrsFilePath = path.resolve(attrsFilePath);
		if (!fs.existsSync(attrsFilePath)) {
			console.log('ERROR: ' + attrsFilePath + ' does not exist');
			done();
			return;
		}
		if (!fs.statSync(attrsFilePath).isFile()) {
			console.log('ERROR: ' + attrsFilePath + ' is not a file');
			done();
			return;
		}

		try {
			attributes = JSON.parse(fs.readFileSync(attrsFilePath));
		} catch (e) {
			// console.log(e);
			console.log('ERROR: file ' + attrsFilePath + ' is not valid json file');
			done();
			return;
		}
		// console.log(attributes);
	}

	var slug = argv.slug;
	var language = argv.language;

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		var item;

		var exitCode;

		serverRest.getItem({
				server: server,
				id: argv.id
			})
			.then(function (result) {
				if (!result || result.err || !result.id) {
					return Promise.reject();
				}

				item = result;
				if (item.typeCategory !== 'DigitalAssetType') {
					console.log(' - item is not a digital asset');
					exitCode = 2;
					return Promise.reject();
				}
				console.log(' - verify item (type: ' + item.type + ' name: ' + item.name + ' slug: ' + item.slug + ')');

				if (language) {
					item.language = language;
				}

				if (slug) {
					item.slug = slug;
				}

				var contents = srcPath ? fs.createReadStream(srcPath) : '';

				if (attributes && Object.keys(attributes).length > 0) {
					Object.keys(attributes).forEach(function (key) {
						var value = attributes[key];
						if (item.fields.hasOwnProperty(key)) {
							item.fields[key] = value;
						}
					});
				}
				return serverRest.updateDigitalItem({
					server: server,
					item: item,
					contents: contents
				});
			})
			.then(function (result) {
				if (!result || result.err) {
					return Promise.reject();
				}
				var updated = result;
				var format = '   %-12s  %-s';
				console.log(' - asset updated');
				console.log(sprintf(format, 'Id', updated.id));
				console.log(sprintf(format, 'Type', updated.type));
				console.log(sprintf(format, 'Name', updated.name));
				console.log(sprintf(format, 'Slug', updated.slug));
				console.log(sprintf(format, 'Version', updated.version));
				console.log(sprintf(format, 'Translatable', updated.translatable));
				console.log(sprintf(format, 'Language', updated.language));

				done(true);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				done(exitCode);
			});
	});
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

	serverUtils.loginToServer(server).then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
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

	var loginPromise = serverUtils.loginToServer(server);
	loginPromise.then(function (result) {
		if (!result.status) {
			console.log(result.statusMessage);
			done();
			return;
		}

		serverUtils.browseCollectionsOnServer(server)
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

				return _exportContentIC(server, collectionId, exportFilePath);
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
var _exportContentIC = function (server, collectionId, exportfilepath) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/content/management/api/v1/content-templates/exportjobs';
		var contentTemplateName = 'contentexport';
		var postData = {
			'name': contentTemplateName,
			'targetIds': [{
				id: collectionId
			}]
		};

		var options = {
			method: 'POST',
			url: url,
			headers: {
				'Content-Type': 'application/json',
				'X-REQUESTED-WITH': 'XMLHttpRequest',
				Authorization: serverUtils.getRequestAuthorization(server),
				Cookie: server.cookies
			},
			body: JSON.stringify(postData)
		};
		// console.log(options);

		var request = require('../test/server/requestUtils.js').request;
		request.post(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to export' + ' (ecid: ' + response.ecid + ')');
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
									headers: {
										'Content-Type': 'application/zip',
										Authorization: serverUtils.getRequestAuthorization(server),
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
							console.log('ERROR: export failed: ' + data.errorDescription + ' (ecid: ' + response.ecid + ')');
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
				console.log('ERROR: failed to export: ' + msg + ' (ecid: ' + response.ecid + ')');
				return resolve({
					err: 'err'
				});
			}
		});
	});

};


var _getSiteAssetsFromOtherRepos = function (server, siteChannelId, siteRepositoryId, publishedassets) {
	return new Promise(function (resolve, reject) {
		if (!siteChannelId || !siteRepositoryId) {
			return resolve({});
		}
		var q = 'repositoryId ne "' + siteRepositoryId + '" AND channels co "' + siteChannelId + '"';
		if (publishedassets) {
			q = q + ' AND status eq "published"';
		}
		return serverRest.queryItems({
			server: server,
			q: q
		}).then(function (result) {
			return resolve(result);
		});
	});
};

var _siteHasAssets = function (server, siteChannelId, siteRepositoryId, publishedassets) {
	return new Promise(function (resolve, reject) {
		if (!siteChannelId || !siteRepositoryId) {
			return resolve({
				hasAssets: false
			});
		}
		var q = 'repositoryId eq "' + siteRepositoryId + '" AND channels co "' + siteChannelId + '"';
		if (publishedassets) {
			q = q + ' AND status eq "published"';
		}
		serverRest.queryItems({
				server: server,
				q: q,
				limit: 1
			})
			.then(function (result) {
				var items = result && result.data || [];
				return resolve({
					hasAssets: (items.length > 0 ? true : false)
				});
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
	var reuseContent = typeof argv.reuse === 'string' && argv.reuse.toLowerCase() === 'true';
	var addtositecollection = typeof argv.addtositecollection === 'string' && argv.addtositecollection.toLowerCase() === 'true';
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
	var destSite;
	var channelId;
	var channelName;
	var channelToken;

	var isWindows = /^win/.test(process.platform) ? true : false;

	var siteName2 = serverUtils.replaceAll(siteName, ' ', '');
	var downloadContentFileName = siteName2 + '_downloadcontent' + (isWindows ? '.bat' : '');
	var uploadContentFileName = siteName2 + '_uploadcontent' + (isWindows ? '.bat' : '');
	var downloadContentFilePath = path.join(projectDir, downloadContentFileName);
	var uploadContentFilePath = path.join(projectDir, uploadContentFileName);

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage + ' ' + destServer.url);
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
				console.log('ERROR: site ' + siteName + ' not found on server ' + server.name);
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

			// verify site on target server
			return sitesRest.getSite({
				server: destServer,
				name: siteName,
				expand: 'channel,repository,defaultCollection'
			});
		})
		.then(function (result) {
			if (!result || result.err) {
				console.log('ERROR: site ' + siteName + ' not found on server ' + destServer.name);
				return Promise.reject();
			}

			destSite = result;
			console.log(' - site default collection (Id: ' + destSite.defaultCollection.id + ' name: ' + destSite.defaultCollection.name + ')');

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

			var destRepo = result.data;
			if (destRepo.repositoryType && destRepo.repositoryType.toLowerCase() === 'business') {
				console.log('ERROR: repository ' + repositoryName + ' is a business repository');
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

			// query all items in the site channel
			return _getAllItems(server, site.repository, site.channel, publishedassets);

		})
		.then(function (result) {
			if (!result || result.length === 0) {
				console.log('ERROR: no item in the site channel');
				return Promise.reject();
			}
			items = result;

			// query items from other repository 
			return _getSiteAssetsFromOtherRepos(server, channelId, site.repository.id, publishedassets);

		})
		.then(function (result) {

			otherItems = result && result.data || [];

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
				});
			}

			var downloadScript = 'cd "' + projectDir + '"' + os.EOL + os.EOL;
			var uploadScript = 'cd "' + projectDir + '"' + os.EOL + os.EOL;
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

			var collectionName = destServer.defaultCollection && destServer.defaultCollection.name || (siteName + ' Site');

			for (var i = 0; i < groups.length; i++) {
				ids = groups[i];
				groupName = siteName2 + '_content_batch_' + i.toString();

				// save ids to file
				var assetsFile = path.join(distFolder, groupName + '_assets');
				fs.writeFileSync(assetsFile, JSON.stringify(ids.split(',')));

				// download command for this group
				cmd = winCall + 'cec download-content ' + channelName;
				if (publishedassets) {
					cmd += ' -p';
				}
				cmd += ' -n ' + groupName;
				cmd += ' -s ' + serverName;
				cmd += ' -f "' + assetsFile + '"';

				downloadScript += 'echo "*** download-content ' + groupName + '"' + os.EOL;
				downloadScript += cmd + os.EOL + os.EOL;

				// upload command for this group
				zipPath = path.join(distFolder, groupName + '_export.zip');
				cmd = winCall + 'cec upload-content "' + zipPath + '" -f';
				if (reuseContent) {
					// update older content only
					cmd += ' --reuse';
				} else {
					// update all content
					cmd += ' --update';
				}
				cmd += ' -r "' + repositoryName + '"';
				cmd += ' -c ' + channelName;
				if (addtositecollection) {
					cmd += ' -l "' + collectionName + '"';
				}
				cmd += ' -s ' + destServerName;

				uploadScript += 'echo "*** upload-content ' + groupName + '"' + os.EOL;
				uploadScript += cmd + os.EOL + os.EOL;

			}

			// download / upload for other repositories
			// console.log(repoMappings);
			for (var i = 0; i < repoMappings.length; i++) {
				if (repoMappings[i].items.length > 0) {
					groupName = siteName2 + '_content_batch_others_' + i.toString();

					// save ids to file
					var assetsFile = path.join(distFolder, groupName + '_assets');
					fs.writeFileSync(assetsFile, JSON.stringify(repoMappings[i].items));

					cmd = winCall + 'cec download-content ' + channelName;
					if (publishedassets) {
						cmd += ' -p';
					}
					cmd += ' -n ' + groupName;
					cmd += ' -s ' + serverName;
					cmd += ' -f "' + assetsFile + '"';

					downloadScript += 'echo "*** download-content ' + groupName + '"' + os.EOL;
					downloadScript += cmd + os.EOL + os.EOL;

					zipPath = path.join(distFolder, groupName + '_export.zip');
					cmd = winCall + 'cec upload-content "' + zipPath + '" -f';
					if (reuseContent) {
						// update older content only
						cmd += ' --reuse';
					} else {
						// update all content
						cmd += ' --update';
					}
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
				var scriptPath = '"' + downloadContentFilePath.substring(0, downloadContentFilePath.lastIndexOf(path.sep)) + '"' +
					downloadContentFilePath.substring(downloadContentFilePath.lastIndexOf(path.sep));
				var downloadCmd = childProcess.execSync(scriptPath, {
					stdio: 'inherit'
				});

				console.log('');
				console.log('Executing script ' + uploadContentFileName + ' ...');
				scriptPath = '"' + uploadContentFilePath.substring(0, uploadContentFilePath.lastIndexOf(path.sep)) + '"' +
					uploadContentFilePath.substring(uploadContentFilePath.lastIndexOf(path.sep));
				var uploadCmd = childProcess.execSync(scriptPath, {
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


/**
 * Create transfer content scripts
 */
module.exports.transferContent = function (argv, done) {
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
	var reuseContent = typeof argv.reuse === 'string' && argv.reuse.toLowerCase() === 'true';

	var repositoryName = argv.repository;
	var channelName = argv.channel;

	var limit = argv.number || 200;

	var srcRepo, destRepo;
	var srcChannel;

	var total;
	var items = [];
	var channelId;
	var channelToken;

	var isWindows = /^win/.test(process.platform) ? true : false;

	var repoName2 = serverUtils.replaceAll(repositoryName, ' ', '');
	var downloadContentFileName = repoName2 + '_downloadcontent' + (isWindows ? '.bat' : '');
	var uploadContentFileName = repoName2 + '_uploadcontent' + (isWindows ? '.bat' : '');
	var downloadContentFilePath = path.join(projectDir, downloadContentFileName);
	var uploadContentFilePath = path.join(projectDir, uploadContentFileName);


	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			return serverUtils.loginToServer(destServer);
		})
		.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage + ' ' + destServer.url);
				return Promise.reject();
			}

			// verify repository on source server
			return serverRest.getRepositoryWithName({
				server: server,
				name: repositoryName
			});

		})
		.then(function (result) {
			if (!result || result.err || !result.data) {
				console.log('ERROR: repository ' + repositoryName + ' does not exist on ' + serverName);
				return Promise.reject();
			}
			srcRepo = result.data;
			console.log(' - verify repository on source server');

			// verify repository on target server
			return serverRest.getRepositoryWithName({
				server: destServer,
				name: repositoryName
			});

		})
		.then(function (result) {
			if (!result || result.err || !result.data) {
				console.log('ERROR: repository ' + repositoryName + ' does not exist on ' + destServerName);
				return Promise.reject();
			}

			destRepo = result.data;
			console.log(' - verify repository on destination server');

			var channelPromises = channelName ? [serverRest.getChannelWithName({
				server: server,
				name: channelName
			})] : [];

			return Promise.all(channelPromises);

		})
		.then(function (results) {
			if (channelName) {
				if (!results || !results[0] || results[0].err || !results[0].data) {
					console.log('ERROR: channel ' + channelName + ' does not exist on ' + serverName);
					return Promise.reject();
				}
				srcChannel = results[0].data;
				channelId = srcChannel.id;
				channelName = srcChannel.name;
				channelToken = _getChannelToken(srcChannel);

				console.log(' - verify channel on source server');
			}

			return _getAllItems(server, srcRepo, srcChannel, publishedassets);

		})
		.then(function (result) {
			if (!result || result.length === 0) {
				console.log('ERROR: no item to transfer');
				return Promise.reject();
			}

			items = result;
			// console.log(' - total items: ' + items.length);

			var downloadScript = 'cd "' + projectDir + '"' + os.EOL + os.EOL;
			var uploadScript = 'cd "' + projectDir + '"' + os.EOL + os.EOL;
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

				var idx = serverUtils.lpad((i + 1).toString(), '0', 3);
				groupName = repoName2 + '_content_batch_' + idx;

				// save ids to file
				var assetsFile = path.join(distFolder, groupName + '_assets');
				fs.writeFileSync(assetsFile, JSON.stringify(ids.split(',')));

				// download command for this group
				cmd = winCall + 'cec download-content';
				if (channelName) {
					cmd += ' "' + channelName + '"';
				}
				if (publishedassets) {
					cmd += ' -p';
				}
				cmd += ' -r "' + repositoryName + '"';
				cmd += ' -n ' + groupName;
				cmd += ' -s ' + serverName;
				cmd += ' -f "' + assetsFile + '"';

				downloadScript += 'echo "*** download-content ' + groupName + '"' + os.EOL;
				downloadScript += cmd + os.EOL + os.EOL;

				// upload command for this group
				zipPath = path.join(distFolder, groupName + '_export.zip');
				cmd = winCall + 'cec upload-content "' + zipPath + '" -f';
				if (reuseContent) {
					// update older content only
					cmd += ' --reuse';
				} else {
					// update all content
					cmd += ' --update';
				}
				cmd += ' -r "' + repositoryName + '"';
				if (channelName) {
					cmd += ' -c "' + channelName + '"';
				}
				cmd += ' -s ' + destServerName;

				uploadScript += 'echo "*** upload-content ' + groupName + '"' + os.EOL;
				uploadScript += cmd + os.EOL + os.EOL;

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
				var scriptPath = '"' + downloadContentFilePath.substring(0, downloadContentFilePath.lastIndexOf(path.sep)) + '"' +
					downloadContentFilePath.substring(downloadContentFilePath.lastIndexOf(path.sep));
				var downloadCmd = childProcess.execSync(scriptPath, {
					stdio: 'inherit'
				});

				console.log('');
				console.log('Executing script ' + uploadContentFileName + ' ...');
				scriptPath = '"' + uploadContentFilePath.substring(0, uploadContentFilePath.lastIndexOf(path.sep)) + '"' +
					uploadContentFilePath.substring(uploadContentFilePath.lastIndexOf(path.sep));
				var uploadCmd = childProcess.execSync(scriptPath, {
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

var _getAllItems = function (server, repository, channel, publishedassets) {
	return new Promise(function (resolve, reject) {
		var items;
		serverRest.getAllItemIds({
				server: server,
				repositoryId: repository.id,
				channelId: channel && channel.id,
				publishedassets: publishedassets
			})
			.then(function (result) {

				items = result && result.data || [];
				console.log(' - total items: ' + items.length);

				return _getMasterItems(server, items);
			})
			.then(function (result) {

				var masterItems = result || [];
				if (masterItems.length !== items.length) {
					console.log(' - total master items: ' + masterItems.length);
				}

				return resolve(masterItems);
			})
			.catch((error) => {
				if (error) {
					console.log(error);
				}
				return resolve([]);
			});
	});
};

var _getMasterItems = function (server, items) {
	var masterItems = [];
	return new Promise(function (resolve, reject) {
		if (items.length === 0) {
			return resolve(masterItems);
		}

		var total = items.length;
		var groups = [];
		var limit = 100;
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
		var startTime = new Date();
		var doQueryItems = groups.reduce(function (itemPromise, param) {
				return itemPromise.then(function (result) {
					var idq = '';
					for (var i = param.start; i <= param.end; i++) {
						if (items[i] && items[i].id) {
							if (idq) {
								idq = idq + ' OR ';
							}
							idq = idq + 'id eq "' + items[i].id + '"';
						}
					}
					var q = 'languageIsMaster eq "true" AND (' + idq + ')';
					// console.log(q);

					return serverRest.queryItems({
						server: server,
						q: q
					}).then(function (result) {
						if (result && result.data && result.data.length > 0) {
							masterItems = masterItems.concat(result.data);
							process.stdout.write(' - fetching master items ' + masterItems.length + ' [' + serverUtils.timeUsed(startTime, new Date()) + '] ...');
							readline.cursorTo(process.stdout, 0);
						}
					});

				});
			},
			// Start with a previousPromise value that is a resolved promise 
			Promise.resolve({}));

		doQueryItems.then(function (result) {
			if (masterItems.length > 0) {
				process.stdout.write(os.EOL);
			}
			resolve(masterItems);
		});

	});
};


module.exports.uploadCompiledContent = function (argv, done) {
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

	var filePath = argv.path;
	if (!path.isAbsolute(filePath)) {
		filePath = path.join(projectDir, filePath);
	}
	filePath = path.resolve(filePath);

	if (!fs.existsSync(filePath)) {
		console.log('ERROR: file ' + filePath + ' does not exist');
		done();
		return;
	}
	if (!fs.statSync(filePath).isFile()) {
		console.log('ERROR: ' + filePath + ' is not a file');
		done();
		return;
	}

	serverUtils.loginToServer(server)
		.then(function (result) {
			if (!result.status) {
				console.log(result.statusMessage + ' ' + server.url);
				return Promise.reject();
			}

			console.log(' - verify file');

			return serverRest.importCompiledContent({
				server: server,
				filePath: filePath
			});

		})
		.then(function (result) {
			if (!result || result.err) {
				return Promise.reject();
			}

			console.log(' - compiled content imported');
			done(true);
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

var _syncExportItemFromSource = function (server, id, name, filePath) {
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
										headers: {
											Authorization: serverUtils.getRequestAuthorization(server)
										},
										encoding: null
									};
									//
									// Download the export zip
									var request = require('../test/server/requestUtils.js').request;
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


			return _syncExportItemFromSource(srcServer, id, item.name, filePath);
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
							var deleteArgv = {
								file: fileName,
								permanent: 'true'
							};
							documentUtils.deleteFile(deleteArgv, destServer, false)
								.then(function (result) {
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
	downloadContent: _downloadContentUtil,
	uploadContent: _uploadContentUtil,
	getSiteAssetsFromOtherRepos: _getSiteAssetsFromOtherRepos,
	siteHasAssets: _siteHasAssets
};