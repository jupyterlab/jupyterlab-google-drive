# jupyterlab-google-drive

[![Build Status](https://travis-ci.org/jupyterlab/jupyterlab-google-drive.svg?branch=master)](https://travis-ci.org/jupyterlab/jupyterlab-google-drive)

## Cloud storage for JupyterLab through Google Drive.

**_As of November 28th, 2017, Google has [deprecated](https://developers.google.com/google-apps/realtime/deprecation) their Realtime API.
Existing realtime applications (such as those you may have set up according to [these](docs/setup.md) instructions) will still work until December 2018, but new applications will not be able to use the Realtime API.
See the discussions [here](https://github.com/jupyterlab/jupyterlab-google-drive/issues/108) and [here](docs/setup.md#Realtime-API) for more information._**

**NOTE: this is beta software and is rapidly changing.**
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

If you run into troubles, see if the [troubleshooting guide](docs/troubleshooting.md) has a solution for you.

## Prerequisites

- JupyterLab 0.33
- A Google Drive account

## Setting up credentials with Google

To run this extension you need to authenticate your JupyterLab deployment
(whether institutional or individual) with Google.
In order to identify yourself to Google, you will need to register a web application
with their Developers Console.
Detailed instructions for setting up your application credentials can be found in
[setup.md](docs/setup.md).

## Installation

To install this extension into JupyterLab (requires node 6 or later), do the following:

```bash
jupyter labextension install @jupyterlab/google-drive
```

## Development

For a development install, do the following in the repository directory:

```bash
jlpm install
jlpm run build
jupyter labextension install .
```

You can then run JupyterLab in watch mode to automatically pick up changes to `@jupyterlab/google-drive`.
Open a terminal in the `@jupyterlab/google-drive` repository directory and enter

```bash
jlpm run watch
```

Then launch JupyterLab using

```bash
jupyter lab --watch
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

- Set up your application credentials according to [this](docs/setup.md) guide.

- Start JupyterLab

  ```
  jupyter lab
  ```

- Click on Google Drive tab (on left side) in JupyterLab interface and login to
  your Google Drive account.

- Have someone share a notebook or markdown file with you.

- You should now see the file in the **Shared with Me** folder in the file browser.
  Open it, and begin editing!
