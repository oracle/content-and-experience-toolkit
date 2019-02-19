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
const {
	getInstalledPathSync
} = require('get-installed-path');

/**************************
 * Current directory check
 **************************/

const cwd = path.resolve('./');
// console.log("Current working directory is: " + cwd);

const appRoot = getInstalledPathSync('cecss-cli');
// console.log('appRoot: ' + appRoot);

/**************************
 * Private helper functions 
 ***************************/


/*********************
 * Command definitions
 **********************/

const createSite = {
	command: 'create-site <name>',
	usage: {
		'short': 'Creates the Site <name> for the content from local or from CEC server.',
		'long': (function () {
			let desc = 'Creates the Site <name> for the content from local or from CEC server. By default, it creates a StarterSite. Optionally specify -f <source> to create from different source.';
			return desc;
		})()
	},
	example: [
		['cecss create-site NewsSite -c ~/Downloads/NewsTemplate.zip'],
		['cecss create-site NewsSite -f ~/Downloads/ReactSiteTemplate.zip -c ~/Downloads/NewsTemplate.zip'],
		['cecss create-site BlogSite -s -n Blog'],
		['cecss create-site BlogSite -s -n Blog -t Blog,Author'],
		['cecss create-site NewsSite -c ~/Downloads/NewsTemplate.zip -l fr-FR,it-IT,de-DE'],
		['cecss create-site BlogSite -s -n Blog -l en-US,zh-CN'],
	]
};

const exportServerContent = {
	command: 'export-server-content <channel>',
	usage: {
		'short': 'Create content template based on the channel <channel>, then export and download the archive from CEC server.',
		'long': (function () {
			let desc = 'Create content template based on the channel <channel>, then export and download the archive from CEC server. Optionally specify -o <output> to specify the directory to save the export zip file.';
			return desc;
		})()
	},
	example: [
		['cecss export-server-content BlogChannel'],
		['cecss export-server-content BlogChannel -o ~/Downloads']
	]
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
	example: ['cecss list-server-content-types']
};

const listServerChannels = {
	command: 'list-server-channels',
	usage: {
		'short': 'List all channels from server.',
		'long': (function () {
			let desc = 'List all channels from server.';
			return desc;
		})()
	},
	example: ['cecss list-server-channels']
};

const develop = {
	command: 'develop',
	usage: {
		'short': 'Start development server. Watches files, rebuilds, and hot reloads if something changes.',
		'long': (function () {
			let desc = 'Start development server. Watches files, rebuilds, and hot reloads if something changes. This can only be run for a starter site created by cecss-cli. Optionally specify -p <port> to set the port for Webpack dev server (the default port is 9090) and -n <nodeserverport> to set the port for the backend node server (the default port is 8080).';
			return desc;
		})()
	},
	example: [
		['cecss develop'],
		['cecss develop -p 7070'],
		['cecss develop -p 7070 -n 2084']
	]
};

const build = {
	command: 'build',
	usage: {
		'short': 'Build a CEC starter site.',
		'long': (function () {
			let desc = 'Build a CEC starter site';
			return desc;
		})()
	},
	example: [
		['cecss build']
	]
};

const serve = {
	command: 'serve',
	usage: {
		'short': 'Serve previously build CEC starter site.',
		'long': (function () {
			let desc = 'Serve previoysly build CEC starter site. Optionally specify -p <port> to set the port, default port is 8080.';
			return desc;
		})()
	},
	example: [
		['cecss serve'],
		['cecss serve -p 7070']
	]
};

/*********************
 * Setup yargs
 **********************/


const argv = yargs.usage('Usage: cecss <command> [options] \n\nRun \'cecss <command> -h\' to get the detailed help for the command.')
	.command(createSite.command, createSite.usage.short,
		(yargs) => {
			yargs.option('from', {
					alias: 'f',
					description: '<source> Source to create from',
				})
				.option('content', {
					alias: 'c',
					description: '<content> The absolute path of the local CEC template zip file',
				})
				.option('server', {
					alias: 's',
					description: 'flag to indicate to use the content types from server',
				})
				.option('navtypes', {
					alias: 'n',
					description: '<navtypes> The comma separated list of content types from server to be used as site navigation',
				})
				.option('types', {
					alias: 't',
					description: '<types> The comma separated list of content types on the server, if not specified, all content types will be used',
				})
				.option('locales', {
					alias: 'l',
					description: '<locales> The comma separated list of locales, the first one in the list will be the default locale for the site',
				})
				.check((argv) => {
					if (!argv.content && !argv.server) {
						throw new Error('Please specify content zip file or server');
					} else {
						return true;
					}
					if (argv.server && !argv.navtypes) {
						throw new Error('Please specify the types for site navigation');
					}
				})
				.example(...createSite.example[0])
				.example(...createSite.example[1])
				.example(...createSite.example[2])
				.example(...createSite.example[3])
				.example(...createSite.example[4])
				.example(...createSite.example[5])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${createSite.command}\n\n${createSite.usage.long}`);
		})
	.command(exportServerContent.command, exportServerContent.usage.short,
		(yargs) => {
			yargs.option('output', {
					alias: 'o',
					description: '<output> The directory to save the export zip file',
				})
				.example(...exportServerContent.example[0])
				.example(...exportServerContent.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${exportServerContent.command}\n\n${exportServerContent.usage.long}`);
		})
	.command(listServerContentTypes.command, listServerContentTypes.usage.short,
		(yargs) => {
			yargs.example(...listServerContentTypes.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listServerContentTypes.command}\n\n${listServerContentTypes.usage.long}`);
		})
	.command(listServerChannels.command, listServerChannels.usage.short,
		(yargs) => {
			yargs.example(...listServerChannels.example)
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${listServerChannels.command}\n\n${listServerChannels.usage.long}`);
		})
	.command(develop.command, develop.usage.short,
		(yargs) => {
			yargs.option('port', {
					alias: 'p',
					description: 'Set <port> for Webpack dev server. Defaults to 9090.',
				})
				.option('nodeserverport', {
					alias: 'n',
					description: 'Set <nodeserverport> for backend node server. Defaults to 8080.',
				})
				.example(...develop.example[0])
				.example(...develop.example[1])
				.example(...develop.example[2])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${develop.command}\n\n${develop.usage.long}`);
		})
	.command(build.command, build.usage.short,
		(yargs) => {
			yargs.example(...build.example[0])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${build.command}\n\n${build.usage.long}`);
		})
	.command(serve.command, serve.usage.short,
		(yargs) => {
			yargs.option('port', {
					alias: 'p',
					description: 'Set <port>. Defaults to 8080.',
				})
				.example(...serve.example[0])
				.example(...serve.example[1])
				.help('help')
				.alias('help', 'h')
				.version(false)
				.usage(`Usage: cec ${serve.command}\n\n${serve.usage.long}`);
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

	case 'create-site':
		let createSiteArgs = ['run', '-s', '--prefix', appRoot, argv._[0],
			'--',
			'--projectDir', cwd,
			'--source', argv.from ? argv.from : path.join(appRoot, 'data', 'StarterSite.zip'),
			'--runtimeSrc', path.join(appRoot, 'data', 'siteruntime.zip'),
			'--name', argv.name
		];

		if (argv.content) {
			createSiteArgs.push(...['--content', argv.content]);
		} else if (argv.server) {
			createSiteArgs.push(...['--server']);
		}
		if (argv.navtypes) {
			createSiteArgs.push(...['--navtypes', argv.navtypes]);
		}
		if (argv.types) {
			createSiteArgs.push(...['--types', argv.types]);
		}
		if (argv.locales) {
			createSiteArgs.push(...['--locales', argv.locales]);
		}

		spawnCmd = childProcess.spawnSync(npmCmd, createSiteArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'export-server-content':
		let exportServerContentArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd,
			'--channel', argv.channel
		];
		if (argv.output) {
			exportServerContentArgs.push(...['--output', argv.output]);
		}

		spawnCmd = childProcess.spawnSync(npmCmd, exportServerContentArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;


	case 'list-server-content-types':
		let listServerContentTypesArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd
		];
		spawnCmd = childProcess.spawnSync(npmCmd, listServerContentTypesArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'list-server-channels':
		let listServerChannelsArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd
		];
		spawnCmd = childProcess.spawnSync(npmCmd, listServerChannelsArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'develop':
		let developArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd
		];
		if (argv.port) {
			developArgs.push(...['--port', argv.port]);
		}
		if (argv.nodeserverport) {
			developArgs.push(...['--nodeserverport', argv.nodeserverport]);
		}
		spawnCmd = childProcess.spawnSync(npmCmd, developArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'build':
		let buildArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd
		];
		spawnCmd = childProcess.spawnSync(npmCmd, buildArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;

	case 'serve':
		let serveArgs = ['run', '-s', argv._[0], '--prefix', appRoot,
			'--',
			'--projectDir', cwd
		];
		if (argv.port) {
			serveArgs.push(...['--port', argv.port]);
		}

		spawnCmd = childProcess.spawnSync(npmCmd, serveArgs, {
			cwd,
			stdio: 'inherit'
		});
		break;
}
