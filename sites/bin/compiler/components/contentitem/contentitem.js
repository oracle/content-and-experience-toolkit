var fs = require('fs'),
	path = require('path'),
	serverUtils = require('../../../../test/server/serverUtils.js');

var serverURL = 'http://localhost:8085',
	siteURLPrefix = serverURL + '/templates';

var SYSTEM_DEFAULT_LAYOUT = 'system-default-layout';

var ContentItem = function () {};

var reportedFiles = {};

var getDetailPageUrl = function (pageUrl, options) {
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
		contentLayoutCategory = (args.contentLayoutCategory || 'default').toLowerCase();

	return new Promise(function (resolve, reject) {
		// get the content layout map
		// ToDo: Add support for querying the map against a real server
		var contentTypeMapURL = siteURLPrefix + '/' + SCSCompileAPI.getSiteId() + '/caas_contenttypemap.json';

		// get the content map
		var request = serverUtils.getRequest();
		request.get(contentTypeMapURL, function (err, response, body) {
			if (err) {
				console.log(' - failed to retrieve content layout map ' + contentTypeMapURL);
				return resolve({});
			}

			var layoutName = '',
				data = {};
			try {
				data = JSON.parse(body);
			} catch (e) {
				console.log(' - failed to parse content layout map ' + contentTypeMapURL);
			}

			// now locate the layout
			if (Array.isArray(data)) {
				var typeEntry = data.find(function (entry) {
					return entry.type === contentType;
				});

				if (typeEntry && Array.isArray(typeEntry.categoryList)) {
					var layoutEntry = typeEntry.categoryList.find(function (entry) {
						return entry.categoryName.toLowerCase() === contentLayoutCategory;
					});

					layoutName = layoutEntry && layoutEntry.layoutName;
				}
			}

			// resolve with the layout name or use the system default layout
			if (!layoutName) {
				var message = 'failed to find content layout map entry for: ' + contentType + ':' + contentLayoutCategory + '. Will compile using the system default layout.';
				if (!reportedFiles[message]) {
					console.log(message);
					reportedFiles[message] = 'done';
				}
			}
			return resolve(layoutName || SYSTEM_DEFAULT_LAYOUT);
		});
	});
};

ContentItem.prototype.getContentLayout = function (SCSCompileAPI, contentType, contentLayoutCategory, compVM) {
	var self = this;
	return self.getContentLayoutName(SCSCompileAPI, {
		contentType: contentType,
		contentLayoutCategory: contentLayoutCategory
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
				console.log('no custom content layout compiler for: "' + (compileFile ? compileFile + '.js' : contentLayoutName) + '"');
			}
		}

		// unable to load the content layout
		return Promise.resolve('');
	});
};

ContentItem.prototype.compile = function (args) {
	var self = this,
		SCSCompileAPI = args.SCSCompileAPI;

	return new Promise(function (resolve, reject) {
		self.getContentLayout(SCSCompileAPI, args.compVM.contentTypes[0], args.compVM.contentLayoutCategory, args.compVM).then(function (compileFile) {
			if (compileFile) {
				// ok, file's there, load it in
				var CustomLayoutCompiler = require(compileFile);

				// now get the content 
				var contentClient = SCSCompileAPI.getContentClient();

				var contentId = args.compVM.contentId;
				if (!contentId) {
					console.log('Error: component has no contentId: ' + args.compVM.id);
					return resolve({
						content: ''
					});
				} else {
					self.getContentItem({
						contentClient: contentClient,
						contentId: contentId,
						compVM: args.compVM,
						template: SCSCompileAPI.getSiteId()
					}).then(function (content) {
						var detailPageId = args.compVM.detailPageId || SCSCompileAPI.getDetailPageId(),
							detailPageURL = getDetailPageUrl(SCSCompileAPI.getPageURL(detailPageId), {
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
									contentTriggerFunction: 'SCSRenderAPI.getComponentById(\'' + args.compVM.id + '\').raiseContentTrigger',
									detailPageLink: detailPageURL,
									showPublishedContent: args.compVM.contentViewing === 'published' ? true : contentClient.getInfo().contentType === 'published'
								}
							},
							custComp = new CustomLayoutCompiler(compileArgs);

						custComp.compile().then(function (compiledComp) {
							return resolve({
								content: compiledComp && compiledComp.content,
								hydrate: compiledComp && compiledComp.hydrate
							});
						}).catch(function (e) {
							console.log('Error: failed to compile component: ' + viewModel.id + ' into the page. The component will render in the client.');
							return resolve({
								content: ''
							});
						});
					}).catch(function (e) {
						console.log('Error: failed to compile content item: ' + contentId + '. The component will render in the client.');
						if (e) {
							console.log('statusCode: ' + e.statusCode + '. statusMessage: ' + e.statusMessage + '. ');
						}
						return resolve({
							content: ''
						});
					});
				}
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
		compVM = args.compVM;

	if (compVM && compVM.contentItemCache && compVM.contentItemCache.data) {
		// if we've already got the data (content list) then use it
		return Promise.resolve(compVM.contentItemCache.data);
	} else {
		// otherwise, fetch the data
		return contentClient.getItem({
			id: contentId,
			template: args.template
		});
	}
};


module.exports = new ContentItem();