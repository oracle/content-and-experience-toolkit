# CEC Starter Site CLI
 
# Introduction
The Starter Site CLI is a quick way to get started with React development and it requires no build configuration. The create site command creates a generic site that is built in React and is an independently runnable application. The generated site can be run in development mode and production mode.

# Installation
Prerequisite: node.js 10.9.0 or later, and node and npm on your path.

1. `npm install -g`
> for Mac, run:
> `sudo npm install -g`
2. To re-install the CLI, uninstall first: `npm uninstall -g cecss-cli`
> for Mac, run: `sudo npm uninstall -g cecss-cli`

# CLI Commands

After installation, you can run the command  `cecss -h` to see the usage:

```
Usage: cecss <command> [options]

Run 'cecss <command> -h' to get the detailed help for the command.

Commands:
  cecss create-site <name>               Creates the Site <name> for the content from local or from CEC server.
  cecss export-server-content <channel>  Create content template based on the channel <channel>, then export and download the archive from CEC server.
  cecss list-server-content-types        List all content types from server.
  cecss list-server-channels             List all channels from server.
  cecss develop                          Start development server. Watches files, rebuilds, and hot reloads if something changes.
  cecss build                            Build a CEC starter site.
  cecss serve                            Serve previoysly build CEC starter site.

Options:
  --help, -h     Show help                                                                                                                           [boolean]
  --version, -v  Show version number                                                                                                                 [boolean]
```

# Get CEC Content

To create a site to show CEC content, you need to specify the source of the content. There are three ways to get CEC content.

1.	CEC templates

	If a CEC template contains content types and content items, you can export it from the CEC server and use the zip file to create a site.

2.	Published content from a channel

	You can use command `cecss export-server-content` to export all published content items from a channel, then use the generated zip file to create a site.

3.	The live content on a CEC server

	Example  content has been provided in `StarterBlog_export.zip`

# Set up CEC Server Connection

The following commands require CEC server configuration:

```
cecss create-site <name> -s
cecss export-server-content <channel>
cecss list-server-content-types
cecss list-server-channels
```

Create file `.cec_properties` under the user's home directory and configure the server as:

```
cec_url=<the CEC server url>
cec_username=<user name>
cec_password=<password>
cec_env=pod_ec
```

# Create Site

A site can be created as a set of self contained files which render provided content.  As above, the content can be from an exported template from CEC, exported channel contents from CEC, or live against a CEC server.

Run command  `cecss create-site -h` to see the usage:

```
Usage: cec create-site <name>
```

Creates the Site <name> for the content from local or from CEC server. By default, it creates a StarterSite. Optionally specify -f <source> to create from different source.

Options:
  --from, -f      <source> Source to create from
  --content, -c   <content> The absolute path of the local CEC template zip file
  --server, -s    flag to indicate to use the content types from server
  --navtypes, -n  <navtypes> The comma separated list of content types from server to be used as site navigation
  --types, -t     <types> The comma separated list of content types on the server, if not specified, all content types will be used
  --locales, -l   <locales> The comma separated list of locales, the first one in the list will be the default locale for the site
  --help, -h      Show help                                                                                                                                                [boolean]

Examples:

```
cecss create-site NewsSite -c StarterBlog_export.zip
cecss create-site NewsSite -f ~/Downloads/ReactSiteTemplate.zip -c ~/Downloads/NewsTemplate.zip
cecss create-site BlogSite -s -n Blog
cecss create-site BlogSite -s -n Blog -t Blog,Author
cecss create-site NewsSite -c ~/Downloads/NewsTemplate.zip -l fr-FR,it-IT,de-DE
cecss create-site BlogSite -s -n Blog -l en-US,zh-CN
```

## Create site with local content

The local content can be the zip file of an exported CEC template or the zip file of exported channel content. For each content type in the zip file, there will be a React component generated and the type will also used for site navigation.

```
cecss create-site NewsSite -c ~/Downloads/NewsTemplate.zip
```
   The site created will be placed in the folder with the same name as the site.

## Create site with CEC server content

To create a site with content types from CEC server, you need to [Set up CEC Server][] first.  At least one content type should be specified to use as site navigation.

Create site for all content types on the CEC server, specifying which types to use in the navigation:

```
cecss create-site serverSite -s -n Article
cecss create-site serverSite -s -n Article,Author
```

Create site with certain content types on the CEC server, the content types used for navigation will be included automatically

```
cecss create-site serverSite -s -n Article,Author -t Employee
```

## Create site with locales

```
cecss create-site NewsSite -c ~/Downloads/NewsTemplate.zip -l fr-FR,it-IT,de-DE
cecss create-site BlogSite -s -n Blog -l en-US,zh-CN
```
If there are more than one locales specified, a local switcher will be shown on the site.

# Build Site

Before a site can be run, dependencies need to be fetched, this can be done with `npm install`.  If a site is later edited, there is no need to run `npm install` again unless you want to add new dependencies.

After creation of the site, run:

```
cd <site name>
npm install
```

# Run Site

A site can be run in development mode or production mode.  In development mode, changes made to the site will be automatically deployed to the running server.

## Run site in development mode

Running a site in development mode starts a NodeJS server and allows changes to the site to be automatically deployed to the running server.

```
cd <site name>
cecss develop
```

This command will start a hot-reloading development environment, and the site can be viewed in a browser using the following URL:

```
http://localhost:9090/
```

If updates are made to javascript, html, css files under <site name>/src, changes will live reload in the browser.

## Run site with CEC server content 

For a site created with content types from CEC server, it’s required to set up the site to use the CEC server to get the content.  Also, a site created from a local content zip can be changed to run with content from a CEC server in the same way.

For each created site, an empty .cec_properties file is generated in the site directory:

```
# To show the content on CEC server, cec_url must be set.
# When the site is run using "cecss serve", only the published content will be displayed and cec_channel_token must be set.
# When the site is run using "cecss develop", by default the draft content will be displayed,
# if you want to show only the published content, set cec_content_status to published and also set cec_channel_token.
# If the channel is secure or to show draft content, cec_username and cec_password are required.
# If the CEC instance is a development env, set cec_env to dev_ec.
#
cec_url=
cec_username=
cec_password=
cec_env=pod_ec
cec_content=server
cec_content_status=
cec_channel_token=
```

Edit the file and set the url, channel token, and username, password if needed.

You can get the channel token from CEC server or use CLI

```
cecss list-server-channels
```

## Build and Run Site for production

First, build the site.  This optimizes the site for runtime.

```
cecss build
```

Then, run site in production mode.

Running in production mode starts an optimized server, without hot-update monitoring.

```
cd <site name>
cecss serve
```

This command will start a local node server for the site, and the site can be viewed in a browser using the following URL:

```
http://localhost:8080/
```

To run the site on a different port, use:

```
  	 cecss serve -p <port>
```

# Structure of the React JS Site Template

StarterSite.zip site template is used to create site by default. It comes with the CLI. You can find it here:

Windows:

```
	C:\Users\<userid>\AppData\Roaming\npm\node_modules\cecss-cli\data
```

Mac:

```
	/usr/local/lib/node_modules/cecss-cli/data
```

## Files in the StarterSite.zip template

This template is an example of what can be created.  You can create your own custom templates and use them to create a site using the `cecss create-site sitename -f mytemplate.zip ...`   

Files in the template:

* `index.html` is the page template
* `index.js` is the JavaScript entry point
* `Constants.js` is where constants are defined
* `app/App.js` is a React component which is the main parent component of the Simple Page App. The React router is used to decide which component to show and which to hide
* `assets/app.css` is the css used by the site
* `{{types}}/{{name}}.js` is a placeholder. React components will be generated for each content type to render content item, content list or search result of this content type based on parameters
* `common/ContentItem.js` is a React component which will render an item with passed in layout, and also be responsible for kicking off the item query.
* `common/ContentList.js` is a React component which will render content list with passed in layout, and also be responsible for kicking off the items query.
* `common/ItemMultiValues.js` is a React component which will render an item’s field with multiple values
* `common/queryItems.js` contains JavaScript APIs which create Redux actions to fetch item or items
* `common/queryReducer.js` is the reducer which save the query result into the Redux store when it receives the fetch success action. It’ll also set a loading flag to true when the fetch begins, and false when it finishes or fails.
* `common/Searchbar.js` is a React component which will render the search field, and also be responsible for kicking off the search for content items.

After a site is created, all the source code is under `<site name>/src/`
 
•	`content` is the folder which contains the CEC content 
•	`Starter_Blog_Author/Starter_Blog_Author.js` contains React components generated based on the placeholder in the site template for content type Starter_Blog_Author
•	`Starter_Blog_Post/Starter_Blog_Post.js` contains React components generated based on the placeholder in the site template for content type Starter_Blog_Post

Generated Components

For each content type, React Components are generated to render the content item, content list or search result based on the parameters. The component can be called as

`<Starter_Blog_Author />`

Supported parameters to the component are

* `id` 
* `search` 
* `limit`
* `orderBy (name:asc | name:des | updatedDate:des | updatedDate:asc)`

and they should be passed in inside the match.params object

```
{
   …
   match: {
	       params: {
	       }
   }
}
```

Example:

```
class Starter_Blog_PostDetail extends React.Component {
  render() {
    var item = this.props.item;
    if (!item) {
      return (
        <div />
      );
    }
    var authorId = item.fields['starter-blog-post_author'] ? item.fields['starter-blog-post_author']['id'] : '';
    var authorProps = {match: {params: {id: authorId}}};

    return (
      <div>
      <div className="Starter_Blog_Post">
      <span>{item.fields['starter-blog-post_title']}</span>
      <span>{item.fields[‘starter-blog-post_summary']}</span>
      <div>{renderHTML(item.fields['starter-blog-post_content'])}</div>
      <span>{item.fields['starter-blog-post_category']}</span>
      <ItemMultiValues type='image' values={item.fields['starter-blog-post_download_media']}/>
      </div>
      <hr/>
      <Starter_Blog_Author {...authorProps} />
      </div>
    );
  }
}      
```
	
# Starter Site Runtime

When a site is running in development node, there are two servers running, one is a node express server with Webpack middleware which helps with live and hot reloading. Another is a node express server which handles content query.

In the production mode, there is only one server running. All the client side code will be bundled into static files using webpack and it will be served by the node express server. 

Details:

* `.babelrc` is the Babel config. Babel is used to compile and also cover JSX to javascript.
* `package.json` contains the site’s metadata
* `server.js` the entry point to the node express server which handles content query
* webpack-server.js` the entry point to the node express server with Webpack middleware which handles live and hot reloading
* `webpack.config.js` the Webpack configuration for development mode
* `webpack.config-prd.js` the Webpack configuration for production mode

# Building a Site Template

The CLI site generator supports Mustache template in the site template.

Each js, html and css file in the site template will be processed and will inject values for the following tags

| Tag name | Description |
| --- | --- |
| `{{sitename}}`	 | the site name |
| `{{types}}` | an array of the names of all content types in the site |
| `{{navtypes}}` | an array of the names of all content types in the site used for navigation |

If the site template contains a directory `{{types}}`, the site generator will create a directory for each content type by copying this directory, and a javascript file will also created by copying from `{{name}}.js`. The following tags in the javascript file will be injected with values:

| Tag name | Description |
| --- | --- |
| `{{sitename}}` | the site name |
| `{{type}}` | the name of the content type |
| `{{fields}}` | the array of field objects |

For each field object, we support following tags

| Tag name | Description |
| --- | --- |
| `{{name}}` | the field name |
| `{{<field attribute name>}}` | all field attributes returned from CAAS API `/content/management/api/v1.1/types/<type name>` are applicable such as `id`, `description`, `datatype`, `required`, `valuecount`, etc. |
| `{{__render.single}}` | a boolean flag to indicate the field has single value |
| `{{__render.multiple}}` | a boolean flag to indicate the field has multiple values, you can use component `ItemMultiValues` to render, e,g,: `<ItemMultiValues type='direct' values={item.fields['{{name}}']}/>` |
| `{{__render.direct}}` | a boolean flag to indicate to render the item directly on the page, e.g. `<span>{item.fields['{{name}}']}</span>` |
| `{{__render.image}}` | a boolean flag to indicate the field is an image |
| `{{__render.datetime}}` | a boolean flag to indicate the field is `DateTime` type, and you can get the value as `{item.fields['{{name}}']['value']}` |
| `{{__render.richtext}}` | a boolean flag to indicate the field value is rich text html |
| `{{__render.reference}}` | a boolean flag to indicate the field is a reference to another item, you can render this field as a link pointing to the referenced item |

When create site template zip file, make sure not to include the top level folder.
