# Content and Experience Cloud - Component, Template, Theme and Content Layout Development

To learn about developing components for Content and Experience Cloud, see the links below:

[Developing Content Layouts Locally with Developer Cloud Service](https://docs.oracle.com/en/cloud/paas/content-cloud/developer/developing-content-layouts-locally-developer-cloud-service.html)

[Developing Custom Components with Developer Cloud Service](https://docs.oracle.com/en/cloud/paas/content-cloud/developer/developing-custom-components-developer-cloud-service.html)

## Setup

* Make sure `node` and `npm` are in your `PATH`.  Use NodeJS 8.0.0 or later.
* Pull the source from the DevCS Project - Git Repository.  Open a terminal window and enter this command:

 ```
	git clone <your_project_url>.git
```

* Install the dependencies - In the project root `cec-components`, enter:

```
cd cec-components
npm install
```

* Install the `cec` command line utility:

> **Mac**:

```
sudo npm run install-cec
```

> **Windows**:

```
npm run install-cec
```

>Note: In Windows, If the `npm run install-cec` command fails, run the following commands:

```
cd bin\cec
npm install
cd ..\..\
npm run install-cec
```
Run the command line utility `cec` to get help about the commands.

* Start the local test harness to allow disconnected development of components, themes, templates, and content layouts:
 
```
cd cec-components
npm start
```

* the runtime test harness can be accessed from the browser using address: [http://localhost:8085](http://localhost:8085)

* Your components, themes, templates, layouts can all be found in `cec-components/src/main`
 
## Using a Content and Experience Cloud instance for local testing

The CEC instance can be used for the following things:

* Testing components like Sample-File-List which access content
* Generating Content Layouts from content types stored in CEC
* Rendering Content Layouts using content from CEC
* Exporting and Importing templates, and components from / to CEC into local cec-components
 
The steps are as follows:

* Create a `gradle.properties` file:
 
```
mkdir ~/.gradle 
cp cec-components/gradle.properties ~/.gradle
```

* Edit `~/.gradle/gradle.properties` to point to your CEC instance.  Note for internal compute CEC instances, use `cec_env=pod`
 
```
cec_url=https://<documents-hostname>:443
cec_username=your.username
cec_password=your.password
cec_env=pod_ec
```



