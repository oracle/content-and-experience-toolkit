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
		var $ = cheerio.load('<div>');
		var $parentObj = $('<div></div>');
		var content = '';
		var i;

		var ciData = this.componentInstanceObject || {};
		var slData = ciData.data || {};
		var idPrefix = 'sl-tabs-' + this.componentId,
			tabPrefix = idPrefix + 'tab',
			accordionPrefix = idPrefix + 'accordion',
			contentPrefix = idPrefix + 'content',
			hashPrefix = '#' + idPrefix;
		var components = slData.components = (slData.components || []);
		var config = slData.customSettingsData || {};

		try {

			/*if (isEditMode && !self.sectionLayoutData.once && components.length === 0) {
				addTab(null, true, true);
			}*/

			if (components && (components.length > 0)) {
				// Add in any per-instance custom styles
				var addCustomStyle = config.activeTabColor || config.inactiveTabColor,
					addMobileStyle = config.breakpoint && config.behavior === 'accordion';

				if (addCustomStyle || addMobileStyle) {
					html += '<style>';

					// add in the custom styling
					if (addCustomStyle) {
						if (config.inactiveTabColor) {
							html += '#' + idPrefix + ' > ul li.' + inactiveTabClass + ' { background-color: ' + config.inactiveTabColor + '; } ';
						}

						if (config.activeTabColor) {
							html += '#' + idPrefix + ' > ul li.' + activeTabClass + ' { background-color: ' + config.activeTabColor + '; } ';
						}
					}

					// add in the mobile styling
					if (addMobileStyle) {
						html += '@media screen and (max-width: ' + config.breakpoint + 'px) { ';
						// hide the tablist and show the accordion when below the threshold
						html += '#' + idPrefix + 'tablist { display: none; }';
						html += '#' + idPrefix + '>a.sl-tabs-accordion { clear: left; display: block; }';
						html += '}';
					}

					html += '</style>';
					$parentObj.append(html);
				}

				//
				// Add in the tab list
				//
				html = '<div id="' + idPrefix + '">';

				// Create markup for the tabs
				html += '  <ul id="' + idPrefix + 'tablist" class="sl-tabs-tablist" style="height: 36px; overflow: hidden; visibility: hidden; margin: 3px;">';
				for (i = 0; i < components.length; i++) {
					html += '<li id="' + tabPrefix + i + '" data-sl-tabs=\'{"index": ' + i + '}\'><a href="' + hashPrefix + '-' + (i + 1) + '">';
					/*if (isEditMode) {
						html += '<button type="button" data-position="'+i+'" class="sl-tabs-delete">';
						html += '<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 7 7"><path fill-rule="evenodd" d="M2855.27778,557.5 L2858,554.777778 L2857.22222,554 L2854.5,556.722222 L2851.77778,554 L2851,554.777778 L2853.72222,557.5 L2851,560.222222 L2851.77778,561 L2854.5,558.277778 L2857.22222,561 L2858,560.222222 L2855.27778,557.5 Z" transform="translate(-2851 -554)"/></svg>';
						html += '</button><span data-position="'+i+'"></span></a></li>';
					} else {*/
					html += '<span></span></a></li>';
					/*}*/
					//html += (i+1) + '</span></a></li>';
				}
				/*
				if (isEditMode) {
					// Create markup for add tab
					html += '<li class="'+addTabClass+'"><a href="" id="' + idPrefix + '-add"><span>'+resources['COMP_CONFIG_SECTION_LAYOUT_NEW_TAB_DISPLAY_NAME']+'</span></a></li>';
				}
				*/
				html += '  </ul>';

				// Create markup for the panels
				for (i = 0; i < components.length; i++) {
					var contentId = contentPrefix + i,
						accordionId = accordionPrefix + i,
						componentId = components[i],
						tabData = getTabData(slData, componentId),
						accordionLabel = tabData && tabData.label || '',
						ariaLabel = accordionLabel;

					html += '<a href="#" id="' + accordionId + '" style="display: none;" data-sl-tabs=\'{"index": ' + i + '}\' aria-label="' + ariaLabel + '">' + accordionLabel + '</a>';
					html += '<div id="' + contentId + '" style="display: ' + ((i === 0) ? 'block' : 'none') + '"><div id="' + componentId + '"></div></div>';
				}

				html += '</div>';
				var $html = $(html);

				// Set the tab labels
				$html.find('ul li a span').each(function (index) {
					var componentId,
						tabData;
					if (index < components.length) {
						componentId = components[index];
						tabData = getTabData(slData, componentId);
						if (tabData && tabData.label) {
							$(this).text(tabData.label);
						}
						/*else {
							$(this).text(resources['COMP_CONFIG_SECTION_LAYOUT_TAB_DISPLAY_NAME'] + ' ' + (index+1));
							updateTabData(self.sectionLayoutData, componentId, {label: resources['COMP_CONFIG_SECTION_LAYOUT_TAB_DISPLAY_NAME'] + ' ' + (index+1)});
							saveComponentInstanceData(self.sectionLayoutData, true);
						}*/
					}
				});

				$parentObj.append($html);
				content = $parentObj.html();
			}
			/*else if (isEditMode) {
				$(parentObj).append('<div id="' + idPrefix + '"><ul><li><a href="" id="' + idPrefix + '-add">'+resources['COMP_CONFIG_SECTION_LAYOUT_NEW_TAB_DISPLAY_NAME']+'</a></li></ul><div id="' + idPrefix + '" class="sl-empty-tabs">Empty Tabs</div></div>');
				initialize();
				attachEventHandlers();
			}*/
		} catch (e) {
			compilationReporter.error({
				message: 'failed to compile scs-tabs section layout',
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