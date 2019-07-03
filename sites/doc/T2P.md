# Setup for Test to Production (T2P) using OCE Toolkit
OCE Toolkit supports test to production for Sites and Content via Git/SVN repository.

![](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/T2P-Graphic.jpg?raw=true)

Resources are created / edited in a Development OCE server, exported to the local file system using OCE Toolkit CLI, and propagated to a Test or Production OCE server using OCE Toolkit CLI.
Some resources, like components, content layouts can be developed directly into the local file system and tested using a local server, and deployed to the DEV instance.  Also, the CLI commands are bi-directional, so updates can be moved from TEST back to DEV instance. 

# Setup
[Install the OCE Toolkit](../README.MD)
## Create Source in your Local File system
In a directory inside a git / SVN repository, type the following:

```
cec install
```

This will create a source tree, with a package.json, and do an `npm install` to fetch dependencies into the source tree.  Update `package.json` to include any further dependencies you may need for your resources.

## Setup connections to your Source and Target OCE instances
You can have one, two, or more registered servers, based on your scenario.  It could be for example, DEV, TEST, PROD, or DEV, PROD.  You can test in a PROD server, and then use OCE Toolkit CLI to publish and go-live.

```
cec register-server DEV -e https://your-dev-instance.com -u user -p password
cec register-server UAT -e https://your-test-instance.com -u user -p password
cec register-server PROD -e https://your-production-instance.com -u user -p password
```

Test your connections as follows:

```
cec list --server DEV
```
# Create an initial site in DEV instance

Create a repository and localization policy in the DEV instance to use.

```
cec create-repository Repo1 --server DEV
cec create-localization-policy Policy1 -r en-US -l en-US --server DEV
```

Create a template for the site in the local file system:

```
cec create-template blog-template -f BlogTemplate
```

Upload the template w/content to create the Content Types & Content Type Maps, theme and components.

```
cec upload-template blog-template --server DEV
```

Upload template again but now exclude the content, content will be added after site is created.

```
cec upload-template blog-template -x --server DEV
```

Create the content site - and upload the content to the site with "update" option to keep the IDs

```
cec create-site blog-site -t blog-template -r Repo1 -l Policy1 -d en-US --server DEV
cec upload-content blog-template -t -r Repo1 -u -c blog-site -l "blog-site Site" --server DEV
```

Publish blog-site and content.

```
cec control-content publish -c blog-site --server DEV
cec control-site publish -s blog-site --server DEV
cec control-site bring-online -s blog-site --server DEV
```

# Propagate a Site from DEV to UAT instance for the first time
Use the following commands to pull a Site from DEV into local file system, and then push to the UAT instance for testing.

Export the site called blog-site from the DEV instance into the local file system, this is done via a template, so that we include the theme, custom components, and content used in the site.  The old version of the template is deleted in DEV before being re-created.

```
cec delete-template blog-template -p --server DEV
cec create-template-from-site blog-template --site blog-site -i --server DEV
cec download-template blog-template --server DEV
```

At this point you can optionally test the template in the local server:

```
cec develop &
open http://localhost:8085/templates/blog-template
```

The UAT instance must have a repository, and localization policy, which you can create as follows:

```
cec create-repository Repo1 --server UAT
cec create-localization-policy Policy1 -r en-US -l en-US --server UAT
```

Upload the site to the UAT instance.  This is done via the template, which will create content types, components and the theme on upload.

```
cec upload-template blog-template --server UAT
```
Upload template again but now exclude the content, content will be added after site is created.

```
cec upload-template blog-template -x --server UAT
```
Create the content site - and upload the content to the site with "update" option to keep the IDs

```
cec create-site blog-site -t blog-template -r Repo1 -l Policy1 -d en-US --server UAT
cec upload-content blog-template -t -r Repo1 -u -c blog-site -l "blog-site Site" --server UAT
```

Publish blog-site and content.

```
cec control-content publish -c blog-site --server UAT
cec control-site publish -s blog-site --server UAT
cec control-site bring-online -s blog-site --server UAT
```

# Make changes to the Site in DEV and author Content using the OCE Web UI
Using Asset repository and Site Builder, make changes to the Site and Content.

# Propagate the updated site and content from DEV to UAT 
Export the site into the local file system.

```
cec delete-template blog-template -p --server DEV
cec create-template-from-site blog-template --site blog-site -i --server DEV
cec download-template blog-template --server DEV
```

Upload the template to the UAT instance to update components, theme, content types.

```
cec delete-template blog-template -p --server UAT
cec upload-template blog-template --server UAT
```

Update the site and content from changes in the template in the local file system.

```
cec update-site blog-site -t blog-template --server UAT
```

Re-publish blog-site and content.

```
cec control-content publish -c blog-site --server UAT
cec control-site publish -s blog-site --server UAT
```




