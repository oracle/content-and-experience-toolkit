/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
function renderNode(id, navBar)
{
	if (id >= 0)
	{
		var navNode = SCS.structureMap[id];
		if ( navNode &&
			(
				( typeof navNode.hideInNavigation != "boolean" ) ||
				( navNode.hideInNavigation === false )
			) )
		{
			var navItem = document.createElement("li");
			var navLink = document.createElement("a");
			var navText = document.createTextNode(navNode.name);

			var linkData = SCSRenderAPI.getPageLinkData(navNode.id) || {};
			if ( linkData.href ) {
				navLink.href = linkData.href;
			}
			if ( linkData.target ) {
				navLink.target = linkData.target;
			}

			navLink.appendChild(navText);
			navItem.appendChild(navLink);

			if (navNode.children.length > 0)
			{
				var navSub = document.createElement("ul");

				for (var c = 0; c < navNode.children.length; c++)
				{
					renderNode(navNode.children[c], navSub);
				}

				navItem.appendChild(navSub);
			}
			navBar.appendChild(navItem);
		}
	}
}

function renderNav()
{
	var topnav = document.getElementById("topnav");		// expected to be an empty <div>

	if (topnav)
	{
		var navBar = document.createElement("ul");

		renderNode(SCS.navigationRoot, navBar);

		topnav.appendChild(navBar);
	}
}

// Must wait for all our script to be ready...
if (document.addEventListener)
{

	document.addEventListener('scsrenderstart', renderNav, false);
}
else if (document.attachEvent)
{
	document.documentElement.scsrenderstart = 0;
	document.documentElement.attachEvent("onpropertychange",
		function(event)
		{
			if (event && (event.propertyName == "scsrenderstart"))
			{
				renderNav();
			}
		}
	);
}
