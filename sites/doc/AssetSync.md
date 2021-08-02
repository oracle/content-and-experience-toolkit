# Setup for Asset Synchronization (T2P) using Content Toolkit
Content Toolkit support synchronizing Asset: create, update, delete, publish, unpublish within Repositories, between SOURCE and DESTINATION OCM servers in the same or different Region.

![](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/images/AS-ov.png?raw=true)

# Setup
[Install the Content Toolkit](../README.MD)
## Create Source in your Local File system
In a directory inside a git / SVN repository, type the following:

```
cec install
```

This will create a source tree, with a package.json, and do an `npm install` to fetch dependencies into the source tree.  Update `package.json` to include any further dependencies you may need for your resources.

## Setup connections to your Source and Target OCM instances
It could be for example, SOURCE and DEST.

```
cec register-server SOURCE -e https://your-source-instance.com -u user -p password
cec register-server DEST -e https://your-destination-instance.com -u user -p password
```

Test your connections as follows:

```
cec list --server SOURCE
cec list --server DEST
```
# Create Repositories and Channels in both SOURCE and DEST servers

In SOURCE instance, create a channel - e.g. channel1, and create a repository, e.g. repository1, and assign channel1 to repository1.
Do the same thing in the DEST instance.  The names of the repository and channel must match that of the SOURCE instance.

Note: you can use the Content Toolkit to create the repositories and channels, however the Web UI must be used to associate the channel to the repository on both SOURCE and DEST instances.

```
cec create-repository repository1 --server SOURCE
cec create-repository repository1 --server DEST
cec create-channel channel1 --server SOURCE
cec create-channel channel1 --server DEST

-- ADD channels to repository in SOURCE and DEST using the Web UI.
```

# Start the Asset Sync server
To start the sync server using basic auth.  The username and password you provide here will be needed when creating the Webhooks.

```
cec sync-server -s UAT -d DEV -u admin -w welcome1
```

The sync server will start, and listen on port 8086.  You can change the port with the -p option.

Test the server is running - find out your IP address or public hostname for your VM where the sync server is running, and type something like this:

```
curl http://10.159.158.82:8086
--> response:
CEC toolkit sync service
```

## Using HTTPS
If you have a key and cert, you can start your asset sync service on https as follows.  Note, self signed certificates are not supported.:

```
cec sync-server -s SOURCE -d DEST -k ~/keys/key.pem -c ~/keys/cert.pem
```

## Fail-over
You might like to start your sync service in a loop so that it will automatically start again if it fails for some reason.
Note, on restart, any unprocessed sync events will be retried.

```
while true; do cec sync-server -s SOURCE -d DEST -u admin -w welcome1; done
```

# Create Webhooks on the SOURCE Server
Now the Asset Sync client is up and running, we can set up the web hooks on the SOURCE server to start delivering webhook events.

An *Asset Lifecycle Webhook* is needed per repository you wish to sync.  This webhook will deliver events for asset create, update, delete.

An *Asset Publishing Webhook* is needed per repository you wish to sync.  This webhook will deliver events for asset publish, unpublish. 

## Create an Asset Lifecycle web hook
On the SOURCE server, go to Integrations / Webhooks and click Create, and then click Asset Lifecycle Webhook

![](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/images/AS-cw1.png?raw=true)

Name: Asset Lifecycle Webhook for Repository1
Repository: Pick the repository created above that you want to have sync: E.g: repository1
Events: select the following: Content Item Created, Content Item Updated, Content Item Deleted, Digital Asset Created, Digital Asset Updated, Digital Asset Deleted
Payload: Brief
Target URL: E.g, the URL tested above for your sync server:  http://10.159.158.82:8086
Authentication: Basic, click Details button and enter the username and password you used in the `cec asset-sync` command - e.g. admin, welcome1.

Click Save.

## Create an Asset Publishing Webhook
On the SOURCE server, go to Integrations / Webhooks and click Create, and then click Asset Publishing Webhook

![](https://github.com/oracle/content-and-experience-toolkit/blob/master/sites/doc/images/AS-cw2.png?raw=true)

Name: Asset Publishing Webhook for Repository1
Repository: Pick the repository created above that you want to have sync: E.g: repository1
Events: select the following: Channel Asset Published, Channel Asset Unpublished
Payload: Brief
Target URL: E.g, the URL tested above for your sync server:  http://10.159.158.82:8086
Authentication: Basic, click Details button and enter the username and password you used in the `cec asset-sync` command - e.g. admin, welcome1.

Click Save.

# Asset Sync is now setup
When assets are created, updated, deleted, published, unpublished in repository1 in the SOURCE server, they will be synced to the DEST server.

Note: as above, your Repository and Channels must be pre-created on both the SOURCE and DEST servers.

