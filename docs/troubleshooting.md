# Troubleshooting

The `@jupyterlab/google-drive` extension is a complex plugin.
Adding to this complexity is that the extension must make authenticated calls to Google's servers.
This is a list of problems you may run into, with possible solutions.

In order to better debug, it is always helpful to look at the Javascript console
in your browser to see if any errors are being shown.

### The Google Drive panel doesn't show a login button.

This means that the plugin may not be loading the Google API libraries,
or they may not be initializing correctly.
Check your internet connection and look at the Javascript console
to see if any errors are being shown.

### `Not a valid origin for the client` error.

If you have not set up your own client ID, then you are running the plugin
with the default one. This is configured to only work if you are running the
Jupyter notebook server on `localhost`, ports `8888`-`8899`.
If you are running on any other origins or ports, Google's servers will reject requests.
If you cannot change your notebook server location, consider setting up your own client ID.

If you have set up your own client ID for your JupyterLab deployment,
then something is likely wrong with the configuration.
Try looking through [advanced.md](./advanced.md) for a solution.

### `Failed to read the 'localStorage' property from 'Window'` error.

You may have your browser configured to block third-party cookies which is blocking Google Login.
Either allow third-party cookies, or add an exception to the whitelist for `accounts.google.com`.

### I have shared a document with another person, but they don't seem to by synchronizing!

If two users are trying to collaborate on a document, but are using instances of JupyterLab
configured with different client IDs, then synchronization WILL NOT WORK.
Ensure that everybody is using the same client ID.
You can check the client ID in the JupyterLab settings editor:
![Client ID](images/clientid.png)
