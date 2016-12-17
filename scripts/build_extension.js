var buildExtension = require('@jupyterlab/extension-builder').buildExtension;

buildExtension({
        name: 'jupyterlab_google_drive',
        entry: './lib/plugin.js',
        outputDir: './jupyterlab_google_drive/static'
});
