#!/bin/bash

cd offline
npm install
node get-access-token.js > token.txt
source token.txt
cd ..
sed -i "s/<TEST_ACCESS_TOKEN>/$ACCESS_TOKEN/" src/util.ts
sed -i "s/<TEST_CLIENT_ID>/$CLIENT_ID/" src/util.ts
