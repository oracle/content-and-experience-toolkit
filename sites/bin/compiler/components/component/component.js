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
	mustache = require('mustache'),
	Base = require(path.normalize('../base/base'));


var reportedFiles = {};

var Component = function (compId, compInstance, componentsFolder) {
	this.init('scs-component', compId, compInstance);
	this.custComp = compInstance.id;
	this.componentsFolder = componentsFolder;
};
Component.prototype = Object.create(Base.prototype);

Component.prototype.compile = function (args) {
	var self = this;
	// extend the model with any divider specific values
	self.customComponentDiv = self.id + 'customComponentDiv';
	self.computedStyle = self.computeStyle();
	self.computedContentStyle = self.computeContentStyle();

	// load the custom component's compile.js file
	// if the file doesn't exist, the component doesn't support compile and will be rendered at runtime
	return self.compileComponent(args).then(function (compiledComponent) {
		var content = '';
		if (compiledComponent.customContent) {
			// render the content
			self.customContent = compiledComponent.customContent;
			self.customHydration = compiledComponent.hydrate ? 'data-scs-hydrate="true"' : '';
			content = self.renderMustacheTemplate(fs.readFileSync(path.join(__dirname, 'component.html'), 'utf8'));
		}

		return Promise.resolve({
			hydrate: true,
			content: content
		});
	});
};

Component.prototype.getStyleClassName = function () {
	var self = this;

	return self.styleClassName || self.componentId || self.type;
};

Component.prototype.computeStyle = function () {
	var viewModel = this,
		computedStyle = '';

	computedStyle += viewModel.computeBorderStyle;

	if (typeof viewModel.height === 'function') {
		computedStyle += 'height: ' + viewModel.getDimensionValue(viewModel.height) + ';max-height:100%;';
	}

	if (viewModel.inGallery && viewModel.scaling === 'crop' && viewModel.layout !== 'none') {
		computedStyle += 'max-' + viewModel.computedWidthStyle;
	}

	return computedStyle;
};
Component.prototype.computeContentStyle = function () {
	var viewModel = this,
		computedContentStyle = '';

	computedContentStyle += viewModel.computedWidthStyle;

	return computedContentStyle;
};

Component.prototype.compileNestedComponent = function (compId, compiledComps) {
	// find the nested component
	var nestedComps = this.nestedComponents || [],
		compData,
		i;
	for (i = 0; i < nestedComps.length; i++) {
		if (nestedComps[i].id === compId) {
			compData = nestedComps[i];
			break;
		}
	}

	// get the compiler for the nested component
	var componentCompilers = require('../component-compilers'),
		componentCompiler;

	if (compData && compData.type) {
		for (i = 0; i < componentCompilers.length; i++) {
			if (componentCompilers[i].type === compData.type) {
				componentCompiler = componentCompilers[i];
				break;
			}
		}
	}

	// if canNest this compiler...
	if (componentCompiler && componentCompiler.canNest) {
		// get the compiler
		var CompObj = require('../' + componentCompiler.compiler);

		// add in parentId 
		compData.data.parentId = this.id;
		var nestedComp = new CompObj(compId, compData);

		return nestedComp.compile().then(function (compiledComp) {
			var compContent = compiledComp && compiledComp.content || '';

			// match the dynamica model
			if (compContent) {
				compiledComps[compId] = compContent;
			} else {
				compiledComps[compId] = '';
			}
			return Promise.resolve();
		});
	} else {
		compiledComps[compId] = '';
		return Promise.resolve();
	}
};

Component.prototype.getSeededCompFile = function (compName) {
	var seededComps = {
			'scs-comp-article': {
				compileFile: 'article/article'
			},
			'scs-comp-headline': {
				compileFile: 'headline/headline'
			},
			'scs-comp-image-text': {
				compileFile: 'image-text/image-text'
			},
			'scs-contentitem': {
				compileFile: 'contentitem/contentitem'
			},
			'scsCaaSLayout': {
				// scs-contentitem when used in a content list
				compileFile: 'contentitem/contentitem'
			}
		},
		seededComp = seededComps[compName];

	return seededComp ? path.normalize(__dirname + '/../' + seededComp.compileFile) : '';
};

Component.prototype.compileComponent = function (args) {
	var viewModel = this,
		isSeeded = false;

	// make sure we can compile
	if (!this.canCompile) {
		return Promise.resolve({
			hydrate: true,
			content: ''
		});
	}

	return new Promise(function (resolve, reject) {
		//
		// compile in the referenced component
		//
		var compileFile = viewModel.getSeededCompFile(viewModel.custComp);
		if (compileFile) {
			isSeeded = true;
		} else {
			compileFile = path.normalize(viewModel.componentsFolder + '/' + viewModel.custComp + '/assets/compile');
		}

		var foundComponentFile = false;
		try {
			// verify if we can load the file
			require.resolve(compileFile);
			foundComponentFile = true;

			// ok, file's there, load it in
			var custComp = require(compileFile);

			// compile the component
			var compileArgs = {
				//contentSDK: contentSDK,
				SCSCompileAPI: args.SCSCompileAPI,
				compVM: viewModel,
				compId: viewModel.id,
				componentLayout: viewModel.componentLayout,
				customSettingsData: viewModel.customSettingsData || {}
			};
			if (typeof custComp.compile !== 'function') {
				return resolve({
					customContent: ''
				});
			}
			custComp.compile(compileArgs).then(function (compiledComp) {
				try {
					// make sure there is something to render
					if (compiledComp && compiledComp.content) {
						//
						// now compile in any nested components
						//
						var compiledComps = {},
							nestedCompPromises = [];
						(compiledComp.nestedIDs || []).forEach(function (id) {
							nestedCompPromises.push(function () {
								return viewModel.compileNestedComponent(id, compiledComps);
							});
						});
						var doNestedComponents = nestedCompPromises.reduce(function (previousPromise, nextPromise) {
								return previousPromise.then(function () {
									// wait for the previous promise to complete and then return a new promise for the next 
									return nextPromise();
								});
							},
							// Start with a previousPromise value that is a resolved promise 
							Promise.resolve());

						doNestedComponents.then(function () {
							//
							// now put it all together
							//
							try {
								// render in the nested components into the custom component
								var customContent = mustache.render(compiledComp.content, compiledComps);
								return resolve({
									customContent: customContent,
									hydrate: compiledComp.hydrate
								});
							} catch (e) {
								console.log(type + ': failed to expand template');
								console.log(e);
								return resolve({
									customContent: ''
								});
							}
						});
					} else {
						var message;
						if (['scsCaaSLayout', 'scs-contentitem'].indexOf(viewModel.custComp) !== -1) {
							message = 'failed to compile content item with layout that maps to category: "' + (viewModel.contentLayoutCategory || 'default') + '"';
						} else {
							message = 'failed to compile component with: ' + compileFile;
						}
						if (!reportedFiles[message]) {
							reportedFiles[message] = 'done';
							console.log(message);
						}
						return resolve({
							customContent: ''
						});
					}
				} catch (e) {
					// unable to compile the custom component, js
					console.log('Error: failed to render nested components for : ' + viewModel.id + ' into the page. The component will render in the client.');
					return resolve({
						customContent: ''
					});
				}
			}).catch(function (e) {
				console.log('Error: failed to compile component: ' + viewModel.id + ' into the page. The component will render in the client.');
				return resolve({
					customContent: ''
				});
			});
		} catch (e) {
			// unable to compile the custom component, js
			if (!reportedFiles[compileFile]) {
				reportedFiles[compileFile] = 'done';

				if (foundComponentFile) {
					console.log('require failed to load: "' + compileFile + '.js" due to:');
					console.log(e);
				} else {
					// don't report on placeholder components
					var placeHolder = (viewModel.custComp === 'scs-component') && (viewModel.contentPlaceholder);
					if (!placeHolder) {
						// don't report on ootb component sectionLayout compilers
						// these are temporary "components" for content lists that aren't compiled at this point so ignore them
						var ootbSectionLayouts = [
							'scs-sl-horizontal',
							'scs-sl-slider',
							'scs-sl-tabs',
							'scs-sl-three-columns',
							'scs-sl-two-columns',
							'scs-sl-vertical'
						];
						if (ootbSectionLayouts.indexOf(viewModel.custComp) === -1) {
							console.log('no custom component compiler for: "' + compileFile + '.js"');
						}
					}
				}
			}
			return resolve({
				customContent: ''
			});
		}
	});
};

module.exports = Component;