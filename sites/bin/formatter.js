/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

function formatName(name, tag) {
	return process.shim && name ? `[!--${tag}--]${name}[/!--${tag}--]` : name;
}

function sizeColumn(dfltSize, name, tag) {
	var numberOfItems = Math.min(Array.isArray(name) ? name.length : (name ? 1 : 0), 5);

	if (process.shim && numberOfItems > 0) {
		// dfltSize + ([!--tag.length--][/!--tag.length--]).length * nuber of items
		return dfltSize + (((tag.length * 2) + 15) * numberOfItems);
	} else {
		return dfltSize;
	}
}

var tags = [{
	name: 'channel',
	value: 'dsch'
}, {
	name: 'taxonomy',
	value: 'dstx'
}, {
	name: 'asset',
	value: 'dsa'
}, {
	name: 'component',
	value: 'dscp'
}, {
	name: 'repository',
	value: 'dsr'
}, {
	name: 'site',
	value: 'dss'
}, {
	name: 'theme',
	value: 'dsth'
}, {
	name: 'template',
	value: 'dst'
}, {
	name: 'type',
	value: 'dstp'
}, {
	name: 'category',
	value: 'dsct'
}, {
	name: 'translationJob',
	value: 'dstj'
}, {
}, {
	name: 'localizationPolicy',
	value: 'dllp'
}, {
	name: 'file',
	value: 'dsf'
}, {
	name: 'folder',
	value: 'lfd'
}, {
	name: 'exportJob',
	value: 'dsej'
}, {
	name: 'importJob',
	value: 'dsij'
}, {
	name: 'bgjob',
	value: 'dsbj'
}, {
	name: 'fileview',
	value: 'fileview'
}
];

var formatter = {};

// populate the formatter
tags.forEach((tag) => {
	// add in the 'name' formatters
	formatter[tag.name + 'Format'] = (name) => {
		return formatName(name, tag.value);
	};

	// add in the 'column' sizes
	formatter[tag.name + 'ColSize'] = (dfltSize, name) => {
		return sizeColumn(dfltSize, name, tag.value);
	}
});

var systemNames = ['scs-contentitem', 'Default', 'Same as Desktop'];

// add in any overrides
formatter.componentFormat = (name) => {
	if (systemNames.indexOf(name) === -1) {
		return formatName(name, 'dscp');
	} else {
		return name;
	}
};
formatter.componentColSize = (dfltSize, name) => {
	if (systemNames.indexOf(name) === -1) {
		return sizeColumn(dfltSize, name, 'dscp');
	} else {
		return dfltSize;
	}
};
formatter.categoryFormat = (name, taxonomy) => {
	if (process.shim && name && taxonomy) {
		return formatName(`${name},${taxonomy}`, 'dsct');
	} else {
		return name;
	}
};
formatter.fileFormat = (name, folder) => {
	if (process.shim && name) {
		return formatName(folder ? `${name},${folder}` : name, 'dsf');
	} else {
		return name;
	}
};
formatter.folderFormat = (name, folder) => {
	if (process.shim && name) {
		return formatName(folder ? `${name},${folder}` : name, 'lfd');
	} else {
		return name;
	}
};

module.exports = formatter;
