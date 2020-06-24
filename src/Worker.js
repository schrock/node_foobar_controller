'use strict';

// 3rd party
const express = require('express');

module.exports = class Worker {

	constructor() {
		this.app = express();

		this.app.use(function (req, res, next) {
			res.header("Cache-Control", "no-store, no-cache");
			next();
		});

		// timeout of 10 minutes
		const apiTimeout = 10 * 60 * 1000;
		this.app.use(function (req, res, next) {
			// Set the timeout for all HTTP requests
			req.setTimeout(apiTimeout, function () {
				let err = new Error('Request Timeout');
				err.status = 408;
				next(err);
			});
			// Set the server response timeout for all HTTP requests
			res.setTimeout(apiTimeout, function () {
				let err = new Error('Service Unavailable');
				err.status = 503;
				next(err);
			});
			next();
		});

		// routes
		this.app.get('/hello', function (req, res) {
			res.send('hello world!');
		});
		// serve client-side web app
		this.app.use('/', express.static('src/www'));
		// serve client-side dependencies
		this.app.use('/node_modules', express.static('node_modules'));
	}

	getApp() {
		return this.app;
	}

}
