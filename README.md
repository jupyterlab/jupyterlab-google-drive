# jupyterlab-google-drive 

Realtime collaboration and cloud storage for JupyterLab through Google Drive.

This adds a `Google Drive` filebrowser to the left sidepanel of JupyterLab.
When you are logged into your Google account, you will have the
files stored in it available to JupyterLab.
Notebooks and text files may be shared and edited with collaborators
in real-time, and all users will see the same changes.

For the time-being, all users running a notebook have independent kernels for
code execution, and the outputs from running cells will reflect that.

## Prerequisites

* JupyterLab 0.23.0 or later
* A Google Drive account

## Installation

To install this extension into JupyterLab (requires node 6 or later), do the following:

```bash
jupyter labextension install jupyterlab-google-drive
```

## Development

For a development install, do the following in the repository directory:

```bash
npm install
jupyter labextension link .
```

To rebuild the package and the JupyterLab app after making changes:

```bash
npm run build
jupyter lab build
```
