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
    Base = require(path.normalize('../base/base'));

var compilationReporter = require('../../reporter.js');


var Divider = function (compId, compInstance) {
    this.init('scs-divider', compId, compInstance);
};
Divider.prototype = Object.create(Base.prototype);

Divider.prototype.compile = function () {
    // make sure we can compile
    if (!this.canCompile) {
        return Promise.resolve({
            hydrate: true,
            content: ''
        });
    }

    // extend the model with any divider specific values
    this.computedStyle = this.encodeCSS(this.computeStyle());

    // render the content
    var content = this.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'divider.html'), 'utf8'));

    return Promise.resolve({
        hydrate: false,
        content: content
    });
};

Divider.prototype.computeStyle = function () {
    var viewModel = this,
        computedStyle = 'margin:0px;';

    // Border and Corners are used only if no Style is chosen
    if (viewModel.useStyleClass === 'false') {
        // border
        if (viewModel.dividerStyle !== 'none') {
            // border style/width/color
            computedStyle += 'border-style:' + viewModel.dividerStyle + ';';

            if (viewModel.dividerStyle !== 'solid') {
                computedStyle += 'border-width:' + viewModel.height + 'px 0px 0px 0px;';
            } else {
                computedStyle += 'border-width:' + Math.floor(viewModel.height / 2) + 'px 0px ' + Math.ceil(viewModel.height / 2) + 'px 0px;';
            }
            computedStyle += 'border-color:' + viewModel.dividerColor + ';';
        }

        // border radius (square, radius, or number of pixels)
        if (viewModel.dividerRadius === 'rounded') {
            computedStyle += 'border-radius:5px;';
        } else if (viewModel.dividerRadius === 'square' || viewModel.dividerStyle !== 'solid') {
            computedStyle += 'border-radius:0px;';
        } else {
            computedStyle += 'border-radius:' + viewModel.dividerRadius + 'px;';
        }
    }

    return computedStyle;
};


module.exports = Divider;