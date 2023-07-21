/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/* Toolkit logger for browser */

let tagsReplacer = line => {
	if (line === '\n') {
		return ""
	}
	//matching tag to resource type to simplfy `describe-[tagType]` command
	let TagType = {
		"dsch": "channel",
		"dscp": "component",
		"dss": "site",
		"dsth": "theme",
		"dsr": "repository",
		"dst": "template",
		"dstx": "taxonomy",
		"dsbj":"background-job"
	}


	//removing tags and adding describe command args
	for (let tag in TagType) {
		let regxp = new RegExp(`\\[!--${tag}--\\](.*?)\\[\\/!--${tag}--\\]`);
		let match = line.match(regxp)
		/**
		 * Replacing tag  untill there's no more occurrence
		 */
		while (match != null) {
			let args = []
			args.push(TagType[tag])
			args.push(`${match[1].trim()}`)
			// replacing macros with an anchor that calls `handleCreateNewTabWithCommand` with the appropriate describe command, once clicked this function will send a message to inform the parent window about the occured event, check powershell.html.
			line = line.replaceAll(match[0], `<a href="javascript:void(0)" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`describe-${args.join(" ")}`)}')); })();">${match[1]}</a>`);
			match = line.match(regxp)
		}
	}
	return line;
}


var _level;
var levels = ['info', 'warn', 'error', 'debug'];

function _showinfo() {
	return true
}
var _setLevel = function (level) {
	if (!levels.includes(level)) {
		_level = 'info';
	} else {
		_level = level;
	}
	// console.log('*** set log level: ' + _level);
};



function logger(m) {
	if (typeof m == "string" && m.startsWith(" - configuration file:")) return
	let shellContainer = document.getElementById(`output-powershell`);
	let output = `${tagsReplacer(m.toString())}\n`;
	if (!shellContainer) {
		return;
	}
	shellContainer.innerHTML += output.replace(/^[\s\n]+/g, "")
}

module.exports.console = {
	showInfo: _showinfo,
	setLevel: _setLevel,
	log: logger,
	debug: logger,
	info: logger,
	warn: logger,
	error: logger,
};
