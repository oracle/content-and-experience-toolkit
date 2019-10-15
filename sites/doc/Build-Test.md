# OCE Toolkit: Theme Build/Test Process

The "cec install" command now creates a number of resources in order to support optimize of themes and components during deployment as well as creating automated tests. 

The following additional files/folder are added the cec install folder with the new entries highlighted in bold:

* cec.properties         - local copy for connection values to run against a remote server (default server if --server not specified on the command line)
* dist/                          - output from exporting cec resources
* etc/                           - (installed by package dependencies - not used directly by cec)
* **gulpfile.js                 - generic build tasks**
* libs/                          - link back to commonly used JS libraries
* node_modules/        - result of running npm install
* package.json           - scripts, dependencies, install, ...
* src/                           - users source code
* **test/                           - tests for any user source code**

# Building Your OCE Resources

The default OCE JS build environment is gulp: [https://gulpjs.com/](https://gulpjs.com/) with some common packages:

* gulp-sass: [https://github.com/dlmanning/gulp-sass](https://github.com/dlmanning/gulp-sass)
* gulp-terser: [https://github.com/duan602728596/gulp-terser](https://github.com/duan602728596/gulp-terser)

> Note: There are any number of JS build tools available. Depending on your own requirements, you may consider using others such as grunt/webpack/browserify/...

## Building Your Themes

The `cec export-template` and `cec deploy-template` commands have been updated with a `--optimize` option.  This option will run any `gulpfile.js` under the theme and any components associated with the template. If no `gulpfile.js` exists, then it will behave as if the `--optimize` option wasn't specified.

The "StarterTemplate" has been updated with a sample `gulpfile.js` file against the theme.  The default task of this file does:

* nls: provides a placeholder for any updates required to nls files
* sass: runs `gulp-sass` task over any `.scss` files in the theme/assets folder or sub-folder
* uglify: runs `terser` over any non `.min.js`, `.js` files in the theme/assets folder or sub-folder. The result is the same file name albeit with minimized content.

> Note:  Typically the output would be a .min file, which requires also using the `gulp-replace` service to update any references the re-named file.  That is beyond the scope of a generic sample but should be part of any actual implementation.

## Building Your Components

While no sample is available the sample theme `gulpfile.js` can be copied and used for any component.

When a template is exported, any `gulpfile.js` against any component is run so all components included in the distribution from the template have the opportunity to be optimized.

## Building All Resources

The top-level `gulpfile.js` default task loops through each of the templates in the src folder and calls:  `cec export-template {template} --optimize`

This file can be updated to deploy the templates to your remote server rather than just a as local export. 

There is also a default `build` npm script target in `package.json`:   `npm run build`

## What About Building Shared Resources?

One obvious hole in the build/optimize cycle is the lack of ability to create, package and re-use shared resources. And this is really the meat of any build process. 

Unfortunately, until shared resources are fully supported in OCE, there isn't any reasonable default to provide developers in the toolkit.  

The only option available is to place shared resources within another resource such as a common component or theme. The problem with placing them in a theme is that any component that relies on them are now tied to that theme. The alternative of placing the resources in a component does allow the component to be used across themes but the component will at least need to be added as a "themed component" to the theme that any components in your site depend upon.

Once you have chosen an option, you can create `requireJS` optimizer to generate bundles as part of your build process that can then be included in your other components. However, this is a very bespoke solution and will vary depending on your requirements.

# Testing Your OCE Resources

The default OCE JS test environment is mocha: [https://mochajs.org/](https://mochajs.org/) running under nodeJS and puppeteer: [https://github.com/GoogleChrome/puppeteer](https://github.com/GoogleChrome/puppeteer)

> Note: As with the build frameworks, depending on your requirements, you may also consider other frameworks such as Jasmine/QUnit/... and integration with Karma.

The OOTB test samples are focused on validating rendered templates and components in the browser. It is also intended to allow tests to be written against the local test server as well as against the remote OCE server. For tests that require validation in edit mode (when in the OCE Sites Builder), the only option will be to run the tests against the remote server as the local test server only contains the runtime code. 

The following files are produced by `cec install`: 

* `test/` 
    * `setupSpec.js`                                    - instantiates puppeteer and, if required, logs on to the remote server to setup the session cookies, etc. 
    * `components/componentsSpec.js`  - runs through all the components in the src/ folder and validates that they at least render onto the page 
    * `templates/templatesSpec.js`         - runs through all the templates in the src/ folder and validates that at least the "home" link renders correctly
    * `utils/testUtils.js`                                - general utility functions (mostly for logging onto the remote server)

## Test Command line

The `package.json` file has the following scripts to support the tests:

* `"test": "mocha --recursive test"`
* `"test-debug": "mocha --inspect-brk --recursive test"`
* `"test-headless": "mocha --recursive test --headless"`
* `"test-remote": "mocha --recursive test --remote"`
* `"test-unit": "mocha --recursive test -R ./node_modules/mocha-junit-reporter"`

> Note: These are simply some convenience scripts and the various options can be combined. The options can also simply be added on the command line. e.g.: The following combines all the options (apart from --inspect-brk for debugging)

```
npm run test --remote --headless 
```

```
npm run test 
```

Recursively runs all the files under the test/ folder against the [http://localhost:8085](http://localhost:8085) server

```
npm run test-debug
```

Allows the user to debug the test.  

Same as `npm run test` but starts the npm process with `--inspect-brk`, which forces the process to wait until the debugger is attached before running the tests.

```
npm run test-headless
```

Same as `npm run test` but the browser is run in headless mode so you won't see the browser appear while the tests are running.

```
npm run test-remote
```

Runs the tests against the remote server specified in the `cec.properties` file.

This also sets a flag in the testConfig that you can check against to determine if your tests is applicable.  At a minimum, the URL will be different between the "local" and "remote" tests.  

```
npm run test-unit
```

This outputs the test results in junit format that can be used for integration with Jenkins. 

## OOTB Tests

```
setupSpec.js
```

Sets up the global environment for running all the other test:

* Extracts the command line values from the npm environment to configure the run
* Defines the global before() function to run before any of the tests that will:  
    * Instantiate an instance of the browser that will be used for all the other tests
    * Log on to the remote server (if --remote specified) based on the cec.properties values
* Defines a global after() function that is executed after all the tests complete that will: 
    * Close down the browser instance

```
componentsSpec.js
```

Loops through all the components and tries to render the component onto the page.  

Since it's a generic function, it simply checks that the custom component code has rendered something (anything) into the custom compnonent container div. 

As each component type is different, it only handles local components and needs extension for other component types as required. However, you're more likely to write specific tests for your component.  

```
templatesSpec.js
```

Loops through all the templates and tries to render the template onto the page. 

As it's generic, all it does is wait for the "home" link to appear on the page.  If your template doesn't have the "Home" link, then the test will fail. 

### remote tests

There are currently no OOTB remote tests defined.  You can run with `--remote` and it will bring up the browser and logon but the `componentsSpec` and `templatesSpec` will simply state that there is a "ToDo" to write the remote tests and throw a test failure error.

To write remote tests, you'll need to seed a site before running the tests (use the OCE CLI commands).  Once the site is seeded, you can have specific pages in the site for validating individual components on the remote server. 

## Jenkins Integration

Here is an export of example Job running the OOTB test framework running under Jenkins: [jenkins-job.xml](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/images/jenkins-job.xml?raw=true)


# Coding Standards

## JSHint

**Must:** Enforce coding standards w/JSHint and fix any errors as you go.  Pages should have zero errors.  Exceptions should be excluded with JSHint comments

**Should:** Add a Jenkins job to run JSHint over all the code base
Code Style

**Must:** Select a code beautifier and stick to the standard it supports.  Make sure it's available as a plug-in for the common editors that you will use for code development.  


## JSDoc

**Should:** Use this for external APIs.  

**Could:** Create a Jenkins job to generate your JSDoc and produce the zip file
