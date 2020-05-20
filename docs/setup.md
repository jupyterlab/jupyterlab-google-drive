# Setup

The JupyterLab Google Drive extension makes authenticated requests to Google's servers,
and as such, must be configured to have the correct credentials.
In particular, the application must be registered with Google
and the origin of the API requests must be pre-specified.
By default, the `@jupyterlab/google-drive` package uses a registered web application
that is configured to accept requests from `http://localhost`, ports `8888` through `8899`.
This is probably sufficient for local usage of the extension,
but if you are accessing the application from other origins
(such as you might do using a JupyterHub deployment),
or if you are using the extension extensively,
you will likely want to set up your own credentials with Google.

### Google OAuth2 Setup instructions

1. Login to Google [Cloud Console](https://console.cloud.google.com)  
2. Click on the Project drop-down  
![header with selected project](images/1.open.projects.png)
3. Click: New Project (if you already have a project created, skip to step 6)  
![new project link](images/2.new.project.png)
4. Fill in project details and click Create  
![new project form](images/3.create.project.png)
5. Click the Project drop-down to show the list  
![header with project drop-down](images/4.open.projects.png)
6. Click the project name from the list  
![project listing](images/5.activate.project.png)
7. Open the API Library  
![navigation bar](images/6.apis.services.library.png)
8. Activate the search  
![search area](images/7.apis.library.search.png)
9. Search for `drive` and click `Google Drive API`  
![search results for drive](images/8.apis.library.search.drive.png)
10. Click the `Enable` button  
![google drive api details page](images/9.apis.library.drive.enable.png)
11. Open the API Library  
![navigation bar](images/6.apis.services.library.png)
12. Activate the search  
![search area](images/7.apis.library.search.png)
13. Search for `realtime` and click `Realtime API`  
![search results for realtime](images/12.apis.library.search.realtime.png)
14. Click the `Enable` button  
![realtime api details page](images/13.apis.library.realtime.enable.png)
15.  Open the API Library  
![navigation bar](images/6.apis.services.library.png)
16. Activate the search  
![search area](images/7.apis.library.search.png)
17. Search for `picker` and click on `Google Picker API`  
![search results for picker](images/16.apis.library.search.picker.png)
18. Click the `Enable` button  
![google picker api details page](images/17.apis.library.enable.picker.png)
19. Navigate to the `OAuth consent screen`  
![oauth consent screen navigation location](images/18.apis.services.oauth.consent.png)
20. Set the `Application Name`  
![application name section of the form](images/19.oauth.app.name.png)
21. Click the `Add scope` button  
![oauth scope section of form](images/20.auth.add.scopes.png)
22. Search `drive`, select the `../auth/drive` scope and then click `Add`  
![scope selection pop-up with scope selected](images/21.oauth.add.drive.scope.png)
23. Confirm the scope has been added  
![oauth form with new scope added](images/22.oauth.drive.scope.added.png)
24. Provide Domain and Policy links and then click Save  
![oauth form domain and policy section with xip.io for IP based pseudo-domain](images/23.oauth.domain.policy.png)
25. Click `Create credentials`  
![empty credentials list with create credentials button](images/24.create.credentials.png)
26. Click `OAuth client ID`  
![credentials type selection list](images/25.create.credentials.type.png)
27. Select the Application type of `Web application`  
![credentails application type](images/26.web.app.credentials.png)
28. Define name and restriction domains / paths  
![credential usage restrctions](images/27.web.app.restrictions.png)
29. Capture your `Client ID` and `Secret` (you will need the Client ID to configure JupyterLab)  
![oauth credential client id and secret](images/28.oauth.client.secret.png)


Once these steps have been completed, you will be able to use these credentials in the extension.
In the `jupyterlab.google-drive` settings of the settings registry, set the **clientID** field to be the client id provided by the developer console. If everything is configured properly, you should be able to use the application with your new credentials.
![Client ID](images/clientid.png)

### Seeding JupyterLab images with Google credentials

While adding credentials via the settings functionality from within JupyterLab is possible, as described above, users may also wish to pre-seed these settings so the extension works out-of-the-box on start-up.

The location of the `@jupyterlab/google-drive` plugin's settings can be found in `$SETTINGS_PATH/@jupyterlab/google-drive/drive.jupyterlab-settings`, where `$SETTINGS_PATH` can be found by entering `jupyter lab path` on your terminal from a running JupyterLab.

For instance, the docker-stacks [base-notebook](https://github.com/jupyter/docker-stacks/blob/master/base-notebook/Dockerfile) comes pre-loaded with JupyterLab and if you were to add the google-drive extension, then given that the default user in that set-up is `jovyan`, the relevant path for the settings file would therefore be:

`home/jovyan/.jupyter/lab/user-settings/@jupyterlab/google-drive/drive.jupyterlab-settings`

As such, any file containing the credentials of the form `{ "clientId": "0123456789012-abcd2efghijklmnopqr2s9t2u6v4wxyz.apps.googleusercontent.com"}` (sample only) will need to get persisted to this location ahead of time.

There are many ways to do this. A few to consider are:

(i) adding the file as part of a docker image-build process

One might include a `drive.jupyterlab-settings` file within a folder accessible to a Dockerfile used to build an image to be used to spawn JupyterLab. For example, one could extend the docker-stacks base-notebook by adding the google-drive extension and pre-seed the credentials as follows:

```
FROM jupyter/base-notebook
RUN jupyter labextension install @jupyterlab/google-drive
COPY drive.jupyterlab-settings /home/jovyan/.jupyter/lab/user-settings/@jupyterlab/google-drive/drive.jupyterlab-settings
```

(ii) injecting the credentials as part of an image-spawn process

Alternatively, if one didn't want to bake-in the credentials to an image, one could pass them into a notebook server at spawn time. Taking the [zero-to-jupyterhub-k8s](https://github.com/jupyterhub/zero-to-jupyterhub-k8s) implementation (which uses kubespawner and is therefore kubernetes-centric), for example, one could use the `config.yaml` file to:

(a) set the extraEnv to pass the clientId as an environment variable to the spawned container

```
hub
  extraEnv:
    GOOGLE_DRIVE_CLIENT_ID: "551338180476-snfu2vasacgjanovrso2j9q2j6e4capk.apps.googleusercontent.com"
```

(b) then pass that variable to the container file-system in a life-cycle hook command something like this

```
singleuser
  lifecycleHooks:
    postStart:
      exec:
        command: ["/bin/sh", "-c", "mkdir -p /home/jovyan/.jupyter/lab/user-settings/@jupyterlab/google-drive; echo '{\"clientId\":\"${GOOGLE_DRIVE_CLIENT_ID}\"}' > /home/jovyan/.jupyter/lab/user-settings/@jupyterlab/google-drive/drive.jupyterlab-settings"]
```
