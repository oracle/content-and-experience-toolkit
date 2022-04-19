/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var fs = require('fs'),
	path = require('path');

var getServerConfig = function () {
	var configFile,
		currPath = process.cwd();

	// load up the properties file
	if (process.env.CEC_PROPERTIES) {
		console.log('CEC location file located from CEC_PROPERTIES environment variable');
		configFile = process.env.CEC_PROPERTIES;
	} else if (currPath && fs.existsSync(path.join(currPath, 'cec.properties'))) {
		console.log('CEC location file located from current working directory');
		configFile = path.join(currPath, 'cec.properties');
	}
	console.log('CEC configuration file: ' + configFile);


	// define the server config
	var serverConfig = {
		fileloc: configFile,
		url: '',
		username: '',
		password: '',
		templatesFolder: path.join(currPath, 'src', 'templates'),
		componentsFolder: path.join(currPath, 'src', 'components')
	};
	if (fs.existsSync(configFile)) {
		try {
			var cecurl,
				username,
				password,
				env;

			fs.readFileSync(configFile).toString().split('\n').forEach(function (line) {
				if (line.indexOf('cec_url=') === 0) {
					cecurl = line.substring('cec_url='.length);
					cecurl = cecurl.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_username=') === 0) {
					username = line.substring('cec_username='.length);
					username = username.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_password=') === 0) {
					password = line.substring('cec_password='.length);
					password = password.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_env=') === 0) {
					env = line.substring('cec_env='.length);
					env = env.replace(/(\r\n|\n|\r)/gm, '').trim();
				}
			});
			if (cecurl && username && password) {
				serverConfig.url = cecurl;
				serverConfig.username = username;
				serverConfig.password = password;
				serverConfig.env = env;
			}
		} catch (e) {
			console.log('Failed to read config: ' + e);
			return {};
		}
	}
	return serverConfig;
};


//
// Server Login Utils
//
var _loginToServer = function (server, selectors) {
	return new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = selectors.usernameid,
			passwordid = selectors.passwordid,
			submitid = selectors.submitid,
			username = server.username,
			password = server.password;
		(async function () {
			try {
				const page = await global.browser.newPage();

				await page.goto(url);

				// enter un/pw
				await page.waitForSelector(usernameid);
				await page.waitForSelector(passwordid);
				await page.evaluate((usernameid, username, passwordid, password) => {
					document.querySelector(usernameid).value = username;
					document.querySelector(passwordid).value = password;
				}, usernameid, username, passwordid, password);

				// login with entered credentials
				var button = await page.waitForSelector(submitid);
				await button.click();

				// wait for navigation to next page to render correctly
				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: 12000
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				console.log(' - connected to remote server: ' + server.url);

				await page.close();
				return resolve({
					'status': true
				});

			} catch (err) {
				console.log('ERROR: failed to connect to the remote server: ' + server.url);
				console.log(err);
				return reject();
			}
		}());
	});
};

var loginToServer = function (server) {
	var env = server.env || 'pod_ec';

	var selectors = {
		'dev_osso': {
			usernameid: '#sso_username',
			passwordid: '#ssopassword',
			submitid: '[value~=Sign]'
		},
		'dev_ec': {
			usernameid: '#j_username',
			passwordid: '#j_password',
			submitid: 'input[type="submit"]'
		},
		'pod_ec': {
			usernameid: '#idcs-signin-basic-signin-form-username',
			passwordid: '#idcs-signin-basic-signin-form-password',
			submitid: '#idcs-signin-basic-signin-form-submit'
		}
	};

	// see if any required parameters are missing
	if (server.url && server.username && server.password) {
		return _loginToServer(server, selectors[env]);
	} else {
		return Promise.reject('Error: failed to login to remote server:  missing url, username or password from the CEC configuration file.');
	}

};

module.exports = {
	loginToServer: loginToServer,
	getServerConfig: getServerConfig
};