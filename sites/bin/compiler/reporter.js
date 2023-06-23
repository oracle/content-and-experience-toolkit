/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 * This unpublished work by Oracle is protected by the laws
 * of the United States and other countries. If publication
 * of this computer program should occur, the following notice
 * shall apply:
 *
 * Copyright (c) 2013 Oracle Corp.
 * All rights reserved.
 *
 * $Id: reporter.js 141546 2016-03-24 23:23:28Z dpeterso $
 */

var LOG_ENTRIES = {
		'error': {
			level: 'error',
			label: ' Error:   ',
			writer: process.stderr.write.bind(process.stderr),
			color: '\x1b[31m' // red
		},
		'warn': {
			level: 'warn',
			label: ' Warning: ',
			writer: process.stdout.write.bind(process.stdout),
			color: '\x1b[33m', // yellow
		},
		'info': {
			level: 'info',
			label: ' Info:    ',
			writer: process.stdout.write.bind(process.stdout),
			color: '\x1b[2m', // dim
		},
		'debug': {
			level: 'debug',
			label: ' Debug:   ',
			writer: process.stdout.write.bind(process.stdout),
			color: '\x1b[2m', // dim
		},
		'log': {
			level: 'log',
			label: ' Log:     ',
			writer: process.stdout.write.bind(process.stdout),
			color: '\x1b[2m', // dim
		}
	},
	LOG_ORDER = [LOG_ENTRIES.error.level, LOG_ENTRIES.warn.level, LOG_ENTRIES.info.level, LOG_ENTRIES.debug.level, LOG_ENTRIES.log.level];

// create a generic logger
var CompilationLogger = function () {};
CompilationLogger.prototype = {
	getLogLevel: function () {
		return this.logLevel || LOG_ENTRIES.error.level; // default to error only
	},
	setLogLevel: function (logLevel) {
		if (LOG_ORDER.indexOf(logLevel) !== -1) {
			this.logLevel = logLevel;
		}
	},
	formatMessage: function (level, args) {
		var colorReset = '\x1b[0m',
			logEntry = LOG_ENTRIES[level],
			message = typeof args === 'string' ? args : args.message;

		// format the log message
		return logEntry.color + logEntry.label + message + colorReset + '\n';
	},
	showMessage: function (level) {
		var currentLogLevel = this.getLogLevel();
		return (LOG_ORDER.indexOf(currentLogLevel) >= LOG_ORDER.indexOf(level));
	},
	renderMessage: function (level, args) {
		// default implementation
		if (this.showMessage(level)) {
			var logEntry = LOG_ENTRIES[level];
			var formattedMessage = this.formatMessage(level, args);
			logEntry.writer(formattedMessage);

			// also write the stream if requested
			if (this.outputStream) {
				this.outputStream.write(formattedMessage);
			}

			// output any error (typically stack trace) as well
			if (args && args.error) {
				console.log(args.error);
			}
		}
	},
	log: function (args) {
		this.renderMessage(LOG_ENTRIES.log.level, args);
	},
	debug: function (args) {
		this.renderMessage(LOG_ENTRIES.debug.level, args);
	},
	info: function (args) {
		this.renderMessage(LOG_ENTRIES.info.level, args);
	},
	warn: function (args) {
		this.renderMessage(LOG_ENTRIES.warn.level, args);
	},
	error: function (args) {
		this.renderMessage(LOG_ENTRIES.error.level, args);
	}
};

// create a reporter object to output any required information during compile and then a summary report at the end
var CompilationReporter = function () {};
CompilationReporter.prototype = Object.create(CompilationLogger.prototype);

CompilationReporter.prototype.report = {
	messages: {},
	pages: {}
};
CompilationReporter.prototype.setReportingLevel = function (reportingLevel) {
	var logLevel = LOG_ENTRIES.error.level; // default to error only
	if (reportingLevel === 'verbose') {
		logLevel = LOG_ORDER[LOG_ORDER.length - 1]; // output everything
	} else if (LOG_ORDER.indexOf(reportingLevel) !== -1) {
		logLevel = reportingLevel; // use specified level
	}
	this.setLogLevel(logLevel);
};
CompilationReporter.prototype.setPageContext = function (pageId) {
	this.currentPage = pageId;
};
// overide the renderMessage logging function to filter and cache the messages for reporting
CompilationReporter.prototype.renderMessage = function (level, args) {
	var pageId = this.currentPage;

	// get the current messages for this page
	if (!this.report.pages[pageId]) {
		var pageCache = {};
		// initialize the current page cache
		Object.keys(LOG_ENTRIES).forEach(function (key) {
			var logLevel = LOG_ENTRIES[key].level;
			pageCache[logLevel] = {};
		});
		this.report.pages[pageId] = pageCache;
	}

	var page = this.report.pages[pageId],
		messages = this.report.messages;

	// note whether at least one error was reported
	this.hasErrors = this.hasErrors || (level === 'error');

	// if message not already reported, output it
	var message = this.formatMessage(level, args);
	if (!messages[message]) {
		// now we can call the base implementation to handle standard logging
		CompilationLogger.prototype.renderMessage.call(this, level, args);

		// cache the message entry globally
		messages[message] = args;

		// cache against the page, not currently used but can be applied to a page-based table report (see below)
		page[level][message] = args;
	}
};
CompilationReporter.prototype.setOutputStream = function (outputStream) {
	// also write to this output stream
	this.outputStream = outputStream;
},
CompilationReporter.prototype.renderReport = function () {
	var self = this;

	// create table data for the report listing all errors and warnings
	var reportTable = [];
	Object.keys(self.report.pages).forEach(function (pageId) {
		var entry = self.report.pages[pageId],
			numErrors = Object.keys(entry.error).length,
			numWarnings = Object.keys(entry.warn).length;

		if (numErrors > 0 || numWarnings > 0) {
			reportTable.push({
				'pageId': pageId,
				'warnings': numWarnings,
				'errors': numErrors
			});
		}
	});

	// output the table if there are any errors
	console.log();
	if (reportTable.length > 0) {
		var totalErrors = 0,
			totalWarnings = 0;

		// sort the table by errors then warnings
		reportTable = reportTable.sort(function (a, b) {
			return (a.errors !== b.errors) ? b.errors - a.errors : b.warnings - a.warnings;
		});

		// total up the errors/warnings
		reportTable.forEach(function (row) {
			totalErrors += row.errors;
			totalWarnings += row.warnings;
		});

		var renderAsTable = false;
		if (renderAsTable) {
			// render the table
			console.log('Summary of compilation errors and warnings: ');
			console.log(' Page ID  Errors  Warnings');
			console.log(' -------  ------  --------');
			reportTable.forEach(function (row) {
				process.stdout.write(' ' + row.pageId.toString().padEnd(9) + row.errors.toString().padEnd(8) + row.warnings + '\n');
			});
		} else {
			// render summary
			console.log('Compilation completed with ' + totalErrors + ' errors and ' + totalWarnings + ' warnings.');
			var warningsDisplayed = this.showMessage(LOG_ENTRIES.warn.level);
			if ((totalWarnings > 0) && !warningsDisplayed) {
				console.log(' to display warnings, run with --verbose (-v) option.');
			}
		}
	} else {
		console.log('Compilation completed with no errors.');
	}
	console.log();
};

// return an instance of the reported
var reporter = new CompilationReporter();
module.exports = reporter;