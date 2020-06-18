/* globals app, module, __dirname */
var path = require('path'),
    exec = require('child_process').exec,
    fs = require('fs');

const cecCmd = /^win/.test(process.platform) ? 'cec.cmd' : 'cec';

var JobManager = function(args) {
        this.ps = args.ps;
    },
    logsDir = '',
    compileStepTimeoutValue = 0;

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
        publishUsedContentOnly = jobConfig.publishUsedContentOnly,
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

    // Use the project dir in the env
    var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR;

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
            env: processEnv
        },
        cecDefaultsForCompileStep = Object.assign({}, cecDefaults);

    if (compileStepTimeoutValue) {
        cecDefaultsForCompileStep.timeout = compileStepTimeoutValue;
    }

    return new Promise(function (resolve, reject) {

        var logStream;

        var logPublishSiteStdout = function(data) {
                var out = `${data}`,
                    found = out.trim().match(/publish BACKGROUND_JOB_ID (?<id>.*)$/);

                if (found && found.groups && found.groups.id) {
                    jobConfig.publishSiteBackgroundJobId = found.groups.id;
                }

                logStdout(data);
            },
            logPublishStaticStdout = function(data) {
                var out = `${data}`,
                    found = out.trim().match(/publish BACKGROUND_JOB_ID (?<id>.*)$/);

                if (found && found.groups && found.groups.id) {
                    jobConfig.publishStaticBackgroundJobId = found.groups.id;
                }

                logStdout(data);                
            },
            logStdout = function(data) {
                console.log('stdout:',  `${data}`);
                logStream.write(`${data}`);
            },
            logStderr = function(data) {
                console.log('stderr:', `${data}`);
                logStream.write(`${data}`);
            },
            logCode = function(commndString, code) {
                var message = commndString + ' child process exited with code ' + `${code}` + '\n';
                console.log(commndString, 'child process exited with code', `${code}`);
                logStream.write(message);
            },
            logDuration = function (jobConfig, step, startTime) {
                var message = jobConfig.id + ' ' + step + ' duration ' + Math.floor((Date.now() - startTime)/1000) + ' seconds' + '\n';
                console.log(jobConfig.id, step, 'duration', Math.floor((Date.now() - startTime)/1000), 'seconds');
                logStream.write(message);
            };
            logCommand = function (commandArgs) {
                var line = '================================================================================';
                var message = 'Execute: ' + cecCmd;
                commandArgs.forEach(function(a) {
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

                commandArgs.forEach(function(a) {
                    command += ' ' + a;
                });

                // In docker container, the command includes the script. E.g.
                //      /compileExec.sh 'cd /home/compileagent/cec-src; cec...'
                // Otherwise, the command is simply the cec command. E.g.
                //      cec...
                return inDocker ? spawnCommand + " '"  + changeDir + command + "'" : command;
            };

        var noop = -1,
            // Write nothing in case log stream cannot be created
            nullStream = {
                write: function() { },
                end: function() { }
            },
            getLogStreamStep = function () {
                var args = {
                        id: jobId,
                        siteName: siteName,
                        logsDir: logsDir
                    };

                // Resolve with a stream or the nullStream.
                // In this way, caller only needs a then function.
                return new Promise(function(resolve) {
                    self.ps.getLogStream(args).then(function(stream) {
                        resolve(stream);
                    }, function () {
                        resolve (nullStream);
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
                    uploadLogCommand.stdout.on('data', function(data) {
                        console.log('stdout:', `${data}`);
                    });
                    uploadLogCommand.stderr.on('data', function(data) {
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
            publishSiteStep = function(jobStatus) {
                if (jobStatus !== 'PUBLISH_SITE') {
                    return Promise.resolve(noop);
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
                        if (publishUsedContentOnly === 1) {
                            publishSiteArgs.push('-u');
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
            createTemplateStep = function(jobStatus) {
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
                                templateName
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
            getChannelTokenStep = function(jobStatus) {
                if (jobStatus !== 'COMPILE_TEMPLATE') {
                    return Promise.resolve(noop);
                } else {
                    return new Promise(function (resolveStep, rejectStep) {
                        self.getSiteinfo(projectDir, templateName).then(function(siteinfo) {
                            channelToken = siteinfo.properties.channelAccessTokens[0].value;
                            resolveStep(siteinfo);
                        }, function() {
                            rejectStep();
                        });
                    });
                }
            },
            compileStep = function(jobStatus) {
                if (jobStatus !== 'COMPILE_TEMPLATE') {
                    return Promise.resolve(noop);
                } else {
                    return new Promise(function (resolveStep, rejectStep) {
                        var startTime = Date.now();

                        var compileArguments = [
                                'compile-template',
                                templateName,
                                '-s',
                                serverName,
                                '-c',
                                channelToken,
                                '-t',
                                'published',
                                '-v'
                            ];
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
            uploadStep = function(jobStatus) {
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
            publishStaticStep = function(jobStatus) {
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
            rmTemplateDirStep = function(jobStatus) {
                if (jobStatus !== 'PUBLISH_STATIC') {
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
            updateStatusStep = function(completionCode, jobStatus, percentage) {
                if (completionCode === noop) {
                    return Promise.resolve(jobConfig);
                } else {
                    return self.updateStatus(jobConfig, jobStatus, percentage);
                }
            },
            stopNow = function(code) {
                console.log('stop with code', code);
                logStream.end();
                uploadLogStep().then(function() {
                    self.updateStatus(jobConfig, 'FAILED').then(function(updatedJobConfig) {
                        reject(updatedJobConfig);
                    });
                });
            },
            steps = function() {

                if (['PUBLISH_SITE', 'CREATE_TEMPLATE', 'COMPILE_TEMPLATE', 'UPLOAD_STATIC', 'PUBLISH_STATIC'].indexOf(jobConfig.status) !== -1) {
                    if (jobConfig.hasOwnProperty('publishSiteBackgroundJobId')) {
                        delete jobConfig.publishSiteBackgroundJobId;
                    }
                    publishSiteStep(jobConfig.status).then(function(completionCode) {
                        updateStatusStep(completionCode, 'CREATE_TEMPLATE', 20).then(function(updatedJobConfig) {
                            createTemplateStep(jobConfig.status).then(function(completionCode) {
                                updateStatusStep(completionCode, 'COMPILE_TEMPLATE', 40).then(function(updatedJobConfig) {
                                    getChannelTokenStep(updatedJobConfig.status).then(function(completionCode) {
                                        compileStep(updatedJobConfig.status).then(function(completionCode) {
                                            updateStatusStep(completionCode, 'UPLOAD_STATIC', 60).then(function(updatedJobConfig) {
                                                uploadStep(updatedJobConfig.status).then(function(completionCode) {
                                                    updateStatusStep(completionCode, 'PUBLISH_STATIC', 80).then(function(updatedJobConfig) {
                                                        if (jobConfig.hasOwnProperty('publishStaticBackgroundJobId')) {
                                                            delete jobConfig.publishStaticBackgroundJobId;
                                                        }
                                                        publishStaticStep(updatedJobConfig.status).then(function(completionCode) {
                                                            if (completionCode !== noop) {
                                                                logDuration(updatedJobConfig, 'compileSite', compileStartTime);
                                                            }
                                                            rmTemplateDirStep(updatedJobConfig.status).then(function() {
                                                                logStream.end();
                                                                uploadLogStep().then(function() {
                                                                    updateStatusStep(completionCode, 'COMPILED', 100).then(function(updatedJobConfig) {
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
                } else {
                    console.log('Should not be in compileSite when status is', jobConfig.status);
                }
            };

        getLogStreamStep().then(function(stream) {
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
            self.compileSite(jobConfig).then(function(updatedJobConfig) {
                resolve(updatedJobConfig);
            }, function(updatedJobConfig) {
                reject(updatedJobConfig);
            });
        } else {
            console.log('compileSiteJob called when status is', jobConfig.status);
            reject(jobConfig);
        }
    });
};

/**
* @property {('CREATED'|'PUBLISH_SITE'|'CREATE_TEMPLATE'|'COMPILE_TEMPLATE'|'UPLOAD_STATIC'|'PUBLISH_STATIC'|'COMPILED'|'FAILED')} status The new status of the job.
*/
JobManager.prototype.updateStatus = function (jobConfig, status, progress) {

    var data = {
            status: status
        };

    if (typeof progress !== 'undefined') {
        data.progress = progress;
    }

    return this.updateJob(jobConfig, data);
};

JobManager.prototype.updateJob = function(jobConfig, data) {

    var updates = Object.getOwnPropertyNames(data),
        newProps = {};

    updates.map(function(key) {
        // List of properties that can be updated internally.
        if (['name', 'siteName', 'serverEndpoint', 'publishUsedContentOnly', 'serverUser', 'serverPass', 'token', 'status', 'progress'].indexOf(key) !== -1) {
            newProps[key] = data[key];
        }
    });

    var updatedJobConfig = Object.assign(jobConfig, newProps);

    return this.ps.updateJob(updatedJobConfig);
};

JobManager.prototype.updateJobPublic = function(jobConfig, data) {

    var updates = Object.getOwnPropertyNames(data),
        newProps = {};

    updates.map(function(key) {
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