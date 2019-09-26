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
 * Copyright (c) 2014 Oracle Corp.
 * All rights reserved.
 *
 * $Id: base-vm.js 167153 2019-01-25 21:29:15Z muralik $
 */
var fs = require('fs'),
    path = require('path'),
    mustache = require('mustache');

var compilationReporter = require('../../reporter.js');

var ImageText = function (args) {
    this.componentId = args.componentId;
    this.componentInstanceObject = args.componentInstanceObject;
    this.componentsFolder = args.componentsFolder;
    this.compData = this.componentInstanceObject.data;
};

ImageText.prototype.compile = function () {
    var compId = this.componentId,
        customSettingsData = this.compData.customSettingsData,
        layout = this.compData.componentLayout || 'default',
        alignImage = layout === 'default' ? 'left' : layout,
        showStoryLayout = layout === 'default' || layout === 'right';

    return new Promise(function (resolve, reject) {
        try {
            var dir = __dirname,
                templateFile = path.join(dir, 'image-text.html'),
                template = fs.readFileSync(templateFile, 'utf8');

            var model = {
                contentId: compId + '_content_runtime',
                alignCssClass: 'scs-align-' + alignImage,
                imageStyle: showStoryLayout ? 'width:' + customSettingsData.width : '',
                alignImage: alignImage,
                image: '{{{image}}}',
                paragraph: '{{{paragraph}}}'
            };

            var markup = '';
            markup = mustache.render(template, model);
            return resolve({
                hydrate: true,
                content: markup,
                nestedIDs: ['image', 'paragraph']
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


module.exports = ImageText;