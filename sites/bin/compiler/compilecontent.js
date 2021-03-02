/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 * This unpublished work by Oracle is protected by the laws
 * of the United States and other countries. If publication
 * of this computer program should occur, the following notice
 * shall apply:
 *
 * Copyright (c) 2013 Oracle Corp.
 * All rights reserved.
 *
 * $Id: offline-publisher.js 141546 2016-03-24 23:23:28Z dpeterso $
 */

//*********************************************
// Requires
//*********************************************
var gulp = require('gulp'),
    zip = require('gulp-zip'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    serverUtils = require('../../test/server/serverUtils'),
    serverRest = require('../../test/server/serverRest'),
    fileUtils = require('../../test/server/fileUtils'),
    compilationReporter = require('./reporter.js'),
    componentLib = require('../component');

//*********************************************
// Configuration
//*********************************************

// Configured Variables
var componentsFolder, // <cec-install>/src/components
    channelAccessToken = '', // channel access token for the site
    server, // server to use for any content calls
    projectDir, // cec install folder
    itemsDir, // output "items" folder
    publishingJobId, // ID of the job to extract content items from
    renditionJobId, // ID of the rendition job associated with the publishing job, used by the server to identify the rendition call
    uploadContent, // TRUE if should upload the content to the server after compile
    contentIds, // list of content IDs to compile (if not specifying publishingJobID)
    contentType, // compile all published items of this content type
    componentsFolder, // The src/components folder path
    verbose, // run displaying all messages
    targetDevice, // compile for mobile or desktop.  If not specified, both will be compiled
    logLevel,
    channelAccessToken, // token to use for Content calls 
    server, // URL to the server that is hosting the content 
    projectDir, // the cec install folder
    itemsDir, // output location for compiled items
    jobProgress = 0, // progress of the compilation job
    lastStatusUpdate = 0, // the last time an update was sent
    zipFileName = "items.zip",
    zipFile, // the complete path to the zip file
    failedItems = []; // items that failed to compile


var compiler = {
    setup: function (args) {
        var self = this;
    },
    getContentCompileAPI: function () {
        return {
            channelAccessToken: channelAccessToken,
            getContentClient: function (type) {
                var self = this;

                return new Promise(function (resolve, reject) {
                    var contentSDK = require('../../test/server/npm/contentSDK.js'),
                        beforeSend = function () {
                            return true;
                        },
                        getLocalTemplateURL = '',
                        contentClientType = 'draft';

                    // get/create the content client cache
                    self.contentClients = self.contentClients || {};

                    // create the content client if it doesn't exist in the cache
                    if (!self.contentClients[contentClientType]) {
                        var serverURL,
                            authorization = '';

                        if (server && server.username && server.password) {
                            // use the configured server
                            serverURL = server.url;

                            // set the header
                            var requestAuth = serverUtils.getRequestAuth(server);
                            if (requestAuth.bearer) {
                                authorization = 'Bearer ' + requestAuth.bearer;
                            } else {
                                authorization = 'Basic ' + Buffer.from(requestAuth.user + ':' + requestAuth.password).toString('base64');
                            }
                            beforeSend = function (options) {
                                options.headers = options.headers || {};
                                options.headers.authorization = authorization;
                            };
                        } else {
                            // no server available, default
                            serverURL = 'http://localhost:8085';

                            // set the template to use for the local server requests
                            getLocalTemplateURL = serverURL + '/templates/' + templateName;
                        }

                        self.contentClients[contentClientType] = contentSDK.createPreviewClient({
                            contentServer: serverURL,
                            authorization: authorization,
                            contentType: contentClientType,
                            beforeSend: beforeSend,
                            contentVersion: 'v1.1',
                            channelToken: channelAccessToken || '',
                            isContentCompiler: true // currently not used but differentiate from template compiler
                        });
                    }
                    resolve(self.contentClients[contentClientType]);
                });
            },
            getChannelAccessToken: function () {
                return channelAccessToken;
            }
        };
    },
};

var contentLayoutMapPromises = {};
var getContentLayoutMap = function (contentContext, contentType) {
    if (!contentLayoutMapPromises[contentType]) {
        contentLayoutMapPromises[contentType] = serverRest.getContentType({
            server: server,
            name: contentType,
            expand: 'layoutMapping'
        }).then(function (result) {
            // setup the map, default to empty values if not available
            var layoutMap = result && result.layoutMapping || {};
            layoutMap.data = layoutMap.data || [];

            layoutMap.data.forEach(function (entry) {
                // if no mobile, then default to desktop
                if (entry.formats) {
                    if (entry.formats.desktop && !entry.formats.mobile) {
                        entry.formats.mobile = entry.formats.desktop;
                    }
                }
            });

            return Promise.resolve(layoutMap);
        });
    }

    return contentLayoutMapPromises[contentType];
};

var customContentCompilers = {};
var getCustomContentCompiler = function (contentContext, componentName) {
    if (!customContentCompilers[componentName]) {
        customContentCompilers[componentName] = new Promise(function (resolve, reject) {
            console.log(' - downloading component: ' + componentName);

            // download the custom content layout component from the server
            componentLib.downloadComponent({
                server: server.name,
                component: componentName,
                projectDir: projectDir
            }, function () {
                // see if the custom component has a compile.js file
                var compileFile = path.normalize(componentsFolder + '/' + componentName + '/assets/compile');
                try {
                    // verify if we can load the file
                    require.resolve(compileFile);
                    resolve(compileFile);
                } catch (e) {
                    // no compiler file
                    resolve('');
                }
            });
        });
    }
    return customContentCompilers[componentName];
};
// Create a version 4 GUID, following section 4.4 of https://www.ietf.org/rfc/rfc4122.txt
var generateUUID = function (options) {
    var guid = "";
    var i;
    var str;

    // Create an array filled with random bytes
    var byteArray = new Array(16);
    for (i = 0; i < byteArray.length; i++) {
        byteArray[i] = Math.floor(Math.random() * 256); // [0..255] inclusive
    }

    // Create a version 4 GUID
    byteArray[6] = 0x40 | (byteArray[6] & 0x0F);
    byteArray[8] = (byteArray[8] & 0xBF) | 0x80;

    if (!options || (typeof options.alphaFirstChar === 'undefined') || options.alphaFirstChar) {
        // Ensure the first character is an alpha character -- because these GUIDs will be used as IDs.
        byteArray[0] = (byteArray[0] | 0x80) | ((byteArray[0] & 0x60) || 0x20);
    }

    // Change the bytes into a string
    for (i = 0; i < byteArray.length; i++) {
        str = byteArray[i].toString(16);
        if (str.length == 1) {
            str = "0" + str;
        }
        guid += str;
    }

    if (!options || (typeof options.addDashes === 'undefined') || options.addDashes) {
        // Insert dashes at the traditional places
        // nnnnnnnn-nnnn-4nnn-vnnn-nnnnnnnnnnnn
        guid = guid.substring(0, 8) + "-" +
            guid.substring(8, 12) + "-" +
            guid.substring(12, 16) + "-" +
            guid.substring(16, 20) + "-" +
            guid.substring(20);
    }

    return guid;
};
var compileContentItemLayout = function (contentContext, contentItem, componentName, isMobile, format) {
    var id = generateUUID();

    // get the Custom Content Compiler
    return getCustomContentCompiler(contentContext, componentName).then(function (compileFile) {
        console.log(' - compiling "' + format + '" using "' + componentName + '" for ' + (isMobile ? 'mobile' : 'desktop'));
        // if no component file, we're done
        if (!compileFile) {
            compilationReporter.warn({
                message: 'no custom compiler for content layout: ' + componentName + '. Content Item: ' + contentItem.id + ' will not have ' + (isMobile ? 'mobile' : 'desktop') + ' rendition for ' + format
            });
            return Promise.resolve();
        } else {
            compilationReporter.info({
                message: 'Found custom compiler for: "' + componentName + '" component'
            });
        }

        // get the custom component
        var CustomLayoutCompiler = require(compileFile);

        // render the custom component with the content item
        return contentContext.SCSCompileAPI.getContentClient().then(function (contentClient) {
            var compileArgs = {
                    contentItemData: contentItem,
                    contentClient: contentClient,
                    scsData: {
                        id: id,
                        isMobile: isMobile,
                        SCSCompileAPI: contentContext.SCSCompileAPI,
                        contentClient: contentClient,
                        customSettingsData: {}
                    }
                },
                custComp = new CustomLayoutCompiler(compileArgs);

            return custComp.compile().then(function (compiledComp) {
                // write out the HTML in the structure
                // +- items
                //    +- <id1>
                //       +- <version>
                //          +- formats
                //             +- <format1>
                //                +- desktop
                //                   +- index.html
                //                +- mobile
                //                   +- index.html
                //             +- <format2>
                //             ...
                //    +- <id2>
                //       +- ...

                // create a clean ".../items/<id>/<version>/formats/<format>/<device>" folder 
                var deviceDir = path.join(contentContext.itemsDir, 'items', contentItem.id, contentItem.version, 'formats', format, isMobile ? 'mobile' : 'desktop');
                if (!fs.existsSync(deviceDir)) {
                    fs.mkdirSync(deviceDir, {
                        recursive: true
                    });
                }

                // write the "index.html" file if not already created
                var indexFile = path.join(deviceDir, 'index.html');
                if (!fs.existsSync(indexFile)) {
                    fs.writeFileSync(indexFile, compiledComp.content);
                }

                // we're done
                return Promise.resolve();
            }).catch(function (e) {
                compilationReporter.error({
                    message: 'failed to compile component: ' + contentItem,
                    error: e
                });
                return Promise.resolve({
                    content: ''
                });
            });
        });
    });
};

var compileContentItem = function (contentContext, item, index) {

    // update the progress
    var itemProgress = (index / contentContext.items.length) * 100;

    // get the content client
    return updateStatus({
        status: 'COMPILING',
        progress: jobProgress + (itemProgress * 0.9)
    }).then(function () {
        return contentContext.SCSCompileAPI.getContentClient().then(function (contentClient) {
            console.log('compileContentItem: Processing content item - ' + item.id + '...');
            // get the content item 
            // ToDo - add in version when available in the Content SDK
            return contentClient.getItem({
                id: item.id
            }).then(function (contentItem) {
                // get the content layout map for the content type
                return getContentLayoutMap(contentContext, contentItem.type).then(function (contentLayoutMap) {
                    var compileLayoutPromises = [];

                    // for each entry in the content layout map that needs to be compiled for this type
                    (contentLayoutMap && contentLayoutMap.data || []).forEach(function (layoutMap) {
                        if (layoutMap.generateRendition) {
                            // add in the desktop version
                            if (!layoutMap.formats.desktop) {
                                compilationReporter.warn({
                                    message: 'compileContentItem: no layout map for "' + contentItem.type + ':' + layoutMap.apiName + '" asset type on desktop. Will not be compiled'
                                });
                            } else {
                                compileLayoutPromises.push(function () {
                                    return compileContentItemLayout(contentContext, contentItem, layoutMap.formats.desktop, false, layoutMap.apiName);
                                });
                            }

                            // add in the mobile version
                            if (!layoutMap.formats.mobile) {
                                compilationReporter.warn({
                                    message: 'compileContentItem: no layout map for "' + contentItem.type + ':' + layoutMap.apiName + '" asset type on mobile. Will not be compiled'
                                });
                            } else {
                                compileLayoutPromises.push(function () {
                                    // use desktop for mobile, if no mobile option specified
                                    return compileContentItemLayout(contentContext, contentItem, layoutMap.formats.mobile, true, layoutMap.apiName);
                                });
                            }
                        } else {
                            compilationReporter.info({
                                message: 'compileContentItem: generateRendition set to false for: "' + contentItem.type + ':' + layoutMap.apiName + '". Will not be compiled'
                            });
                        }
                    });

                    if (compileLayoutPromises.length > 0) {

                        // serially compile the content items
                        var doCompileLayoutPromises = compileLayoutPromises.reduce(function (previousPromise, nextPromise) {
                                return previousPromise.then(function () {
                                    // wait for the previous promise to complete and then call the function to start executing the next promise
                                    return nextPromise();
                                });
                            },
                            // Start with a previousPromise value that is a resolved promise 
                            Promise.resolve());

                        return doCompileLayoutPromises;
                    } else {
                        compilationReporter.warn({
                            message: 'compileContentItem: no valid compile options for - ' + item.id
                        });
                    }
                });
            }).catch(function (e) {
                if (e.statusCode) {
                    compilationReporter.error({
                        message: 'compileContentItem: failed to load content item - ' + item.id + '. Response code: ' + e.statusCode
                    });
                } else {
                    compilationReporter.error({
                        message: 'compileContentItem: failed to compile content item - ' + item.id,
                        error: e
                    });
                }
                return Promise.resolve();
            });
        });
    });
};
var compileContentItems = function (contentContext) {
    var compileContentItemPromises = [];
    // create the content item compilation promises
    contentContext.items.forEach(function (item, index) {
        compileContentItemPromises.push(function () {
            // update the current content Item
            return compileContentItem(contentContext, item, index);
        });
    });

    // serially compile the content items
    var doCompileContentItems = compileContentItemPromises.reduce(function (previousPromise, nextPromise) {
            return previousPromise.then(function () {
                // wait for the previous promise to complete and then call the function to start executing the next promise
                return nextPromise();
            });
        },
        // Start with a previousPromise value that is a resolved promise 
        Promise.resolve());

    // wait for all promises to resolve
    return doCompileContentItems;
};

var folder2json = function (filename) {
    var stats = fs.lstatSync(filename),
        info,
        key = path.basename(filename);

    if (stats.isDirectory()) {
        info = {};
        info[key] = fs.readdirSync(filename).map(function (child) {
            return folder2json(filename + '/' + child);
        });
        if (key !== 'items') {
            if (info[key].length === 1) {
                info[key] = info[key][0];
            }
        }
    } else {
        // file, add any info
        info = {
            name: path.basename(filename)
        };
    }

    return info;
};

var zipCompiledContent = function (contentContext) {
    // we need to import the renditions to the server
    return updateStatus({
        status: 'UPLOADING',
        progress: 95
    }).then(function () {
        return new Promise(function (resolve, reject) {
            // create the metadata file based on files created
            var compiledFiles = path.join(itemsDir, 'items');
            if (!fs.existsSync(compiledFiles)) {
                fs.mkdirSync(compiledFiles, {
                    recursive: true
                });
            }
            var metadata = folder2json(compiledFiles);

            // add in the version info
            (metadata.items || []).forEach(function (item) {
                // find the items in the list of items
                var compiledItem = contentContext.items.find(function (contextItem) {
                    return Object.keys(item).indexOf(contextItem.id) !== -1;
                });
                // insert the version 
                if (compiledItem && item[compiledItem.id]) {
                    item[compiledItem.id].version = compiledItem && compiledItem.version || '';
                }
            });

            // add in the job info
            metadata.publishingJobId = publishingJobId || '';
            metadata.renditionJobId = renditionJobId || '';

            // write the metadata file
            var metadataFilename = path.join(contentContext.itemsDir, 'items', 'metadata.json');
            if (fs.existsSync(metadataFilename)) {
                fs.unlinkSync(metadataFilename);
            }
            fs.writeFileSync(metadataFilename, JSON.stringify(metadata));

            // zip up the content 
            var distFolder = path.join(projectDir, 'dist');

            // finish up the reporting for the console.log file
            console.log('Creating zip file of compiled content: ' + zipFile);
            compilationReporter.renderReport();

            // zip up all the files
            fs.closeSync(fs.openSync(zipFile, 'w'));
            gulp.src(itemsDir + '/**')
                .pipe(zip(zipFileName))
                .pipe(gulp.dest(distFolder))
                .on('end', function () {
                    return resolve();
                });
        });
    });
};

// update the rendition status on the server
var updateStatus = function (args) {
    var status = args.status,
        progress = args.progress;

    // placeholder until server available
    var timeStamp = new Date();
    thisStatusUpdate = timeStamp.getTime();

    // check if not complete and it was 5 seconds since last update
    if ((progress !== 100) && (thisStatusUpdate - lastStatusUpdate < 5000)) {
        return Promise.resolve();
    }

    // ToDo:  We're waiting for the server API. 
    // This is just a placeholder until that becomes avialable

    // update the status
    lastStatusUpdate = thisStatusUpdate;

    // note that we're updating the status
    compilationReporter.info({
        message: 'updating status to: ' + progress + '%'
    });


    var statusArgs = {
        server: server,
        jobId: renditionJobId,
        status: status,
        progress: progress,
        compiledAt: timeStamp.toISOString(),
        multipart: false
    };

    // if we're done, add in the file as well
    if (progress === 100 && zipFile) {
        statusArgs.multipart = true;
        statusArgs.filename = zipFileName;
        statusArgs.filePath = zipFile;
    }

    // update the status on the server if we have a rendition job ID
    if (statusArgs.jobId) {
        return serverRest.updateRenditionStatus(statusArgs).then(function (result) {
            if (result && result.error) {
                compilationReporter.warn({
                    message: 'failed to update rendition job status',
                    error: result.error
                });
            }
            return Promise.resolve();
        });
    } else {
        return Promise.resolve();
    }
};

var initializeContent = function () {
    // validate we can login to the server
    var request = serverUtils.getRequest();

    // get the content Ids
    var getContentItems = function () {
        return new Promise(function (resolve, reject) {
            if (contentIds) {
                // coerce format to expected value without version
                // currently don't support versions when specifying individual items
                var items = contentIds.map(function (id) {
                    return {
                        id: id
                    };
                });
                return resolve(items);
            } else if (contentType) {
                // get all the published items for the specified content type
                serverRest.queryItems({
                    server: server,
                    q: '((type eq "' + contentType + '") AND (isPublished eq "true"))',
                    fields: 'versionInfo',
                    limit: 9999
                }).then(function (result) {
                    var items = (result && result.data || []).map(function (item) {
                        return {
                            id: item.id,
                            version: item.publishedVersion
                        };
                    });

                    return resolve(items);
                }).catch(function (e) {
                    compilationReporter.error({
                        message: 'publishingJob: failed to query back all published items for - ' + contentType,
                        error: e
                    });
                    return resolve([]);
                });
            } else if (publishingJobId) {
                // get the publishing job
                serverRest.getPublishingJobItems({
                    server: server,
                    jobId: publishingJobId
                }).then(function (results) {
                    // if we got an error, report it
                    if (results && results.error) {
                        compilationReporter.error({
                            message: 'publishingJob: failed to get items from ' + publishingJobId,
                            error: results.error
                        });
                        return resolve([]);
                    }

                    // extract all the IDs from the publishing job
                    var items = (results && results.items || []).map(function (item) {
                        return {
                            id: item.id,
                            version: item.version
                        };
                    });

                    if (items.length === 0) {
                        compilationReporter.warn({
                            message: 'publishingJob: no items located in ' + publishingJobId,
                        });
                    }

                    return resolve(items);
                }).catch(function (e) {
                    compilationReporter.error({
                        message: 'publishingJob: Unable to locate publishing job - ' + publishingJobId,
                        error: e
                    });
                    return resolve([]);
                });
            } else {
                return resolve([]);
            }
        });
    };

    return serverUtils.loginToServer(server, request).then(function () {
        // make a clean "itemsDir"
        fileUtils.remove(itemsDir);
        fs.mkdirSync(itemsDir, {
            recursive: true
        });

        // remove any previous zip
        zipFile = path.join(projectDir, 'dist', zipFileName);
        fileUtils.remove(zipFile);

        // ouput console & reporter messages to: <items>/console.log
        var logFile = fs.createWriteStream(
            itemsDir + '/console.log', {
                flags: 'w'
            });
        var logStdout = process.stdout;

        // write console.log messages to console.log
        console.log = function () {
            logFile.write(util.format.apply(null, arguments) + '\n');
            logStdout.write(util.format.apply(null, arguments) + '\n');
        }.bind(console);

        // write reporter messages to console.log
        compilationReporter.setOutputStream(logFile);

        return getContentItems().then(function (fetchedItems) {
            // update the job progress
            jobProgress = 5;

            // update the status of the job on the server to start at 5% now we have all the IDs
            return updateStatus({
                status: 'CREATED',
                progress: jobProgress,
            }).then(function () {
                return Promise.resolve({
                    items: fetchedItems,
                    itemsDir: itemsDir,
                    request: request,
                    SCSCompileAPI: compiler.getContentCompileAPI()
                });
            });
        });
    });
};

var compileContent = function (args) {
    publishingJobId = args.publishingJobId;
    renditionJobId = args.renditionJobId;
    uploadContent = args.uploadContent;
    contentIds = args.contentIds;
    contentType = args.contentType;
    componentsFolder = args.componentsFolder;
    outputFolder = args.outputFolder;
    verbose = args.verbose;
    targetDevice = args.targetDevice;
    logLevel = args.logLevel;
    sitesCloudCDN = args.sitesCloudCDN || '';
    outputURL = args.outputURL;
    channelAccessToken = args.channelToken || '';
    server = args.server;
    projectDir = args.currPath;
    itemsDir = path.join(projectDir, 'dist', 'items');

    console.log("Oracle Content and Experience Content Compiler");
    console.log("");

    // setup the reporting level
    if (verbose) {
        compilationReporter.setReportingLevel('verbose');
    }

    // initialize the content items
    var reportRendered = false;
    return initializeContent().then(function (contentContext) {
        // compile the content items
        return compileContentItems(contentContext).then(function () {
            // upload the content items to the server
            return zipCompiledContent(contentContext).then(function () {
                return updateStatus({
                    status: 'COMPILED',
                    progress: 100,

                }).then(function () {
                    reportRendered = true;
                    return compilationReporter.hasErrors ? Promise.reject() : Promise.resolve();
                });
            });
        });
    }).catch(function (error) {
        if (!reportRendered) {
            compilationReporter.renderReport();
            reportRendered = true;
        }
        return updateStatus({
            status: 'ERROR',
            progress: 100
        }).then(function () {
            return compilationReporter.hasErrors ? Promise.reject() : Promise.resolve();
        });
    });
};

// expose the compiler functions
module.exports.compileContent = compileContent;