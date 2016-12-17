# jupyterlab_google_drive 

Realtime collaboration for JupyterLab through Google Drive.


## Prerequisites

* JupyterLab 0.11.0 or later

## Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
pip install -e .
jupyter labextension install --symlink --py --sys-prefix jupyterlab_google_drive
jupyter labextension enable --py --sys-prefix jupyterlab_google_drive
```

To rebuild the extension bundle:

```bash
npm run build
```
