# Setup for CLI to use IAM App for connection instead of Headless Chrome
Content Toolkit supports connection via IAM app, which removes the need to pop up Chromium to authenticate.
The following instructions detail how the IAM app can be created and registered for use with the Content Toolkit CLI.

1. Log in to the Oracle Cloud Console.

2. In the navigation menu, click **Identity & Security**.

3. Under **Identity & Security**, click **Domains**. Select the **Compartment** you want to work in from the **List Scope** drop down.

4. Click on the domain you want to use to open its **Overview** page.

5. Copy the **Domain URL** from the **Domain information** pane. You'll use it later.

6. In the **Identity domain**, click **Applications**.

7. Click **Add application**.

8. In the **Add Application** page, choose **Confidential Application**, click **Launch workflow**.

9. In the **Add Confidential Application** page, enter a name for your application and click Next.

10. Choose **Configure this application as a client now**. 

11. Under **Authorization**, select **Resource Owner** and **JWT Assertion**.

12. Under **Token issuance policy**, choose **All** for **Authorized Resources**.

13. Choose **Add resources**, click **Add scope**

14. In **Add scope** pane, find your Oracle Content Management instance and click **>**.

15. Select the scope that has the URL with `/urn:opc:...` and then click **Add**

16. Click **Next**.

17. Click **Finish** 

18. Under **General Information**, copy **Client ID** and **Client Secret**. You'll need them when you register your server.

19. Under **Token issuance policy**, copy **Scope** URL.

20. Click **Activate**

Your IAM domain application has been created. You can now go ahead and register your server.

# Register your SERVER with the Content Toolkit CLI

You will need your:

* **OCM Instance URL**: e.g. https://ocepm-oce1234.cec.ocp.oraclecloud.com
* **Username and Password** for your OCM Instance URL
* **Domain URL**: e.g: https://idcs-1234123412341234123412341234.identity.oraclecloud.com
* **Client ID**: idididididididididididididid
* **Client Secret**: secret-secret-secret-secret-secret
* **Scope URL**:  e.g: https://SCOPESCOPESCOPESCOPE.cec.ocp.oraclecloud.com:443/urn:opc:cec:all

```
$ cd your-cec-directory
$
$ cec register-server NAME --endpoint https://ocepm-oce1234.cec.ocp.oraclecloud.com -u username -p 'password' --domainurl https://idcs-1234123412341234123412341234.identity.oraclecloud.com --clientid idididididididididididididid --clientsecret secret-secret-secret-secret-secret --scope https://SCOPESCOPESCOPESCOPE.cec.ocp.oraclecloud.com:443/urn:opc:cec:all
```

Test your connection

```
$ cec list --server NAME
``` 
