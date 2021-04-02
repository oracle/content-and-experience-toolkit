# Content and Experience - Component, Template, Theme and Content Layout Development

To learn about developing components for Content and Experience, see the links below:

[Developing for Oracle Content and Experience](
https://docs.oracle.com/en/cloud/paas/content-cloud/developer/develop-oracle-content-and-experience-toolkit.html )

[Test to Production](doc/T2P.md) – Use the OCE toolkit for Test to Production

[Headless CLI](doc/IDCS-App.md) - Setup IDCS Application for headless CLI (No popup Chromium for authentication)

[Build Test](doc/Build-Test.md) - Build, optimize and test updates for OCE source

[Asset Sync](doc/AssetSync.md) - Synchronize asset create, update, delete, publish across OCE servers

[Site Pre-Compilation](doc/compiler.md) - Pre-Compile a site for faster rendition in the browser

## Setup

* Make sure `node` and `npm` are in your `PATH`.  Use NodeJS 8.0.0 or later.
* Download the OCE Toolkit - e.g. from GitHub - [link](https://github.com/oracle/content-and-experience-toolkit/archive/master.zip)
* Install the dependencies

```
cd  <download-path>/content-and-experience-toolkit/sites
npm install
```

* Put `cec` on your path:

> **Mac**:

```
sudo ln -s $PWD/node_modules/.bin/cec /usr/local/bin/cec
```

> **Windows**:

Run `SystemPropertiesAdvanced.exe`, edit Environment Variables and add `<your download path>\content-and-experience-toolkit\sites\node_modules\.bin` to the `PATH` variable, replacing `<your download path>` as appropriate.

* Run the command line utility `cec` to get help about the commands.
 
```
cec
```
## Create an initial `src` directory
Create an initial src directory in any location on your local file system to contain your CEC source.
A `package.json` some dependencies, and src will be created.  You can use this a your starting point for CEC source and dependency inclusion.

```
mkdir cec-src
cd cec-src
cec install
```
 
* Start the local test harness to allow disconnected development of components, themes, templates, and content layouts:
 
```
cec develop
```

* the runtime test harness can be accessed from the browser using address: [http://localhost:8085](http://localhost:8085)

* Your components, themes, templates, layouts can all be found in `src/`
 

## Setup connections to your OCE instances
You can have one, two, or more registered servers, based on your scenario.  It could be for example, DEV, TEST, PROD, or DEV, PROD.

```
cec register-server DEV -e https://your-dev-instance.com -u user -p password
cec register-server UAT -e https://your-test-instance.com -u user -p password
cec register-server PROD -e https://your-production-instance.com -u user -p password
```

Test your connections as follows:

```
cec list --server DEV
```

## Using an IDCS Application to access CEC Instance to have a CLI without Chromium popup for Authentication
Instructions on how to setup the IDCS for headless CLI are [here](doc/IDCS-App.md)

