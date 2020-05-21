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
    cheerio = require('cheerio'),
    Base = require('../base/base'),
	constants = require('../common/component-constants').constants,
    Component = require('../component/component');


var compilationReporter = require('../../reporter.js');

var Title = function (compId, compInstance, componentsFolder) {
    this.init(compInstance.type, compId, compInstance);
    this.componentsFolder = componentsFolder;
};
Title.prototype = Object.create(Base.prototype);

Title.prototype.compile = function (args) {

    // make sure we can compile
    if (!this.canCompile) {
        return Promise.resolve({
            hydrate: true,
            content: ''
        });
    }

    // store the compile args
    this.compileArgs = args;
    this.SCSCompileAPI = args && args.SCSCompileAPI;

    // extend the model with any contentsearch specific values
    this.subType = this.toolbarGroups ? 'scs-text' : '';
    this.wrapperTag = this.getWrapperTag();
    this.computedTextStyleClass = this.subType ? this.subType : (this.type + "-text");
    this.computedContentStyle = 'text-align:left;' + this.computedWidthStyle;
    this.computedStyle = this.computeStyle();
    this.viewUserText = this.getViewUserText();

    var promises;

    var CONTENT_DETAIL_LINK_G = /\[!--\$SCS_CONTENT_DETAIL--\]*(.*?) *\[\/!--\$SCS_CONTENT_DETAIL--\]/g;
    var matches = this.viewUserText.match(CONTENT_DETAIL_LINK_G);
    if (matches) {
        var self = this;

        // create a promise for each content detail link in the user text;
        // each promise will asynchronously find the href that it resolves to.
        promises = matches.map(function(contentItemLink) {
            // each contentItemLink is a string matching the above regexp
            if (contentItemLink) {
                return new Promise(function (resolve, reject) {
                    // Get contentId, contentType, contentViewing, contentName, and (optionally) detailPageId
                    var CONTENT_DETAIL_LINK = /\[!--\$SCS_CONTENT_DETAIL--\]*(.*?) *\[\/!--\$SCS_CONTENT_DETAIL--\]/;
                    var tokens = CONTENT_DETAIL_LINK.exec(contentItemLink)[1].split(',');
                    self.getDetailPageLinkURL(args.SCSCompileAPI, {
                        href: constants.LINK_PAGE_PREFIX + tokens[4] + constants.LINK_PAGE_SUFFIX,
                        contentId: tokens[0],
                        contentType: tokens[1]
                    }).then(function(url) {
                        resolve({
                            contentItemLink: contentItemLink,
                            url: url
                        });
                    });
                });
            } else {
                return Promise.resolve();
            }
        });
    } else {
        promises = [Promise.resolve()];
    }

    return Promise.all(promises).then(function(results) {
        // for each contentItemLink macro, replace with the resolved url
        results.forEach(function(contentItemLinkMapping) {
            if (contentItemLinkMapping) {
                this.viewUserText = this.viewUserText.replace(contentItemLinkMapping.contentItemLink, contentItemLinkMapping.url);
            }
        }.bind(this));

        var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'title.html'), 'utf8'));

        // render any asychnronous items into the content
        return this.renderAscynchronousItems(content).then(function (allContent) {
            // now we're done, return the fully rendered content
            return Promise.resolve({
                hydrate: true,
                content: allContent
            });
        });
	}.bind(this));
};

Title.prototype.getViewUserText = function () {
    var self = this,
        currentVal = self.userText;

    // Remove any script, object, applet, embed or form tags
    currentVal = currentVal.replace(/<script/gi, '&#60;script');
    currentVal = currentVal.replace(/<\/script>/gi, '&#60;&#47;script&#62;');
    currentVal = currentVal.replace(/<embed/gi, '&#60;embed');
    currentVal = currentVal.replace(/<\/embed>/gi, '&#60;&#47;embed&#62;');
    currentVal = currentVal.replace(/<form/gi, '&#60;form');
    currentVal = currentVal.replace(/<\/form>/gi, '&#60;&#47;form&#62;');
    currentVal = currentVal.replace(/<object/gi, '&#60;object');
    currentVal = currentVal.replace(/<\/object>/gi, '&#60;&#47;object&#62;');
    currentVal = currentVal.replace(/<applet/gi, '&#60;applet');
    currentVal = currentVal.replace(/<\/applet>/gi, '&#60;&#47;applet&#62;');

    currentVal = currentVal.replace(/javascript:/gi, 'java-script:');
    currentVal = currentVal.replace(/vbscript:/gi, 'vb-script:');

    // update the src and poster attributes for images and videos to point to the macro expansion value
    currentVal = currentVal.replace(/data-scs-src/g, 'src');
    currentVal = currentVal.replace(/data-scs-poster/g, 'poster');

    return currentVal;
};

Title.prototype.computeStyle = function () {
    var self = this,
        computedStyle = '';

    // Border and Corners are used only if no Style is chosen
    if (self.useStyleClass === 'false') {
        computedStyle += 'font-size:' + self.fontSize + 'px;';
        computedStyle += 'font-family:' + self.fontFamily + ';';
        computedStyle += 'background-color:' + self.backgroundColor + ';';
        computedStyle += 'color:' + self.fontColor + ';';

        computedStyle += self.computeBorderStyle;
    }

    return computedStyle;
};
Title.prototype.getWrapperTag = function () {
    var styleClassTag = this.styleClassTag || 'p',
        tagValue = this.subType === 'scs-text' ? styleClassTag.toLowerCase() : 'div';

    // return the tag value if it's supported
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'].indexOf(styleClassTag) !== -1) {
        return tagValue;
    } else {
        return 'p'; // only happens if text is set but tag set to unsupported value so use text default
    }
};

Title.prototype.getStyleClassName = function () {
    var subType = this.subType || (this.toolbarGroups ? 'scs-text' : '');

    // use the style class name or default to the component subType or type
    return this.styleClassName || subType || this.type;
};


// render any asynchronous items that may exist in the title such as "content items"
Title.prototype.renderAscynchronousItems = function (origContent) {
    var self = this,
        content = origContent,
        contentItemPromises = [];


    // find all the content items in the content 
    var $ = cheerio.load('<div id="scsTitleCompileContent">' + content + '</div>');
    $('div.scs-rte-contentitem').each(function (i, element) {
        var $element = $(element);

        // extract all the attribute properties
        var categoryLayout = $element.attr('data-categorylayout'),
            contentId = $element.attr('data-contentid'),
            contentName = $element.attr('data-contentname'),
            contentType = $element.attr('data-contenttype'),
            detailPageId = $element.attr('data-detailpageid') || self.SCSCompileAPI.getDetailPageId(),
            contentViewing = $element.attr('data-contentviewing');

        if (contentId && contentType) {
            var compId = self.generateUUID(),
                compInstance = {
                    'type': 'scs-component',
                    'id': 'scsCaaSLayout',
                    'data': {
                        'actions': self.actions, // content items in a content list inherit the content list actions
                        'componentId': '',
                        'componentName': 'scsContentQueryItemInstance',
                        'contentId': contentId,
                        'contentLayoutCategory': categoryLayout,
                        'contentPlaceholder': false,
                        'contentTypes': [contentType],
                        'contentViewing': 'v1.1',
                        'isCaaSLayout': true,
                        'detailPageId': detailPageId,
                        'marginBottom': 0,
                        'marginLeft': 0,
                        'marginRight': 0,
                        'marginTop': 0
                    }
                };

            // create a new content item
            var contentItem = new Component(compId, compInstance, self.componentsFolder);

            // compile the content item
            contentItemPromises.push(contentItem.compile(self.compileArgs).then(function (compiledContent) {
                // resolve with all the known data
                return Promise.resolve({
                    contentItem: contentItem,
                    element: element,
                    compiledContent: compiledContent
                });
            }));
        }
    });

    // once all the content items have completed
    return Promise.all(contentItemPromises).then(function (compiledItems) {
        // replace each content item entry with the corresponding result
        compiledItems.forEach(function (compiledItem) {
            var compileResult = compiledItem.compiledContent || {};

            // if the compiled item has data, we can insert it now and note it needs to be hydrated
            if (compileResult.content) {
                var $element = $(compiledItem.element),
                    compId = compiledItem.contentItem.id;
                // insert the item into the Rich Text element
                $element.html('<div id="' + compId + '" class="scs-component-container"><div class="scs-component-bounding-box">' + compileResult.content + '</div></div>');

                // note whether this element should be hydrated within the page
                if (compileResult.hydrate) {
                    $element.attr('data-scs-hydrate', true);
                }

                // note content item was compiled so that we don't try to re-render it at runtime
                $element.attr('data-scs-compiled', true);

                // note the GUID created for the component
                $element.attr('data-scs-compid', compId);
            }
        });

        // finally return the updated content
        return Promise.resolve($('#scsTitleCompileContent').html());
    });
};

module.exports = Title;