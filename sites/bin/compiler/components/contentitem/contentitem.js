var fs = require('fs'),
	path = require('path'),
	serverUtils = require('../../../../test/server/serverUtils.js'),
	compilationReporter = require('../../reporter.js');

var serverURL = 'http://localhost:8085',
	siteURLPrefix = serverURL + '/templates';

var SYSTEM_DEFAULT_LAYOUT = 'system-default-layout';

var ContentItem = function (args) {
	this.defaultContentLayoutCategory = 'default';
};

var reportedFiles = {};

ContentItem.prototype.getDetailPageUrl = function (pageUrl, options) {
	var dotPos = pageUrl.lastIndexOf('.');
	var slashPos = pageUrl.lastIndexOf('/');

	var detailSuffix = options.contentType + '/' + options.contentId + '/';
	if (options.contentSlug && (typeof options.contentSlug === 'string')) {
		// slug only navigation:  <slug>          - "honda-civic-lx"
		detailSuffix = options.contentSlug;
	} else {
		// normal navigation:  <type>/<id>/<slug> - "Car/123456789/honda-civic-lx"
		//                or:  <type>/<id>        - "Car/123456789"
		detailSuffix = options.contentType + '/' + options.contentId + '/';
		if (options.contentName && (typeof options.contentName === 'string')) {
			detailSuffix += options.contentName;
		}
	}

	if (dotPos > slashPos + 1) {
		// "products/detail.html" --> "products/detail/Car/123456789/honda-civic-lx"
		pageUrl = pageUrl.substring(0, dotPos) + '/';
	} else if (dotPos === slashPos + 1) {
		// "detail/.html" --> "/detail/Car/123456789/honda-civic-lx"
		pageUrl = pageUrl.substring(0, dotPos);
	} else if (slashPos === pageUrl.length - 1) {
		// "detail/" --> "detail/Car/123456789/honda-civic-lx"
	} else if (slashPos < pageUrl.length) {
		pageUrl += '/';
	}

	pageUrl += detailSuffix;

	return pageUrl;
};

ContentItem.prototype.getContentLayoutName = function (SCSCompileAPI, args) {
	// ToDo: Handle mobile generation
	var contentType = args.contentType,
		contentLayoutCategory = (args.contentLayoutCategory || args.defaultContentLayoutCategory || this.defaultContentLayoutCategory).toLowerCase(),
		siteFolder = SCSCompileAPI.siteFolder;

	return new Promise(function (resolve, reject) {
		// get the content layout map file from the content export
		var contentSummaryFile = path.join(siteFolder, 'assets', 'contenttemplate', 'summary.json'),
			layoutName;

		// if the content summary file exists, get the layout map
		if (fs.existsSync(contentSummaryFile)) {
			try {
				// get the content layout mappings
				var summaryjson = JSON.parse(fs.readFileSync(contentSummaryFile, {
					encoding: 'utf8'
				}));
				var categoryLayoutMappings = summaryjson.categoryLayoutMappings || summaryjson.contentTypeMappings;

				// now locate the layout and the "default" entry
				if (Array.isArray(categoryLayoutMappings)) {
					var typeEntry = categoryLayoutMappings.find(function (entry) {
						return entry.type === contentType;
					});

					if (typeEntry && Array.isArray(typeEntry.categoryList)) {
						var layoutEntry = typeEntry.categoryList.find(function (entry) {
							return entry.categoryName.toLowerCase() === contentLayoutCategory;
						});

						layoutName = layoutEntry && layoutEntry.layoutName;

						// if no layoutName found, fallback to the 'default' one before we ultimately fallback to the system default
						if (!layoutName && (contentLayoutCategory !== 'default')) {
							layoutEntry = typeEntry.categoryList.find(function (entry) {
								return entry.categoryName.toLowerCase() === 'default';
							});

							layoutName = layoutEntry && layoutEntry.layoutName;
						}
					}
				}
			} catch (e) {
				// failed to read mapping file,
				compilationReporter.error({
					message: 'failed to read or parse content layout map entry in file: ' + contentSummaryFile,
					error: e
				});
			}
		}

		// resolve with the layout name or use the system default layout
		if (!layoutName) {
			if (!contentType) {
				compilationReporter.info({
					message: 'failed to find content layout map entry - no content types defined. Placeholder component will render at runtime.'
				});
			} else {
				compilationReporter.warn({
					message: 'failed to find content layout map entry for: ' + contentType + ':' + contentLayoutCategory + '. Will compile using the system default layout.'
				});
			}
		}
		return resolve(layoutName || SYSTEM_DEFAULT_LAYOUT);
	});
};

ContentItem.prototype.getContentLayout = function (SCSCompileAPI, args) {
	var self = this,
		contentType = args.contentType,
		contentLayoutCategory = args.contentLayoutCategory,
		compVM = args.compVM,
		defaultContentLayoutCategory = args.defaultContentLayoutCategory;

	return self.getContentLayoutName(SCSCompileAPI, {
		contentType: contentType,
		contentLayoutCategory: contentLayoutCategory,
		defaultContentLayoutCategory: defaultContentLayoutCategory
	}).then(function (contentLayoutName) {
		var compileFile = '';
		if (contentLayoutName) {
			try {
				if (contentLayoutName === SYSTEM_DEFAULT_LAYOUT) {
					compileFile = './' + SYSTEM_DEFAULT_LAYOUT;
				} else {
					compileFile = path.normalize(compVM.componentsFolder + '/' + contentLayoutName + '/assets/compile');
				}

				// verify if we can load the file
				require.resolve(compileFile);
				foundComponentFile = true;

				return Promise.resolve(compileFile);
			} catch (e) {
				compilationReporter.warn({
					message: 'no custom content layout compiler for: "' + (compileFile ? compileFile + '.js' : contentLayoutName) + '"'
				});
			}
		}

		// unable to load the content layout
		return Promise.resolve('');
	});
};

ContentItem.prototype.isComponentValid = function (id, contentId) {
	if (!contentId) {
		compilationReporter.error({
			message: ' component has no contentId: ' + id
		});
		return false;
	} else {
		return true;
	}
};
ContentItem.prototype.compile = function (args) {
	var self = this,
		SCSCompileAPI = args.SCSCompileAPI;

	return new Promise(function (resolve, reject) {
		self.getContentLayout(SCSCompileAPI, {
			contentType: self.getContentType(args),
			contentLayoutCategory: args.compVM.contentLayoutCategory,
			compVM: args.compVM,
			defaultContentLayoutCategory: args.defaultContentLayoutCategory
		}).then(function (compileFile) {
			if (compileFile) {
				// ok, file's there, load it in
				var CustomLayoutCompiler = require(compileFile);

				// now get the content 
				SCSCompileAPI.getContentClient().then(function (contentClient) {
					var contentId = args.compVM.contentId;
					if (!self.isComponentValid(args.compVM.id, contentId)) {
						return resolve({
							content: ''
						});
					} else {
						self.getContentItem({
							contentClient: contentClient,
							contentId: contentId,
							compVM: args.compVM,
							template: SCSCompileAPI.getSiteId(),
							SCSCompileAPI: SCSCompileAPI
						}).then(function (content) {
							var detailPageId = args.compVM.detailPageId || SCSCompileAPI.getDetailPageId(),
								detailPageURL = self.getDetailPageUrl(SCSCompileAPI.getPageURL(detailPageId), {
									contentType: content.type,
									contentId: content.id,
									contentSlug: content.slug
								});

							// compile the content layout with the data
							var compileArgs = {
									contentItemData: content,
									contentClient: contentClient,
									scsData: {
										id: args.compVM.id,
										SCSCompileAPI: SCSCompileAPI,
										contentLayoutCategory: args.compVM.contentLayoutCategory,
										contentTriggerFunction: 'SCSRenderAPI.getComponentById(\'' + args.compVM.id + '\').raiseContentTrigger',
										detailPageLink: detailPageURL,
										showPublishedContent: args.compVM.contentViewing === 'published' ? true : contentClient.getInfo().contentType === 'published',
										contentClient: contentClient
									}
								},
								custComp = new CustomLayoutCompiler(compileArgs);

							custComp.compile().then(function (compiledComp) {
								// add in the detail page to compile as well
								SCSCompileAPI.compileDetailPage(args.compVM.detailPageId, content);

								// we're done
								return resolve({
									content: compiledComp && compiledComp.content,
									hydrate: compiledComp && compiledComp.hydrate
								});
							}).catch(function (e) {
								compilationReporter.error({
									message: 'failed to compile component: ' + self.id + ' into the page. The component will render in the client.',
									error: e
								});
								return resolve({
									content: ''
								});
							});
						}).catch(function (e) {
							var error;
							if (e && e.statusCode) {
								error = e ? 'statusCode: ' + e.statusCode + '. statusMessage: ' + e.statusMessage + '. ' : '';
							} else {
								error = 'failed in:  ' + compileFile + ' - ' + e.toString();
							}
							compilationReporter.error({
								message: 'failed to compile content item: ' + contentId + ' with layout: ' + compileFile + '. The component will render in the client.',
								error: error
							});
							return resolve({
								content: ''
							});
						});
					}
				});
			} else {
				// can't find content layout compiler
				return resolve({
					content: ''
				});
			}
		});
	});
};

ContentItem.prototype.getContentItem = function (args) {
	var contentClient = args.contentClient,
		contentId = args.contentId,
		compVM = args.compVM,
		SCSCompileAPI = args.SCSCompileAPI;

	if (compVM && compVM.contentItemCache && compVM.contentItemCache.data) {
		// if we've already got the data (content list) then use it
		return Promise.resolve(compVM.contentItemCache.data);
	} else {
		// otherwise, fetch the data
		var getItemArgs = {
			id: contentId,
			template: args.template
		};

		// if langauge defined, use it
		if (SCSCompileAPI && SCSCompileAPI.pageLocale) {
			getItemArgs.language = SCSCompileAPI.pageLocale;
		}

		return new Promise (function (resolve, reject) {
			contentClient.getItem(getItemArgs).then(function (result) {
				resolve(result);
			}).catch(function (e) {
				compilationReporter.warn({
					message: 'failed to get content item with: ' + JSON.stringify(getItemArgs),
					error: (e && e.error) || e
				});
				reject(e);
			});
		});
	}
};

ContentItem.prototype.getContentType = function (args) {
	return args.compVM.contentTypes[0];
};


module.exports = ContentItem;