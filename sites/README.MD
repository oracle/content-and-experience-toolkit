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
sudo ln -s $PWD/content-and-experience-toolkit/sites/node_modules/.bin/cec /usr/local/bin/cec
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

* Your components, themes, templates, layouts can all be found in `src/main`
 
## Using a Content and Experience instance for local testing

The CEC instance can be used for the following things:

* Testing components like Sample-File-List which access content
* Generating Content Layouts from content types stored in CEC
* Rendering Content Layouts using content from CEC
* Exporting and Importing templates, and components from / to CEC into local file system
 
The steps are as follows:

* Update `cec.properties` file to point to your CEC instance.  Note for internal compute CEC instances, use `cec_env=pod`
 
```
cec_url=https://<documents-hostname>:443
cec_username=your.username
cec_password=your.password
cec_env=pod_ec
```

`cec.properties` file will be loaded from your current working directory.  Alternatively, you can use an environment variable to specify the location.  E.g.:

```
# optional
export CEC_PROPERTIES=~/my.properties
```

## Using an IDCS Application to access CEC Instance to have a CLI without Chromium popup for Authentication
Instructions on how to setup the IDCS for headless CLI are [here](doc/IDCS-App.md)

