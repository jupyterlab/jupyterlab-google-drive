#!/bin/bash

karma start --browsers=Firefox karma.conf.js

# Conditionally run drive tests if we have the proper environment variables
if [ ! -z $CLIENT_ID ] && [ ! -z $CLIENT_SECRET ] && [ ! -z $REFRESH_TOKEN ]; then

  echo "Running remote Google Drive tests"
  karma start --browsers=Firefox karma.conf.js || karma start --browsers=Firefox karma.conf.js

fi
