#!/bin/bash

karma start --browsers=Firefox karma.conf.js

# Conditionally run drive tests if we have the proper environment variables
if [[ $CLIENT_ID ]] && [[ $CLIENT_SECRET ]] && [[ $REFRESH_TOKEN ]]; then

  echo "Running remote Google Drive tests"
  karma start --browsers=Firefox karma.conf.js || karma start --browsers=Firefox karma.conf.js

else

  echo "Couldn't run remote Google Drive tests"
  echo "We don't have the proper environment variables"

fi
