# Content and Experience Cloud - Component, Template, Theme and Content Layout Development

To learn about developing components for Content and Experience Cloud, see the links below:

[Developing for Oracle Content and Experience Cloud](https://docs.oracle.com/en/cloud/paas/content-cloud/developer/develop-sites-toolkit.html)

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

* Start the local test harness to allow disconnected development of components, themes, templates, and content layouts:
 
```
npm start
```

* the runtime test harness can be accessed from the browser using address: [http://localhost:8085](http://localhost:8085)

* Your components, themes, templates, layouts can all be found in `src/main`
 
## Using a Content and Experience Cloud instance for local testing

The CEC instance can be used for the following things:

* Testing components like Sample-File-List which access content
* Generating Content Layouts from content types stored in CEC
* Rendering Content Layouts using content from CEC
* Exporting and Importing templates, and components from / to CEC into local file system
 
The steps are as follows:

* Create a `gradle.properties` file:
 
```
mkdir ~/.gradle 
cp gradle.properties ~/.gradle
```

* Edit `~/.gradle/gradle.properties` to point to your CEC instance.  Note for internal compute CEC instances, use `cec_env=pod`
 
```
cec_url=https://<documents-hostname>:443
cec_username=your.username
cec_password=your.password
cec_env=pod_ec
```



