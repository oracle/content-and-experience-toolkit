# Oracle Content and Experience - Toolkit

Templates and resources for development platforms.

[sites](sites/) – Work with tools to create, test, and package your own site templates, themes, components and content layouts.

[Pre-Compile Sites](sites/doc/compiler.md) - Pre-compile site pages into HTML for faster rendition in the browser

[Test to Production](sites/doc/T2P.md) – Use the OCE toolkit for Test to Production

[Build Test](sites/doc/Build-Test.md) - Build, optimize and test updates for OCE source

[Asset Sync](sites/doc/AssetSync.md) - Synchronize asset create, update, delete, publish across OCE servers

[react-starter-sites](react-starter-sites/) – A quick way to get started with React site development.

# New in Release 20.2.3b

**Fixed**

- `cec transfer-site` - Now updates site metadata correctly on destination server for repeat transfers.
 

# New in Release 20.2.3a

**Fixed**

- `cec create-rss-feed` - Now works correctly with the latest version of gulp cli.


# New in Release 20.2.3

**Added**

- `cec control-content` - Can now add content in a repository to a collection and remove content from a collection.

**Fixed**

- `cec transfer-site` - Fixed issue with internal component IDs.


# New in Release 20.2.2d

**Fixed**

- `cec transfer-site` with `-x` option - Now handles a larger number of files in the site.


# New in Release 20.2.2c

**Fixed**

- `cec transfer-site` - Fixed issue with internal theme ID when transferring site both with and without content.


# New in Release 20.2.2b

**Fixed**

- `cec transfer-site-content` - Now correctly handles repositories with spaces in their names. 


# New in Release 20.2.2a

**Added**
Support transfer large sites from OCE server to another OCE server in two steps.  

First transfer site without content:  
- `cec transfer-site <site> -s <source server> -d <destination server> -r <repository> -l <localizationPolicy> -x`  

Then transfer site content in batches using command:
- `cec transfer-site-content`  

This command will create scripts to download the site content in batches from the source server and then upload it to the destination server.  By default, the command will not automatically execute the scripts, however you can pass the parameter `-e` to execute if wanted.

Examples:
- (1) use the default batch size 500, create scripts and execute  
  `cec transfer-site-content <site> -s <source server> -d <destination server> -r <repository> -e`  
- (2) set the batch size to 200, create the scripts and execute  
  `cec transfer-site-content <site> -s <source server> -d <destination server> -r <repository> -n 200 -e`  
- (3) use the default batch size 500, create the script without execute  
  `cec transfer-site-content <site> -s <source server> -d <destination server> -r <repository>`  
- (4) sete the batch size to 200, create the script without execute
  `cec transfer-site-content <site> -s <source server> -d <destination server> -r <repository> -n 200`  

Both commands can be repeated for the same site.

# New in Release 20.2.2

**Fixed**

- `cec transfer-site` - Now cleans up template and template zip file on both source and target server.
- `cec donwload-taxonomy` - Now handles case where promoted and published are different versions.
- `cec sync-server` - Sync content items without creating temporary channel.

- For all request to the server, the following environment variables are respected:  
 `HTTP_PROXY/http_proxy` Used to proxy non-SSL requests.  
 `HTTPS_PROXY/https_proxy` Used to proxy SSL requests.  
 `NO_PROXY/no_proxy` A comma separated list of hosts to opt out of proxying.   


# New in Release 20.2.1b

**Fixed**

- Fixes `cec install` issue on Windows. Please be sure to run `npm install` after `cec install` on Windows.


# New in Release 20.2.1a

**Added**

- `cec create-template` - Now also includes section layouts.
- `cec share-repository` - Support IDCS groups.
- `cec unshare-repository` - Support IDCS groups.
- `cec share-type` - Support IDCS groups.
- `cec unshare-type` - Support IDCS groups.
- `cec transfer-site` - Now has option to transfer published assets only.

- Several commands can now handle much larger numbers of sites, components and themes.


# New in Release 20.2.1

**Added**

- `cec download-taxonomy` - Downloads a taxonomy from an OCE server.
- `cec upload-taxonomy` - Uploads a taxonomy to an OCE server.           
- `cec control-taxonomy` - Performs actions on taxonomy on OCE server.
- `cec create-template-report` - Now checks for orphaned components.

- Now also shows content field editor's view mode when testing on the local server.

# New in Release 20.1.2f

**Fixed**

- `cec migrate-site` - Now updates digital asset IDs to new format.

- Fixed issue with using slugs in detail page links in local testing.


# New in Release 20.1.2e

**Fixed**

- `cec transfer-site` - Will also update localization policy on the destination server. 

**Added**

- `cec list` - Now includes recommendations. 
- `cec create-template-report` - Generates an asset usage report for a template package.
- `cec create-asset-report` - Enhanced to include site content and report any unused documents.


# New in Release 20.1.2d

**Fixed**

- `cec migrate-site` - Fixed issue parsing the version number on newer versions.


# New in Release 20.1.2c

**Fixed**

- `cec migrate-site` - Now handles site templates larger than 2GB.
- Test content layouts on local server with server content.


# New in Release 20.1.2b

**Fixed**

- `cec create-asset-report` - Fixed issue where site metadata caused no results to be returned when reporting on a site.


# New in Release 20.1.2a

**Added**

- Can now use local or server based Content Items in component tests on local server

**Fixed**

- `cec transfer-site` - Now works correctly with OAuth.


# New in Release 20.1.2

**Added**

- `create-site-map` - Excludes page links not from the same domain.
- `control-content` - Added the Add action for adding content items to a channel.

**Note** 

- Node version 10 or later is now required.


# New in Release 20.1.1d

**Added**

- `cec copy-assets` - Copies assets from one repository to another.
- `cec register-server` - Now encrypts client id and secret.
- `cec register-server` - Adds support for a login timeout. 

**Fixed**

- `cec index-site` - Handles invalid html in large text fields.

# New in Release 20.1.1c

**Fixed**

`cec upload-folder` - allow upload of a theme from src/themes directory without infinite loop caused by `_scs_theme_root_` softlink.

# New in Release 20.1.1b

**Added**

- `cec add-member-to-group` - Adds users and groups to an OCE group on OCE server.
- `cec remove-member-from-group` - Removes users and groups from an OCE group on OCE server.

**Fixed**

- `cec compile-template` - correctly handles macros in markdown fields.

# New in Release 20.1.1a

**Updated**

`doc/T2p.md` - Updated to use new create-site with -u option to preserve content IDs.

# Updated to 20.1.1

**No Changes**

# New in Release 19.4.3d

**Added**

`cec create-group` - create group on the specified server - for use in share commands.  Add user to group coming very soon.
`cec delete-group` - remove a group from the specified SERVER.

`cec create-rss-feed` - supports use of formatted dates, and mustache lambda support for custom data manipulation in the template expansion.  See sample data/rss/rssFunc.js.

**Fixed**

`cec compile-template` - handle content layout macros correctly

# New in Release 19.4.3c

**Fixed**

`cec migrate-site` - fixed issues using the command on windows.

# New in Release 19.4.3b

**Added**

`cec share-component` - share a component with a user or group.
`cec unshare-component` - remove share of a component from a user or group.
`cec share-template` - share a template with a user or group.
`cec unshare-template` - remove share of a template from a user or group.
`cec share-theme` - share a theme with a user or group.
`cec unshare-theme` - remove share of a theme from a user or group.

**Fixed**

`cec download-file` - handle large number of site page files

# New in Release 19.4.3a

`cec create-site` - supports `-u` option to keep same asset GUIDS for content from the content template within the site template when creating the site.  This simplifies T2P for propagation of a site the second time.

`cec transfer-site` - can specify source and destination servers to transfer a site.  Site is created in destination using same ASSET IDs, so `cec transfer-site` can be called multiple times, and with subsequent execution the site and assets are updated, not recreated.


# New in Release 19.4.3

**Added**

`cec compile-template` - compile a site within a template for faster rendition in the browser.  See [Pre-Compile Sites](sites/doc/compiler.md).

`cec refresh-prerender-cache` - refresh the prerender cached site

`cec migrate-site` - migration utility for moving a site from Internal Compute to OCI-N.  Register Internal Compute service with `cec register-server` with `-t pod_ic`.

`cec migrate-content` - migration of a collection in internal compute to a repository and channel in OCI-N server.

`cec register-translation-connector` - register a translation connector with a service.  Requires 19.4.3.

# New in Release 19.4.1c

**Updated**

`cec upload-static-files` - renamed to `cec upload-static-site-files`.  Requires 19.4.3.

**Added**

`cec download-static-site-files` - download files from site's /static folder from OCE server.  Requires 19.4.3.
`cec delete-static-site-files` - remove static files from site's /static folder.  Requires 19.4.3.

# New in Release 19.4.1b

**Updated**

`cec create-template` - can now create a local template from a site in a CEC server.  This saves creating the template in the CEC server, and then downloading.

**Added**

`cec upload-static-site` - take a folder of static files and upload to a Site's static folder for publishing as a static site.  Requires 19.4.3.

# New in Release 19.4.1a

**Updated**

`cec share-site` - can now share with OCE Groups
`cec unshare-site` - can now un-share with OCE Groups

`cec share-repository` - can now share with OCE Groups
`cec unshare-repository` - can now un-share with OCE Groups

`cec share-type` - can now share with OCE Groups
`cec unshare-type` - can now un-share with OCE Groups

`cec share-folder` - can now share with OCE Groups
`cec unshare-folder` - can now un-share with OCE Groups

**Added**
`cec refresh-translation-job` - for use in 19.4.3 to pull updated translations from a TMS through a connector before ingesting into OCE server

# New in Release 19.4.1

**Added**

`cec list-translation-jobs` - lists jobs sent to external language service providers (feature coming in 19.4.3)
`cec create-translation-job` - can create jobs that use extenal language service providers
`cec ingest-translation-job` - can ingest a job completed by an external language service provider

**Added**

`cec sync-server` - start a service which can sync asset create, update, delete, publish, unpublish across OCE servers using webhooks.

`cec list-assets` - lists assets on a CEC server, useful for use with `create-asset-usage-report`

`cec create-asset-usage-report` - starting with one or more asset IDs, report where the assets are used and their status

**Added**

`cec install` - adds build, optimize and test improvements to the source environment created

**Updated**

`cec download-content` - can now download content template including specific assets, assets in a collection or assets found with a query

`cec create-asset-report` - now reports on broken links where a site includes references to content items, documents, web pages that don't exist

# New in Release 19.3.3a

**Fixed**
- `cec download-content` - fixed issue hitting timeout on long download
- `cec upload-template` - fixed issue hitting expired token if zip upload phase takes a long time

**Updated**
- `cec control-content` - Now shows indeterminate progress instead of percentate: 0

# New in Release 19.3.3

**Added**

- `cec register-server` - register using IDCS Application client id, secret, scope for HEADLESS cli -- I.e. no popup browser window for authentication during CLI calls.

# New in Release 19.3.2h

**Added**
- `cec set-site-security` - set site as public or secure and define type of runtime access

**Updated**
- `cec develop` - use of `--server <server>` will direct content queries to the CEC server specified.
- `Content List` - can now order by custom fields

**Fixed**
- `cec add-contentlayout-mapping` - summary.json in template which is used by SERVER on template upload. 

# New in Release 19.3.2g

**Updated**
- `cec create-site-map` - use --newlink to generate 19.3.3 style detail page links with slug.  For use when 19.3.3 is released.
- `cec create-site-map` - use --noDefaultDetailPageLink to stop the creation of detail pages for items and content lists where no specific detail page has been chosen.
- `cec create-site-map` - now checks that content types are supported on the target detail page before creating a detail page link.

- `cec create-rss-feed` - use --newlink to generate 19.3.3 style detail page links with slug.  For use when 19.3.3 is released.

**Fixed**
- `cec create-site-map` - correctly finds SEO information for pages when there are no detail pages in the site.

# New in Release 19.3.2f

**Fixed**
- `cec upload-folder` - correctly recurses folders on windows

# New in Release 19.3.2e

**Fixed**
- `cec upload-template` - can now handle very large templates
- `cec download-template` - can now handle very large templates

# New in Release 19.3.2d

**Fixed**
- `cec delete-template` - properly removes template from trash

**Added**
- `Anchor` - new sample section layout that will scroll into view if URL has matching # fragment.

**Updated**
- `cec install` - does a check for minimum required version of node
- `cec *` - no longer reports connection missing in gradle.properties

# New in Release 19.3.2c

- `cec share-site` - share site with users or groups on a CEC server
- `cec unshare-site` - un-share site access from users or groups on a CEC server

# New in Release 19.3.2b

**Added**

- `cec download-folder` - added support for theme and component download
- `cec upload-folder` - added support for theme and component upload
- `cec download-file` - added support for theme and component files

**Fixed**
- `cec create-template-from-site` - returns proper exit code

# New in Release 19.3.2a

**Fixed**
- `cec upload-template` - now correctly reports component conflicts on import.

# New in Release 19.3.2

**Updated**

- `cec upload-file` - can now upload files into themes and components

**Added**
- `cec` -  commands now return exit status for use in scripting

# New in Release 19.3.1i

**Fixed**
- `cec create-asset-report` - resolved issues identifying content items and content layouts.
- `cec create-encryption-key` - correctly outputs keyfile on windows

# New in Release 19.3.1h

**Added**
- `cec create-asset-report` - audit a site, for all site members, checking all members have access to all site resources: components, theme, content items, etc.  and that all content items are assigned to the site channel.
- `cec create-encryption-key` - for use with `cec register-server` allows RSA private key to be used to encrypt-decrypt passwords stored in server.json files.  **Note:** node version 10 or later required for this feature.

**Fixed**
- `cec develop` - runtime will serve content.min.js now

# New in Release 19.3.1g

**Added**

- `cec share-type` - can share types to users in a CEC server
- `cec unshare-type` - can remove access to types for given users in a CEC server
- `cec share-repository` - can now also share types used by repository in a CEC server

# New in Release 19.3.1.f

**Fixed**
- `cec create-site-map` - now works for sites with 1000s of pages

# New in Release 19.3.1e

**Updated**

- `cec download-folder` - can now download files from a site
- `cec upload-folder` - can now upload folders or folder contents to a site

**Added**
- `cec share-repository` - share access to a repository in the CEC server
- `cec unshare-repository` - remove user access to a repository in the CEC server

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

