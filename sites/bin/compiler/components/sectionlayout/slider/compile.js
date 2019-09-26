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
 * $Id: compile.js 167153 2019-01-25 21:29:15Z dpeterso $
 */
var fs = require('fs'),
	path = require('path'),
	cheerio = require('cheerio');

var compilationReporter = require('../../../reporter.js');

var defaultTabClass = 'sl-tabs-tab',
	activeTabClass = 'sl-tabs-active',
	inactiveTabClass = 'sl-tabs-inactive',
	hoverTabClass = 'sl-tabs-hover',
	defaultPaneClass = 'sl-tabs-pane',
	defaultAccordionClass = 'sl-tabs-accordion',
	allButFirstAccordionClass = 'sl-tabs-accordion-allbutfirst',
	selectedPaneClass = 'sl-tabs-selected',
	activeTabConfigKey = 'activeTabIndex';

var getTabData = function (slData, componentId) {
	var tabData = null;
	if (slData && componentId && slData.tabData) {
		tabData = slData.tabData[componentId];
	}
	return tabData;
};

var SectionLayout = function (componentId, componentInstanceObject, componentsFolder) {
	this.componentId = componentId;
	this.componentInstanceObject = componentInstanceObject;
	this.componentsFolder = componentsFolder;
};
SectionLayout.prototype = {
	compile: function () {
		var html = '';
		var content = '';

		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};
		var idPrefix = 'slSlider-' + this.componentId;
		var components = slData.components = (slData.components || []);
		var config = slData.customSettingsData || {};
		var self = this,
			i,
			ratio;

		try {

			html += '<div class="sl-slider" id="' + idPrefix + '">';

			if (components.length > 0) {
				// Create markup for the panels
				for (i = 0; i < components.length; i++) {
					html += '<div class="sl-slider-page" style="display: ' + ((i === 0) ? 'block' : 'none') + '">';
					html += '<div id="' + components[i] + '"></div></div>';
				}

				// Create markup for the arrows
				html += '<span class="jssora02l sl-slider-arrow sl-slider-arrow-left"></span>';
				html += '<span class="jssora02r sl-slider-arrow sl-slider-arrow-right"></span>';
				/*
				} else if (isEditMode) {
					html += '<div class="sl-slider-watermark">';
					html += '<div class="sl-slider-watermark-image">';
					html += '</div>';
					html += '</div>';
				*/
			}

			html += '</div>'; // end of .sl-slider

			// Create markup for the buttons
			html += '<div class="sl-slider-buttons-wrapper">';
			html += '<ul class="sl-slider-buttons">';
			for (i = 0; i < components.length; i++) {
				html += '<li class="sl-slider-button"><a href="#slide' + (i + 1) + '"><span>' + (i + 1) + '</span></a></li>';
			}
			/*
			if (isEditMode) {
				html += '<br /><li id="sl-slider-button-add-' + self.componentId + '" class="sl-slider-button-add"><a href="#add"><span>' + resources.COMP_CONFIG_SECTION_LAYOUT_NEW_SLIDE_DISPLAY_NAME + '</span></a></li>';
			}
			*/
			html += '</ul>';
			html += '</div>'; // end of .sl-slider-buttons-wrapper

			// Blocking transition DIV
			html += '<div class="sl-blocking-div"></div>';
			var markup = html;

			// ---------------------- START OF STYLE ----------------------
			html = '<style>';

			if (config.useAspectRatio &&
				(typeof config.aspectRatio === 'string') && config.aspectRatio) {
				ratio = config.aspectRatio.split(':')[1] / config.aspectRatio.split(':')[0];

				html += '#' + idPrefix + ' { position: relative; width: 100%;}';
				html += '#' + idPrefix + ' { padding-top: ' + ratio * 100 + '%;}';
			} else if ((typeof config.height === 'number') && (config.height > 0)) {
				html += '#' + idPrefix + ' {min-height: ' + config.height + 'px;}';
			} else {
				html += '#' + idPrefix + ' {min-height: 240px;}';
			}

			// Show Indexer
			var displayValue = config.showIndexer ? 'inline-block' : 'none';
			html += '#' + self.componentId + ' > .scs-container-styles > .scs-component-content > .sl-slider-buttons-wrapper .sl-slider-button { display: ' + displayValue + '; } ';
			html += '#' + self.componentId + ' > .scs-container-styles > .scs-component-content > .sl-slider-buttons-wrapper br { display: ' + displayValue + '; } ';

			// Show Prev/Next
			displayValue = config.showPrevNext ? 'block' : 'none';
			html += '#' + idPrefix + ' > .sl-slider-arrow { display: ' + displayValue + '; } ';

			// If we have a responsive breakpoint, then allow the indexer
			// and prev/next buttons to be hidden.  However, if we are in 
			// edit mode, we still need a way to get to the next slide(s).
			if (config.breakpoint > 0) {
				html += '@media screen and (max-width: ' + config.breakpoint + 'px) {';

				// Responsive Height
				if (config.responsiveUseAspectRatio &&
					(typeof config.responsiveAspectRatio === 'string') && config.responsiveAspectRatio) {
					ratio = config.responsiveAspectRatio.split(':')[1] / config.responsiveAspectRatio.split(':')[0];

					html += '#' + idPrefix + ' { position: relative; width: 100%;}';
					html += '#' + idPrefix + ' { padding-top: ' + ratio * 100 + '%;}';
					// html += '#'+idPrefix+' { padding-top: calc(' + ratio * 100 + '% - 2 * 1px);}';

					// Turn off values which may have been set in the non-responsive markup
					html += '#' + idPrefix + ' {min-height: auto;}';
				} else if ((typeof config.responsiveHeight === 'number') && (config.responsiveHeight > 0)) {
					html += '#' + idPrefix + ' {min-height: ' + config.responsiveHeight + 'px;}';

					// Turn off values which may have been set in the non-responsive markup
					html += '#' + idPrefix + ' { padding-top: 0px;}';
				}

				// Responsive Hide Indexer
				displayValue = config.responsiveShowIndexer ? 'inline-block' : 'none';
				html += '#' + self.componentId + ' > .scs-container-styles > .scs-component-content > .sl-slider-buttons-wrapper .sl-slider-button { display: ' + displayValue + '; } ';
				html += '#' + self.componentId + ' > .scs-container-styles > .scs-component-content > .sl-slider-buttons-wrapper br { display: ' + displayValue + '; } ';

				// Responsive Hide Prev/Next
				displayValue = config.responsiveShowPrevNext ? 'block' : 'none';
				html += '#' + idPrefix + ' > .sl-slider-arrow { display: ' + displayValue + '; } ';

				html += '}';
			}
			html += '</style>';
			// ---------------------- END OF STYLE ----------------------

			content = markup + html;
		} catch (e) {
			compilationReporter.error({
				message: 'failed to compile scs-slider section layout',
				error: e
			});
			content = '';
		}

		return Promise.resolve({
			content: content,
			componentIds: (content && components && (components.length > 0)) ? components : null
		});
	}
};

module.exports = SectionLayout;