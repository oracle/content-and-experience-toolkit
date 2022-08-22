/**
 * Copyright (c) 2022 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var fs = require('fs'),
    path = require('path'),
    url = require('url'),
    compilationReporter = require('../../reporter.js');


const ContentCompiler = class {
    constructor(SCSCompileAPI) {
        this.SCSCompileAPI = SCSCompileAPI;
    }

    async getLayoutCompiler(component) {
        var CustomLayoutCompiler;
        if (component.moduleFile) {
            // JavaScript Module
            const { default: importModule } = await import(url.pathToFileURL(component.moduleFile));
            CustomLayoutCompiler = importModule;
        } else {
            // CommonJS Module
            CustomLayoutCompiler = require(component.compileFile);
        }

        return CustomLayoutCompiler;
    }

    customCompile(args) {
        const CustomLayoutCompiler = args.CustomLayoutCompiler,
            content = args.content,
            createDetailPage = args.createDetailPage,
            detailPageId = args.detailPageId,
            compileArgs = args.compileArgs || {};

        const custComp = new CustomLayoutCompiler(compileArgs);

        return custComp.compile().then((compiledComp) => {
            // add in the detail page to compile as well
            if (createDetailPage) {
                this.SCSCompileAPI.compileDetailPage(detailPageId, content);
            }

            // we're done
            return Promise.resolve({
                content: compiledComp && compiledComp.content,
                hydrate: compiledComp && compiledComp.hydrate,
                contentId: content && content.id, // If we compiled a different variant of the asset, inform the caller
                contentType: content.type
            });
        }).catch(function (e) {
            compilationReporter.error({
                message: 'failed to compile content layout for: ' + (args && args.content && args.content.id),
                error: e
            });
            return Promise.resolve({
                content: ''
            });
        });
    }

    compileContentItem(args) {
        const componentID = (args && args.content && args.content.id);
        
        return new Promise(async (resolve, reject) => {
            try {
                // find the layout
                var compileFile = path.normalize(this.SCSCompileAPI.componentsFolder + '/' + args.layout + '/assets/compile');
                var customCompilerArgs = {
                    compileFile: compileFile
                };

                // check if the module version of the layout exists
                var moduleFile = compileFile + '.mjs';
                if (fs.existsSync(moduleFile)) {
                    customCompilerArgs.moduleFile = moduleFile;
                } else {
                    // otherwise verify if we can load the .js file with require()
                    require.resolve(compileFile);
                }

                // load the custom content layout compiler
                var CustomLayoutCompiler = await this.getLayoutCompiler(customCompilerArgs);


                // compile the content item 
                var contentClient = await this.SCSCompileAPI.getContentClient();
                var compileArgs = {
                    contentItemData: args.content,
                    contentClient: contentClient,
                    scsData: {
                        SCSCompileAPI: this.SCSCompileAPI,
                        contentClient: contentClient,
                        showPublishedContent: contentClient.getInfo().contentType === 'published'
                    }
                };

                var compiledContent = await this.customCompile({
                    CustomLayoutCompiler: CustomLayoutCompiler,
                    content: args.content,
                    createDetailPage: false, // don't create detail pages for content item if this API called directly
                    compileArgs: compileArgs
                });

                return resolve(compiledContent);
            } catch (e) {
                compilationReporter.error({
                    message: 'failed to load embedded content item: ' + componentID,
                    error: e
                });
                return resolve({
                    content: ''
                });
            }
        }).catch(function (e) {
            compilationReporter.error({
                message: 'failed to compile embedded content item: ' + componentID,
                error: e
            });
            return Promise.resolve({
                content: ''
            });
        });
    }
};

module.exports = ContentCompiler;