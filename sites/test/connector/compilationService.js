/* globals app, module, __dirname */

var persistenceStore = require('../job-manager/persistenceStore').factory.create(),
    responses = require('./connectorResponses'),
    jobManager = require('../job-manager/jobManager'),
    compileSiteJobQueue = require('../job-manager/jobQueue');


var CompilationService = function() {
        this.compileSiteInProgress = false;
    },
    apiVersion = 'v1',
    logsDir = '';

CompilationService.prototype.setLogsDir = function (inputLogsDir) {
    logsDir = inputLogsDir;
    jobManager.setLogsDir(inputLogsDir);
};

CompilationService.prototype.restartJobs = function () {
    var self = this;

    // get all the the existing jobs
    persistenceStore.getAllJobs().then(function (allJobConfigs) {
        // get all the jobs that need to be re-started
        allJobConfigs.filter(function (jobConfig) {
            // If the job is not finished (i.e.: COMPILED), we need to re-start it
            // If the job has 'FAILED' then we don't restart it, they need to re-submit the job and start again
            return ['FAILED', 'CREATED', 'COMPILED'].indexOf(jobConfig.status) === -1;
        }).map(function (jobConfig) {
            // ok, we have a running job that we need to re-start, kick it off again
            console.log('RESTART enqueue jobId:' + jobConfig.properties.id + ' from: ' + jobConfig.status);
            compileSiteJobQueue.enqueue(jobConfig);
            return jobConfig.properties.id;
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
}

CompilationService.prototype.getApiVersions = function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([apiVersion]));
};

CompilationService.prototype.getServer = function(req, res) {
    var response = responses.formatResponse("GET", "/" + apiVersion + "/server", {
            authenticationType: "NO_AUTH"
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

        persistenceStore.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            var response = responses.formatResponse("GET", self.prependApiVersion("/job/") + jobId, {
                jobId: jobMetadata.properties.id,
                name: jobMetadata.name,
                siteName: jobMetadata.siteName,
                serverName: jobMetadata.serverName,
                token: jobMetadata.token,
                status: jobMetadata.status,
                progress: jobMetadata.progress
            });

            if (jobMetadata.status === 'COMPILED' || jobMetadata.status === 'FAILED') {
                var args = {
                        id: jobId,
                        siteName: jobMetadata.siteName,
                        logsDir: logsDir
                    };
                persistenceStore.readLog(args).then(function(data) {
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

        persistenceStore.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            jobManager.updateJobPublic(jobMetadata, data).then(function(updatedJobMetadata) {
                var response = responses.formatResponse("POST", self.prependApiVersion("/job/") + jobId, {
                        jobId: updatedJobMetadata.properties.id,
                        name: updatedJobMetadata.name,
                        siteName: updatedJobMetadata.siteName,
                        serverName: updatedJobMetadata.serverName,
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


CompilationService.prototype.createJob = function(req, res, compileServerName) {
    var self = this;

    this.validateRequest(req, {
        requiredData: ['name','siteName']
    }).then(function(args) {
        var name = args.data.name,
            siteName = args.data.siteName,
            publishUsedContentOnly = args.data.publishUsedContentOnly,
            token = args.data.token || ''; // Optional

        persistenceStore.createJob({
            name: name,
            siteName: siteName,
            serverName: compileServerName,
            publishUsedContentOnly: publishUsedContentOnly,
            token: token
        }).then(function(newJob) {
            console.log('newJob', newJob);

            var response = responses.formatResponse("POST", self.prependApiVersion("/job"), {
                    jobId: newJob.properties.id,
                    name: newJob.name,
                    siteName: newJob.siteName,
                    serverName: newJob.serverName,
                    token: newJob.token,
                    status: newJob.status
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

        persistenceStore.getJob({
            jobId: jobId
        }).then(function(jobMetadata) {
            persistenceStore.deleteJob({
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

        persistenceStore.getJob({
            jobId: jobId
        }).then(function(originalMetadata) {

            jobManager.updateStatus(originalMetadata, "PUBLISH_SITE").then(function(updatedJobConfig) {

                compileSiteJobQueue.enqueue(updatedJobConfig);

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
    if (!compileSiteJobQueue.isEmpty()) {
        console.log('Dequeue next compile site request');
        setTimeout(this.compileSite.bind(self), 0);
    }
};

CompilationService.prototype.compileSite = function() {
    var self = this;

    if (compileSiteJobQueue.isEmpty()) {
        console.log('compileSite called when job queue is empty');
        return;
    } else if (self.isCompileSiteBusy()) {
        console.log('****** Compile site in progress. compileSite request will not processed immediately');
        return;
    }

    var originalMetadata = compileSiteJobQueue.dequeue();

    // Set busy after dequeue
    self.setCompileSiteBusy(true);

    console.log('--------------------- Compile site begin ---------------------');

    jobManager.compileSiteJob(originalMetadata).then(function() {
        self.compileSiteDone();
    }, function() {
        self.compileSiteDone();
    });
};

module.exports = new CompilationService();