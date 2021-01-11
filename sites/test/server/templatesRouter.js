/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals app, module, __dirname */
/* jshint esversion: 6 */
/**
 * Router handling /templates requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	fs = require('fs'),
	path = require('path');

var cecDir = path.resolve(__dirname).replace(path.join('test', 'server'), ''),
	defaultTestDir = cecDir + '/test',
	defaultLibsDir = cecDir + '/src/libs';
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;

var supportedLocales = ["af", "sq", "am", "ar", "ar-DZ", "ar-BH", "ar-EG", "ar-IQ", "ar-JO", "ar-KW", "ar-LB", "ar-LY", "ar-MA", "ar-OM", "ar-QA", "ar-SA", "ar-SY", "ar-TN", "ar-AE", "ar-YE", "hy", "as", "az", "az-AZ", "az-Cyrl-AZ", "az-Latn-AZ", "eu", "be", "bn", "bs", "bg", "my", "ca", "zh", "zh-CN", "zh-HK", "zh-MO", "zh-SG", "zh-TW", "hr", "cs", "da", "dv", "nl", "nl-BE", "nl-NL", "en", "en-CB", "en-AU", "en-BZ", "en-CA", "en-IN", "en-IE", "en-JM", "en-NZ", "en-PH", "en-ZA", "en-TT", "en-GB", "en-US", "et", "fo", "fi", "fr", "fr-BE", "fr-CA", "fr-FR", "fr-LU", "fr-CH", "gl", "ka", "de", "de-AT", "de-DE", "de-LI", "de-LU", "de-CH", "el", "gn", "gu", "he", "hi", "hu", "is", "id", "it", "it-IT", "it-CH", "ja", "kn", "ks", "kk", "km", "ko", "lo", "la", "lv", "lt", "mk", "ms", "ms-BN", "ms-MY", "ml", "mt", "mi", "mr", "mn", "ne", "zxx", "no", "no-NO", "nb", "nn", "or", "pa", "fa", "pl", "pt", "pt-BR", "pt-PT", "rm", "ro", "ro-MO", "ru", "ru-MO", "sa", "gd", "gd-IE", "sr", "sr-SP", "sr-RS", "sr-Cyrl-RS", "sr-Latn-RS", "sd", "si", "sk", "sl", "so", "es", "es-AR", "es-BO", "es-CL", "es-CO", "es-CR", "es-DO", "es-EC", "es-SV", "es-GT", "es-HN", "es-MX", "es-NI", "es-PA", "es-PY", "es-PE", "es-PR", "es-ES", "es-UY", "es-VE", "sw", "sv", "sv-FI", "sv-SE", "tg", "ta", "tt", "te", "th", "bo", "ts", "tn", "tr", "tk", "uk", "und", "ur", "uz", "uz-UZ", "uz-Cyrl-UZ", "uz-Latn-UZ", "vi", "cy", "xh", "yi", "zu"];

// console.log('templateRouter: cecDir: ' + cecDir + ' projectDir: ' + projectDir);

var templatesDir,
	themesDir,
	compsDir;

var _setupSourceDir = function () {
	var srcfolder = serverUtils.getSourceFolder(projectDir);

	templatesDir = path.join(srcfolder, 'templates');
	themesDir = path.join(srcfolder, 'themes');
	compsDir = path.join(srcfolder, 'components');
};

//
// Get requests
//
router.get('/*', (req, res) => {
	let app = req.app,
		request = app.locals.request,
		contentType;

	_setupSourceDir();

	var filePathSuffix = req.path.replace(/\/templates\//, '').replace(/\/$/, ''),
		filePath = '',
		tempName = filePathSuffix.indexOf('/') > 0 ? filePathSuffix.substring(0, filePathSuffix.indexOf('/')) : filePathSuffix;

	// for content requests
	app.locals.currentTemplate = tempName;
	app.locals.currentContentItem.template = '';
	app.locals.currentContentItem.isRemote = false;
	app.locals.currentComponent = '';

	if (req.path === '/templates' || req.path === '/templates/') {
		res.redirect('/public/templates');
		res.end();
		return;
	}

	console.log('+++ Template: ' + req.url);
	filePathSuffix = decodeURIComponent(filePathSuffix);

	if (filePathSuffix.indexOf('/_compdelivery/') > 0) {
		// get the theme name 
		var compName = filePathSuffix.substring(filePathSuffix.indexOf('/_compdelivery/') + '/_compdelivery/'.length),
			compFile = '';
		compName = compName.substring(0, compName.indexOf('/'));
		compFile = filePathSuffix.substring(filePathSuffix.indexOf('/' + compName + '/') + compName.length + 2);
		filePath = path.resolve(compsDir + '/' + compName + '/' + compFile);
	} else if (filePathSuffix.indexOf('/_themesdelivery/') > 0) {
		// get the theme name 
		var themeName = filePathSuffix.substring(filePathSuffix.indexOf('/_themesdelivery/') + '/_themesdelivery/'.length),
			themeFile = '';
		themeName = themeName.substring(0, themeName.indexOf('/'));
		themeFile = filePathSuffix.substring(filePathSuffix.indexOf('/' + themeName + '/') + themeName.length + 2);
		filePath = path.resolve(themesDir + '/' + themeName + '/' + themeFile);
	} else if (filePathSuffix.indexOf('/_sitesclouddelivery/') > 0) {
		var fpath = filePathSuffix.substring(filePathSuffix.indexOf('/_sitesclouddelivery/') + '/_sitesclouddelivery/'.length),
			useServer = filePathSuffix.indexOf('/app/apps/') > 0;

		if (useServer) {
			console.log(' - redirect to: /' + fpath);
			res.redirect('/' + fpath);
			res.end();
			return;
		} else {
			filePath = path.resolve(defaultTestDir + '/sitescloud/' + fpath);
		}
	} else if (filePathSuffix.indexOf('require.js') > 0) {
		filePath = path.resolve(defaultLibsDir + '/requirejs/require.js');
	} else if (filePathSuffix.indexOf('renderer.js') > 0) {
		filePath = path.resolve(defaultTestDir + '/sitescloud/renderer/renderer.js');
	} else if (filePathSuffix.indexOf('caas_contenttypemap.json') >= 0) {
		// Get first from <temp>/assets/contenttemplate/summary.json 
		var summaryPath = path.join(templatesDir, tempName, 'assets', 'contenttemplate', 'summary.json');
		var mappings = [];
		if (fs.existsSync(summaryPath)) {
			var summaryJson = JSON.parse(fs.readFileSync(summaryPath));
			mappings = summaryJson.categoryLayoutMappings || summaryJson.contentTypeMappings || [];
		}
		if (mappings.length > 0) {
			console.log(' - content layout mapping from file ' + summaryPath);
			res.write(JSON.stringify(mappings));
			res.end();
			return;
		} else {
			filePath = path.resolve(templatesDir + '/' + filePathSuffix);
			if (existsAndIsFile(filePath)) {
				console.log(' - content layout mapping from file ' + filePath);
				res.sendFile(filePath);
			} else {
				console.log(' - no content layout mapping found');
				res.write(JSON.stringify(mappings));
				res.end();
				return;
			}
		}
		return;
	} else if (filePathSuffix.indexOf('/content/') >= 0 && filePathSuffix.indexOf('preview/') > 0) {
		// document preview
		var docname = filePathSuffix.substring(filePathSuffix.indexOf('/content/') + 9);
		if (docname.indexOf('/') > 0) {
			docname = docname.substring(0, docname.indexOf('/'));
		}
		if (docname.indexOf('-') > 0) {
			docname = docname.substring(0, docname.lastIndexOf('-'));
		}
		if (docname.indexOf('.') > 0) {
			docname = docname.substring(0, docname.indexOf('.'));
		}

		var page = filePathSuffix.substring(filePathSuffix.lastIndexOf('/') + 1);
		if (page.indexOf('.') > 0) {
			page = page.substring(0, page.indexOf('.'));
		}
		// console.log(' - docname: ' + docname + ' page: ' + page);
		var url = '',
			docs = app.locals.documents;
		for (var i = 0; i < docs.length; i++) {
			if (docs[i].name.indexOf(docname) === 0) {
				url = '/documents/web?IdcService=GET_RENDITION&AuxRenditionType=system&item=fFileGUID:' + docs[i].id + '&Rendition=' + page;
				break;
			}
		}
		if (!url && docs.length > 0) {
			url = '/documents/web?IdcService=GET_RENDITION&AuxRenditionType=system&item=fFileGUID:' + docs[0].id + '&Rendition=' + page;
		}
		if (url) {
			res.redirect(url);
			res.end();
		} else {
			console.log(' - docname: ' + docname + ' page: ' + page + ' - no rendition is available');
			res.write('');
			res.end();
		}
		return;

	} else {
		// if the file exists under '<template>/static', return it first

		// use standard string to determine user agent
		var ua = req.get('User-Agent') || '';
		var isMobile = /Mobi|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) && !/iPad/i.test(ua);

		var staticFilePath = isMobile ? '_mobilefiles' : '_files',
			urlBits = filePathSuffix.split('/'),
			templateName = urlBits.shift(),
			pageName = urlBits.pop(),
			pagePath = urlBits.join('/') + '/' + staticFilePath + '/' + pageName,
			detailPageName = urlBits.pop(),
			detailPagePath = urlBits.join('/') + '/' + staticFilePath + '/' + detailPageName,
			isSitePage = false;

		// normal case, find the site file
		filePath = path.resolve(templatesDir + '/' + templateName + '/static/' + pagePath);
		if (existsAndIsFile(filePath)) {
			isSitePage = true;
		}

		// see if it's a non-compiled detail page slug, then return the compiled detail page if it exists:   .../{detailpage}/{slug}
		if (!isSitePage && detailPageName && pageName) {
			if (!pageName.endsWith('.htm') && !pageName.endsWith('.html')) {
				// check for following format for detail page: 
				//   {detailPage}
				//   {detailPage}.htm
				//   {detailPage}.html
				[detailPagePath, detailPagePath + '.htm', detailPagePath + '.html'].forEach(function (testPagePath) {
					var testPath = path.resolve(templatesDir + '/' + templateName + '/static/' + testPagePath);
					if (!isSitePage && existsAndIsFile(testPath)) {
						filePath = testPath;
						isSitePage = true;
					}
				});
			}
		}

		if (isSitePage) {
			// set the mime-type - may be required if can't be derived from file extension (e.g.: page file doesn't have an extension)
			contentType = 'text/html';
		}

		if (!isSitePage) {
			// not a page, try to access it directly
			filePath = path.resolve(templatesDir + '/' + filePathSuffix);
			if (!existsAndIsFile(filePath)) {
				// can't find it, return the controller
				filePath = path.resolve(templatesDir + '/' + tempName + '/controller.html');
			}
		}
	}
	console.log(' - filePath=' + filePath);
	if (existsAndIsFile(filePath)) {
		if (filePath.indexOf('controller.html') > 0) {
			//
			// insert SCS 
			//
			var buf = fs.readFileSync(filePath).toString(),
				loc = buf.indexOf('<script'),
				modifiedFile = '';
			if (loc < 0) {
				// do not insert SCS
				res.sendFile(filePath);
			} else {
				modifiedFile = buf.substring(0, loc) +
					'<script type="text/javascript"> var SCS = { sitePrefix: "/templates/' + tempName + '/" }; </script>' +
					buf.substring(loc);
				res.write(modifiedFile);
				res.end();
			}
		} else if (filePath.indexOf('structure.json') > 0) {
			var vbcsconn = '';
			request('http://localhost:' + app.locals.port + '/getvbcsconnection', {
				isJson: true
			}, function (err, response, body) {
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					vbcsconn = data ? data.VBCSConnection : '';
				} else {
					console.log('status=' + response.statusCode + ' err=' + err);
				}

				//
				// combine siteinfo and structure the controller.js
				//
				var siteinfoPath = filePath.replace('structure.json', 'siteinfo.json'),
					newstructurestr = '';
				if (existsAndIsFile(siteinfoPath)) {
					var structurebuf = fs.readFileSync(filePath).toString(),
						structurejson = JSON.parse(structurebuf),
						siteinfobuf = fs.readFileSync(siteinfoPath).toString(),
						siteinfojson = JSON.parse(siteinfobuf);

					if (siteinfojson.properties && siteinfojson.properties.channelId) {
						siteinfojson.properties['channelAccessTokens'] = [{
							"name": "defaultToken",
							"value": "02a11b744a9828b6c08c832cc4efeaa4",
							"expirationDate": "01/01/2099"
						}];
					}

					if (siteinfojson.properties && structurejson.pages) {
						siteinfojson.properties.siteConnections = {
							VBCSConnection: vbcsconn
						};
						var newstructurejson = {
							"siteInfo": {
								"base": {
									"properties": siteinfojson.properties
								}
							},
							"base": {
								"pages": structurejson.pages
							}
						};

						newstructurestr = JSON.stringify(newstructurejson);
					}
				}

				if (newstructurestr) {
					// send the new structure
					res.write(newstructurestr);
					res.end();
				} else {
					// use the original structure.json
					res.sendFile(filePath);
				}

			});
		} else if (filePath.indexOf('pages') > 0 && filePath.indexOf('.json') > 0) {
			//
			// add base {} to the pages json
			//
			var pagesbuf = fs.readFileSync(filePath).toString(),
				pagesjson = JSON.parse(pagesbuf),
				componentInstances = pagesjson && pagesjson.componentInstances ? pagesjson.componentInstances : undefined,
				newpagesjson = {
					"base": pagesjson
				};

			// get all scs-document docs
			app.locals.documents = [];
			var docs = [];
			if (componentInstances) {
				Object.keys(componentInstances).forEach(function (key) {
					var compvalues = componentInstances[key];
					if (compvalues && compvalues.type === 'scs-document' && compvalues.data && compvalues.data.documentTitle) {
						docs[docs.length] = {
							name: compvalues.data.documentTitle,
							valid: false,
							id: '',
							renditionReady: false,
							finished: false
						};
					}
				});
			}
			if (docs.length > 0) {
				console.log(' -- scs-document docs: ' + JSON.stringify(docs));
				if (!app.locals.connectToServer) {
					console.log(' - No remote server to get document rendition');
					// send the new pages
					res.write(JSON.stringify(newpagesjson));
					res.end();
				} else {
					// prepare rendition
					for (var i = 0; i < docs.length; i++) {
						var doc = docs[i];
						serverUtils.getDocumentRendition(app, doc, function (newdoc) {
							doc = newdoc;
							console.log(' -- current status: ' + JSON.stringify(docs));

							// check if all are fone
							var done = 0;
							for (var j = 0; j < docs.length; j++) {
								done = (!docs[j].valid || docs[j].finished || docs[j].renditionReady) ? done + 1 : done;
							}
							if (done === docs.length) {
								app.locals.documents = docs;
								// send the new pages
								res.write(JSON.stringify(newpagesjson));
								res.end();
								return;
							}
						});
					}
				}
			} else {
				// send the new pages
				res.write(JSON.stringify(newpagesjson));
				res.end();
			}
		} else {
			if (contentType) {
				res.setHeader("Content-Type", contentType);
			}
			res.sendFile(filePath);
		}
	} else {
		console.log('404: ' + filePath);
		res.writeHead(404, {});
		res.end();
	}
});

//
// POST requests
//
router.post('/*', (req, res) => {
	console.log('path ' + req.path + ' not supported yet');
	res.writeHead(200, {});
	res.end();
});

var existsAndIsFile = function (filePath) {
	var ok = false;
	if (fs.existsSync(filePath)) {
		var statInfo = fs.statSync(filePath);
		ok = statInfo && statInfo.isFile();
	}
	return ok;
};

// Export the router
module.exports = router;