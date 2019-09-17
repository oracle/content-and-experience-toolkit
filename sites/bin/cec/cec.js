#!/usr/bin/env node

/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

/* jshint esversion: 6 */

const path = require('path');
const childProcess = require('child_process');
const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const sprintf = require('sprintf-js').sprintf;


/**************************
 * Current directory check
 **************************/

const cwd = path.resolve('./');
// console.log("Current working directory is: " + cwd);

var _getProjectRoot = function () {
	var projectRoot = cwd;
	var isCEC = false;
	while (true) {
		var packageFile = path.join(projectRoot, 'package.json');
		if (fs.existsSync(packageFile)) {
			var packageJSON = JSON.parse(fs.readFileSync(packageFile));
			if (packageJSON && (packageJSON.name === 'cec-sites-toolkit' || packageJSON.name === 'cec-sites-toolkit-source')) {
				isCEC = true;
				break;
			}
		}
		if (projectRoot.indexOf(path.sep) < 0) {
			break;
		}
		// go 1 level up
		projectRoot = projectRoot.substring(0, projectRoot.lastIndexOf(path.sep));
	}
	return (isCEC ? projectRoot : '');
};

var _verifyCECProject = function () {
	var projectRoot = _getProjectRoot();
	// console.log('projectRoot: ' + projectRoot);
	if (projectRoot) {
		if (projectRoot !== cwd) {
			console.log(`${cwd} is not a Content and Experience Cloud project. Run this command from ${projectRoot}`);
			return false;
		} else {
			return true;
		}
	} else {
		console.log(`${cwd} is not a Content and Experience Cloud project. Run command cec install to set up first.`);
		return false;
	}
};

// verify if the current dir is a valid CEC

const cecRoot = __dirname;
const cecRootReal = fs.realpathSync(cecRoot);
//console.log('cecRoot: ' + cecRoot + ' => ' + cecRootReal);

const appRoot = path.join(cecRootReal, '../..');
// console.log('cec Root: ' + appRoot);

/**************************
 * Private helper functions 
 ***************************/

var getComponentSources = function () {
	const seededComponentSources = ['local', 'local-iframe', 'remote', 'sectionlayout', 'Sample-File-List', 'Sample-Folder-List', 'Sample-Documents-Manager',
		'Sample-Process-Start-Form', 'Sample-Process-Task-List', 'Sample-Process-Task-Details', 'Sample-Stocks-Embedded',
		'Sample-Text-With-Image', 'Sample-To-Do'
	];

	let existingComponentSources = fs.readdirSync(path.join(appRoot, 'data', 'components'));
	existingComponentSources = existingComponentSources.filter((item) => /\.zip$/.test(item)).map((zip) => zip.replace('.zip', ''));
	let validComponentSources = [...seededComponentSources];
	existingComponentSources.forEach((source) => {
		if (source !== 'contentlayout' && source !== 'contentlistlayout' && source !== 'contentlistnoqlayout' && !seededComponentSources.includes(source)) {
			validComponentSources.push(source);
		}
	});

	return validComponentSources;
};

var getTemplateSources = function () {
	const seededTemplateSources = ['CafeSupremoLite', 'JETStarterTemplate', 'StarterTemplate'];

	let existingTemplateSources = fs.readdirSync(path.join(appRoot, 'data', 'templates'));
	existingTemplateSources = existingTemplateSources.filter((item) => /\.zip$/.test(item)).map((zip) => zip.replace('.zip', ''));
	let validTemplateSources = [...seededTemplateSources];
	existingTemplateSources.forEach((source) => {
		if (!seededTemplateSources.includes(source)) {
			validTemplateSources.push(source);
		}
	});

	return validTemplateSources;
};

var getSiteMapChangefreqValues = function () {
	const values = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never', 'auto'];
	return values;
};

var getTranslationJobExportTypes = function () {
	const values = ['siteAll', 'siteItems', 'siteAssets'];
	return values;
};

var getSiteActions = function () {
	const actions = ['publish', 'unpublish', 'bring-online', 'take-offline'];
	return actions;
};

var getContentActions = function () {
	const actions = ['publish', 'unpublish', 'remove'];
	return actions;
};

var getComponentActions = function () {
	const actions = ['publish'];
	return actions;
};

var getThemeActions = function () {
	const actions = ['publish'];
	return actions;
};

var getRepositoryActions = function () {
	const actions = ['add-type', 'remove-type', 'add-channel', 'remove-channel'];
	return actions;
};

var getFolderActions = function () {
	const actions = ['share', 'unshare'];
	return actions;
};

var getFolderRoles = function () {
	const roles = ['manager', 'contributor', 'downloader', 'viewer'];
	return roles;
};

var getResourceRoles = function () {
	const roles = ['manager', 'contributor', 'viewer'];
	return roles;
};

var getServerTypes = function () {
	const roles = ['pod_ec', 'dev_ec', 'dev_osso'];
	return roles;
};

var getSiteSignIn = function () {
	const roles = ['yes', 'no'];
	return roles;
};

var getSiteAccessNames = function () {
	var names = ['Cloud users', 'Visitors', 'Service users', 'Specific users'];
	return names;
};

/*********************
 * Command definitions
 **********************/

const createComponent = {
	command: 'create-component <name>',
	alias: 'cc',
	name: 'create-component',
	usage: {
		'short': 'Creates the component <name>.',
		'long': (function () {
			let desc = 'Creates the component <name>. By default, it creates a local component. Optionally specify -f <source> to create from a different source.\n\nValid values for <source> are: \n';

			return getComponentSources().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	examples: [
		['cec create-component Comp1'],
		['cec create-component Comp2 -f Sample-File-List']
	]
};

const copyComponent = {
	command: 'copy-component <source> [<destination>]',
	alias: 'cpc',
	name: 'copy-component',
	usage: {
		'short': 'Copies an existing component named <source> to <destination>.',
		'long': (function () {
			let desc = 'Copies an existing component named <source> to <destination>. <source> is a folder name from src/components';
			return desc;
		})()
	},
	example: ['cec copy-component Sample-To-Do Comp1', 'Copies Sample-To-Do to Comp1.']
};

const createContentLayout = {
	command: 'create-contentlayout <name>',
	alias: 'ccl',
	name: 'create-contentlayout',
	usage: {
		'short': 'Creates a content layout based on a content type.',
		'long': (function () {
			let desc = 'Creates a content layout based on a content type from a local template or from CEC server. By default, an "overview" content layout is created. Optionally specify -s <style> to create in a different style. ' +
				os.EOL + os.EOL + 'Valid values for <style> are: ' + os.EOL +
				'  detail' + os.EOL +
				'  overview' + os.EOL;
			return desc;
		})()
	},
	example: [
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate'],
		['cec create-contentlayout Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -s detail'],
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -r', 'Use content type Blog-Post from the server specified in cec.properties file'],
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -r UAT -s detail', 'Use content type Blog-Post from the registered server UAT']
	]
};


const importComponent = {
	command: 'import-component <zip>',
	alias: 'ic',
	name: 'import-component',
	usage: {
		'short': 'Imports a component from <zip>.',
		'long': (function () {
			let desc = 'Imports a component from <zip>. Specify the absolute path of the zip file. The zip file name will be used as the component name.';
			return desc;
		})()
	},
	example: ['cec import-component /home/Comp1.zip', 'Imports the component Comp1.']
};

const exportComponent = {
	command: 'export-component <name>',
	alias: 'ec',
	name: 'export-component',
	usage: {
		'short': 'Exports the component <name> as a zip file.',
		'long': (function () {
			let desc = 'Exports the component <name> as a zip file.';
			return desc;
		})()
	},
	example: ['cec export-component Sample-To-Do', 'Exports the component Sample-To-Do.']
};

const downloadComponent = {
	command: 'download-component <names>',
	alias: 'dlcp',
	name: 'download-component',
	usage: {
		'short': 'Downloads the components <names> from the CEC server.',
		'long': (function () {
			let desc = 'Downloads the components <names> from the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec download-component Sample-To-Do'],
		['cec download-component Sample-To-Do,Sample-To-Do2'],
		['cec download-component Sample-To-Do -s UAT']
	]
};

const deployComponent = {
	command: 'deploy-component <names>',
	alias: 'dc',
	name: 'deploy-component',
	usage: {
		'short': 'Deploys the components <names> to the CEC server.',
		'long': (function () {
			let desc = 'Deploys the components <names> to the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to publish the component after deploy. Optionally specify -f <folder> to set the folder to upload the component zip file.';
			return desc;
		})()
	},
	example: [
		['cec deploy-component Sample-To-Do', 'Deploys the component Sample-To-Do to the server specified in cec.properties.'],
		['cec deploy-component Sample-To-Do -s UAT', 'Deploys the component Sample-To-Do to the registered server UAT.'],
		['cec deploy-component Sample-To-Do -p', 'Deploys and publishes the component Sample-To-Do.'],
		['cec deploy-component Sample-To-Do,Sample-To-Do2', 'Deploys component Sample-To-Do and Sample-To-Do2.'],
		['cec deploy-component Sample-To-Do -f Import/Components', 'Uploads file Sample-To-Do.zip to folder Import/Components and imports the component Sample-To-Do.'],
	]
};
const uploadComponent = {
	command: 'upload-component <names>',
	alias: 'ulcp',
	name: 'upload-component',
	usage: {
		'short': 'Uploads the components <names> to the CEC server.',
		'long': (function () {
			let desc = 'Uploads the components <names> to the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to publish the component after deploy. Optionally specify -f <folder> to set the folder to upload the component zip file.';
			return desc;
		})()
	},
	example: [
		['cec upload-component Sample-To-Do', 'Uploads the component Sample-To-Do to the server specified in cec.properties.'],
		['cec upload-component Sample-To-Do -s UAT', 'Uploads the component Sample-To-Do to the registered server UAT.'],
		['cec upload-component Sample-To-Do -p', 'Uploads and publishes the component Sample-To-Do.'],
		['cec upload-component Sample-To-Do,Sample-To-Do2', 'Uploads component Sample-To-Do and Sample-To-Do2.'],
		['cec upload-component Sample-To-Do -f Import/Components', 'Uploads file Sample-To-Do.zip to folder Import/Components and imports the component Sample-To-Do.'],
	]
};

const controlComponent = {
	command: 'control-component <action>',
	alias: 'ctcp',
	name: 'control-component',
	usage: {
		'short': 'Performs action <action> on components on CEC server.',
		'long': (function () {
			let desc = 'Perform <action> on components on CEC server. Specify the components with -c <components>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getComponentActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-component publish -c Comp1', 'Publish component Comp1 on the server specified in cec.properties file'],
		['cec control-component publish -c Comp1 -s UAT', 'Publish component Comp1 on the registered server UAT'],
		['cec control-component publish -c Comp1,Comp2 -s UAT', 'Publish component Comp1 and Comp2 on the registered server UAT']
	]
};

const createTemplate = {
	command: 'create-template <name>',
	alias: 'ct',
	name: 'create-template',
	usage: {
		'short': 'Creates the template <name>.',
		'long': (function () {
			let desc = 'Creates the template <name>. By default, it creates a StarterTemplate. Optionally specify -f <source> to create from different source.\n\nValid values for <source> are: \n';
			return getTemplateSources().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-template Temp1'],
		['cec create-template Temp2 -f CafeSupremoLite']
	]
};

const copyTemplate = {
	command: 'copy-template <source> [<destination>]',
	alias: 'cpt',
	name: 'copy-template',
	usage: {
		'short': 'Copies an existing template named <source> to <destination>.',
		'long': (function () {
			let desc = 'Copies an existing template named <source> to <destination>. <source> is a folder name from src/templates';
			return desc;
		})()
	},
	example: ['cec copy-template Temp1 Temp2', 'Copies Temp1 to Temp2.']
};

const importTemplate = {
	command: 'import-template <zip>',
	alias: 'it',
	name: 'import-template',
	usage: {
		'short': 'Imports a template from <zip>.',
		'long': (function () {
			let desc = 'Imports a template from <zip>. Specify the absolute path of the zip file. The zip file name will be used as the template name.';
			return desc;
		})()
	},
	example: ['cec import-template /home/Temp1.zip', 'Imports the template Temp1.']
};

const exportTemplate = {
	command: 'export-template <name>',
	alias: 'et',
	name: 'export-template',
	usage: {
		'short': 'Exports the template <name> as a zip file.',
		'long': (function () {
			let desc = 'Exports the template <name> as a zip file and provides the location of the zip file.';
			return desc;
		})()
	},
	example: ['cec export-template Temp1', 'Exports the template Temp1.']
};


const deployTemplate = {
	command: 'deploy-template <name>',
	alias: 'dt',
	name: 'deploy-template',
	usage: {
		'short': 'Deploys the template <name> to the CEC server.',
		'long': (function () {
			let desc = 'Deploys the template <name> to the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -f <folder> to set the folder to upload the template zip file.';
			return desc;
		})()
	},
	example: [
		['cec deploy-template StarterTemplate', 'Deploys the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -s UAT', 'Deploys the template StarterTemplate to the registered server UAT.'],
		['cec deploy-template StarterTemplate -f Import/Templates', 'Uploads file StarterTemplate.zip to folder Import/Templates and imports the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -o', 'Optimizes and deploys the template StarterTemplate.'],
		['cec upload-template StarterTemplate -x', 'Exclude the "Content Template" from the template upload. "Content Template" upload can be managed independently.']
	]
};

const uploadTemplate = {
	command: 'upload-template <name>',
	alias: 'ult',
	name: 'upload-template',
	usage: {
		'short': 'Uploads the template <name> to the CEC server.',
		'long': (function () {
			let desc = 'Uploads the template <name> to the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -f <folder> to set the folder to upload the template zip file.';
			return desc;
		})()
	},
	example: [
		['cec upload-template StarterTemplate', 'Uploads the template StarterTemplate.'],
		['cec upload-template StarterTemplate -s UAT', 'Uploads the template StarterTemplate to the registered server UAT.'],
		['cec upload-template StarterTemplate -f Import/Templates', 'Uploads file StarterTemplate.zip to folder Import/Templates and imports the template StarterTemplate.'],
		['cec upload-template StarterTemplate -o', 'Optimizes and uploads the template StarterTemplate.'],
		['cec upload-template StarterTemplate -x', 'Exclude the "Content Template" from the template upload. "Content Template" upload can be managed independently.']
	]
};

const describeTemplate = {
	command: 'describe-template <name>',
	alias: 'dst',
	name: 'describe-template',
	usage: {
		'short': 'Describes the template <name> package.',
		'long': (function () {
			let desc = 'Describes the template <name> package such as theme, components and content types.';
			return desc;
		})()
	},
	example: ['cec describe-template StarterTemplate', 'Describes the template StarterTemplate package']
};

const createTemplateFromSite = {
	command: 'create-template-from-site <name>',
	alias: 'ctfs',
	name: 'create-template-from-site',
	usage: {
		'short': 'Creates the template <name> from site <site> on the CEC server.',
		'long': (function () {
			let desc = 'Creates the template <name> from site <site> on the Content and Experience Cloud server. Specify the server with -r <server> or use the one specified in cec.properties file. Optionally specify <includeunpublishedassets> to include unpublished content items and digital assets in your template.';
			return desc;
		})()
	},
	example: [
		['cec create-template-from-site BlogTemplate -s BlogSite'],
		['cec create-template-from-site BlogTemplate -s BlogSite -r UAT'],
		['cec create-template-from-site BlogTemplate -s BlogSite -i -r UAT']
	]
};

const downloadTemplate = {
	command: 'download-template <name>',
	alias: 'dlt',
	name: 'download-template',
	usage: {
		'short': 'Downloads the template <name> from the CEC server.',
		'long': (function () {
			let desc = 'Downloads the template <name> from the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec download-template BlogTemplate'],
		['cec download-template BlogTemplate -s UAT']
	]
};

const compileTemplate = {
	command: 'compile-template <source>',
	alias: 'cmpt',
	name: 'compile-template',
	debugName: 'compile-template-debug',
	usage: {
		'short': 'Compiles the site within the template.',
		'long': (function () {
			let desc = 'Compiles all the pages within the site of the template and places the compiled pages under the sites assets folder.\n' +
				'Optionally specify -s <server> to make content queries against this server (requires channelToken).\n' +
				'Optionally specify -c <channelToken> to use this channelToken when generating any content URLs.\n' +
				'Optionally specify -t <contentType> [draft | published] content to retrieve from the server type, defaults to published.\n' +
				'Optionally specify -p <pages> the set of pages to compile.\n' +
				'Optionally specify -r recurse through all child pages of specified pages.';
			return desc;
		})()
	},
	example: [
		['cec compile-template Temp1', 'Compiles the site in template Temp1 using content stored in the template.'],
		['cec compile-template Temp1 -c channelToken', 'Compiles the site in template Temp1 using the given channelToken for any content URLs.'],
		['cec compile-template Temp1 -c channelToken -s UAT -t draft', 'Compiles the site in template Temp1 retrieving draft content from the specified server.'],
		['cec compile-template Temp1 -p 104,112,183 -r', 'Compiles the specified pages in the site in template Temp1 including all child pages.'],
		['cec compile-template Temp1 -d', 'Waits for the debugger to be attached.  Once attached, compiles the site in template Temp1.']
	]
};


const deleteTemplate = {
	command: 'delete-template <name>',
	alias: '',
	name: 'delete-template',
	usage: {
		'short': 'Deletes the template <name> on the CEC server.',
		'long': (function () {
			let desc = 'Deletes the template <name> on the Content and Experience Cloud server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to permanently delete the template.';
			return desc;
		})()
	},
	example: [
		['cec delete-template BlogTemplate'],
		['cec delete-template BlogTemplate -p'],
		['cec delete-template BlogTemplate -s UAT']
	]
};

const listServerContentTypes = {
	command: 'list-server-content-types',
	alias: 'lsct',
	name: 'list-server-content-types',
	usage: {
		'short': 'Lists all content types from server.',
		'long': (function () {
			let desc = 'Lists all content types from server.';
			return desc;
		})()
	},
	example: [
		['cec list-server-content-types'],
		['cec list-server-content-types -s UAT'],
	]
};

const addContentLayoutMapping = {
	command: 'add-contentlayout-mapping <contentlayout>',
	alias: 'aclm',
	name: 'add-contentlayout-mapping',
	usage: {
		'short': 'Creates content type and content layout mapping for local template.',
		'long': (function () {
			let desc = 'Creates content type and content layout mapping for a local template. By default, the mapping is set for "Default". Optionally specify -s <layoutstyle> to name the mapping. By default, the mapping is set for desktop. Optionally specify -m to set the mapping for mobile.';
			return desc;
		})()
	},
	example: [
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate'],
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -m'],
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -s Details'],
		['cec add-contentlayout-mapping Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate -s "Content List Default"'],
		['cec add-contentlayout-mapping Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate -s Overview']
	]
};

const removeContentLayoutMapping = {
	command: 'remove-contentlayout-mapping <contentlayout>',
	alias: 'rclm',
	name: 'remove-contentlayout-mapping',
	usage: {
		'short': 'Removes a content layout mapping from a local template.',
		'long': (function () {
			let desc = 'Removes a content layout mapping from a local template. By default, all mappings for the content layout are removed. Optionally specify -s <layoutstyle> to name the mapping and -m to indicate the mobile mapping.';
			return desc;
		})()
	},
	example: [
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate -m']
	]
};

const downloadContent = {
	command: 'download-content <channel>',
	alias: 'dlc',
	name: 'download-content',
	usage: {
		'short': 'Downloads content in channel <channel> from CEC server.',
		'long': (function () {
			let desc = 'Downloads content in channel <channel> from CEC server. By default all assets are downloaded, optionally specify -p to download only published assets. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec download-content Site1Channel', 'Download all assets in channel Site1Channel'],
		['cec download-content Site1Channel -p', 'Download published assets in channel Site1Channel'],
		['cec download-content Site1Channel -s UAT', 'Download all assets in channel Site1Channel on server UAT'],
		['cec download-content Site1Channel -a GUID1,GUID2', 'Download asset GUID1 and GUID2 and all their dependencies in chanel Site1Channel']
	]
};

const uploadContent = {
	command: 'upload-content <name>',
	alias: 'ulc',
	name: 'upload-content',
	usage: {
		'short': 'Uploads local content to a repository on CEC server.',
		'long': (function () {
			let desc = 'Uploads local content from channel <name>, template <name> or local file <name> to repository <repository> on CEC server. Specify -c <channel> to add the template content to channel. Optionally specify specify -l <collection> to add the content to collection. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec upload-content Site1Channel -r Repo1', 'Upload content to repository Repo1, creating new items, and add to channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -u', 'Upload content to repository Repo1, updating existing content to create new versions, and add to channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -l Site1Collection', 'Upload content to repository Repo1 and add to collection Site1Collection and channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -s UAT', 'Upload content to repository Repo1 on server UAT and add to channel Site1Channel'],
		['cec upload-content Template1 -t -r Repo1 -c channel1', 'Upload content from template Template1 to repository Repo1 and add to channel channel1'],
		['cec upload-content ~/Downloads/content.zip -f -r Repo1 -c channel1', 'Upload content from file ~/Downloads/content.zip to repository Repo1 and add to channel channel1']
	]
};

const controlContent = {
	command: 'control-content <action>',
	alias: 'ctct',
	name: 'control-content',
	usage: {
		'short': 'Performs action <action> on channel items on CEC server.',
		'long': (function () {
			let desc = 'Performs action <action> on channel items on CEC server. Specify the channel with -c <channel>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getContentActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-content publish -c Channel1', 'Publish all items in channel Channel1 on the server specified in cec.properties file'],
		['cec control-content publish -c Channel1 -s UAT', 'Publish all items in channel Channel1 on the registered server UAT'],
		['cec control-content unpublish -c Channel1 -s UAT', 'Unpublish all items in channel Channel1 on the registered server UAT'],
		['cec control-content remove -c Channel1 -s UAT', 'Remove all items in channel Channel1 on the registered server UAT']
	]
};

const addComponentToTheme = {
	command: 'add-component-to-theme <component>',
	alias: 'actt',
	name: 'add-component-to-theme',
	usage: {
		'short': 'Adds a component to a theme.',
		'long': (function () {
			let desc = 'Adds a component to a theme. Optionally specify -c <category> to set the component category.';
			return desc;
		})()
	},
	example: [
		['cec add-component-to-theme Sample-To-Do -t BlogTheme'],
		['cec add-component-to-theme Sample-To-Do -t BlogTheme -c Samples']
	]
};

const removeComponentFromTheme = {
	command: 'remove-component-from-theme <component>',
	alias: 'rcft',
	name: 'remove-component-from-theme',
	usage: {
		'short': 'Removes a component from a theme.',
		'long': (function () {
			let desc = 'Removes a component from a theme.';
			return desc;
		})()
	},
	example: [
		['cec remove-component-from-theme Sample-To-Do -t BlogTheme']
	]
};

const controlTheme = {
	command: 'control-theme <action>',
	alias: 'ctt',
	name: 'control-theme',
	usage: {
		'short': 'Performs action <action> on theme on CEC server.',
		'long': (function () {
			let desc = 'Perform <action> on theme on CEC server. Specify the theme with -t <theme>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getThemeActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-theme publish -t Theme1', 'Publish theme Theme1 on the server specified in cec.properties file'],
		['cec control-theme publish -t Theme1 -s UAT', 'Publish theme Theme1 on the registered server UAT']
	]
};

const listResources = {
	command: 'list',
	alias: 'l',
	name: 'list',
	usage: {
		'short': 'Lists local or server resources.',
		'long': (function () {
			let desc = 'Lists local or server resources such components and templates. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -t <types> to list specific types of resources on the CEC server. ' +
				os.EOL + os.EOL + 'Valid values for <types> on the server are: ' + os.EOL +
				'  channels' + os.EOL +
				'  components' + os.EOL +
				'  localizationpolicies' + os.EOL +
				'  repositories' + os.EOL +
				'  sites' + os.EOL +
				'  templates' + os.EOL;
			return desc;
		})()
	},
	example: [
		['cec list', 'List all local resources'],
		['cec list -s', 'List resources on the server specified in cec.properties file'],
		['cec list -t components,channels -s', 'List components and channels on the server specified in cec.properties file'],
		['cec list -t components,channels -s UAT', 'List components and channels on the registered server UAT']
	]
};

const createSite = {
	command: 'create-site <name>',
	alias: 'cs',
	name: 'create-site',
	usage: {
		'short': 'Creates Enterprise Site <name>.',
		'long': (function () {
			let desc = 'Create Enterprise Site on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec create-site Site1 -t StandardTemplate', 'Creates a standard site'],
		['cec create-site Site1 -t Template1 -r Repository1 -l LocalizationPolicy1 -d en-US', 'Creates an enterprise site with localization policy LocalizationPolicy1'],
		['cec create-site Site1 -t Template1 -r Repository1 -d en-US', 'Creates an enterprise site and uses the localization policy in Template1'],
		['cec create-site Site1 -t Template1 -r Repository1 -d en-US -s UAT', 'Creates an enterprise site on server UAT']
	]
};

const controlSite = {
	command: 'control-site <action>',
	alias: 'cts',
	name: 'control-site',
	usage: {
		'short': 'Performs action <action> on site on CEC server.',
		'long': (function () {
			let desc = 'Perform <action> on site on CEC server. Specify the site with -s <site>. Specify the server with -r <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getSiteActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-site publish -s Site1', 'Publish site Site1 on the server specified in cec.properties file'],
		['cec control-site publish -s Site1 -r UAT', 'Publish site Site1 on the registered server UAT'],
		['cec control-site unpublish -s Site1 -r UAT', 'Unpublish site Site1 on the registered server UAT'],
		['cec control-site bring-online -s Site1 -r UAT', 'Bring site Site1 online on the registered server UAT'],
		['cec control-site take-offline -s Site1 -r UAT', 'Take site Site1 offline on the registered server UAT']
	]
};

const shareSite = {
	command: 'share-site <name>',
	alias: 'ss',
	name: 'share-site',
	usage: {
		'short': 'Share site with users on CEC server.',
		'long': (function () {
			let desc = 'Share site with users on CEC server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-site Site1 -u user1,user2 -r manager', 'Share site Site1 with user user1 and user2 and assign Manager role to them'],
		['cec share-site Site1 -u user1,user2 -r manager -s UAT', 'Share site Site1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareSite = {
	command: 'unshare-site <name>',
	alias: 'uss',
	name: 'unshare-site',
	usage: {
		'short': 'Delete the user\'s access to a site on CEC server.',
		'long': (function () {
			let desc = 'Delete the user\'s access to a site on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-site Site1 -u user1,user2'],
		['cec unshare-site Site1 -u user1,user2 -s UAT']
	]
};

const setSiteSecurity = {
	command: 'set-site-security <name>',
	alias: 'sss',
	name: 'set-site-security',
	usage: {
		'short': 'Set site security on CEC server.',
		'long': (function () {
			let desc = 'Make the site publicly available to anyone, restrict the site to registered users, or restrict the site to specific users.  ' +
				'Specify the server with -r <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -a <access> to set who can access the site. ' +
				'The valid group names are\n\n';
			return getSiteAccessNames().reduce((acc, item) => acc + '  ' + item + '\n', desc);
			return desc;
		})()
	},
	example: [
		['cec set-site-security Site1 -s no', 'make the site publicly available to anyone'],
		['cec set-site-security Site1 -s no -r UAT', 'make the site publicly available to anyone on server UAT'],
		['cec set-site-security Site1 -s yes', 'Require everyone to sign in to access this site and any authenticated user can access'],
		['cec set-site-security Site1 -s yes -a "Visitors,Service users"', 'Require everyone to sign in to access this site and all service visitors and users can access'],
		['cec set-site-security Site1 -s yes -a "Specific users" -u user1,user2', 'Require everyone to sign in to access this site and only user1 and user2 can access'],
		['cec set-site-security Site1 -s yes -d user1', 'Remove user1\'s access from the site']
	]
};

const validateSite = {
	command: 'validate-site <name>',
	alias: 'vs',
	name: 'validate-site',
	usage: {
		'short': 'Validates site <name>.',
		'long': (function () {
			let desc = 'Validates site <name> on CEC server before publish or view publishing failure. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec validate-site Site1', 'Validate site Site1 on the server specified in cec.properties file'],
		['cec validate-site Site1 -s UAT', 'Validate site Site1 on the registered server UAT']
	]
};

const updateSite = {
	command: 'update-site <name>',
	alias: 'us',
	name: 'update-site',
	usage: {
		'short': 'Update Enterprise Site <name>.',
		'long': (function () {
			let desc = 'Update Enterprise Site on CEC server using the content from the template. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec update-site Site1 -t Template1', 'Updates a site using the content from the template']
	]
};


const indexSite = {
	command: 'index-site <site>',
	alias: 'is',
	name: 'index-site',
	usage: {
		'short': 'Index the page content of site <site> on CEC server.',
		'long': (function () {
			let desc = 'Creates content item for each page with all text on the page. If the page index content item already exists for a page, updated it with latest text on the page. Specify -c <contenttype> to set the page index content type. Optionally specify -p to publish the page index items after creation or update. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec index-site Site1 -c PageIndex'],
		['cec index-site Site1 -c PageIndex -p'],
		['cec index-site Site1 -c PageIndex -s UAT']
	]
};

const createSiteMap = {
	command: 'create-site-map <site>',
	alias: 'csm',
	name: 'create-site-map',
	usage: {
		'short': 'Creates a site map for site <site> on CEC server.',
		'long': (function () {
			let desc = 'Creates a site map for site on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -p to upload the site map to CEC server after creation. ' +
				'Optionally specify -c <changefreq> to define how frequently the page is likely to change. ' +
				'Optionally specify -t <toppagepriority> as the priority for the top level pages. ' +
				'Also optionally specify <file> as the file name for the site map.\n\nThe valid values for <changefreq> are:\n\n';
			return getSiteMapChangefreqValues().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-site-map Site1 -u http://www.example.com/site1'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -s UAT'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -t 0.9'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -f sitemap.xml'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -p'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -c weekly -p'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -l de-DE,it-IT']
	]
};

const createRSSFeed = {
	command: 'create-rss-feed <site>',
	alias: 'crf',
	name: 'create-rss-feed',
	usage: {
		'short': 'Creates RSS feed for site <site> on CEC server.',
		'long': (function () {
			let desc = 'Creates RSS feed for site <site> on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -x <template> to specify the RSS template. Optionally specify -p to upload the RSS feed to CEC server after creation.';
			return desc;
		})()
	},
	example: [
		['cec create-rss-feed Site1 -u http://www.example.com/site1 -q \'type eq "BlogType"\' -l 10 -o name:asc -t "Blog RSS"'],
		['cec create-rss-feed Site1 -u http://www.example.com/site1 -q \'type eq "BlogType"\' -l 10 -o name:asc -t "Blog RSS" -x ~/Files/RSSTemplate.xml'],
		['cec create-rss-feed Site1 -u http://www.example.com/site1 -q \'type eq "BlogType"\' -l 10 -o name:asc -t "Blog RSS" -x ~/Files/RSSTemplate.xml -i fr-FR -f rssfrFR.xml']
	]
};

const createAssetReport = {
	command: 'create-asset-report <site>',
	alias: 'car',
	name: 'create-asset-report',
	usage: {
		'short': 'Generate an asset usage report for site <site> on CEC server.',
		'long': (function () {
			let desc = 'Generate an asset usage report for site <site> on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -o to save the report to a json file.';
			return desc;
		})()
	},
	example: [
		['cec create-asset-report Site1'],
		['cec create-asset-report Site1 -s UAT'],
		['cec create-asset-report Site1 -o', 'The report will be saved to Site1AssetUsage.json at the current local location'],
		['cec create-asset-report Site1 -o ~/Documents', 'The report will be saved to ~/Documents/Site1AssetUsage.json'],
		['cec create-asset-report Site1 -o ~/Documents/Site1Report.json', 'The report will be saved to ~/Documents/Site1Report.json']
	]
};

const createRepository = {
	command: 'create-repository <name>',
	alias: 'cr',
	name: 'create-repository',
	usage: {
		'short': 'Creates a repository on CEC server.',
		'long': (function () {
			let desc = 'Creates a repository on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -d <description> to set the description. ' +
				'Optionally specify -t <contenttypes> to set the content types. ' +
				'Optionally specify -c <channels> to set the publishing channels. ' +
				'Optionally specify -l <defaultlanguage> to set the default language.'
			return desc;
		})()
	},
	example: [
		['cec create-repository Repo1'],
		['cec create-repository Repo1 -d "Blog Repository" -t BlogType,AuthorType -c channel1,channel2 -l en-US -s UAT']
	]
};

const controlRepository = {
	command: 'control-repository <action>',
	alias: 'ctr',
	name: 'control-repository',
	usage: {
		'short': 'Performs action <action> on repository on CEC server.',
		'long': (function () {
			let desc = 'Performs action <action> on repository on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid actions are\n\n';
			return getRepositoryActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-repository add-type -r Repo1 -t Blog,Author'],
		['cec control-repository add-type -r Repo1 -t Blog,Author -s UAT'],
		['cec control-repository remove-type -r Repo1 -t Blog,Author'],
		['cec control-repository add-channel -r Repo1 -c channel1,channel2'],
		['cec control-repository remove-channel -r Repo1 -c channel1,channel2']
	]
};

const shareRepository = {
	command: 'share-repository <name>',
	alias: 'sr',
	name: 'share-repository',
	usage: {
		'short': 'Share repository with users on CEC server.',
		'long': (function () {
			let desc = 'Share repository with users on CEC server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t to also share the content types in the repository with the users. ' +
				'Optionally specify -y <typerole> to share the types with different role. ' +
				'The valid roles are\n\n';
			return getResourceRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-repository Repo1 -u user1,user2 -r manager', 'Share repository Repo1 with user user1 and user2 and assign Manager role to them'],
		['cec share-repository Repo1 -u user1,user2 -r manager -s UAT', 'Share repository Repo1 with user user1 and user2 and assign Manager role to them on the registered server UAT'],
		['cec share-repository Repo1 -u user1,user2 -r manager -t', 'Share repository Repo1 and all the types in Repo1 with user user1 and user2 and assign Manager role to them'],
		['cec share-repository Repo1 -u user1,user2 -r manager -t -y contributor', 'Share repository Repo1 with user user1 and user2 and assign Manager role to them, share all types in  Repo1 with user user1 and user2 and assign Contributor role to them']
	]
};

const unshareRepository = {
	command: 'unshare-repository <name>',
	alias: 'usr',
	name: 'unshare-repository',
	usage: {
		'short': 'Delete the user\'s access to a repository on CEC server.',
		'long': (function () {
			let desc = 'Delete the user\'s access to a repository on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t to also delete the user\'s access to the content types in the repository.'
			return desc;
		})()
	},
	example: [
		['cec unshare-repository Repo1 -u user1,user2 '],
		['cec unshare-repository Repo1 -u user1,user2 -s UAT'],
		['cec unshare-repository Repo1 -u user1,user2 -t']
	]
};

const shareType = {
	command: 'share-type <name>',
	alias: 'st',
	name: 'share-type',
	usage: {
		'short': 'Share type with users on CEC server.',
		'long': (function () {
			let desc = 'Share type with users on CEC server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getResourceRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-type BlogType -u user1,user2 -r manager', 'Share type BlogType with user user1 and user2 and assign Manager role to them'],
		['cec share-type BlogType -u user1,user2 -r manager -s UAT', 'Share type BlogType with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareType = {
	command: 'unshare-type <name>',
	alias: 'ust',
	name: 'unshare-type',
	usage: {
		'short': 'Delete the user\'s access to a type on CEC server.',
		'long': (function () {
			let desc = 'Delete the user\'s access to a type on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-type BlogType -u user1,user2 '],
		['cec unshare-type BlogType -u user1,user2 -s UAT']
	]
};
const createChannel = {
	command: 'create-channel <name>',
	alias: 'cch',
	name: 'create-channel',
	usage: {
		'short': 'Creates a channel on CEC server.',
		'long': (function () {
			let desc = 'Creates a channel on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t <type> to set the channel type [public | secure], defaults to public. ' +
				'Optionally specify -p <publishpolicy> to set the publish policy [anythingPublished | onlyApproved], defaults to anythingPublished. ' +
				'Optionally specify -l <localizationpolicy> to set the localization policy.'
			return desc;
		})()
	},
	example: [
		['cec create-channel channel1', 'Create public channel channel1 and everything can be published'],
		['cec create-channel channel1 -s UAT', 'On registered server UAT, reate public channel channel1 and everything can be published'],
		['cec create-channel channel1 -l en-fr', 'Create public channel channel1 with localization policy en-fr and everything can be published'],
		['cec create-channel channel1 -t secure -p onlyApproved', 'Create secure channel channel1 and only approved items can be published']
	]
};

const createLocalizationPolicy = {
	command: 'create-localization-policy <name>',
	alias: 'clp',
	name: 'create-localization-policy',
	usage: {
		'short': 'Creates a localization policy on CEC server.',
		'long': (function () {
			let desc = 'Creates a localization policy on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Specify -r <requiredlanguages> to set the required languages. ' +
				'Specify -l <defaultlanguage> to set the default language.' +
				'Optionally specify -o <optionallanguages> to set the optional languages. ' +
				'Optionally specify -d <description> to set the description. ';
			return desc;
		})()
	},
	example: [
		['cec create-localization-policy en-us -r en-US -l en-US'],
		['cec create-localization-policy en-fr -r en-US,fr-FR -l en-US'],
		['cec create-localization-policy multi -r en-US,fr-FR -l en-US -o zh-CN -d "Policy for Blog" -s UAT']

	]
};

const listTranslationJobs = {
	command: 'list-translation-jobs',
	alias: 'ltj',
	name: 'list-translation-jobs',
	usage: {
		'short': 'Lists translation jobs.',
		'long': (function () {
			let desc = 'Lists translation jobs from local or from CEC server.';
			return desc;
		})()
	},
	example: [
		['cec list-translation-jobs', 'Lists local translation jobs'],
		['cec list-translation-jobs -s', 'Lists translation jobs on the server specified in cec.properties file'],
		['cec list-translation-jobs -s UAT', 'Lists translation jobs on the registered server UAT']
	]
};

const createTranslationJob = {
	command: 'create-translation-job <name>',
	alias: 'ctj',
	name: 'create-translation-job',
	usage: {
		'short': 'Creates a translation job <name> for a site on CEC server.',
		'long': (function () {
			let desc = 'Creates a translation job <name> for a site on CEC server. Specify the server with -r <server> or use the one specified in cec.properties file. Specify -l <languages> to set the target languages, use "all" to select all languages from the translation policy. Optionally specify -t <type> to set the content type. The valid values for <type> are:\n\n';
			return getTranslationJobExportTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-translation-job job1 -s Site1 -l all'],
		['cec create-translation-job job1 -s Site1 -l all -r UAT'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT, -t siteItems']
	]
};

const downloadTranslationJob = {
	command: 'download-translation-job <name>',
	alias: 'dtj',
	name: 'download-translation-job',
	usage: {
		'short': 'Downloads translation job <name> from CEC server.',
		'long': (function () {
			let desc = 'Downloads translation job <name> from CEC server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec download-translation-job Site1Job'],
		['cec download-translation-job Site1Job -s UAT']
	]
};

const uploadTranslationJob = {
	command: 'upload-translation-job <name>',
	alias: 'utj',
	name: 'upload-translation-job',
	usage: {
		'short': 'Uploads translation job <name> to CEC server.',
		'long': (function () {
			let desc = 'Uploads translation <name> to CEC server, validate and then ingest the translations. Optionally specify -v to validate only. Optionally specify -f <folder> to set the folder to upload the translation zip file. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec upload-translation-job Site1Job', 'File will be uploaded to the Home folder.'],
		['cec upload-translation-job Site1Job -s UAT', 'File will be uploaded to the Home folder on registered server UAT'],
		['cec upload-translation-job Site1Job -f Import/TranslationJobs', 'File will be uploaded to folder Import/TranslationJobs.'],
		['cec upload-translation-job Site1Job -v', 'Validate the translation job without import.']
	]
};

const submitTranslationJob = {
	command: 'submit-translation-job <name>',
	alias: 'stj',
	name: 'submit-translation-job',
	usage: {
		'short': 'Submits translation job <name> to translation connection <connection>.',
		'long': (function () {
			let desc = 'Submits translation job <name> to translation connection <connection>.';
			return desc;
		})()
	},
	example: [
		['cec submit-translation-job Site1Job1 -c connector1-auto']
	]
};

const ingestTranslationJob = {
	command: 'ingest-translation-job <name>',
	alias: 'itj',
	name: 'ingest-translation-job',
	usage: {
		'short': 'Gets translated job <name> from translation connection and ingest.',
		'long': (function () {
			let desc = 'Gets translated job <name> from translation connection and ingest.';
			return desc;
		})()
	},
	example: [
		['cec ingest-translation-job Site1Job1']
	]
};

const createTranslationConnector = {
	command: 'create-translation-connector <name>',
	alias: 'ctc',
	name: 'create-translation-connector',
	usage: {
		'short': 'Creates translation connector <name>.',
		'long': (function () {
			let desc = 'Creates translation connector <name>.';
			return desc;
		})()
	},
	example: [
		['cec create-translation-connector connector1']
	]
};

const startTranslationConnector = {
	command: 'start-translation-connector <name>',
	alias: 'stc',
	name: 'start-translation-connector',
	usage: {
		'short': 'Starts translation connector <name>.',
		'long': (function () {
			let desc = 'Starts translation connector <name>. Optionally specify -p <port> to set the port, default port is 8084.';
			return desc;
		})()
	},
	example: [
		['cec start-translation-connector connector1'],
		['cec start-translation-connector connector1 -p 7777'],
		['cec start-translation-connector connector1 -d', 'Start the translation connector server with "--inspect" option to allow debugger to be attached.']
	]
};

const registerTranslationConnector = {
	command: 'register-translation-connector <name>',
	alias: 'rtc',
	name: 'register-translation-connector',
	usage: {
		'short': 'Registers a translation connector.',
		'long': (function () {
			let desc = 'Registers a translation connector. Specify -c <connector> for the connector. Specify -s <server> for the connector server URL. Specify -u <user> and -p <password> for connecting to the server. Specify -f <fields> for custom fields.';
			return desc;
		})()
	},
	example: [
		['cec register-translation-connector connector1-auto -c connector1 -s http://localhost:8084/connector/rest/api -u admin -p Welcome1 -f "X-CEC-BearerToken:Bearer token1,X-CEC-WorkflowId:machine-workflow-id"']
	]
};

const createFolder = {
	command: 'create-folder <name>',
	alias: 'cfd',
	name: 'create-folder',
	usage: {
		'short': 'Creates a folder or folder hierarchy on CEC server.',
		'long': (function () {
			let desc = 'Create a folder or folder hierarchy on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec create-folder Projects', 'Creates folder Projects under the Home folder'],
		['cec create-folder Projects/Blogs', 'Creates folder Projects under the Home folder and folder Blogs under Projects'],
		['cec create-folder Projects -s UAT', 'Creates folder Projects under the Home folder on the registered server UAT']
	]
};

const shareFolder = {
	command: 'share-folder <name>',
	alias: 'sfd',
	name: 'share-folder',
	usage: {
		'short': 'Share folder with users on CEC server.',
		'long': (function () {
			let desc = 'Share folder with users on CEC server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-folder Projects/Blogs -u user1,user2 -r manager', 'Share folder Projects/Blogs with user user1 and user2 and assign Manager role to them'],
		['cec share-folder Projects/Blogs -u user1,user2 -r manager -s UAT', 'Share folder Projects/Blogs with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareFolder = {
	command: 'unshare-folder <name>',
	alias: 'usfd',
	name: 'unshare-folder',
	usage: {
		'short': 'Delete the user\'s access to a shared folder on CEC server.',
		'long': (function () {
			let desc = 'Delete the user\'s access to a shared folder on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec unshare-folder Projects/Blogs -u user1,user2 '],
		['cec unshare-folder Projects/Blogs -u user1,user2 -s UAT']
	]
};

const downloadFolder = {
	command: 'download-folder <path>',
	alias: 'dlfd',
	name: 'download-folder',
	usage: {
		'short': 'Downloads folder from CEC server.',
		'long': (function () {
			let desc = 'Downloads folder and all its content from CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to save the folder on the local system.';
			return desc;
		})()
	},
	example: [
		['cec download-folder Releases/1', 'Downloads folder Releases/1 from CEC server and save to local folder src/documents/'],
		['cec download-folder /', 'Downloads all documents from CEC server and save to local folder src/documents/'],
		['cec download-folder Releases/1 -s UAT', 'Downloads folder Releases/1 from the registered server UAT and save to local folder src/documents/'],
		['cec download-folder Releases/1 -f ~/Downloads', 'Downloads folder Releases/1 from CEC server and save to local folder ~/Download/'],
		['cec download-folder Releases/1 -f .', 'Downloads folder Releases/1 from CEC server and save to the current local folder'],
		['cec download-folder site:blog1 -f ~/Downloads/blog1Files', 'Downloads all files of site blog1 and save to local folder ~/Download/blog1Files'],
		['cec download-folder theme:blog1Theme', 'Downloads all files of theme blog1Theme and save to local folder src/documents/blog1Theme/'],
		['cec download-folder component:Comp1/assets', 'Downloads all files in folder assets of component Comp1 and save to local folder src/documents/Comp1/assets/']
	]
};

const uploadFolder = {
	command: 'upload-folder <path>',
	alias: 'ulfd',
	name: 'upload-folder',
	usage: {
		'short': 'Uploads folder to CEC server.',
		'long': (function () {
			let desc = 'Uploads folder and all its content to CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to set the parent folder on CEC server.';
			return desc;
		})()
	},
	example: [
		['cec upload-folder ~/Downloads/docs', 'Uploads all content from ~/Downloads/docs to folder docs on the server'],
		['cec upload-folder ~/Downloads/docs/', 'Uploads all content from ~/Downloads/docs to the Home folder on the server'],
		['cec upload-folder ~/Downloads/docs -f Mydoc', 'Uploads all content from ~/Downloads/docs to folder Mydoc/docs on the server'],
		['cec upload-folder ~/Downloads/docs/ -f Mydoc', 'Uploads all content from ~/Downloads/docs to folder Mydoc on the server'],
		['cec upload-folder ~/Downloads/docs -s UAT', 'Uploads all content from ~/Downloads/docs to folder docs on the registered server UAT'],
		['cec upload-folder ~/Downloads/docs/ -f site:blog1/settings/misc', 'Uploads all content from ~/Downloads/docs to folder settings/misc of site blog1'],
		['cec upload-folder ~/Downloads/docs -f theme:blog1Theme', 'Uploads all content from ~/Downloads/docs to folder docs of theme blog1Theme'],
		['cec upload-folder ~/Downloads/docs -f component:Comp1', 'Uploads all content from ~/Downloads/docs to folder docs of component Comp1']
	]
};

const deleteFolder = {
	command: 'delete-folder <path>',
	alias: '',
	name: 'delete-folder',
	usage: {
		'short': 'Deletes folder on CEC server.',
		'long': (function () {
			let desc = 'Deletes folder and all its content on CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -p to permanently delete the folder.';
			return desc;
		})()
	},
	example: [
		['cec delete-folder Import/docs'],
		['cec delete-folder Import/docs -s UAT'],
		['cec delete-folder Import/docs -p']
	]
};

const uploadFile = {
	command: 'upload-file <file>',
	alias: 'ulf',
	name: 'upload-file',
	usage: {
		'short': 'Uploads file <file> to CEC server.',
		'long': (function () {
			let desc = 'Uploads file <file> to CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to set the parent folder on CEC server.';
			return desc;
		})()
	},
	example: [
		['cec upload-file ~/Documents/Projects.pdf', 'Uploads the file to the Home folder'],
		['cec upload-file ~/Documents/Projects.pdf -s UAT', 'Uploads the file to the Home folder on the registered server UAT'],
		['cec upload-file ~/Documents/Projects.pdf -f Doc/Plan', 'Uploads the file to folder Doc/Plan'],
		['cec upload-file ~/Documents/Projects.pdf -f site:blog1/settings/misc', 'Uploads the file to folder settings/misc of site blog1'],
		['cec upload-file ~/Documents/style1.css -f theme:blog1Theme/designs/default', 'Uploads the css file to folder designs/default of theme blog1Theme'],
		['cec upload-file ~/Documents/comp1.js -f component:Comp1/assets', 'Uploads the js file to folder assets of component Comp1']
	]
};

const downloadFile = {
	command: 'download-file <file>',
	alias: 'dlf',
	name: 'download-file',
	usage: {
		'short': 'Downloads file <file> from CEC server.',
		'long': (function () {
			let desc = 'Downloads file <file> from CEC server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to save the file on the local system.';
			return desc;
		})()
	},
	example: [
		['cec download-file Releases/Projects.pdf', 'Downloads the file from CEC server and save to local folder src/documents/'],
		['cec download-file Releases/Projects.pdf -s UAT', 'Downloads the file from the registered server UAT and save to local folder src/documents/'],
		['cec download-file Releases/Projects.pdf -f ~/Downloads', 'Downloads the file from CEC server and save to local folder ~/Download/'],
		['cec download-file Releases/Projects.pdf -f .', 'Downloads the file from CEC server and save to the current local folder'],
		['cec download-file site:blog1/siteinfo.json', 'Downloads the file from folder blog1 and save to local folder src/documents/blog1'],
		['cec download-file theme:blog1Theme/designs/default/design.css', 'Downloads the css file from folder designs/default of theme blog1Theme and save to local folder src/documents/blog1Theme/designs/default/'],
		['cec download-file component:Comp1/assets/render.js', 'Downloads the js file from folder assets of component Comp1 and save to local folder src/documents/Comp1/assets/']
	]
};

const createEncryptionKey = {
	command: 'create-encryption-key <file>',
	alias: 'cek',
	name: 'create-encryption-key',
	usage: {
		'short': 'Create an encryption key to encrypt/decrypt password for servers.',
		'long': (function () {
			let desc = 'Create an encryption key to encrypt/decrypt password for servers and save to <file>. Use NodeJS 10.12.0 or later.';
			return desc;
		})()
	},
	example: [
		['cec create-encryption-key ~/.ceckey', 'Create encryption key and save to file ~/.ceckey']
	]
};

const registerServer = {
	command: 'register-server <name>',
	alias: 'rs',
	name: 'register-server',
	usage: {
		'short': 'Registers a CEC server.',
		'long': (function () {
			let desc = 'Registers a CEC server. Specify -e <endpoint> for the server URL. ' +
				'Specify -u <user> and -p <password> for connecting to the server. ' +
				'Optionally specify -k <key> to encrypt the password. ' +
				'Optionally specify -t <type> to set the server type. The valid values for <type> are:\n\n';
			desc = getServerTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc) +
				'\nand the default value is pod_ec.';
			desc = desc + os.EOL + os.EOL + 'For pod_ec server, optionlly specify <idcsurl>, <clientid>, <clientsecret> and <scope> for headless commands. ';
			return desc;
		})()
	},
	example: [
		['cec register-server server1 -e http://server1.com -u user1 -p Welcome1 -i http://idcs1.com -c clientid -s clientsecret -o https://primary-audience-and-scope', 'The server is a tenant on Oracle Public cloud'],
		['cec register-server server1 -e http://server1.com -u user1 -p Welcome1', 'The server is a tenant on Oracle Public cloud'],
		['cec register-server server1 -e http://server1.git.oraclecorp.com.com -u user1 -p Welcome1 -t dev_ec', 'The server is a standalone development instance'],
		['cec register-server server1 -e http://server1.com -u user1 -p Welcome1 -k ~/.ceckey', 'The password will be encrypted']
	]
};

const install = {
	command: 'install',
	alias: 'i',
	name: 'install',
	usage: {
		'short': 'Creates source tree.',
		'long': (function () {
			let desc = 'Creates an initial source tree in the current directory.' + os.EOL + os.EOL +
				'With cec install, your source can be in a separate directory to the cec command install files, ' +
				'and you no longer need your source to be within a sites-toolkit directory.' + os.EOL + os.EOL +
				'The cec.properties file can be used to specify server settings.  It will be picked up from the source directory, or can be specified with environment variable CEC_PROPERTIES' + os.EOL + os.EOL +
				'Use cec develop to start a dev/test server for your source.  ' +
				'Different ports can be used for the server, to enable multiple source trees to exist.';
			return desc;
		})()
	},
	example: [
		['cec install']
	]
};

const develop = {
	command: 'develop',
	alias: 'd',
	name: 'develop',
	usage: {
		'short': 'Starts a test server.',
		'long': (function () {
			let desc = 'Starts a test server in the current folder. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p <port> to set the port, default port is 8085.';
			return desc;
		})()
	},
	example: [
		['cec develop'],
		['cec develop -p 7878'],
		['cec develop -p 7878 -s UAT']
	]
};

const syncServer = {
	command: 'sync-server',
	alias: 'scs',
	name: 'sync-server',
	usage: {
		'short': 'Starts a sync server.',
		'long': (function () {
			let desc = 'Starts a sync server in the current folder to sync changes notified by web hook from <server> to <destination> server. Specify the source server with -s <server> and the destination server with -d <destination>. ' +
				'Specify -u <username> and -w <password> for authenticating web hook events. Optionally specify -p <port> to set the port, default port is 8086. ' +
				'To run the sync server over HTTPS, specify the key file with -k <key> and the certificate file with -c <certificate>.'
			return desc;
		})()
	},
	example: [
		['cec sync-server -s DEV -d UAT -u admin -w welcome1'],
		['cec sync-server -s DEV -d UAT -u admin -w welcome1 -p 7878'],
		['cec sync-server -s DEV -d UAT', 'The username and password will be prompted to enter'],
		['cec sync-server -s DEV -d UAT -u admin', 'The password will be prompted to enter'],
		['cec sync-server -s DEV -d UAT -k ~/keys/key.pem -c ~/keys/cert.pem', 'The sync server will start over HTTPS']
	]
};

/*********************
 * Setup yargs
 **********************/
const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

var _checkVersion = function () {
	var checkVersionArgs = ['run', '-s', 'check-version', '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		checkVersionArgs.push(...['--server', argv.server]);
	}
	var checkVersion = childProcess.spawnSync(npmCmd, checkVersionArgs, {
		cwd,
		stdio: 'inherit'
	});
};

var _format = '  cec %-45s  %-70s  [alias: %4s]';
var _getCmdHelp = function (cmd) {
	return sprintf(_format, cmd.command, cmd.usage.short, cmd.alias);
};

var _usage = 'Usage: cec <command> [options] ' + os.EOL + os.EOL +
	'Run \cec <command> -h\' to get the detailed help for the command.' + os.EOL + os.EOL +
	'Commands:' + os.EOL;
_usage = _usage + os.EOL + 'Documents' + os.EOL +
	_getCmdHelp(createFolder) + os.EOL +
	_getCmdHelp(shareFolder) + os.EOL +
	_getCmdHelp(unshareFolder) + os.EOL +
	_getCmdHelp(downloadFolder) + os.EOL +
	_getCmdHelp(uploadFolder) + os.EOL +
	// _getCmdHelp(deleteFolder) + os.EOL +
	_getCmdHelp(downloadFile) + os.EOL +
	_getCmdHelp(uploadFile) + os.EOL;

_usage = _usage + os.EOL + 'Components' + os.EOL +
	_getCmdHelp(createComponent) + os.EOL +
	_getCmdHelp(copyComponent) + os.EOL +
	_getCmdHelp(importComponent) + os.EOL +
	_getCmdHelp(exportComponent) + os.EOL +
	_getCmdHelp(downloadComponent) + os.EOL +
	_getCmdHelp(uploadComponent) + os.EOL +
	_getCmdHelp(controlComponent) + os.EOL;

_usage = _usage + os.EOL + 'Templates' + os.EOL +
	_getCmdHelp(createTemplate) + os.EOL +
	_getCmdHelp(createTemplateFromSite) + os.EOL +
	_getCmdHelp(downloadTemplate) + os.EOL +
	//_getCmdHelp(compileTemplate) + os.EOL +
	_getCmdHelp(copyTemplate) + os.EOL +
	_getCmdHelp(importTemplate) + os.EOL +
	_getCmdHelp(exportTemplate) + os.EOL +
	_getCmdHelp(uploadTemplate) + os.EOL +
	_getCmdHelp(deleteTemplate) + os.EOL +
	_getCmdHelp(describeTemplate) + os.EOL;

_usage = _usage + os.EOL + 'Themes' + os.EOL +
	_getCmdHelp(addComponentToTheme) + os.EOL +
	_getCmdHelp(removeComponentFromTheme) + os.EOL +
	_getCmdHelp(controlTheme) + os.EOL;

_usage = _usage + os.EOL + 'Sites' + os.EOL +
	_getCmdHelp(createSite) + os.EOL +
	_getCmdHelp(updateSite) + os.EOL +
	_getCmdHelp(validateSite) + os.EOL +
	_getCmdHelp(controlSite) + os.EOL +
	_getCmdHelp(shareSite) + os.EOL +
	_getCmdHelp(unshareSite) + os.EOL +
	_getCmdHelp(setSiteSecurity) + os.EOL +
	_getCmdHelp(indexSite) + os.EOL +
	_getCmdHelp(createSiteMap) + os.EOL +
	_getCmdHelp(createRSSFeed) + os.EOL +
	_getCmdHelp(createAssetReport) + os.EOL;

_usage = _usage + os.EOL + 'Content' + os.EOL +
	_getCmdHelp(createContentLayout) + os.EOL +
	_getCmdHelp(addContentLayoutMapping) + os.EOL +
	_getCmdHelp(removeContentLayoutMapping) + os.EOL +
	_getCmdHelp(listServerContentTypes) + os.EOL +
	_getCmdHelp(downloadContent) + os.EOL +
	_getCmdHelp(uploadContent) + os.EOL +
	_getCmdHelp(controlContent) + os.EOL;

_usage = _usage + os.EOL + 'Assets' + os.EOL +
	_getCmdHelp(createRepository) + os.EOL +
	_getCmdHelp(controlRepository) + os.EOL +
	_getCmdHelp(shareRepository) + os.EOL +
	_getCmdHelp(unshareRepository) + os.EOL +
	_getCmdHelp(createChannel) + os.EOL +
	_getCmdHelp(createLocalizationPolicy) + os.EOL +
	_getCmdHelp(shareType) + os.EOL +
	_getCmdHelp(unshareType) + os.EOL;

_usage = _usage + os.EOL + 'Translation' + os.EOL +
	_getCmdHelp(listTranslationJobs) + os.EOL +
	_getCmdHelp(createTranslationJob) + os.EOL +
	_getCmdHelp(downloadTranslationJob) + os.EOL +
	_getCmdHelp(submitTranslationJob) + os.EOL +
	_getCmdHelp(ingestTranslationJob) + os.EOL +
	_getCmdHelp(uploadTranslationJob) + os.EOL +
	_getCmdHelp(createTranslationConnector) + os.EOL +
	_getCmdHelp(startTranslationConnector) + os.EOL +
	_getCmdHelp(registerTranslationConnector) + os.EOL;

_usage = _usage + os.EOL + 'Local Environment' + os.EOL +
	_getCmdHelp(createEncryptionKey) + os.EOL +
	_getCmdHelp(registerServer) + os.EOL +
	_getCmdHelp(listResources) + os.EOL +
	_getCmdHelp(install) + os.EOL +
	_getCmdHelp(develop) + os.EOL;
// _getCmdHelp(syncServer);

const argv = yargs.usage(_usage)
	.command([createComponent.command, createComponent.alias], false,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<from> Source to create from',
				})
				.check((argv) => {
					if (argv.from && !getComponentSources().includes(argv.from)) {
						throw new Error(`${argv.from} is not a valid value for <source>`);
					} else {
						return true;
					}
				})
				.example(...createComponent.examples[0])
				.example(...createComponent.examples[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createComponent.command}\n\n${createComponent.usage.long}`);
		})
	.command([createContentLayout.command, createContentLayout.alias], false,
		(yargs) => {
			yargs.option('contenttype', {
					alias: 'c',
					description: '<contenttype> Content layout is based on',
					demandOption: true
				})
				.option('template', {
					alias: 't',
					description: '<template> Content type is from',
				})
				.option('server', {
					alias: 'r',
					description: 'The registered CEC server'
				})
				.option('style', {
					alias: 's',
					description: '<style> Content layout style: detail | overview'
				})
				.check((argv) => {
					if (!argv.template && !argv.server) {
						throw new Error('Please specify template or server');
					} else {
						return true;
					}
				})
				.example(...createContentLayout.example[0])
				.example(...createContentLayout.example[1])
				.example(...createContentLayout.example[2])
				.example(...createContentLayout.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createContentLayout.command}\n\n${createContentLayout.usage.long}`);
		})
	.command([copyComponent.command, copyComponent.alias], false,
		(yargs) => {
			yargs.example(...copyComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${copyComponent.command}\n\n${copyComponent.usage.long}`);
		})
	.command([importComponent.command, importComponent.alias], false,
		(yargs) => {
			yargs.example(...importComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${importComponent.command}\n\n${importComponent.usage.long}`);
		})
	.command([exportComponent.command, exportComponent.alias], false,
		(yargs) => {
			yargs.example(...exportComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${exportComponent.command}\n\n${exportComponent.usage.long}`);
		})
	.command([downloadComponent.command, downloadComponent.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...downloadComponent.example[0])
				.example(...downloadComponent.example[1])
				.example(...downloadComponent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadComponent.command}\n\n${downloadComponent.usage.long}`);
		})
	.command([deployComponent.command, deployComponent.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the component zip file'
				})
				.option('publish', {
					alias: 'p',
					description: 'Publish the component'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...deployComponent.example[0])
				.example(...deployComponent.example[1])
				.example(...deployComponent.example[2])
				.example(...deployComponent.example[3])
				.example(...deployComponent.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deployComponent.command}\n\n${deployComponent.usage.long}`);
		})
	.command([uploadComponent.command, uploadComponent.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the component zip file'
				})
				.option('publish', {
					alias: 'p',
					description: 'Publish the component'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...uploadComponent.example[0])
				.example(...uploadComponent.example[1])
				.example(...uploadComponent.example[2])
				.example(...uploadComponent.example[3])
				.example(...uploadComponent.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadComponent.command}\n\n${uploadComponent.usage.long}`);
		})
	.command([controlComponent.command, controlComponent.alias], false,
		(yargs) => {
			yargs
				.check((argv) => {
					if (argv.action && !getComponentActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					} else {
						return true;
					}
				})
				.option('components', {
					alias: 'c',
					description: '<components> The comma separated list of components',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...controlComponent.example[0])
				.example(...controlComponent.example[1])
				.example(...controlComponent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlComponent.command}\n\n${controlComponent.usage.long}`);
		})
	.command([createTemplate.command, createTemplate.alias], false,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<source> Source to create from'
				})
				.check((argv) => {
					if (argv.from && !getTemplateSources().includes(argv.from)) {
						throw new Error(`${argv.from} is not a valid value for <source>`);
					} else {
						return true;
					}
				})
				.example(...createTemplate.example[0])
				.example(...createTemplate.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTemplate.command}\n\n${createTemplate.usage.long}`);
		})
	.command([createTemplateFromSite.command, createTemplateFromSite.alias], false,
		(yargs) => {
			yargs.option('site', {
					alias: 's',
					description: '<site> Site to create from',
					demandOption: true
				})
				.option('includeunpublishedassets', {
					alias: 'i',
					description: 'flag to indicate to include unpublished content items and digital assets in your template'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered CEC server'
				})
				.example(...createTemplateFromSite.example[0])
				.example(...createTemplateFromSite.example[1])
				.example(...createTemplateFromSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTemplateFromSite.command}\n\n${createTemplateFromSite.usage.long}`);
		})
	.command([copyTemplate.command, copyTemplate.alias], false,
		(yargs) => {
			yargs.example(...copyTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${copyTemplate.command}\n\n${copyTemplate.usage.long}`);
		})
	.command([importTemplate.command, importTemplate.alias], false,
		(yargs) => {
			yargs.example(...importTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${importTemplate.command}\n\n${importTemplate.usage.long}`);
		})
	.command([exportTemplate.command, exportTemplate.alias], false,
		(yargs) => {
			yargs.option('optimize', {
					alias: 'o',
					description: 'Optimize the template'
				})
				.example(...exportTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${exportTemplate.command}\n\n${exportTemplate.usage.long}`);
		})
	.command([downloadTemplate.command, downloadTemplate.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...downloadTemplate.example[0])
				.example(...downloadTemplate.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadTemplate.command}\n\n${downloadTemplate.usage.long}`);
		})
	.command([compileTemplate.command, compileTemplate.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				}).option('channelToken', {
					alias: 'c',
					description: '<channelToken> The channel access token to use for content URLs'
				})
				.option('type', {
					alias: 't',
					description: 'The type of content to retrieve from the serve [published | draft]'
				})
				.option('pages', {
					alias: 'p',
					description: 'The list of pages to compile'
				})
				.option('recurse', {
					alias: 'r',
					description: 'Compile all child pages of those specifed in the page list'
				})
				.option('debug', {
					alias: 'd',
					description: 'Start the compiler with "--inspect-brk" option to debug compilation'
				})
				.option('noDefaultDetailPageLink', {
					alias: 'o',
					description: 'Do not generate compiled detail page for items/content lists that use the default detail page'
				})
				.check((argv) => {
					if (argv.type && argv.type !== 'draft' && argv.type !== 'published') {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					} else if (argv.server && !argv.channelToken) {
						throw new Error(`Specifying calls to <server>: ${argv.server} for content queries also requires <channelToken> to also be specified.`);
					} else if (argv.type && argv.type !== 'published' && !argv.server) {
						throw new Error(`<type>: '${argv.type}' not supported without <server> parameter`);
					} else {
						return true;
					}
				})
				.example(...compileTemplate.example[0])
				.example(...compileTemplate.example[1])
				.example(...compileTemplate.example[2])
				.example(...compileTemplate.example[3])
				.example(...compileTemplate.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${compileTemplate.command}\n\n${compileTemplate.usage.long}`);
		})
	.command([deleteTemplate.command, deleteTemplate.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('permanent', {
					alias: 'p',
					description: 'flag to indicate to permanently delete the template'
				})
				.example(...deleteTemplate.example[0])
				.example(...deleteTemplate.example[1])
				.example(...deleteTemplate.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteTemplate.command}\n\n${deleteTemplate.usage.long}`);
		})
	.command([deployTemplate.command, deployTemplate.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the template zip file'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('optimize', {
					alias: 'o',
					description: 'Optimize the template'
				})
				.option('excludecontenttemplate', {
					alias: 'x',
					description: 'Exclude content template'
				})
				.example(...deployTemplate.example[0])
				.example(...deployTemplate.example[1])
				.example(...deployTemplate.example[2])
				.example(...deployTemplate.example[3])
				.example(...deployTemplate.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deployTemplate.command}\n\n${deployTemplate.usage.long}`);
		})
	.command([uploadTemplate.command, uploadTemplate.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the template zip file'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('optimize', {
					alias: 'o',
					description: 'Optimize the template'
				})
				.option('excludecontenttemplate', {
					alias: 'x',
					description: 'Exclude content template'
				})
				.example(...uploadTemplate.example[0])
				.example(...uploadTemplate.example[1])
				.example(...uploadTemplate.example[2])
				.example(...uploadTemplate.example[3])
				.example(...uploadTemplate.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadTemplate.command}\n\n${uploadTemplate.usage.long}`);
		})
	.command([describeTemplate.command, describeTemplate.alias], false,
		(yargs) => {
			yargs.example(...describeTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${describeTemplate.command}\n\n${describeTemplate.usage.long}`);
		})
	.command([listServerContentTypes.command, listServerContentTypes.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...listServerContentTypes.example[0])
				.example(...listServerContentTypes.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listServerContentTypes.command}\n\n${listServerContentTypes.usage.long}`);
		})
	.command([addContentLayoutMapping.command, addContentLayoutMapping.alias], false,
		(yargs) => {
			yargs.option('contenttype', {
					alias: 'c',
					description: '<contenttype> Content layout is based on',
					demandOption: true
				})
				.option('template', {
					alias: 't',
					description: '<template> The mapping is for',
					demandOption: true
				})
				.option('layoutstyle', {
					alias: 's',
					description: '<style> Content layout style'
				})
				.option('mobile', {
					alias: 'm',
					description: 'mobile mapping'
				})
				.example(...addContentLayoutMapping.example[0])
				.example(...addContentLayoutMapping.example[1])
				.example(...addContentLayoutMapping.example[2])
				.example(...addContentLayoutMapping.example[3])
				.example(...addContentLayoutMapping.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addContentLayoutMapping.command}\n\n${addContentLayoutMapping.usage.long}`);
		})
	.command([removeContentLayoutMapping.command, removeContentLayoutMapping.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: '<template> The mapping is from',
					demandOption: true
				})
				.option('layoutstyle', {
					alias: 's',
					description: '<style> Content layout style'
				})
				.option('mobile', {
					alias: 'm',
					description: 'mobile mapping'
				})
				.example(...removeContentLayoutMapping.example[0])
				.example(...removeContentLayoutMapping.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeContentLayoutMapping.command}\n\n${removeContentLayoutMapping.usage.long}`);
		})
	.command([downloadContent.command, downloadContent.alias], false,
		(yargs) => {
			yargs.option('publishedassets', {
					alias: 'p',
					description: 'The flag to indicate published assets only'
				})
				.option('assets', {
					alias: 'a',
					description: 'The comma separated list of asset GUIDS'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...downloadContent.example[0])
				.example(...downloadContent.example[1])
				.example(...downloadContent.example[2])
				.example(...downloadContent.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadContent.command}\n\n${downloadContent.usage.long}`);
		})
	.command([uploadContent.command, uploadContent.alias], false,
		(yargs) => {
			yargs.option('repository', {
					alias: 'r',
					description: '<repository> The repository for the types and items',
					demandOption: true
				})
				.option('template', {
					alias: 't',
					description: 'Flag to indicate the content is from template'
				})
				.option('file', {
					alias: 'f',
					description: 'Flag to indicate the content is from file'
				})
				.option('channel', {
					alias: 'c',
					description: '<channel> The channel to add the content'
				})
				.option('collection', {
					alias: 'l',
					description: '<collection> The collection to add the content'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('update', {
					alias: 'u',
					description: 'Update any existing content instead of creating new items'
				})
				.check((argv) => {
					if (argv.template && !argv.channel) {
						throw new Error('Please specify channel to add template content');
					} else {
						return true;
					}
				})
				.example(...uploadContent.example[0])
				.example(...uploadContent.example[1])
				.example(...uploadContent.example[2])
				.example(...uploadContent.example[3])
				.example(...uploadContent.example[4])
				.example(...uploadContent.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadContent.command}\n\n${uploadContent.usage.long}`);
		})
	.command([controlContent.command, controlContent.alias], false,
		(yargs) => {
			yargs
				.check((argv) => {
					if (argv.action && !getContentActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					} else {
						return true;
					}
				})
				.option('channel', {
					alias: 'c',
					description: '<channel> Channel',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...controlContent.example[0])
				.example(...controlContent.example[1])
				.example(...controlContent.example[2])
				.example(...controlContent.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlContent.command}\n\n${controlContent.usage.long}`);
		})
	.command([addComponentToTheme.command, addComponentToTheme.alias], false,
		(yargs) => {
			yargs.option('theme', {
					alias: 't',
					description: '<theme> Theme',
					demandOption: true
				})
				.option('category', {
					alias: 'c',
					description: '<category> component category'
				})
				.example(...addComponentToTheme.example[0])
				.example(...addComponentToTheme.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addComponentToTheme.command}\n\n${addComponentToTheme.usage.long}`);
		})
	.command([removeComponentFromTheme.command, removeComponentFromTheme.alias], false,
		(yargs) => {
			yargs.option('theme', {
					alias: 't',
					description: '<theme> Theme',
					demandOption: true
				})
				.example(...addComponentToTheme.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeComponentFromTheme.command}\n\n${removeComponentFromTheme.usage.long}`);
		})
	.command([controlTheme.command, controlTheme.alias], false,
		(yargs) => {
			yargs
				.check((argv) => {
					if (argv.action && !getThemeActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					} else {
						return true;
					}
				})
				.option('theme', {
					alias: 't',
					description: '<theme> The theme',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...controlTheme.example[0])
				.example(...controlTheme.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlTheme.command}\n\n${controlTheme.usage.long}`);
		})
	.command([listResources.command, listResources.alias], false,
		(yargs) => {
			yargs.option('types', {
					alias: 't',
					description: '<types> The comma separated list of resource types'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...listResources.example[0])
				.example(...listResources.example[1])
				.example(...listResources.example[2])
				.example(...listResources.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listResources.command}\n\n${listResources.usage.long}`);
		})
	.command([createSite.command, createSite.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: '<template> Template',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: '<repository> Repository, required for enterprise site'
				})
				.option('localizationPolicy', {
					alias: 'l',
					description: '<localizationPolicy> Localization policy'
				})
				.option('defaultLanguage', {
					alias: 'd',
					description: '<defaultLanguage> Default language, required for enterprise site'
				})
				.option('description', {
					alias: 'p',
					description: '<description> Site description'
				})
				.option('sitePrefix', {
					alias: 'x',
					description: '<sitePrefix> Site Prefix'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...createSite.example[0])
				.example(...createSite.example[1])
				.example(...createSite.example[2])
				.example(...createSite.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createSite.command}\n\n${createSite.usage.long}`);
		})
	.command([controlSite.command, controlSite.alias], false,
		(yargs) => {
			yargs
				.check((argv) => {
					if (argv.action && !getSiteActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					} else {
						return true;
					}
				})
				.option('site', {
					alias: 's',
					description: '<site> Site',
					demandOption: true
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered CEC server'
				})
				.example(...controlSite.example[0])
				.example(...controlSite.example[1])
				.example(...controlSite.example[2])
				.example(...controlSite.example[3])
				.example(...controlSite.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlSite.command}\n\n${controlSite.usage.long}`);
		})
	.command([shareSite.command, shareSite.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					} else {
						return true;
					}
				})
				.example(...shareSite.example[0])
				.example(...shareSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareSite.command}\n\n${shareSite.usage.long}`);
		})
	.command([unshareSite.command, unshareSite.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...unshareSite.example[0])
				.example(...unshareSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareSite.command}\n\n${unshareSite.usage.long}`);
		})
	.command([setSiteSecurity.command, setSiteSecurity.alias], false,
		(yargs) => {
			yargs.option('signin', {
					alias: 's',
					description: 'If require sign in to access site: ' + getSiteSignIn().join(' | '),
					demandOption: true
				})
				.option('access', {
					alias: 'a',
					description: 'The comma separated list of group names'
				})
				.option('addusers', {
					alias: 'u',
					description: 'The comma separated list of users to access the site'
				})
				.option('deleteusers', {
					alias: 'd',
					description: 'The comma separated list of users to remove access from the site'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (argv.signin && !getSiteSignIn().includes(argv.signin)) {
						throw new Error(`${argv.signin} is not a valid value for <signin>`);
					}
					if (argv.access) {
						var accessArray = argv.access.split(',');
						for (var i = 0; i < accessArray.length; i++) {
							if (!getSiteAccessNames().includes(accessArray[i])) {
								throw new Error(`"${accessArray[i]}" is not a valid value for <access>`);
							}
						}
					}
					return true;
				})
				.example(...setSiteSecurity.example[0])
				.example(...setSiteSecurity.example[1])
				.example(...setSiteSecurity.example[2])
				.example(...setSiteSecurity.example[3])
				.example(...setSiteSecurity.example[4])
				.example(...setSiteSecurity.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${setSiteSecurity.command}\n\n${setSiteSecurity.usage.long}`);
		})
	.command([updateSite.command, updateSite.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: '<template> Template',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...updateSite.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${updateSite.command}\n\n${updateSite.usage.long}`);
		})
	.command([validateSite.command, validateSite.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...validateSite.example[0])
				.example(...validateSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${validateSite.command}\n\n${validateSite.usage.long}`);
		})
	.command([indexSite.command, indexSite.alias], false,
		(yargs) => {
			yargs.option('contenttype', {
					alias: 'c',
					description: '<contenttype> page index content type'
				})
				.option('publish', {
					alias: 'p',
					description: 'publish page index items'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (!argv.contenttype) {
						throw new Error('Please specify page index content type');
					} else {
						return true;
					}
				})
				.example(...indexSite.example[0])
				.example(...indexSite.example[1])
				.example(...indexSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${indexSite.command}\n\n${indexSite.usage.long}`);
		})
	.command([createSiteMap.command, createSiteMap.alias], false,
		(yargs) => {
			yargs.option('url', {
					alias: 'u',
					description: '<url> Site URL',
					demandOption: true
				})
				.option('changefreq', {
					alias: 'c',
					description: 'How frequently the page is likely to change.'
				})
				.option('file', {
					alias: 'f',
					description: 'Name of the generated site map file'
				})
				.option('languages', {
					alias: 'l',
					description: '<languages> The comma separated list of languages used to create the site map'
				})
				.option('publish', {
					alias: 'p',
					description: 'Upload the site map to CEC server after creation'
				})
				.option('toppagepriority', {
					alias: 't',
					description: 'Priority for the top level pages, a decimal number between 0 and 1'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('newlink', {
					alias: 'n',
					description: 'Generate new 19.3.3 detail page link'
				})
				.option('noDefaultDetailPageLink', {
					alias: 'o',
					description: 'Do not generate detail page link for items/content lists that use the default detail page'
				})
				.check((argv) => {
					if (!argv.url) {
						throw new Error('Please specify site URL');
					} else if (argv.changefreq && !getSiteMapChangefreqValues().includes(argv.changefreq)) {
						throw new Error(`${argv.changefreq} is not a valid value for <changefreq>`);
					} else if (argv.toppagepriority !== undefined && (argv.toppagepriority <= 0 || argv.toppagepriority >= 1)) {
						throw new Error('Value for toppagepriority should be greater than 0 and less than 1');
					} else {
						return true;
					}
				})
				.example(...createSiteMap.example[0])
				.example(...createSiteMap.example[1])
				.example(...createSiteMap.example[2])
				.example(...createSiteMap.example[3])
				.example(...createSiteMap.example[4])
				.example(...createSiteMap.example[5])
				.example(...createSiteMap.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createSiteMap.command}\n\n${createSiteMap.usage.long}`);
		})
	.command([createRSSFeed.command, createRSSFeed.alias], false,
		(yargs) => {
			yargs.option('url', {
					alias: 'u',
					description: '<url> Site URL',
					demandOption: true
				})
				.option('query', {
					alias: 'q',
					description: 'Query for content items',
					demandOption: true
				})
				.option('limit', {
					alias: 'l',
					description: 'The limit of the items returned from the query',
					demandOption: true
				})
				.option('orderby', {
					alias: 'o',
					description: 'The order by for the query',
					demandOption: true
				})
				.option('language', {
					alias: 'i',
					description: 'The language for the query'
				})
				.option('template', {
					alias: 'x',
					description: 'The RSS xml template'
				})
				.option('title', {
					alias: 't',
					description: 'The RSS feed title'
				})
				.option('description', {
					alias: 'd',
					description: 'The RSS feed description'
				})
				.option('ttl', {
					description: 'How long the data will last in number of minutes'
				})
				.option('file', {
					alias: 'f',
					description: 'Name of the generated RSS feed file'
				})
				.option('publish', {
					alias: 'p',
					description: 'Upload the RSS feed to CEC server after creation'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('newlink', {
					alias: 'n',
					description: 'Generate new 19.3.3 detail page link'
				})
				.check((argv) => {
					if (!Number.isInteger(argv.limit) || argv.limit <= 0) {
						throw new Error('Value for limit should be an integer greater than 0');
					} else if (argv.orderby) {
						var orderbyarr = argv.orderby.split(':');
						if ((orderbyarr.length !== 2 || (orderbyarr[1] !== 'asc' && orderbyarr[1] !== 'desc'))) {
							throw new Error('Value for orderby should be as <field>:<asc|desc>');
						} else {
							return true;
						}
					} else if (argv.ttl && (!Number.isInteger(argv.ttl) || argv.ttl <= 0)) {
						throw new Error('Value for ttl should be an integer greater than 0');
					} else {
						return true;
					}
				})
				.example(...createRSSFeed.example[0])
				.example(...createRSSFeed.example[1])
				.example(...createRSSFeed.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createRSSFeed.command}\n\n${createRSSFeed.usage.long}`);
		})
	.command([createAssetReport.command, createAssetReport.alias], false,
		(yargs) => {
			yargs.option('output', {
					alias: 'o',
					description: 'Output the report to a JSON file'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...createAssetReport.example[0])
				.example(...createAssetReport.example[1])
				.example(...createAssetReport.example[2])
				.example(...createAssetReport.example[3])
				.example(...createAssetReport.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createAssetReport.command}\n\n${createAssetReport.usage.long}`);
		})
	.command([createRepository.command, createRepository.alias], false,
		(yargs) => {
			yargs.option('description', {
					alias: 'd',
					description: 'The description for the repository'
				})
				.option('contenttypes', {
					alias: 't',
					description: 'The comma separated list of content types for the repository'
				})
				.option('channels', {
					alias: 'c',
					description: 'The comma separated list of publishing channels to use in this repository'
				})
				.option('defaultlanguage', {
					alias: 'l',
					description: 'The default language'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...createRepository.example[0])
				.example(...createRepository.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createRepository.command}\n\n${createRepository.usage.long}`);
		})
	.command([controlRepository.command, controlRepository.alias], false,
		(yargs) => {
			yargs.check((argv) => {
					if (argv.action && !getRepositoryActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					} else if ((argv.action === 'add-type' || argv.action === 'remove-type') && !argv.contenttypes) {
						throw new Error(`<contenttypes> is required for ${argv.action}`);
					} else if ((argv.action === 'add-channel' || argv.action === 'remove-channel') && !argv.channels) {
						throw new Error(`<channels> is required for ${argv.action}`);
					} else {
						return true;
					}
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository',
					demandOption: true
				})
				.option('contenttypes', {
					alias: 't',
					description: 'The comma separated list of content types to add to the repository'
				})
				.option('channels', {
					alias: 'c',
					description: 'The comma separated list of publishing channels to add to the repository'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...controlRepository.example[0])
				.example(...controlRepository.example[1])
				.example(...controlRepository.example[2])
				.example(...controlRepository.example[3])
				.example(...controlRepository.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlRepository.command}\n\n${controlRepository.usage.long}`);
		})
	.command([shareRepository.command, shareRepository.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getResourceRoles().join(' | ') + '] to assign to the users',
					demandOption: true
				})
				.option('types', {
					alias: 't',
					description: 'flag to indicate to share types in the repository'
				})
				.option('typerole', {
					alias: 'y',
					description: 'The role [' + getResourceRoles().join(' | ') + '] to assign to the users for types'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (argv.role && !getResourceRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					} else if (argv.typerole && !getResourceRoles().includes(argv.typerole)) {
						throw new Error(`${argv.typerole} is not a valid value for <typerole>`);
					} else {
						return true;
					}
				})
				.example(...shareRepository.example[0])
				.example(...shareRepository.example[1])
				.example(...shareRepository.example[2])
				.example(...shareRepository.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareRepository.command}\n\n${shareRepository.usage.long}`);
		})
	.command([unshareRepository.command, unshareRepository.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('types', {
					alias: 't',
					description: 'flag to indicate to remove user\'s access to types in the repository'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...unshareRepository.example[0])
				.example(...unshareRepository.example[1])
				.example(...unshareRepository.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareRepository.command}\n\n${unshareRepository.usage.long}`);
		})
	.command([shareType.command, shareType.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getResourceRoles().join(' | ') + '] to assign to the users',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (argv.role && !getResourceRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					} else {
						return true;
					}
				})
				.example(...shareType.example[0])
				.example(...shareType.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareType.command}\n\n${shareType.usage.long}`);
		})
	.command([unshareType.command, unshareType.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...unshareType.example[0])
				.example(...unshareType.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareType.command}\n\n${unshareType.usage.long}`);
		})
	.command([createChannel.command, createChannel.alias], false,
		(yargs) => {
			yargs.option('description', {
					alias: 'd',
					description: 'The description for the channel'
				})
				.option('type', {
					alias: 't',
					description: 'The channel type [public | secure]'
				})
				.option('publishpolicy', {
					alias: 'p',
					description: 'The publish policy [anythingPublished | onlyApproved]'
				})
				.option('localizationpolicy', {
					alias: 'l',
					description: 'The localization policy for the channel'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.check((argv) => {
					if (argv.type && argv.type !== 'public' && argv.type !== 'secure') {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					} else if (argv.publishpolicy && argv.publishpolicy !== 'anythingPublished' && argv.publishpolicy !== 'onlyApproved') {
						throw new Error(`${argv.publishpolicy} is not a valid value for <publishpolicy>`);
					} else {
						return true;
					}
				})
				.example(...createChannel.example[0])
				.example(...createChannel.example[1])
				.example(...createChannel.example[2])
				.example(...createChannel.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createChannel.command}\n\n${createChannel.usage.long}`);
		})
	.command([createLocalizationPolicy.command, createLocalizationPolicy.alias], false,
		(yargs) => {
			yargs.option('requiredlanguages', {
					alias: 'r',
					description: 'The comma separated list of required languages for the localization policy',
					demandOption: true
				})
				.option('defaultlanguage', {
					alias: 'l',
					description: 'The default language',
					demandOption: true
				})
				.option('optionallanguages', {
					alias: 'o',
					description: 'The comma separated list of optional languages for the localization policy'
				})
				.option('description', {
					alias: 'd',
					description: 'The description for the repository'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...createLocalizationPolicy.example[0])
				.example(...createLocalizationPolicy.example[1])
				.example(...createLocalizationPolicy.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createLocalizationPolicy.command}\n\n${createLocalizationPolicy.usage.long}`);
		})
	.command([listTranslationJobs.command, listTranslationJobs.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...listTranslationJobs.example[0])
				.example(...listTranslationJobs.example[1])
				.example(...listTranslationJobs.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listTranslationJobs.command}\n\n${listTranslationJobs.usage.long}`);
		})
	.command([createTranslationJob.command, createTranslationJob.alias], false,
		(yargs) => {
			yargs.option('site', {
					alias: 's',
					description: '<site> Site',
					demandOption: true
				})
				.option('languages', {
					alias: 'l',
					description: '<languages> The comma separated list of languages used to create the translation job',
					demandOption: true
				})
				.option('type', {
					alias: 't',
					description: 'The type of translation job contents'
				})
				.option('server', {
					alias: 'r',
					description: 'The registered CEC server'
				})
				.check((argv) => {
					if (argv.type && !getTranslationJobExportTypes().includes(argv.type)) {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					} else {
						return true;
					}
				})
				.example(...createTranslationJob.example[0])
				.example(...createTranslationJob.example[1])
				.example(...createTranslationJob.example[2])
				.example(...createTranslationJob.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTranslationJob.command}\n\n${createTranslationJob.usage.long}`);
		})
	.command([downloadTranslationJob.command, downloadTranslationJob.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...downloadTranslationJob.example[0])
				.example(...downloadTranslationJob.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadTranslationJob.command}\n\n${downloadTranslationJob.usage.long}`);
		})
	.command([submitTranslationJob.command, submitTranslationJob.alias], false,
		(yargs) => {
			yargs.option('connection', {
					alias: 'c',
					description: '<connection> Connection',
					demandOption: true
				})
				.check((argv) => {
					if (!argv.connection) {
						throw new Error('Please specify connection');
					} else {
						return true;
					}
				})
				.example(...submitTranslationJob.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${submitTranslationJob.command}\n\n${submitTranslationJob.usage.long}`);
		})
	.command([ingestTranslationJob.command, ingestTranslationJob.alias], false,
		(yargs) => {
			yargs.example(...ingestTranslationJob.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${ingestTranslationJob.command}\n\n${ingestTranslationJob.usage.long}`);
		})
	.command([uploadTranslationJob.command, uploadTranslationJob.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the translation zip file'
				})
				.option('validateonly', {
					alias: 'v',
					description: 'Validate translation job without import.'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.example(...uploadTranslationJob.example[0])
				.example(...uploadTranslationJob.example[1])
				.example(...uploadTranslationJob.example[2])
				.example(...uploadTranslationJob.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadTranslationJob.command}\n\n${uploadTranslationJob.usage.long}`);
		})
	.command([createTranslationConnector.command, createTranslationConnector.alias], false,
		(yargs) => {
			yargs.example(...createTranslationConnector.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTranslationConnector.command}\n\n${createTranslationConnector.usage.long}`);
		})
	.command([startTranslationConnector.command, startTranslationConnector.alias], false,
		(yargs) => {
			yargs.option('port', {
					alias: 'p',
					description: 'Set <port>. Defaults to 8084.'
				})
				.option('debug', {
					alias: 'd',
					description: 'Start the translation connector server with "--inspect" option'
				})
				.example(...startTranslationConnector.example[0])
				.example(...startTranslationConnector.example[1])
				.example(...startTranslationConnector.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${startTranslationConnector.command}\n\n${startTranslationConnector.usage.long}`);
		})
	.command([registerTranslationConnector.command, registerTranslationConnector.alias], false,
		(yargs) => {
			yargs
				.option('connector', {
					alias: 'c',
					description: '<connector> Connector name',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> Server URL',
					demandOption: true
				})
				.option('user', {
					alias: 'u',
					description: '<user> User name',
					demandOption: true
				})
				.option('password', {
					alias: 'p',
					description: '<password> password',
					demandOption: true
				})
				.option('fields', {
					alias: 'f',
					description: '<fields> translation connector custom fields'
				})
				.check((argv) => {
					if (!argv.connector) {
						throw new Error('Please specify connector');
					} else if (!argv.server) {
						throw new Error('Please specify server URL');
					} else if (!argv.user) {
						throw new Error('Please specify user name');
					} else if (!argv.password) {
						throw new Error('Please specify password');
					} else
						return true;
				})
				.example(...registerTranslationConnector.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${registerTranslationConnector.command}\n\n${registerTranslationConnector.usage.long}`);
		})
	.command([createFolder.command, createFolder.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...createFolder.example[0])
				.example(...createFolder.example[1])
				.example(...createFolder.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createFolder.command}\n\n${createFolder.usage.long}`);
		})
	.command([shareFolder.command, shareFolder.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.check((argv) => {
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					} else {
						return true;
					}
				})
				.example(...shareFolder.example[0])
				.example(...shareFolder.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareFolder.command}\n\n${shareFolder.usage.long}`);
		})
	.command([unshareFolder.command, unshareFolder.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...unshareFolder.example[0])
				.example(...unshareFolder.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareFolder.command}\n\n${unshareFolder.usage.long}`);
		})
	.command([downloadFolder.command, downloadFolder.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Local folder to save the folder on CEC server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...downloadFolder.example[0])
				.example(...downloadFolder.example[1])
				.example(...downloadFolder.example[2])
				.example(...downloadFolder.example[3])
				.example(...downloadFolder.example[4])
				.example(...downloadFolder.example[5])
				.example(...downloadFolder.example[6])
				.example(...downloadFolder.example[7])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadFolder.command}\n\n${downloadFolder.usage.long}`);
		})
	.command([uploadFolder.command, uploadFolder.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> The parent folder on CEC server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...uploadFolder.example[0])
				.example(...uploadFolder.example[1])
				.example(...uploadFolder.example[2])
				.example(...uploadFolder.example[3])
				.example(...uploadFolder.example[4])
				.example(...uploadFolder.example[5])
				.example(...uploadFolder.example[6])
				.example(...uploadFolder.example[7])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadFolder.command}\n\n${uploadFolder.usage.long}`);
		})
	.command([deleteFolder.command, deleteFolder.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.option('permanent', {
					alias: 'p',
					description: 'Delete the folder permanently'
				})
				.example(...deleteFolder.example[0])
				.example(...deleteFolder.example[1])
				.example(...deleteFolder.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteFolder.command}\n\n${deleteFolder.usage.long}`);
		})
	.command([uploadFile.command, uploadFile.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> The parent folder on CEC server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...uploadFile.example[0])
				.example(...uploadFile.example[1])
				.example(...uploadFile.example[2])
				.example(...uploadFile.example[3])
				.example(...uploadFile.example[4])
				.example(...uploadFile.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadFile.command}\n\n${uploadFile.usage.long}`);
		})
	.command([downloadFile.command, downloadFile.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Local folder to save the file'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered CEC server'
				})
				.example(...downloadFile.example[0])
				.example(...downloadFile.example[1])
				.example(...downloadFile.example[2])
				.example(...downloadFile.example[3])
				.example(...downloadFile.example[4])
				.example(...downloadFile.example[5])
				.example(...downloadFile.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadFile.command}\n\n${downloadFile.usage.long}`);
		})
	.command([createEncryptionKey.command, createEncryptionKey.alias], false,
		(yargs) => {
			yargs.example(...createEncryptionKey.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createEncryptionKey.command}\n\n${createEncryptionKey.usage.long}`);
		})
	.command([registerServer.command, registerServer.alias], false,
		(yargs) => {
			yargs
				.option('endpoint', {
					alias: 'e',
					description: '<endpoint> Server endpoint',
					demandOption: true
				})
				.option('user', {
					alias: 'u',
					description: '<user> User name',
					demandOption: true
				})
				.option('password', {
					alias: 'p',
					description: '<password> Password',
					demandOption: true
				})
				.option('key', {
					alias: 'k',
					description: 'The key file used to encrypt the password'
				})
				.option('type', {
					alias: 't',
					description: '<type> Server type'
				})
				.option('idcsurl', {
					alias: 'i',
					description: '<idcsurl> Oracle Identity Cloud Service Instance URL'
				})
				.option('clientid', {
					alias: 'c',
					description: '<clientid> Client ID'
				})
				.option('clientsecret', {
					alias: 's',
					description: '<clientsecret> Client secret'
				})
				.option('scope', {
					alias: 'o',
					description: '<clientsecret> Scope'
				})
				.check((argv) => {
					if (argv.type && !getServerTypes().includes(argv.type) && argv.type.indexOf('dev_ec:') < 0) {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					} else if (!argv.type || argv.type === 'pod_ec') {
						var useIDCS = argv.idcsurl || argv.clientid || argv.clientsecret || argv.scope;
						if (useIDCS) {
							if (!argv.idcsurl) {
								throw new Error('Please specify Oracle Identity Cloud Service Instance URL <idcsurl>');
							} else if (!argv.clientid) {
								throw new Error('Please specify client id <clientid>');
							} else if (!argv.clientsecret) {
								throw new Error('Please specify client secret <clientsecret>');
							} else if (!argv.scope) {
								throw new Error('Please specify scope <scope>');
							}
						}
					}
					return true;
				})
				.example(...registerServer.example[0])
				.example(...registerServer.example[1])
				.example(...registerServer.example[2])
				.example(...registerServer.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${registerServer.command}\n\n${registerServer.usage.long}`);
		})
	.command([install.command, install.alias], false,
		(yargs) => {
			yargs.example(...install.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${install.command}\n\n${install.usage.long}`);
		})
	.command([develop.command, develop.alias], false,
		(yargs) => {
			yargs.option('port', {
					alias: 'p',
					description: 'Set <port>. Defaults to 8085.'
				})
				.option('server', {
					alias: 's',
					description: 'The registered CEC server'
				})
				.option('debug', {
					alias: 'd',
					description: 'Start the server with "--inspect"'
				})
				.example(...develop.example[0])
				.example(...develop.example[1])
				.example(...develop.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${develop.command}\n\n${develop.usage.long}`);
		})
	.command([syncServer.command, syncServer.alias], false,
		(yargs) => {
			yargs
				.option('server', {
					alias: 's',
					description: 'The registered CEC server for sync source',
					demandOption: true
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered CEC server for sync destination',
					demandOption: true
				})
				.option('username', {
					alias: 'u',
					description: 'The username used to authenticate the web hook event'
				})
				.option('password', {
					alias: 'w',
					description: 'The password used to authenticate the web hook event'
				})
				.option('port', {
					alias: 'p',
					description: 'Set port. Defaults to 8086.'
				})
				.option('key', {
					alias: 'k',
					description: 'The key file for HTTPS'
				})
				.option('certificate', {
					alias: 'c',
					description: 'The certificate file for HTTPS'
				})
				.example(...syncServer.example[0])
				.example(...syncServer.example[1])
				.example(...syncServer.example[2])
				.example(...syncServer.example[3])
				.example(...syncServer.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${syncServer.command}\n\n${syncServer.usage.long}`);
		})
	.help('help')
	.alias('help', 'h')
	.version()
	.alias('version', 'v')
	.strict()
	.wrap(yargs.terminalWidth())
	.fail((msg, err, yargs) => {
		yargs.showHelp('log');
		if (msg.indexOf('Not enough non-option arguments') < 0) {
			console.log(msg);
		}
		process.exit(1);
	})
	.argv;

if (!argv._[0]) {
	// prints to stdout
	yargs.showHelp('log');
	return;
}

// _checkVersion();

/*********************
 * Command execution
 **********************/
//console.log(argv);

var spawnCmd;

if (argv._[0] === 'install' || argv._[0] === 'i') {
	var projectRoot = _getProjectRoot();
	if (projectRoot && projectRoot !== cwd) {
		console.log(`A Content and Experience Cloud project already installed at ${projectRoot}`);
		return;
	}

	if (projectRoot) {
		var packageFile = path.join(projectRoot, 'package.json');
		var packageJSON = JSON.parse(fs.readFileSync(packageFile));
		if (packageJSON && packageJSON.name === 'cec-sites-toolkit') {
			console.log(`You cannot install Content and Experience Cloud project at ${projectRoot}. Please install at a different location.`);
			return;
		}
	}

	let installArgs = ['run', '-s', 'install-src', '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	spawnCmd = childProcess.spawnSync(npmCmd, installArgs, {
		cwd,
		stdio: 'inherit'
	});
	return;
}

if (!_verifyCECProject()) {
	return;
}

// console.log(argv);

if (argv._[0] === createComponent.name || argv._[0] == createComponent.alias) {
	let createComponentArgs = ['run', '-s', createComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.from ? argv.from : 'local'
	];
	createComponentArgs.push(...['--name', argv.name]);
	spawnCmd = childProcess.spawnSync(npmCmd, createComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createContentLayout.name || argv._[0] === createContentLayout.alias) {
	let createContentLayoutArgs = ['run', '-s', createContentLayout.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--contenttype', argv.contenttype,
		'--style', argv.style ? argv.style : 'overview'
	];
	if (argv.template) {
		createContentLayoutArgs.push(...['--template', argv.template]);
	}
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		createContentLayoutArgs.push(...['--server'], serverVal);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, createContentLayoutArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === copyComponent.name || argv._[0] === copyComponent.alias) {
	let copyComponentArgs = ['run', '-s', copyComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.source
	];
	if (argv.destination) {
		copyComponentArgs.push(...['--name', argv.destination]);
	} else {
		copyComponentArgs.push(...['--name', argv.source + '_' + Math.floor(Math.random() * 1000000)]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, copyComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === importComponent.name || argv._[0] === importComponent.alias) {
	let importComponentArgs = ['run', '-s', importComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.zip
	];
	spawnCmd = childProcess.spawnSync(npmCmd, importComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === exportComponent.name || argv._[0] === exportComponent.alias) {
	let exportComponentArgs = ['run', '-s', exportComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.name
	];
	spawnCmd = childProcess.spawnSync(npmCmd, exportComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadComponent.name || argv._[0] === downloadComponent.alias) {
	let downloadComponentArgs = ['run', '-s', downloadComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.names
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === deployComponent.name || argv._[0] === deployComponent.alias) {
	let deployComponentArgs = ['run', '-s', deployComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.names
	];
	if (argv.publish) {
		deployComponentArgs.push(...['--publish', argv.publish]);
	}
	if (argv.folder && typeof argv.folder !== 'boolean') {
		deployComponentArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		deployComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deployComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadComponent.name || argv._[0] === uploadComponent.alias) {
	let uploadComponentArgs = ['run', '-s', uploadComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.names
	];
	if (argv.publish) {
		uploadComponentArgs.push(...['--publish', argv.publish]);
	}
	if (argv.folder && typeof argv.folder !== 'boolean') {
		uploadComponentArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlComponent.name || argv._[0] === controlComponent.alias) {
	let controlComponentArgs = ['run', '-s', controlComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action,
		'--components', argv.components
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		controlComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createTemplate.name || argv._[0] === createTemplate.alias) {

	let createTemplateArgs = ['run', '-s', createTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.from ? argv.from : 'StarterTemplate'
	];
	createTemplateArgs.push(...['--name', argv.name]);
	spawnCmd = childProcess.spawnSync(npmCmd, createTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === copyTemplate.name || argv._[0] === copyTemplate.alias) {
	let copyTemplateArgs = ['run', '-s', copyTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.source
	];
	if (argv.destination) {
		copyTemplateArgs.push(...['--name', argv.destination]);
	} else {
		copyTemplateArgs.push(...['--name', argv.source + '_' + Math.floor(Math.random() * 1000000)]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, copyTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === importTemplate.name || argv._[0] === importTemplate.alias) {
	let importTemplateArgs = ['run', '-s', importTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.zip
	];
	spawnCmd = childProcess.spawnSync(npmCmd, importTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === exportTemplate.name || argv._[0] === exportTemplate.alias) {
	let exportTemplateArgs = ['run', '-s', exportTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--template', argv.name
	];
	if (argv.optimize) {
		exportTemplateArgs.push(...['--minify', argv.optimize]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, exportTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === deployTemplate.name || argv._[0] === deployTemplate.alias) {
	let deployTemplateArgs = ['run', '-s', deployTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--template', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		deployTemplateArgs.push(...['--server', argv.server]);
	}
	if (argv.folder && typeof argv.folder !== 'boolean') {
		deployTemplateArgs.push(...['--folder', argv.folder]);
	}
	if (argv.optimize) {
		deployTemplateArgs.push(...['--minify', argv.optimize]);
	}
	if (argv.excludecontenttemplate) {
		uploadTemplateArgs.push(...['--excludecontenttemplate', argv.excludecontenttemplate]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deployTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadTemplate.name || argv._[0] === uploadTemplate.alias) {
	let uploadTemplateArgs = ['run', '-s', uploadTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--template', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadTemplateArgs.push(...['--server', argv.server]);
	}
	if (argv.folder && typeof argv.folder !== 'boolean') {
		uploadTemplateArgs.push(...['--folder', argv.folder]);
	}
	if (argv.optimize) {
		uploadTemplateArgs.push(...['--minify', argv.optimize]);
	}
	if (argv.excludecontenttemplate) {
		uploadTemplateArgs.push(...['--excludecontenttemplate', argv.excludecontenttemplate]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createTemplateFromSite.name || argv._[0] === createTemplateFromSite.alias) {
	let createTemplateFromSiteArgs = ['run', '-s', createTemplateFromSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--site', argv.site
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		createTemplateFromSiteArgs.push(...['--server', argv.server]);
	}
	if (argv.includeunpublishedassets) {
		createTemplateFromSiteArgs.push(...['--includeunpublishedassets', argv.includeunpublishedassets]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createTemplateFromSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadTemplate.name || argv._[0] === downloadTemplate.alias) {
	let downloadTemplateArgs = ['run', '-s', downloadTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadTemplateArgs.push(...['--server', argv.server]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, downloadTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === compileTemplate.name || argv._[0] === compileTemplate.alias) {
	let runCommand = argv.debug ? compileTemplate.debugName : compileTemplate.name;
	let compileTemplateArgs = ['run', '-s', runCommand, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.source
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		compileTemplateArgs.push(...['--server', argv.server]);
	}
	if (argv.destination) {
		compileTemplateArgs.push(...['--name', argv.destination]);
	}
	if (argv.type) {
		compileTemplateArgs.push(...['--type', argv.type]);
	}
	if (argv.channelToken) {
		compileTemplateArgs.push(...['--channelToken', argv.channelToken]);
	}
	if (argv.pages) {
		compileTemplateArgs.push(...['--pages', argv.pages]);
	}
	if (argv.recurse) {
		compileTemplateArgs.push(...['--recurse', argv.recurse]);
	}
	if (argv.noDefaultDetailPageLink) {
		compileTemplateArgs.push(...['--noDefaultDetailPageLink', argv.noDefaultDetailPageLink]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, compileTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === deleteTemplate.name) {
	let deleteTemplateArgs = ['run', '-s', deleteTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		deleteTemplateArgs.push(...['--server', argv.server]);
	}
	if (argv.permanent) {
		deleteTemplateArgs.push(...['--permanent', argv.permanent]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, deleteTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === describeTemplate.name || argv._[0] === describeTemplate.alias) {
	let describeTemplateArgs = ['run', '-s', describeTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--template', argv.name
	];
	spawnCmd = childProcess.spawnSync(npmCmd, describeTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === addContentLayoutMapping.name || argv._[0] === addContentLayoutMapping.alias) {
	let addContentLayoutMappingArgs = ['run', '-s', addContentLayoutMapping.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--contentlayout', argv.contentlayout,
		'--contenttype', argv.contenttype,
		'--template', argv.template
	];
	if (argv.layoutstyle) {
		addContentLayoutMappingArgs.push(...['--layoutstyle', argv.layoutstyle]);
	}
	if (argv.mobile) {
		addContentLayoutMappingArgs.push(...['--mobile', argv.mobile]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, addContentLayoutMappingArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === removeContentLayoutMapping.name || argv._[0] === removeContentLayoutMapping.alias) {
	let removeContentLayoutMappingArgs = ['run', '-s', removeContentLayoutMapping.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--contentlayout', argv.contentlayout,
		'--template', argv.template
	];
	if (argv.layoutstyle) {
		removeContentLayoutMappingArgs.push(...['--layoutstyle', argv.layoutstyle]);
	}
	if (argv.mobile) {
		removeContentLayoutMappingArgs.push(...['--mobile', argv.mobile]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, removeContentLayoutMappingArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadContent.name || argv._[0] === downloadContent.alias) {
	let downloadContentArgs = ['run', '-s', downloadContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--channel', argv.channel
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadContentArgs.push(...['--server', argv.server]);
	}
	if (argv.publishedassets) {
		downloadContentArgs.push(...['--publishedassets', argv.publishedassets]);
	}
	if (argv.assets && typeof argv.assets !== 'boolean') {
		downloadContentArgs.push(...['--assets', argv.assets]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadContent.name || argv._[0] === uploadContent.alias) {
	let uploadContentArgs = ['run', '-s', uploadContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--repository', argv.repository
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadContentArgs.push(...['--server', argv.server]);
	}
	if (argv.channel) {
		uploadContentArgs.push(...['--channel', argv.channel]);
	}
	if (argv.collection) {
		uploadContentArgs.push(...['--collection', argv.collection]);
	}
	if (argv.template) {
		uploadContentArgs.push(...['--template', argv.template]);
	}
	if (argv.file) {
		uploadContentArgs.push(...['--file', argv.file]);
	}
	if (argv.update) {
		uploadContentArgs.push(...['--update', argv.update]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlContent.name || argv._[0] === controlContent.alias) {
	let controlContentArgs = ['run', '-s', controlContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action,
		'--channel', argv.channel
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		controlContentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === addComponentToTheme.name || argv._[0] === addComponentToTheme.alias) {
	let addComponentToThemeArgs = ['run', '-s', addComponentToTheme.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.component,
		'--theme', argv.theme
	];
	if (argv.category) {
		addComponentToThemeArgs.push(...['--category', argv.category]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, addComponentToThemeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === removeComponentFromTheme.name || argv._[0] === removeComponentFromTheme.alias) {
	let removeComponentFromThemeArgs = ['run', '-s', removeComponentFromTheme.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--component', argv.component,
		'--theme', argv.theme
	];

	spawnCmd = childProcess.spawnSync(npmCmd, removeComponentFromThemeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlTheme.name || argv._[0] === controlTheme.alias) {
	let controlThemeArgs = ['run', '-s', controlTheme.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action,
		'--theme', argv.theme
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		controlThemeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlThemeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === listServerContentTypes.name || argv._[0] === listServerContentTypes.alias) {
	let listServerContentTypesArgs = ['run', '-s', listServerContentTypes.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		listServerContentTypesArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, listServerContentTypesArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === listResources.name || argv._[0] === listResources.alias) {
	let listArgs = ['run', '-s', listResources.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.types && typeof argv.types !== 'boolean') {
		listArgs.push(...['--types', argv.types]);
	}
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		listArgs.push(...['--server'], serverVal);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, listArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createSite.name || argv._[0] === createSite.alias) {
	let createSiteArgs = ['run', '-s', createSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template
	];
	if (argv.repository) {
		createSiteArgs.push(...['--repository', argv.repository]);
	}
	if (argv.localizationPolicy) {
		createSiteArgs.push(...['--localizationPolicy', argv.localizationPolicy]);
	}
	if (argv.defaultLanguage) {
		createSiteArgs.push(...['--defaultLanguage', argv.defaultLanguage]);
	}
	if (argv.description) {
		createSiteArgs.push(...['--description', argv.description]);
	}
	if (argv.sitePrefix) {
		createSiteArgs.push(...['--sitePrefix', argv.sitePrefix]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlSite.name || argv._[0] === controlSite.alias) {
	let controlSiteArgs = ['run', '-s', controlSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action,
		'--site', argv.site
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		controlSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === shareSite.name || argv._[0] === shareSite.alias) {
	let shareSiteArgs = ['run', '-s', shareSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users,
		'--role', argv.role
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		shareSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareSite.name || argv._[0] === unshareSite.alias) {
	let unshareSiteArgs = ['run', '-s', unshareSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === setSiteSecurity.name || argv._[0] === setSiteSecurity.alias) {
	let setSiteSecurityArgs = ['run', '-s', setSiteSecurity.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--signin', argv.signin
	];
	if (argv.access) {
		setSiteSecurityArgs.push(...['--access', argv.access]);
	}
	if (argv.addusers) {
		setSiteSecurityArgs.push(...['--addusers', argv.addusers]);
	}
	if (argv.deleteusers) {
		setSiteSecurityArgs.push(...['--deleteusers', argv.deleteusers]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		setSiteSecurityArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, setSiteSecurityArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === updateSite.name || argv._[0] === updateSite.alias) {
	let updateSiteArgs = ['run', '-s', updateSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		updateSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, updateSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === validateSite.name || argv._[0] === validateSite.alias) {
	let validateSiteArgs = ['run', '-s', validateSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		validateSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, validateSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === indexSite.name || argv._[0] === indexSite.alias) {
	let indexSiteArgs = ['run', '-s', indexSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site,
		'--contenttype', argv.contenttype
	];
	if (argv.publish) {
		indexSiteArgs.push(...['--publish', argv.publish]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		indexSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, indexSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createSiteMap.name || argv._[0] === createSiteMap.alias) {
	let createSiteMapArgs = ['run', '-s', createSiteMap.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site,
		'--url', argv.url
	];
	if (argv.changefreq) {
		createSiteMapArgs.push(...['--changefreq', argv.changefreq]);
	}
	if (argv.file) {
		createSiteMapArgs.push(...['--file', argv.file]);
	}
	if (argv.publish) {
		createSiteMapArgs.push(...['--publish', argv.publish]);
	}
	if (argv.languages) {
		createSiteMapArgs.push(...['--languages', argv.languages]);
	}
	if (argv.toppagepriority) {
		createSiteMapArgs.push(...['--toppagepriority', argv.toppagepriority]);
	}
	if (argv.newlink) {
		createSiteMapArgs.push(...['--newlink', argv.newlink]);
	}
	if (argv.noDefaultDetailPageLink) {
		createSiteMapArgs.push(...['--noDefaultDetailPageLink', argv.noDefaultDetailPageLink]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createSiteMapArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createSiteMapArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createRSSFeed.name || argv._[0] === createRSSFeed.alias) {
	let createRSSFeedArgs = ['run', '-s', createRSSFeed.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site,
		'--url', argv.url,
		'--query', argv.query,
		'--limit', argv.limit,
		'--orderby', argv.orderby
	];

	if (argv.template) {
		createRSSFeedArgs.push(...['--template', argv.template]);
	}
	if (argv.language) {
		createRSSFeedArgs.push(...['--language', argv.language]);
	}
	if (argv.title) {
		createRSSFeedArgs.push(...['--title', argv.title]);
	}
	if (argv.description) {
		createRSSFeedArgs.push(...['--description', argv.description]);
	}
	if (argv.ttl) {
		createRSSFeedArgs.push(...['--ttl', argv.ttl]);
	}
	if (argv.file) {
		createRSSFeedArgs.push(...['--file', argv.file]);
	}
	if (argv.publish) {
		createRSSFeedArgs.push(...['--publish', argv.publish]);
	}
	if (argv.newlink) {
		createRSSFeedArgs.push(...['--newlink', argv.newlink]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createRSSFeedArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createRSSFeedArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createAssetReport.name || argv._[0] === createAssetReport.alias) {
	let createAssetReportArgs = ['run', '-s', createAssetReport.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site
	];

	if (argv.output) {
		var outputVal = typeof argv.output === 'boolean' ? './' : argv.output;
		createAssetReportArgs.push(...['--output', outputVal]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createAssetReportArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createAssetReportArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createRepository.name || argv._[0] === createRepository.alias) {
	let createRepositoryArgs = ['run', '-s', createRepository.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.description) {
		createRepositoryArgs.push(...['--description', argv.description]);
	}
	if (argv.contenttypes) {
		createRepositoryArgs.push(...['--contenttypes', argv.contenttypes]);
	}
	if (argv.channels) {
		createRepositoryArgs.push(...['--channels', argv.channels]);
	}
	if (argv.defaultlanguage) {
		createRepositoryArgs.push(...['--defaultlanguage', argv.defaultlanguage]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createRepositoryArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createRepositoryArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlRepository.name || argv._[0] === controlRepository.alias) {
	let controlRepositoryArgs = ['run', '-s', controlRepository.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--action', argv.action,
		'--repository', argv.repository
	];

	if (argv.contenttypes) {
		controlRepositoryArgs.push(...['--contenttypes', argv.contenttypes]);
	}
	if (argv.channels) {
		controlRepositoryArgs.push(...['--channels', argv.channels]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		controlRepositoryArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlRepositoryArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === shareRepository.name || argv._[0] === shareRepository.alias) {
	let shareRepositoryArgs = ['run', '-s', shareRepository.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users,
		'--role', argv.role
	];
	if (argv.types) {
		shareRepositoryArgs.push(...['--types', argv.types]);
	}
	if (argv.typerole && typeof argv.typerole !== 'boolean') {
		shareRepositoryArgs.push(...['--typerole', argv.typerole]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		shareRepositoryArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareRepositoryArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareRepository.name || argv._[0] === unshareRepository.alias) {
	let unshareRepositoryArgs = ['run', '-s', unshareRepository.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users
	];
	if (argv.types) {
		unshareRepositoryArgs.push(...['--types', argv.types]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareRepositoryArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareRepositoryArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === shareType.name || argv._[0] === shareType.alias) {
	let shareTypeArgs = ['run', '-s', shareType.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users,
		'--role', argv.role
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		shareTypeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareTypeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareType.name || argv._[0] === unshareType.alias) {
	let unshareTypeArgs = ['run', '-s', unshareType.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareTypeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareTypeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createChannel.name || argv._[0] === createChannel.alias) {
	let createChannelArgs = ['run', '-s', createChannel.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.description) {
		createChannelArgs.push(...['--description', argv.description]);
	}
	if (argv.type) {
		createChannelArgs.push(...['--type', argv.type]);
	}
	if (argv.publishpolicy) {
		createChannelArgs.push(...['--publishpolicy', argv.publishpolicy]);
	}
	if (argv.localizationpolicy) {
		createChannelArgs.push(...['--localizationpolicy', argv.localizationpolicy]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createChannelArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createChannelArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createLocalizationPolicy.name || argv._[0] === createLocalizationPolicy.alias) {
	let createLocalizationPolicyArgs = ['run', '-s', createLocalizationPolicy.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--requiredlanguages', argv.requiredlanguages,
		'--defaultlanguage', argv.defaultlanguage
	];
	if (argv.description) {
		createLocalizationPolicyArgs.push(...['--description', argv.description]);
	}
	if (argv.optionallanguages) {
		createLocalizationPolicyArgs.push(...['--optionallanguages', argv.optionallanguages]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createLocalizationPolicyArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createLocalizationPolicyArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createTranslationJob.name || argv._[0] === createTranslationJob.alias) {
	let createTranslationJobArgs = ['run', '-s', createTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--site', argv.site,
		'--languages', argv.languages
	];
	if (argv.type) {
		createTranslationJobArgs.push(...['--type', argv.type]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createTranslationJobArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadTranslationJob.name || argv._[0] === downloadTranslationJob.alias) {
	let downloadTranslationJobArgs = ['run', '-s', downloadTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadTranslationJobArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadTranslationJob.name || argv._[0] === uploadTranslationJob.alias) {
	let uploadTranslationJobArgs = ['run', '-s', uploadTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	if (argv.folder && typeof argv.folder !== 'boolean') {
		uploadTranslationJobArgs.push(...['--folder', argv.folder]);
	}
	if (argv.validateonly) {
		uploadTranslationJobArgs.push(...['--validateonly', argv.validateonly]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadTranslationJobArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === listTranslationJobs.name || argv._[0] === listTranslationJobs.alias) {
	let listTranslationJobsArgs = ['run', '-s', listTranslationJobs.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		listTranslationJobsArgs.push(...['--server'], serverVal);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, listTranslationJobsArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === submitTranslationJob.name || argv._[0] === submitTranslationJob.alias) {
	let submitTranslationJobArgs = ['run', '-s', submitTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--connection', argv.connection
	];

	spawnCmd = childProcess.spawnSync(npmCmd, submitTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === ingestTranslationJob.name || argv._[0] === ingestTranslationJob.alias) {
	let ingestTranslationJobArgs = ['run', '-s', ingestTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	spawnCmd = childProcess.spawnSync(npmCmd, ingestTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === registerTranslationConnector.name || argv._[0] === registerTranslationConnector.alias) {
	let registerTranslationConnectorArgs = ['run', '-s', registerTranslationConnector.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--connector', argv.connector,
		'--server', argv.server,
		'--user', argv.user,
		'--password', argv.password
	];
	if (argv.fields) {
		registerTranslationConnectorArgs.push(...['--fields'], argv.fields);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, registerTranslationConnectorArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createTranslationConnector.name || argv._[0] === createTranslationConnector.alias) {
	let createTranslationConnectorArgs = ['run', '-s', createTranslationConnector.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	spawnCmd = childProcess.spawnSync(npmCmd, createTranslationConnectorArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === startTranslationConnector.name || argv._[0] === startTranslationConnector.alias) {
	let startTranslationConnectorArgs = ['run', '-s', startTranslationConnector.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.port) {
		startTranslationConnectorArgs.push(...['--port', argv.port]);
	}
	if (argv.debug) {
		startTranslationConnectorArgs.push(...['--debug']);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, startTranslationConnectorArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createFolder.name || argv._[0] === createFolder.alias) {
	let createFolderArgs = ['run', '-s', createFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		createFolderArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === shareFolder.name || argv._[0] === shareFolder.alias) {
	let shareFolderArgs = ['run', '-s', shareFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users,
		'--role', argv.role
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		shareFolderArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareFolder.name || argv._[0] === unshareFolder.alias) {
	let unshareFolderArgs = ['run', '-s', unshareFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--users', argv.users
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareFolderArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadFolder.name || argv._[0] === downloadFolder.alias) {
	let downloadFolderArgs = ['run', '-s', downloadFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.path
	];
	if (argv.folder && typeof argv.folder !== 'boolean') {
		downloadFolderArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadFolderArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadFolder.name || argv._[0] === uploadFolder.alias) {
	let uploadFolderArgs = ['run', '-s', uploadFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.path
	];
	if (argv.folder && typeof argv.folder !== 'boolean') {
		uploadFolderArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadFolderArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === deleteFolder.name || argv._[0] === deleteFolder.alias) {
	let deleteFolderArgs = ['run', '-s', deleteFolder.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.path
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		deleteFolderArgs.push(...['--server', argv.server]);
	}
	if (argv.permanent) {
		deleteFolderArgs.push(...['--permanent', argv.permanent]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deleteFolderArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadFile.name || argv._[0] === uploadFile.alias) {
	let uploadFileArgs = ['run', '-s', uploadFile.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file
	];
	if (argv.folder && typeof argv.folder !== 'boolean') {
		uploadFileArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadFileArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadFileArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadFile.name || argv._[0] === downloadFile.alias) {
	let downloadFileArgs = ['run', '-s', downloadFile.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file
	];
	if (argv.folder && typeof argv.folder !== 'boolean') {
		downloadFileArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadFileArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadFileArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createEncryptionKey.name || argv._[0] === createEncryptionKey.alias) {
	let createEncryptionKeyArgs = ['run', '-s', createEncryptionKey.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file
	];
	spawnCmd = childProcess.spawnSync(npmCmd, createEncryptionKeyArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === registerServer.name || argv._[0] === registerServer.alias) {
	let registerServerArgs = ['run', '-s', registerServer.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--endpoint', argv.endpoint,
		'--user', argv.user,
		'--password', argv.password
	];
	if (argv.key && typeof argv.key !== 'boolean') {
		registerServerArgs.push(...['--key'], argv.key);
	}
	if (argv.type) {
		registerServerArgs.push(...['--type'], argv.type);
	}
	if (argv.idcsurl) {
		registerServerArgs.push(...['--idcsurl'], argv.idcsurl);
	}
	if (argv.clientid) {
		registerServerArgs.push(...['--clientid'], argv.clientid);
	}
	if (argv.clientsecret) {
		registerServerArgs.push(...['--clientsecret'], argv.clientsecret);
	}
	if (argv.scope) {
		registerServerArgs.push(...['--scope'], argv.scope);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, registerServerArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === develop.name || argv._[0] === develop.alias) {
	let developArgs = ['run', '-s', develop.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.port) {
		developArgs.push(...['--port', argv.port]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		developArgs.push(...['--server', argv.server]);
	}
	if (argv.debug) {
		developArgs.push(...['--debug']);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, developArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === syncServer.name || argv._[0] === syncServer.alias) {
	let syncServerArgs = ['run', '-s', syncServer.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--server', argv.server,
		'--destination', argv.destination
	];
	if (argv.username && typeof argv.username !== 'boolean') {
		syncServerArgs.push(...['--username', argv.username]);
	}
	if (argv.password && typeof argv.password !== 'boolean') {
		syncServerArgs.push(...['--password', argv.password]);
	}
	if (argv.port) {
		syncServerArgs.push(...['--port', argv.port]);
	}
	if (argv.key && typeof argv.key !== 'boolean') {
		syncServerArgs.push(...['--key', argv.key]);
	}
	if (argv.certificate && typeof argv.certificate !== 'boolean') {
		syncServerArgs.push(...['--certificate', argv.certificate]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, syncServerArgs, {
		cwd,
		stdio: 'inherit'
	});
};

// see if need to show deprecation warning
_checkVersion();

// console.log(spawnCmd);
process.exit(spawnCmd ? spawnCmd.status : 0);