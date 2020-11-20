# Copy a Large Site using OCE Toolkit

# Setup
[Install the OCE Toolkit](../README.MD)
## Create Source in your Local File system
In a directory inside a git / SVN repository, type the following:

```
cec install
```

This will create a source tree, with a package.json, and do an `npm install` to fetch dependencies into the source tree.  Update `package.json` to include any further dependencies you may need for your resources.

## Setup connections to your OCE instances

```
cec register-server DEV -e https://your-dev-instance.com -u user -p password
cec register-server DEV2 -e https://your-dev2-instance.com -u user -p password
```

Test your connections as follows:

```
cec list --server DEV
```
# Create a copy of the site locally

Create a local template for this site without content assets

```
cec create-template site1Backup -s site1 -x -r DEV 
```

Creates scripts to download and upload content in batches

```
cec transfer-site-content site1 -s DEV -d DEV2 -r site1CopyRepo -n 200
```

Execute the script to download the content assets from DEV instance

```
./site1_downloadcontent
```
The name for a batch will be site1_content_batch_[n].

# Generate new ID for each asset item and update the references in the template

```
cec update-template rename-asset-id -t site1Backup -c site1_content_batch_0,cafe1_content_batch_1,cafe1_content_batch_2,...,cafe1_content_batch_n
```

# Create a new site on DEV instance

Create a new repository

```
cec create-repository site1CopyRepo -s DEV
```

Upload the template

```
cec upload-template site1Backup -s DEV
```

Create a new site (copy of site1)

```
cec create-site site1Copy -t site1Backup -r site1CopyRepo -l policy1 -d en-US -s DEV
```

Edit file site1_uploadcontent

```
change site channel "site1" to "site1Copy"
change destination server "DEV2" to "DEV"
```

Upload content assets
```
./site1_uploadcontent
```

The new site site1Copy has a copy of all the assets of site1 and does not have any references to the the original assets 



