# Oracle Content and Experience - Toolkit

Templates and resources for development platforms.

[sites](sites/) – Work with tools to create, test, and package your own site templates, themes, components and content layouts.

[Test to Production](sites/doc/T2P.md) – Use the OCE toolkit for Test to Production

[react-starter-sites](react-starter-sites/) – A quick way to get started with React site development.

# New in Release 19.3.1d

**Updated**
- `cec create-site-map` - use `--changefreq auto` to calculate page update frequency based on page update history.

**Fixed**
- `cec upload-template` - can now successfully upload templates which use hybrid links.

# New in Release 19.3.1c

**Fixed**
- `cec update-site` -- command line logging not working with node 10 when tracking progress updating files to site.

# New in Release 19.3.1b

**Updated**

- `cec develop` -- now takes --server XXX parameter to test locally using registered CEC server XXX for content.  Use `cec register-server` to register the server to use.

# New in Release 19.3.1a

**Added**

- `cec download-folder` -- recursive download of a folder contents from a CEC instance
- `cec upload-folder` -- recursive upload of a folder contents from local file system to a CEC instance
- `cec download-file` -- download a file from a CEC instance
- `cec unshare-folder` -- remove a user access from a folder

- Test to Production using OCE Toolkit documentation - [link](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/T2P.md)

# New in Release 19.3.1

**Added**
- `cec share-folder` -- share a documents folder in a CEC server

**Fixed**
- `npm install` -- on Windows not doing copy-libs step

# New in Release 19.2.3c

**Added**
- `cec upload-file` -- upload a file to CEC server

**Updated**
- `cec-components` -- folder no longer needed, upleveled contained files.
- `README.MD` -- install instructions only need `npm install` now and then put `cec` on your path.

# New in Release 19.2.3b

**Added**
- `cec control-repository` -- support for add-type, remove-type, add-channel, remove-channel
- `cec create-folder` -- create folder in CEC server by name or path

# New in Release 19.2.3a

**Added**
- `cec create-repository` -- create a repository on the specified CEC server
- `cec create-channel` -- create a channel on the specified CEC server
- `cec create-localization-policy` -- create a localization policy on the specified CEC server

# New in Release 19.2.3

**Updated**
- `cec create-rss-feed` - `{{{detailLink}}}` now includes slug.  `{{{DetailPageUrl}}}` plain link to detail page with no type and GUID, added to make `<link>{{{detailPageUrl}}}?slug={{slug}}</link>` possible.
- `cec list` - can now list server resources as well as local resources.

# New in Release 19.2.2f

**Updated**
- `cecss create-site` - in your site template zip, include a dependencies.json file at the top level to add tech dependencies for created sites.

Example: `dependencies.json`:

```
{
"color": "3.1.1",
"chalk": "2.4.2"
}
```

# New in Release 19.2.2e

**Added**
- `cec download-component` -- download a component from a CEC server to local file system
- `cec control-component` -- publish a component on a CEC server
- `cec control-theme` -- publish a theme
- `cec validate-site` -- validate site against localization policy before publish

**Added**
- `cec create-rss-feed` -- generate an RSS feed from a content query and publish to a site

# New in Release 19.2.2d
**The theme for this release is lifecycle.**

**Added**
- `cec register-server` -- register named CEC servers, and use with cec commands with `--server NAME` to target a `cec` operation to that server -- e.g. `cec create-site newsite -t template ... --server UAT`

**Added**
- `cec create-template-from-site` -- create a template from a site on a CEC server
- `cec download-template` -- download a template from a CEC server to local file system
- `cec upload-template` -- upload a template to a CEC server
- `cec delete-template` -- delete a template on a CEC server

**Added**
- `cec create-site` -- create an enterprise site on a CEC server
- `cec update-site` -- experimental, update a site on a CEC server from a template on local file system.
- `cec control-site` -- publish, unpublish, bring online, take offline a site on a CEC server

**Added**
- `cec download-content` -- download assets of a channel from a CEC server to local file system
- `cec upload-content` -- upload channel assets from local file system to CEC server, and optionally publish
- `cec control-content` -- publish, unpublish, remove content from a channel on a CEC server

**Deprecated**
- `cec deploy-template` -- it will still work, but is hidden from command usage.  Use `cec upload-template` instead.

# New in Release 19.2.2c
**Added**
- additional help for `cec -h install`.

# New in Release 19.2.2b
**Added**

- Support for non global install of cec.
```
cd cec-components
npm install
npm install bin/cec

#add to your PATH E.g:
export PATH=~/Dev/github/content-and-experience-toolkit/sites/cec-components/node_modules/.bin:$PATH
#or do it relatively:
export PATH=$PATH:./node_modules/.bin
```

# New in Release 19.2.2
**Added**
- Aliases for all `cec` commands.  E.g. `cec ltj` for `cec list-translation-jobs`.
- `cec install` -- Independent source creation, with own cec.properties, and npm install allows multiple source trees of CEC resources, and build step to load your own dependencies using npm via package.json unique to the source tree.
- `cec develop` -- Independently start a test server for your source tree on chosen port.

**Added Translation Support**
- `cec list-translation-jobs` -- List translation jobs on server, or in local environment with status
- `cec create-translation-job` -- Create a new translation job for a site on the server
- `cec download-translation-job ` -- Download a translation job from the server
- `cec submit-translation-job` -- Submit a local translation job to a translation management system for translation.  Use `cec list-translation-jobs` to see the progress of the translation.
- `cec ingest-translation-job` -- Bring a completed translation from a translation management system back to the local translation job.
- `cec upload-translation-job` -- Upload a completed, or partially completed translation job back to the server.
- `cec create-translation-connector` -- Create a new sample translation connector for communicating to a translation management system to automate translation.  The sample provides a sample translation, prepending language to strings that should be translated.
- `cec start-translation-connector` -- Start a local translation connector on a given port to handle translation submissions from `cec submit-translation-job`.
- `cec register-translation-connector` -- Register running translation connectors started with `cec start-translation-connector`, so they be used with `cec submit-translation-job`.

**Updated**
- `cec index-site` -- now supports Multi-Lingual sites and site language based search
- `cec create-site-map` -- now supports Multi-Lingual sites
