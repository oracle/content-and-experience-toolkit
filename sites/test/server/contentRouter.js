/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/**
 * Router handling /content requests
 */
var express = require('express'),
	serverUtils = require('./serverUtils.js'),
	router = express.Router(),
	fs = require('fs'),
	path = require('path'),
	url = require('url');

var console = require('./logger.js').console;

var cecDir = path.resolve(__dirname).replace(path.join('test', 'server'), '');
var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;
var defaultTemplatesDir;
var defaultContentDir;

var _setupSourceDir = function () {
	var srcfolder = serverUtils.getSourceFolder(projectDir);

	defaultTemplatesDir = path.join(srcfolder, 'templates');
	defaultContentDir = path.join(srcfolder, 'content');
};

var context = {};
var _returnSlugItems = function (res, slug) {
	var typesdir = path.join(context.contentdir, 'ContentItems'),
		slugItems = [];
	if (fs.existsSync(typesdir)) {
		// get the list of folders
		var getDirectories = function (source) {
			return fs.readdirSync(source).map(function (name) {
				return path.join(source, name);
			}).filter(function (source) {
				return fs.lstatSync(source).isDirectory();
			});
		};

		var typeFolders = getDirectories(typesdir);

		// now loop through all the folders checking each item for one with matching slug value
		typeFolders.forEach(function (folderName) {
			// ignore VariationSets & DigitialAssets "type" folders
			if (!folderName.match(/\/VariationSets$|\/DigitalAsset$/)) {
				var chkItems = fs.readdirSync(folderName);

				chkItems.forEach(function (chkItem) {
					try {
						var slugJson = JSON.parse(fs.readFileSync(path.join(folderName, chkItem)));

						var slugData = slugJson.fields || slugJson.data;

						if (slugJson.slug === slug) {
							// got a match, handle both data formats
							if (!slugJson.fields && slugJson.data) {
								slugJson.fields = slugJson.data;
							} else if (slugJson.fields && !slugJson.data) {
								slugJson.data = slugJson.fields;
							}

							// add to the output
							slugItems.push(slugJson);
						}
					} catch (e) { }
				});
			}
		});

		// return the result
		res.write(JSON.stringify({
			hasMore: false,
			limit: slugItems.length,
			count: 0,
			items: slugItems,
			totalResults: slugItems.length,
			offset: 0
		}));
		res.end();
		return;
	}
};

_getItemFilesPath = function (contentdir) {
	return new Promise(function (resolve, reject) {
		serverUtils.paths(path.join(contentdir, 'ContentItems'), function (err, paths) {
			if (err) {
				return resolve([]);
			} else {
				return resolve(paths.files);
			}
		});
	});
};

_findItemBySlug = function (files, slug) {
	var item;
	for (var i = 0; i < files.length; i++) {
		var slugJson;
		try {
			slugJson = JSON.parse(fs.readFileSync(files[i]));
		} catch (e) { }

		if (slugJson && slugJson.slug === slug) {
			item = slugJson;
			break;
		}
	}

	return item;
};

//
// Get requests
//
router.get('/*', (req, res) => {
	let location, app = req.app,
		requestUrl = req.originalUrl,
		cntPath = req.path,
		cntURL = url.parse(req.url),
		currentTemplate = (req.query && req.query.template) || app.locals.currentContentItem.template || app.locals.currentTemplate;

	_setupSourceDir();

	console.info('*** Content: ' + req.url);

	//
	// redirect the request to the server
	//
	var contentitem = app.locals.currentContentItem;

	console.info('   server channel token: ' + app.locals.channelToken +
		' app.locals.localTemplate: ' + app.locals.localTemplate +
		' current item: ' + (contentitem && contentitem.id ? (contentitem.id + ' ' + (contentitem.isRemote ? 'remote' : 'local')) : ''));
	if ((app.locals.useCAASServer && app.locals.currentTemplate) ||
		(contentitem && contentitem.id && contentitem.isRemote) ||
		app.locals.channelToken ||
		cntPath.indexOf('/content/management/api') === 0) {
		if (!app.locals.connectToServer) {
			console.error('No remote server for remote traffic ', requestUrl);
			res.writeHead(200, {});
			res.end();
			return;
		}
		location = app.locals.serverURL + requestUrl;

		// use management api 
		if (app.locals.channelToken) {
			if (location.indexOf('?channelToken=') > 0) {
				// remove channel token
				location = location.substring(0, location.indexOf('?channelToken='));
			} else if (location.indexOf('&channelToken=') > 0) {
				// remove channel token
				location = location.substring(0, location.indexOf('&channelToken='));
			}
			if (location.indexOf('?') >= 0) {
				location = location + '&channelToken=' + app.locals.channelToken;
			} else {
				location = location + '?channelToken=' + app.locals.channelToken;
			}
		} else {
			location = location.replace('/published/', '/management/');
		}
		console.info('Content Remote traffic:' + location);
		var options = {
			method: 'GET',
			url: location,
			encoding: null,
			headers: {
				Authorization: serverUtils.getRequestAuthorization(app.locals.server)
			}
		};
		// console.log(options);

		var request = require('./requestUtils.js').request;
		request.get(options, function (error, response, body) {
			if (error) {
				console.error('ERROR: request failed:');
				console.error(error);
				res.writeHead(response.statusCode, {});
				res.end();
				return;
			}

			if (response && response.statusCode === 200) {
				var contentType = response.headers.get('Content-Type');
				if (contentType) {
					// console.log(' - content type: ' + contentType);
					res.set('Content-Type', contentType);
				}
				var contentDeposition = response.headers.get('Content-Disposition');
				if (contentDeposition) {
					res.set('Content-Disposition', contentDeposition);
				}
				res.write(body);
				res.end();
				return;
			} else {
				var msg = data && (data.title || data.errorMessage) ? (data.title || data.errorMessage) : (response.statusMessage || response.statusCode);
				console.log('ERROR: request failed : ' + msg);
				res.writeHead(response.statusCode, {});
				res.end();
				return;
			}
		});
		return;
	}

	// console.log(' - currentContentItem.template=' + app.locals.currentContentItem.template + ' currentTemplate=' + app.locals.currentTemplate);
	console.info(' - currentTemplate=' + currentTemplate + ' app.locals.localTemplate=' + app.locals.localTemplate);
	var temp = currentTemplate || app.locals.localTemplate,
		comp = app.locals.currentComponent;
	if (!temp) {
		if (cntPath.indexOf('/content/published/api/v1/digital-assets/') === 0 ||
			cntPath.indexOf('/content/published/api/v1.1/assets/') === 0) {
			// find which template this digital asset belongs
			var prefix = cntPath.indexOf('/content/published/api/v1/digital-assets/') === 0 ? '/content/published/api/v1/digital-assets/' : '/content/published/api/v1.1/assets/',
				id = cntPath.substring(prefix.length);
			if (id.indexOf('/') > 0) {
				id = id.substring(0, id.indexOf('/'));
			}
			var temps = fs.readdirSync(defaultTemplatesDir);
			for (var i = 0; i < temps.length; i++) {
				var digitPath = path.join(defaultTemplatesDir, temps[i],
					'assets', 'contenttemplate', 'Content Template of ' + temps[i],
					'ContentItems');
				if (fs.existsSync(digitPath)) {
					var types = fs.readdirSync(digitPath);
					var isDigital = false;
					for (var j = 0; j < types.length; j++) {
						if (types[j] !== 'VariationSets' &&
							fs.existsSync(path.join(digitPath, types[j], id + '.json')) &&
							fs.existsSync(path.join(digitPath, types[j], 'files', id))) {
							isDigital = true;
							break;
						}
					}
				}

				if (isDigital) {
					temp = temps[i];
					console.info(' - the digital asset is from template ' + temp);
					break;
				}
			}
			if (!temp) {
				console.warn(' - the digital asset does not belong to any template');
			}
		} else if (comp) {
			var comptemps = serverUtils.getComponentTemplates(projectDir, comp);
			if (comptemps.length > 0) {
				temp = comptemps[0];
			}
			console.info(' - current component ' + comp + ' is from template ' + temp);
		}
		if (!temp) {
			console.error(' - !!! no template is specified, cannot render');
			res.writeHead(200, {});
			res.end();
			return;
		}
	}

	var tempdir,
		contentdir,
		filePath = '';
	if (fs.existsSync(path.join(defaultTemplatesDir, temp))) {
		tempdir = path.join(defaultTemplatesDir, temp);
		contentdir = path.join(tempdir, 'assets', 'contenttemplate', 'Content Template of ' + temp);
	} else {
		tempdir = path.join(defaultContentDir, temp);
		contentdir = path.join(tempdir, 'contentexport');
	}

	context.contentdir = contentdir;

	if (!fs.existsSync(contentdir)) {
		console.error(' - content directory ' + contentdir + ' does not exist');
		res.writeHead(200, {});
		res.end();
		return;
	}

	if (cntPath === '/content/published/api/v1/items/queries' ||
		cntPath === '/content/published/api/v1/items' ||
		cntPath === '/content/published/api/v1.1/items') {
		//
		// handle item query (used by content-list component)
		//
		var params = serverUtils.getURLParameters(cntURL.query),
			contentType = params.contentType,
			fields = params.fields,
			fieldName = '',
			fieldValue = '',
			orderBy = decodeURIComponent(params.orderBy || ''),
			limit = Number(params.limit || 10),
			offset = Number(params.offset || 0),
			q = decodeURIComponent(params.q || ''),
			defaultValue = decodeURIComponent(params.default || ''),
			contentItemType = params['field:type:equals'] || '',
			language = '',
			otherConditions = [],
			ids = [],
			contentItemTypes = [],
			slug;

		if (contentItemType) {
			contentItemType.push(contentItemType);
		}
		if (q) {
			var conds = q.indexOf(' and ') > 0 ? q.split(' and ') : [q];
			for (var i = 0; i < conds.length; i++) {
				var cond = conds[i];

				cond = serverUtils.replaceAll(cond, '(', '');
				cond = serverUtils.replaceAll(cond, ')', '');
				cond = serverUtils.replaceAll(cond, '{', '');
				cond = serverUtils.replaceAll(cond, '}', '');

				if (cond.indexOf(' or ') > 0) {
					var orConds = cond.split(' or ');
					for (var j = 0; j < orConds.length; j++) {
						var namevalue = orConds[j].split(' eq ');
						if (namevalue && namevalue.length === 2 && namevalue[0] && namevalue[1]) {
							if (namevalue[0] === 'id') {
								ids[ids.length] = serverUtils.replaceAll(namevalue[1], '"');
							} else if (namevalue[0] === 'type') {
								contentItemType = serverUtils.replaceAll(namevalue[1], '"');
								if (contentItemType && !contentItemTypes.includes(contentItemType)) {
									contentItemTypes.push(contentItemType);
								}
							} else {
								console.error(' - query not supported : ' + orConds[j]);
							}
						} else {
							console.error(' - invalid query parameter : ' + orConds[j]);
						}
					}

				} else {
					var namevalue = cond.split(' eq ');
					if (namevalue && namevalue.length === 2 && namevalue[0] && namevalue[1]) {
						if (namevalue[0] === 'id') {
							ids[ids.length] = serverUtils.replaceAll(namevalue[1], '"');
						} else if (namevalue[0] === 'type') {
							contentItemType = serverUtils.replaceAll(namevalue[1], '"');
							if (contentItemType && !contentItemTypes.includes(contentItemType)) {
								contentItemTypes.push(contentItemType);
							}
						} else if (namevalue[0] === 'language') {
							language = serverUtils.replaceAll(namevalue[1], '"');
						} else if (namevalue[0] === 'slug') {
							slug = serverUtils.replaceAll(namevalue[1], '"');
						} else {
							otherConditions[otherConditions.length] = {
								field: namevalue[0],
								value: serverUtils.replaceAll(namevalue[1], '"')
							};
						}
					} else {
						console.error(' - invalid query parameter : ' + cond);
					}
				}
			}
		}

		// remove wild card
		if (defaultValue) {
			defaultValue = defaultValue.split('*').join('');
		}

		// check if field: is specified
		Object.keys(params).forEach(function (key) {
			var value = params[key];
			if (key.indexOf('field:') === 0 && key !== 'field:type:equals') {
				fieldName = key.substring(6);
				fieldValue = value;
			}
		});
		console.info(' - fields=' + fields + ' field={' + fieldName + ':' + fieldValue + '}' +
			' default="' + defaultValue + '"' +
			' orderBy=' + orderBy + ' limit=' + limit +
			' offset=' + offset + ' contentItemTypes=' + contentItemTypes +
			' ids=' + JSON.stringify(ids) +
			' slug=' + slug +
			' language=' + language +
			' other conditions=' + JSON.stringify(otherConditions));

		if (ids && ids.length > 0) {
			var items = [];
			for (var i = 0; i < ids.length; i++) {
				// find the item type from metadata.json
				var itemType = getItemTypeFromMetadata(contentdir, ids[i]);
				// console.log(' - item id: ' + id + ' type: ' + itemType);
				if (itemType) {
					var itemfile = path.join(contentdir, 'ContentItems', itemType, ids[i] + '.json');
					if (fs.existsSync(itemfile)) {
						items[items.length] = JSON.parse(fs.readFileSync(itemfile));
					} else {
						console.error(' - item file ' + itemfiles + ' does not exist');
					}
				} else {
					console.error(' - item type not found for ' + ids[i]);
				}
			}
			for (var i = 0; i < items.length; i++) {
				if (!items[i].fields && items[i].data) {
					items[i].fields = items[i].data;
				}
			}

			var results = {};

			if (cntPath.indexOf('1.1') > 0) {
				results.items = items;
			} else {
				var items2 = {};
				for (var i = 0; i < items.length; i++) {
					var id = items[i].id,
						data = items[i];
					items2[id] = data;
				}
				results.items = items2;
			}
			// return the result
			console.info(' - returned items: ' + items.length);
			res.write(JSON.stringify(results));
			res.end();
			return;
		} else if (slug) {
			return _returnSlugItems(res, slug);
		} else if (contentItemTypes.length > 0) {
			var items = [];
			contentItemTypes.forEach(function (contentItemType) {
				var itemsdir = path.join(contentdir, 'ContentItems', contentItemType);
				if (fs.existsSync(itemsdir)) {
					var itemfiles = fs.readdirSync(itemsdir);
					for (var i = 0; i < itemfiles.length; i++) {
						var itemjson = JSON.parse(fs.readFileSync(path.join(itemsdir, itemfiles[i]))),
							qualified = true;

						var data = itemjson.fields || itemjson.data;

						if (!itemjson.fields && itemjson.data) {
							itemjson.fields = itemjson.data;
						} else if (itemjson.fields && !itemjson.data) {
							itemjson.data = itemjson.fields;
						}

						// check translation
						if (language && itemjson.language) {
							if (language !== itemjson.language) {
								continue;
							}
						}

						// check query conditions if there are
						for (var j = 0; j < otherConditions.length; j++) {
							var otherFieldName = otherConditions[j].field;
							if (otherFieldName.indexOf('fields.') === 0) {
								otherFieldName = otherFieldName.substring(7);
							}

							if (!data.hasOwnProperty(otherFieldName) ||
								!data[otherFieldName]) {
								// the item does not have the field or field value
								qualified = false;
								break;
							} else {
								var itemfieldvalue = data[otherFieldName];
								if (typeof itemfieldvalue === 'object') {
									var found = false;
									Object.keys(itemfieldvalue).forEach(function (key) {
										var value = itemfieldvalue[key];
										if (value === otherConditions[j].value) {
											found = true;
											console.info(' - match ' + otherConditions[j].field + '/' + key + ' with value ' + value);
										}
									});
									if (!found) {
										qualified = false;
										break;
									}
								} else {
									if (itemfieldvalue !== otherConditions[j].value) {
										qualified = false;
										break;
									}
								}
							}
						}

						if (qualified) {
							// search fields
							if (fieldName && fieldValue) {
								var itemfieldvalue = data[fieldName];
								if (itemfieldvalue && itemfieldvalue === fieldValue) {
									if (!defaultValue || itemfieldvalue.toLowerCase().indexOf(defaultValue.toLowerCase()) >= 0) {
										items[items.length] = itemjson;
									}
								}
							} else {
								if (!defaultValue || JSON.stringify(itemjson).toLowerCase().indexOf(defaultValue.toLowerCase()) >= 0) {
									items[items.length] = itemjson;
								}
							}
						}
					}
				} else {
					console.error(' - content item directory ' + itemsdir + ' does not exist');
				}
			});
			// sort 
			if (orderBy === 'name:asc' || orderBy === 'name:des') {
				var byName = items.slice(0);
				byName.sort(function (a, b) {
					var x = a.name;
					var y = b.name;
					return orderBy === 'name:des' ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
				});
				items = byName;
			} else if (orderBy === 'updateddate:des' || orderBy === 'updateddate:asc') {
				var byDate = items.slice(0);
				byDate.sort(function (a, b) {
					var x = new Date(a.updatedDate ? a.updatedDate.value : a.updateddate.value);
					var y = new Date(b.updatedDate ? b.updatedDate.value : b.updateddate.value);
					return orderBy === 'updateddate:des' ? y - x : x - y;
				});
				items = byDate;
			} else if (orderBy.startsWith('fields.')) {
				var orderArr = orderBy.substring(7).split(':');
				var customOrderByField = orderArr[0];
				var customOrderByOrder = orderArr[1];

				if (items.length > 0) {
					if (items[0].fields.hasOwnProperty(customOrderByField)) {
						var fieldType = typeof items[0].fields[customOrderByField];
						console.info(' - custom orderBy: field: ' + customOrderByField + '(' + fieldType + ') order: ' + customOrderByOrder);
						if (fieldType === 'object') {
							var byDate = items.slice(0);
							byDate.sort(function (a, b) {
								var x = new Date(a.fields[customOrderByField] ? a.fields[customOrderByField].value : a.fields[customOrderByField].value);
								var y = new Date(b.fields[customOrderByField] ? b.fields[customOrderByField].value : b.fields[customOrderByField].value);
								return customOrderByOrder === 'des' ? y - x : x - y;
							});
							items = byDate;
						} else {
							var byNumber = items.slice(0);
							byNumber.sort(function (a, b) {
								var x = a.fields[customOrderByField];
								var y = b.fields[customOrderByField];
								return customOrderByOrder === 'des' ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
							});
							items = byNumber;
						}
					} else {
						console.error(' - item does not have field ' + customOrderByField);
					}
				}

			} else {
				console.error(' - invalid orderBy ' + orderBy);
			}


			// check limit and offset
			var total = items.length - offset,
				count = total < limit ? total : limit,
				items2 = offset < items.length ? items.slice(offset, offset + count) : [],
				hasMore = offset + count < items.length;
			if (count < items.length) {
				console.info(' - pagination: items ' + offset + ' - ' + (offset + count - 1) + ' has more: ' + hasMore);
			} else {
				console.info(' - returned items: ' + items.length);
			}
			var results = {
				hasMore: hasMore,
				limit: items.length,
				count: count,
				items: items2,
				totalResults: items.length,
				offset: offset
			};
			// return the result
			res.write(JSON.stringify(results));
			res.end();
			return;

		} else {
			console.info(' - no content item is specified, no item is returned')
		}
		res.writeHead(200, {});
		res.end();

	} else if (cntPath.indexOf('/content/published/api/v1/items/') === 0 ||
		cntPath.indexOf('/content/published/api/v1.1/items/') === 0) {
		//
		// handle item 
		// 
		var id = cntPath.substring(cntPath.indexOf('/items/') + 7),
			ids = [],
			isBulk = false;

		if (id.startsWith('.by.slug/')) {
			id = id.replace('.by.slug/', '');
		}
		if (id.indexOf('/') > 0) {
			id = id.substring(0, id.indexOf('/'));
		}
		ids.push(id);

		if (id === 'bulk') {
			// get id from url parameters
			var params = serverUtils.getURLParameters(cntURL.query);
			ids = params.ids.split(',');
			isBulk = true;
		}

		var language = '';
		var langQuery = '/variations/language/';
		if (cntPath.indexOf(langQuery) > 0) {
			language = cntPath.substring(cntPath.indexOf(langQuery) + langQuery.length);
		}
		// console.log('language=' + language);

		_getItemFilesPath(contentdir)
			.then(function (result) {
				var itemFiles = result;

				var items = [];
				for (var i = 0; i < ids.length; i++) {
					// find the item type from metadata.json
					var itemType = getItemTypeFromMetadata(contentdir, ids[i]);
					// console.log(' - item id: ' + id + ' type: ' + itemType);
					if (itemType) {
						var itemfile = path.join(contentdir, 'ContentItems', itemType, ids[i] + '.json');
						if (fs.existsSync(itemfile)) {
							var itemjson = JSON.parse(fs.readFileSync(itemfile));
							// console.log('item: ' + itemjson.name + ' ' + itemjson.language);
							if (!language || language === itemjson.language || itemjson.translatable === false) {
								if (language === itemjson.language) {
									console.info(' - found item language matched');
								} else if (itemjson.translatable === false) {
									console.info(' - non-translatable item');
								}
								items.push(itemjson);
							} else if (language) {
								// check the item's variation file
								var found = false;
								var variationfile = path.join(contentdir, 'ContentItems', 'VariationSets', ids[i] + '.json');
								var itemHasVariationFile = false;
								if (fs.existsSync(variationfile)) {
									itemHasVariationFile = true;
									var variationjson = JSON.parse(fs.readFileSync(variationfile));
									if (variationjson && variationjson.length > 0) {
										for (var k = 0; k < variationjson.length; k++) {
											for (var j = 0; j < variationjson[k].items.length; j++) {
												var vitem = variationjson[k].items[j];
												if (vitem.id !== itemjson.id && vitem.varType === 'language' && vitem.value === language) {
													console.info(' - found item in ' + language + '(direct variation set) id: ' + vitem.id);
													var variationitemfile = path.join(contentdir, 'ContentItems', itemType, vitem.id + '.json');
													if (fs.existsSync(variationitemfile)) {
														items.push(JSON.parse(fs.readFileSync(variationitemfile)));
														found = true;
														break;
													}
												}
											} // go through the list in variation set file
										}
									}
								} // item has variation

								// check the variation file the item is in
								if (!found && !itemHasVariationFile) {
									var files = fs.readdirSync(path.join(contentdir, 'ContentItems', 'VariationSets'));
									var vitemId = '';
									for (var i = 0; i < files.length; i++) {
										var variationfile = path.join(contentdir, 'ContentItems', 'VariationSets', files[i]);
										var variationjson = JSON.parse(fs.readFileSync(variationfile));
										var itemInVariation = false;
										for (var k = 0; k < variationjson.length; k++) {
											for (var j = 0; j < variationjson[k].items.length; j++) {
												var vitem = variationjson[k].items[j];
												if (vitem.id === itemjson.id) {
													itemInVariation = true;
												}
												if (vitem.id !== itemjson.id && vitem.varType === 'language' && vitem.value === language) {
													vitemId = vitem.id;
												}
											}
										}
										if (itemInVariation && vitemId) {
											break;
										}
									}
									if (vitemId) {
										console.info(' - found item in ' + language + '(cross variation set) id: ' + vitemId);
										var variationitemfile = path.join(contentdir, 'ContentItems', itemType, vitemId + '.json');
										if (fs.existsSync(variationitemfile)) {
											items.push(JSON.parse(fs.readFileSync(variationitemfile)));
										}
									}
								}
							}
						} else {
							console.error(' - item file ' + itemfile + ' does not exist');
						}
					} else {
						console.info(' - item type not found for ' + ids[i]);
						// could be slug
						console.info(' - query item with slug ' + ids[i]);
						var item = _findItemBySlug(itemFiles, ids[i]);
						if (item) {
							items.push(item);
						}
					}
				}
				// console.log(items);
				if (items.length > 0) {
					var results = {};
					if (isBulk) {
						var items2 = {};
						for (var i = 0; i < items.length; i++) {
							var id = items[i].id,
								data = items[i];
							if (!items[i].fields && items[i].data) {
								items[i].fields = items[i].data;
							} else if (items[i].fields && !items[i].data) {
								items[i].data = items[i].fields;
							}
							items2[id] = data;
						}
						results = {
							items: items2
						};
					} else {
						results = items[0];
						if (!results.fields && results.data) {
							results.fields = results.data;
						} else if (results.fields && !results.data) {
							results.data = results.fields;
						}
					}
					console.info(' - returned item(s): ' + items.length);
					// return the result
					res.write(JSON.stringify(results));
					res.end();
					return;
				} else {
					console.info(' - no item found');
					res.writeHead(200, {});
					res.end();
				}
			});

	} else if (cntPath.indexOf('/content/published/api/v1/digital-assets/') === 0 ||
		cntPath.indexOf('/content/published/api/v1.1/assets/') === 0) {
		// 
		// handle digital assets
		//
		var prefix = cntPath.indexOf('/content/published/api/v1/digital-assets/') === 0 ? '/content/published/api/v1/digital-assets/' : '/content/published/api/v1.1/assets/',
			id;

		id = cntPath.substring(prefix.length);
		if (id.indexOf('/') > 0) {
			id = id.substring(0, id.indexOf('/'));
		}

		var assetsdir;
		var assetjsonfile;
		var types = fs.readdirSync(path.join(contentdir, 'ContentItems'));
		for (var i = 0; i < types.length; i++) {
			if (types[i] !== 'VariationSets' && fs.existsSync(path.join(contentdir, 'ContentItems', types[i], id + '.json'))) {
				assetsdir = path.join(contentdir, 'ContentItems', types[i]);
				assetjsonfile = path.join(assetsdir, id + '.json');
				break;
			}
		}

		if (assetjsonfile && fs.existsSync(assetjsonfile)) {
			var assetjson = JSON.parse(fs.readFileSync(assetjsonfile)),
				assetfile = assetjson && assetjson.name ? path.join(assetsdir, 'files', id, assetjson.name) : '';
			if (fs.existsSync(assetfile)) {
				console.info(' - asset mime type: ' + (assetjson.fields && assetjson.fields.mimeType) + ' file: ' + assetfile);
				if (assetjson.fields && assetjson.fields.mimeType) {
					res.set('Content-Type', assetjson.fields.mimeType);
				}
				res.write(fs.readFileSync(assetfile));
				res.end();
				return;
			} else {
				console.error(' - digit asset ' + assetfile + ' does not exist');
			}
		} else {
			console.error(' - digit asset ' + assetjsonfile + ' does not exist');
		}
		res.writeHead(200, {});
		res.end();
	} else if (cntPath === '/content/management/api/v1.1/types') {
		var params = serverUtils.getURLParameters(cntURL.query),
			limitstr = params.limit || '',
			alltypes = serverUtils.getContentTypes(),
			typenames = [],
			types = [];
		for (var i = 0; i < alltypes.length; i++) {
			var type = alltypes[i].type;
			if (typenames.length === 0 || typenames.indexOf(type.name) < 0) {
				types[types.length] = type;
				typenames[typenames.length] = type.name;
			}
		}
		var limit = limitstr ? Number(limitstr) : 999999999999,
			offset = 0,
			total = types.length,
			count = total < limit ? total : limit,
			types2 = offset < types.length ? types.slice(offset, offset + count) : [],
			hasMore = offset + count < types.length;
		var results = {
			hasMore: hasMore,
			limit: types.length,
			count: count,
			items: types2,
			offset: offset
		};
		// return the result
		res.write(JSON.stringify(results));
		res.end();
		return;

	} else {
		console.log(' - !!! not supported yet');
		res.writeHead(200, {});
		res.end();
	}

});

//
// POST requests
//
router.post('/*', (req, res) => {
	// console.log('path ' + req.path + ' not supported yet');
	// res.writeHead(200, {});
	// res.end();

	let app = req.app,
		request = app.locals.request,
		requestUrl = req.originalUrl;

	if (!app.locals.connectToServer) {
		console.error('No remote server for remote traffic ', requestUrl);
		res.end();
		return;
	}

	// all POST requests are proxied to the remote server
	console.info('Remote traffic: POST ' + requestUrl);

	var server = app.locals.server;
	var url = server.url + requestUrl;
	var postData = {
		method: 'POST',
		url: url,
		headers: {
			'Content-Type': 'application/json',
			'X-REQUESTED-WITH': 'XMLHttpRequest',
			Authorization: serverUtils.getRequestAuthorization(server)
		},
		body: req.body,
		json: true
	};
	// console.info(postData);

	request.post(postData, function (error, response, body) {
		if (error) {
			console.error('ERROR: request failed ' + url);
			console.error(error);
			res.writeHead(500, {});
			res.end();
			return;
		} else {

			var data;
			try {
				data = JSON.parse(body);
			} catch (err) {
				data = body;
			}
			if (response && response.statusCode >= 200 && response.statusCode < 300) {
				res.write(JSON.stringify(data));
				res.end();
			} else {
				console.error('ERROR: request failed ' + url + ' : ' + (response.statusMessage || response.statusCode));
				res.writeHead(response.statusCode, {});
				res.end();
			}
		}
	});

});

var existsAndIsFile = function (filePath) {
	var ok = false;
	if (fs.existsSync(filePath)) {
		var statInfo = fs.statSync(filePath);
		ok = statInfo && statInfo.isFile();
	}
	return ok;
};


var getItemTypeFromMetadata = function (contentdir, id) {
	var itemType = '',
		metadatafile = path.join(contentdir, 'metadata.json');
	if (fs.existsSync(metadatafile)) {
		var metadatajson = JSON.parse(fs.readFileSync(metadatafile)),
			groups = metadatajson.groups;
		for (var i = 0; i < groups; i++) {
			var group = metadatajson['group' + i];
			for (var j = 0; j < group.length; j++) {
				var values = group[j].split(':');
				if (values.length > 1) {
					if (values[1] === id) {
						itemType = values[0];
						break;
					}
				}
			}
		}
	} else {
		console.error(' - content metadata ' + metadatafile + ' does not exist');
	}
	// console.log(' item type: ' + itemType);
	return itemType;
};

// Export the router
module.exports = router;