#!/bin/bash


# Conditionally build drive tests if we have the proper environment variables
if [[ $CLIENT_ID ]] && [[ $CLIENT_SECRET ]] && [[ $REFRESH_TOKEN ]]; then

  echo "Building remote Google Drive tests"

  # Run the script to get the access token.
  cd get-access-token || exit
  jlpm install
  node get-access-token.js > token.txt
  source token.txt && rm token.txt
  cd ..

  # Patch the access token into the appropriate file
  sed -i "s/const ACCESS_TOKEN.*$/const ACCESS_TOKEN = '$ACCESS_TOKEN'/" src/util.ts
  sed -i "s/const CLIENT_ID.*$/const CLIENT_ID = '$CLIENT_ID'/" src/util.ts

else

  echo "Couldn't build remote Google Drive tests"
  echo "We don't have the proper environment variables"

fi

tsc
webpack --config webpack.config.js
