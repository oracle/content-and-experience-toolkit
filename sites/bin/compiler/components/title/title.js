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
    Base = require('../base/base');


var Title = function (compId, compInstance) {
    this.init(compInstance.type, compId, compInstance);
};
Title.prototype = Object.create(Base.prototype);

Title.prototype.compile = function () {
    // extend the model with any contentsearch specific values
    this.subType = this.toolbarGroups ? 'scs-text' : '';
    this.wrapperTag = this.getWrapperTag();
    this.computedTextStyleClass = this.subType ? this.subType : (this.type + "-text");
    this.computedContentStyle = 'text-align:left;' + this.computedWidthStyle;
    this.computedStyle = this.computeStyle();
    this.viewUserText = this.getViewUserText();

    var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'title.html'), 'utf8'));

    return Promise.resolve({
        hydrate: true,
        content: content
    });
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

    // update the src attributes for images to point to the macro expansion value
    currentVal = currentVal.replace(/data-scs-src/g, 'src');

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


module.exports = Title;