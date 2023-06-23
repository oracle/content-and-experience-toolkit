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
	Base = require(path.normalize('../base/base')),
	contentSDK = require('../../../../test/server/npm/contentSDK.js'),
	Component = require('../component/component'),
	SectionLayout = require('../sectionlayout/sectionlayout'),
	ContentItem = require('../contentitem/contentitem');

var compilationReporter = require('../../reporter.js');

var contentItem = new ContentItem(),
	serverURL = 'http://localhost:8085',
	siteURLPrefix = serverURL + '/templates';

var ContentList = function (compId, compInstance, componentsFolder) {
	this.init(compInstance.type, compId, compInstance);
	this.componentsFolder = componentsFolder;

	// default the layout category to the content list default
	this.layoutCategory = this.layoutCategory || 'Content List Default';
};
ContentList.prototype = Object.create(Base.prototype);

ContentList.prototype.compile = function (args) {
	var self = this,
		SCSCompileAPI = args.SCSCompileAPI,
		content = '';

	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	return new Promise(function (resolve, reject) {
		// can't compile if it requires pagination or is a recommendation
		if ((self.loadType === 'showPagination') || (self.isRecommendation)) {
			compilationReporter.warn({
				message: 'Cannot compile content/dynamic lists that leverage pagination or use recommendations.'
			});
			return resolve({
				hydrate: true,
				content: ''
			});
		}

		// check if there is a compiler for the content item
		contentItem.getContentLayout(SCSCompileAPI, {
			contentType: Array.isArray(self.contentTypes) && self.contentTypes.length > 0 ? self.contentTypes[0] : undefined, // no contentTypes for dynamiclist
			contentLayoutCategory: self.layoutCategory,
			compVM: self,
			defaultContentLayoutCategory: 'Content List Default'
		}).then(function (compileFile) {
			if (!compileFile && self.type !== 'scs-dynamiclist') {
				// if no compiler exists for the content layout, then can't compile content list into the page
				return resolve({
					hydrate: true,
					content: ''
				});
			}
			self.compileFiles = []; // (array) object of content layout compile filenames with content types as named indexes

			self.fetchData(args).then(function (results) {
				// compile all the content items
				self.compileContentItems(args, results).then(function (contentItems) {
					// if no content items, then render the content list dynamically
					if (contentItems.length === 0) {
						return resolve({
							hydrate: false,
							content: ''
						});
					}

					// compile the section layout
					self.compileSectionLayout(args, contentItems).then(function (compiledContentList) {
						if (compiledContentList) {
							// extend the model with any content list specific values
							self.renderListId = 'renderList' + self.id;
							self.computedStyle = self.encodeCSS(self.computeStyle());
							self.computedListStyle = self.encodeCSS(self.computeListStyle());
							self.computedContentStyle = self.encodeCSS(self.computeContentStyle());
							self.compiledContentList = compiledContentList;

							// render the content
							content = self.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'contentlist.html'), 'utf8'));
						}

						return resolve({
							hydrate: true,
							content: content
						});
					});
				});
			}).catch(function (e) {
				var reportingOptions = {
					message: 'ContentList: failed to execute query during compile - check the server is up and that the channelToken and query are correct',
					error: e && (e.debugError || ('Response - ' + e.statusCode + ':' + e.statusMessage))
				};
				compilationReporter.error(reportingOptions);
				return resolve({
					hydrate: true,
					content: ''
				});
			});
		});
	});
};

ContentList.prototype.createContentItemInstance = function (contentId, contentType, contentData) {
	// Add an additional component to an existing content list
	var self = this;

	// add the component to the renderer's page model
	// this is a temporary component that will not be stored with the page
	return {
		'type': 'scs-component',
		'id': 'scsCaaSLayout',
		'data': {
			'actions': self.actions, // content items in a content list inherit the content list actions
			'componentId': '',
			'componentName': 'scsContentQueryItemInstance',
			'contentId': contentId,
			'contentLayoutCategory': self.contentLayoutCategory || self.layoutCategory,
			'contentPlaceholder': false,
			'contentTypes': [contentType],
			'contentViewing': 'v1.1',
			'isCaaSLayout': true,
			'detailPageId': self.detailPageId,
			'contentItemCache': {
				data: contentData
			},
			'customSettingsData': self.customSettingsData && self.customSettingsData.contentLayout || {},
			'marginBottom': 0,
			'marginLeft': 0,
			'marginRight': 0,
			'marginTop': 0
		}
	};
};


ContentList.prototype.createSectionLayoutInstance = function (args, contentItems) {
	// Add an additional component to an existing content list
	var self = this,
		sectionLayoutInstance = args.SCSCompileAPI.getComponentInstanceData(self.sectionLayoutInstanceId);

	// default the section layout instance if it doesn't exist
	sectionLayoutInstance = sectionLayoutInstance || {
		'type': 'scs-sectionlayout',
		'id': 'scs-sl-vertical',
		'data': {
			'customSettingsData': '',
			'componentFactory': 'scs-vertical'
		}
	};

	// add in any custom settings data
	if (self.customSettingsData && self.customSettingsData.sectionLayout && sectionLayoutInstance.data) {
		sectionLayoutInstance.data.customSettingsData = self.customSettingsData.sectionLayout;
	}

	// add in the components to render in the section layout
	sectionLayoutInstance.data.components = (contentItems || []).map(function (contentItem) {
		return contentItem.id;
	});

	// add in the componentFactory for any ootb section layouts
	var ootbSectionLayouts = {
		'scs-sl-horizontal': 'scs-sl-horizontal',
		'scs-sl-slider': 'scs-slider',
		'scs-sl-tabs': 'scs-tabs',
		'scs-sl-three-columns': 'scs-three-columns',
		'scs-sl-two-columns': 'scs-two-columns',
		'scs-sl-vertical': 'scs-vertical'
	};
	sectionLayoutInstance.data.componentFactory = sectionLayoutInstance.data.componentFactory || ootbSectionLayouts[sectionLayoutInstance.id];

	return sectionLayoutInstance;
};

ContentList.prototype.compileSectionLayout = function (args, contentItems) {
	// create a section layout compiler
	var self = this,
		slInstance = self.createSectionLayoutInstance(args, contentItems);
	self.sectionLayoutInstanceId = self.generateUUID();
	var sectionLayout = new SectionLayout(self.sectionLayoutInstanceId, slInstance, self.componentsFolder);

	// if there are no content items, then nothing to render
	if (contentItems.length === 0) {
		return Promise.resolve('');
	}

	// compile the content items into the section layout
	return sectionLayout.compile(args).then(function (compiledSectionLayout) {
		var content = compiledSectionLayout && compiledSectionLayout.content;
		if (!content) {
			compilationReporter.warn({
				message: 'Section layout in content list failed to compile: ' + slInstance.id
			});
			return Promise.resolve('');
		}

		var $ = cheerio.load('<div></div>'),
			$compiledGrid;

		if (compiledSectionLayout.hydrate) {
			$compiledGrid = $('<div><div id="' + self.sectionLayoutInstanceId + '" class="scs-component-container scs-sectionlayout" data-scs-hydrate="true">' + content + '</div></div>');
		}
		else {
			$compiledGrid = $('<div><div id="' + self.sectionLayoutInstanceId + '" class="scs-component-container scs-sectionlayout">' + content + '</div></div>');
		}

		// insert the compiled content for each content item
		contentItems.forEach(function (contentItem) {
			var $contentItemDiv = $compiledGrid.find('#' + contentItem.id);

			if ($contentItemDiv.length > 0) {
				$contentItemDiv.append('<div class="scs-component-bounding-box">' + contentItem.content + '</div>');
			}
		});

		// return the compiled grid
		return Promise.resolve($compiledGrid.html());
	});
};

ContentList.prototype.compileContentItems = function (args, results) {
	var self = this,
		compilePromises = [],
		compiledItems = [];

	// create the array of promises
	(results && results.items || []).forEach(function (item) {
		compilePromises.push(function () {
			var compId = self.generateUUID(),
				compInstance = self.createContentItemInstance(item.id, item.type, item);
			var component = new Component(compId, compInstance, self.componentsFolder);
			return component.compile(args).then(function (compiledContent) {
				compiledContent.id = compId;
				compiledItems.push(compiledContent);
				return Promise.resolve(compiledContent);
			});
		});
	});

	// execute the promises sequentially
	var doCompileItems = compilePromises.reduce(function (previousPromise, nextPromise) {
		return previousPromise.then(function (compiledItem) {
			// wait for the previous promise to complete and then call the function to start executing the next promise
			return nextPromise();
		});
	},
	// Start with a previousPromise value that is a resolved promise
	Promise.resolve());

	return doCompileItems.then(function (compiledItem) {
		// if no items rendered, then we need to compile the default for the content list
		if (compiledItems.length === 0) {
			// ToDo: - for now content item will render dynamically
			return Promise.resolve([]);
		} else {
			// all items must have been compiled or no items are compiled and let the list render dynamically
			var nonCompiledItem = compiledItems.find(function (item) {
				// failed to compile if no content
				return !item.content;
			});

			// if there was at least one non-compiled item, then render the content list dynamically
			if (nonCompiledItem) {
				compilationReporter.warn({
					message: 'at least one item failed to compile in the content list, the content list will render dynamically'
				});
				return Promise.resolve([]);
			} else {
				return Promise.resolve(compiledItems);
			}
		}
	});
};

ContentList.prototype.fetchData = function (args) {
	var viewModel = this,
		SCSCompileAPI = args.SCSCompileAPI;

	// get the page locale
	viewModel.language = viewModel.language || SCSCompileAPI.pageLocale;

	// now get the content
	return SCSCompileAPI.getContentClient().then(function (contentClient) {
		// generate query string from options, ignoring ones without a value
		var getQueryString = function (options) {
			var query = Object.keys(options.searchOptions).filter(function (key) {
				return options.searchOptions[key];
			}).map(function (key) {
				return encodeURIComponent(key) + '=' + encodeURIComponent(options.searchOptions[key]);
			}).join('&');

			// Append the additional query parameters, if any
			if (options.queryString) {
				query = query + "&" + options.queryString;
			}

			return query;
		};

		return contentClient.queryItems({
			'types': viewModel.contentTypes,
			'search': getQueryString({
				searchOptions: {
					'fields': viewModel.computedFieldsString(viewModel),
					'offset': viewModel.firstItem,
					'limit': viewModel.maxResults,
					'orderBy': viewModel.computeSortOrder(viewModel),
					'default': viewModel.computeDefaultString(viewModel)
				},
				queryString: viewModel.scimQueryString(viewModel)
			})
		});
	});
};

ContentList.prototype.scimQueryString = function (viewModel) {
	var queryString = '';

	if (viewModel.where) {
		// where property is used by triggers. If value is not empty, use it to override all query related properties.
		queryString = viewModel.where;
	} else {
		if (viewModel.compType === 'scs-dynamiclist') {
			var sqr = viewModel.searchQueryString.trim();
			sqr = sqr.replace(/\n/g, ' '); // Server doesn't like newline char
			// ToDo: Support macro expansions
			queryString = "(" + sqr + ")"; // group (in paren) the multi-type search query as it'll be "AND" with site language
		}

		// Add contentType (if not dynamic list)
		var contentType = (viewModel.compType !== 'scs-dynamiclist') && viewModel.contentTypes && viewModel.contentTypes.length > 0 ? viewModel.contentTypes[0] : undefined;
		if (contentType) {
			queryString = '(type eq "' + contentType + '")';
		}

		// Add begin/end dates
		var dateRange = viewModel.dateRangeQueryParameter;
		if (dateRange) {
			var dates = dateRange.split(";");
			queryString = (queryString ? queryString + ' and ' : '') + '(updatedDate ge "' + dates[0] + '" and updatedDate le "' + dates[1] + '")';
		}

		// Add language
		// Use selected language of MLS site or language in settings.
		// ToDo: get language from SCSCompileAPI
		var language = viewModel.language;
		//var language = compCtx.getPageLanguage() || viewModel.language;

		// Add language
		if (language) {
			// Also include non-translatable items (29167789)
			queryString = (queryString ? queryString + ' and ' : '') + '(language eq "' + language + '" or translatable eq "false")';
		}
		// Add categories
		var categoryQuery = '',
			categoryFilters = viewModel.categoryFilters;
		if (categoryFilters && Array.isArray(categoryFilters) && categoryFilters.length > 0) {
			var catQueryId = viewModel.includeChildCategories ? "taxonomies.categories.nodes.id" : "taxonomies.categories.id";

			// the categories are "or"ed within a taxonomy, then
			// each of these "or" groups is "and"ed across taxonomies
			categoryQuery = '(' +
				categoryFilters.map(function (taxonomy) {
					return '(' + taxonomy.categories.map(function (category) {
						return catQueryId + ' eq "' + category + '"';
					}).join(" or ") + ')';
				}).join(" and ") + ')';
		}
		if (categoryQuery) {
			queryString = (queryString ? queryString + ' and ' : '') + categoryQuery;
		}

		// Add in user-supplied additional query string.
		// Also detect if the additional query string
		// is in the old "legacy" format.  If so, upgrade to SCIM format on-the-fly.
		// The legacy format is like field:name:equals=Mary whereas the SCIM format
		// is like (name eq "Mary").
		if (viewModel.queryString) {
			var addlQueryString = viewModel.computedQueryString();

			/*
			no longer support legacy querty strings
			if (isLegacyQueryString(addlQueryString)) {
				addlQueryString = convertToScimQueryString(viewModel, addlQueryString);
			}
			*/

			if (addlQueryString) {
				queryString = (queryString ? queryString + ' and ' : '') + '(' + addlQueryString + ')';
			}
		}
	}

	// Return string suitable for passing to SCIM-enabled searchItems
	return "q=(" + encodeURIComponent(queryString) + ")";
};

ContentList.prototype.computeDefaultString = function (viewModel) {
	return viewModel.search || null;
};

ContentList.prototype.computeSortOrder = function (viewModel) {
	// ToDo: support macro replacement
	if (viewModel.compType === 'scs-dynamiclist') {
		return viewModel.orderByString;
	}

	//var sortOrder = viewModel.sortOrder && viewModel.replaceMacros(viewModel.sortOrder);
	var sortOrder = viewModel.sortOrder;

	sortOrder = sortOrder && sortOrder.split(':');
	if (sortOrder && sortOrder.length === 2) {
		var order = sortOrder[1].toLowerCase();
		if (order === 'desc')
			order = 'des';

		var field = sortOrder[0];
		if (field === 'updateddate') {
			field = 'updatedDate';
		}

		return field + ':' + order;
	} else {
		return null;
	}
};

ContentList.prototype.computedFieldsString = function (viewModel) {
	// ToDo: support macro replacement
	// if content list, return ALL fields
	return viewModel.compType === 'scs-dynamiclist' ? viewModel.fieldsString || 'ALL' : 'ALL';
};


ContentList.prototype.computedQueryString = function () {
	// apply any macro expansion to the query string
	// ToDo: Support macro expansions
	//var queryString = this.replaceMacros(self.queryString) || '';
	var queryString = this.queryString || '';

	var params = queryString.split('&').map(function (param) {
		var p = param.split('=');
		return {
			name: p[0],
			value: p[1]
		};
	}).filter(function (param) {
		return param.name !== 'offset';
	}).map(function (param) {
		return param.value ? (param.name + '=' + param.value) : param.name;
	}).join('&');

	return params;
};

// compute CSS for contentlist
ContentList.prototype.computeStyle = function () {
	var viewModel = this;
	return this.computeBorderStyle;
};

// compute CSS
ContentList.prototype.computeListStyle = function () {
	// not required for compiled content lists
	return '';
};

// compute CSS for content
ContentList.prototype.computeContentStyle = function () {
	var viewModel = this;
	var computedContentStyle = '';

	computedContentStyle += viewModel.computedWidthStyle;

	return computedContentStyle;
};

module.exports = ContentList;