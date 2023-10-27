/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */


function channelFormat(name) {
	return process.shim ? `[!--dsch--]${name}[/!--dsch--]` : name;
}

function taxonomyFormat(name) {
	return process.shim ? `[!--dstx--]${name}[/!--dstx--]` : name;
}

function assetFormat(name) {
	return process.shim ? `[!--dsa--]${name}[/!--dsa--]` : name;
}

function componentFormat(name) {
	if (name === 'scs-contentitem') {
		return name;
	} else {
		return process.shim ? `[!--dscp--]${name}[/!--dscp--]` : name;
	}
}

function repositoryFormat(name) {
	return process.shim ? `[!--dsr--]${name}[/!--dsr--]` : name;
}

function siteFormat(name) {
	return process.shim ? `[!--dss--]${name}[/!--dss--]` : name;
}

function themeFormat(name) {
	return process.shim ? `[!--dsth--]${name}[/!--dsth--]` : name;
}

function templateFormat(name) {
	return process.shim ? `[!--dst--]${name}[/!--dst--]` : name;
}

function bgjobFormat(name) {
	return process.shim ? `[!--dsbj--]${name}[/!--dsbj--]` : name;
}

module.exports = {
	channelFormat,
	taxonomyFormat,
	assetFormat,
	componentFormat,
	repositoryFormat,
	siteFormat,
	themeFormat,
	templateFormat,
	bgjobFormat
}