#!/bin/bash

cd offline
npm install
node get-access-token.js > token.txt
source token.txt
cd ..
sed -i "s/const ACCESS_TOKEN.*$/const ACCESS_TOKEN = '$ACCESS_TOKEN'/" src/util.ts
sed -i "s/const CLIENT_ID.*$/const CLIENT_ID = '$CLIENT_ID'/" src/util.ts
