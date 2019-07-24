var fs = require('fs'),
	path = require('path'),
	contentSDK = require('../../../../test/server/npm/contentSDK.js'),
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

ContentItem.prototype.compile = function (args) {
	var self = this,
		SCSCompileAPI = args.SCSCompileAPI;

	return new Promise(function (resolve, reject) {
		var compileFile,
			foundComponentFile = false;

		self.getContentLayoutName({
			contentType: args.compVM.contentTypes[0],
			contentLayoutCategory: args.compVM.contentLayoutCategory
		}).then(function (contentLayoutName) {
			try {
				if (contentLayoutName === SYSTEM_DEFAULT_LAYOUT) {
					compileFile = './' + SYSTEM_DEFAULT_LAYOUT;
				} else {
					compileFile = path.normalize(args.compVM.componentsFolder + '/' + contentLayoutName + '/assets/compile');

					// verify if we can load the file
					require.resolve(compileFile);
					foundComponentFile = true;
				}

				// ok, file's there, load it in
				var CustomLayoutCompiler = require(compileFile);

				// now get the content 
				var contentClient = contentSDK.createPreviewClient({
					contentServer: serverURL,
					contentType: 'published',
					contentVersion: 'v1.1',
					channelToken: SCSCompileAPI.channelAccessToken || ''
				});

				var contentId = args.compVM.contentId;
				if (!contentId) {
					console.log('Error: component has no contentId: ' + args.compVM.id);
					return resolve({
						content: ''
					});
				} else {
					self.getContentItem({
						contentClient: contentClient,
						contentId: contentId
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
									showPublishedContent: true // ToDo: drive this from component settings
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
						console.log(e);
						return resolve({
							content: ''
						});
					});
				}
			} catch (e) {
				// failed to find compile file - report it
				if (!reportedFiles[compileFile]) {
					reportedFiles[compileFile] = 'done';

					if (foundComponentFile) {
						console.log('require failed to load: "' + compileFile + '.js" due to:');
						console.log(e);
					} else {
						console.log('No custom component compiler for: "' + compileFile + '.js"');
					}
				}

				return Promise.resolve({
					content: ''
				});
			}
		});
	});
};

ContentItem.prototype.getContentLayoutName = function (args) {
	// ToDo: Handle mobile generation
	var contentType = args.contentType,
		contentLayoutCategory = args.contentLayoutCategory || 'default';

	return new Promise(function (resolve, reject) {
		// get the content layout map
		// ToDo: Add support for querying the map against a real server
		var contentTypeMapURL = siteURLPrefix + '/siteCompileTestTemplate/caas_contenttypemap.json';

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
						return entry.categoryName === contentLayoutCategory;
					});

					layoutName = layoutEntry && layoutEntry.layoutName;
				}
			}

			// resolve with the layout name or use the system default layout
			return resolve(layoutName || SYSTEM_DEFAULT_LAYOUT);
		});
	});
};

ContentItem.prototype.getContentItem = function (args) {
	var contentClient = args.contentClient,
		contentId = args.contentId;

	return contentClient.getItem({
		id: contentId
	});
};


module.exports = new ContentItem();