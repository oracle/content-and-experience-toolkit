/* globals app, module, __dirname */
var path = require('path'),
	exec = require('child_process').exec,
	serverUtils = require('../server/serverUtils'),
	sitesRest = require('../server/sitesRest.js'),
	fs = require('fs');

const cecCmd = /^win/.test(process.platform) ? 'cec.cmd' : 'cec';
const UPDATESTATUSRETRY = 5;
const UPDATESTATUSERRORCODE = "IRRECOVERABLE_ERROR";

var JobManager = function (args) {
		this.ps = args.ps;
	},
	logsDir = '',
	compileStepTimeoutValue = 0;

// Use the project dir in the env
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR;


JobManager.prototype.setLogsDir = function (inputLogsDir) {
	logsDir = inputLogsDir;
};

JobManager.prototype.setCompileStepTimeoutValue = function (timeoutValue) {
	compileStepTimeoutValue = timeoutValue;
};

JobManager.prototype.compileSite = function (jobConfig) {
	var self = this,
		jobId = jobConfig.id,
		siteName = jobConfig.siteName,
		secureSite = false,
		publishUsedContentOnly = jobConfig.publishUsedContentOnly,
		doForceActivate = jobConfig.doForceActivate,
		serverName = 'serverForCompilation',
		serverEndpoint = jobConfig.serverEndpoint,
		serverUser = jobConfig.serverUser,
		serverPass = jobConfig.serverPass,
		token = jobConfig.token,
		match = /[a-z]*([0-9]*)/.exec(jobId),
		id = match[1], // group 1 has the digits, e.g. 123456 of job123456
		templateName = siteName + id + 'ForCompile',
		channelToken,
		compileStartTime = Date.now(),
		processEnv = process.env,
		inDocker = false; // In docker container or not?

	if (fs.existsSync("/.dockerenv")) {
		inDocker = true;
	}

	var scriptFile = path.join(__dirname, 'compileExec.sh');

	// update the site metadata promise to get the metadata for this compile
	self.serverName = serverName;


	// TODO: For debugging.
	// console.log('compileSite jobId', jobId, 'siteName', siteName);
	// console.log('__dirname', __dirname);
	// console.log('projectDir', projectDir);

	// Set values based on jobConfig
	var templatesDir = path.join(projectDir, 'src', 'templates');

	processEnv.HOME = projectDir;
	// This is necessary to avoid the 200 seconds delay to get the close event
	// after cecCmd has completed on Windows.
	// See: https://github.com/nodejs/node/issues/21632
	processEnv.NO_UPDATE_NOTIFIER = true;

	var cecDefaults = {
			cwd: projectDir,
			env: processEnv,
			maxBuffer: 1024 * 1024 * 10
		},
		cecDefaultsForCompileStep = Object.assign({}, cecDefaults);

	if (compileStepTimeoutValue) {
		cecDefaultsForCompileStep.timeout = compileStepTimeoutValue;
	}

	return new Promise(function (resolve, reject) {

		var logStream;

		var logPublishSiteStdout = function (data) {
				var out = `${data}`,
					found = out.trim().match(/publish \(JobID\: (?<id>.*)\)$/);

				if (found && found.groups && found.groups.id) {
					jobConfig.publishSiteBackgroundJobId = found.groups.id;
				}

				logStdout(data);
			},
			logPublishStaticStdout = function (data) {
				var out = `${data}`,
					found = out.trim().match(/publish \(JobID\: (?<id>.*)\)$/);

				if (found && found.groups && found.groups.id) {
					jobConfig.publishStaticBackgroundJobId = found.groups.id;
				}

				logStdout(data);
			},
			logStdout = function (data) {
				console.log('stdout:', `${data}`);
				logStream.write(`${data}`);
			},
			logStderr = function (data) {
				console.log('stderr:', `${data}`);
				logStream.write(`${data}`);
			},
			logCode = function (commndString, code) {
				var message = commndString + ' child process exited with code ' + `${code}` + '\n';
				console.log(commndString, 'child process exited with code', `${code}`);
				logStream.write(message);
			},
			logDuration = function (jobConfig, step, startTime) {
				var message = jobConfig.id + ' ' + step + ' duration ' + Math.floor((Date.now() - startTime) / 1000) + ' seconds' + '\n';
				console.log(jobConfig.id, step, 'duration', Math.floor((Date.now() - startTime) / 1000), 'seconds');
				logStream.write(message);
			};
		logCommand = function (commandArgs) {
				var line = '================================================================================';
				var message = '[' + new Date().toLocaleString() + '] Execute: ' + cecCmd;
				commandArgs.forEach(function (a) {
					message += ' ' + a;
				});
				console.log(line);
				console.log(message);
				line += '\n';
				message += '\n';
				logStream.write(line);
				logStream.write(message);
			},
			getExecCommand = function (cmd, commandArgs) {
				var spawnCommand = scriptFile,
					changeDir = 'cd ' + projectDir + '; ',
					command = cmd;

				commandArgs.forEach(function (a) {
					command += ' ' + a;
				});

				// In docker container, the command includes the script. E.g.
				//      /compileExec.sh 'cd /home/compileagent/cec-src; cec...'
				// Otherwise, the command is simply the cec command. E.g.
				//      cec...
				return inDocker ? spawnCommand + " '" + changeDir + command + "'" : command;
			};

		var noop = -1,
			// Write nothing in case log stream cannot be created
			nullStream = {
				write: function () {},
				end: function () {}
			},
			getLogStreamStep = function () {
				var args = {
					id: jobId,
					siteName: siteName,
					logsDir: logsDir
				};

				// Resolve with a stream or the nullStream.
				// In this way, caller only needs a then function.
				return new Promise(function (resolve) {
					self.ps.getLogStream(args).then(function (stream) {
						resolve(stream);
					}, function () {
						resolve(nullStream);
					});
				});
			},
			uploadLogStep = function () {
				return new Promise(function (resolveStep, rejectStep) {
					var args = {
							id: jobId,
							siteName: siteName,
							logsDir: logsDir
						},
						logFile = self.ps.getJobLogFile(args);

					var uploadLogArgs = [
						'upload-file',
						logFile,
						'-s',
						serverName,
						'-f',
						'site:' + siteName
					];

					var uploadLogCommand = exec(getExecCommand(cecCmd, uploadLogArgs), cecDefaults);
					uploadLogCommand.stdout.on('data', function (data) {
						console.log('stdout:', `${data}`);
					});
					uploadLogCommand.stderr.on('data', function (data) {
						console.log('stderr:', `${data}`);
					});
					uploadLogCommand.on('close', (code) => {
						console.log('uploadLog', code);
						// Always resolve
						resolveStep(code);
					});
				});
			},
			registerServerStep = function () {
				return new Promise(function (resolveStep, rejectStep) {
					var startTime = Date.now();
					// Server is a dev instance. For internal development use only.
					var serverType = 'dev_ec';

					// server user and pass are not passed for pod instance.
					if (!serverUser || !serverPass) {
						// Server is a pod instance. Token is expected to be set.
						serverType = 'dev_osso';
						// Use dummy value
						serverUser = 'x';
						serverPass = 'x';
					}
					var registerServerArgs = [
						'register-server',
						serverName,
						'-e',
						serverEndpoint,
						'-u',
						serverUser,
						'-p',
						serverPass,
						'-t',
						serverType
					];

					var registerServerCommand = exec(getExecCommand(cecCmd, registerServerArgs), cecDefaults);

					registerServerCommand.stdout.on('data', logStdout);
					registerServerCommand.stderr.on('data', logStderr);
					registerServerCommand.on('close', (code) => {
						logCode('registerServerCommand', code);
						logDuration(jobConfig, 'registerServerCommand', startTime);
						code === 0 ? resolveStep(code) : rejectStep(code);
					});
				});
			},
			setTokenStep = function () {
				return new Promise(function (resolveStep, rejectStep) {
					var startTime = Date.now();

					var setTokenArgs = [
						'set-oauth-token',
						'-s',
						serverName,
						token
					];
					var setTokenCommand = exec(getExecCommand(cecCmd, setTokenArgs), cecDefaults);

					setTokenCommand.stdout.on('data', logStdout);
					setTokenCommand.stderr.on('data', logStderr);
					setTokenCommand.on('close', (code) => {
						logCode('setTokenCommand', code);
						logDuration(jobConfig, 'setTokenCommand', startTime);
						code === 0 ? resolveStep(code) : rejectStep(code);
					});
				});
			},
			publishSiteStep = function (jobStatus) {
				if (jobStatus !== 'PUBLISH_SITE') {
					return Promise.resolve(noop);
				} else if (jobConfig.compileOnly === '1') {
					console.log('publish step skipped as "compileOnly" flag was set');
					return Promise.resolve(1);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var publishSiteArgs = [
							'control-site',
							'publish',
							'-r',
							serverName,
							'-s',
							siteName
						];
						if (publishUsedContentOnly === '1') {
							publishSiteArgs.push('-u');
						}
						if (doForceActivate === '1') {
							publishSiteArgs.push('-f');
						}
						logCommand(publishSiteArgs);
						var publishSiteCommand = exec(getExecCommand(cecCmd, publishSiteArgs), cecDefaults);

						publishSiteCommand.stdout.on('data', logPublishSiteStdout);
						publishSiteCommand.stderr.on('data', logStderr);
						publishSiteCommand.on('close', (code) => {
							logCode('publishSiteCommand', code);
							logDuration(jobConfig, 'publishSiteCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			checkTemplateDirectoryStep = function (jobStatus) {
				var templateDir = path.join(templatesDir, templateName);

				// If a job is restarted in the COMPILE_TEMPLATE status, the template directory would exist.
				// It is necessary to delete the template directory first.
				if (!fs.existsSync(templateDir)) {
					return Promise.resolve(noop);
				} else {
					return rmTemplateDirStep(jobStatus);
				}
			},
			createTemplateStep = function (jobStatus) {
				if (jobStatus !== 'CREATE_TEMPLATE') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var createTemplateArgs = [
							'create-template',
							'-r',
							serverName,
							'-s',
							siteName,
							templateName,
							'-x'
						];
						logCommand(createTemplateArgs);
						var createTemplateCommand = exec(getExecCommand(cecCmd, createTemplateArgs), cecDefaults);

						createTemplateCommand.stdout.on('data', logStdout);
						createTemplateCommand.stderr.on('data', logStderr);
						createTemplateCommand.on('close', (code) => {
							logCode('createTemplateCommand', code);
							logDuration(jobConfig, 'createTemplateCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			getChannelTokenStep = function (jobStatus) {
				if (jobStatus !== 'COMPILE_TEMPLATE') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						self.getSiteinfo(projectDir, templateName).then(function (siteinfo) {
							channelToken = siteinfo.properties.channelAccessTokens && siteinfo.properties.channelAccessTokens[0] && siteinfo.properties.channelAccessTokens[0].value;
							resolveStep(siteinfo);
						}, function () {
							rejectStep();
						});
					});
				}
			},
			getSiteSecurityStep = function (jobStatus) {
				if (jobStatus !== 'COMPILE_TEMPLATE') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var compileArguments = [
							'get-site-security',
							siteName,
							'-s',
							serverName
						];
						logCommand(compileArguments);

						var getSiteSecurityCommand = exec(getExecCommand(cecCmd, compileArguments), cecDefaultsForCompileStep);

						var parseStdout = function (data) {
							// note if this is a secure site
							if (/\s*- secure site:true\s*/.test(data)) {
								secureSite = true;
							}
							logStdout(data);
						};
						getSiteSecurityCommand.stdout.on('data', parseStdout);
						getSiteSecurityCommand.stderr.on('data', logStderr);
						getSiteSecurityCommand.on('close', (code) => {
							logCode('getSiteSecurityCommand', code);
							logDuration(jobConfig, 'getSiteSecurityCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			compileStep = function (jobStatus) {
				if (jobStatus !== 'COMPILE_TEMPLATE') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var compileArguments;
						if (channelToken) {
							// enterprise site
							compileArguments = [
								'compile-template',
								templateName,
								'-s',
								serverName,
								'-c',
								channelToken,
								'-n',
								siteName,
								'-t',
								'published',
								'-v',
								'-i'
							];
						} else {
							// standard site
							compileArguments = [
								'compile-template',
								templateName,
								'-v',
								'-n',
								siteName
							];
						}

						if (secureSite) {
							compileArguments.push('-u');
						}

						logCommand(compileArguments);

						var compileCommand = exec(getExecCommand(cecCmd, compileArguments), cecDefaultsForCompileStep);

						compileCommand.stdout.on('data', logStdout);
						compileCommand.stderr.on('data', logStderr);
						compileCommand.on('close', (code) => {
							logCode('compileCommand', code);
							logDuration(jobConfig, 'compileCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			uploadStep = function (jobStatus) {
				if (jobStatus !== 'UPLOAD_STATIC') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var uploadArguments = [
							'upload-static-site-files',
							path.join('src', 'templates', templateName, 'static'),
							'-s',
							siteName,
							'-r',
							serverName
						];
						logCommand(uploadArguments);
						var uploadCommand = exec(getExecCommand(cecCmd, uploadArguments), cecDefaults);

						uploadCommand.stdout.on('data', logStdout);
						uploadCommand.stderr.on('data', logStderr);
						uploadCommand.on('close', (code) => {
							logCode('uploadCommand', code);
							logDuration(jobConfig, 'uploadCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			publishStaticStep = function (jobStatus) {
				if (jobStatus !== 'PUBLISH_STATIC') {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var startTime = Date.now();

						var publishStaticArgs = [
							'control-site',
							'publish',
							'-r',
							serverName,
							'-s',
							siteName,
							'-t'
						];
						logCommand(publishStaticArgs);
						var publishStaticCommand = exec(getExecCommand(cecCmd, publishStaticArgs), cecDefaults);

						publishStaticCommand.stdout.on('data', logPublishStaticStdout);
						publishStaticCommand.stderr.on('data', logStderr);
						publishStaticCommand.on('close', (code) => {
							logCode('publishStaticCommand', code);
							logDuration(jobConfig, 'publishStaticCommand', startTime);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			rmTemplateDirStep = function (jobStatus) {
				if (!(jobStatus === 'CREATE_TEMPLATE' || jobStatus === 'PUBLISH_STATIC')) {
					return Promise.resolve(noop);
				} else {
					return new Promise(function (resolveStep, rejectStep) {
						var templateDir = path.join(templatesDir, templateName);
						var rmTemplateDirCommand;

						console.log('rmTemplateDirStep');
						// Commands for remove directory are different on Windows and Linux.
						if (/^win/.test(process.platform)) {
							rmTemplateDirCommand = exec(getExecCommand('cmd', ['/c', 'rmdir', '/S', '/Q', templateDir]), cecDefaults);
						} else {
							rmTemplateDirCommand = exec(getExecCommand('rm', ['-rf', templateDir]), cecDefaults);
						}

						rmTemplateDirCommand.stdout.on('data', logStdout);
						rmTemplateDirCommand.stderr.on('data', logStderr);
						rmTemplateDirCommand.on('close', (code) => {
							logCode('rmTemplateDirCommand', code);
							code === 0 ? resolveStep(code) : rejectStep(code);
						});
					});
				}
			},
			updateStatusStep = function (completionCode, jobStatus, percentage) {
				if (completionCode === noop) {
					return Promise.resolve(jobConfig);
				} else {
					return self.updateStatus(jobConfig, jobStatus, percentage);
				}
			},
			stopNow = function (code) {
				console.log('stop with code', code);
				logStream.end();
				uploadLogStep().then(function () {
					// don't update status if irrecoverable error coourred
					if(code === UPDATESTATUSERRORCODE){
						reject();
					}
					else{
						// status updated to faile - progress set to 100, since we can't recover and no additional steps will occur
						self.updateStatus(jobConfig, 'FAILED', 100).then(function (updatedJobConfig) {
							reject(updatedJobConfig);
						});
					}
				});
			},
			steps = function () {
				// setup the promise to get the site metadata
				self.getSiteMetadataPromise = self.getSiteMetadata(jobConfig);

				if (['PUBLISH_SITE', 'CREATE_TEMPLATE', 'COMPILE_TEMPLATE', 'UPLOAD_STATIC', 'PUBLISH_STATIC'].indexOf(jobConfig.status) !== -1) {
					if (jobConfig.hasOwnProperty('publishSiteBackgroundJobId')) {
						delete jobConfig.publishSiteBackgroundJobId;
					}
					publishSiteStep(jobConfig.status).then(function (completionCode) {
						updateStatusStep(completionCode, 'CREATE_TEMPLATE', 20).then(function (updatedJobConfig) {
							checkTemplateDirectoryStep(jobConfig.status).then(function () {
								createTemplateStep(jobConfig.status).then(function (completionCode) {
									updateStatusStep(completionCode, 'COMPILE_TEMPLATE', 40).then(function (updatedJobConfig) {
										getChannelTokenStep(updatedJobConfig.status).then(function (completionCode) {
											getSiteSecurityStep(updatedJobConfig.status).then(function (completionCode) {
												compileStep(updatedJobConfig.status).then(function (completionCode) {
													updateStatusStep(completionCode, 'UPLOAD_STATIC', 60).then(function (updatedJobConfig) {
														uploadStep(updatedJobConfig.status).then(function (completionCode) {
															updateStatusStep(completionCode, 'PUBLISH_STATIC', 80).then(function (updatedJobConfig) {
																if (jobConfig.hasOwnProperty('publishStaticBackgroundJobId')) {
																	delete jobConfig.publishStaticBackgroundJobId;
																}
																publishStaticStep(updatedJobConfig.status).then(function (completionCode) {
																	if (completionCode !== noop) {
																		logDuration(updatedJobConfig, 'compileSite', compileStartTime);
																	}
																	rmTemplateDirStep(updatedJobConfig.status).then(function () {
																		logStream.end();
																		uploadLogStep().then(function () {
																			updateStatusStep(completionCode, 'COMPILED', 100).then(function (updatedJobConfig) {
																				resolve(updatedJobConfig);
																			});
																		}, stopNow);
																	});
																}, stopNow);
															}, stopNow);
														}, stopNow);
													}, stopNow);
												}, stopNow);
											}, stopNow);
										}, stopNow);
									}, stopNow);
								}, stopNow);
							}, stopNow);
						}, stopNow);
					}, stopNow);
				} else {
					console.log('Should not be in compileSite when status is', jobConfig.status);
				}
			};

		getLogStreamStep().then(function (stream) {
			logStream = stream;

			registerServerStep().then(function () {
				if (token) {
					setTokenStep().then(steps, stopNow);
				} else {
					steps();
				}
			});
		});
	});
};

JobManager.prototype.getSiteinfo = function (projectDir, templateName) {

	return new Promise(function (resolve, reject) {
		var srcDir = path.join(projectDir, 'src'),
			templateDir = path.join(srcDir, 'templates', templateName),
			siteinfoFile = path.join(templateDir, 'siteinfo.json');

		// read in the file
		if (fs.existsSync(siteinfoFile)) {
			fs.readFile(siteinfoFile, function (err, data) {
				if (err) {
					console.log('getSiteinfo: failed to read file:', siteinfoFile);
					reject({
						errorCode: 500,
						errorMessage: JSON.stringify(err)
					});
				} else {
					try {
						resolve(JSON.parse(data));
					} catch (parseErr) {
						console.log('getSiteinfo: failed to parse file: ' + siteinfoFile);
						reject({
							errorCode: 500,
							errorMessage: JSON.stringify(parseErr)
						});
					}
				}
			});
		} else {
			// no job file, reject
			var errorMessage = 'getSiteinfo: file does not exist: ' + siteinfoFile;
			console.log(errorMessage);
			reject({
				errorCode: 500,
				errorMessage: errorMessage
			});
		}
	});
};

JobManager.prototype.compileSiteJob = function (jobConfig) {
	var self = this;

	return new Promise(function (resolve, reject) {
		// if (jobConfig.status === 'CREATED') {
		if (['FAILED', 'CREATED', 'COMPILED'].indexOf(jobConfig.status) === -1) {
			self.compileSite(jobConfig).then(function (updatedJobConfig) {
				resolve(updatedJobConfig);
			}, function (updatedJobConfig) {
				reject(updatedJobConfig);
			});
		} else {
			console.log('compileSiteJob called when status is', jobConfig.status);
			reject(jobConfig);
		}
	});
};

/**
 * Store the status update on the server so it can be checked via theUI
 */
JobManager.prototype.getSiteMetadata = function (jobConfig) {
	var self = this;

	// for this job compile, get the site metadata once so we don't get it again
	return new Promise(function (resolve, reject) {
		var server = serverUtils.verifyServer(self.serverName, projectDir);

		// connect to the server
		var request = serverUtils.getRequest();
		serverUtils.loginToServer(server, request).then(function (result) {
			// get the current site to get the siteId
			sitesRest.getSite({
				server: server,
				name: jobConfig.siteName,
				expand: 'channel,repository'
			}).then(function (result) {
				if (!result || result.err || !result.id) {
					console.log('ERROR: site ' + siteName + ' does not exist');
					reject();
				}
				var site = result;

				// get the site medatadata
				serverUtils.getIdcToken(server).then(function (result) {
					var idcToken = result.idcToken;

					serverUtils.getSiteMetadata(request, server, site.id).then(function (result) {
						resolve({
							site: site,
							idcToken: idcToken,
							metadata: result.data
						});
					});
				});
			});
		});
	});
};

JobManager.prototype.updateSiteMetadata = function (jobConfig) {
	var self = this;

	// only update if compileOnly flag has been set (backwards compatbility)
	/* ToDo: enable this check when server supports compileOnly
	if (jobConfig.compileOnly !== '1') {
	    return Promise.resolve();
	}
	*/

	// don't update for these statuses, we only want to start updating from compile step
	if (['CREATED', 'PUBLISH_SITE'].indexOf(jobConfig.status) !== -1) {
		return Promise.resolve();
	}

	// get the site metadata 
	if (self.getSiteMetadataPromise) {
		return self.getSiteMetadataPromise.then(function (siteData) {
			// update compile status property within the site metadata
			var updateStatus = JSON.stringify({
				'jobId': jobConfig.id,
				'status': jobConfig.status,
				'progress': jobConfig.progress,
				'compiledAt': new Date()
			});

			console.log('updating site metadata with: ' + updateStatus);

			var request = serverUtils.getRequest(),
				server = serverUtils.verifyServer(self.serverName, projectDir),
				site = siteData.site,
				idcToken = siteData.idcToken,
				metadata = siteData.metadata,
				siteSettings = {
					xScsSiteCompileStatus: updateStatus
				};

			return serverUtils.setSiteMetadata(request, server, idcToken, site.id, siteSettings, {});
		});
	} else {
		return Promise.resolve();
	}
};

/**
 * @property {('CREATED'|'PUBLISH_SITE'|'CREATE_TEMPLATE'|'COMPILE_TEMPLATE'|'UPLOAD_STATIC'|'PUBLISH_STATIC'|'COMPILED'|'FAILED')} status The new status of the job.
 */
JobManager.prototype.updateStatus = function (jobConfig, status, progress) {
	var self = this;

	var data = {
		status: status
	};

	if (typeof progress !== 'undefined') {
		data.progress = progress;
	}

	return self.updateJob(jobConfig, data).then(function (updatedJobConfig) {
		// attempt to update the server with the updated job config so that the UI can be updated to notify the user.  
		// don't need to wait for this to complete, we're storing the value locally so any errors do not cause an issue


  		// Retry, assuming the error is recoverable.
		// We have yet to find a way to handle irrecoverable error. 
		// We will add the new Promise back when we have a solution on how to handle reject promise.
 
		return new Promise(function (resolve, reject) {
			var retry = UPDATESTATUSRETRY;
			var update = function() {
				retry--;
				self.updateSiteMetadata(updatedJobConfig).then(function(s) {
					console.log('compilation server successfully updated site metadata in server ', s);
					resolve(updatedJobConfig);
				}).catch(function (e) {
					console.log('compilation server error: failed to update site metadata in server -', e.err);
					if (retry > 0) {
						update();
					}
					else{
						console.log('Error irrecoverable:', e.err);
						reject(UPDATESTATUSERRORCODE);
					}
				});
			};
			update();
		});
	});
};

JobManager.prototype.updateJob = function (jobConfig, data) {

	var updates = Object.getOwnPropertyNames(data),
		newProps = {};

	updates.map(function (key) {
		// List of properties that can be updated internally.
		if (['name', 'siteName', 'serverEndpoint', 'publishUsedContentOnly', 'doForceActivate', 'serverUser', 'serverPass', 'token', 'status', 'progress'].indexOf(key) !== -1) {
			newProps[key] = data[key];
		}
	});

	var updatedJobConfig = Object.assign(jobConfig, newProps);

	return this.ps.updateJob(updatedJobConfig);
};

JobManager.prototype.updateJobPublic = function (jobConfig, data) {

	var updates = Object.getOwnPropertyNames(data),
		newProps = {};

	updates.map(function (key) {
		// List of properties that can be updated via REST API.
		if (['name', 'siteName', 'token'].indexOf(key) !== -1) {
			newProps[key] = data[key];
		} else {
			console.log('updateJobPublic update for property', key, 'ignored.');
		}
	});

	var updatedJobConfig = Object.assign(jobConfig, newProps);

	return this.ps.updateJob(updatedJobConfig);
};

module.exports = function (args) {
	return new JobManager(args);
};