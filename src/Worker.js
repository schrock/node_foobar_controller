'use strict';

// 3rd party
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

// classes
const DirEntry = require('./DirEntry.js');
const Directory = require('./Directory.js');
const MediaFile = require('./MediaFile.js');

module.exports = class Worker {

	constructor(nconf) {
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
		this.app.get('/dir', getDir);
		this.app.get('/play', getPlay);
		// serve client-side web app
		this.app.use('/', express.static('src/www'));
		// serve client-side dependencies
		this.app.use('/node_modules', express.static('node_modules'));

		function getDir(req, res) {
			var queryPath = req.query.path;
			if (typeof queryPath === 'undefined') {
				queryPath = '';
			}
			var realPath = nconf.get('baseDir') + '/' + queryPath;

			var dirContents;
			try {
				dirContents = fs.readdirSync(realPath);
				dirContents.sort();
			} catch (Err) {
				res.send('Unable to read path ' + realPath);
				return;
			}

			var dirEntries = [];
			var initPromises = [];
			for (var fileName of dirContents) {
				var filePath = queryPath + '/' + fileName;
				var realPath = nconf.get('baseDir') + '/' + filePath;
				var stat = fs.statSync(realPath);
				if (stat.isDirectory()) {
					var dirUrl = '/dir?path=' + encodeURIComponent(queryPath + '/' + fileName);
					dirEntries.push(new Directory(fileName, realPath, dirUrl));
				} else if (stat.isFile()) {
					var extIndex = fileName.lastIndexOf('.');
					if (extIndex > 0) {
						var ext = fileName.substring(extIndex + 1);
						if (nconf.get('extensions').indexOf(ext) > -1) {
							var playUrl = '/play?path=' + encodeURIComponent(queryPath + '/' + fileName);
							var mediaFile = new MediaFile(fileName, realPath, playUrl);
							initPromises.push(mediaFile.init());
						}
					}
				}
			}
			Promise.all(initPromises).then(function (mediaFiles) {
				dirEntries = dirEntries.concat(mediaFiles);
				res.contentType('application/json');
				res.send(JSON.stringify(dirEntries, null, 4));
			}).catch(function (err) {
				res.status(500);
				res.contentType('text/plain');
				res.send('Failed to get file metadata. See server log.');
			});
		}

		function getPlay(req, res) {
			console.log('Play request from ' + req.connection.remoteAddress);

			res.header('Accept-Ranges', 'bytes');
			res.setHeader('Content-Type', 'audio/mpeg');

			var range = req.headers.range;
			if (range == null) {
				range = 'bytes=0-';
			}
			// console.log('range: ' + range);
			var equalsIndex = range.indexOf('=');
			var dashIndex = range.indexOf('-');
			var startByte = Number(range.substring(equalsIndex + 1, dashIndex));
			var endByte = range.substring(dashIndex + 1);

			var queryPath = req.query.path;
			var realPath = nconf.get('baseDir') + '/' + queryPath;
			var extIndex = realPath.lastIndexOf('.');
			var ext = null;
			if (extIndex > 0) {
				ext = realPath.substring(extIndex + 1);
			}

			// return original file if mp3
			//if (ext != null && ext == 'mp3') {
			// skip this block and convert everything to mp3 on-the-fly
			if (false) {
				// return requested portion of original file
				console.log('streaming original ' + range + ' : ' + queryPath);

				var fileSize = fs.statSync(realPath).size;
				if (endByte.length == 0) {
					endByte = fileSize - 1;
				} else {
					endByte = Number(endByte);
				}
				endByte = fileSize - 1;

				res.setHeader('Content-Range', 'bytes ' + startByte + '-' + endByte + '/' + fileSize);
				res.setHeader('Content-Length', endByte - startByte + 1);
				res.status(206);

				fs.createReadStream(realPath, { start: startByte, end: endByte }).pipe(res, { end: true });
			} else {
				// convert to mp3 using ffmpeg
				console.log('converting to mp3 ' + range + ' : ' + queryPath);

				var track_index = Number(req.query.track_index);

				var duration = req.query.duration;
				var fileSize = Math.floor(duration * (nconf.get('bitrate') * 1000 / 8));
				if (endByte.length == 0) {
					endByte = fileSize - 1;
				} else {
					endByte = Number(endByte);
				}
				// console.log('startByte: ' + startByte);
				// console.log('endByte:   ' + endByte);
				res.setHeader('Content-Range', 'bytes ' + startByte + '-' + endByte + '/' + fileSize);
				res.setHeader('Content-Length', endByte - startByte + 1);
				res.status(206);

				var startTime = 0;
				if (startByte > 0) {
					startTime = startByte / (nconf.get('bitrate') * 1000 / 8);
				}
				var endTime = endByte / (nconf.get('bitrate') * 1000 / 8);
				// console.log('startTime: ' + startTime);
				// console.log('endTime:   ' + endTime);

				var command = ffmpeg(realPath);
				if (track_index > 0) {
					command.inputOptions('-track_index ' + track_index);
				}
				command.audioCodec('libmp3lame').audioChannels(2)
					.audioFrequency(44100).audioBitrate(nconf.get('bitrate')).format('mp3').noVideo()
					.seek(startTime).duration(endTime - startTime)
					.audioFilters('volume=replaygain=track')
					.on('start', function () {
						// console.log('ffmpeg processing started: ' + queryPath);
					})
					.on('error', function (err) {
						if (!err.toString().includes('Output stream closed')) {
							console.log('ffmpeg processing error: ' + queryPath + ' : ' + err.message);
						}
						if (!err.toString().includes('SIGKILL')) {
							console.log('Killing ffmpeg for ' + queryPath);
							command.kill();
						}
					})
					.on('end', function () {
						// console.log('ffmpeg processing finished: ' + queryPath);
					})
					.pipe(res, { end: true });
				// // kill ffmpeg after 10 minutes
				// setTimeout(function () {
				// 	console.log('ffmpeg running for 10 minutes. Killing ffmpeg...');
				// 	command.kill();
				// }, 600000);
				res.on('finish', function () {
					console.log('Play response using ffmpeg finished. Killing ffmpeg for ' + queryPath);
					command.kill();
				});
			}
		}

	}

	getApp() {
		return this.app;
	}

}
