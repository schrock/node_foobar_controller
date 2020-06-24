'use strict';

// 3rd party
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');

// classes
const Worker = require('./Worker.js');

if (cluster.isMaster) {
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
	var worker = new Worker();
	var port = 8881;
	var server = http.createServer(worker.getApp());
	server.listen(port, function () {
		console.log('worker running on port ' + port + '...');
	});
	// let worker code handle timeouts
	server.timeout = 0;
}
