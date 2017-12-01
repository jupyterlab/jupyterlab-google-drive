# jupyterlab-google-drive

[![Build Status](https://travis-ci.org/jupyterlab/jupyterlab-google-drive.svg?branch=master)](https://travis-ci.org/jupyterlab/jupyterlab-google-drive)

## Realtime collaboration and cloud storage for JupyterLab through Google Drive.

***As of November 28th, 2017, Google has [deprecated](https://developers.google.com/google-apps/realtime/deprecation) their Realtime API.
Existing realtime applications (such as those you may have set up according to [these](docs/advanced.md) instructions) will still work until December 2018, but new applications will not be able to use the Realtime API.
See the discussions [here](https://github.com/jupyterlab/jupyterlab-google-drive/issues/108) and [here](docs/advanced.md#Realtime-API) for more information.***

**NOTE: this is alpha software and is rapidly changing.**
**Files stored on Google Drive using this plugin should still be backed-up elsewhere.**

This extension adds a Google Drive filebrowser to the left sidepanel of JupyterLab.
When you are logged into your Google account, you will have the
files stored in it available to JupyterLab.
Notebooks and text files may be shared and edited with collaborators
in real-time, and all users will see the same changes.

To see the extension in action, click on our live demo from PyData Seattle:

[![PyData Seattle Talk](http://img.youtube.com/vi/dSjvK-Z3o3U/0.jpg)](https://youtu.be/dSjvK-Z3o3U?t=13m17s)

For the time-being, all users running a notebook have independent kernels for
code execution, and the outputs from running cells will reflect that.

Google's servers expect traffic from computers using `http://localhost` on ports`8888` through `8899`,
and other origins will be rejected, so drive integration will not work.
See [advanced.md](docs/advanced.md) for instructions on how to set up your own credentials with Google's servers.

If you run into troubles, see if the [troubleshooting guide](docs/troubleshooting.md) has a solution for you.

## Prerequisites

* JupyterLab 0.29
* A Google Drive account

## Installation

To install this extension into JupyterLab (requires node 5 or later), do the following:

```bash
jupyter labextension install @jupyterlab/google-drive
```

## Development

For a development install, do the following in the repository directory:

```bash
jlpm install
jlpm run build
jupyter labextension link .
```

You can then run JupyterLab in developer mode to automatically pick up changes to `@jupyterlab/google-drive`.
Open a terminal in the `@jupyterlab/google-drive` repository directory and enter
```bash
jlpm run watch
```
Then launch JupyterLab using
```bash
jupyter lab --dev-mode
```
This will automatically recompile `@jupyterlab/google-drive` upon changes,
and JupyterLab will rebuild itself. You should then be able to refresh the
page and see your changes.

## Getting Started from Scratch

- Install JupyterLab

   ```
   pip install jupyterlab
   ```

- Install the jupyterlab-google-drive extension

   ```
   jupyter labextension install @jupyterlab/google-drive
   ```

- Start JupyterLab

   ```
   jupyter lab
   ```

- Click on Google Drive tab (on left side) in JupyterLab interface and login to
  your Google Drive account.

- Have someone share a notebook or markdown file with you.

- You should now see the file in the **Shared with Me** folder in the file browser.
  Open it, and begin editing!
