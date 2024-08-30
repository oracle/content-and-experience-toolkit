// Gulp and plugins
var gulp = require('gulp'),
	del = require('del'),
	fs = require('fs'),
	path = require('path'),
	childProcess = require('child_process');

const cecCmd = /^win/.test(process.platform) ? 'cec.cmd' : 'cec';

const srcfolder = path.join(__dirname, 'src'),
	templatesSrcDir = path.join(srcfolder, 'templates');

// utilty function to get all folders in a directory
var getFolders = function (dir) {
	return fs.readdirSync(dir)
		.filter(function (file) {
			return fs.statSync(path.join(dir, file)).isDirectory();
		});
};

// Build a template
// This builds the template's theme and all included components 
var buildTemplate = function (templateName) {
	return new Promise(function (resolve, reject) {
		console.log();
		console.log('Executing: ' + 'cec export-template ' + templateName + ' --optimize');
		var exportTemplate = childProcess.spawnSync(cecCmd, ['export-template', templateName, '--optimize'], {
			shell: (process.platform === 'win32'),
			stdio: 'inherit'
		});
		if (exportTemplate.status) {
			// something went wrong with the build
			console.log(' - ERROR running "cec export-template -o ' + templateName + '. Process exited with status: ' + exportTemplate.status);
			reject(exportTemplate.status);
		} else {
			resolve();
		}
	});
};

gulp.task('build', function (done) {
	// get each of the templates in the build
	var templates = getFolders(templatesSrcDir);
	if (templates.length === 0) {
		return done();
	}

	// create a promise for each template
	var buildPromises = [];
	templates.forEach(function (templateName) {
		buildPromises.push(function () {
			return buildTemplate(templateName);
		});
	});

	// build each of the templates sequentially
	var doBuildTemplates = buildPromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function () {
				// wait for the previous promise to complete and then call the function to start executing the next promise
				return nextPromise();
			});
		},
		// Start with a previousPromise value that is a resolved promise 
		Promise.resolve());

	// wait for all the builds to complete
	doBuildTemplates.then(function () {
		console.log('Templates Built Successfully.');
		return done();
	}).catch(function (err) {
		console.log('Templates Build Failed.');
		return done(1);
	});

});

gulp.task('clean-build', function () {
	// remove the build and dist directories
	//return del(['./build', './dist']);

	// remove the build directory
	return del(['./build']);
});


//
// the default task
//
gulp.task('default', gulp.series('clean-build', gulp.parallel('build'), function (done) {
	done();
}));