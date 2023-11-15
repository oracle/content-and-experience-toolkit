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
		// replace of spaces before a '[required]' for parameters
		line = line.replace(/ {80} *\[required\]/g, ' [!--required--](required)[/!--required--]');

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
		"dsbj": "background-job",
		"dsa": "asset",
		"done": "done",
		"required": "required"
	}


	//removing tags and adding describe command args
	for (let tag in TagType) {
		let regxp = new RegExp(`\\[!--${tag}--\\](.*?)\\[\\/!--${tag}--\\]`);
		let match = line.match(regxp)

		/**
		 * Replacing tag  untill there's no more occurrence
		 */
		while (match != null) {
			let name = match[1].trim();
			if (tag === "done") {
				line = line.replaceAll(match[0], `<div class="end-of-command">${match[1]}</div>`);
			} else if (tag === "required") {
				line = line.replaceAll(match[0], `<span class="required-parameter">${match[1]}</span>`);
			} else {
				// replacing macros with an anchor that calls `handleCreateNewTabWithCommand` with the appropriate describe command, once clicked this function will send a message to inform the parent window about the occured event, check powershell.html.
				line = line.replaceAll(match[0], `<a href="javascript:void(0)" name="${name}" aria-label="cec describe-${TagType[tag]} ${name}" title="cec describe-${TagType[tag]} ${name}" type="${TagType[tag]}" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`describe-${TagType[tag]} "${name}"`)}'),true); })();">${match[1]}</a>`);
			}
			match = line.match(regxp);
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


window.writeQueue = [];
window.addMessage = (msg) => {
	window.writeQueue.push(msg);
};
window.writeFragment = document.createDocumentFragment();
window.fragmentUpdated = false;
function processQueue() {

	for (let i = 0;i < 200;++i) {
		if (window.writeQueue.length > 0) {
			let item = window.writeQueue.shift()
			logger(item)
		}
	}
}
function WriteToDOM() {
	if (window.fragmentUpdated) {
		// write the fragment
		let shellContainer = document.getElementById(`output-powershell`);
		shellContainer.appendChild(window.writeFragment);

		// autoscroll
		if (window.autoScroll) {
			var powerShelllDiv = document.getElementById("output-powershell");
			powerShelllDiv.scrollTop = powerShelllDiv.scrollHeight;
		}

		// reset the fragment
		window.fragmentUpdated = false;
		window.writeFragment = document.createDocumentFragment();
	}
}

function logger(m) {
	if (typeof m !== 'string') {
		return;
	}

	if (m.startsWith(" - configuration file:")) {
		return
	}

	m = m.replace(/-(\w+), -\1,/g, '-$1,')
	m = m.replace(/\s\s\s+--.+\n/g, "")
	m = m.replace(/[\\]/g, "")
	let output = `${tagsReplacer(m.toString())}\n`;

	// display multi lines
	if (m.startsWith("Unknown argument:")) {
		return;
	}

	// create a div and write to the fragment
	const div = document.createElement('div');
	div.innerHTML = output.replace(/^[\n]+/g, "");
	window.writeFragment.appendChild(div);

	// note the fragment has been updated so it will get written out in batch
	window.fragmentUpdated = true;
}

setInterval(processQueue, 10)
setInterval(WriteToDOM, 100)
module.exports.console = {
	showInfo: _showinfo,
	setLevel: _setLevel,
	log:(m) => window.addMessage(m),
	debug: (m) => window.addMessage(m),
	info: (m) => window.addMessage(m),
	warn: (m) => window.addMessage(m),
	error: (m) => window.addMessage(m)
};
