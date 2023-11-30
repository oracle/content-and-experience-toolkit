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
		// replace spaces before a '[required]' for parameters
		line = line.replace(/ {80} *\[required\]/g, ' [!--required--](required)[/!--required--]');

		// HTML encode all values
		htmlEncode.innerText = (line || '');
		line = htmlEncode.innerHTML;
	}

	// matching tagname to resource type to simplfy `describe-[tagType]` command
	let TagType = {
		// describe
		"dsch": "channel",
		"dscp": "component",
		"dss": "site",
		"dsth": "theme",
		"dsr": "repository",
		"dst": "template",
		"dstx": "taxonomy",
		"dsbj": "background-job",
		"dsa": "asset",
		"dsct": "category",
		"dstp": "type",
		"dstj": "translation-job",
		"dllp": "localization-policy",
		"dsf": "file",
		"dsej": "export-job",
		"dsij": "import-job",

		// list
		"lfd": "folder",

		// file preview
		"fileview": "fileview",

		// the following are non toolkit tags but follow the same syntax
		"done": "done",
		"required": "required",
		"downloadExportReport": "downloadExportReport",
		"downloadImportReport": "downloadImportReport"
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
			if (tag === "downloadExportReport") {
				line = line.replaceAll(match[0], `<a href="#" aria-label="download report zip file" title="download report zip file" onClick="downloadReport('exports', '${match[1]}')">Download report</a>`);
			} else if (tag === "downloadImportReport") {
				line = line.replaceAll(match[0], `<a href="#" aria-label="download report zip file" title="download report zip file" onClick="downloadReport('imports', '${match[1]}')">Download report</a>`);
			} else if (tag === "done") {
				line = line.replaceAll(match[0], `<div class="end-of-command">${match[1]}</div>`);
			} else if (tag === "required") {
				line = line.replaceAll(match[0], `<span class="required-parameter">${match[1]}</span>`);
			} else if (tag === "fileview") {
				line = line.replaceAll(match[0], `<a href="/documents/fileview/${name}" name="${name}" aria-label="preview ${name}" title="preview ${name}" target="_blank">${name}</a>`);
			} else if (tag === "lfd") {
				// folder tag may be in the format of "folderName,folderPath"
				let entries = name.split(',');
				let filePath = entries[0];
				let fullPath = entries[1] ? `${entries[1]}${entries[1].endsWith('/') ? '' : '/'}${filePath}` : filePath;
				line = line.replaceAll(match[0], `<a href="javascript:void(0)" name="${filePath}" aria-label="cec list-${TagType[tag]} ${filePath}" title="cec list-${TagType[tag]} ${filePath}" type="${TagType[tag]}" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`list-${TagType[tag]} "${fullPath}"`)}'),true); })();">${entries[0]}</a>`);
			} else if (tag === "dsf") {
				// file tag may be in the format of "filePath,resourceName"
				let entries = name.split(',');
				let filePath = entries[0];
				let fullPath = entries[1] ? `${entries[1]}${entries[1].endsWith('/') ? '' : '/'}${filePath}` : filePath;
				line = line.replaceAll(match[0], `<a href="javascript:void(0)" name="${filePath}" aria-label="cec describe-${TagType[tag]} ${filePath}" title="cec describe-${TagType[tag]} ${filePath}" type="${TagType[tag]}" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`describe-${TagType[tag]} "${fullPath}"`)}'),true); })();">${entries[0]}</a>`);
			} else if (tag === "dsct") {
				// category tag is in the format of "category,taxonomy"
				let entries = name.split(',');
				line = line.replaceAll(match[0], `<a href="javascript:void(0)" name="${entries[0]}" aria-label="cec describe-${TagType[tag]} ${entries[0]}" title="cec describe-${TagType[tag]} ${entries[0]}" type="${TagType[tag]}" onclick="javascript:(function() { handleCreateNewTabWithCommand(decodeURIComponent('${encodeURIComponent(`describe-${TagType[tag]} "${entries[0]}" -t "${entries[1]}"`)}'),true); })();">${entries[0]}</a>`);
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

	// swallow generic Yags messages
	if (/.*show.*version.*number.*/i.test(m)) {
		return;
	}
	if (m.startsWith(" - configuration file:")) {
		return
	}
	if (m.startsWith("Unknown argument:")) {
		return;
	}

	// put back any replaced values
	var regexEscapedQuote = new RegExp(window.escapedQuote, 'g');
	m = m.replace(regexEscapedQuote, '"');

	// expand tags with corresponding HTML markup
	let output = `${tagsReplacer(m.toString())}\n`;

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
