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
 * Copyright (c) 2019 Oracle Corp.
 * All rights reserved.
 *
 * $Id: gallerygrid.js 166460 2018-12-17 21:50:21Z muralik $
 */

var fs = require('fs'),
    path = require('path'),
    mustache = require('mustache');

var compilationReporter = require('../../reporter.js');

var Headline = function (args) {
    this.componentId = args.componentId;
    this.componentInstanceObject = args.componentInstanceObject;
    this.componentsFolder = args.componentsFolder;
    this.compData = this.componentInstanceObject.data;
};

Headline.prototype.compile = function () {
    var compId = this.componentId,
        customSettingsData = this.compData.customSettingsData,
        alignImage = this.compData.componentLayout === 'right' ? 'right' : 'left';

    return new Promise(function (resolve, reject) {
        try {
            var dir = __dirname,
                templateFile = path.join(dir, 'headline.html'),
                template = fs.readFileSync(templateFile, 'utf8');

            var model = {
                contentId: compId + '_content_runtime',
                alignCssClass: 'scs-align-' + alignImage,
                imageStyle: 'flex-basis:' + customSettingsData.width || '200px',
                alignImage: alignImage,
                image: '{{{image}}}',
                title: '{{{title}}}',
                byLine: '{{{byLine}}}'
            };

            var markup = '';
            markup = mustache.render(template, model);
            return resolve({
                hydrate: true,
                content: markup,
                nestedIDs: ['image', 'title', 'byLine']
            });
        } catch (e) {
            compilationReporter.error({
                message: type + ': failed to expand template',
                error: e
            });
        }
        return resolve({});
    });
};


module.exports = Headline;