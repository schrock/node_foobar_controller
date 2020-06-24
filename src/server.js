'use strict';

// configuration
const nconf = require('nconf');
nconf.argv().env().file('./config.local.json');
nconf.defaults({
	"baseDir": process.env.HOME + "/Music",
	"bitrate": 256,
	"extensions": ["mp3", "m4a", "flac", "ogg", "ay", "gbs", "gym", "hes", "kss", "nsf", "nsfe", "sap", "spc", "vgm"],
	"httpsCertFile": "./localhost.cert",
	"httpsKeyFile": "./localhost.key"
});

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
	console.log('baseDir: ' + JSON.stringify(nconf.get('baseDir'), null, 4));
	console.log('bitrate: ' + JSON.stringify(nconf.get('bitrate'), null, 4));
	console.log('extensions: ' + JSON.stringify(nconf.get('extensions'), null, 4));
	console.log('httpsCertFile: ' + JSON.stringify(nconf.get('httpsCertFile'), null, 4));
	console.log('httpsKeyFile: ' + JSON.stringify(nconf.get('httpsKeyFile'), null, 4));

	var numCPUs = os.cpus().length;
	for (var i = 0; i < numCPUs; i++) {
		// Create a worker
		cluster.fork();
	}

	cluster.on('exit', function (worker, code, signal) {
		console.log('Worker %d died with code/signal %s. Restarting worker...', worker.process.pid, signal || code);
		cluster.fork();
	});

	// create http server for redirection to https
	var app = express();
	app.use(function (req, res, next) {
		var host = req.headers.host.replace(/:\d+$/, '');
		console.log("redirecting to " + "https://" + host + req.url);
		res.redirect("https://" + host + req.url);
	});
	var port = 8080;
	var server = http.createServer(app);
	server.listen(port, function () {
		console.log('http redirection running on port ' + port + '...');
	});
} else {
	// setup server
	var worker = new Worker(nconf);
	var options = {
		key: fs.readFileSync(nconf.get('httpsKeyFile')),
		cert: fs.readFileSync(nconf.get('httpsCertFile')),
		requestCert: false,
		rejectUnauthorized: false
	};
	var port = 8443;
	var server = https.createServer(options, worker.getApp());
	server.listen(port, function () {
		console.log('worker running on port ' + port + '...');
	});
	// let worker code handle timeouts
	server.timeout = 0;
}
