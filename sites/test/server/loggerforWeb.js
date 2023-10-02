/**
 * Copyright (c) 2023 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/* Toolkit logger for browser */
let htmlEncode = document.createElement("textarea");
let tagsReplacer = line => {
	if (line === '\n') {
		return "";
	} else {
		// HTML encode all values
		htmlEncode.innerText = (line || '');
		line = htmlEncode.innerHTML;
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
		"dsbj":"background-job",
		"dsa":"asset",
	}


	//removing tags and adding describe command args
	for (let tag in TagType) {
		let regxp = new RegExp(`\\[!--${tag}--\\](.*?)\\[\\/!--${tag}--\\]`);
		let match = line.match(regxp)
		/**
		 * Replacing tag  untill there's no more occurrence
		 */

		while (match != null) {
			let name = match[1].trim()
			// replacing macros with an anchor that calls `handleCreateNewTabWithCommand` with the appropriate describe command, once clicked this function will send a message to inform the parent window about the occured event, check powershell.html.
			line = line.replaceAll(match[0], `<a href="javascript:void(0)" name="${name}" aria-label="cec describe-${TagType[tag]} ${name}" title="cec describe-${TagType[tag]} ${name}" type="${TagType[tag]}" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`describe-${TagType[tag]} "${name}"`)}'),true); })();">${match[1]}</a>`);
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


window.writeQueue = []
function processQueue() {

	for (let i = 0;i < 200;++i) {
		if (window.writeQueue.length > 0) {
			let item = window.writeQueue.shift()
			logger(item)
		}
	}
}

function logger(m) {
	if (typeof m == "string" && m.startsWith(" - configuration file:")) return
	let shellContainer = document.getElementById(`output-powershell`);
	m = m.replace(/-(\w+), -\1,/g, '-$1,')
	m = m.replace(/\s\s\s+--.+\n/g, "\n")
	m = m.replace(/[\\]/g, "")
	let output = `${tagsReplacer(m.toString())}\n`;
	if (!shellContainer) {
		return;
	}
	// display multi lines
	if (m.startsWith("Unknown argument:")) {
		return;
	}


	const div = document.createElement('div');
	div.innerHTML = output.replace(/^[\n]+/g, "");
	shellContainer.appendChild(div);

	if (window.autoScroll) {
		let bottomDiv = document.getElementById(`output-bottom`);
		if (bottomDiv) {
			bottomDiv.scrollIntoView();
		}
	}

}

setInterval(processQueue, 10)

module.exports.console = {
	showInfo: _showinfo,
	setLevel: _setLevel,
	log:(m) => window.writeQueue.push(m),
	debug: logger,
	info: logger,
	warn: logger,
	error: logger,
};
