/* globals app, module, __dirname */

var responses = require('./connectorResponses'),
    jobManager = require('../job-manager/jobManager'),
    compileSiteJobQueue = require('../job-manager/jobQueue');


var CompilationService = function(args) {
        this.ps = args.ps;
        this.jobQueue = new compileSiteJobQueue(args);
        this.jobManager = new jobManager(args);
    },
    apiVersion = 'v1',
    logsDir = '';

CompilationService.prototype.setLogsDir = function (inputLogsDir) {
    logsDir = inputLogsDir;
    this.jobManager.setLogsDir(inputLogsDir);
};

CompilationService.prototype.setCompileStepTimeoutValue = function (timeoutValue) {
    this.jobManager.setCompileStepTimeoutValue(timeoutValue);
};

CompilationService.prototype.restartJobs = function () {
    var self = this;

    // get all the the existing jobs
    self.ps.getAllJobs().then(function (allJobConfigs) {
        // get all the jobs that need to be re-started
        allJobConfigs.filter(function (jobConfig) {
            // If the job is not finished (i.e.: COMPILED), we need to re-start it
            // If the job has 'FAILED' then we don't restart it, they need to re-submit the job and start again
            return ['FAILED', 'CREATED', 'COMPILED'].indexOf(jobConfig.status) === -1;
        }).map(function (jobConfig) {
            // ok, we have a running job that we need to re-start, kick it off again
            console.log('RESTART enqueue jobId:' + jobConfig.id + ' from: ' + jobConfig.status);
            self.jobQueue.enqueue(jobConfig);
            return jobConfig.id;
        }).reduce(function (acc, id) {
            console.log('RESTART compile jobId', id);
            self.compileSite();
        }, 0);
    });
};

CompilationService.prototype.validateRequest = function(req, checks) {
    var args = {
            params: req.params,
            headers: req.headers,
            data: req.body
        };

    return new Promise(function(resolve, reject) {

        if (checks) {
            // handle required URL parameter checks
            (checks.requiredParameters || []).forEach(function (requiredParameter) {
                if (!args.params || !args.params[requiredParameter]) {
                    reject({
                        errorCode: 400, // Bad Request
                        errorMessage: 'CompilationService: missing required parameter - ' + requiredParameter
                    });
                }
            });
        
            // handle required body (data) parameter checks
            (checks.requiredData || []).forEach(function (dataParameter) {
                if (!args.data || !args.data[dataParameter]) {
                    reject({
                        errorCode: 400, // Bad Request
                        errorMessage: 'CompilationService: missing required form data - ' + dataParameter
                    });
                }
            });
        }

        resolve(args);
    });
};

CompilationService.prototype.prependApiVersion = function(path) {
    return '/' + apiVersion + path;
};

CompilationService.prototype.getApiVersions = function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([apiVersion]));
};

CompilationService.prototype.getServer = function(req, res) {
    var response = responses.formatResponse("GET", "/" + apiVersion + "/server", {
            // TODO: If there is a way to differentiate between dev instance and pod instance,
            // then the value should indicate USER_PASS for dev instance and OAUTH_TOKEN for pod instance.
            authenticationType: "OAUTH_TOKEN"
        });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response));
};

CompilationService.prototype.respondWithError = function(res, error) {
    res.setHeader('Content-Type', 'application/json');
    res.status(error.errorCode || 400);
    res.end(error.errorMessage || 'Request failed');
};

CompilationService.prototype.handleGetJobError = function(res, jobId, error) {
    if (error && error.errorCode === 404) {
        var response = responses.formatResponse("GET", "/jobNotFound", {
                jobId: jobId
            });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response));
    } else {
        self.respondWithError(res, error);
    }
};

CompilationService.prototype.getJob = function(req, res) {
    var self = this;

    this.validateRequest(req, {
        requiredParameters: ['id']
    }).then(function(args) {
        var jobId = args.params.id;

        console.log('GET getJob for', jobId);

        self.ps.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            var response = responses.formatResponse("GET", self.prependApiVersion("/job/") + jobId, {
                jobId: jobMetadata.id,
                name: jobMetadata.name,
                siteName: jobMetadata.siteName,
                publishUsedContentOnly: jobMetadata.publishUsedContentOnly,
                serverEndpoint: jobMetadata.serverEndpoint,
                serverUser: jobMetadata.serverUser,
                serverPass: jobMetadata.serverPass,
                token: jobMetadata.token,
                status: jobMetadata.status,
                progress: jobMetadata.progress,
                publishSiteBackgroundJobId: jobMetadata.publishSiteBackgroundJobId,
                publishStaticBackgroundJobId: jobMetadata.publishStaticBackgroundJobId
            });

            if (jobMetadata.status === 'COMPILED' || jobMetadata.status === 'FAILED') {
                var args = {
                        id: jobId,
                        siteName: jobMetadata.siteName,
                        logsDir: logsDir
                    };
                self.ps.readLog(args).then(function(data) {
                    response.log = data;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(response));
                }, function(logError) {
                    // Ignore error. Return job data only.
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(response));
                });
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(response));
            }
        }, function(error) {
            self.handleGetJobError(res, jobId, error);
        });
    }, function(error) {
        self.respondWithError(res, error);
    });
};

CompilationService.prototype.updateJob = function(req, res) {
    var self = this;

    this.validateRequest(req, {
        requiredParameters: ['id']
    }).then(function(args) {
        var jobId = args.params.id,
            data = args.data;

        console.log('POST updateJob for', jobId);

        self.ps.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            self.jobManager.updateJobPublic(jobMetadata, data).then(function(updatedJobMetadata) {
                var response = responses.formatResponse("POST", self.prependApiVersion("/job/") + jobId, {
                        jobId: updatedJobMetadata.id,
                        name: updatedJobMetadata.name,
                        siteName: updatedJobMetadata.siteName,
                        publishUsedContentOnly: updatedJobMetadata.publishUsedContentOnly,
                        serverEndpoint: updatedJobMetadata.serverEndpoint,
                        serverUser: updatedJobMetadata.serverUser,
                        serverPass: updatedJobMetadata.serverPass,
                        token: updatedJobMetadata.token,
                        status: updatedJobMetadata.status,
                        progress: updatedJobMetadata.progress
                    });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(response));
            }, function(error) {
                self.respondWithError(res, error);
            });
        }, function(error) {
            self.handleGetJobError(res, jobId, error);
        });
    }, function(error) {
        self.respondWithError(res, error);
    });
};


CompilationService.prototype.createJob = function(req, res) {
    var self = this;

    this.validateRequest(req, {
        requiredData: ['name','siteName']
    }).then(function(args) {
        var name = args.data.name,
            siteName = args.data.siteName,
            publishUsedContentOnly = args.data.publishUsedContentOnly,
            serverEndpoint = args.data.serverEndpoint,
            serverUser = args.data.serverUser || '', // Optional
            serverPass = args.data.serverPass || '', // Optional
            token = args.data.token || ''; // Optional

        self.ps.createJob({
            name: name,
            siteName: siteName,
            publishUsedContentOnly: publishUsedContentOnly,
            serverEndpoint: serverEndpoint,
            serverUser: serverUser,
            serverPass: serverPass,
            token: token
        }).then(function(newJob) {
            console.log('newJob', newJob);

            var response = responses.formatResponse("POST", self.prependApiVersion("/job"), {
                    jobId: newJob.id,
                    name: newJob.name,
                    siteName: newJob.siteName,
                    publishUsedContentOnly: newJob.publishUsedContentOnly,
                    serverEndpoint: newJob.serverEndpoint,
                    serverUser: newJob.serverUser,
                    serverPass: newJob.serverPass,
                    token: newJob.token,
                    status: newJob.status,
                    progress: newJob.progress
                });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(response));
        });
    }, function(error) {
        self.respondWithError(res, error);
    });
};

CompilationService.prototype.deleteJob = function(req, res) {
    var self = this;

    this.validateRequest(req, {
        requiredParameters: ['id']
    }).then(function(args) {
        var jobId = args.params.id;

        self.ps.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            this.ps.deleteJob({
                jobId: jobId
            }).then(function() {
                var response = responses.formatResponse("DELETE", self.prependApiVersion("/job/") + jobId, {
                    jobId: jobId
                });
        
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(response));
            }, function(error) {
                self.respondWithError(res, error);
            });
        }, function(error) {
            self.handleGetJobError(res, jobId, error);
        });
    }, function(error) {
        self.respondWithError(res, error);
    });
};

CompilationService.prototype.submitCompileSite = function(req, res) {
    var self = this;

    self.validateRequest(req, {
        requiredParameters: ['id']
    }).then(function(args) {
        var jobId = args.params.id;

        self.ps.getJob({
            jobId: jobId
        }).then(function(originalMetadata) {

            if (originalMetadata.status !== 'CREATED') {
                var error = {
                        errorCode: 400, // Bad Request
                        errorMessage: 'CompilationService: resubmiting a compilation job is not supported'
                    };

                self.respondWithError(res, error);
            } else {
                self.jobManager.updateStatus(originalMetadata, "PUBLISH_SITE").then(function(updatedJobConfig) {

                    self.jobQueue.enqueue(updatedJobConfig);

                    var response = responses.formatResponse("POST", self.prependApiVersion("/job/") + jobId + "/compile/queued", {
                        jobId: jobId
                    });
            
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(response));
            
                    self.compileSite();

                }, function(error) {
                    console.log('submitCompileSite failed to update job status');
                    self.respondWithError(res, error);
                });
            }
        }, function(error) {
            self.handleGetJobError(res, jobId, error);
        });
    }, function(error) {
        self.respondWithError(res, error);
    });
};

// Set busy state, either true or false.
CompilationService.prototype.setCompileSiteBusy = function(state) {
    var self = this;

    self.compileSiteInProgress = state;
    console.log('setCompileSiteBusy self.compileSiteInProgress', self.compileSiteInProgress);
};

CompilationService.prototype.isCompileSiteBusy = function() {
    var self = this;

    return self.compileSiteInProgress;
};

CompilationService.prototype.compileSiteDone = function() {
    var self = this;

    console.log('--------------------- Compile site done ---------------------');

    // Clear busy after compilation is done
    self.setCompileSiteBusy(false);

    // Check qeueue
    if (!self.jobQueue.isEmpty()) {
        console.log('Dequeue next compile site request');
        setTimeout(this.compileSite.bind(self), 0);
    }
};

CompilationService.prototype.compileSite = function() {
    var self = this;

    if (self.jobQueue.isEmpty()) {
        console.log('compileSite called when job queue is empty');
        return;
    } else if (self.isCompileSiteBusy()) {
        console.log('****** Compile site in progress. compileSite request will not processed immediately');
        return;
    }

    var originalMetadata = self.jobQueue.dequeue();

    // Set busy after dequeue
    self.setCompileSiteBusy(true);

    console.log('--------------------- Compile site begin ---------------------');

    self.jobManager.compileSiteJob(originalMetadata).then(function() {
        self.compileSiteDone();
    }, function() {
        self.compileSiteDone();
    });
};

module.exports = function (args) {
	return new CompilationService(args);
};