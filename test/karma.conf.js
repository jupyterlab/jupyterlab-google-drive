module.exports = function (config) {
  config.set({
    basePath: '.',
    frameworks: ['mocha'],
    reporters: ['mocha'],
    plugins: [
      'karma-chrome-launcher',
      'karma-firefox-launcher',
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-sourcemap-loader'
    ],
    client: {
      mocha: {
        timeout : 10000, // 10 seconds: Google Drive can be slow.
        retries: 3 // Allow for slow server on CI.
      }
    },
    files: [
      '../node_modules/es6-promise/dist/es6-promise.js',
      './build/bundle.js',
    ],
    preprocessors: {
      'build/bundle.js': ['sourcemap']
    },
    port: 8888,
    colors: true,
    singleRun: true,
    logLevel: config.LOG_INFO
  });
};
