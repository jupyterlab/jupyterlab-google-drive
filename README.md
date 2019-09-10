# jupyterlab-google-drive

[![Build Status](https://travis-ci.org/jupyterlab/jupyterlab-google-drive.svg?branch=master)](https://travis-ci.org/jupyterlab/jupyterlab-google-drive)

## Cloud storage for JupyterLab through Google Drive.

**NOTE: this is beta software and is rapidly changing.**

This extension adds a Google Drive filebrowser to the left sidepanel of JupyterLab.
When you are logged into your Google account, you will have the
files stored in it available to JupyterLab.

If you run into troubles, see if the [troubleshooting guide](docs/troubleshooting.md) has a solution for you.

## Prerequisites

- JupyterLab 1.0
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

- Have someone share a notebook or markdown file withyou.

- You should now see the file in the **Shared with Me** folder in the file browser.
  Open it, and begin editing!
