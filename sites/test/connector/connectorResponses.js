
/* globals app, module, __dirname */

var mustache = require('mustache');

var responses = {
        "GET": {
            "/v1.1/server": {
              "name": "OCE Site Compilation",
              "nameLocalizations": [
                {
                  "locale": "en",
                  "localizedString": "OCE Site Compilation"
                }
              ],
              "version": "v1",
              "serverVersion": "20.1.3",
              "about": "OCE Site Compilation<br>Copyright (c) 2020, Oracle and/or its affiliates. All rights reserved.",
              "aboutLocalizations": [
                {
                    "locale": "en",
                    "localizedString": "OCE Site Compilation<br>Copyright (c) 2020, Oracle and/or its affiliates. All rights reserved."
                }
              ],
              "authenticationType": "{{authenticationType}}",
            },
            "/v1.1/job/{{jobId}}": {
              "id": "{{jobId}}",
              "name": "{{name}}",
              "siteName": "{{siteName}}",
              "compileOnly": "{{compileOnly}}",
              "publishUsedContentOnly": "{{publishUsedContentOnly}}",
              "doForceActivate": "{{doForceActivate}}",
              "serverEndpoint": "{{{serverEndpoint}}}",
              "serverUser": "{{serverUser}}",
              "serverPass": "{{serverPass}}",
              "token": "{{token}}",
              "status": "{{status}}",
              "progress": "{{progress}}",
              "publishSiteBackgroundJobId": "{{publishSiteBackgroundJobId}}",
              "publishStaticBackgroundJobId": "{{publishStaticBackgroundJobId}}",
              "publishingJobId": "{{publishingJobId}}",
              "renditionJobId": "{{renditionJobId}}",
              "contentType": "{{contentType}}"
            },
            "/jobNotFound": {
              "errorCode": "404",
              "errorMessage": "Job {{jobId}} is not found"
            }
        },
        "POST": {
            "/v1.1/job": {
              "id": "{{jobId}}",
              "name": "{{name}}",
              "siteName": "{{siteName}}",
              "compileOnly": "{{compileOnly}}",
              "publishUsedContentOnly": "{{publishUsedContentOnly}}",
              "doForceActivate": "{{doForceActivate}}",
              "serverEndpoint": "{{{serverEndpoint}}}",
              "serverUser": "{{serverUser}}",
              "serverPass": "{{serverPass}}",
              "token": "{{token}}",
              "status": "{{status}}",
              "progress": "{{progress}}",
              "publishingJobId": "{{publishingJobId}}",
              "renditionJobId": "{{renditionJobId}}",
              "contentType": "{{contentType}}",
            },
            "/v1.1/job/{{jobId}}": {
              "id": "{{jobId}}",
              "name": "{{name}}",
              "siteName": "{{siteName}}",
              "compileOnly": "{{compileOnly}}",
              "publishUsedContentOnly": "{{publishUsedContentOnly}}",
              "doForceActivate": "{{doForceActivate}}",
              "serverEndpoint": "{{{serverEndpoint}}}",
              "serverUser": "{{serverUser}}",
              "serverPass": "{{serverPass}}",
              "token": "{{token}}",
              "status": "{{status}}",
              "progress": "{{progress}}",
              "publishingJobId": "{{publishingJobId}}",
              "renditionJobId": "{{renditionJobId}}",
              "contentType": "{{contentType}}"
            },
            "/v1.1/job/{{jobId}}/compile/queued": {
                "id": "{{jobId}}",
                "messageCode": "COMPILEQUEUED",
                "message": "Compile request queued"
            },
            "/authenticationError": {
              "errorCode": "{{errorCode}}",
              "errorMessage": "{{errorMessage}}"
            }
        },
        "DELETE": {
          "/v1.1/job/{{jobId}}": {
            "id": "{{jobId}}",
            "messageCode": "DELETED",
            "message": "Job {{jobId}} deleted"
        }
      }
    };

var RESPONSE_TEMPLATE = JSON.stringify(responses);

var ConnectorResponses = function() {};

ConnectorResponses.prototype.formatResponse = function (callType, url, model) {
  var response;

  try {

    var filledResponses = mustache.render(RESPONSE_TEMPLATE, model);

    var responses = JSON.parse(filledResponses)[callType.toUpperCase()];

    // backwards compatibility
    // convert v1 urls to v1.1 - no current overrides
    var versionUrl = url.replace('/v1/', '/v1.1/');

    response = responses[versionUrl];
  } catch(e) {
    console.log('e');
  }

  if (response) {
    return response;
  } else {
    var errorMessage = "connectoResponse.formatResponse failed to create response for url " + url;
    throw({
      errorCode: 400,
      errorMessage: errorMessage
    });
  }
};

module.exports = new ConnectorResponses();