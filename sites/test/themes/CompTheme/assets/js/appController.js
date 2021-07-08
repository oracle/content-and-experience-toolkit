/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/*
 * Your application specific code will go here
 */
define(['require', 'ojs/ojcore', 'knockout', 'jquery', 'ojs/ojrouter', 'ojs/ojknockout', 'ojs/ojarraytabledatasource',
		'ojs/ojoffcanvas'
	],
	function (require, oj, ko, $) {
		function ControllerViewModel() {
			var self = this;

			// get the Content Management variables for the site/page
			var renderAPI = window.SCSRenderAPI,
				siteStructure = window.SCS,
				siteName = renderAPI.getSiteProperty('siteName'),
				siteRootPrefix = renderAPI.getSiteProperty('siteRootPrefix');

			// Media queries for repsonsive layouts
			var smQuery = oj.ResponsiveUtils.getFrameworkQuery(oj.ResponsiveUtils.FRAMEWORK_QUERY_KEY.SM_ONLY);
			self.smScreen = oj.ResponsiveKnockoutUtils.createMediaQueryObservable(smQuery);
			var mdQuery = oj.ResponsiveUtils.getFrameworkQuery(oj.ResponsiveUtils.FRAMEWORK_QUERY_KEY.MD_UP);
			self.mdScreen = oj.ResponsiveKnockoutUtils.createMediaQueryObservable(mdQuery);

			// setup the navigation data to this Site's Pages
			var navIcons = [
					'oj-navigationlist-item-icon demo-icon-font-24 demo-chart-icon-24',
					'oj-navigationlist-item-icon demo-icon-font-24 demo-fire-icon-24',
					'oj-navigationlist-item-icon demo-icon-font-24 demo-people-icon-24',
					'oj-navigationlist-item-icon demo-icon-font-24 demo-info-icon-24'
				],
				pageIndex = 0;


			// add all the nodes from the site structure
			function addNode(id, navNodes) {
				var nodeData = {};
				if (id >= 0) {
					var navNode = siteStructure.structureMap[id];
					if (navNode && ((typeof navNode.hideInNavigation !== 'boolean') || (navNode.hideInNavigation === false))) {
						var linkData = renderAPI.getPageLinkData(navNode.id) || {};
						pageIndex++;

						nodeData = {
							'id': navNode.id,
							'attr': {
								'name': navNode.name,
								'id': navNode.id,
								'isDefault': navNode.id === siteStructure.navigationRoot,
								'iconClass': navIcons[pageIndex % navIcons.length],
								'href': linkData.href,
								'target': linkData.target
							}
						};

						if (navNode.children.length > 0) {
							nodeData.children = [];
							for (var c = 0; c < navNode.children.length; c++) {
								var childNode = addNode(navNode.children[c]);
								if (childNode.id) {
									nodeData.children.push(childNode);
									nodeData.attr.hasChildren = true;
								}
							}
						}
					}
				}
				return nodeData;
			}
			// display all the top-level nodes
			var allNodes = addNode(siteStructure.navigationRoot);
			self.navData = allNodes.children || [];

			// for this use-case, add in the copied rootNode as a topLevelNode
			// copy the root node but remove the children
			var rootNode = $.extend({}, allNodes);
			rootNode.children = undefined; 
			self.navData.unshift(rootNode);

			self.navDataSource = new oj.ArrayTableDataSource(self.navData, {
				idAttribute: 'id'
			});

			self.currentPageId = siteStructure.navigationCurr;

			// Drawer
			// Close offcanvas on medium and larger screens
			self.mdScreen.subscribe(function () {
				oj.OffcanvasUtils.close(self.drawerParams);
			});
			self.drawerParams = {
				displayMode: 'push',
				selector: '#navDrawer',
				content: '#pageContent'
			};
			// Called by navigation drawer toggle button and after selection of nav drawer item
			self.toggleDrawer = function () {
				return oj.OffcanvasUtils.toggle(self.drawerParams);
			};
			// Add a close listener so we can move focus back to the toggle button when the drawer closes
			$("#navDrawer").on("ojclose", function () {
				$('#drawerToggleButton').focus();
			});

			// Header
			// Content Management Name used in Branding Area
			self.appName = ko.observable(siteName);

			// Use the DOCS logged in user info in Global Navigation area
			self.loggedInUser = ko.observable();
			self.getUserInfo = function () {
				$.ajax({
					type: 'GET',
					url: '/documents/web?IdcService=GET_USER_INFO'
				}).then(function (data, textStatus, jqXHR) {
					if (data && data.LocalData && data.LocalData.dUserFullName) {
						self.loggedInUser(data.LocalData.dUserFullName);
					} else {
						console.log('Username not available, not signed in.');
						self.loggedInUser('');
					}
				}, function (jqXHR, textStatus, errorThrown) {
					console.log('Username not available, not signed in.');
					self.loggedInUser('');
				});
			};
			// initialise the user info
			self.getUserInfo(); 

			// handle sign-in request
			self.signIn = function () {
				// sign in

				// get the newly signed in user info
				self.getUserInfo();
			};

			// Handle sign out request 
			self.userMenuItemAction = function (event) {
				var menuItemSelected = event.target.id;
				if (menuItemSelected === 'signOut') {
					// sign out
					// /oam/server/logout

					// clear current user 
					self.loggedInUser('');
				}
			};


			// Footer
			function footerLink(name, id, linkTarget) {
				this.name = name;
				this.linkId = id;
				this.linkTarget = linkTarget;
			}
			self.footerLinks = ko.observableArray([
				new footerLink('About Us', 'aboutUs', 'http://www.oracle.com/us/corporate/index.html#menu-about'),
				new footerLink('Contact Us', 'contactUs', 'http://www.oracle.com/us/corporate/contact/index.html'),
				new footerLink('Legal Notices', 'legalNotices', 'http://www.oracle.com/us/legal/index.html'),
				new footerLink('Terms Of Use', 'termsOfUse', 'http://www.oracle.com/us/legal/terms/index.html'),
				new footerLink('Your Privacy Rights', 'yourPrivacyRights', 'http://www.oracle.com/us/legal/privacy/index.html')
			]);
		}

		return new ControllerViewModel();
	}
);
