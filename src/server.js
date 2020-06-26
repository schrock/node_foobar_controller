'use strict';

// configuration
const nconf = require('nconf');
nconf.argv().env().file('./config.local.json');
nconf.defaults({
	"port": 8881,
	"beefwebHost": "localhost",
	"beefwebPort": 8880
});

// 3rd party
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const http = require('http');
const fs = require('fs');

// classes
const Worker = require('./Worker.js');

if (cluster.isMaster) {
	console.log('port: ' + JSON.stringify(nconf.get('port'), null, 4));
	console.log('beefwebHost: ' + JSON.stringify(nconf.get('beefwebHost'), null, 4));
	console.log('beefwebPort: ' + JSON.stringify(nconf.get('beefwebPort'), null, 4));
	console.log('extensions: ' + JSON.stringify(nconf.get('extensions'), null, 4));

	var numCPUs = os.cpus().length;
	for (var i = 0; i < numCPUs; i++) {
		// Create a worker
		cluster.fork();
	}

	cluster.on('exit', function (worker, code, signal) {
		console.log('Worker %d died with code/signal %s. Restarting worker...', worker.process.pid, signal || code);
		cluster.fork();
	});
} else {
	// setup server
	var worker = new Worker(nconf);
	var port = nconf.get('port');
	var server = http.createServer(worker.getApp());
	server.listen(port, function () {
		console.log('worker running on port ' + port + '...');
	});
	// let worker code handle timeouts
	server.timeout = 0;
}
