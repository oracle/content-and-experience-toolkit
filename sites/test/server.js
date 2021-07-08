/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, process, __dirname */
/* jshint esversion: 6 */

/**
 * Test SCS site.
 */

var express = require('express'),
	app = express(),
	os = require('os'),
	fs = require('fs'),
	path = require('path'),
	url = require('url'),
	request = require('request'),
	puppeteer = require('puppeteer'),
	documentsRouter = require('./server/documentsRouter.js'),
	contentRouter = require('./server/contentRouter.js'),
	appsRouter = require('./server/appsRouter.js'),
	templatesRouter = require('./server/templatesRouter.js'),
	componentsRouter = require('./server/componentsRouter.js'),
	connectorRouter = require('./server/connectorRouter.js'),
	sitesRouter = require('./server/sitesRouter.js'),
	systemRouter = require('./server/systemRouter.js'),
	serverUtils = require('./server/serverUtils.js');

var cecDir = path.join(__dirname, ".."),
	libsDir = path.join(cecDir, 'src', 'libs'),
	testDir = path.join(cecDir, 'test');

var projectDir = process.env.CEC_TOOLKIT_PROJECTDIR || cecDir;
var srcfolder = serverUtils.getSourceFolder(projectDir);
var componentsDir = path.join(srcfolder, 'components'),
	themesDir = path.join(srcfolder, 'themes');

var port = process.env.CEC_TOOLKIT_PORT || 8085;
var serverName = process.env.CEC_TOOLKIT_SERVER || '';
if (serverName && !fs.existsSync(path.join(srcfolder, 'servers', serverName, 'server.json'))) {
	console.log('ERROR: server ' + serverName + ' does not exist');
	process.exit(1);
}
var useCAASServer = serverName ? true : false;
var server = serverUtils.verifyServer(serverName, projectDir);
if (serverName && (!server || !server.valid)) {
	process.exit(1);
}
// console.log('cecDir: ' + cecDir + ' projectDir: ' + projectDir + ' port: ' + port + ' server: ' + serverName);

// console.log('Configured server=' + JSON.stringify(server));
console.log('Use config file: ' + server.fileloc);

// Store these in the app locals to be shared by routers
app.locals.projectDir = projectDir;
app.locals.port = port;
app.locals.server = server;
app.locals.serverURL = app.locals.server.url;
app.locals.useCAASServer = useCAASServer;
app.locals.connectToServer = false;
app.locals.currentTemplate = '';
app.locals.localTemplate = '';
app.locals.channelToken = '';
app.locals.currentComponent = '';
app.locals.currentContentItem = {
	template: '',
	type: '',
	id: '',
	name: '',
	isRemote: false
};
app.locals.documents = [];
app.locals.currentContentTypes = [];

// enable cookies
request = request.defaults({
	jar: true,
	proxy: null
});
app.locals.request = request;

// remove _cache_ from url
app.use(function (req, res, next) {
	var origPath = req.path;
	if (origPath.indexOf('/_cache_') > 0) {
		var cacheStr = origPath.substring(origPath.indexOf('/_cache_') + 1);
		if (cacheStr.indexOf('/') > 0) {
			cacheStr = cacheStr.substring(0, cacheStr.indexOf('/'));
			if (cacheStr) {
				req.url = req.url.replace('/' + cacheStr, '');
				console.log(origPath + ' ===> ' + req.path);
			}
		}
	}
	return next();
});

// login if the session is timeout
app.use(function (req, res, next) {
	var needLogin = false,
		reqpath = req.path,
		remote = reqpath.indexOf('/documents') === 0 ||
		reqpath.indexOf('/osn') === 0 ||
		reqpath.indexOf('/content') === 0 ||
		reqpath.indexOf('/_sitescloud/renderer/app/apps/js/ojL10n.js') === 0 ||
		reqpath.indexOf('/_sitescloud/renderer/app/dist') === 0 ||
		reqpath.indexOf('/_sitescloud/renderer/libs') === 0 ||
		reqpath.indexOf('/renderer/app/sdk/images') === 0 ||
		reqpath.indexOf('/renderer/app/sdk/css/app-settings.css') === 0 ||
		reqpath.indexOf('/renderer/app/apps') === 0 ||
		reqpath.indexOf('/renderer/app/js') === 0 ||
		reqpath.indexOf('/getvbcsconnection') === 0 ||
		reqpath.indexOf('/getcontentlayoutmappings') === 0;

	if (app.locals.serverURL && remote) {
		// check if the session still authenticated
		// console.log('*** check if authenticated... path=' + reqpath);
		request('http://localhost:' + port + '/isAuthenticated', {
			isJson: true
		}, function (err, response, body) {
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body),
					authenticated = data && data.isAuthenticated;
				if (!authenticated) {
					authenticateUser(
						server.env, {
							username: server.username,
							password: server.password,
							onsuccess: function () {
								// make sure user session is established
								console.log('Establishing user session');
								var total = 0;
								var inter = setInterval(function () {
									// console.log(' - getting login user: ' + total);
									var url = 'http://localhost:' + port + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';
									request.get(url, function (err, response, body) {
										var data = JSON.parse(body);
										var dUser = data && data.LocalData && data.LocalData.dUser;
										var idcToken = data && data.LocalData && data.LocalData.idcToken;
										if (dUser && dUser !== 'anonymous' && idcToken) {
											// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
											clearInterval(inter);
											app.locals.connectToServer = true;
											console.log('!!! the server is reconnected');
											next();
										}
										total += 1;
										if (total >= 10) {
											clearInterval(inter);
											console.log('Disconnected from the server');
											next();
										}
									});
								}, 6000);
							},
							onfailure: function (error, resp) {
								console.log('Login to server failed - unexpected response from server');
								next();
							}
						});
				} else {
					// session already authenticated
					// console.log(' - the session is already authenticated');
					next();
				}
			} else {
				console.log('status=' + response.statusCode + ' err=' + err);
				// continure without login
				next();
			}
		});
	} else {
		// no need server
		next();
	}
});

app.use('/', express.static(testDir));
app.use('/libs', express.static(libsDir));
app.use('*require.js', express.static(libsDir + '/requirejs/require.js'));
app.use('/_sitescloud/renderer/app/apps/js/ojL10n.js', appsRouter);
app.use('/_sitescloud/renderer/app/dist', appsRouter);
app.use('/_sitescloud/renderer/libs', appsRouter);
app.use('/_sitescloud', express.static(testDir + '/sitescloud'));
app.use('/_sitesclouddelivery', express.static(testDir + '/sitescloud'));
// At local, use the same SiteSDK
app.use('*sites.min.js', express.static(testDir + '/sitescloud/renderer/app/sdk/js/sites.min.js'));
app.use('*sites.mock.min.js', express.static(testDir + '/sitescloud/renderer/app/sdk/js/sites.mock.min.js'));
app.use('*content.min.js', express.static(testDir + '/sitescloud/renderer/app/sdk/js/content.min.js'));
app.use('*field-editor-sdk-1.0.js', express.static(testDir + '/sitescloud/renderer/app/sdk/js/field-editor-sdk-1.0.js'));
app.use('*content-form-sdk-1.0.js', express.static(testDir + '/sitescloud/renderer/app/sdk/js/content-form-sdk-1.0.js'));
app.use('*mustache.min.js', express.static(testDir + '/sitescloud/renderer/mustache.min.js'));
app.use('/src', express.static(path.join(projectDir, 'src')));
app.use('/main/components', express.static(componentsDir));
app.use('/themes', express.static(themesDir));
app.use('/main/themes', express.static(themesDir));
app.use('/node_modules', express.static(path.join(projectDir, 'node_modules')));

// all /templates request are handled by templatesRouter
app.get('/templates*', templatesRouter);
app.post('/templates*', templatesRouter);

// all /components request are handled by componentsRouter
app.get('/components*', componentsRouter);
app.post('/components*', componentsRouter);
app.get('/_compdelivery*', componentsRouter);
app.post('/_compdelivery*', componentsRouter);
app.get('/_themes/_components*', componentsRouter);

// All /documents and /osn requests are handled by documentsRouter
app.use('/documents', documentsRouter);
app.use('/osn', documentsRouter);

// All /content requests are handled by contentRouter
app.get('/content*', contentRouter);
app.post('/content*', contentRouter);

// all /renderer/app/apps request are handled by appsRouter
app.use('/renderer/app/sdk/images', appsRouter);
app.use('/renderer/app/sdk/css/app-settings.css', appsRouter);
app.use('/renderer/app/sdk', express.static(testDir + '/sitescloud/renderer/app/sdk'));
app.use('/renderer/app/apps', appsRouter);
app.use('/renderer/app/js', appsRouter);

// all /connector request are handled by connectorRouter
app.get('/connector*', connectorRouter);
app.post('/connector*', connectorRouter);
app.delete('/connector*', connectorRouter);

// all /sites request 
app.use('/sites*', sitesRouter);

// all /system request 
app.use('/system*', systemRouter);

app.get('/getsrcfolder', function (req, res) {
	"use strict";
	var srcfolder = 'src';

	var libsfolder = fs.existsSync(path.join(projectDir, 'libs')) ? 'libs' : 'src/libs';
	var result = {
		srcfolder: srcfolder,
		libsfolder: libsfolder
	};
	res.write(JSON.stringify(result));
	res.end();
});
app.get('/getcomponents', function (req, res) {
	"use strict";
	res.write(JSON.stringify(serverUtils.getComponents(projectDir)));
	res.end();
});
app.get('/getcomponenttemplates*', function (req, res) {
	"use strict";
	var compname = req.path.replace('/getcomponenttemplates', '');

	if (!compname || compname.indexOf('/') < 0) {
		// no component name specified
		console.log('getcomponenttemplates: invalid component name: ' + compname);
		res.writeHead(404, {});
		res.end();
		return;
	}
	compname = compname.substring(1);
	res.write(JSON.stringify(serverUtils.getComponentTemplates(projectDir, compname)));
	res.end();
});
app.get('/gettemplates', function (req, res) {
	"use strict";

	res.write(JSON.stringify(serverUtils.getTemplates(projectDir)));
	res.end();
});
app.get('/gettemplatecomponents*', function (req, res) {
	"use strict";
	var tempname = req.path.replace('/gettemplatecomponents', '');

	if (!tempname || tempname.indexOf('/') < 0) {
		// no template name specified
		console.log('gettemplatecomponents: invalid template name: ' + tempname);
		res.writeHead(404, {});
		res.end();
		return;
	}
	tempname = tempname.substring(1);
	res.write(JSON.stringify(serverUtils.getTemplateComponents(projectDir, tempname)));
	res.end();
});
app.get('/gettemplateicon*', function (req, res) {
	"use strict";
	var tempname = req.path.replace('/gettemplateicon', '');

	if (!tempname || tempname.indexOf('/') < 0) {
		// no template name specified
		console.log('gettemplateicon: invalid template name: ' + tempname);
		res.writeHead(200, {});
		res.end();
		return;
	}
	tempname = tempname.substring(1);
	res.write(serverUtils.getTemplateIcon(projectDir, tempname));
	res.end();
});

app.get('/getcontentlayoutitems*', function (req, res) {
	"use strict";
	var layoutname = req.path.replace('/getcontentlayoutitems', '');

	if (!layoutname || layoutname.indexOf('/') < 0) {
		// no content layout name specified
		console.log('getcontentlayoutitems: invalid layout name: ' + layoutname);
		res.writeHead(404, {});
		res.end();
		return;
	}
	layoutname = layoutname.substring(1);
	res.write(JSON.stringify(serverUtils.getContentLayoutItems(projectDir, layoutname)));
	res.end();
});

app.get('/getcontentformitems*', function (req, res) {
	"use strict";
	var formname = req.path.replace('/getcontentformitems', '');

	if (!formname || formname.indexOf('/') < 0) {
		// no content form name specified
		console.log('getcontentformitems: invalid name: ' + formname);
		res.writeHead(404, {});
		res.end();
		return;
	}
	formname = formname.substring(1);
	res.write(JSON.stringify(serverUtils.getContentFormItems(projectDir, formname)));
	res.end();
});

app.get('/getcontenttypes*', function (req, res) {
	"use strict";

	var typeNames = [];
	// get from server if server configured

	if (server && server.valid) {
		serverUtils.getContentTypesFromServer(server).then(function (result) {
			var types = result && result.items || [];
			types.forEach(function (type) {
				if (!typeNames.includes(type.name)) {
					typeNames.push(type.name);
				}
			});
			res.write(JSON.stringify(typeNames));
			res.end();
		});

	} else {
		var localTypes = serverUtils.getContentTypes(projectDir);

		localTypes.forEach(function (data) {
			if (!typeNames.includes(data.type.name)) {
				typeNames.push(data.type.name);
			}
		});
		res.write(JSON.stringify(typeNames));
		res.end();
	}

});

app.post('/setcontentlayoutitem*', function (req, res) {
	"use strict";

	var itemurl = req.url.replace('/setcontentlayoutitem', ''),
		params = serverUtils.getURLParameters(url.parse(itemurl).query);

	if (params) {
		var template = params.template,
			itemtype = params.type,
			itemid = params.id,
			isRemote = params.isRemote,
			alltypes = params.types;

		app.locals.currentContentTypes = alltypes ? alltypes.split(',') : [];

		if ((template || isRemote) && itemtype && itemid) {
			app.locals.currentTemplate = '';
			app.locals.localTemplate = '';
			app.locals.channelToken = '';
			app.locals.currentContentItem.template = template;
			app.locals.currentContentItem.type = itemtype;
			app.locals.currentContentItem.id = itemid;
			app.locals.currentContentItem.isRemote = (isRemote === 'true');
			console.log('%%% setcontentlayoutitem: ' + JSON.stringify(app.locals.currentContentItem) +
				' currentContentTypes: ' + app.locals.currentContentTypes);
		}
	}

	res.end();
	return;
});

app.post('/clearcontentlayoutitem', function (req, res) {
	"use strict";

	app.locals.currentContentTypes = [];
	app.locals.currentContentItem = {
		template: '',
		type: '',
		id: '',
		name: '',
		isRemote: false
	};

	res.end();
	return;
});

app.get('/gettranslationconnections', function (req, res) {
	"use strict";
	res.write(JSON.stringify(serverUtils.getTranslationConnections(projectDir)));
	res.end();
});

app.post('/updatefieldeditor', function (req, res) {
	"use strict";

	var updateurl = req.url.replace('/updatefieldeditor', ''),
		params = serverUtils.getURLParameters(url.parse(updateurl).query);

	if (params) {
		var compName = params['name'],
			multi = params['multi'],
			types = params['types'];

		console.log('field editor: ' + compName + ' multi: ' + multi + ' types: ' + types);
		var appInfo = serverUtils.getComponentAppInfo(projectDir, compName);
		if (appInfo) {
			appInfo.handlesMultiple = multi && multi === 'true' ? true : false;
			appInfo.supportedDatatypes = types ? types.split(',') : [];
			var filePath = path.join(componentsDir, compName, 'appinfo.json');
			fs.writeFileSync(filePath, JSON.stringify(appInfo));
			console.log(' - saved file ' + filePath);
		}
	}

	res.end();
	return;
});

app.post('/updatecontentform', function (req, res) {
	"use strict";

	var updateurl = req.url.replace('/updatecontentform', ''),
		params = serverUtils.getURLParameters(url.parse(updateurl).query);
	var compName = params && params.name;
	var drawerSize = params && params.drawerSize;
	if (compName && drawerSize) {
		console.log('content form: ' + compName + ' drawer size: ' + drawerSize);
		var appInfo = serverUtils.getComponentAppInfo(projectDir, compName);
		if (appInfo) {
			appInfo.drawerSize = drawerSize.toLowerCase();
			var filePath = path.join(componentsDir, compName, 'appinfo.json');
			fs.writeFileSync(filePath, JSON.stringify(appInfo));
			console.log(' - saved file ' + filePath);
		}
	}

	res.end();
	return;
});


app.get('/isAuthenticated', function (req, res) {
	if (!app.locals.serverURL) {
		res.write(JSON.stringify({
			isAuthenticated: false
		}));
		res.end();
		return;
	}
	var location = app.locals.serverURL + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';
	var options = {
		isJson: true,
		timeout: 600000
	};

	if (app.locals.server.env !== 'dev_ec') {
		options['auth'] = {
			bearer: app.locals.server.oauthtoken
		};
	}

	request(location, options, function (err, response, body) {
		var authenticated = false,
			user = '';
		if (response && response.statusCode === 200) {
			var data = JSON.parse(body);
			user = data && data.LocalData && data.LocalData.dUser && data.LocalData.dUser;
			authenticated = user && user !== 'anonymous';
		} else {
			console.log('status=' + JSON.stringify(response) + ' err=' + err);
		}
		// console.log(' - user: ' + user + ' authenticated: ' + authenticated);	
		var result = {
			isAuthenticated: authenticated
		};
		res.write(JSON.stringify(result));
		res.end();
	});
});

app.get('/getvbcsconnection', function (req, res) {
	if (!app.locals.serverURL) {
		res.write(JSON.stringify({
			VBCSConnection: ''
		}));
		res.end();
		return;
	}
	var location = app.locals.serverURL + '/documents/web?IdcService=AF_GET_APP_INFO_SIMPLE&dAppName=VBCS';
	console.log('Remote traffic:', location);
	var options = {
		isJson: true,
		timeout: 1000
	};
	if (app.locals.server.env !== 'dev_ec') {
		options['auth'] = {
			bearer: app.locals.server.oauthtoken
		};
	}
	request(location, options, function (err, response, body) {
		var vbcsconn = '';
		if (response && response.statusCode === 200) {
			var data = JSON.parse(body);
			if (data && data.ResultSets && data.ResultSets.AFApplicationInfo) {
				var appInfo = data.ResultSets.AFApplicationInfo;
				for (i = 0; i < appInfo.fields.length; i++) {
					if (appInfo.fields[i].name === 'dAppEndPoint') {
						vbcsconn = appInfo.rows[appInfo.currentRow][i];
						break;
					}
				}
			}
		} else {
			console.log('status=' + JSON.stringify(response) + ' err=' + err);
		}
		console.log(' - vbcs connection: ' + vbcsconn);
		var result = {
			VBCSConnection: vbcsconn
		};
		res.write(JSON.stringify(result));
		res.end();
	});
});
	

app.get('/public/components', function (req, res) {
	"use strict";
	app.locals.currentTemplate = '';
	app.locals.localTemplate = '';
	app.locals.channelToken = '';
	app.locals.currentContentItem = {
		template: '',
		type: '',
		id: '',
		isRemote: false
	};
	res.redirect('/public/components.html');
});
app.get('/public/templates', function (req, res) {
	"use strict";
	app.locals.currentTemplate = '';
	app.locals.localTemplate = '';
	app.locals.channelToken = '';
	app.locals.currentContentItem = {
		template: '',
		type: '',
		id: '',
		isRemote: false
	};
	res.redirect('/public/templates.html');
});
app.get('/public/translationconnections', function (req, res) {
	"use strict";
	app.locals.currentTemplate = '';
	app.locals.localTemplate = '';
	app.locals.channelToken = '';
	app.locals.currentContentItem = {
		template: '',
		type: '',
		id: '',
		isRemote: false
	};
	res.redirect('/public/translationconnections.html');
});

app.get('/translationconnections*', function (req, res) {
	"use strict";

	var connectionName = req.path.replace('/translationconnections', '');
	if (!connectionName || connectionName.indexOf('/') < 0) {
		// no connector name specified
		console.log('translationconnections: invalid connector name: ' + connectionName);
		res.writeHead(200, {});
		res.end();
		return;
	}
	connectionName = connectionName.substring(1);
	console.log('+++ Connection: ' + connectionName);

	var testpage = path.join(testDir, 'public', 'testconnector.html');
	console.log(' - filePath=' + testpage);

	res.sendFile(testpage);
});

app.get('/test', function (req, res) {
	"use strict";
	res.redirect('/public');
});
app.get('/', function (req, res) {
	"use strict";
	res.redirect('/public');
});

// Handle startup errors
process.on('uncaughtException', function (err) {
	'use strict';
	if (err.code === 'EADDRINUSE' || err.errno === 'EADDRINUSE') {
		console.log('======================================');
		console.error(`Another server is using port ${err.port}. Stop that process and try to start the server again.`);
		console.log('======================================');
	} else {
		console.error(err);
	}
});


if (!app.locals.serverURL) {
	// start the server without remote server
	app.listen(port, function () {
		"use strict";
		console.log('NodeJS running...:');
		console.log('Components UI demo page: http://localhost:' + port);
		console.log('Components Unit test page: http://localhost:' + port + '/unit');
	});
} else {
	// open a user session using the given credentials
	authenticateUser(
		server.env, {
			username: server.username,
			password: server.password,
			onsuccess: function () {
				app.locals.connectToServer = true;
				var wait = server.env === 'dev_ec' ? 1500 : 15000;
				app.listen(port, function () {
					"use strict";
					setTimeout(function () {
						console.log('Server is listening on port: ' + port);
						console.log('NodeJS running...:');
						console.log('Components UI demo page: http://localhost:' + port);
						console.log('Components Unit test page: http://localhost:' + port + '/unit');
					}, wait);
				});
			},
			onfailure: function (error, resp) {
				console.log('Login to server failed - unexpected response from server');
				console.log(error);
				process.exit(0);
			}
		});
}

function authenticateUser(env, params) {
	if (app.locals.server.env === 'dev_osso' && app.locals.server.oauthtoken) {
		console.log('The OAuth token exists');
		params.onsuccess.apply();
	} else {
		var authFn = {
			pod: authenticateUserOnPod,
			dev: authenticateUserOnDevInstance,
			dev_ec: authenticateUserOnDevECInstance,
			dev_osso: authenticateUserOnOSSO,
			pod_ec: authenticateUserOnPodEC
		};

		if (authFn[env]) {
			authFn[env].call(null, params);
		} else {
			console.log('Unknown env type: ' + env);
		}
	}
}


function authenticateUserOnDevInstance(params) {
	// open user session
	request.post(app.locals.serverURL + '/cs/login/j_security_check', {
		form: {
			j_character_encoding: 'UTF-8',
			j_username: params.username,
			j_password: params.password
		}
	}, function (err, resp, body) {

		if (err) {
			params.onfailure.call(null, err, resp);
			return;
		}

		// we expect a 302 response
		if (resp && resp.statusCode === 302) {
			var location = app.locals.serverURL + '/adfAuthentication?login=true';

			request.get(location, function (err, response, body) {
				if (err) {
					params.onfailure.call(null, err);
					return;
				}

				console.log('Logged in to remote server: ' + app.locals.serverURL);
				params.onsuccess.apply();
			});
		} else {
			params.onfailure.call(null, resp);
		}
	});
}

function authenticateUserOnDevECInstance(params) {
	// open user session
	request.post(app.locals.serverURL + '/cs/login/j_security_check', {
		form: {
			j_character_encoding: 'UTF-8',
			j_username: params.username,
			j_password: params.password
		}
	}, function (err, resp, body) {

		if (err) {
			params.onfailure.call(null, err, resp);
			return;
		}

		// we expect a 303 response
		if (resp && resp.statusCode === 303) {
			var location = app.locals.serverURL + '/adfAuthentication?login=true';

			request.get(location, function (err, response, body) {
				if (err) {
					params.onfailure.call(null, err);
					return;
				}

				console.log('Logged in to remote server: ' + app.locals.serverURL);
				params.onsuccess.apply();
			});
		} else {
			params.onfailure.call(null, resp);
		}
	});
}

function authenticateUserOnPod(params) {
	function getFormData(resp) {
		var body = resp.body,
			regexp = /input type="hidden" name="(\w*)" value="([!-~]*)"/gi,
			match,
			formData = {
				username: params.username,
				password: params.password,
				userid: params.username,
				cloud: 'null',
				buttonAction: 'local'
			};

		while ((match = regexp.exec(body)) !== null) {
			if (match.length !== 3) {
				console.log('ignored invalid match for regexp:', match);
				continue;
			}

			formData[match[1]] = match[2];
		}

		return formData;
	}

	// open user session
	request.get(app.locals.serverURL + '/sites', function (err, resp, body) {
		if (err) {
			console.log('Unable to connect to server ' + app.locals.serverURL + '\nconnection failed with error:' + err.code);
			process.exit(-1);
		}

		// get form data for cloud login
		// we need the current response to extract a bunch of form data
		var formData = getFormData(resp);

		// get OAM server URL
		var OAM_Server_URL = 'https://' + resp.request.host + ':' + resp.request.port + '/oam/server/auth_cred_submit';

		// post form data
		request.post(OAM_Server_URL, {
			form: formData
		}, function (err, resp, body) {
			// expecting 302
			if (resp.statusCode === 302) {
				// TODO this might not be necessary
				request.get(resp.headers.location, function (err, resp, body) {
					if (err) {
						params.onfailure.apply(null, err);
						return;
					}

					console.log('Logged in to remote server: ' + app.locals.serverURL);
					params.onsuccess.apply();
				});
			} else {
				params.onfailure.apply(null, resp);
			}
		});
	});
}

function authenticateUserOnPodEC(params) {
	var url = app.locals.serverURL + '/documents',
		usernameid = '#idcs-signin-basic-signin-form-username',
		passwordid = '#idcs-signin-basic-signin-form-password',
		submitid = '#idcs-signin-basic-signin-form-submit',
		username = app.locals.server.username,
		password = app.locals.server.password;
	/* jshint ignore:start */
	async function loginServer() {
		try {
			const browser = await puppeteer.launch({
				ignoreHTTPSErrors: true,
				headless: false
			});
			const page = await browser.newPage();
			await page.setViewport({
				width: 960,
				height: 768
			});

			try {
				await page.goto(url, {
					timeout: 50000
				});
			} catch (err) {
				console.log('Could not connect to the server, check if the server is up');
				params.onfailure.apply(null, null);
			}

			await page.waitForSelector(usernameid);
			console.log('Enter username ' + username);
			await page.type(usernameid, username);

			await page.waitForSelector(passwordid);
			console.log('Enter password');
			await page.type(passwordid, password);

			var button = await page.waitForSelector(submitid);
			console.log('Click Login');
			await button.click();

			try {
				await page.waitForSelector('#content-wrapper', {
					timeout: 8000
				});
			} catch (err) {
				// will continue, in headleass mode, after login redirect does not occur
			}

			var tokenurl = app.locals.serverURL + '/documents/web?IdcService=GET_OAUTH_TOKEN';
			console.log('Go to ' + tokenurl);
			await page.goto(tokenurl);
			try {
				await page.waitForSelector('pre', {
					timeout: 120000
				});
			} catch (err) {
				console.log('Failed to connect to the server to get the OAuth token the first time');

				await page.goto(tokenurl);
				try {
					await page.waitForSelector('pre'); // smaller timeout
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the second time');

					await browser.close();
					params.onfailure.apply(null, null);
				}
			}

			//await page.screenshot({path: '/tmp/puppeteer.png'});

			const result = await page.evaluate(() => document.querySelector('pre').textContent);
			var token = '';
			var status = '';
			if (result) {
				var localdata = JSON.parse(result);
				token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				status = localdata && localdata.LocalData && localdata.LocalData.StatusCode;
			}
			// console.log(token);

			await browser.close();

			if (status && status === '0' && token) {
				app.locals.server.oauthtoken = token;
				console.log('The OAuth token recieved');
				params.onsuccess.apply();
			} else {
				console.log('Failed to get the OAuth token: status=' + status + ' token=' + token);
				params.onfailure.apply(null, null);
			}

		} catch (err) {
			console.log('ERROR!', err);
			params.onfailure.apply(null, null);
		}
	}
	loginServer();
	/* jshint ignore:end */
}

function authenticateUserOnOSSO(params) {
	var url = app.locals.serverURL + '/documents',
		usernameid = '#sso_username',
		passwordid = '#ssopassword',
		submitid = '[value~=Sign]',
		username = app.locals.server.username,
		password = app.locals.server.password;

	/* jshint ignore:start */
	async function loginServer() {
		try {
			const browser = await puppeteer.launch({
				ignoreHTTPSErrors: true,
				headless: false
			});
			const page = await browser.newPage();
			await page.setViewport({
				width: 960,
				height: 768
			});

			try {
				await page.goto(url, {
					timeout: 50000
				});
			} catch (err) {
				console.log('Could not connect to the server, check if the server is up');
				params.onfailure.apply(null, null);
			}

			await page.waitForSelector(usernameid);
			console.log('Enter username ' + username);
			await page.type(usernameid, username);

			await page.waitForSelector(passwordid);
			console.log('Enter password');
			await page.type(passwordid, password);

			var button = await page.waitForSelector(submitid);
			console.log('Click Login');
			await button.click();

			try {
				await page.waitForSelector('#content-wrapper', {
					timeout: 8000
				});
			} catch (err) {
				// will continue, in headleass mode, after login redirect does not occur
			}

			var tokenurl = app.locals.serverURL + '/documents/web?IdcService=GET_OAUTH_TOKEN';
			console.log('Go to ' + tokenurl);
			await page.goto(tokenurl);
			try {
				await page.waitForSelector('pre', {
					timeout: 120000
				});
			} catch (err) {
				console.log('Failed to connect to the server to get the OAuth token the first time');

				await page.goto(tokenurl);
				try {
					await page.waitForSelector('pre'); // smaller timeout
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the second time');

					await browser.close();
					params.onfailure.apply(null, null);
				}
			}

			//await page.screenshot({path: '/tmp/puppeteer.png'});

			const result = await page.evaluate(() => document.querySelector('pre').textContent);
			var token = '';
			var status = '';
			if (result) {
				var localdata = JSON.parse(result);
				token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				status = localdata && localdata.LocalData && localdata.LocalData.StatusCode;
			}
			// console.log(token);

			await browser.close();

			if (status && status === '0' && token) {
				app.locals.server.oauthtoken = token;
				console.log('The OAuth token recieved');
				params.onsuccess.apply();
			} else {
				console.log('Failed to get the OAuth token: status=' + status + ' token=' + token);
				params.onfailure.apply(null, null);
			}

		} catch (err) {
			console.log('ERROR!', err);
			params.onfailure.apply(null, null);
		}
	}
	loginServer();
	/* jshint ignore:end */
}