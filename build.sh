#! /bin/bash

# cleanup
rm -rf dist
rm -rf node_modules

# install dependencies
npm install

# create distribution
mkdir dist
cp -r src/www/* dist/
cp -r node_modules dist/
