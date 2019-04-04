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
/**************************
 * Current directory check
 **************************/

const cwd = path.resolve('./');
//console.log("Current working directory is: " + cwd);
if (cwd.split(path.sep).pop() !== 'cec-components') {
	// check package.json
	var isCEC = false,
		packageFile = path.join(cwd, 'package.json');
	if (fs.existsSync(packageFile)) {
		var packageJSON = JSON.parse(fs.readFileSync(packageFile));
		isCEC = (packageJSON && packageJSON.name === 'cec-components');
	}
	if (!isCEC) {
		console.log(`${cwd} is not a Content and Experience Cloud project. Run this command from the cec-components directory.`);
		return;
	}
}

/**************************
 * Private helper functions 
 ***************************/

var getComponentSources = function () {
	const seededComponentSources = ['local', 'local-iframe', 'remote', 'sectionlayout', 'Sample-File-List', 'Sample-Folder-List', 'Sample-Documents-Manager',
		'Sample-Process-Start-Form', 'Sample-Process-Task-List', 'Sample-Process-Task-Details', 'Sample-Stocks-Embedded',
		'Sample-Text-With-Image', 'Sample-To-Do'
	];

	let existingComponentSources = fs.readdirSync(path.join('.', 'data', 'components'));
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

	let existingTemplateSources = fs.readdirSync(path.join('.', 'data', 'templates'));
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
	const values = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
	return values;
};

var getTranslationJobExportTypes = function () {
	const values = ['siteAll', 'siteItems', 'siteAssets'];
	return values;
};

/*********************
 * Command definitions
 **********************/

const createComponent = {
	command: 'create-component <name>',
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
	usage: {
		'short': 'Copies an existing component named <source> to <destination>.',
		'long': (function () {
			let desc = 'Copies an existing component named <source> to <destination>. <source> is a folder name from cec-components/src/main/components';
			return desc;
		})()
	},
	example: ['cec copy-component Sample-To-Do Comp1', 'Copies Sample-To-Do to Comp1.']
};

const createContentLayout = {
	command: 'create-contentlayout <name>',
	usage: {
		'short': 'Creates a content layout based on a content type from a local template or from CEC server.',
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
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -r'],
		['cec create-contentlayout Blog-Post-Overview-Layout -c Blog-Post -r -s detail']
	]
};


const importComponent = {
	command: 'import-component <zip>',
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
	usage: {
		'short': 'Exports the component <name> as a zip file.',
		'long': (function () {
			let desc = 'Exports the component <name> as a zip file and provides the location of the zip file.';
			return desc;
		})()
	},
	example: ['cec export-component Sample-To-Do', 'Exports the component Sample-To-Do.']
};

const deployComponent = {
	command: 'deploy-component <names>',
	usage: {
		'short': 'Deploys the components <names> to the Content and Experience Cloud server.',
		'long': (function () {
			let desc = 'Deploys the components <names> to the Content and Experience Cloud server. This uses the server specified in $HOME/gradle.properties file. Optionally specify -p to publish the component after deploy. Optionally specify -f <folder> to set the folder to upload the component zip file.';
			return desc;
		})()
	},
	example: [
		['cec deploy-component Sample-To-Do', 'Deploys the component Sample-To-Do.'],
		['cec deploy-component Sample-To-Do -p', 'Deploys and publishes the component Sample-To-Do.'],
		['cec deploy-component Sample-To-Do,Sample-To-Do2', 'Deploys component Sample-To-Do and Sample-To-Do2.'],
		['cec deploy-component Sample-To-Do -f Import/Components', 'Uploads file Sample-To-Do.zip to folder Import/Components and imports the component Sample-To-Do.'],
	]
};

const deployAllComponents = {
	command: 'deployAll',
	usage: {
		'short': 'Deploys all components to the Content and Experience Cloud server.',
		'long': (function () {
			let desc = 'Deploys all components to the Content and Experience Cloud server. This uses the server specified in $HOME/gradle.properties file.';
			return desc;
		})()
	},
	example: ['cec deployAll', 'Deploys all components to the Content and Experience Cloud server.']
};

const createTemplate = {
	command: 'create-template <name>',
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
	usage: {
		'short': 'Copies an existing template named <source> to <destination>.',
		'long': (function () {
			let desc = 'Copies an existing template named <source> to <destination>. <source> is a folder name from cec-components/src/main/templates';
			return desc;
		})()
	},
	example: ['cec copy-template Temp1 Temp2', 'Copies Temp1 to Temp2.']
};

const importTemplate = {
	command: 'import-template <zip>',
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
	usage: {
		'short': 'Deploys the template <name> to the Content and Experience Cloud server.',
		'long': (function () {
			let desc = 'Deploys the template <name> to the Content and Experience Cloud server. This uses the server specified in $HOME/gradle.properties file. Optionally specify -f <folder> to set the folder to upload the template zip file.';
			return desc;
		})()
	},
	example: [
		['cec deploy-template StarterTemplate', 'Deploys the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -f Import/Templates', 'Uploads file StarterTemplate.zip to folder Import/Templates and imports the template StarterTemplate.'],
		['cec deploy-template StarterTemplate -o', 'Optimizes and deploys the template StarterTemplate.']
	]
};

const describeTemplate = {
	command: 'describe-template <name>',
	usage: {
		'short': 'Describes the template <name> package.',
		'long': (function () {
			let desc = 'Describes the template <name> package such as theme, components and content types.';
			return desc;
		})()
	},
	example: ['cec describe-template StarterTemplate', 'Describes the template StarterTemplate package']
};

const listServerContentTypes = {
	command: 'list-server-content-types',
	usage: {
		'short': 'List all content types from server.',
		'long': (function () {
			let desc = 'List all content types from server.';
			return desc;
		})()
	},
	example: ['cec list-server-content-types']
};

const addContentLayoutMapping = {
	command: 'add-contentlayout-mapping <contentlayout>',
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
	usage: {
		'short': 'Remove a content layout mapping from a local template.',
		'long': (function () {
			let desc = 'Remove a content layout mapping from a local template. By default, all mappings for the content layout are removed. Optionally specify -s <layoutstyle> to name the mapping and -m to indicate the mobile mapping.';
			return desc;
		})()
	},
	example: [
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -t BlogTemplate -m'],
		['cec remove-contentlayout-mapping Blog-Post-Detail-Layout -c Blog-Post -t BlogTemplate -s Details']
	]
};

const addComponentToTheme = {
	command: 'add-component-to-theme <component>',
	usage: {
		'short': 'Add a component to a theme.',
		'long': (function () {
			let desc = 'Add a component to a theme. Optionally specify -c <category> to set the component category.';
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
	usage: {
		'short': 'Remove a component from a theme.',
		'long': (function () {
			let desc = 'Remove a component from a theme.';
			return desc;
		})()
	},
	example: [
		['cec remove-component-from-theme Sample-To-Do -t BlogTheme']
	]
};

const listResources = {
	command: 'list',
	usage: {
		'short': 'List local resources.',
		'long': (function () {
			let desc = 'List local resources such components and templates. Optionally specify -t <type> to list specific type of resources. ' +
				os.EOL + os.EOL + 'Valid values for <type> are: ' + os.EOL +
				'  components' + os.EOL +
				'  templates' + os.EOL;
			return desc;
		})()
	},
	example: [
		['cec list'],
		['cec list -t components'],
		['cec list --type templates']
	]
};

const indexSite = {
	command: 'index-site <site>',
	usage: {
		'short': 'Index the page content of site <site> on CEC server.',
		'long': (function () {
			let desc = 'Create content item for each page with all text on the page. If the page index content item already exists for a page, updated it with latest text on the page. Specify -c <contenttype> to set the page index content type. Optionally specify -p to publish the page index items after creation or update.';
			return desc;
		})()
	},
	example: [
		['cec index-site Site1 -c PageIndex'],
		['cec index-site Site1 -c PageIndex -p']
	]
};

const createSiteMap = {
	command: 'create-site-map <site>',
	usage: {
		'short': 'Create a site map for site <site> on CEC server.',
		'long': (function () {
			let desc = 'Create a site map for site on CEC server. Optionally specify -p to upload the site map to CEC server after creation. Optionally specify -c <changefreq> to define how frequently the page is likely to change. Also optionally specify <file> as the file name for the site map.\n\nThe valid values for <changefreq> are:\n\n';
			return getSiteMapChangefreqValues().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-site-map Site1 -u http://www.example.com/site1'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -f sitemap.xml'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -p'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -c weekly -p'],
		['cec create-site-map Site1 -u http://www.example.com/site1 -l de-DE,it-IT']
	]
};

const createTranslationJob = {
	command: 'create-translation-job <name>',
	usage: {
		'short': 'Create a translation job for a site on CEC server.',
		'long': (function () {
			let desc = 'Create a translation job for a site on CEC server. Specify -l <languages> to set the target languages, use "all" to select all languages from the translation policy. Optionally specify -t <type> to set the content type. The valid values for <type> are:\n\n';
			return getTranslationJobExportTypes().reduce((acc, item) => acc + '  ' + item + '\n', desc);
		})()
	},
	example: [
		['cec create-translation-job job1 -s Site1 -l all'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT'],
		['cec create-translation-job job1 -s Site1 -l de-DE,it-IT, -t siteItems']
	]
};

const listServerTranslationJobs = {
	command: 'list-translation-jobs',
	usage: {
		'short': 'List translation jobs on the server.',
		'long': (function () {
			let desc = 'List translation jobs for both assets and sites. Optionally specify -t <type> to list specific type of translation jobs. ' +
				os.EOL + os.EOL + 'Valid values for <type> are: ' + os.EOL +
				'  assets' + os.EOL +
				'  sites' + os.EOL;
			return desc;
		})()
	},
	example: [
		['cec list-translation-jobs'],
		['cec list-translation-jobs -t assets'],
		['cec list-translation-jobs --type sites']
	]
};

const downloadServerTranslationJob = {
	command: 'download-translation-job <name>',
	usage: {
		'short': 'Download translation job from the server.',
		'long': (function () {
			let desc = 'Download translation job from the server. Optionally specify -o <output> to specify the directory to save the translation zip file. ';
			return desc;
		})()
	},
	example: [
		['cec download-translation-job Assets-ru'],
		['cec download-translation-job Assets-ru -o ~/Downloads']
	]
};

const importTranslationJob = {
	command: 'import-translation-job <file>',
	usage: {
		'short': 'Import translation job to the server.',
		'long': (function () {
			let desc = 'Upload translation zip file <file> to the server, validate and then injest the translations. Optionally specify -v to validate only. Optionally specify -f <folder> to set the folder to upload the translation zip file. ';
			return desc;
		})()
	},
	example: [
		['cec import-translation-job Assets-ru.zip', 'File will be uploaded to the Home folder.'],
		['cec import-translation-job ~/Downloads/Assets-ru.zip -f Import/TranslationJobs', 'File will be uploaded to folder Import/TranslationJobs.'],
		['cec import-translation-job Assets-ru.zip -v', 'Validate the translation job without import.']
	]
};

/*********************
 * Setup yargs
 **********************/


const argv = yargs.usage('Usage: cec <command> [options] \n\nRun \'cec <command> -h\' to get the detailed help for the command.')
	.command(createComponent.command, createComponent.usage.short,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<from> Source to create from',
				})
				.check((argv) => {
					if (argv.from && !getComponentSources().includes(argv.from)) {
						throw new Error(`${argv.from} is a not a valid value for <source>`);
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
	.command(createContentLayout.command, createContentLayout.usage.short,
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
					description: 'flag to indicate the content type is from server',
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
	.command(copyComponent.command, copyComponent.usage.short,
		(yargs) => {
			yargs.example(...copyComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${copyComponent.command}\n\n${copyComponent.usage.long}`);
		})
	.command(importComponent.command, importComponent.usage.short,
		(yargs) => {
			yargs.example(...importComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${importComponent.command}\n\n${importComponent.usage.long}`);
		})
	.command(exportComponent.command, exportComponent.usage.short,
		(yargs) => {
			yargs.example(...exportComponent.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${exportComponent.command}\n\n${exportComponent.usage.long}`);
		})
	.command(deployComponent.command, deployComponent.usage.short,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the component zip file'
				})
				.option('publish', {
					alias: 'p',
					description: 'Publish the component'
				})
				.example(...deployComponent.example[0])
				.example(...deployComponent.example[1])
				.example(...deployComponent.example[2])
				.example(...deployComponent.example[3])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deployComponent.command}\n\n${deployComponent.usage.long}`);
		})
	/*
	.command(deployAllComponents.command, deployAllComponents.usage.short,
		(yargs) => {
			yargs.example(...deployAllComponents.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deployAllComponents.command}\n\n${deployAllComponents.usage.long}`);
		})
		*/
	.command(createTemplate.command, createTemplate.usage.short,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<source> Source to create from'
				})
				.check((argv) => {
					if (argv.from && !getTemplateSources().includes(argv.from)) {
						throw new Error(`${argv.from} is a not a valid value for <source>`);
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
	.command(copyTemplate.command, copyTemplate.usage.short,
		(yargs) => {
			yargs.example(...copyTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${copyTemplate.command}\n\n${copyTemplate.usage.long}`);
		})
	.command(importTemplate.command, importTemplate.usage.short,
		(yargs) => {
			yargs.example(...importTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${importTemplate.command}\n\n${importTemplate.usage.long}`);
		})
	.command(exportTemplate.command, exportTemplate.usage.short,
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
	.command(deployTemplate.command, deployTemplate.usage.short,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the template zip file'
				})
				.option('optimize', {
					alias: 'o',
					description: 'Optimize the template'
				})
				.example(...deployTemplate.example[0])
				.example(...deployTemplate.example[1])
				.example(...deployTemplate.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${deployTemplate.command}\n\n${deployTemplate.usage.long}`);
		})
	.command(describeTemplate.command, describeTemplate.usage.short,
		(yargs) => {
			yargs.example(...describeTemplate.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${describeTemplate.command}\n\n${describeTemplate.usage.long}`);
		})
	.command(listServerContentTypes.command, listServerContentTypes.usage.short,
		(yargs) => {
			yargs.example(...listServerContentTypes.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listServerContentTypes.command}\n\n${listServerContentTypes.usage.long}`);
		})
	.command(addContentLayoutMapping.command, addContentLayoutMapping.usage.short,
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
	.command(removeContentLayoutMapping.command, removeContentLayoutMapping.usage.short,
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
				.example(...removeContentLayoutMapping.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${removeContentLayoutMapping.command}\n\n${removeContentLayoutMapping.usage.long}`);
		})
	.command(addComponentToTheme.command, addComponentToTheme.usage.short,
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
	.command(removeComponentFromTheme.command, removeComponentFromTheme.usage.short,
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
	.command(listResources.command, listResources.usage.short,
		(yargs) => {
			yargs.option('type', {
					alias: 't',
					description: '<type> resource type: components | templates'
				})
				.example(...listResources.example[0])
				.example(...listResources.example[1])
				.example(...listResources.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listResources.command}\n\n${listResources.usage.long}`);
		})
	.command(indexSite.command, indexSite.usage.short,
		(yargs) => {
			yargs.option('contenttype', {
					alias: 'c',
					description: '<contenttype> page index content type'
				})
				.option('publish', {
					alias: 'p',
					description: 'publish page index items'
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
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${indexSite.command}\n\n${indexSite.usage.long}`);
		})
	.command(createSiteMap.command, createSiteMap.usage.short,
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
				.check((argv) => {
					if (!argv.url) {
						throw new Error('Please specify site URL');
					} else {
						return true;
					}
				})
				.example(...createSiteMap.example[0])
				.example(...createSiteMap.example[1])
				.example(...createSiteMap.example[2])
				.example(...createSiteMap.example[3])
				.example(...createSiteMap.example[4])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createSiteMap.command}\n\n${createSiteMap.usage.long}`);
		})
	.command(createTranslationJob.command, createTranslationJob.usage.short,
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
				.check((argv) => {
					if (!argv.site) {
						throw new Error('Please specify site');
					} else if (!argv.languages) {
						throw new Error('Please specify languages');
					} else if (argv.type && !getTranslationJobExportTypes().includes(argv.type)) {
						throw new Error(`${argv.type} is a not a valid value for <type>`);
					} else {
						return true;
					}
				})
				.example(...createTranslationJob.example[0])
				.example(...createTranslationJob.example[1])
				.example(...createTranslationJob.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createTranslationJob.command}\n\n${createTranslationJob.usage.long}`);
		})
	.command(listServerTranslationJobs.command, listServerTranslationJobs.usage.short,
		(yargs) => {
			yargs.option('type', {
					alias: 't',
					description: '<type> translation job type: assets | sites'
				})
				.example(...listServerTranslationJobs.example[0])
				.example(...listServerTranslationJobs.example[1])
				.example(...listServerTranslationJobs.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listServerTranslationJobs.command}\n\n${listServerTranslationJobs.usage.long}`);
		})
	.command(downloadServerTranslationJob.command, downloadServerTranslationJob.usage.short,
		(yargs) => {
			yargs.option('output', {
					alias: 'o',
					description: '<output> The directory to save the translation zip file'
				})
				.example(...downloadServerTranslationJob.example[0])
				.example(...downloadServerTranslationJob.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${downloadServerTranslationJob.command}\n\n${downloadServerTranslationJob.usage.long}`);
		})
	.command(importTranslationJob.command, importTranslationJob.usage.short,
		(yargs) => {
			yargs.option('folder', {
					alias: 'f',
					description: '<folder> Folder to upload the translation zip file'
				})
				.option('validateonly', {
					alias: 'v',
					description: 'Validate translation job without import.'
				})
				.example(...importTranslationJob.example[0])
				.example(...importTranslationJob.example[1])
				.example(...importTranslationJob.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${importTranslationJob.command}\n\n${importTranslationJob.usage.long}`);
		})
	.help('help')
	.alias('help', 'h')
	.version()
	.alias('version', 'v')
	.demandCommand(1, 'You need at least one command')
	.strict()
	.wrap(yargs.terminalWidth())
	.argv;


/*********************
 * Command execution
 **********************/
//console.log(argv);

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
var spawnCmd;

switch (argv._[0]) {
	case 'create-component':
		let createComponentArgs = ['run', '-s', argv._[0], '--', '--source', argv.from ? argv.from : 'local'];
		createComponentArgs.push(...['--name', argv.name]);
		spawnCmd = childProcess.spawnSync(npmCmd, createComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'create-contentlayout':
		let createContentLayoutArgs = ['run', '-s', argv._[0], '--',
			'--name', argv.name,
			'--contenttype', argv.contenttype,
			'--style', argv.style ? argv.style : 'overview'
		];
		if (argv.template) {
			createContentLayoutArgs.push(...['--template', argv.template]);
		} else if (argv.server) {
			createContentLayoutArgs.push(...['--server']);
		}

		spawnCmd = childProcess.spawnSync(npmCmd, createContentLayoutArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'copy-component':
		let copyComponentArgs = ['run', '-s', argv._[0], '--', '--source', argv.source];
		if (argv.destination) {
			copyComponentArgs.push(...['--name', argv.destination]);
		} else {
			copyComponentArgs.push(...['--name', argv.source + '_' + Math.floor(Math.random() * 1000000)]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, copyComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'import-component':
		let importComponentArgs = ['run', '-s', argv._[0], argv.zip];
		spawnCmd = childProcess.spawnSync(npmCmd, importComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'export-component':
		let exportComponentArgs = ['run', '-s', argv._[0], argv.name];
		spawnCmd = childProcess.spawnSync(npmCmd, exportComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'deploy-component':
		let deployComponentArgs = ['run', '-s', argv._[0], '--', '--component', argv.names];
		if (argv.publish) {
			deployComponentArgs.push(...['--publish', argv.publish]);
		}
		if (argv.folder && typeof argv.folder !== 'boolean') {
			deployComponentArgs.push(...['--folder', argv.folder]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, deployComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'deployAll':
		let deployAllComponentArgs = ['run', '-s', argv._[0]];
		spawnCmd = childProcess.spawnSync(npmCmd, deployAllComponentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'create-template':
		let createTemplateArgs = ['run', '-s', argv._[0], '--', '--source', argv.from ? argv.from : 'StarterTemplate'];
		createTemplateArgs.push(...['--name', argv.name]);
		spawnCmd = childProcess.spawnSync(npmCmd, createTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'copy-template':
		let copyTemplateArgs = ['run', '-s', argv._[0], '--', '--source', argv.source];
		if (argv.destination) {
			copyTemplateArgs.push(...['--name', argv.destination]);
		} else {
			copyTemplateArgs.push(...['--name', argv.source + '_' + Math.floor(Math.random() * 1000000)]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, copyTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'import-template':
		let importTemplateArgs = ['run', '-s', argv._[0], argv.zip];
		spawnCmd = childProcess.spawnSync(npmCmd, importTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'export-template':
		let exportTemplateArgs = ['run', '-s', argv._[0], '--', '--template', argv.name];
		if (argv.optimize) {
			exportTemplateArgs.push(...['--minify', argv.optimize]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, exportTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'deploy-template':
		let deployTemplateArgs = ['run', '-s', argv._[0], '--', '--template', argv.name];
		if (argv.folder && typeof argv.folder !== 'boolean') {
			deployTemplateArgs.push(...['--folder', argv.folder]);
		}
		if (argv.optimize) {
			deployTemplateArgs.push(...['--minify', argv.optimize]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, deployTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'describe-template':
		let describeTemplateArgs = ['run', '-s', argv._[0], argv.name];
		spawnCmd = childProcess.spawnSync(npmCmd, describeTemplateArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'add-contentlayout-mapping':
		let addContentLayoutMappingArgs = ['run', '-s', argv._[0], '--',
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
		break;

	case 'remove-contentlayout-mapping':
		let removeContentLayoutMappingArgs = ['run', '-s', argv._[0], '--',
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
		break;

	case 'add-component-to-theme':
		let addComponentToThemeArgs = ['run', '-s', argv._[0], '--',
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
		break;

	case 'remove-component-from-theme':
		let removeComponentFromThemeArgs = ['run', '-s', argv._[0], '--',
			'--component', argv.component,
			'--theme', argv.theme
		];

		spawnCmd = childProcess.spawnSync(npmCmd, removeComponentFromThemeArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'list-server-content-types':
		let listServerContentTypesArgs = ['run', '-s', argv._[0]];
		spawnCmd = childProcess.spawnSync(npmCmd, listServerContentTypesArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'list':
		let listArgs = ['run', '-s', argv._[0], '--', '--resourcetype', typeof argv.type === 'string' ? argv.type : 'all'];
		spawnCmd = childProcess.spawnSync(npmCmd, listArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'index-site':
		let indexSiteArgs = ['run', '-s', argv._[0], '--',
			'--site', argv.site,
			'--contenttype', argv.contenttype
		];
		if (argv.publish) {
			indexSiteArgs.push(...['--publish', argv.publish]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, indexSiteArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'create-site-map':
		let createSiteMapArgs = ['run', '-s', argv._[0], '--',
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
		spawnCmd = childProcess.spawnSync(npmCmd, createSiteMapArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'create-translation-job':
		let createTranslationJobArgs = ['run', '-s', argv._[0], '--',
			'--name', argv.name,
			'--site', argv.site,
			'--languages', argv.languages
		];
		if (argv.type) {
			createTranslationJobArgs.push(...['--type', argv.type]);
		}

		spawnCmd = childProcess.spawnSync(npmCmd, createTranslationJobArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'list-translation-jobs':
		let listServerTranslationJobsArgs = ['run', '-s', argv._[0], '--', '--type', typeof argv.type === 'string' ? argv.type : ''];
		spawnCmd = childProcess.spawnSync(npmCmd, listServerTranslationJobsArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'download-translation-job':
		let downloadServerTranslationJobArgs = ['run', '-s', argv._[0], '--', '--name', argv.name];
		if (argv.output) {
			downloadServerTranslationJobArgs.push(...['--output', argv.output]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, downloadServerTranslationJobArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'import-translation-job':
		let importTranslationJobArgs = ['run', '-s', argv._[0], '--', '--file', argv.file];

		if (argv.folder && typeof argv.folder !== 'boolean') {
			importTranslationJobArgs.push(...['--folder', argv.folder]);
		}
		if (argv.validateonly) {
			importTranslationJobArgs.push(...['--validateonly', argv.validateonly]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, importTranslationJobArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;
}