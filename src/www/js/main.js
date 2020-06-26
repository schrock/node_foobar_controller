var extensions = ["mp3", "m4a", "flac", "ogg", "ay", "gbs", "gym", "hes", "kss", "nsf", "nsfe", "psf", "minipsf", "psf2", "sap", "spc", "usf", "miniusf", "vgm"];

var playlist = [];
var playlistIndex = 0;

var dirStack = [];

var repeat = false;

var audioCtx;
var analyser;
var bufferLength;
var dataArray;

$(document).ready(function () {
	// get root browser contents
	upDir();
	// hookup progress bar
	$('audio.player').on('timeupdate', function () {
		var currentTime = $('audio.player').get(0).currentTime;
		//var duration = $('audio.player').get(0).duration;
		var track = playlist[playlistIndex];
		var duration = track.duration;
		$('div.progress-bar').width(currentTime / duration * 100 + '%');
		// update time display
		$('div.progress-bar').html('<div>' + stringifyTime(currentTime) + '</div>');
		$('.currentTime').html(stringifyTime(currentTime) + '&nbsp;/&nbsp;' + stringifyTime(duration));
		$('.currentInfo').html(playlist[playlistIndex].replaygainAlbum + '&nbsp;' + playlist[playlistIndex].format);
	});
	$('div.progress').click(function (e) {
		//var duration = $('audio.player').get(0).duration;
		var track = playlist[playlistIndex];
		var duration = track.duration;
		if (duration > 0) {
			var selectedX = e.pageX - $(this).offset().left;
			var maxX = $(this).width();
			var targetTimeFraction = selectedX / maxX;
			var targetTime = duration * targetTimeFraction;
			$('audio.player').get(0).currentTime = targetTime;
		}
		return false;
	});
	// automatic track change at end of current song
	$('audio.player').on('ended', function () {
		if (repeat) {
			audioPlay();
		} else {
			audioNext();
		}
	});
	$('audio.player').on('play playing', function () {
		$('button.pause').html('<span class="oi oi-media-pause"></span>');
		$('div.progress-bar').addClass('progress-bar-animated');
	});
	$('audio.player').on('pause', function () {
		$('button.pause').html('<span class="oi oi-media-play"></span>');
		$('div.progress-bar').removeClass('progress-bar-animated');
	});

	// hookup audio player buttons
	$('button.upDir').click(upDir);
	$('button.previous').click(audioPrevious);
	$('button.play').click(audioPlay);
	$('button.pause').click(audioPause);
	$('button.stop').click(audioStop);
	$('button.next').click(audioNext);
	$('button.repeat').click(audioRepeat);
	// keyboard shortcuts
	$(document).keydown(function (e) {
		var key = e.key;
		if (key == 'z') {
			audioPrevious();
			return false;
		} else if (key == 'x') {
			audioPlay();
			return false;
		} else if (key == 'c') {
			audioPause();
			return false;
		} else if (key == 'v') {
			audioStop();
			return false;
		} else if (key == 'b') {
			audioNext();
			return false;
		}
	});
});

function stringifyTime(time) {
	var minutes = Math.floor(time / 60);
	var seconds = Math.floor(time % 60);
	if (seconds < 10) {
		seconds = '0' + seconds;
	}

	if (isNaN(minutes) || isNaN(seconds)) {
		return '0:00';
	} else {
		return minutes + ':' + seconds;
	}
}

function upDir() {
	// show loading message
	$('.browser').hide();
	$('.loading_message').show();

	dirStack.pop();
	if (dirStack.length == 0) {
		$.get('/api/browser/roots', function (data, status) {
			if (status == 'success') {
				console.log(JSON.stringify(data.roots));
				handleDirContents(null, data.roots);
				// hide loading message
				$('.loading_message').hide();
				$('.browser').show();
			}
		});
	} else {
		var dir = dirStack[dirStack.length - 1];
		$.get('/api/browser/entries?path=' + dir.path, function (data, status) {
			if (status == 'success') {
				handleDirContents(dir, data.entries);
				// hide loading message
				$('.loading_message').hide();
				$('.browser').show();
			}
		});
	}
}

function handleDirContents(currentDir, dirEntries) {
	var dirs = [];
	var files = [];
	for (var dirEntry of dirEntries) {
		if (dirEntry.type == 'D') {
			dirs.push(dirEntry);
		} else if (dirEntry.type == 'F') {
			var fileName = dirEntry.name;
			var extIndex = fileName.lastIndexOf('.');
			if (extIndex > 0) {
				var ext = fileName.substring(extIndex + 1);
				if (extensions.indexOf(ext) > -1) {
					files.push(dirEntry);
				}
			}
		}
	}

	// update go up directory functionality
	if (currentDir == null) {
		$('.currentDir').empty();
	} else {
		$('.currentDir').html(currentDir.name);
	}

	// clear browser contents
	$('.browser').empty();

	// place dirs first in browser
	for (var dir of dirs) {
		// skip folders containing album art scans
		if (dir.name.toLowerCase() == 'scans') {
			continue;
		}
		$('.browser').append('<div class="row border-top dir"></div>');
		$('.browser .dir').last().append('<div class="col-12 no-overflow no-gutters"><span class="oi oi-folder"></span>&nbsp;&nbsp;&nbsp;' + dir.name + '</div>');
		$('.browser .dir').last().data('dir', dir);
	}
	$('.browser .dir').click(function () {
		var dir = $(this).data('dir');
		//console.log('clicked dir ' + JSON.stringify(dir));
		// show loading message
		$('.browser').hide();
		$('.loading_message').show();
		$.get('/api/browser/entries?path=' + dir.path, function (data, status) {
			if (status == 'success') {
				dirStack.push(dir);
				handleDirContents(dir, data.entries);
				// hide loading message
				$('.loading_message').hide();
				$('.browser').show();
			}
		});
		return false;
	});

	// place files after dirs in browser
	for (var file of files) {
		$('.browser').append('<div class="row border-top file"></div>');
		$('.browser .file').last().append('<div class="col-12 no-overflow no-gutters"><span class="oi oi-file"></span>&nbsp;&nbsp;&nbsp;' + file.name + '</div>');
		$('.browser .file').last().data('file', file);
	}
	$('.browser .file').click(function () {
		// stop playback
		$.post('/api/player/stop').then(function (data, status) {
			// clear playlist
			return $.post('/api/playlists/0/clear');
		}).then(function (data, status) {
			// add current files to playlist
			var items = [];
			$('.browser .file').each(function (index) {
				var file = $(this).data('file');
				items.push(file.path);
			});
			var itemsObject = { items: items };
			return $.ajax({ url: '/api/playlists/0/items/add', type: 'POST', data: JSON.stringify(itemsObject), contentType: 'application/json' });
		}).then(function (data, status) {
			return $.get('/api/playlists/0/items/0:10000?columns=%discnumber%,%tracknumber%,%title%,%artist%,%length%');
		}).then(function (data, status) {
			console.log(JSON.stringify(data));
			$('.browser').empty();
			for (var item of data.playlistItems.items) {
				var track = {};
				track.number = item.columns[1];
				if (item.columns[0] !== '?') {
					track.number = item.columns[0] + '.' + track.number;
				}
				track.title = item.columns[2];
				track.artist = item.columns[3];
				track.length = item.columns[4];
				$('.browser').append('<div class="row border-top track"></div>');
				$('.browser .track').last().append('<div class="col-12 col-md-8 no-overflow no-gutters">' + track.number + '&nbsp;&nbsp;&nbsp;' + track.title + '</div>');
				$('.browser .track').last().append('<div class="col-3 d-none d-md-block no-overflow">' + track.artist + '</div>');
				$('.browser .track').last().append('<div class="col-1 d-none d-md-block text-right">' + track.length + '</div>');
				$('.browser .track').last().data('track', track);
			}
			return;
		}).fail(console.log.bind(console));
	});

	/*
	// place files after dirs in browser
	for (var file of files) {
		for (var track of file.tracks) {
			var trackNumber = track.track + '';
			if (trackNumber.length == 1) {
				trackNumber = '0' + trackNumber;
			}
			$('.browser').append('<div class="row border-top track"></div>');
			$('.browser .track').last().append('<div class="col-12 col-md-8 no-overflow no-gutters">' + trackNumber + '&nbsp;&nbsp;&nbsp;' + track.title + '</div>');
			$('.browser .track').last().append('<div class="col-3 d-none d-md-block no-overflow">' + track.artist + '</div>');
			$('.browser .track').last().append('<div class="col-1 d-none d-md-block text-right">' + stringifyTime(track.duration) + '</div>');
			$('.browser .track').last().data('track', track);
		}
	}
	$('.browser .track').click(function () {
		// fix suspended AudioContext on Chrome
		audioCtx.resume();
		var track = $(this).data('track');
		//console.log('clicked track ' + JSON.stringify(track));
		playlist = [];
		playlistIndex = 0;
		$('.browser .track').each(function (index) {
			var t = $(this).data('track');
			playlist.push(t);
			if (track === t) {
				playlistIndex = index;
			}
		});
		audioPlay();
		return false;
	});
	*/
}

function revealElement(element) {
	var headerRect = $('div.sticky-top')[0].getBoundingClientRect();
	var elementRect = element.getBoundingClientRect();
	if (elementRect.top < headerRect.bottom || elementRect.bottom > window.innerHeight) {
		element.scrollIntoView(false);
	}
}

function audioStop() {
	$.post('/api/player/stop').then(function (data, status) {
		$('div.progress-bar').width('0%');
		return;
	});
}

function audioPlay() {
	$.post('/api/player/play').then(function (data, status) {
		return;
	});
	// var track = playlist[playlistIndex];
	// // highlight in playlist
	// $('.browser .track').removeClass('bg-primary');
	// $('.browser .track').each(function () {
	// 	var t = $(this).data('track');
	// 	if (track === t) {
	// 		$(this).addClass('bg-primary');
	// 		revealElement($(this)[0]);
	// 	}
	// });
	// // change current song information labels
	// document.title = track.title;
	// $('.currentSong').html(track.title);
	// $('.currentArtist').html(track.artist);
}

function audioPause() {
	$.post('/api/player/pause/toggle').then(function (data, status) {
		return;
	});
}

function audioPrevious() {
	$.post('/api/player/previous').then(function (data, status) {
		return;
	});
}

function audioNext() {
	$.post('/api/player/next').then(function (data, status) {
		return;
	});
}

function audioRepeat() {
	if (repeat) {
		repeat = false;
		//$('button.repeat').removeClass('active');
		$('button.repeat').css('filter', 'invert(0%)');
	} else {
		repeat = true;
		//$('button.repeat').addClass('active');
		$('button.repeat').css('filter', 'invert(100%)');
	}
}
