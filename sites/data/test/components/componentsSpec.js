/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/* global console, process, __dirname */
/* jshint esversion: 8 */
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

describe('Components Tests', function () {
	it('components test setup', async function () {
		var page,
			components = getFolders(serverConfig.componentsFolder);

		describe('Validate components render', async function () {
			before(async function () {
				// create a new tab for all of these tests
				page = await browser.newPage();
			});
			after(async function () {
				// close the tab after all tests complete
				await page.close();
			});

			if (testConfig.remote) {
				// run remote server tests
				it('ToDo: implement remote server tests', async function () {
					throw new Error('No remote server component tests implemented');
				});
			} else {
				// run local server tests

				// run generic validation against all the components
				components.forEach(function (componentName) {
					// if it's the NavMenu component, it requires bootstrap, which isn't included by default so ignore it
					if (componentName !== 'NavMenu') {
						it('basic component render test for: ' + componentName, async function () {
							this.timeout(180000);

							// get the type of component
							var appInfoJSON = fs.readFileSync(serverConfig.componentsFolder + '/' + componentName + '/appinfo.json', 'utf8'),
								appInfo;
							try {
								appInfo = JSON.parse(appInfoJSON);
							} catch (e) {
								console.log(e);
								throw new Error('Failed to determine component type for: ' + componentName);
							}

							// run generic tests by type
							switch (appInfo.type) {
								case 'contentlayout':
									console.log('\x1b[33m      - No tests implemented for: ' + componentName + '\x1b[0m');
									break;
								case 'sandboxed':
									console.log('\x1b[33m      - No tests implemented for: ' + componentName + '\x1b[0m');
									break;
								case 'sectionlayout':
									console.log('\x1b[33m      - No tests implemented for: ' + componentName + '\x1b[0m');
									break;
								case 'componentgroup':
									console.log('\x1b[33m      - No tests implemented for: ' + componentName + '\x1b[0m');
									break;
								default:
									// render local component onto the page
									var pageURL = serverConfig.url + '/components/' + componentName;
									await page.goto(pageURL);

									try {
										// get the custom component container ID
										await page.waitForSelector('.scs-component-container');
										const componentId = await page.evaluate(() => document.querySelector('.scs-component-container').id);

										// wait until something has rendered into the customComponentDiv 
										var custCompSelector = '#' + componentId + 'customComponentDiv';
										await page.waitForSelector(custCompSelector);
										await page.waitForFunction('document.querySelector("' + custCompSelector + '").innerText.length > 0');
									} catch (e) {
										console.log(e);
										throw new Error('Failed to validate custom component code has rendered into the page: ' + componentName);
									}
							}

							// do any other tests
						});
					}
				});
			}
		});
	});
});