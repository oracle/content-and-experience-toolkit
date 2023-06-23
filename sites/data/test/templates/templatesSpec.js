/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals serverConfig,browser,testConfig */
var chai = require('chai'),
	expect = chai.expect,
	should = chai.should,
	fs = require('fs'),
	path = require('path');


// utilty function to get all folders in a directory
var getFolders = function (dir) {
	return fs.readdirSync(dir)
		.filter(function (file) {
			return fs.statSync(path.join(dir, file)).isDirectory();
		});
};

describe('Template Tests', function () {
	it('templates test setup', async function () {
		var page,
			templates = getFolders(serverConfig.templatesFolder);

		describe('Validate templates render', function () {
			before(async function () {
				// create a new tab for all of these tests
				page = await browser.newPage();
			});
			after(async function () {
				// close the tab after all tests complete
				await page.close();
			});

			// run generic validation against all the templates
			if (testConfig.remote) {
				// run remote server tests
				it('ToDo: implement remote server tests', async function () {
					throw new Error('No remote server template tests implemented');
				});
			} else {
				// run local server tests

				// run generic validation against all the templates
				templates.forEach(function (templateName) {
					it('basic template render test for: ' + templateName, async function () {
						this.timeout(180000);

						// render the template onto the page
						var pageURL = serverConfig.url + '/templates/' + templateName;
						await page.goto(pageURL);

						// wait until the "Home" link is visible
						try {
							await page.waitForFunction('Array.prototype.find.call(document.querySelectorAll("a"), function (node) { return node.innerText.toLowerCase() === "home"; })');
						} catch (e) {
							console.log(e);
							throw new Error('Failed to locate "Home" page link in template: ' + templateName);
						}

						// do any other tests
					});
				});
			}
		});
	});
});