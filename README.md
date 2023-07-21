# Oracle Content Management Toolkit

Templates and resources for development platforms.

[sites](sites/) – Work with tools to create, test, and package your own site templates, themes, components and content layouts.

[Pre-Compile Sites](sites/doc/compiler.md) - Pre-compile site pages into HTML for faster rendition in the browser

[Test to Production](sites/doc/T2P.md) – Use the Content Toolkit for Test to Production

[Build Test](sites/doc/Build-Test.md) - Build, optimize and test updates for OCM source

[Asset Sync](sites/doc/AssetSync.md) - Synchronize asset create, update, delete, publish across OCM servers

[react-starter-sites](react-starter-sites/) – A quick way to get started with React site development.


# New in Release 23.7.2

**Added**
- `cec describe-category` - Lists the properties of a taxonomy's category on OCM server

**Updated**
- `cec set-site-security` - Now supports groups when setting access to a site
- `cec describe-taxonomy` - Now includes custom property types
- `cec describe-site` - Now includes the number of items from other repositories

**Fixed**
- `cec transfer-category-property` - Now handles custom property type display name changed after creation on the source server


# New in Release 23.7.1

**Added**
- `cec transfer-category-property` - Transfers category properties of a taxonomy from one OCM server to another

**Updated**
- `cec control-site` - Now supports publishing of detail page assets
- `cec create-template` - Now has option to exclude content types


# New in Release 23.6.2

**Updated**
- `cec transfer-site-page` - Now supports cross site transfers
- `cec control-site` - Now supports publishing of specific site pages only

**Fixed**
- `cec create-site-map` - Now correctly handles very large numbers of items


# New in Release 23.6.1

**Added**
- `cec share-taxonomy` - Share taxonomy with users and groups on an OCM server and assign a role
- `cec unshare-taxonomy` - Delete user or group access to a taxonomy on an OCM server

**Updated**
- `cec register-server` - Now has option to get and store the OAuth token in server JSON file, user name and password will not be stored
- `cec control-site` - Now has option to selectively publish site auxiliary files


# New in Release 23.5.2

**Added**
- `cec list-asset-ids` - lists asset Ids
- `cec control-content` - now supports `submit-for-review|approve|reject` to submit assets to workflow
- `cec retry-import-job` - to retry an import job

**Updated**
- `cec describe-theme` - now also lists all of the theme layouts
- `cec describe-site` - now lists the theme layouts usage


# New in Release 23.5.1

**Added**
- `cec create-site-page` - Creates a new page for a site on an OCM server
- `cec describe-site-page` - Lists the properties of a site page on an OCM server

**Updated**
- `cec validate-site` and `cec validate-assets` - Added option to save results to a JSON file


# New in Release 23.4.2

**Added**
- `cec transfer-editorial-role` - Transfer editorial roles from one OCM server to another
- `cec export-site` - Exports an Enterprise Site
- `cec cancel-export-job` - Cancels a site export job
- `cec delete-export-job` - Deletes a site export job
- `cec list-export-jobs` - Lists site export jobs
- `cec describe-export-job` - Lists the properties of a site export job
- `cec import-site` - Imports an Enterprise Site
- `cec cancel-import-job` - Cancels a site import job
- `cec delete-import-job` - Deletes a site import job
- `cec list-import-jobs` - Lists site import jobs
- `cec describe-import-job` - Lists the properties of a site import job
- `cec unblock-import-job` - Unblocks a site import job

**Updated**
- `cec create-component` - Now supports creating React and Preact local components


# New in Release 23.4.1

**Added**
- `cec list-activities` - Can now list repository and channel activities on an OCM server

**Updated**
- `cec list-server-content-types` - Now has option to validate if custom field editors are properly set
- `cec list` - Now also shows the total number of items in a site
- `cec compile-template` - Added `--useFallbackLocale` option to allow the compile to use this locale’s page files if the requested page translation file does not exist.  If no value given, it will use the sites default locale pages as the fallback.


# New in Release 23.3.3

**Added**
- `cec restore-trash` - restores the content in Trash on an OCM server

**Updated**
- `cec transfer-site-page` - supports transfer of new pages from source server to target server
- `cec create-site-map` - add format xml-variants to include all of the language and region variants for each URL
- `cec upload-folder` - allow upload folder to a shared folder
- `cec upload-file` - allow upload file to a shared folder


# New in Release 23.3.2

**Added**
- `cec list-activities` - Lists activities on an OCM server
- `cec list-trash` - Lists content in Trash on an OCM server including documents, sites, components, templates and themes
- `cec empty-trash` - Deletes content in specified area of Trash on an OCM server
- `cec delete-trash` - Deletes a resource from Trash permanently on an OCM server
- `cec config-properties` - Set configuration properties for an OCM server in cec.properties file


# New in Release 23.3.1

**Added**
- `cec transfer-site-page` - Transfer changes of site pages from source server to target server

**Updated**
- `cec create-site-map` - Now supports content lists with categories
- `cec list-assets` - Now reports non-master translatable items in draft state
- `cec sync-server` - Added option to specify the number of days to keep processed events when starting the server


# New in Release 23.2.2

**Updated**
- `cec create-site-map` - Added option to exclude languages
- `cec control-content` - Added option to read asset IDs from a file and option to publish assets in batches
- `cec list-asset` - Added option to configure output info
- `cec transfer-site` - Support transfer static files for standard sites
- `cec update-template` - Add action to specify taxonomy requirement

**Fixed**
- `cec index-site` - Now handles update existing search items correctly


# New in Release 23.2.1

**Updated**

- `editorial-permission` and `editorial-role` now support `createSite` permission in a category
- `cec share-repository` - now supports editorial role
- `cec update-taxonomy` - can now enable a taxonomy for Site Security management
- `cec create-site` - now supports creation of a site that uses Site Security Taxonomy
- local server now supports locale fallbacks and aliases in URL when running a template


# New in Release 23.1.2

**Updated**

- `cec create-asset-report` - add option `--pages` to allow users to only validate a few pages in the site
- `cec update-site` - add option `--compilationjob` to update site compilation job
- update local server to allow locale to be included in the URL when running a template

**Fixed**

- `cec create-site-map` - exclude fallback languages when specific languages are provided
- `cec transfer-site` - correctly check site prefix before starting transfer


# New in Release 23.1.1

**Updated**

- `cec describe-component` - now lists sites/types the component is used in

**Fixed**

- local server now uses the channel token from the siteinfo.json when testing a template


# New in Release 22.12.2

**Added**

- `cec refresh-oauth-token` - refreshes the OAuth token in the registered OCM server

**Updated**

- `cec control-repository` -  new options: `enable-not-ready | disable-not-ready` to update the control property which defines whether required fields with defaults or missing values can be created in the repository
- `cec list-assets` - validation option now also validates digital asset media files

**Fixed**

- `cec describe-txonomy` - disambiguate between two taxonomies with the same name 


# New in Release 22.12.1

**Updated**

- `cec create-site-map` - added option to include default locale in urls
- `cec create-site-map` - added option to uses '/' for the root page path instead of any pageUrl value
- `cec describe-site` - now also displays components/assets/types used on site pages
- `cec describe-background-job` - add option to wait for job to finish if it is in process


# New in Release 22.11.2

**Added**

- `cec describe-type` - lists the properties of an asset type on an OCM server

**Updated**

- `cec create-site-map` - added option to create multiple sitemaps, one for each locale
- `cec describe-asset` - now includes category info
- `cec execute-post/execute-put/execute-delete` - now all support `/system` REST APIs
- local server now has option to use local template resources for component requests

**Fixed**

- `cec create-site-map` - will now correctly handle fallback languages and locale aliases if defined



# New in Release 22.11.1

**Added**

- `cec sync-server` - support DIGITALASSET_TRANSLATIONADDED event

**Updated**

- local server can now use cached OAuth token and selected OCM channel token for asset requests



# New in Release 22.10.1

**Added**

- `cec describe-file` - lists the properties of a file on an OCM server

**Updated**

- `cec upload-content` - add option to publish content after import
- `cec download-file` - add option to download a particular version
- `cec upload-static-site-files` - add option to upload zipped files and option to save static files locally


# New in Release 22.9.3

**Added**

- `cec download-localization-policy` - downloads localization policies from an OCM server
- `cec upload-localization-policy` - uploads localization policies to an OCM server

**Updated**

- `cec create-site-map` - now supports plain text formatted sitemap
- `cec control-content` - add action `set-translated` to set non-master translatable items as translated

**Fixed**

- local server now uses correct channel token when testing components with server content



# New in Release 22.9.2

**Added**

- `cec list-publishing-jobs` - Lists out all of the publishing jobs on an OCM server
- `cec download-job-log` - Downloads the publishing job log from an OCM server

**Updated*

- All commands will now echo the full command to the output


# New in Release 22.9.1

**Updated**

- `cec download-content` - Added option to download only approved assets
- `cec control-site` - Added option to delete static files when publishing a site
- `cec sync-server` - Can now handle auth token expiration


# New in Release 22.8.2

**Added**

- `cec describe-asset` - Lists the properties of an asset on an OCM server

**Updated**

- `cec upload-file` - Added option to create target folder on an OCM server if it does not exist already
- `cec update-site` - Now updates all applicable site properties

- `compile_site.sh` - Now supports uploading compiled files in a single zip file


# New in Release 22.8.1

**Added**

- `cec validate-assets` - Validates assets on an OCM server before publish
- `cec list-scheduled-jobs` - List scheduled publish jobs on an OCM server
- `cec describe-scheduled-job` - Lists the properties of a scheduled publish job on an OCM server

**Updated**

- `cec create-component` - Add OOTB component RSSTemplate
- `cec create-site-map` - Add option `querystrings`
- `cec sync-server` - Support event CONTENTITEM_TRANSLATIONADDED


# New in Release 22.7.2

**Added**

- `cec describe-background-job` - lists the properties of a background job on an OCM server

**Updated**

- `cec transfer-site` - added option to transfer the published version of site, theme and components
- `cec control-site` - can now set site expiration date


# New in Release 22.7.1

**Updated**

- `cec create-template` - Added option to create template with published version of site, theme and components
- `cec download-component` - Added option to export the published version of component
- `cec list` - Now includes unfinished site, template, theme and component background jobs


# New in Release 22.6.2

**Added**

- `cec delete-assets` - Can delete assets from an OCM server

**Updated**

- `cec control-site` - Add option to only compile and publish the static files without publishing the site
- `cec create-component` - Can now also create a translation job editor component
- `local server` now supports testing of translation job editor components
- `compilation server` now supports using `compile_site.sh` custom site compilation script

**Fixed**

- `cec upload-component` - now handles multiple components without ever skipping any



# New in Release 22.6.1

**Added**

- `cec describe-site` - List all of the properties of a site on an OCM server

**Updated**

- `cec control-site` - Added action to set site metadata

**Fixed**

- `cec create-site-map` - Now handles large number of file versions and large number of site translations



# New in Release 22.5.2

**Updated**

- `cec control-site` - Added option to change site's theme on OCM server
- `cec upload-template` - Added option to exclude theme
- `cec create-site` - Added option to suppress site governance controls for SitesAdmin users
- `cec transfer-site` - Now also updates the theme if the site's theme has changed


# New in Release 22.5.1

**Updated**

- `cec set-logger-level` - Added `debug` option
- `cec create-site-map` - Supports Sites with over 10k pages

**Fixed**

- `cec download-content` - Now correctly handles published assets that are in draft state


# New in Release 22.4.3

**Added**

- `cec set-logger-level` - Sets the logger level for commands

**Updated**

- `cec register-server` - Now supports Oracle Cloud Infrastructure Identity and Access Management (IAM) Domains


# New in Release 22.4.2

**Updated**

- `cec create-template` - added options to exclude components and specific folders from site or theme 

 
# New in Release 22.4.1

**Updated**

- `cec create-site-map` - Now supports creating entries for assets of content types that are placed on site detail pages


# New in Release 22.3.2

**Added**

- `cec list-editorial-roles` - Lists the Editorial Roles on an OCM server
- `cec create-editorial-role` - Creates an Editorial Role on an OCM server
- `cec set-editorial-role` - Sets Editorial Permissions for an Editorial Role
- `cec delete-editorial-role` - Deletes an Editorial Role on an OCM server

**Fixed**

- `cec control-content publish` -  Can now publish same items to multiple channels


# New in Release 22.3.1

**Added**

- `cec describe-workflow` - Lists the properties of a content workflow on an OCM server

**Updated**

- `cec list` - Now includes workflows and ranking policies
- `cec list-assets` - Added parameter `--rankby` to sort query result by ranking policy


# New in Release 22.2.2

**Added**

- `cec execute-put` - Make an HTTP PUT request to a REST API endpoint on an OCM server
- `cec execute-patch` - Make an HTTP PATCH request to a REST API endpoint on an OCM server

**Updated**

- `cec set-oauth-token` - Can now save the OAUTH token to the cec.properties file
- `cec transfer-site` - Now supports param `--excludetheme` when transfering a standard site

- Updated local server to remember the selected component type and selected template



# New in Release 22.2.1

**Added**

- `cec describe-component` - List the properties of a component on an OCM server
- `cec describe-repository` - List the properties of a repository on an OCM server
- `cec describe-channel` - List the properties of a channel on an OCM server
- `cec describe-taxonomy` - List the properties and categories of a taxonomy on an OCM server
- `cec describe-template` - List the properties of a template on an OCM server

**Updated**

- `cec share-type` - Removed Contributor role as no longer supported on content types
- `cec share-repository` - Removed Contributor role for content types as no longer supported 



# New in Release 22.1.2b

**Fixed**

- Updated version of `node-fetch` to address known issue


# New in Release 22.1.2a

**Fixed**

- Updated version of `marked` to address known issue


# New in Release 22.1.2

**Added**

- `cec execute-delete` - Makes an HTTP DELETE request to a REST API endpoint on an OCM server
- `cec copy-type` - Copies an existing content type on an OCM server
- `cec copy-theme` - Copies an existing theme on an OCM server
- `cec copy-folder` - Copies an existing folder on an OCM server
- `cec copy-file` - Copies an existing file on an OCM server

**Updated**

- `cec copy-component` - Copies an existing local component or component on an OCM server
- `cec copy-template` - Copies an existing local template or template on an OCM server
- `cec transfer-site` - Now preserves the site id when transfering the site to the target server the first time


# New in Release 22.1.1

**Added**

- `cec create-digital-asset` - Added support for creating digital assets from Documents


# New in Release 21.12.2

**Added**

- `cec transfer-site` - Added option `--referencedassets` to transfer only the assets referenced on site's pages
- `cec create-template` - Added option `--referencedassets` to include only the assets referenced on site's pages
- `cec create-template` - Added option `--publishedassets` to include only the published assets


# New in Release 21.12.1

**Added**

- `cec compile-template` - Added support for JavaScript modules when compiling pages and components


# New in Release 21.11.2

**Added**

- `cec create-digital-asset` - Added options `--language` and `--nontranslatable`
- `cec update-digital-asset` - Added option `--language` to change the asset’s language
- `cec download-type` - Added option `--excludecomponents` to not download the content field editors, content forms and content layouts
- `cec upload-type` - Added option `--excludecomponents` to not upload the content field editors, content forms and content layouts


# New in Release 21.11.1

**Updated**

- Now requires Node.js version 14+

- `cec upload-component` - Performance and reliability improvements


# New in Release 21.10.2a

**Fixed**
- Removed dependency on specific server version


# New in Release 21.10.2

**NOTE**
 - This version requires a 21.10.2 server so please do not update if your OCM server is not version 21.10.2

**Added**
- `cec control-repository` - Added `add-translation-connector` and `remove-translation-connector`
- `cec execute-post` - Makes an HTTP POST request to a REST API endpoint on the OCM server


# New in Release 21.10.1

**Added**

- `cec describe-theme` - Shows theme properties including components used in theme and list of Sites using the theme

**Fixed**

- `cec list-folder` - Can now handle large size of sub folders and files (10000+)
- `cec transfer-site` - Now handles an issue where a theme conflict was previously reported


# New in Release 21.9.1

**Added**

- `cec control-recommendation` with `publish` or `unpublish`
- `cec upload-content` - Added parameter `--reuse` to update only the existing content that is older than the content being imported
- `cec transfer-content` - Added parameter `--reuse` to update only the existing content that is older than the content being imported
- `cec transfer-site-content` - Added parameter `--reuse` to update only the existing content that is older than the content being imported
- `cec create-site` - Added parameter `--reuse` to keep the existing id for assets and only update the assets that are older than those from the template
- `cec transfer-site` - Added parameter `--reuse` to update only the existing content that is older than the content being transferred
- `cec upload-type` - Now accepts a path to a json file containing a type definition
- `cec create-site` - Now supports working with governance enabled


# New in Release 21.8.1

**Added**

- `cec delete-site` - Deletes a Site from an OCM server
- `cec control-recommendation` with `add-channel` or `remove-channel` - Adds or removes a Channel from a Recommendation
- `cec create-collection` - Allows creation of a new Collection on an OCM server
- `cec control-collection` with `add-channel` or `remove-channel` - Adds or removes a Channel from a Collection
- `cec control-repository` with `add-language` or `remove-language` - Adds or removes a language from a Repository

- Updated the local server to support basic DynamicLists queries

**Fixed**
- `cec compile-template` - Fixed a high memory usage isse


# New in Release 21.7.1

**Added**

- `cec set-editorial-permission` - Grants repository members Editorial Permissions on assets
- `cec list-editorial-permission` - Lists repository members Editorial Permissions on assets
- `cec create-translation-job` - Creates a translation job for assets on an OCM server
- `cec ingest-translation-job` - Ingests a translation job for assets on an OCM server
- `cec upload-translation-job` - Uploads a translation job for assets to an OCM server

- Updated the Starter-Blog-Post-Form in the BlogTemplate to support a sidebar in the content editor on an OCM server


# New in Release 21.6.1a

**Fixed**

- Fixed a site compilation issue with rendering of Content Lists
 

# New in Release 21.6.1

**Added**

- `cec create-digital-asset` - Creates new digital assets on an OCM server
- `cec update-digital-asset` - Uploads a new version or updates attributes for a digital asset on an OCM server
- `cec upload-compiled-content` - Uploads compiled content items to an OCM server

**Updated**

- `cec control-content` - Now supports a query parameter
- `cec transfer-site-content` - No longer has a limit of 10k assets

- Local server now supports `GET` on `/sites/management/api` and `/system/api/v1`
- Starter-Blog-Post-Form in BlogTemplate supports create and edit referenced asset from the form


# New in Release 21.5.1

**Added**

- Add support for local components that render using a template
- Add support for svg graphics

- `cec transfer-content` and `cec transfer-site-content` - Now support much larger batch sizes


# New in Release 21.2.2a

**Fixed**

- Updated `underscore` to 1.13.1 to resolve vulnerability


# New in Release 21.2.2

**Added**

- `cec create-repository` - Can now create Business Asset Repositories

- Updated BlogTemplate with custom CDT samples
- Updated local server to support content form in Create new item mode


# New in Release 21.2.1a

**Added**

- `cec transfer-content` - Transfers content from one OCE server to another and supports large numbers of items (10000+)
- `cec execute-get` - Make an HTTP GET request to a REST API endpoint on an OCE server
- `cec webhook-server` - Starts up a server that listens for webhook events from an OCE server

**Fixed**

- Can now use the word `help` as a resource name such as a site, repository or channel name
- Updated version of xmldom library


# New in Release 21.2.1

**Added**

- `cec transfer-content` - Transfers content from one OCE server to another and supports large numbers of items (10000+)
- `cec execute-get` - Make an HTTP GET request to a REST API endpoint on an OCE server
- `cec webhook-server` - Starts up a server that listens for webhook events from an OCE server

**Fixed**

- Can now use the word `help` as a resource name such as a site, repository or channel name


# New in Release 21.1.3

**Added**

- `cec upload-component` - Enhanced to support uploading large numbers of components
- `cec control-component` - Enhanced to support publishing large numbers of components
- `cec list` - Enhanced to list large numbers of sites, templates or components (250+)

**Fixed**
- `cec transfer-site` - Now only transfer published assets with `--publishedassets`, `-p`
- `cec transfer-site` - Corrected alias for `--suppressgovernance`


# New in Release 21.1.2a

**Added**

- `cec copy-site` - New command to copy a site on an OCE server
- `cec transfer-site` - Supports transferring assets from multiple repositories
- `cec create-template` - Supports sites with assets from multiple repositories
- local server now supports rendering a content form with a content item


# New in Release 21.1.2

**Added**

- The local server now supports Expand/Collapse of Settings pane for components

- `cec transfer-site` - Added option `--sitePrefix`
- `cec transfer-site` - Added option `--suppressgovernance`


# New in Release 21.1.1a

**Fixed**

- Fixed local server error with missing Promise polyfill


# New in Release 21.1.1

**Added**

- `cec create-content-layout` - Added support for content types with references to CDT types
- `cec transfer-site` - Updated `--excludetheme` option to not download theme files
- Updated local server to support CDT types
- Updated template BlogTemplate with content form Starter-Blog-Post-Form


# New in Release 20.4.3b

**Added**

- `cec update-type add-content-form` - Associate a content form with a content type.
- `cec update-type remove-content-form` - Remove association of content form with content type.

**Fixed**

- `cec transfer-site` - Fixed file permission errors on Windows.


# New in Release 20.4.3a

**Added**

- `cec transfer-site` - can be used with option `--excludetheme` to support transferring sites in parallel.

- The local server now has a List view option for components and templates.


# New in Release 20.4.3

**Added**

- `cec transfer-site` - Added option `--excludetheme`.

**Fixed**

- `cec create-template` - A newly created template will NOT be a starter template.
- `cec rename-content-type` - Now correctly handles content types listed in the content layout mapping section.


# New in Release 20.4.2a

**Added**

- `cec update-template rename-asset-id` - Replaces the IDs for all assets in the template.
- `cec add-contentlayout-mapping` - Adds a content layout mapping for a content type on the OCE server.
- `cec remove-contentlayout-mapping` - Removes a content layout mapping from a content type on the OCE server.

**Fixed**

- `cec transfer-site` - Correctly sets the app type for local components.


# New in Release 20.4.2

**Added**

- `cec download-type` - Downloads content types from the OCE server.
- `cec upload-type` - Uploads content types to the OCE server.

- `cec download-recommendation` - Downloads a recommendation from the OCE server.
- `cec upload-recommendation` - Uploads a recommendation to the OCE server.

- `cec get-site-security` - Gets the security settings for a site on the OCE server.

- `cec control-content` - Now supports list of assets for publish and add to channel or collection.

- `cec download-content` - `channel` is no longer a required parameter so can download all assets from a repository.

**Fixed**

- Local server now supports rendering content layout custom data.


# New in Release 20.4.1

**Added**

- `cec share-channel` - Shares channel with users and groups on OCE server and assigns a role.
- `cec unshare-channel` - Deletes user or group access to a channel on OCE server.

- `cec control-repository add-taxonomy` - Adds a taxonomy to a repository.
- `cec control-repository remove-taxonomy` - Removes a taxonomy from a repository.

- `cec control-repository` - Now supports a list of repositories.
- `cec upload-template` - Now allows excluding components from the template.
- `cec download-template` - Now uses a background job.


# New in Release 20.3.3

**Added**

- `cec create-component` - now supports custom Content Forms.

Example:
`cec create-component contentform1 -f ContentForm`


# New in Release 20.3.2a

**Added**

- `cec transfer-site` - Added option `--excludecomponents` to allow transferring the site without any of its associated components.


# New in Release 20.3.2

**Added**

- `cec download-folder` - Will now retry the download for any files that failed.

- `cec upload-folder` - Will now retry the upload for any files that failed.

- `cec upload-template` - Added option to also publish theme and components.

- `cec control-site` - Added option to do a full publish.

**Fixed**

- `cec upload-folder` - Now supports running on different drive names on windows.


# New in Release 20.3.1a

**Added**

- `cec sync-server` - Now supports Content Item Approved event and Digital Asset Approved event.

- `cec transfer-site` - Can now transfer standard sites.


# New in Release 20.3.1

**Added**

- `cec create-asset-report` and `cec create-template-report` - Report unclosed HTML tags on site pages, html layout files and the render.js file of components.

- `cec create-contentlayout` - Add support for adding custom settings when creating conent layout, and test on local server.

- `cec create-template` and `cec create-template-from-site` - Add option `-enterprisetemplate` to create enterprise template from standard site.


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

