/* globals app, module, __dirname */
var persistenceStore = require('../job-manager/persistenceStore').factory.create(),
    path = require('path'),
    { spawn } = require('child_process'),
    fs = require('fs');

const cecCmd = /^win/.test(process.platform) ? 'cec.cmd' : 'cec';

var JobManager = function() {};

JobManager.prototype.compileSite = function (jobConfig) {
    var self = this,
        jobId = jobConfig.properties.id,
        siteName = jobConfig.siteName,
        serverName = jobConfig.serverName,
        token = jobConfig.token,
        match = /[a-z]*([0-9]*)/.exec(jobId),
        id = match[1], // group 1 has the digits, e.g. 123456 of job123456
        templateName = siteName + id + 'ForCompile',
        channelToken,
        compileStartTime = Date.now(),
        processEnv = process.env;

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
    };

    return new Promise(function (resolve, reject) {

        var logStdout = function(data) {
                console.log('stdout:',  `${data}`);
            },
            logStderr = function(data) {
                console.log('stderr:', `${data}`);
            },
            logCode = function(commndString, code) {
                console.log(commndString, 'child process exited with code', `${code}`);
            },
            logDuration = function (jobConfig, step, startTime) {
                console.log(jobConfig.properties.id, step, 'duration', Math.floor((Date.now() - startTime)/1000), 'seconds');
            };

        var setTokenStep = function () {
                return new Promise(function (resolveStep, rejectStep) {
                    var startTime = Date.now();

                    var setTokenArgs = [
                            'set-oauth-token',
                            '-s',
                            serverName,
                            token
                        ];
                    var setTokenCommand = spawn(cecCmd, setTokenArgs, cecDefaults);
    
                    setTokenCommand.stdout.on('data', logStdout);
                    setTokenCommand.stderr.on('data', logStderr);
                    setTokenCommand.on('close', (code) => {
                        logCode('setTokenCommand', code);
                        logDuration(jobConfig, 'setTokenCommand', startTime);
                        code === 0 ? resolveStep(code) : rejectStep(code);
                    });
                });
            },
            createTemplateStep = function() {
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
                    var createTemplateCommand = spawn(cecCmd, createTemplateArgs, cecDefaults);

                    createTemplateCommand.stdout.on('data', logStdout);
                    createTemplateCommand.stderr.on('data', logStderr);
                    createTemplateCommand.on('close', (code) => {
                        logCode('createTemplateCommand', code);
                        logDuration(jobConfig, 'createTemplateCommand', startTime);
                        code === 0 ? resolveStep(code) : rejectStep(code);
                    });
                });
            },
            getChannelTokenStep = function() {
                return new Promise(function (resolveStep, rejectStep) {
                    self.getSiteinfo(projectDir, templateName).then(function(siteinfo) {
                        channelToken = siteinfo.properties.channelAccessTokens[0].value;
                        resolveStep(siteinfo);
                    }, function() {
                        rejectStep();
                    });
                });
            },
            compileStep = function() {
                return new Promise(function (resolveStep, rejectStep) {
                    var startTime = Date.now();

                    var compileArguments = [
                            'compile-template',
                            templateName,
                            '-s',
                            serverName,
                            '-c',
                            channelToken
                        ];
                    var compileCommand = spawn(cecCmd, compileArguments, cecDefaults);

                    compileCommand.stdout.on('data', logStdout);
                    compileCommand.stderr.on('data', logStderr);
                    compileCommand.on('close', (code) => {
                        logCode('compileCommand', code);
                        logDuration(jobConfig, 'compileCommand', startTime);
                        code === 0 ? resolveStep(code) : rejectStep(code);
                    });
                });
            },
            uploadStep = function() {
                return new Promise(function (resolveStep, rejectStep) {
                    var startTime = Date.now();

                    var uploadArguments = [
                            'upload-static-site-files',
                            path.join('src', 'templates', templateName, 'static'),
                            '-s',
                            siteName,
                            '-r',
                            serverName
                        ],
                        uploadCommand = spawn(cecCmd, uploadArguments, cecDefaults);

                    uploadCommand.stdout.on('data', logStdout);
                    uploadCommand.stderr.on('data', logStderr);
                    uploadCommand.on('close', (code) => {
                        logCode('uploadCommand', code);
                        logDuration(jobConfig, 'uploadCommand', startTime);
                        code === 0 ? resolveStep(code) : rejectStep(code);
                    });
                });
            },
            rmTemplateDirStep = function() {
                return new Promise(function (resolveStep, rejectStep) {
                    var templateDir = path.join(templatesDir, templateName);
                    var rmTemplateDirCommand;

                    // Commands for remove directory are different on Windows and Linux.
                    if (/^win/.test(process.platform)) {
                        rmTemplateDirCommand = spawn('cmd', ['/c', 'rmdir', '/S', '/Q', templateDir], cecDefaults);
                    } else {
                        rmTemplateDirCommand = spawn('rm', ['-rf', templateDir], cecDefaults);
                    }

                    rmTemplateDirCommand.stdout.on('data', logStdout);
                    rmTemplateDirCommand.stderr.on('data', logStderr);
                    rmTemplateDirCommand.on('close', (code) => {
                        logCode('rmTemplateDirCommand', code);
                        code === 0 ? resolveStep(code) : rejectStep(code);
                    });
                });
            },
            stopNow = function(code) {
                console.log('stop with code', code);
                reject(self.updateStatus(jobConfig, 'FAILED'));
            },
            steps = function() {

                // Implementation node: While there is repeating code in the following case statements, in this way
                // the steps could be stopped upon encountering error.

                switch (['CREATE_TEMPLATE', 'COMPILE_TEMPLATE', 'UPLOAD_STATIC'].indexOf(jobConfig.status)) {
                    case 0: // CREATE_TEMPLATE
                        createTemplateStep().then(function() {
                            self.updateStatus(jobConfig, 'COMPILE_TEMPLATE', 40);
                            getChannelTokenStep().then(function() {
                                compileStep().then(function() {
                                    self.updateStatus(jobConfig, 'UPLOAD_STATIC', 70);
                                    uploadStep().then(function() {
                                        logDuration(jobConfig, 'compileSite', compileStartTime);
                                        rmTemplateDirStep();
                                        resolve(self.updateStatus(jobConfig, 'COMPILED', 100));
                                    }, stopNow);
                                }, stopNow);
                            }, stopNow);
                        }, stopNow);

                        break;
                    case 1: // COMPILE_TEMPLATE
                        getChannelTokenStep().then(function() {
                            compileStep().then(function() {
                                self.updateStatus(jobConfig, 'UPLOAD_STATIC', 70);
                                uploadStep().then(function() {
                                    logDuration(jobConfig, 'compileSite', compileStartTime);
                                    rmTemplateDirStep();
                                    resolve(self.updateStatus(jobConfig, 'COMPILED', 100));
                                }, stopNow);
                            }, stopNow);
                        }, stopNow);
                        break;
                    case 2: // UPLOAD_STATIC
                        uploadStep().then(function() {
                            logDuration(jobConfig, 'compileSite', compileStartTime);
                            rmTemplateDirStep();
                            resolve(self.updateStatus(jobConfig, 'COMPILED', 100));
                        }, stopNow);
                        break;
                    default: 
                        console.log('Should not be in compileSite when status is', jobConfig.status);
                }
            };

        if (token) {
            setTokenStep().then(steps, stopNow);
        } else {
            steps();
        }
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
* @property {('CREATED'|'CREATE_TEMPLATE'|'COMPILE_TEMPLATE'|'UPLOAD_STATIC'|'COMPILED'|'FAILED')} status The new status of the job.
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
        if (['name', 'siteName', 'serverName', 'token', 'status', 'progress'].indexOf(key) !== -1) {
            newProps[key] = data[key];
        }
    });

    var updatedJobConfig = Object.assign(jobConfig, newProps);

    return persistenceStore.updateJob(updatedJobConfig);
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

    return persistenceStore.updateJob(updatedJobConfig);
};

module.exports = new JobManager();