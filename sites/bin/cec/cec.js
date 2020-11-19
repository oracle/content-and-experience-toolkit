#!/usr/bin/env node

/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
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

var cwd = path.resolve('./');
const _isWindows = /^win/.test(process.platform) ? true : false;
if (_isWindows && cwd.endsWith(':\\')) {
	cwd = cwd.substring(0, cwd.length - 1);
}

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
			console.log(`${cwd} is not a Content and Experience project. Run this command from ${projectRoot}`);
			return false;
		} else {
			return true;
		}
	} else {
		console.log(`${cwd} is not a Content and Experience project. Run command cec install to set up first.`);
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

var getTranslationConnectorSources = function () {
	let connectorSources = fs.readdirSync(path.join(appRoot, 'data', 'connectors')).filter((item) => /\.zip$/.test(item)).map((zip) => zip.replace('.zip', ''));

	return connectorSources;
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
	const actions = ['publish', 'unpublish', 'add', 'remove'];
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
	const actions = ['add-type', 'remove-type', 'add-channel', 'remove-channel', 'add-taxonomy', 'remove-taxonomy'];
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

var getContentTypeRoles = function () {
	const roles = ['manager', 'contributor'];
	return roles;
};

var getServerTypes = function () {
	const roles = ['pod_ec', 'pod_ic', 'dev_ec', 'dev_pod', 'dev_osso'];
	return roles;
};

var getSyncServerAuths = function () {
	const auths = ['none', 'basic', 'header'];
	return auths;
};

var getSiteSignIn = function () {
	const roles = ['yes', 'no'];
	return roles;
};

var getSiteAccessNames = function () {
	var names = ['Cloud users', 'Visitors', 'Service users', 'Specific users'];
	return names;
};

var getGroupTypes = function () {
	var names = ['PUBLIC_OPEN', 'PUBLIC_CLOSED', 'PRIVATE_CLOSED'];
	return names;
};

var getGroupMemberRoles = function () {
	var names = ['MANAGER', 'MEMBER'];
	return names;
};

var getResourceTypes = function () {
	var names = ['channels', 'components', 'localizationpolicies', 'recommendations', 'repositories', 'sites', 'templates', 'taxonomies', 'translationconnectors'];
	return names;
};

var getTaxonomyStatus = function () {
	var names = ['promoted', 'published'];
	return names;
};

var getTaxonomyActions = function () {
	const actions = ['promote', 'publish', 'unpublish'];
	return actions;
};

var getWordTemplateTypes = function () {
	const types = ['form', 'table'];
	return types;
};

var getContentItemSources = function () {
	const sources = ['word'];
	return sources;
};

var updateTemplateActions = function () {
	const actions = ['rename-asset-id'];
	return actions;
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
			let desc = 'Creates a content layout based on a content type from a local template or from OCE server. By default, an "overview" content layout is created. Optionally specify -s <style> to create in a different style. ' +
				os.EOL + os.EOL + 'Valid values for <style> are: ' + os.EOL +
				'  detail' + os.EOL +
				'  overview' + os.EOL;
			return desc;
		})()
	},
	example: [
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate'],
		['cec create-contentlayout Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -s detail'],
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate -a', 'Add custom settings when used in Sites'],
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
		'short': 'Downloads the components <names> from the OCE server.',
		'long': (function () {
			let desc = 'Downloads the components <names> from the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file.';
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
		'short': 'Deploys the components <names> to the OCE server.',
		'long': (function () {
			let desc = 'Deploys the components <names> to the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to publish the component after deploy. Optionally specify -f <folder> to set the folder to upload the component zip file.';
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
		'short': 'Uploads the components <names> to the OCE server.',
		'long': (function () {
			let desc = 'Uploads the components <names> to the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to publish the component after deploy. Optionally specify -f <folder> to set the folder to upload the component zip file.';
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
		'short': 'Performs action <action> on components on OCE server.',
		'long': (function () {
			let desc = 'Perform <action> on components on OCE server. Specify the components with -c <components>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getComponentActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-component publish -c Comp1', 'Publish component Comp1 on the server specified in cec.properties file'],
		['cec control-component publish -c Comp1 -s UAT', 'Publish component Comp1 on the registered server UAT'],
		['cec control-component publish -c Comp1,Comp2 -s UAT', 'Publish component Comp1 and Comp2 on the registered server UAT']
	]
};

const shareComponent = {
	command: 'share-component <name>',
	alias: 'sc',
	name: 'share-component',
	usage: {
		'short': 'Shares component with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares component with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-component Comp1 -u user1,user2 -r manager', 'Share component Comp1 with user user1 and user2 and assign Manager role to them'],
		['cec share-component Comp1 -u user1,user2 -g group1,group2 -r manager', 'Share component Comp1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-component Comp1 -u user1,user2 -r manager -s UAT', 'Share component Comp1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareComponent = {
	command: 'unshare-component <name>',
	alias: 'usc',
	name: 'unshare-component',
	usage: {
		'short': 'Deletes user or group access to a component on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a component on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-component Comp1 -u user1,user2'],
		['cec unshare-component Comp1 -u user1,user2 -g group1,group2'],
		['cec unshare-component Comp1 -u user1,user2 -s UAT']
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
			desc = getTemplateSources().reduce((acc, item) => acc + '  ' + item + '\n', desc);
			desc = desc + os.EOL + ' To create template based on a site on OCE server, specify -s <site> and specify the server with -r <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec create-template Temp1'],
		['cec create-template Temp2 -f CafeSupremoLite'],
		['cec create-template Temp1 -s Site1', 'Create template Temp1 based on site Site1 on OCE server'],
		['cec create-template Temp1 -s Site1 -x', 'Create template Temp1 based on site Site1 on OCE server and exclude the content in the site'],
		['cec create-template Temp1 -s Site1 -r UAT', 'Create template Temp1 based on site Site1 on the registered server UAT'],
		['cec create-template EnterpriseTemp1 -s StandardSite1 -e', 'Create enterprise template EnterpriseTemp1 based on standard site StandardSite1 on OCE server'],
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
			let desc = 'Exports the template <name> as a zip file and provides the location of the zip file. ';
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
		'short': 'Deploys the template <name> to the OCE server.',
		'long': (function () {
			let desc = 'Deploys the template <name> to the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -f <folder> to set the folder to upload the template zip file.';
			return desc;
		})()
	},
	example: [
		['cec deploy-template StarterTemplate', 'Deploys the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -s UAT', 'Deploys the template StarterTemplate to the registered server UAT.'],
		['cec deploy-template StarterTemplate -f Import/Templates', 'Uploads file StarterTemplate.zip to folder Import/Templates and imports the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -o', 'Optimizes and deploys the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -x', 'Exclude the "Content Template" from the template upload. "Content Template" upload can be managed independently.']
	]
};

const uploadTemplate = {
	command: 'upload-template <name>',
	alias: 'ult',
	name: 'upload-template',
	usage: {
		'short': 'Uploads the template <name> to the OCE server.',
		'long': (function () {
			let desc = 'Uploads the template <name> to the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -f <folder> to set the folder to upload the template zip file.';
			desc = desc + ' Optionally specify -p to publish theme and components after import.';
			return desc;
		})()
	},
	example: [
		['cec upload-template StarterTemplate', 'Uploads the template StarterTemplate.'],
		['cec upload-template StarterTemplate -s UAT', 'Uploads the template StarterTemplate to the registered server UAT.'],
		['cec upload-template StarterTemplate -f Import/Templates', 'Uploads file StarterTemplate.zip to folder Import/Templates and imports the template StarterTemplate.'],
		['cec upload-template StarterTemplate -p', 'Publish the theme and all components in StarterTemplate.zip after import'],
		['cec upload-template StarterTemplate -o', 'Optimizes and uploads the template StarterTemplate.'],
		['cec upload-template StarterTemplate -x', 'Exclude the "Content Template" from the template upload. "Content Template" upload can be managed independently.'],
		['cec upload-template StarterTemplate -e', 'Exclude all components from the template upload. Components can be uploaded independently.']
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

const createTemplateReport = {
	command: 'create-template-report <name>',
	alias: 'cttr',
	name: 'create-template-report',
	usage: {
		'short': 'Generates an asset usage report for the template <name> package.',
		'long': (function () {
			let desc = 'Generates an asset usage report for the template <name> package. Optionally specify -o to save the report to a json file.';
			return desc;
		})()
	},
	example: [
		['cec create-template-report StarterTemplate'],
		['cec create-template-report StarterTemplate -o', 'The report will be saved to StarterTemplateAssetUsage.json at the current local location'],
		['cec create-template-report StarterTemplate -o ~/Documents', 'The report will be saved to ~/Documents/StarterTemplateAssetUsage.json'],
		['cec create-template-report StarterTemplate -o ~/Documents/StarterTemplateReport.json', 'The report will be saved to ~/Documents/StarterTemplateReport.json'],
		['cec create-template-report StarterTemplate -i', 'Include validating page links'],
	]
};

const cleanupTemplate = {
	command: 'cleanup-template <file>',
	alias: '',
	name: 'cleanup-template',
	usage: {
		'short': 'Cleans up a template package',
		'long': (function () {
			let desc = 'Cleans up a template package with a cleanup file generated by command create-template report.';
			return desc;
		})()
	},
	example: [
		['cec cleanup-template BlogTemplate_cleanup.json']
	]
};

const createTemplateFromSite = {
	command: 'create-template-from-site <name>',
	alias: 'ctfs',
	name: 'create-template-from-site',
	usage: {
		'short': 'Creates the template <name> from site <site> on the OCE server.',
		'long': (function () {
			let desc = 'Creates the template <name> from site <site> on the Content and Experience server. Specify the server with -r <server> or use the one specified in cec.properties file. Optionally specify <includeunpublishedassets> to include unpublished content items and digital assets in your template.';
			return desc;
		})()
	},
	example: [
		['cec create-template-from-site BlogTemplate -s BlogSite'],
		['cec create-template-from-site BlogTemplate -s BlogSite -r UAT'],
		['cec create-template-from-site BlogTemplate -s BlogSite -i -r UAT'],
		['cec create-template-from-site EnterpriseTemplate -s StandardSite -e'],
	]
};

const downloadTemplate = {
	command: 'download-template <name>',
	alias: 'dlt',
	name: 'download-template',
	usage: {
		'short': 'Downloads the template <name> from the OCE server.',
		'long': (function () {
			let desc = 'Downloads the template <name> from the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file.';
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
				'Optionally specify -d <debug> to start the compilation with --inspect-brk flag.\n' +
				'Optionally specify -r <recurse> recurse through all child pages of specified pages.\n' +
				'Optionally specify -l <includeLocale> include default locale when creating pages.\n' +
				'Optionally specify -a <targetDevice> [desktop | mobile] target device type when using adaptive layouts.\n' +
				'Optionally specify -v <verbose> to display all warning messages during compilation.\n' +
				'Optionally specify -i <ignoreErrors> ignore compilation errors when calculating the exit code for the process.\n';
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
		'short': 'Deletes the template <name> on the OCE server.',
		'long': (function () {
			let desc = 'Deletes the template <name> on the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -p to permanently delete the template.';
			return desc;
		})()
	},
	example: [
		['cec delete-template BlogTemplate'],
		['cec delete-template BlogTemplate -p'],
		['cec delete-template BlogTemplate -s UAT']
	]
};

const shareTemplate = {
	command: 'share-template <name>',
	alias: 'stm',
	name: 'share-template',
	usage: {
		'short': 'Shares template with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares template with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-template Template1 -u user1,user2 -r manager', 'Share template Template1 with user user1 and user2 and assign Manager role to them'],
		['cec share-template Template1 -u user1,user2 -g group1,group2 -r manager', 'Share template Template1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-template Template1 -u user1,user2 -r manager -s UAT', 'Share template Template1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareTemplate = {
	command: 'unshare-template <name>',
	alias: 'ustm',
	name: 'unshare-template',
	usage: {
		'short': 'Deletes user or group access to a template on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a template on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-template Template1 -u user1,user2'],
		['cec unshare-template Template1 -u user1,user2 -g group1,group2'],
		['cec unshare-template Template1 -u user1,user2 -s UAT']
	]
};

const updateTemplate = {
	command: 'update-template <action>',
	alias: 'ut',
	name: 'update-template',
	usage: {
		'short': 'Performs action on a local template.',
		'long': (function () {
			let desc = 'Performs action <action> on a local template. ';
			desc = desc + 'Optionally specify -c for other local content.  The valid actions are\n\n';
			return updateTemplateActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec update-template rename-asset-id -t Template1'],
		['cec update-template rename-asset-id -t Template1 -c Content1,Content2']
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
		'short': 'Creates content type and content layout mapping.',
		'long': (function () {
			let desc = 'Creates content type and content layout mapping. By default, the mapping is set for "Default". Optionally specify -s <layoutstyle> to name the mapping. By default, the mapping is set for desktop. Optionally specify -m to set the mapping for mobile.';
			return desc;
		})()
	},
	example: [
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate'],
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -m'],
		['cec add-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -s Details'],
		['cec add-contentlayout-mapping Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate -s "Content List Default"'],
		['cec add-contentlayout-mapping Blog-Post-Overview-Layout -c Blog-Post -t BlogTemplate -s Overview'],
		['cec add-contentlayout-mapping Blog-Post-Overview-Layout -c Blog-Post -r UAT', 'Set "Content Item Default" to Blog-Post-Overview-Layout for content type Blog-Post on server UAT']
	]
};

const removeContentLayoutMapping = {
	command: 'remove-contentlayout-mapping <contentlayout>',
	alias: 'rclm',
	name: 'remove-contentlayout-mapping',
	usage: {
		'short': 'Removes a content layout mapping.',
		'long': (function () {
			let desc = 'Removes a content layout mapping. By default, all mappings for the content layout are removed. Optionally specify -s <layoutstyle> to name the mapping and -m to indicate the mobile mapping.';
			return desc;
		})()
	},
	example: [
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate -m'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -r UAT'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -s Details -r UAT']
	]
};

const addFieldEditor = {
	command: 'add-field-editor <name>',
	alias: 'afe',
	name: 'add-field-editor',
	usage: {
		'short': 'Adds a field editor to a field in a content type.',
		'long': (function () {
			let desc = 'Adds a field editor to a field in a content type. ';
			return desc;
		})()
	},
	example: [
		['cec add-field-editor editor1 -t BlogTemplate -c BlogPost -f summary',
			'Use editor1 as the appearance for field summary in content type BlogPost from local template at src/templates/BlogTemplate'
		],
		['cec add-field-editor editor1 -t BlogTemplateContent -n -c BlogPost -f summary',
			'Use editor1 as the appearance for field summary in content type BlogPost from local template at src/content/BlogTemplateContent'
		]
	]
};

const removeFieldEditor = {
	command: 'remove-field-editor <name>',
	alias: 'rfe',
	name: 'remove-field-editor',
	usage: {
		'short': 'Removes a field editor from a field in a content type.',
		'long': (function () {
			let desc = 'Removes a field editor from a field in a content type. ';
			return desc;
		})()
	},
	example: [
		['cec remove-field-editor editor1 -t BlogTemplate -c BlogPost -f summary',
			'Remove editor1 as the appearance for field summary in content type BlogPost from local template at src/templates/BlogTemplate'
		],
		['cec remove-field-editor editor1 -t BlogTemplateContent -n -c BlogPost -f summary',
			'Remove editor1 as the appearance for field summary in content type BlogPost from local template at src/content/BlogTemplateContent'
		]
	]
};

const addContentForm = {
	command: 'add-content-form <name>',
	alias: 'acf',
	name: 'add-content-form',
	usage: {
		'short': 'Associates a content form with a content type.',
		'long': (function () {
			let desc = 'Associates a content form with a content type to create or edit content items of this type.';
			return desc;
		})()
	},
	example: [
		['cec add-content-form form1 -t BlogTemplate -c BlogPost',
			'Associate content form form1 with content type BlogPost from local template at src/templates/BlogTemplate'
		],
		['cec add-content-form form1 -t BlogTemplateContent -n -c BlogPost',
			'Associate content form form1 with content type BlogPost from local template at src/content/BlogTemplateContent'
		]
	]
};

const removeContentForm = {
	command: 'remove-content-form <name>',
	alias: 'rcf',
	name: 'remove-content-form',
	usage: {
		'short': 'Removes a content form from a content type.',
		'long': (function () {
			let desc = 'Removes a content form from a content type. ';
			return desc;
		})()
	},
	example: [
		['cec remove-content-form form1 -t BlogTemplate -c BlogPost',
			'Change not to use form1 when create or edit items of type BlogPost from local template at src/templates/BlogTemplate'
		],
		['cec remove-content-form form1 -t BlogTemplateContent -n -c BlogPost',
			'Change not to use form1 when create or edit items of type BlogPost from local template at src/content/BlogTemplateContent'
		]
	]
};

const downloadContent = {
	command: 'download-content',
	alias: 'dlc',
	name: 'download-content',
	usage: {
		'short': 'Downloads content from OCE server.',
		'long': (function () {
			let desc = 'Downloads content from OCE server. By default all assets are downloaded, optionally specify -p to download only published assets. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec download-content Site1Channel', 'Download all assets in channel Site1Channel and save to local folder src/content/Site1Channel'],
		['cec download-content Site1Channel -n Site1Assets', 'Download all assets in channel Site1Channel and save to local folder src/content/Site1Assets'],
		['cec download-content Site1Channel -p', 'Download published assets in channel Site1Channel'],
		['cec download-content Site1Channel -s UAT', 'Download all assets in channel Site1Channel on server UAT'],
		['cec download-content Site1Channel -q \'fields.category eq "RECIPE"\'', 'Download assets from the channel Site1Channel, matching the query, plus any dependencies'],
		['cec download-content Site1Channel -r Repo1 -c Collection1', 'Download assets from the repository Repo1, collection Collection1 and channel Site1Channel'],
		['cec download-content Site1Channel -r Repo1 -c Collection1 -q \'fields.category eq "RECIPE"\'', 'Download assets from repository Repo1, collection Collection1 and channel Site1Channel, matching the query, plus any dependencies'],
		['cec download-content -a GUID1,GUID2', 'Download asset GUID1 and GUID2 and all their dependencies'],
		['cec download-content -r Repo1', 'Download assets from the repository Repo1']
	]
};

const uploadContent = {
	command: 'upload-content <name>',
	alias: 'ulc',
	name: 'upload-content',
	usage: {
		'short': 'Uploads local content to a repository on OCE server.',
		'long': (function () {
			let desc = 'Uploads local content from channel <name>, template <name> or local file <name> to repository <repository> on OCE server. Specify -c <channel> to add the template content to channel. Optionally specify -l <collection> to add the content to collection. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec upload-content Site1Channel -r Repo1', 'Upload content to repository Repo1, creating new items, and add to channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -u', 'Upload content to repository Repo1, updating existing content to create new versions, and add to channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -l Site1Collection', 'Upload content to repository Repo1 and add to collection Site1Collection and channel Site1Channel'],
		['cec upload-content Site1Channel -r Repo1 -p', 'Upload content types from content SiteChannel to the server'],
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
		'short': 'Performs action <action> on channel items on OCE server.',
		'long': (function () {
			let desc = 'Performs action <action> on channel items on OCE server. Specify the channel with -c <channel>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getContentActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-content publish -c Channel1', 'Publish all items in channel Channel1 on the server specified in cec.properties file'],
		['cec control-content publish -c Channel1 -a GUID1,GUID2', 'Publish asset GUID1 and GUID2 in channel Channel1'],
		['cec control-content publish -c Channel1 -s UAT', 'Publish all items in channel Channel1 on the registered server UAT'],
		['cec control-content unpublish -c Channel1 -s UAT', 'Unpublish all items in channel Channel1 on the registered server UAT'],
		['cec control-content add -c Channel1 -r Repo1 -s UAT', 'Add all items in repository Repo1 to channel Channel1 on the registered server UAT'],
		['cec control-content add -c Channel1 -r Repo1 -a GUID1,GUID2 -s UAT', 'Add asset GUID1 and GUID2 in repository Repo1 to channel Channel1'],
		['cec control-content remove -c Channel1 -s UAT', 'Remove all items in channel Channel1 on the registered server UAT'],
		['cec control-content add -l Collection1 -r Repo1 -s UAT', 'Add all items in repository Repo1 to collection Collection1 on the registered server UAT'],
		['cec control-content remove -l Collection -s UAT', 'Remove all items in collection Collection1 on the registered server UAT']
	]
};

const copyAssets = {
	command: 'copy-assets <repository>',
	alias: 'ca',
	name: 'copy-assets',
	usage: {
		'short': 'Copies assets to another repository on OCE server.',
		'long': (function () {
			let desc = 'Copies assets to another repository on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec copy-assets Repo1 -t Repo2', 'Copy all assets in repository Repo1 to Repo2'],
		['cec copy-assets Repo1 -t Repo2 -s UAT', 'Copy all assets in repository Repo1 to Repo2 on server UAT'],
		['cec copy-assets Repo1 -a GUID1,GUID2 -t Repo2', 'Copy asset GUID1 and GUID2 and all their dependencies in Repo1 to Repo2'],
		['cec copy-assets Repo1 -q \'fields.category eq "RECIPE"\' -t Repo2', 'Copy assets from repository Repo1, matching the query, plus any dependencies to Repo2'],
		['cec copy-assets Repo1 -c Channel1 -t Repo2', 'Copy assets from the repository Repo1 and channel Channel1 to Repo2'],
		['cec copy-assets Repo1 -l Collection1 -t Repo2', 'Copy assets from the repository Repo1 and collection Collection1 to Repo2'],
		['cec copy-assets Repo1 -c Channel1 -q \'fields.category eq "RECIPE"\' -t Repo2', 'Copy assets from repository Repo1, channel Channel1, matching the query, plus any dependencies to Repo2']
	]
};

const downloadTaxonomy = {
	command: 'download-taxonomy <name>',
	alias: 'dltx',
	name: 'download-taxonomy',
	usage: {
		'short': 'Downloads a taxonomy from OCE server.',
		'long': (function () {
			let desc = 'Downloads a taxonomy from OCE server. Optionally specify the taxonomy id with -i <id> if another taxonomy has the same name. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Specify the status of the taxonomy with -t and the valid values are\n\n';
			return getTaxonomyStatus().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec download-taxonomy Taxonomy1 -t promoted'],
		['cec download-taxonomy Taxonomy1 -i 6A6DC736572C468B90F2A1C17B7CE5E4 -t promoted'],
		['cec download-taxonomy Taxonomy1 -t published -s UAT']
	]
};

const uploadTaxonomy = {
	command: 'upload-taxonomy <taxonomy>',
	alias: 'ultx',
	name: 'upload-taxonomy',
	usage: {
		'short': 'Uploads a taxonomy to OCE server.',
		'long': (function () {
			let desc = 'Uploads a taxonomy to OCE server. Specify -c <createnew> to create new taxonomy when one already exists. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec upload-taxonomy Taxonomy1', 'Create a new taxonomy or a draft of existing taxonomy on upload'],
		['cec upload-taxonomy Taxonomy1 -s UAT', 'Create a new taxonomy or a draft of existing taxonomy on upload on the registered server UAT'],
		['cec upload-taxonomy Taxonomy1 -c', 'Create a new taxonomy on upload'],
		['cec upload-taxonomy Taxonomy1 -c -n Taxonomy1_2 -a t12 -d "Taxonomy1 copy"', 'Create a new taxonomy on upload with given name, abbreviation and description'],
		['cec upload-taxonomy ~/Documents/6A6DC736572C468B90F2A1C17B7CE5E4.json -f ', 'Create a new taxonomy or a draft of existing taxonomy on upload the JSON file']
	]
};

const controlTaxonomy = {
	command: 'control-taxonomy <action>',
	alias: 'cttx',
	name: 'control-taxonomy',
	usage: {
		'short': 'Performs action on taxonomy on OCE server.',
		'long': (function () {
			let desc = 'Perform <action> on taxonomy on OCE server. Specify the taxonomy with -n <name> or -i <id>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getTaxonomyActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-taxonomy promote -n Taxonomy1', 'Promote taxonomy Taxonomy1 and allow publishing'],
		['cec control-taxonomy promote -i 6A6DC736572C468B90F2A1C17B7CE5E4 -p false', 'Promote the taxonomy and not allow publishing'],
		['cec control-taxonomy publish -n Taxonomy1 -c Channel1,Channel2'],
		['cec control-taxonomy unpublish -n Taxonomy1 -c Channel1'],
		['cec control-taxonomy publish -n Taxonomy1 -c Channel1 -s UAT']
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
		'short': 'Performs action <action> on theme on OCE server.',
		'long': (function () {
			let desc = 'Perform <action> on theme on OCE server. Specify the theme with -t <theme>. Specify the server with -s <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getThemeActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-theme publish -t Theme1', 'Publish theme Theme1 on the server specified in cec.properties file'],
		['cec control-theme publish -t Theme1 -s UAT', 'Publish theme Theme1 on the registered server UAT']
	]
};

const shareTheme = {
	command: 'share-theme <name>',
	alias: 'sth',
	name: 'share-theme',
	usage: {
		'short': 'Shares theme with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares theme with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-theme Theme1 -u user1,user2 -r manager', 'Share theme Theme1 with user user1 and user2 and assign Manager role to them'],
		['cec share-theme Theme1 -u user1,user2 -g group1,group2 -r manager', 'Share theme Theme1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-theme Theme1 -u user1,user2 -r manager -s UAT', 'Share theme Theme1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareTheme = {
	command: 'unshare-theme <name>',
	alias: 'usth',
	name: 'unshare-theme',
	usage: {
		'short': 'Deletes user or group access to a theme on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a theme on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-theme Theme1 -u user1,user2'],
		['cec unshare-theme Theme1 -u user1,user2 -g group1,group2'],
		['cec unshare-theme Theme1 -u user1,user2 -s UAT']
	]
};

const listResources = {
	command: 'list',
	alias: 'l',
	name: 'list',
	usage: {
		'short': 'Lists local or server resources.',
		'long': (function () {
			let desc = 'Lists local or server resources such components and templates. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -t <types> to list specific types of resources on the OCE server. ' +
				os.EOL + os.EOL + 'Valid values for <types> on the server are: ' + os.EOL + os.EOL;
			return getResourceTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);
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
			let desc = 'Create Enterprise Site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec create-site Site1 -t StandardTemplate', 'Creates a standard site'],
		['cec create-site Site1 -t Template1 -r Repository1 -l LocalizationPolicy1 -d en-US', 'Creates an enterprise site with localization policy LocalizationPolicy1'],
		['cec create-site Site1 -t Template1 -r Repository1 -d en-US', 'Creates an enterprise site and uses the localization policy in Template1'],
		['cec create-site Site1 -t Template1 -r Repository1 -d en-US -s UAT', 'Creates an enterprise site on server UAT'],
		['cec create-site Site1 -t Template1 -u -r Repository1 -d en-US -s UAT', 'Creates an enterprise site on server UAT and keep the existing id for assets']
	]
};

const controlSite = {
	command: 'control-site <action>',
	alias: 'cts',
	name: 'control-site',
	usage: {
		'short': 'Performs action <action> on site on OCE server.',
		'long': (function () {
			let desc = 'Perform <action> on site on OCE server. Specify the site with -s <site>. Specify the server with -r <server> or use the one specified in cec.properties file. The valid actions are\n\n';
			return getSiteActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-site publish -s Site1', 'Publish site Site1 on the server specified in cec.properties file'],
		['cec control-site publish -s Site1 -u ', "Publish the site and all assets added to the site's pages"],
		['cec control-site publish -s Site1 -c ', 'Compile and publish site Site1'],
		['cec control-site publish -s Site1 -t ', 'Only publish the static files of site Site1'],
		['cec control-site publish -s Site1 -f ', 'Do a full publish of Site1'],
		['cec control-site publish -s Site1 -r UAT', 'Publish site Site1 on the registered server UAT'],
		['cec control-site unpublish -s Site1 -r UAT', 'Unpublish site Site1 on the registered server UAT'],
		['cec control-site bring-online -s Site1 -r UAT', 'Bring site Site1 online on the registered server UAT'],
		['cec control-site take-offline -s Site1 -r UAT', 'Take site Site1 offline on the registered server UAT']
	]
};

const transferSite = {
	command: 'transfer-site <name>',
	alias: 'ts',
	name: 'transfer-site',
	usage: {
		'short': 'Transfers a site from one OCE server to another.',
		'long': (function () {
			let desc = 'Transfers a site from one OCE server to another. By default all assets are transferred, optionally specify -p to transfer only published assets. Specify the source server with -s <server> and the destination server with -d <destination>.';
			return desc;
		})()
	},
	example: [
		['cec transfer-site Site1 -s DEV -d UAT -r Repository1 -l LocalizationPolicy1', 'Creates site Site1 on server UAT based on site Site1 on server DEV'],
		['cec transfer-site Site1 -s DEV -d UAT -r Repository1 -l LocalizationPolicy1 -p', 'Creates site Site1 on server UAT based on site Site1 on server DEV with published assets'],
		['cec transfer-site Site1 -s DEV -d UAT -r Repository1 -l LocalizationPolicy1 -x', 'Creates site Site1 on server UAT based on site Site1 on server DEV without content'],
		['cec transfer-site Site1 -s DEV -d UAT -r Repository1 -l LocalizationPolicy1 -e', 'Creates site Site1 on server UAT based on site Site1 on server DEV without transferring components to server UAT'],
		['cec transfer-site Site1 -s DEV -d UAT -r Repository1 -l LocalizationPolicy1 -i', 'Creates site Site1 on server UAT based on site Site1 on server DEV with static files from DEV'],
		['cec transfer-site Site1 -s DEV -d UAT', 'Updates site Site1 on server UAT based on site Site1 on server DEV'],
		['cec transfer-site StandardSite1 -s DEV -d UAT', 'Creates standard site on server UAT based on site StandardSite1 on server DEV']
	]
};

const transferSiteContent = {
	command: 'transfer-site-content <name>',
	alias: 'tsc',
	name: 'transfer-site-content',
	usage: {
		'short': 'Creates scripts to transfer site content from one OCE server to another.',
		'long': (function () {
			let desc = 'Creates scripts to transfer Enterprise Site content from one OCE server to another. This command is used to transfer large number of content items and the items are transferred in batches. By default the scripts will not be executed by this command. By default all assets are transferred, optionally specify -p to transfer only published assets. Specify the source server with -s <server> and the destination server with -d <destination>. ';
			desc = desc + 'Optionally specify -n for the number of items in each batch, defaults to 500.';
			desc = desc + ' If the site contains assets from other repositories, optionally provide the repository mapping otherwise all assets will be uploaded into the same repository.';
			return desc;
		})()
	},
	example: [
		['cec transfer-site-content Site1 -s DEV -d UAT -r Repository1', 'Generate script Site1_downloadcontent and Site1_uploadcontent'],
		['cec transfer-site-content Site1 -s DEV -d UAT -r Repository1 -e', 'Generate script Site1_downloadcontent and Site1_uploadcontent and execute them'],
		['cec transfer-site-content Site1 -s DEV -d UAT -r Repository1 -n 200'],
		['cec transfer-site-content Site1 -s DEV -d UAT -r Repository1 -p'],
		['cec transfer-site-content Site1 -s DEV -d UAT -r Repository1 -m "Shared Images:Shared Images,Shared Video:Shared Video"']
	]
};

const shareSite = {
	command: 'share-site <name>',
	alias: 'ss',
	name: 'share-site',
	usage: {
		'short': 'Shares site with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares site with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-site Site1 -u user1,user2 -r manager', 'Share site Site1 with user user1 and user2 and assign Manager role to them'],
		['cec share-site Site1 -u user1,user2 -g group1,group2 -r manager', 'Share site Site1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-site Site1 -u user1,user2 -r manager -s UAT', 'Share site Site1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareSite = {
	command: 'unshare-site <name>',
	alias: 'uss',
	name: 'unshare-site',
	usage: {
		'short': 'Deletes user or group access to a site on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-site Site1 -u user1,user2'],
		['cec unshare-site Site1 -u user1,user2 -g group1,group2'],
		['cec unshare-site Site1 -u user1,user2 -s UAT']
	]
};

const getSiteSecurity = {
	command: 'get-site-security <name>',
	alias: 'gss',
	name: 'get-site-security',
	usage: {
		'short': 'Gets site security on OCE server.',
		'long': (function () {
			let desc = 'Gets site security on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec get-site-security Site1'],
		['cec get-site-security Site1 -s UAT']
	]
};

const setSiteSecurity = {
	command: 'set-site-security <name>',
	alias: 'sss',
	name: 'set-site-security',
	usage: {
		'short': 'Sets site security on OCE server.',
		'long': (function () {
			let desc = 'Makes the site publicly available to anyone, restrict the site to registered users, or restrict the site to specific users.  ' +
				'Specify the server with -r <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -a <access> to set who can access the site. ' +
				'The valid group names are\n\n';
			return getSiteAccessNames().reduce((acc, item) => acc + '  ' + item + '\n', desc);
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
			let desc = 'Validates site <name> on OCE server before publish or view publishing failure. Specify the server with -s <server> or use the one specified in cec.properties file.';
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
			let desc = 'Update Enterprise Site on OCE server using the content from the template. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec update-site Site1 -t Template1', 'Updates site Site1 using the content from template Template1'],
		['cec update-site Site1 -t Template1 -x', 'Updates site Site1 using the content from template Template1 excluding the "Content Template"']
	]
};


const indexSite = {
	command: 'index-site <site>',
	alias: 'is',
	name: 'index-site',
	usage: {
		'short': 'Index the page content of site <site> on OCE server.',
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
		'short': 'Creates a site map for site <site> on OCE server.',
		'long': (function () {
			let desc = 'Creates a site map for site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -p to upload the site map to OCE server after creation. ' +
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
		'short': 'Creates RSS feed for site <site> on OCE server.',
		'long': (function () {
			let desc = 'Creates RSS feed for site <site> on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify -x <template> to specify the RSS template. Optionally specify -p to upload the RSS feed to OCE server after creation.';
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
		'short': 'Generates an asset usage report for site <site> on OCE server.',
		'long': (function () {
			let desc = 'Generates an asset usage report for site <site> on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
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

const uploadStaticSite = {
	command: 'upload-static-site-files <path>',
	alias: 'ulss',
	name: 'upload-static-site-files',
	usage: {
		'short': 'Uploads files to render statically from a site on OCE server.',
		'long': (function () {
			let desc = 'Uploads files to render statically from a site on OCE server. Specify the site <site> on the server. Specify the server with -r <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec upload-static-site-files ~/Documents/localBlog -s BlogSite'],
		['cec upload-static-site-files ~/Documents/localBlog -s BlogSite -r UAT']
	]
};

const downloadStaticSite = {
	command: 'download-static-site-files <site>',
	alias: 'dlss',
	name: 'download-static-site-files',
	usage: {
		'short': 'Downloads the static files from a site on OCE server.',
		'long': (function () {
			let desc = 'Downloads the static files from a site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			desc = desc + 'Optionally specify -f <folder> to save the files on the local system.';
			return desc;
		})()
	},
	example: [
		['cec download-static-site-files BlogSite', 'Download the files and save to local folder src/documents/BlogSite/static'],
		['cec download-static-site-files BlogSite -f ~/Documents/BlogSite/static', 'Download the files and save to local folder ~/Documents/BlogSite/static'],
		['cec download-static-site-files BlogSite -s UAT']
	]
};

const deleteStaticSite = {
	command: 'delete-static-site-files <site>',
	alias: '',
	name: 'delete-static-site-files',
	usage: {
		'short': 'Deletes the static files from a site on OCE server.',
		'long': (function () {
			let desc = 'Deletes the static files from a site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec delete-static-site-files BlogSite'],
		['cec delete-static-site-files BlogSite -s UAT']
	]
};

const refreshPrerenderCache = {
	command: 'refresh-prerender-cache <site>',
	alias: 'rpc',
	name: 'refresh-prerender-cache',
	usage: {
		'short': 'Refreshes pre-render cache for a site on OCE server.',
		'long': (function () {
			let desc = 'Refreshes pre-render cache for a site on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec refresh-prerender-cache BlogSite'],
		['cec refresh-prerender-cache BlogSite -s UAT']
	]
};

const migrateSite = {
	command: 'migrate-site <site>',
	alias: 'ms',
	name: 'migrate-site',
	usage: {
		'short': 'Migrates a site from OCI IC server to EC server.',
		'long': (function () {
			let desc = 'Migrates a site from OCI IC server to EC server. Specify the IC server with -s <server> and the EC server with -d <destination>.';
			return desc;
		})()
	},
	example: [
		['cec migrate-site Site1 -s ICServer -d ECServer -r Repo1', 'Migrates site Site1 from ICServer to ECServer'],
		['cec migrate-site Site1 -s ICServer -d ECServer -r Repo1 -n newSite', 'Migrates site Site1 from ICServer to ECServer and rename to newSite'],
		['cec migrate-site Site1 -d ECServer -t ~/Documents/Site1Template.zip -r Repo1', 'Migrates site Site1 to ECServer with template Site1Template.zip from IC server']
	]
};

const migrateContent = {
	command: 'migrate-content <name>',
	alias: 'mc',
	name: 'migrate-content',
	usage: {
		'short': 'Migrates content from OCI IC server to EC server.',
		'long': (function () {
			let desc = 'Migrates content from OCI IC server to EC server. Specify the IC server with -s <server> and the EC server with -d <destination>.';
			return desc;
		})()
	},
	example: [
		['cec migrate-content collection1 -s ICServer -d ECServer -r Repo1', 'Migrates content from collection collection1 on ICServer to repository Repo1 on ECServer'],
		['cec migrate-content collection1 -s ICServer -d ECServer -r Repo1 -l newCollection', 'Migrates content from collection collection1 on ICServer to repository Repo1 and collection newCollection on ECServer'],
		['cec migrate-content collection1 -s ICServer -d ECServer -r Repo1 -l newCollection -c channel1', 'Migrates content from collection collection1 on ICServer to repository Repo1, collection newCollection and channel channel1 on ECServer']
	]
};

const renameContentType = {
	command: 'rename-content-type <name>',
	alias: 'rct',
	name: 'rename-content-type',
	usage: {
		'short': 'Renames content type in the local content.',
		'long': (function () {
			let desc = 'Renames content type with <newname> in local content. Optionally specify -t for the content in a local site template.';
			return desc;
		})()
	},
	example: [
		['cec rename-content-type Image -n My-Image -c blog1', 'Rename content type Image to My-Image in local content blog1'],
		['cec rename-content-type Image -n My-Image -c blog1Temp -t', 'Rename content type Image to My-Image in local site template blog1Temp']
	]
};

const createRepository = {
	command: 'create-repository <name>',
	alias: 'cr',
	name: 'create-repository',
	usage: {
		'short': 'Creates a repository on OCE server.',
		'long': (function () {
			let desc = 'Creates a repository on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -d <description> to set the description. ' +
				'Optionally specify -t <contenttypes> to set the content types. ' +
				'Optionally specify -c <channels> to set the publishing channels. ' +
				'Optionally specify -l <defaultlanguage> to set the default language.';
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
		'short': 'Performs action <action> on repositories on OCE server.',
		'long': (function () {
			let desc = 'Performs action <action> on repositories on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid actions are\n\n';
			return getRepositoryActions().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec control-repository add-type -r Repo1 -t Blog,Author'],
		['cec control-repository add-type -r Repo1,Repo2 -t Blog,Author'],
		['cec control-repository add-type -r Repo1 -t Blog,Author -s UAT'],
		['cec control-repository remove-type -r Repo1 -t Blog,Author'],
		['cec control-repository add-channel -r Repo1 -c channel1,channel2'],
		['cec control-repository remove-channel -r Repo1 -c channel1,channel2'],
		['cec control-repository add-taxonomy -r Repo1 -x Taxonomy1,Taxonomy2'],
		['cec control-repository remove-taxonomy -r Repo1 -x Taxonomy1,Taxonomy2']
	]
};

const shareRepository = {
	command: 'share-repository <name>',
	alias: 'sr',
	name: 'share-repository',
	usage: {
		'short': 'Shares repository with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares repository with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t to also share the content types in the repository with the users. ' +
				'Optionally specify -y <typerole> to share the types with different role. ' +
				'The valid roles for a repository are' + os.EOL + os.EOL;
			desc = getResourceRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
			desc = desc + os.EOL + 'The valid roles for a type are ' + os.EOL + os.EOL;
			desc = getContentTypeRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
			return desc;
		})()
	},
	example: [
		['cec share-repository Repo1 -u user1,user2 -r manager', 'Share repository Repo1 with user user1 and user2 and assign Manager role to them'],
		['cec share-repository Repo1 -u user1,user2 -g group1,group2 -r manager', 'Share repository Repo1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
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
		'short': 'Deletes user or group access to a repository on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a repository on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t to also delete the user or group access to the content types in the repository.';
			return desc;
		})()
	},
	example: [
		['cec unshare-repository Repo1 -u user1,user2 '],
		['cec unshare-repository Repo1 -u user1,user2 -g group1,group2'],
		['cec unshare-repository Repo1 -u user1,user2 -s UAT'],
		['cec unshare-repository Repo1 -u user1,user2 -t']
	]
};

const shareType = {
	command: 'share-type <name>',
	alias: 'st',
	name: 'share-type',
	usage: {
		'short': 'Shares type with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares type with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getContentTypeRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-type BlogType -u user1,user2 -r manager', 'Share type BlogType with user user1 and user2 and assign Manager role to them'],
		['cec share-type BlogType -u user1,user2 -g group1,group2 -r manager', 'Share type BlogType with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-type BlogType -u user1,user2 -r manager -s UAT', 'Share type BlogType with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareType = {
	command: 'unshare-type <name>',
	alias: 'ust',
	name: 'unshare-type',
	usage: {
		'short': 'Deletes user or group access to a type on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a type on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-type BlogType -u user1,user2 '],
		['cec unshare-type BlogType -u user1,user2 -g group1,group2'],
		['cec unshare-type BlogType -u user1,user2 -s UAT']
	]
};

const downloadType = {
	command: 'download-type <name>',
	alias: 'dltp',
	name: 'download-type',
	usage: {
		'short': 'Downloads types from OCE server.',
		'long': (function () {
			let desc = 'Downloads types from OCE server. The content field editors and forms for the types will also be downloaded. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec download-type BlogType', 'Download content type BlogType and save to local folder src/types/BlogType'],
		['cec download-type BlogType,BlogAuthor', 'Download content type BlogType and BlogAuthor and save to local folder'],
		['cec download-type BlogType -s UAT']
	]
};

const uploadType = {
	command: 'upload-type <name>',
	alias: 'ultp',
	name: 'upload-type',
	usage: {
		'short': 'Uploads types to OCE server.',
		'long': (function () {
			let desc = 'Uploads types to OCE server. The content field editors and forms for the types will also be uploaded. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec upload-type BlogType'],
		['cec download-type BlogType -s UAT'],
		['cec download-type BlogAuthor,BlogType', 'Place the referenced types first']
	]
};

const createWordTemplate = {
	command: 'create-word-template <type>',
	alias: 'cwt',
	name: 'create-word-template',
	usage: {
		'short': 'Creates Microsoft Word template for a type on OCE server.',
		'long': (function () {
			let desc = 'Creates Microsoft Word template for a type on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			desc = desc + 'Optionally specify format with -f <format>, defaults to form.' +
				os.EOL + os.EOL + 'Valid values for <format> are: ' + os.EOL + os.EOL;
			return getWordTemplateTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);

		})()
	},
	example: [
		['cec create-word-template BlogType'],
		['cec create-word-template BlogType -f table'],
		['cec create-word-template BlogType -n BlogTypeMS'],
		['cec create-word-template BlogType -s UAT']
	]
};

const createContentItem = {
	command: 'create-content-item <file>',
	alias: 'cci',
	name: 'create-content-item',
	usage: {
		'short': 'Creates content item in a repository on OCE server.',
		'long': (function () {
			let desc = 'Creates content item from a source file in a repository <repository> on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			desc = desc + 'Specify the source type with -t <type>. ' +
				os.EOL + os.EOL + 'Valid values for <type> are: ' + os.EOL + os.EOL;
			return getContentItemSources().reduce((acc, item) => acc + '  ' + item + '\n', desc);

		})()
	},
	example: [
		['create-content-item /Documents/item1.docx -t word -r Repo1'],
		['create-content-item /Documents/item1.docx -t word -r Repo1 -s UAT'],
	]
};

const createChannel = {
	command: 'create-channel <name>',
	alias: 'cch',
	name: 'create-channel',
	usage: {
		'short': 'Creates a channel on OCE server.',
		'long': (function () {
			let desc = 'Creates a channel on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -t <type> to set the channel type [public | secure], defaults to public. ' +
				'Optionally specify -p <publishpolicy> to set the publish policy [anythingPublished | onlyApproved], defaults to anythingPublished. ' +
				'Optionally specify -l <localizationpolicy> to set the localization policy.';
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

const shareChannel = {
	command: 'share-channel <name>',
	alias: 'sch',
	name: 'share-channel',
	usage: {
		'short': 'Shares channel with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares channel with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'The valid roles are\n\n';
			return getResourceRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-channel Channel1 -u user1,user2 -r manager', 'Share channel Channel1 with user user1 and user2 and assign Manager role to them'],
		['cec share-channel Channel1 -u user1,user2 -g group1,group2 -r manager', 'Share channel Channel1 with user user1 and user2 and group group1 and group2 and assign Manager role to them'],
		['cec share-channel Channel1 -u user1,user2 -r manager -s UAT', 'Share channel Channel1 with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareChannel = {
	command: 'unshare-channel <name>',
	alias: 'usch',
	name: 'unshare-channel',
	usage: {
		'short': 'Deletes user or group access to a channel on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a channel on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec unshare-channel Channel1 -u user1,user2 '],
		['cec unshare-channel Channel1 -u user1,user2 -g group1,group2'],
		['cec unshare-channel Channel1 -u user1,user2 -s UAT']
	]
};

const createLocalizationPolicy = {
	command: 'create-localization-policy <name>',
	alias: 'clp',
	name: 'create-localization-policy',
	usage: {
		'short': 'Creates a localization policy on OCE server.',
		'long': (function () {
			let desc = 'Creates a localization policy on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
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

const listAssets = {
	command: 'list-assets',
	alias: 'la',
	name: 'list-assets',
	usage: {
		'short': 'Lists assets on OCE server.',
		'long': (function () {
			let desc = 'Lists assets on OCE server. Optionally specify -c <channel>, -r <repository>, -l <collection> or -q <query> to query assets. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec list-assets', 'List all assets'],
		['cec list-assets -s UAT', 'List all assets on registered server UAT'],
		['cec list-assets -r Repo1', 'List all assets from repository Repo1'],
		['cec list-assets -c Channel1', 'List all assets from channel Channel1'],
		['cec list-assets -r Repo1 -l Collection1', 'List all assets from collection Collection1 and repository Repo1'],
		['cec list-assets -q \'fields.category eq "RECIPE"\'', 'List all assets matching the query']
	]
};

const createAssetUsageReport = {
	command: 'create-asset-usage-report <assets>',
	alias: 'caur',
	name: 'create-asset-usage-report',
	usage: {
		'short': 'Generates an asset usage report for assets on OCE server.',
		'long': (function () {
			let desc = 'Generates an asset usage report for assets on OCE server. Optionally specify -o to save the report to a json file. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec create-asset-usage-report GUID1'],
		['cec create-asset-usage-report GUID1 -s UAT'],
		['cec create-asset-usage-report GUID1 -o', 'The report will be saved to GUID1AssetUsage.json'],
		['cec create-asset-usage-report GUID1,GUID2 -o', 'The report will be saved to GUID1_GUID2AssetUsage.json'],
		['cec create-asset-usage-report GUID1,GUID2 -o ItemReport.json', 'The report will be saved to ItemReport.json']
	]
};

const listTranslationJobs = {
	command: 'list-translation-jobs',
	alias: 'ltj',
	name: 'list-translation-jobs',
	usage: {
		'short': 'Lists translation jobs.',
		'long': (function () {
			let desc = 'Lists translation jobs from local or from OCE server.';
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
		'short': 'Creates a translation job <name> for a site on OCE server.',
		'long': (function () {
			let desc = 'Creates a translation job <name> for a site on OCE server. Specify the server with -r <server> or use the one specified in cec.properties file. ' +
				'Specify -l <languages> to set the target languages, use "all" to select all languages from the translation policy. ' +
				'Optionally specify -c <connector> to set the translation connector. ' +
				'Optionally specify -t <type> to set the content type. The valid values for <type> are:\n\n';
			return getTranslationJobExportTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-translation-job job1 -s Site1 -l all'],
		['cec create-translation-job job1 -s Site1 -l all -r UAT'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT, -t siteItems'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT -c Lingotek'],
	]
};

const downloadTranslationJob = {
	command: 'download-translation-job <name>',
	alias: 'dtj',
	name: 'download-translation-job',
	usage: {
		'short': 'Downloads translation job <name> from OCE server.',
		'long': (function () {
			let desc = 'Downloads translation job <name> from OCE server. Specify the server with -s <server> or use the one specified in cec.properties file.';
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
		'short': 'Uploads translation job <name> to OCE server.',
		'long': (function () {
			let desc = 'Uploads translation <name> to OCE server, validate and then ingest the translations. Optionally specify -v to validate only. Optionally specify -f <folder> to set the folder to upload the translation zip file. Specify the server with -s <server> or use the one specified in cec.properties file.';
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

const refreshTranslationJob = {
	command: 'refresh-translation-job <name>',
	alias: 'rtj',
	name: 'refresh-translation-job',
	usage: {
		'short': 'Refreshes translation job <name> from translation connection.',
		'long': (function () {
			let desc = 'Refreshes translation job <name> from translation connection.';
			return desc;
		})()
	},
	example: [
		['cec refresh-translation-job Site1Job1'],
		['cec refresh-translation-job Site1Job1 -s UAT', 'Refresh translation job Site1Job1 on the registered server UAT']
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
		['cec ingest-translation-job Site1Job1', 'Ingest local translation job'],
		['cec ingest-translation-job Site1Job1 -s DEV', 'Ingest translation job Site1Job1 on the registered server DEV']
	]
};

const createTranslationConnector = {
	command: 'create-translation-connector <name>',
	alias: 'ctc',
	name: 'create-translation-connector',
	usage: {
		'short': 'Creates translation connector <name>.',

		'long': (function () {
			let desc = 'Creates the translation connector <name>. By default, it creates a mockTranslationConnector. Optionally specify -f <source> to create from a different source.\n\nValid values for <source> are: \n';

			return getTranslationConnectorSources().reduce((acc, item) => acc + '  ' + item + '\n', desc);
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
		['cec register-translation-connector connector1-auto -c connector1 -s http://localhost:8084/connector/rest/api -u admin -p Welcome1 -f "BearerToken:Bearer token1,WorkflowId:machine-workflow-id,AdditionalData:{}"']
	]
};

const createFolder = {
	command: 'create-folder <name>',
	alias: 'cfd',
	name: 'create-folder',
	usage: {
		'short': 'Creates a folder or folder hierarchy on OCE server.',
		'long': (function () {
			let desc = 'Create a folder or folder hierarchy on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file.';
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
		'short': 'Shares folder with users and groups on OCE server.',
		'long': (function () {
			let desc = 'Shares folder with users and groups on OCE server and assign a role. Specify the server with -s <server> or use the one specified in cec.properties file. The valid roles are\n\n';
			return getFolderRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec share-folder Projects/Blogs -u user1,user2 -r manager', 'Share folder Projects/Blogs with user user1 and user2 and assign Manager role to them'],
		['cec share-folder Projects/Blogs -u user1,user2 -g group1 -r manager', 'Share folder Projects/Blogs with user user1, user2 and group group1 and assign Manager role to them'],
		['cec share-folder Projects/Blogs -g group1,group2 -r manager', 'Share folder Projects/Blogs with group group1 and group2 and assign Manager role to them'],
		['cec share-folder Projects/Blogs -u user1,user2 -r manager -s UAT', 'Share folder Projects/Blogs with user user1 and user2 and assign Manager role to them on the registered server UAT']
	]
};

const unshareFolder = {
	command: 'unshare-folder <name>',
	alias: 'usfd',
	name: 'unshare-folder',
	usage: {
		'short': 'Deletes user or group access to a shared folder on OCE server.',
		'long': (function () {
			let desc = 'Deletes user or group access to a shared folder on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file.';
			return desc;
		})()
	},
	example: [
		['cec unshare-folder Projects/Blogs -u user1,user2 '],
		['cec unshare-folder Projects/Blogs -g group1,group2'],
		['cec unshare-folder Projects/Blogs -u user1,user2 -g group1,group2'],
		['cec unshare-folder Projects/Blogs -u user1,user2 -s UAT']
	]
};

const downloadFolder = {
	command: 'download-folder <path>',
	alias: 'dlfd',
	name: 'download-folder',
	usage: {
		'short': 'Downloads folder from OCE server.',
		'long': (function () {
			let desc = 'Downloads folder and all its content from OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to save the folder on the local system.';
			return desc;
		})()
	},
	example: [
		['cec download-folder Releases/1', 'Downloads folder Releases/1 from OCE server and save to local folder src/documents/'],
		['cec download-folder /', 'Downloads all documents from OCE server and save to local folder src/documents/'],
		['cec download-folder Releases/1 -s UAT', 'Downloads folder Releases/1 from the registered server UAT and save to local folder src/documents/'],
		['cec download-folder Releases/1 -f ~/Downloads', 'Downloads folder Releases/1 from OCE server and save to local folder ~/Download/'],
		['cec download-folder Releases/1 -f .', 'Downloads folder Releases/1 from OCE server and save to the current local folder'],
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
		'short': 'Uploads folder to OCE server.',
		'long': (function () {
			let desc = 'Uploads folder and all its content to OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to set the parent folder on OCE server.';
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
		'short': 'Deletes folder on OCE server.',
		'long': (function () {
			let desc = 'Deletes folder and all its content on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -p to permanently delete the folder.';
			return desc;
		})()
	},
	example: [
		['cec delete-folder Import/docs'],
		['cec delete-folder Import/docs -s UAT'],
		['cec delete-folder Import/docs -p'],
		['cec delete-folder site:blog1/docs'],
		['cec delete-folder theme:blog1Theme/docs'],
		['cec delete-folder component:Comp1/docs']
	]
};

const deleteFile = {
	command: 'delete-file <file>',
	alias: '',
	name: 'delete-file',
	usage: {
		'short': 'Deletes file on OCE server.',
		'long': (function () {
			let desc = 'Deletes file on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -p to permanently delete the file.';
			return desc;
		})()
	},
	example: [
		['cec delete-file docs/Projects.pdf'],
		['cec delete-file docs/Projects.pdf -s UAT'],
		['cec delete-file docs/Projects.pdf -p'],
		['cec delete-file site:blog1/docs/Projects.pdf'],
		['cec delete-file theme:blog1Theme/docs/Projects.pdf'],
		['cec delete-file component:Comp1/docs/Projects.pdf']
	]
};

const uploadFile = {
	command: 'upload-file <file>',
	alias: 'ulf',
	name: 'upload-file',
	usage: {
		'short': 'Uploads file <file> to OCE server.',
		'long': (function () {
			let desc = 'Uploads file <file> to OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to set the parent folder on OCE server.';
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
		'short': 'Downloads file <file> from OCE server.',
		'long': (function () {
			let desc = 'Downloads file <file> from OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ' +
				'Optionally specify -f <folder> to save the file on the local system.';
			return desc;
		})()
	},
	example: [
		['cec download-file Releases/Projects.pdf', 'Downloads the file from OCE server and save to local folder src/documents/'],
		['cec download-file Releases/Projects.pdf -s UAT', 'Downloads the file from the registered server UAT and save to local folder src/documents/'],
		['cec download-file Releases/Projects.pdf -f ~/Downloads', 'Downloads the file from OCE server and save to local folder ~/Download/'],
		['cec download-file Releases/Projects.pdf -f .', 'Downloads the file from OCE server and save to the current local folder'],
		['cec download-file site:blog1/siteinfo.json', 'Downloads the file from folder blog1 and save to local folder src/documents/blog1'],
		['cec download-file theme:blog1Theme/designs/default/design.css', 'Downloads the css file from folder designs/default of theme blog1Theme and save to local folder src/documents/blog1Theme/designs/default/'],
		['cec download-file component:Comp1/assets/render.js', 'Downloads the js file from folder assets of component Comp1 and save to local folder src/documents/Comp1/assets/']
	]
};

const downloadRecommendation = {
	command: 'download-recommendation <name>',
	alias: 'dlr',
	name: 'download-recommendation',
	usage: {
		'short': 'Downloads a recommendation from the OCE server.',
		'long': (function () {
			let desc = 'Downloads a recommendation from the Content and Experience server. Specify the server with -s <server> or use the one specified in cec.properties file. Optionally specify repository with -r <repository>. Optionally specify -p to download the published version.';
			return desc;
		})()
	},
	example: [
		['cec download-recommendation Recommendation1', 'Downloads Recommendation1'],
		['cec download-recommendation Recommendation1 -p -c Channel1', 'Downloads Recommendation1 published to channel Channel1'],
		['cec download-recommendation Recommendation1 -s UAT'],
		['cec download-recommendation Recommendation1 -r Repo1'],
	]
};

const uploadRecommendation = {
	command: 'upload-recommendation <name>',
	alias: 'ulr',
	name: 'upload-recommendation',
	usage: {
		'short': 'Uploads a recommendation to the OCE server.',
		'long': (function () {
			let desc = 'Uploads a recommendation to repository <repository> on OCE server. Specify the server with -s <server> or use the one specified in cec.properties file. ';
			return desc;
		})()
	},
	example: [
		['cec upload-recommendation Recommendation1 -r Repo1'],
		['cec upload-recommendation Recommendation1 -r Repo1 -s UAT']
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
		'short': 'Registers a OCE server.',
		'long': (function () {
			let desc = 'Registers a OCE server. Specify -e <endpoint> for the server URL. ' +
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
		['cec register-server server1 -e http://server1.com -u user1 -p Welcome1 -m 60000', 'The server is a tenant on Oracle Public cloud'],
		['cec register-server server1 -e http://server1.git.oraclecorp.com.com -u user1 -p Welcome1 -t dev_ec', 'The server is a standalone development instance'],
		['cec register-server server1 -e http://server1.com -u user1 -p Welcome1 -k ~/.ceckey', 'The password will be encrypted']
	]
};

const setOAuthToken = {
	command: 'set-oauth-token <token>',
	alias: 'sot',
	name: 'set-oauth-token',
	usage: {
		'short': 'Set OAuth token for a registered server.',
		'long': (function () {
			let desc = 'Set OAuth token for a registered server.';
			return desc;
		})()
	},
	example: [
		['cec set-oauth-token token1 -s UAT', 'Set OAuth token for server UAT, all CLI commands using UAT will be headless']
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
				'Optionally specify -p <port> to set the port, default port is 8086. ' +
				'To run the sync server over HTTPS, specify the key file with -k <key> and the certificate file with -c <certificate>. ' +
				'Set authorization option with -a and the valid values are \n\n';
			return getSyncServerAuths().reduce((acc, item) => acc + '  ' + item + '\n', desc);

		})()
	},
	example: [
		['cec sync-server -s DEV -d UAT -u admin -w welcome1', 'Use Basic authorization'],
		['cec sync-server -s DEV -d UAT -u admin -w welcome1 -p 7878', 'Use Basic authorization and port set to 7878'],
		['cec sync-server -s DEV -d UAT', 'Use Basic authorization and the username and password will be prompted to enter'],
		['cec sync-server -s DEV -d UAT -u admin', 'Use Basic authorization and the password will be prompted to enter'],
		['cec sync-server -s DEV -d UAT -a header -v key1:value1,key2:value2', 'Use Header authorization'],
		['cec sync-server -s DEV -d UAT -a none', 'No authorization'],
		['cec sync-server -s DEV -d UAT -k ~/keys/key.pem -c ~/keys/cert.pem', 'The sync server will start over HTTPS']
	]
};

const compilationServer = {
	command: 'compilation-server',
	alias: 'scps',
	name: 'compilation-server',
	usage: {
		'short': 'Starts a compilation server.',
		'long': (function () {
			let desc = 'Starts a compilation server to accept compilation request from server.' +
				'Optionally specify -p <port> to set the port, default port is 8087.' +
				'Optionally specify -l <logs-directory> to save output of compilation.' +
				'To run the compilation server over HTTPS, specify the key file with -k <key> and the certificate file with -c <certificate>.';
			return desc;
		})()
	},
	example: [
		['cec compilation-server -p 3001'],
		['cec compilation-server -l /usr/data/compilationlogs', 'Compilation log files will be stored in the directory specified.'],
		['cec compilation-server -j /usr/data/compilationjobs', 'Compilation jobs data will be stored in the directory specified.'],
		['cec compilation-server -t 120000', 'The compile-template step will use the specified timeout value in milliseconds.'],
		['cec compilation-server -k ~/keys/key.pem -c ~/keys/cert.pem', 'The sync server will start over HTTPS']
	]
};

const createGroup = {
	command: 'create-group <name>',
	alias: 'cg',
	name: 'create-group',
	usage: {
		'short': 'Creates an OCE group on OCE server.',
		'long': (function () {
			let desc = 'Creates an OCE group on OCE server. Specify the server with -s <server>. ' +
				'Set the group type with -t <type>. The valid group types are\n\n';
			return getGroupTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-group Group1', 'Create group Group1, people can add themselves to the group and share content with the group'],
		['cec create-group Group1 -t PUBLIC_CLOSED', 'Create group Group1, only group managers can add members but people can share content with the group'],
		['cec create-group Group1 -t PRIVATE_CLOSED', 'Create group Group1, only group managers can add members and only members can share content with the group'],
		['cec create-group Group1 -s DEV']
	]
};

const deleteGroup = {
	command: 'delete-group <name>',
	alias: '',
	name: 'delete-group',
	usage: {
		'short': 'Deletes an OCE group on OCE server.',
		'long': (function () {
			let desc = 'Deletes an OCE group on OCE server. Specify the server with -s <server>. ';
			return desc;
		})()
	},
	example: [
		['cec delete-group Group1'],
		['cec delete-group Group1 -s DEV']
	]
};

const addMemberToGroup = {
	command: 'add-member-to-group <name>',
	alias: 'amtg',
	name: 'add-member-to-group',
	usage: {
		'short': 'Adds users and groups to an OCE group on OCE server.',
		'long': (function () {
			let desc = 'Adds users and groups to an OCE group and assign a role on OCE server. Specify the server with -s <server>. ' +
				'The valid roles are\n\n';
			return getGroupMemberRoles().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec add-member-to-group Group1 -u user1,user2 -g Group2,Group3 -r MEMBER'],
		['cec add-member-to-group Group1 -u user1,user2 -g Group2,Group3 -r MEMBER -s DEV']
	]
};

const removeMemberFromGroup = {
	command: 'remove-member-from-group <name>',
	alias: 'rmfg',
	name: 'remove-member-from-group',
	usage: {
		'short': 'Removes users and groups from an OCE group on OCE server.',
		'long': (function () {
			let desc = 'Removes users and groups from an OCE group on OCE server. Specify the server with -s <server>. ';
			return desc;
		})()
	},
	example: [
		['cec remove-member-from-group Group1 -m user1,user2,Group2,Group3'],
		['cec remove-member-from-group Group1 -m user1,user2,Group2,Group3 -s DEV']
	]
};

const executeGet = {
	command: 'execute-get <endpoint>',
	alias: 'exeg',
	name: 'execute-get',
	usage: {
		'short': 'Executes a GET on OCE server.',
		'long': (function () {
			let desc = 'Executes a GET on OCE server. Specify the server with -s <server>. ';
			return desc;
		})()
	},
	example: []
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

var _format = '  cec %-45s  %-72s  [alias: %4s]';
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
	_getCmdHelp(deleteFolder) + os.EOL +
	_getCmdHelp(downloadFile) + os.EOL +
	_getCmdHelp(uploadFile) + os.EOL +
	_getCmdHelp(deleteFile) + os.EOL;

_usage = _usage + os.EOL + 'Components' + os.EOL +
	_getCmdHelp(createComponent) + os.EOL +
	_getCmdHelp(copyComponent) + os.EOL +
	_getCmdHelp(importComponent) + os.EOL +
	_getCmdHelp(exportComponent) + os.EOL +
	_getCmdHelp(downloadComponent) + os.EOL +
	_getCmdHelp(uploadComponent) + os.EOL +
	_getCmdHelp(controlComponent) + os.EOL +
	_getCmdHelp(shareComponent) + os.EOL +
	_getCmdHelp(unshareComponent) + os.EOL;

_usage = _usage + os.EOL + 'Templates' + os.EOL +
	_getCmdHelp(createTemplate) + os.EOL +
	_getCmdHelp(createTemplateFromSite) + os.EOL +
	_getCmdHelp(downloadTemplate) + os.EOL +
	_getCmdHelp(compileTemplate) + os.EOL +
	_getCmdHelp(copyTemplate) + os.EOL +
	_getCmdHelp(importTemplate) + os.EOL +
	_getCmdHelp(exportTemplate) + os.EOL +
	_getCmdHelp(uploadTemplate) + os.EOL +
	_getCmdHelp(deleteTemplate) + os.EOL +
	_getCmdHelp(shareTemplate) + os.EOL +
	_getCmdHelp(unshareTemplate) + os.EOL +
	_getCmdHelp(updateTemplate) + os.EOL +
	_getCmdHelp(describeTemplate) + os.EOL +
	_getCmdHelp(createTemplateReport) + os.EOL;

_usage = _usage + os.EOL + 'Themes' + os.EOL +
	_getCmdHelp(addComponentToTheme) + os.EOL +
	_getCmdHelp(removeComponentFromTheme) + os.EOL +
	_getCmdHelp(controlTheme) + os.EOL +
	_getCmdHelp(shareTheme) + os.EOL +
	_getCmdHelp(unshareTheme) + os.EOL;

_usage = _usage + os.EOL + 'Sites' + os.EOL +
	_getCmdHelp(createSite) + os.EOL +
	_getCmdHelp(updateSite) + os.EOL +
	_getCmdHelp(transferSite) + os.EOL +
	_getCmdHelp(transferSiteContent) + os.EOL +
	_getCmdHelp(validateSite) + os.EOL +
	_getCmdHelp(controlSite) + os.EOL +
	_getCmdHelp(shareSite) + os.EOL +
	_getCmdHelp(unshareSite) + os.EOL +
	_getCmdHelp(getSiteSecurity) + os.EOL +
	_getCmdHelp(setSiteSecurity) + os.EOL +
	_getCmdHelp(indexSite) + os.EOL +
	_getCmdHelp(createSiteMap) + os.EOL +
	_getCmdHelp(createRSSFeed) + os.EOL +
	_getCmdHelp(createAssetReport) + os.EOL +
	_getCmdHelp(uploadStaticSite) + os.EOL +
	_getCmdHelp(downloadStaticSite) + os.EOL +
	_getCmdHelp(deleteStaticSite) + os.EOL +
	_getCmdHelp(refreshPrerenderCache) + os.EOL +
	_getCmdHelp(migrateSite) + os.EOL;

_usage = _usage + os.EOL + 'Assets' + os.EOL +
	_getCmdHelp(downloadContent) + os.EOL +
	_getCmdHelp(uploadContent) + os.EOL +
	_getCmdHelp(controlContent) + os.EOL +
	_getCmdHelp(listAssets) + os.EOL +
	_getCmdHelp(copyAssets) + os.EOL +
	_getCmdHelp(createAssetUsageReport) + os.EOL;

_usage = _usage + os.EOL + 'Content' + os.EOL +
	_getCmdHelp(createRepository) + os.EOL +
	_getCmdHelp(controlRepository) + os.EOL +
	_getCmdHelp(shareRepository) + os.EOL +
	_getCmdHelp(unshareRepository) + os.EOL +
	_getCmdHelp(createChannel) + os.EOL +
	_getCmdHelp(shareChannel) + os.EOL +
	_getCmdHelp(unshareChannel) + os.EOL +
	_getCmdHelp(createLocalizationPolicy) + os.EOL +
	_getCmdHelp(listServerContentTypes) + os.EOL +
	_getCmdHelp(shareType) + os.EOL +
	_getCmdHelp(unshareType) + os.EOL +
	_getCmdHelp(downloadType) + os.EOL +
	// _getCmdHelp(createWordTemplate) + os.EOL +
	_getCmdHelp(uploadType) + os.EOL +
	_getCmdHelp(downloadRecommendation) + os.EOL +
	_getCmdHelp(uploadRecommendation) + os.EOL +
	_getCmdHelp(createContentLayout) + os.EOL +
	_getCmdHelp(addContentLayoutMapping) + os.EOL +
	_getCmdHelp(removeContentLayoutMapping) + os.EOL +
	_getCmdHelp(addFieldEditor) + os.EOL +
	_getCmdHelp(removeFieldEditor) + os.EOL +
	// _getCmdHelp(addContentForm) + os.EOL +
	// _getCmdHelp(removeContentForm) + os.EOL +
	_getCmdHelp(migrateContent) + os.EOL;

_usage = _usage + os.EOL + 'Taxonomies' + os.EOL +
	_getCmdHelp(downloadTaxonomy) + os.EOL +
	_getCmdHelp(uploadTaxonomy) + os.EOL +
	_getCmdHelp(controlTaxonomy) + os.EOL;

_usage = _usage + os.EOL + 'Translation' + os.EOL +
	_getCmdHelp(listTranslationJobs) + os.EOL +
	_getCmdHelp(createTranslationJob) + os.EOL +
	_getCmdHelp(downloadTranslationJob) + os.EOL +
	_getCmdHelp(submitTranslationJob) + os.EOL +
	_getCmdHelp(refreshTranslationJob) + os.EOL +
	_getCmdHelp(ingestTranslationJob) + os.EOL +
	_getCmdHelp(uploadTranslationJob) + os.EOL +
	_getCmdHelp(createTranslationConnector) + os.EOL +
	_getCmdHelp(startTranslationConnector) + os.EOL +
	_getCmdHelp(registerTranslationConnector) + os.EOL;

_usage = _usage + os.EOL + 'Groups' + os.EOL +
	_getCmdHelp(createGroup) + os.EOL +
	_getCmdHelp(deleteGroup) + os.EOL +
	_getCmdHelp(addMemberToGroup) + os.EOL +
	_getCmdHelp(removeMemberFromGroup) + os.EOL;

_usage = _usage + os.EOL + 'Local Environment' + os.EOL +
	_getCmdHelp(createEncryptionKey) + os.EOL +
	_getCmdHelp(registerServer) + os.EOL +
	_getCmdHelp(setOAuthToken) + os.EOL +
	_getCmdHelp(listResources) + os.EOL +
	_getCmdHelp(install) + os.EOL +
	_getCmdHelp(develop) + os.EOL +
	_getCmdHelp(syncServer);

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
					description: 'The registered OCE server'
				})
				.option('style', {
					alias: 's',
					description: '<style> Content layout style: detail | overview'
				})
				.option('addcustomsettings', {
					alias: 'a',
					description: 'Add support for custom settings when used in Sites'
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
				.example(...createContentLayout.example[4])
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
				})
				.example(...controlComponent.example[0])
				.example(...controlComponent.example[1])
				.example(...controlComponent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlComponent.command}\n\n${controlComponent.usage.long}`);
		})
	.command([shareComponent.command, shareComponent.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareComponent.example[0])
				.example(...shareComponent.example[1])
				.example(...shareComponent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareComponent.command}\n\n${shareComponent.usage.long}`);
		})
	.command([unshareComponent.command, unshareComponent.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareComponent.example[0])
				.example(...unshareComponent.example[1])
				.example(...unshareComponent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareComponent.command}\n\n${unshareComponent.usage.long}`);
		})
	.command([createTemplate.command, createTemplate.alias], false,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<source> Source to create from'
				})
				.option('site', {
					alias: 's',
					description: '<site> Site to create from'
				})
				.option('excludecontent', {
					alias: 'x',
					description: 'Exclude content'
				})
				.option('enterprisetemplate', {
					alias: 'e',
					description: 'Enterprise template'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (argv.from && !getTemplateSources().includes(argv.from)) {
						throw new Error(`${argv.from} is not a valid value for <source>`);
					}
					if (argv.from && argv.site) {
						throw new Error('You cannot specify both <from> and <site>');
					}
					return true;
				})
				.example(...createTemplate.example[0])
				.example(...createTemplate.example[1])
				.example(...createTemplate.example[2])
				.example(...createTemplate.example[3])
				.example(...createTemplate.example[4])
				.example(...createTemplate.example[5])
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
				.option('enterprisetemplate', {
					alias: 'e',
					description: 'Enterprise template'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered OCE server'
				})
				.example(...createTemplateFromSite.example[0])
				.example(...createTemplateFromSite.example[1])
				.example(...createTemplateFromSite.example[2])
				.example(...createTemplateFromSite.example[3])
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
					description: '<server> The registered OCE server'
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
					description: 'The registered OCE server'
				}).option('channelToken', {
					alias: 'c',
					description: 'The channel access token to use for content URLs'
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
				.option('noDetailPages', {
					alias: 'e',
					description: 'Do not generate compiled detail pages'
				})
				.option('noDefaultDetailPageLink', {
					alias: 'o',
					description: 'Do not generate compiled detail page for items/content lists that use the default detail page'
				})
				.option('targetDevice', {
					alias: 'a',
					description: 'The target device type when using adaptive layouts [desktop | mobile]'
				})
				.option('siteName', {
					alias: 'n',
					description: 'The target site name to use when compiling the template'
				})
				.option('secureSite', {
					alias: 'u',
					description: 'The target site is a secure site'
				})
				.option('includeLocale', {
					alias: 'l',
					description: 'Include default locale when creating pages'
				})
				.option('verbose', {
					alias: 'v',
					description: 'Run in verbose mode to display all warning messages during compilation.'
				})
				.option('ignoreErrors', {
					alias: 'i',
					description: 'Ignore compilation errors when calculating the exit code for the process.'
				})
				.check((argv) => {
					if (argv.type && argv.type !== 'draft' && argv.type !== 'published') {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					} else if (argv.targetDevice && argv.targetDevice !== 'mobile' && argv.targetDevice !== 'desktop') {
						throw new Error(`${argv.targetDevice} is not a valid value for <targetDevice>`);
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
				})
				.option('optimize', {
					alias: 'o',
					description: 'Optimize the template'
				})
				.option('excludecontenttemplate', {
					alias: 'x',
					description: 'Exclude content template'
				})
				.option('excludecomponents', {
					alias: 'e',
					description: 'Exclude components'
				})
				.option('publish', {
					alias: 'p',
					description: 'Publish theme and components'
				})
				.example(...uploadTemplate.example[0])
				.example(...uploadTemplate.example[1])
				.example(...uploadTemplate.example[2])
				.example(...uploadTemplate.example[3])
				.example(...uploadTemplate.example[4])
				.example(...uploadTemplate.example[5])
				.example(...uploadTemplate.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadTemplate.command}\n\n${uploadTemplate.usage.long}`);
		})
	.command([shareTemplate.command, shareTemplate.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareTemplate.example[0])
				.example(...shareTemplate.example[1])
				.example(...shareTemplate.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareTemplate.command}\n\n${shareTemplate.usage.long}`);
		})
	.command([unshareTemplate.command, unshareTemplate.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareTemplate.example[0])
				.example(...unshareTemplate.example[1])
				.example(...unshareTemplate.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareTemplate.command}\n\n${unshareTemplate.usage.long}`);
		})
	.command([describeTemplate.command, describeTemplate.alias], false,
		(yargs) => {
			yargs.example(...describeTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${describeTemplate.command}\n\n${describeTemplate.usage.long}`);
		})
	.command([createTemplateReport.command, createTemplateReport.alias], false,
		(yargs) => {
			yargs.option('includepagelinks', {
					alias: 'i',
					description: 'Include validating page links'
				}).option('output', {
					alias: 'o',
					description: 'Output the report to a JSON file'
				})
				.example(...createTemplateReport.example[0])
				.example(...createTemplateReport.example[1])
				.example(...createTemplateReport.example[2])
				.example(...createTemplateReport.example[3])
				.example(...createTemplateReport.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTemplateReport.command}\n\n${createTemplateReport.usage.long}`);
		})
	.command([cleanupTemplate.command, cleanupTemplate.alias], false,
		(yargs) => {
			yargs.example(...cleanupTemplate.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${cleanupTemplate.command}\n\n${cleanupTemplate.usage.long}`);
		})
	.command([updateTemplate.command, updateTemplate.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: 'The template',
					demandOption: true
				})
				.option('content', {
					alias: 'c',
					description: 'The comma separated list of local content'
				})
				.check((argv) => {
					if (argv.action && !updateTemplateActions().includes(argv.action)) {
						throw new Error(`${os.EOL} ${argv.action} is not a valid value for <action>`);
					}
					return true;
				})
				.example(...updateTemplate.example[0])
				.example(...updateTemplate.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${updateTemplate.command}\n\n${updateTemplate.usage.long}`);
		})
	.command([listServerContentTypes.command, listServerContentTypes.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: '<template> The mapping is for'
				})
				.option('layoutstyle', {
					alias: 's',
					description: '<style> Content layout style'
				})
				.option('mobile', {
					alias: 'm',
					description: 'mobile mapping'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.template && !argv.server) {
						throw new Error('Please specify either local template or OCE server');
					}
					return true;
				})
				.example(...addContentLayoutMapping.example[0])
				.example(...addContentLayoutMapping.example[1])
				.example(...addContentLayoutMapping.example[2])
				.example(...addContentLayoutMapping.example[3])
				.example(...addContentLayoutMapping.example[4])
				.example(...addContentLayoutMapping.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addContentLayoutMapping.command}\n\n${addContentLayoutMapping.usage.long}`);
		})
	.command([removeContentLayoutMapping.command, removeContentLayoutMapping.alias], false,
		(yargs) => {
			yargs.option('contenttype', {
					alias: 'c',
					description: 'Content type, required when <server> is specified'
				})
				.option('template', {
					alias: 't',
					description: '<template> The mapping is from'
				})
				.option('layoutstyle', {
					alias: 's',
					description: '<style> Content layout style'
				})
				.option('mobile', {
					alias: 'm',
					description: 'mobile mapping'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.template && !argv.server) {
						throw new Error('Please specify either local template or OCE server');
					}
					if (argv.server && !argv.contenttype) {
						throw new Error(os.EOL + 'Please specify the content type');
					}
					return true;
				})
				.example(...removeContentLayoutMapping.example[0])
				.example(...removeContentLayoutMapping.example[1])
				.example(...removeContentLayoutMapping.example[2])
				.example(...removeContentLayoutMapping.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeContentLayoutMapping.command}\n\n${removeContentLayoutMapping.usage.long}`);
		})
	.command([addFieldEditor.command, addFieldEditor.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: 'The template the content type is from',
					demandOption: true
				})
				.option('contenttype', {
					alias: 'c',
					description: 'The content type',
					demandOption: true
				})
				.option('field', {
					alias: 'f',
					description: 'The field the field editor is for',
					demandOption: true
				})
				.option('contenttemplate', {
					alias: 'n',
					description: 'Flag to indicate the template is a content template'
				})
				.example(...addFieldEditor.example[0])
				.example(...addFieldEditor.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addFieldEditor.command}\n\n${addFieldEditor.usage.long}`);
		})
	.command([removeFieldEditor.command, removeFieldEditor.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: 'The template the content type is from',
					demandOption: true
				})
				.option('contenttype', {
					alias: 'c',
					description: 'The content type',
					demandOption: true
				})
				.option('field', {
					alias: 'f',
					description: 'The field the field editor is for',
					demandOption: true
				})
				.option('contenttemplate', {
					alias: 'n',
					description: 'Flag to indicate the template is a content template'
				})
				.example(...removeFieldEditor.example[0])
				.example(...removeFieldEditor.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeFieldEditor.command}\n\n${removeFieldEditor.usage.long}`);
		})
	.command([addContentForm.command, addContentForm.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: 'The template the content type is from',
					demandOption: true
				})
				.option('contenttype', {
					alias: 'c',
					description: 'The content type',
					demandOption: true
				})
				.option('contenttemplate', {
					alias: 'n',
					description: 'Flag to indicate the template is a content template'
				})
				.example(...addContentForm.example[0])
				.example(...addContentForm.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addContentForm.command}\n\n${addContentForm.usage.long}`);
		})
	.command([removeContentForm.command, removeContentForm.alias], false,
		(yargs) => {
			yargs.option('template', {
					alias: 't',
					description: 'The template the content type is from',
					demandOption: true
				})
				.option('contenttype', {
					alias: 'c',
					description: 'The content type',
					demandOption: true
				})
				.option('contenttemplate', {
					alias: 'n',
					description: 'Flag to indicate the template is a content template'
				})
				.example(...removeContentForm.example[0])
				.example(...removeContentForm.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeContentForm.command}\n\n${removeContentForm.usage.long}`);
		})
	.command([downloadContent.command, downloadContent.alias], false,
		(yargs) => {
			yargs.option('publishedassets', {
					alias: 'p',
					description: 'The flag to indicate published assets only'
				})
				.option('collection', {
					alias: 'c',
					description: 'Collection name'
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository name, required when <collection> is specified'
				})
				.option('query', {
					alias: 'q',
					description: 'Query to fetch the assets'
				})
				.option('assets', {
					alias: 'a',
					description: 'The comma separated list of asset GUIDS'
				})
				.option('name', {
					alias: 'n',
					description: 'The name for this download, default to the channel or repository name'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (!argv.channel && argv._[1]) {
						argv.channel = argv._[1];
					}
					// console.log(argv);
					if (!argv.channel && !argv.repository && !argv.query && !argv.assets) {
						throw new Error(os.EOL + 'Please specify the channel, repository, query or assets');
					}
					if (argv.collection && !argv.repository) {
						throw new Error(`<repository> is required when <collection> is specified`);
					}
					if (!argv.channel && !argv.repository && !argv.name) {
						throw new Error(os.EOL + 'Please specify the name for the download');
					}
					return true;
				})
				.example(...downloadContent.example[0])
				.example(...downloadContent.example[1])
				.example(...downloadContent.example[2])
				.example(...downloadContent.example[3])
				.example(...downloadContent.example[4])
				.example(...downloadContent.example[5])
				.example(...downloadContent.example[6])
				.example(...downloadContent.example[7])
				.example(...downloadContent.example[8])
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
					description: '<server> The registered OCE server'
				})
				.option('update', {
					alias: 'u',
					description: 'Update any existing content instead of creating new items'
				})
				.option('types', {
					alias: 'p',
					description: 'Upload content types and taxonomies only'
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
				.example(...uploadContent.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadContent.command}\n\n${uploadContent.usage.long}`);
		})
	.command([controlContent.command, controlContent.alias], false,
		(yargs) => {
			yargs
				.option('channel', {
					alias: 'c',
					description: 'Channel',
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository, required when <action> is add'
				})
				.option('collection', {
					alias: 'l',
					description: 'Collection'
				})
				.option('assets', {
					alias: 'a',
					description: 'The comma separated list of asset GUIDS'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (argv.action && !getContentActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					}
					if (argv.action !== 'add' && argv.action !== 'remove' && !argv.channel) {
						throw new Error('Please specify channel');
					}
					if (argv.action === 'add' && !argv.repository) {
						throw new Error('Please specify repository to add content items to channel or collection');
					}
					if (argv.action === 'add' && !argv.channel && !argv.collection) {
						throw new Error('Please specify channel or collection to add items');
					}
					if (argv.action === 'add' && argv.channel && argv.collection) {
						throw new Error('Please specify either channel or collection to add items');
					}
					if (argv.action === 'remove' && !argv.channel && !argv.collection) {
						throw new Error('Please specify channel or collection to remove items');
					}
					if (argv.action === 'remove' && argv.channel && argv.collection) {
						throw new Error('Please specify either channel or collection to remove items');
					}
					if (argv.action === 'remove' && argv.collection && !argv.repository) {
						throw new Error('Please specify repository to remove content items from collection');
					}
					return true;
				})
				.example(...controlContent.example[0])
				.example(...controlContent.example[1])
				.example(...controlContent.example[2])
				.example(...controlContent.example[3])
				.example(...controlContent.example[4])
				.example(...controlContent.example[5])
				.example(...controlContent.example[6])
				.example(...controlContent.example[7])
				.example(...controlContent.example[8])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlContent.command}\n\n${controlContent.usage.long}`);
		})
	.command([copyAssets.command, copyAssets.alias], false,
		(yargs) => {
			yargs.option('collection', {
					alias: 'l',
					description: 'Collection name'
				})
				.option('channel', {
					alias: 'c',
					description: 'Channel name'
				})
				.option('query', {
					alias: 'q',
					description: 'Query to fetch the assets'
				})
				.option('assets', {
					alias: 'a',
					description: 'The comma separated list of asset GUIDS'
				})
				.option('target', {
					alias: 't',
					description: 'The target repository',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...copyAssets.example[0])
				.example(...copyAssets.example[1])
				.example(...copyAssets.example[2])
				.example(...copyAssets.example[3])
				.example(...copyAssets.example[4])
				.example(...copyAssets.example[5])
				.example(...copyAssets.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${copyAssets.command}\n\n${copyAssets.usage.long}`);
		})
	.command([downloadTaxonomy.command, downloadTaxonomy.alias], false,
		(yargs) => {
			yargs.option('status', {
					alias: 't',
					description: 'The taxonomy status [' + getTaxonomyStatus().join(' | ') + ']',
					demandOption: true
				})
				.option('id', {
					alias: 'i',
					description: 'Taxonomy Id'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (!getTaxonomyStatus().includes(argv.status)) {
						throw new Error(`${argv.status} is not a valid value for <status>`);
					}
					return true;
				})
				.example(...downloadTaxonomy.example[0])
				.example(...downloadTaxonomy.example[1])
				.example(...downloadTaxonomy.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadTaxonomy.command}\n\n${downloadTaxonomy.usage.long}`);
		})
	.command([uploadTaxonomy.command, uploadTaxonomy.alias], false,
		(yargs) => {
			yargs.option('createnew', {
					alias: 'c',
					description: 'To create new a taxonomy'
				})
				.option('name', {
					alias: 'n',
					description: 'The name of the new taxonomy'
				})
				.option('abbreviation', {
					alias: 'a',
					description: 'The abbreviation of the new taxonomy'
				})
				.option('description', {
					alias: 'd',
					description: 'The description of the new taxonomy'
				})
				.option('file', {
					alias: 'f',
					description: 'Flag to indicate the taxonomy is from file'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (argv.abbreviation && argv.abbreviation.length > 3) {
						throw new Error(`${argv.abbreviation} is too long for <abbreviation>`);
					}
					return true;
				})
				.example(...uploadTaxonomy.example[0])
				.example(...uploadTaxonomy.example[1])
				.example(...uploadTaxonomy.example[2])
				.example(...uploadTaxonomy.example[3])
				.example(...uploadTaxonomy.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadTaxonomy.command}\n\n${uploadTaxonomy.usage.long}`);
		})
	.command([controlTaxonomy.command, controlTaxonomy.alias], false,
		(yargs) => {
			yargs
				.option('name', {
					alias: 'n',
					description: 'Taxonomy name'
				})
				.option('id', {
					alias: 'i',
					description: 'Taxonomy Id'
				})
				.option('publishable', {
					alias: 'p',
					description: 'Allow publishing of this taxonomy, defaults to true'
				})
				.option('channels', {
					alias: 'c',
					description: 'List of channels to publish or unpublish, required when <action> is publish or unpublish'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (!argv.name && !argv.id) {
						throw new Error('Please specify either <name> or <id>');
					}
					if (argv.action && !getTaxonomyActions().includes(argv.action)) {
						throw new Error(`${argv.action} is not a valid value for <action>`);
					}
					if ((argv.action === 'publish' || argv.action === 'unpublish') && !argv.channels) {
						throw new Error(`Please specify channel for action ${argv.action}`);
					}
					return true;
				})
				.example(...controlTaxonomy.example[0])
				.example(...controlTaxonomy.example[1])
				.example(...controlTaxonomy.example[2])
				.example(...controlTaxonomy.example[3])
				.example(...controlTaxonomy.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlTaxonomy.command}\n\n${controlTaxonomy.usage.long}`);
		})
	.command([shareTheme.command, shareTheme.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareTheme.example[0])
				.example(...shareTheme.example[1])
				.example(...shareTheme.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareTheme.command}\n\n${shareTheme.usage.long}`);
		})
	.command([unshareTheme.command, unshareTheme.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareTheme.example[0])
				.example(...unshareTheme.example[1])
				.example(...unshareTheme.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareTheme.command}\n\n${unshareTheme.usage.long}`);
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
				.example(...removeComponentFromTheme.example[0])
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
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
				.option('update', {
					alias: 'u',
					description: 'Keep the existing id for assets'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...createSite.example[0])
				.example(...createSite.example[1])
				.example(...createSite.example[2])
				.example(...createSite.example[3])
				.example(...createSite.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createSite.command}\n\n${createSite.usage.long}`);
		})
	.command([transferSite.command, transferSite.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server the site is from',
					demandOption: true,
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered OCE server to create or update the site',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository, required for creating enterprise site'
				})
				.option('localizationPolicy', {
					alias: 'l',
					description: 'Localization policy, required for creating enterprise site'
				})
				.option('publishedassets', {
					alias: 'p',
					description: 'The flag to indicate published assets only'
				})
				.option('excludecontent', {
					alias: 'x',
					description: 'Exclude content'
				})
				.option('excludecomponents', {
					alias: 'e',
					description: 'Exclude components'
				})
				.option('includestaticfiles', {
					alias: 'i',
					description: 'Include site static files'
				})
				.example(...transferSite.example[0])
				.example(...transferSite.example[1])
				.example(...transferSite.example[2])
				.example(...transferSite.example[3])
				.example(...transferSite.example[4])
				.example(...transferSite.example[5])
				.example(...transferSite.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${transferSite.command}\n\n${transferSite.usage.long}`);
		})
	.command([transferSiteContent.command, transferSiteContent.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server the site is from',
					demandOption: true,
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered OCE server to transfer the content',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: 'The site repository',
					demandOption: true
				})
				.option('publishedassets', {
					alias: 'p',
					description: 'The flag to indicate published assets only'
				})
				.option('repositorymappings', {
					alias: 'm',
					description: 'The repositories for assets from other repositories '
				})
				.option('number', {
					alias: 'n',
					description: 'The number of items in each batch, defaults to 500'
				})
				.option('execute', {
					alias: 'e',
					description: 'Execute the scripts'
				})
				.check((argv) => {
					if (argv.limit === 0 || argv.limit && (!Number.isInteger(argv.limit) || argv.limit <= 0)) {
						throw new Error('Value for limit should be an integer greater than 0');
					}
					return true;
				})
				.example(...transferSiteContent.example[0])
				.example(...transferSiteContent.example[1])
				.example(...transferSiteContent.example[2])
				.example(...transferSiteContent.example[3])
				.example(...transferSiteContent.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${transferSiteContent.command}\n\n${transferSiteContent.usage.long}`);
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
				.option('usedcontentonly', {
					alias: 'u',
					description: 'Publish used content only'
				})
				.option('compilesite', {
					alias: 'c',
					description: 'Compile and publish site'
				})
				.option('staticonly', {
					alias: 't',
					description: 'Only publish site static files'
				})
				.option('fullpublish', {
					alias: 'f',
					description: 'Do a full publish'
				})
				.option('server', {
					alias: 'r',
					description: '<server> The registered OCE server'
				})
				.example(...controlSite.example[0])
				.example(...controlSite.example[1])
				.example(...controlSite.example[2])
				.example(...controlSite.example[3])
				.example(...controlSite.example[4])
				.example(...controlSite.example[5])
				.example(...controlSite.example[6])
				.example(...controlSite.example[7])
				.example(...controlSite.example[8])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlSite.command}\n\n${controlSite.usage.long}`);
		})
	.command([shareSite.command, shareSite.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareSite.example[0])
				.example(...shareSite.example[1])
				.example(...shareSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareSite.command}\n\n${shareSite.usage.long}`);
		})
	.command([unshareSite.command, unshareSite.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareSite.example[0])
				.example(...unshareSite.example[1])
				.example(...unshareSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareSite.command}\n\n${unshareSite.usage.long}`);
		})
	.command([getSiteSecurity.command, getSiteSecurity.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...getSiteSecurity.example[0])
				.example(...getSiteSecurity.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${getSiteSecurity.command}\n\n${getSiteSecurity.usage.long}`);
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
					description: '<server> The registered OCE server'
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
				.option('excludecontenttemplate', {
					alias: 'x',
					description: 'Exclude content template'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...updateSite.example[0])
				.example(...updateSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${updateSite.command}\n\n${updateSite.usage.long}`);
		})
	.command([validateSite.command, validateSite.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
					description: 'Upload the site map to OCE server after creation'
				})
				.option('toppagepriority', {
					alias: 't',
					description: 'Priority for the top level pages, a decimal number between 0 and 1'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
				.option('javascript', {
					alias: 'j',
					description: 'Javascript file that contains functions to process Mustache data'
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
					description: 'Upload the RSS feed to OCE server after creation'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: 'The registered OCE server'
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
	.command([uploadStaticSite.command, uploadStaticSite.alias], false,
		(yargs) => {
			yargs.option('site', {
					alias: 's',
					description: 'The site on OCE server',
					demandOption: true
				})
				.option('server', {
					alias: 'r',
					description: 'The registered OCE server'
				})
				.example(...uploadStaticSite.example[0])
				.example(...uploadStaticSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadStaticSite.command}\n\n${uploadStaticSite.usage.long}`);
		})
	.command([downloadStaticSite.command, downloadStaticSite.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Local folder to save the static files'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...downloadStaticSite.example[0])
				.example(...downloadStaticSite.example[1])
				.example(...downloadStaticSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadStaticSite.command}\n\n${downloadStaticSite.usage.long}`);
		})
	.command([deleteStaticSite.command, deleteStaticSite.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...deleteStaticSite.example[0])
				.example(...deleteStaticSite.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteStaticSite.command}\n\n${deleteStaticSite.usage.long}`);
		})
	.command([refreshPrerenderCache.command, refreshPrerenderCache.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...refreshPrerenderCache.example[0])
				.example(...refreshPrerenderCache.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${refreshPrerenderCache.command}\n\n${refreshPrerenderCache.usage.long}`);
		})
	.command([migrateSite.command, migrateSite.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered IC server the site is from',
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered EC server to create the site',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository',
					demandOption: true
				})
				.option('template', {
					alias: 't',
					description: 'The site template'
				})
				.option('name', {
					alias: 'n',
					description: 'Site name'
				})
				.option('description', {
					alias: 'p',
					description: 'Site description'
				})
				.option('sitePrefix', {
					alias: 'x',
					description: 'Site Prefix'
				})
				.check((argv) => {
					if (!argv.template && !argv.server) {
						throw new Error('Specify the server the site is on');
					}
					return true;
				})
				.example(...migrateSite.example[0])
				.example(...migrateSite.example[1])
				.example(...migrateSite.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${migrateSite.command}\n\n${migrateSite.usage.long}`);
		})
	.command([migrateContent.command, migrateContent.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered IC server the content is from',
					demandOption: true
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered EC server to upload the content',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: 'The repository for the types and items',
					demandOption: true
				})
				.option('channel', {
					alias: 'c',
					description: 'The channel to add the content'
				})
				.option('collection', {
					alias: 'l',
					description: 'The collection to add the content'
				})
				.example(...migrateContent.example[0])
				.example(...migrateContent.example[1])
				.example(...migrateContent.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${migrateContent.command}\n\n${migrateContent.usage.long}`);
		})
	.command([renameContentType.command, renameContentType.alias], false,
		(yargs) => {
			yargs.option('newname', {
					alias: 'n',
					description: 'The new name',
					demandOption: true
				})
				.option('content', {
					alias: 'c',
					description: 'The local content or template',
					demandOption: true
				})
				.option('template', {
					alias: 't',
					description: 'Flag to indicate the content is from template'
				})
				.example(...renameContentType.example[0])
				.example(...renameContentType.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${renameContentType.command}\n\n${renameContentType.usage.long}`);
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
					description: 'The registered OCE server'
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
					} else if ((argv.action === 'add-taxonomy' || argv.action === 'remove-taxonomy') && !argv.taxonomies) {
						throw new Error(`<taxonomies> is required for ${argv.action}`);
					} else {
						return true;
					}
				})
				.option('repository', {
					alias: 'r',
					description: 'The comma separated list of content repositories',
					demandOption: true
				})
				.option('contenttypes', {
					alias: 't',
					description: 'The comma separated list of content types'
				})
				.option('channels', {
					alias: 'c',
					description: 'The comma separated list of publishing channels'
				})
				.option('taxonomies', {
					alias: 'x',
					description: 'The comma separated list of promoted taxonomies'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...controlRepository.example[0])
				.example(...controlRepository.example[1])
				.example(...controlRepository.example[2])
				.example(...controlRepository.example[3])
				.example(...controlRepository.example[4])
				.example(...controlRepository.example[5])
				.example(...controlRepository.example[6])
				.example(...controlRepository.example[7])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${controlRepository.command}\n\n${controlRepository.usage.long}`);
		})
	.command([shareRepository.command, shareRepository.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getResourceRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('types', {
					alias: 't',
					description: 'Share types in the repository'
				})
				.option('typerole', {
					alias: 'y',
					description: 'The role [' + getContentTypeRoles().join(' | ') + '] to assign to the users or groups for types'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getResourceRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					if (argv.typerole && !getContentTypeRoles().includes(argv.typerole)) {
						throw new Error(`${argv.typerole} is not a valid value for <typerole>`);
					}
					if (argv.role && argv.role === 'viewer' && argv.types && !argv.typerole) {
						throw new Error('Please specify the role for the types');
					}
					return true;
				})
				.example(...shareRepository.example[0])
				.example(...shareRepository.example[1])
				.example(...shareRepository.example[2])
				.example(...shareRepository.example[3])
				.example(...shareRepository.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareRepository.command}\n\n${shareRepository.usage.long}`);
		})
	.command([unshareRepository.command, unshareRepository.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('types', {
					alias: 't',
					description: 'Remove the user or group access to types in the repository'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareRepository.example[0])
				.example(...unshareRepository.example[1])
				.example(...unshareRepository.example[2])
				.example(...unshareRepository.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareRepository.command}\n\n${unshareRepository.usage.long}`);
		})
	.command([shareType.command, shareType.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getContentTypeRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getContentTypeRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareType.example[0])
				.example(...shareType.example[1])
				.example(...shareType.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareType.command}\n\n${shareType.usage.long}`);
		})
	.command([unshareType.command, unshareType.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareType.example[0])
				.example(...unshareType.example[1])
				.example(...unshareType.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareType.command}\n\n${unshareType.usage.long}`);
		})
	.command([downloadType.command, downloadType.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...downloadType.example[0])
				.example(...downloadType.example[1])
				.example(...downloadType.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadType.command}\n\n${downloadType.usage.long}`);
		})
	.command([uploadType.command, uploadType.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...uploadType.example[0])
				.example(...uploadType.example[1])
				.example(...uploadType.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadType.command}\n\n${uploadType.usage.long}`);
		})
	.command([createWordTemplate.command, createWordTemplate.alias], false,
		(yargs) => {
			yargs.option('name', {
					alias: 'n',
					description: 'The name for the template, default to the type name'
				})
				.option('format', {
					alias: 'f',
					description: 'The template format [' + getWordTemplateTypes().join(' | ') + ']. Defaults to form.'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (argv.style && !getWordTemplateTypes().includes(argv.style)) {
						throw new Error(`${os.EOL} ${argv.style} is not a valid value for <style>`);
					}
					return true;
				})
				.example(...createWordTemplate.example[0])
				.example(...createWordTemplate.example[1])
				.example(...createWordTemplate.example[2])
				.example(...createWordTemplate.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createWordTemplate.command}\n\n${createWordTemplate.usage.long}`);
		})
	.command([createContentItem.command, createContentItem.alias], false,
		(yargs) => {
			yargs.option('type', {
					alias: 't',
					description: 'The source type [' + getContentItemSources().join(' | ') + ']',
					demandOption: true
				})
				.option('repository', {
					alias: 'r',
					description: 'The repository for the item',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (argv.type && !getContentItemSources().includes(argv.type)) {
						throw new Error(`${os.EOL} ${argv.type} is not a valid value for <type>`);
					}
					return true;
				})
				.example(...createContentItem.example[0])
				.example(...createContentItem.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createContentItem.command}\n\n${createContentItem.usage.long}`);
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
					description: 'The registered OCE server'
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
	.command([shareChannel.command, shareChannel.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getResourceRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getResourceRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareChannel.example[0])
				.example(...shareChannel.example[1])
				.example(...shareChannel.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareChannel.command}\n\n${shareChannel.usage.long}`);
		})
	.command([unshareChannel.command, unshareChannel.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareChannel.example[0])
				.example(...unshareChannel.example[1])
				.example(...unshareChannel.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareChannel.command}\n\n${unshareChannel.usage.long}`);
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
					description: 'The registered OCE server'
				})
				.example(...createLocalizationPolicy.example[0])
				.example(...createLocalizationPolicy.example[1])
				.example(...createLocalizationPolicy.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createLocalizationPolicy.command}\n\n${createLocalizationPolicy.usage.long}`);
		})
	.command([listAssets.command, listAssets.alias], false,
		(yargs) => {
			yargs.option('channel', {
					alias: 'c',
					description: 'Channel name'
				})
				.option('collection', {
					alias: 'l',
					description: 'Collection name'
				})
				.option('repository', {
					alias: 'r',
					description: 'Repository name, required when <collection> is specified'
				})
				.option('query', {
					alias: 'q',
					description: 'Query to fetch the assets'
				})
				/*
				.option('urls', {
					alias: 'u',
					description: 'Display asset URLs'
				})
				*/
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (argv.collection && !argv.repository) {
						throw new Error(`<repository> is required when <collection> is specified`);
					}
					return true;
				})
				.example(...listAssets.example[0])
				.example(...listAssets.example[1])
				.example(...listAssets.example[2])
				.example(...listAssets.example[3])
				.example(...listAssets.example[4])
				.example(...listAssets.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listAssets.command}\n\n${listAssets.usage.long}`);
		})
	.command([createAssetUsageReport.command, createAssetUsageReport.alias], false,
		(yargs) => {
			yargs.option('output', {
					alias: 'o',
					description: 'Output the report to a JSON file'
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...createAssetUsageReport.example[0])
				.example(...createAssetUsageReport.example[1])
				.example(...createAssetUsageReport.example[2])
				.example(...createAssetUsageReport.example[3])
				.example(...createAssetUsageReport.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createAssetUsageReport.command}\n\n${createAssetUsageReport.usage.long}`);
		})
	.command([listTranslationJobs.command, listTranslationJobs.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
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
				.option('connector', {
					alias: 'c',
					description: 'The translation connector'
				})
				.option('type', {
					alias: 't',
					description: 'The type of translation job contents'
				})
				.option('server', {
					alias: 'r',
					description: 'The registered OCE server'
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
				.example(...createTranslationJob.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTranslationJob.command}\n\n${createTranslationJob.usage.long}`);
		})
	.command([downloadTranslationJob.command, downloadTranslationJob.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
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
	.command([refreshTranslationJob.command, refreshTranslationJob.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...refreshTranslationJob.example[0])
				.example(...refreshTranslationJob.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${refreshTranslationJob.command}\n\n${refreshTranslationJob.usage.long}`);
		})
	.command([ingestTranslationJob.command, ingestTranslationJob.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...ingestTranslationJob.example[0])
				.example(...ingestTranslationJob.example[1])
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
					description: 'The registered OCE server'
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
			yargs.option('from', {
					alias: 'f',
					description: '<source> to create from',
				})
				.check((argv) => {
					if (argv.from && !getTranslationConnectorSources().includes(argv.from)) {
						throw new Error(`${argv.from} is not a valid value for <source>`);
					} else {
						return true;
					}
				})
				.example(...createTranslationConnector.example[0])
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
					description: '<server> The registered OCE server'
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
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getFolderRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					if (argv.role && !getFolderRoles().includes(argv.role)) {
						throw new Error(`${argv.role} is not a valid value for <role>`);
					}
					return true;
				})
				.example(...shareFolder.example[0])
				.example(...shareFolder.example[1])
				.example(...shareFolder.example[2])
				.example(...shareFolder.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${shareFolder.command}\n\n${shareFolder.usage.long}`);
		})
	.command([unshareFolder.command, unshareFolder.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...unshareFolder.example[0])
				.example(...unshareFolder.example[1])
				.example(...unshareFolder.example[2])
				.example(...unshareFolder.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${unshareFolder.command}\n\n${unshareFolder.usage.long}`);
		})
	.command([downloadFolder.command, downloadFolder.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Local folder to save the folder on OCE server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: '<folder> The parent folder on OCE server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
				})
				.option('permanent', {
					alias: 'p',
					description: 'Delete the folder permanently'
				})
				.example(...deleteFolder.example[0])
				.example(...deleteFolder.example[1])
				.example(...deleteFolder.example[2])
				.example(...deleteFolder.example[3])
				.example(...deleteFolder.example[4])
				.example(...deleteFolder.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteFolder.command}\n\n${deleteFolder.usage.long}`);
		})
	.command([uploadFile.command, uploadFile.alias], false,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> The parent folder on OCE server'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
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
					description: '<server> The registered OCE server'
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
	.command([deleteFile.command, deleteFile.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.option('permanent', {
					alias: 'p',
					description: 'Delete the file permanently'
				})
				.example(...deleteFile.example[0])
				.example(...deleteFile.example[1])
				.example(...deleteFile.example[2])
				.example(...deleteFile.example[3])
				.example(...deleteFile.example[4])
				.example(...deleteFile.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteFile.command}\n\n${deleteFile.usage.long}`);
		})
	.command([createGroup.command, createGroup.alias], false,
		(yargs) => {
			yargs.option('type', {
					alias: 't',
					description: 'The group type [' + getGroupTypes().join(' | ') + ']'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (argv.type && !getGroupTypes().includes(argv.type)) {
						throw new Error(`${argv.type} is not a valid value for <type>`);
					}
					return true;
				})
				.example(...createGroup.example[0])
				.example(...createGroup.example[1])
				.example(...createGroup.example[2])
				.example(...createGroup.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createGroup.command}\n\n${createGroup.usage.long}`);
		})
	.command([deleteGroup.command, deleteGroup.alias], false,
		(yargs) => {
			yargs.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...deleteGroup.example[0])
				.example(...deleteGroup.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deleteGroup.command}\n\n${deleteGroup.usage.long}`);
		})
	.command([addMemberToGroup.command, addMemberToGroup.alias], false,
		(yargs) => {
			yargs.option('users', {
					alias: 'u',
					description: 'The comma separated list of user names'
				})
				.option('groups', {
					alias: 'g',
					description: 'The comma separated list of group names'
				})
				.option('role', {
					alias: 'r',
					description: 'The role [' + getGroupMemberRoles().join(' | ') + '] to assign to the users or groups',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.check((argv) => {
					if (!argv.users && !argv.groups) {
						throw new Error('Please specify users or groups');
					}
					return true;
				})
				.example(...addMemberToGroup.example[0])
				.example(...addMemberToGroup.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${addMemberToGroup.command}\n\n${addMemberToGroup.usage.long}`);
		})
	.command([removeMemberFromGroup.command, removeMemberFromGroup.alias], false,
		(yargs) => {
			yargs.option('members', {
					alias: 'm',
					description: 'The comma separated list of user and group names',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.example(...removeMemberFromGroup.example[0])
				.example(...removeMemberFromGroup.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeMemberFromGroup.command}\n\n${removeMemberFromGroup.usage.long}`);
		})
	.command([downloadRecommendation.command, downloadRecommendation.alias], false,
		(yargs) => {
			yargs.option('repository', {
					alias: 'r',
					description: 'The repository'
				})
				.option('published', {
					alias: 'p',
					description: 'The flag to indicate published version'
				})
				.option('channel', {
					alias: 'c',
					description: 'Channel name, required when <published> is set'
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.check((argv) => {
					if (argv.published && !argv.channel) {
						throw new Error(`<channel> is required when <published> is set`);
					}
					return true;
				})
				.example(...downloadRecommendation.example[0])
				.example(...downloadRecommendation.example[1])
				.example(...downloadRecommendation.example[2])
				.example(...downloadRecommendation.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadRecommendation.command}\n\n${downloadRecommendation.usage.long}`);
		})
	.command([uploadRecommendation.command, uploadRecommendation.alias], false,
		(yargs) => {
			yargs.option('repository', {
					alias: 'r',
					description: 'The repository',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: '<server> The registered OCE server'
				})
				.example(...uploadRecommendation.example[0])
				.example(...uploadRecommendation.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${uploadRecommendation.command}\n\n${uploadRecommendation.usage.long}`);
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
				.option('timeout', {
					alias: 'm',
					description: 'Timeout in millisecond when try to login to the server. Defaults to 30000ms.'
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
						if (argv.timeout && (!Number.isInteger(argv.timeout) || argv.timeout < 30000)) {
							throw new Error('Value for timeout should be an integer greater than 30000');
						}
					}
					return true;
				})
				.example(...registerServer.example[0])
				.example(...registerServer.example[1])
				.example(...registerServer.example[2])
				.example(...registerServer.example[3])
				.example(...registerServer.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${registerServer.command}\n\n${registerServer.usage.long}`);
		})
	.command([setOAuthToken.command, setOAuthToken.alias], false,
		(yargs) => {
			yargs
				.option('server', {
					alias: 's',
					description: 'The registered OCE server',
					demandOption: true
				})
				.example(...setOAuthToken.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${setOAuthToken.command}\n\n${setOAuthToken.usage.long}`);
		})
	.command([executeGet.command, executeGet.alias], false,
		(yargs) => {
			yargs.option('file', {
					alias: 'f',
					description: 'The file to save the result',
					demandOption: true
				})
				.option('server', {
					alias: 's',
					description: 'The registered OCE server'
				})
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${executeGet.command}\n\n${executeGet.usage.long}`);
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
					description: 'The registered OCE server'
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
					description: 'The registered OCE server for sync source',
					demandOption: true
				})
				.option('destination', {
					alias: 'd',
					description: 'The registered OCE server for sync destination',
					demandOption: true
				})
				.option('authorization', {
					alias: 'a',
					description: 'The authorization method [' + getSyncServerAuths().join(' | ') + '] for the web hook event, defaults to basic'
				})
				.option('username', {
					alias: 'u',
					description: 'The username used to authenticate the web hook event when <authorization> is basic'
				})
				.option('password', {
					alias: 'w',
					description: 'The password used to authenticate the web hook event when <authorization> is basic'
				})
				.option('values', {
					alias: 'v',
					description: 'The comma separated list of name-value pairs used to authenticate the web hook event when <authorization> is header'
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
				.check((argv) => {
					if (argv.authorization && !getSyncServerAuths().includes(argv.authorization)) {
						throw new Error(`${argv.authorization} is not a valid value for <authorization>`);
					}
					if (argv.authorization && argv.authorization === 'header') {
						if (!argv.values) {
							throw new Error('Please specify values for authorization header');
						}
						if (argv.values.indexOf(':') < 0) {
							throw new Error('The value for authorization header is not valid, should be <key>:<value>');
						}
					}
					return true;
				})
				.example(...syncServer.example[0])
				.example(...syncServer.example[1])
				.example(...syncServer.example[2])
				.example(...syncServer.example[3])
				.example(...syncServer.example[4])
				.example(...syncServer.example[5])
				.example(...syncServer.example[6])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${syncServer.command}\n\n${syncServer.usage.long}`);
		})
	.command([compilationServer.command, compilationServer.alias], false,
		(yargs) => {
			yargs
				.option('port', {
					alias: 'p',
					description: 'Set port. Defaults to 8087.'
				})
				.option('logs', {
					alias: 'l',
					description: 'The directory for compilation logs'
				})
				.option('jobs', {
					alias: 'j',
					description: 'The directory for jobs data'
				})
				.option('timeout', {
					alias: 't',
					description: 'Timeout value for compile-template'
				})
				.option('key', {
					alias: 'k',
					description: 'The key file for HTTPS'
				})
				.option('certificate', {
					alias: 'c',
					description: 'The certificate file for HTTPS'
				})
				.option('onceonly', {
					alias: 'o',
					description: 'Exit after a single compilation run'
				})
				.example(...compilationServer.example[0])
				.example(...compilationServer.example[1])
				.example(...compilationServer.example[2])
				.example(...compilationServer.example[3])
				.example(...compilationServer.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${compilationServer.command}\n\n${compilationServer.usage.long}`);
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

// Display toolkit version
if (fs.existsSync(path.join(appRoot, 'package.json'))) {
	var packageJSON = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json')));
	var cecVersion = packageJSON.version;
	console.log('OCE Toolkit ' + cecVersion);
}

/*********************
 * Command execution
 **********************/
//console.log(argv);


var spawnCmd;

if (argv._[0] === 'install' || argv._[0] === 'i') {
	var projectRoot = _getProjectRoot();
	if (projectRoot && projectRoot !== cwd) {
		console.log(`A Content and Experience project already installed at ${projectRoot}`);
		return;
	}

	if (projectRoot) {
		var packageFile = path.join(projectRoot, 'package.json');
		var packageJSON = JSON.parse(fs.readFileSync(packageFile));
		if (packageJSON && packageJSON.name === 'cec-sites-toolkit') {
			console.log(`You cannot install Content and Experience project at ${projectRoot}. Please install at a different location.`);
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
	if (argv.addcustomsettings) {
		createContentLayoutArgs.push(...['--addcustomsettings'], argv.addcustomsettings);
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

} else if (argv._[0] === shareComponent.name || argv._[0] === shareComponent.alias) {
	let shareComponentArgs = ['run', '-s', shareComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareComponentArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareComponentArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		shareComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareComponent.name || argv._[0] === unshareComponent.alias) {
	let unshareComponentArgs = ['run', '-s', unshareComponent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareComponentArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareComponentArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareComponentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareComponentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createTemplate.name || argv._[0] === createTemplate.alias) {

	let createTemplateArgs = ['run', '-s', createTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--source', argv.from ? argv.from : 'StarterTemplate'
	];
	if (argv.site && typeof argv.site !== 'boolean') {
		createTemplateArgs.push(...['--site', argv.site]);
	}
	if (argv.excludecontent) {
		createTemplateArgs.push(...['--excludecontent', argv.excludecontent]);
	}
	if (argv.enterprisetemplate) {
		createTemplateArgs.push(...['--enterprisetemplate', argv.enterprisetemplate]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createTemplateArgs.push(...['--server', argv.server]);
	}
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
		deployTemplateArgs.push(...['--excludecontenttemplate', argv.excludecontenttemplate]);
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
	if (argv.excludecomponents) {
		uploadTemplateArgs.push(...['--excludecomponents', argv.excludecomponents]);
	}
	if (argv.publish) {
		uploadTemplateArgs.push(...['--publish', argv.publish]);
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
	if (argv.enterprisetemplate) {
		createTemplateFromSiteArgs.push(...['--enterprisetemplate', argv.enterprisetemplate]);
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
	if (argv.noDetailPages) {
		compileTemplateArgs.push(...['--noDetailPages', argv.noDetailPages]);
	}
	if (argv.noDefaultDetailPageLink) {
		compileTemplateArgs.push(...['--noDefaultDetailPageLink', argv.noDefaultDetailPageLink]);
	}
	if (argv.includeLocale) {
		compileTemplateArgs.push(...['--includeLocale', argv.includeLocale]);
	}
	if (argv.verbose) {
		compileTemplateArgs.push(...['--verbose', argv.verbose]);
	}
	if (argv.targetDevice) {
		compileTemplateArgs.push(...['--targetDevice', argv.targetDevice]);
	}
	if (argv.siteName) {
		compileTemplateArgs.push(...['--siteName', argv.siteName]);
	}
	if (argv.secureSite) {
		compileTemplateArgs.push(...['--secureSite', argv.secureSite]);
	}
	if (argv.ignoreErrors) {
		compileTemplateArgs.push(...['--ignoreErrors', argv.targetDevice]);
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

} else if (argv._[0] === shareTemplate.name || argv._[0] === shareTemplate.alias) {
	let shareTemplateArgs = ['run', '-s', shareTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareTemplateArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareTemplateArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		shareTemplateArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareTemplate.name || argv._[0] === unshareTemplate.alias) {
	let unshareTemplateArgs = ['run', '-s', unshareTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareTemplateArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareTemplateArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareTemplateArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareTemplateArgs, {
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

} else if (argv._[0] === createTemplateReport.name || argv._[0] === createTemplateReport.alias) {
	let createTemplateReportArgs = ['run', '-s', createTemplateReport.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	if (argv.includepagelinks) {
		createTemplateReportArgs.push(...['--includepagelinks', argv.includepagelinks]);
	}
	if (argv.output) {
		var outputVal = typeof argv.output === 'boolean' ? './' : argv.output;
		createTemplateReportArgs.push(...['--output', outputVal]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, createTemplateReportArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === cleanupTemplate.name) {
	let cleanupTemplateArgs = ['run', '-s', cleanupTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file
	];

	spawnCmd = childProcess.spawnSync(npmCmd, cleanupTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === updateTemplate.name || argv._[0] === updateTemplate.alias) {
	let updateTemplateArgs = ['run', '-s', updateTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action,
		'--template', argv.template
	];
	if (argv.content) {
		updateTemplateArgs.push(...['--content', argv.content]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, updateTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === addContentLayoutMapping.name || argv._[0] === addContentLayoutMapping.alias) {
	let addContentLayoutMappingArgs = ['run', '-s', addContentLayoutMapping.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--contentlayout', argv.contentlayout,
		'--contenttype', argv.contenttype
	];
	if (argv.template) {
		addContentLayoutMappingArgs.push(...['--template', argv.template]);
	}
	if (argv.layoutstyle) {
		addContentLayoutMappingArgs.push(...['--layoutstyle', argv.layoutstyle]);
	}
	if (argv.mobile) {
		addContentLayoutMappingArgs.push(...['--mobile', argv.mobile]);
	}
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		addContentLayoutMappingArgs.push(...['--server'], serverVal);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, addContentLayoutMappingArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === removeContentLayoutMapping.name || argv._[0] === removeContentLayoutMapping.alias) {
	let removeContentLayoutMappingArgs = ['run', '-s', removeContentLayoutMapping.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--contentlayout', argv.contentlayout
	];
	if (argv.contenttype) {
		removeContentLayoutMappingArgs.push(...['--contenttype', argv.contenttype]);
	}
	if (argv.template) {
		removeContentLayoutMappingArgs.push(...['--template', argv.template]);
	}
	if (argv.layoutstyle) {
		removeContentLayoutMappingArgs.push(...['--layoutstyle', argv.layoutstyle]);
	}
	if (argv.mobile) {
		removeContentLayoutMappingArgs.push(...['--mobile', argv.mobile]);
	}
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		removeContentLayoutMappingArgs.push(...['--server'], serverVal);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, removeContentLayoutMappingArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === addFieldEditor.name || argv._[0] === addFieldEditor.alias) {
	let addFieldEditorArgs = ['run', '-s', addFieldEditor.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template,
		'--contenttype', argv.contenttype,
		'--field', argv.field
	];
	if (argv.contenttemplate) {
		addFieldEditorArgs.push(...['--contenttemplate', argv.contenttemplate]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, addFieldEditorArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === removeFieldEditor.name || argv._[0] === removeFieldEditor.alias) {
	let removeFieldEditorArgs = ['run', '-s', removeFieldEditor.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template,
		'--contenttype', argv.contenttype,
		'--field', argv.field
	];
	if (argv.contenttemplate) {
		removeFieldEditorArgs.push(...['--contenttemplate', argv.contenttemplate]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, removeFieldEditorArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === addContentForm.name || argv._[0] === addContentForm.alias) {
	let addContentFormArgs = ['run', '-s', addContentForm.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template,
		'--contenttype', argv.contenttype
	];
	if (argv.contenttemplate) {
		addContentFormArgs.push(...['--contenttemplate', argv.contenttemplate]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, addContentFormArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === removeContentForm.name || argv._[0] === removeContentForm.alias) {
	let removeContentFormArgs = ['run', '-s', removeContentForm.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--template', argv.template,
		'--contenttype', argv.contenttype
	];
	if (argv.contenttemplate) {
		removeContentFormArgs.push(...['--contenttemplate', argv.contenttemplate]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, removeContentFormArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadContent.name || argv._[0] === downloadContent.alias) {
	let downloadContentArgs = ['run', '-s', downloadContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadContentArgs.push(...['--server', argv.server]);
	}
	if (argv.channel) {
		downloadContentArgs.push(...['--channel', argv.channel]);
	}
	if (argv.publishedassets) {
		downloadContentArgs.push(...['--publishedassets', argv.publishedassets]);
	}
	if (argv.collection) {
		downloadContentArgs.push(...['--collection', argv.collection]);
	}
	if (argv.repository) {
		downloadContentArgs.push(...['--repository', argv.repository]);
	}
	if (argv.query) {
		downloadContentArgs.push(...['--query', argv.query]);
	}
	if (argv.assets && typeof argv.assets !== 'boolean') {
		downloadContentArgs.push(...['--assets', argv.assets]);
	}
	if (argv.name && typeof argv.name !== 'boolean') {
		downloadContentArgs.push(...['--name', argv.name]);
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
	if (argv.types) {
		uploadContentArgs.push(...['--types', argv.types]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlContent.name || argv._[0] === controlContent.alias) {
	let controlContentArgs = ['run', '-s', controlContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action
	];
	if (argv.channel) {
		controlContentArgs.push(...['--channel', argv.channel]);
	}
	if (argv.collection) {
		controlContentArgs.push(...['--collection', argv.collection]);
	}
	if (argv.repository) {
		controlContentArgs.push(...['--repository', argv.repository]);
	}
	if (argv.assets) {
		controlContentArgs.push(...['--assets', argv.assets]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		controlContentArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === copyAssets.name || argv._[0] === copyAssets.alias) {
	let copyAssetsArgs = ['run', '-s', copyAssets.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--repository', argv.repository,
		'--target', argv.target
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		copyAssetsArgs.push(...['--server', argv.server]);
	}
	if (argv.collection) {
		copyAssetsArgs.push(...['--collection', argv.collection]);
	}
	if (argv.channel) {
		copyAssetsArgs.push(...['--channel', argv.channel]);
	}
	if (argv.query) {
		copyAssetsArgs.push(...['--query', argv.query]);
	}
	if (argv.assets && typeof argv.assets !== 'boolean') {
		copyAssetsArgs.push(...['--assets', argv.assets]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, copyAssetsArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadTaxonomy.name || argv._[0] === downloadTaxonomy.alias) {
	let downloadTaxonomyArgs = ['run', '-s', downloadTaxonomy.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--status', argv.status
	];
	if (argv.id) {
		downloadTaxonomyArgs.push(...['--id', argv.id]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadTaxonomyArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadTaxonomyArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadTaxonomy.name || argv._[0] === uploadTaxonomy.alias) {
	let uploadTaxonomyArgs = ['run', '-s', uploadTaxonomy.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--taxonomy', argv.taxonomy
	];
	if (argv.createnew) {
		uploadTaxonomyArgs.push(...['--createnew', argv.createnew]);
	}
	if (argv.name) {
		uploadTaxonomyArgs.push(...['--name', argv.name]);
	}
	if (argv.abbreviation) {
		uploadTaxonomyArgs.push(...['--abbreviation', argv.abbreviation]);
	}
	if (argv.description) {
		uploadTaxonomyArgs.push(...['--description', argv.description]);
	}
	if (argv.file) {
		uploadTaxonomyArgs.push(...['--file', argv.file]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		uploadTaxonomyArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadTaxonomyArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === controlTaxonomy.name || argv._[0] === controlTaxonomy.alias) {
	let controlTaxonomyArgs = ['run', '-s', controlTaxonomy.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--action', argv.action
	];
	if (argv.name) {
		controlTaxonomyArgs.push(...['--name', argv.name]);
	}
	if (argv.id) {
		controlTaxonomyArgs.push(...['--id', argv.id]);
	}

	controlTaxonomyArgs.push(...['--publishable', (argv.publishable || true)]);

	if (argv.channels) {
		controlTaxonomyArgs.push(...['--channels', argv.channels]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		controlTaxonomyArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, controlTaxonomyArgs, {
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

} else if (argv._[0] === shareTheme.name || argv._[0] === shareTheme.alias) {
	let shareThemeArgs = ['run', '-s', shareTheme.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareThemeArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareThemeArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		shareThemeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareThemeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareTheme.name || argv._[0] === unshareTheme.alias) {
	let unshareThemeArgs = ['run', '-s', unshareTheme.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareThemeArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareThemeArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareThemeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareThemeArgs, {
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

} else if (argv._[0] === listAssets.name || argv._[0] === listAssets.alias) {
	let listAssetsArgs = ['run', '-s', listAssets.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		listAssetsArgs.push(...['--server', argv.server]);
	}
	if (argv.channel) {
		listAssetsArgs.push(...['--channel', argv.channel]);
	}
	if (argv.collection) {
		listAssetsArgs.push(...['--collection', argv.collection]);
	}
	if (argv.repository) {
		listAssetsArgs.push(...['--repository', argv.repository]);
	}
	if (argv.query) {
		listAssetsArgs.push(...['--query', argv.query]);
	}
	if (argv.urls) {
		listAssetsArgs.push(...['--urls', argv.urls]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, listAssetsArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createAssetUsageReport.name || argv._[0] === createAssetUsageReport.alias) {
	let createAssetUsageReportArgs = ['run', '-s', createAssetUsageReport.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--assets', argv.assets
	];

	if (argv.output) {
		var outputVal = typeof argv.output === 'boolean' ? './' : argv.output;
		createAssetUsageReportArgs.push(...['--output', outputVal]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createAssetUsageReportArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createAssetUsageReportArgs, {
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
	if (argv.update) {
		createSiteArgs.push(...['--update', argv.update]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === transferSite.name || argv._[0] === transferSite.alias) {
	let transferSiteArgs = ['run', '-s', transferSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--server', argv.server,
		'--destination', argv.destination
	];
	if (argv.repository && typeof argv.repository !== 'boolean') {
		transferSiteArgs.push(...['--repository', argv.repository]);
	}
	if (argv.localizationPolicy && typeof argv.localizationPolicy !== 'boolean') {
		transferSiteArgs.push(...['--localizationPolicy', argv.localizationPolicy]);
	}
	if (argv.publishedassets) {
		transferSiteArgs.push(...['--publishedassets', argv.publishedassets]);
	}
	if (argv.excludecontent) {
		transferSiteArgs.push(...['--excludecontent', argv.excludecontent]);
	}
	if (argv.excludecomponents) {
		transferSiteArgs.push(...['--excludecomponents', argv.excludecomponents]);
	}
	if (argv.includestaticfiles) {
		transferSiteArgs.push(...['--includestaticfiles', argv.includestaticfiles]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, transferSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === transferSiteContent.name || argv._[0] === transferSiteContent.alias) {
	let transferSiteContentArgs = ['run', '-s', transferSiteContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--server', argv.server,
		'--destination', argv.destination,
		'--repository', argv.repository
	];
	if (argv.publishedassets) {
		transferSiteContentArgs.push(...['--publishedassets', argv.publishedassets]);
	}
	if (argv.repositorymappings) {
		transferSiteContentArgs.push(...['--repositorymappings', argv.repositorymappings]);
	}
	if (argv.number) {
		transferSiteContentArgs.push(...['--number', argv.number]);
	}
	if (argv.execute) {
		transferSiteContentArgs.push(...['--execute', argv.execute]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, transferSiteContentArgs, {
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
	if (argv.usedcontentonly) {
		controlSiteArgs.push(...['--usedcontentonly', argv.usedcontentonly]);
	}
	if (argv.compilesite) {
		controlSiteArgs.push(...['--compilesite', argv.compilesite]);
	}
	if (argv.staticonly) {
		controlSiteArgs.push(...['--staticonly', argv.staticonly]);
	}
	if (argv.fullpublish) {
		controlSiteArgs.push(...['--fullpublish', argv.fullpublish]);
	}
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
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareSiteArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareSiteArgs.push(...['--groups', argv.groups]);
	}
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
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareSiteArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareSiteArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === getSiteSecurity.name || argv._[0] === getSiteSecurity.alias) {
	let getSiteSecurityArgs = ['run', '-s', getSiteSecurity.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		getSiteSecurityArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, getSiteSecurityArgs, {
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
	if (argv.excludecontenttemplate) {
		updateSiteArgs.push(...['--excludecontenttemplate', argv.excludecontenttemplate]);
	}
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
		createRSSFeedArgs.push(...['--rsstitle', argv.title]);
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
	if (argv.javascript) {
		createRSSFeedArgs.push(...['--javascript', argv.javascript]);
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

} else if (argv._[0] === uploadStaticSite.name || argv._[0] === uploadStaticSite.alias) {
	let uploadStaticSiteArgs = ['run', '-s', uploadStaticSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--path', argv.path,
		'--site', argv.site
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		uploadStaticSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadStaticSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadStaticSite.name || argv._[0] === downloadStaticSite.alias) {
	let downloadStaticSiteArgs = ['run', '-s', downloadStaticSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site
	];
	if (argv.folder && typeof argv.folder !== 'boolean') {
		downloadStaticSiteArgs.push(...['--folder', argv.folder]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadStaticSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadStaticSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === deleteStaticSite.name || argv._[0] === deleteStaticSite.alias) {
	let deleteStaticSiteArgs = ['run', '-s', deleteStaticSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		deleteStaticSiteArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deleteStaticSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === refreshPrerenderCache.name || argv._[0] === refreshPrerenderCache.alias) {
	let refreshPrerenderCacheArgs = ['run', '-s', refreshPrerenderCache.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		refreshPrerenderCacheArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, refreshPrerenderCacheArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === migrateSite.name || argv._[0] === migrateSite.alias) {
	let migrateSiteArgs = ['run', '-s', migrateSite.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--site', argv.site,
		'--destination', argv.destination,
		'--repository', argv.repository
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		migrateSiteArgs.push(...['--server', argv.server]);
	}
	if (argv.template && typeof argv.template !== 'boolean') {
		migrateSiteArgs.push(...['--template', argv.template]);
	}
	if (argv.name && typeof argv.name !== 'boolean') {
		migrateSiteArgs.push(...['--name', argv.name]);
	}
	if (argv.description) {
		migrateSiteArgs.push(...['--description', argv.description]);
	}
	if (argv.sitePrefix) {
		migrateSiteArgs.push(...['--sitePrefix', argv.sitePrefix]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, migrateSiteArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === migrateContent.name || argv._[0] === migrateContent.alias) {
	let migrateContentArgs = ['run', '-s', migrateContent.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--server', argv.server,
		'--destination', argv.destination,
		'--repository', argv.repository
	];
	if (argv.channel && typeof argv.channel !== 'boolean') {
		migrateContentArgs.push(...['--channel', argv.channel]);
	}
	if (argv.collection && typeof argv.collection !== 'boolean') {
		migrateContentArgs.push(...['--collection', argv.collection]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, migrateContentArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === renameContentType.name || argv._[0] === renameContentType.alias) {
	let renameContentTypeArgs = ['run', '-s', renameContentType.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--newname', argv.newname,
		'--content', argv.content
	];
	if (argv.template) {
		renameContentTypeArgs.push(...['--template', argv.template]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, renameContentTypeArgs, {
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
	if (argv.taxonomies) {
		controlRepositoryArgs.push(...['--taxonomies', argv.taxonomies]);
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
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareRepositoryArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareRepositoryArgs.push(...['--groups', argv.groups]);
	}
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
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareRepositoryArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareRepositoryArgs.push(...['--groups', argv.groups]);
	}
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
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareTypeArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareTypeArgs.push(...['--groups', argv.groups]);
	}
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
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareTypeArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareTypeArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareTypeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareTypeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadType.name || argv._[0] === downloadType.alias) {
	let downloadTypeArgs = ['run', '-s', downloadType.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		downloadTypeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, downloadTypeArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createWordTemplate.name || argv._[0] === createWordTemplate.alias) {
	let createWordTemplateArgs = ['run', '-s', createWordTemplate.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--type', argv.type
	];

	if (argv.name) {
		createWordTemplateArgs.push(...['--name', argv.name]);
	}
	if (argv.format) {
		createWordTemplateArgs.push(...['--format', argv.format]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createWordTemplateArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createWordTemplateArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === createContentItem.name || argv._[0] === createContentItem.alias) {
	let createContentItemArgs = ['run', '-s', createContentItem.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file,
		'--type', argv.type,
		'--repository', argv.repository
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		createContentItemArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createContentItemArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadType.name || argv._[0] === uploadType.alias) {
	let uploadTypeArgs = ['run', '-s', uploadType.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		uploadTypeArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, uploadTypeArgs, {
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

} else if (argv._[0] === shareChannel.name || argv._[0] === shareChannel.alias) {
	let shareChannelArgs = ['run', '-s', shareChannel.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareChannelArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareChannelArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		shareChannelArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, shareChannelArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === unshareChannel.name || argv._[0] === unshareChannel.alias) {
	let unshareChannelArgs = ['run', '-s', unshareChannel.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareChannelArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		unshareChannelArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		unshareChannelArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, unshareChannelArgs, {
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
	if (argv.connector) {
		createTranslationJobArgs.push(...['--connector', argv.connector]);
	}
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

} else if (argv._[0] === refreshTranslationJob.name || argv._[0] === refreshTranslationJob.alias) {
	let refreshTranslationJobArgs = ['run', '-s', refreshTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		refreshTranslationJobArgs.push(...['--server'], serverVal);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, refreshTranslationJobArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === ingestTranslationJob.name || argv._[0] === ingestTranslationJob.alias) {
	let ingestTranslationJobArgs = ['run', '-s', ingestTranslationJob.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.server) {
		var serverVal = typeof argv.server === 'boolean' ? '__cecconfigserver' : argv.server;
		ingestTranslationJobArgs.push(...['--server'], serverVal);
	}
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
		'--name', argv.name,
		'--source', argv.from ? argv.from : 'mockTranslationConnector'
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
		'--role', argv.role
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		shareFolderArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		shareFolderArgs.push(...['--groups', argv.groups]);
	}
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
		'--name', argv.name
	];
	if (argv.users && typeof argv.users !== 'boolean') {
		unshareFolderArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groupss !== 'boolean') {
		unshareFolderArgs.push(...['--groups', argv.groups]);
	}
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

} else if (argv._[0] === deleteFile.name || argv._[0] === deleteFile.alias) {
	let deleteFileArgs = ['run', '-s', deleteFile.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--file', argv.file
	];
	if (argv.server && typeof argv.server !== 'boolean') {
		deleteFileArgs.push(...['--server', argv.server]);
	}
	if (argv.permanent) {
		deleteFileArgs.push(...['--permanent', argv.permanent]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deleteFileArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === downloadRecommendation.name || argv._[0] === downloadRecommendation.alias) {
	let downloadRecommendationArgs = ['run', '-s', downloadRecommendation.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.published) {
		downloadRecommendationArgs.push(...['--published', argv.published]);
	}
	if (argv.channel) {
		downloadRecommendationArgs.push(...['--channel', argv.channel]);
	}
	if (argv.repository) {
		downloadRecommendationArgs.push(...['--repository', argv.repository]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		downloadRecommendationArgs.push(...['--server', argv.server]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, downloadRecommendationArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === uploadRecommendation.name || argv._[0] === uploadRecommendation.alias) {
	let uploadRecommendationArgs = ['run', '-s', uploadRecommendation.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--repository', argv.repository
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		uploadRecommendationArgs.push(...['--server', argv.server]);
	}

	spawnCmd = childProcess.spawnSync(npmCmd, uploadRecommendationArgs, {
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
	if (argv.timeout) {
		registerServerArgs.push(...['--timeout'], argv.timeout);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, registerServerArgs, {
		cwd,
		stdio: 'inherit'
	});

} else if (argv._[0] === setOAuthToken.name || argv._[0] === setOAuthToken.alias) {
	let setOAuthTokenArgs = ['run', '-s', setOAuthToken.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--token', argv.token,
		'--server', argv.server
	];

	spawnCmd = childProcess.spawnSync(npmCmd, setOAuthTokenArgs, {
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
	if (argv.authorization && typeof argv.authorization !== 'boolean') {
		syncServerArgs.push(...['--authorization', argv.authorization]);
	}
	if (argv.username && typeof argv.username !== 'boolean') {
		syncServerArgs.push(...['--username', argv.username]);
	}
	if (argv.password && typeof argv.password !== 'boolean') {
		syncServerArgs.push(...['--password', argv.password]);
	}
	if (argv.values) {
		syncServerArgs.push(...['--values', argv.values]);
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
} else if (argv._[0] === compilationServer.name || argv._[0] === compilationServer.alias) {
	let compilationServerArgs = ['run', '-s', compilationServer.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd
	];
	if (argv.port) {
		compilationServerArgs.push(...['--port', argv.port]);
	}
	if (argv.logs) {
		compilationServerArgs.push(...['--logs', argv.logs]);
	}
	if (argv.jobs) {
		compilationServerArgs.push(...['--jobs', argv.jobs]);
	}
	if (argv.timeout) {
		compilationServerArgs.push(...['--timeout', argv.timeout]);
	}
	if (argv.key && typeof argv.key !== 'boolean') {
		compilationServerArgs.push(...['--key', argv.key]);
	}
	if (argv.certificate && typeof argv.certificate !== 'boolean') {
		compilationServerArgs.push(...['--certificate', argv.certificate]);
	}
	if (argv.onceonly) {
		compilationServerArgs.push(...['--onceonly', argv.onceonly]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, compilationServerArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === createGroup.name || argv._[0] === createGroup.alias) {
	let createGroupArgs = ['run', '-s', createGroup.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];
	if (argv.type) {
		createGroupArgs.push(...['--type', argv.type]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		createGroupArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, createGroupArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === deleteGroup.name || argv._[0] === deleteGroup.alias) {
	let deleteGroupArgs = ['run', '-s', deleteGroup.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		deleteGroupArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, deleteGroupArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === addMemberToGroup.name || argv._[0] === addMemberToGroup.alias) {
	let addMemberToGroupArgs = ['run', '-s', addMemberToGroup.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--role', argv.role
	];

	if (argv.users && typeof argv.users !== 'boolean') {
		addMemberToGroupArgs.push(...['--users', argv.users]);
	}
	if (argv.groups && typeof argv.groups !== 'boolean') {
		addMemberToGroupArgs.push(...['--groups', argv.groups]);
	}
	if (argv.server && typeof argv.server !== 'boolean') {
		addMemberToGroupArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, addMemberToGroupArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === removeMemberFromGroup.name || argv._[0] === removeMemberFromGroup.alias) {
	let removeMemberFromGroupArgs = ['run', '-s', removeMemberFromGroup.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--name', argv.name,
		'--members', argv.members
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		removeMemberFromGroupArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, removeMemberFromGroupArgs, {
		cwd,
		stdio: 'inherit'
	});
} else if (argv._[0] === executeGet.name || argv._[0] === executeGet.alias) {
	let executeGetArgs = ['run', '-s', executeGet.name, '--prefix', appRoot,
		'--',
		'--projectDir', cwd,
		'--endpoint', argv.endpoint,
		'--file', argv.file
	];

	if (argv.server && typeof argv.server !== 'boolean') {
		executeGetArgs.push(...['--server', argv.server]);
	}
	spawnCmd = childProcess.spawnSync(npmCmd, executeGetArgs, {
		cwd,
		stdio: 'inherit'
	});
}


// see if need to show deprecation warning
_checkVersion();

// console.log(spawnCmd);
process.exit(spawnCmd ? spawnCmd.status : 0);