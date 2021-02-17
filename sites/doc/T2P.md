# Setup for Test to Production (T2P) using OCE Toolkit
OCE Toolkit supports test to production for Sites and Content via Git/SVN repository.

![](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/images/T2P-Graphic.jpg?raw=true)

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

Upload the template, which will also create the Content Types & Content Type Maps, theme and components.

```
cec upload-template blog-template --server DEV
```

Create the site with "update" option to keep the IDs

```
cec create-site blog-site -t blog-template -u -r Repo1 -l Policy1 -d en-US --server DEV
```

Publish blog-site and content.

```
cec control-content publish -c blog-site --server DEV
cec control-site publish -s blog-site --server DEV
cec control-site bring-online -s blog-site --server DEV
```

# Propagate a Site from DEV to UAT instance for the first time

The UAT instance must have a repository, and localization policy, which you can create as follows:

```
cec create-repository Repo1 --server UAT
cec create-localization-policy Policy1 -r en-US -l en-US --server UAT
```

Transfer the site to the UAT instance. 

```
cec transfer-site blog-site --server DEV --destination UAT --repository Repo1 --localizationPolicy Policy1
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

Update the site and content

```
cec transfer-site blog-site --server DEV --destination UAT 
```

Re-publish blog-site and content.

```
cec control-content publish -c blog-site --server UAT
cec control-site publish -s blog-site --server UAT
```

# Transfer sites with assets from multiple repositories

If the site contains assets from other repositories, by default those assets won't be transferred. You can provide the repository mappings to transfer them.

For example, site blog-site contains assets from repository ImageRepo and VideoRepo. 

Create ImageRepo and VideoRepo on server UAT if they don't exist.

```
cec transfer-site blog-site --server DEV --destination UAT --repository Repo1 --localizationPolicy Policy1 --repositorymappings ImageRepo:ImageRepo,VideoRepo:VideoRepo
```




