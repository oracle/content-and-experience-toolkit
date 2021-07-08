# Content Management - Compilation Server Docker Image

The Compilation Server Docker Image provides a packaged build of the OCM Toolkit compilation server command: 
```
cec compilation-server
```
You can also run this command directly against your OCM Toolkit environment and you should continue to do so during the development of custom compilers. 
The Docker image is simply a convenience container for hosting your local compilation server that can be registered with your OCM instance to allow for pre-compilation of sites during the site publish step. 

To learn about site pre-compilation, see the links below:

[Site Pre-Compilation](../../doc/compiler.md) - Pre-Compile a site for faster rendition in the browser.

[Configure Sites and Assets Settings](https://docs.oracle.com/en/cloud/paas/content-cloud/administer/configure-sites-and-assets-settings.html#GUID-15DDAEC8-4900-4CE6-B916-5BCD862340AE) - Register your compilation server with your OCM instance to pre-compile sites on publish.

## Setup

* Make sure `docker` is in your `PATH`.  
* Download the OCM Toolkit - e.g. from GitHub - [link](https://github.com/oracle/content-and-experience-toolkit/archive/master.zip)

## Build 
Go to the directory in the download containing the Dockerfile 

```
cd  <download-path>/content-and-experience-toolkit/sites/docker-images/compilation-server
```
 
* Build the docker image
 
```
docker build --no-cache --tag oce-compilation:latest .
```

* List your docker images
```
docker images
REPOSITORY                                     TAG                 IMAGE ID            CREATED             SIZE
oce-compilation                                latest              8ea6f95bef59        3 seconds ago       1e+03MB
```

## Run
The compilation server will, by default use the 8087 port to expose the compilation server.  This can be altered in the run.sh file that is in the same folder as the Dockerfile and is included as part of the docker build. 

* Start your docker image with one of the following depending on how you're exposing the port from your machine

```
docker run -p 8087:8087 -d oce-compilation:latest
docker run --network host <imageId>
docker run -p 8087:8087 <imageId> 
```

For example:  
```
docker run -p 8087:8087 -d oce-compilation:latest
eea9e230c634ddbf09af1bbb42b4fcda10af4935fd64fca83c98907057ba9099
docker container ls  
CONTAINER ID        IMAGE                    COMMAND                  CREATED             STATUS              PORTS                    NAMES
eea9e230c634        oce-compilation:latest   "/bin/sh -c 'exec ${…"   3 seconds ago       Up 3 seconds        0.0.0.0:8087->8087/tcp   some_name
```


## Test 
The compilation server will be available on the following URL:
 
* [https://localhost:8087/compiler/rest/api](https://localhost:8087/compiler/rest/api)

It will return the API versions supported by the compilation server: 
```
[ "v1" ]
```

You should also confirm that the compilation server is available externally to your machine so that it can be registed with an Oracle Content Management instance. 

## Register 
To register your compilation server, you must have administration privilege on your OCM instance. 
* Go to: 
	* http<span>://</span>{oce-server}/documents/administration/sites
* Enter your compilation server "http<span>://</span>host:port" under:
	* *Compilation Endpoint URL:* https<span>://</span>{your-server}:8087
	

Once you have registered the compilation server, you can now select to *"Enable Automatic Compilation"* against a site in the site properties under *"Static Site Delivery"*

