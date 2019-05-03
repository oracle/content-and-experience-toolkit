# Oracle Content and Experience - Toolkit

Templates and resources for development platforms.

[sites](sites/) – Work with tools to create, test, and package your own site templates, themes, components and content layouts.

[react-starter-sites](react-starter-sites/) – A quick way to get started with React site development.
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
