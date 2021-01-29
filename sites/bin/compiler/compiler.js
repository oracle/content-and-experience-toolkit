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
 * $Id: offline-publisher.js 141546 2016-03-24 23:23:28Z dpeterso $
 */
// Get the various compilers
var siteCompiler = require('./compilesite'),
	contentCompiler = require('./compilecontent');

// expose the compilers
module.exports = {
	compileSite: siteCompiler.compileSite,
	compileContent: contentCompiler.compileContent
};