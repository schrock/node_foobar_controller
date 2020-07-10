var extensions = [
	"aac", "ay", "flac", "gbs", "gym", "hes", "kss", "mp3", "m4a",
	"minipsf", "miniusf", "nsf", "nsfe", "ogg", "psf", "psf2",
	"sap", "spc", "usf", "vgm"];

var playlistMode = false;

var state = {};

var dirStack = [];

$(document).ready(function () {
	// get root browser contents
	upDir();
	$('div.progress').click(function (e) {
		var duration = state.player.activeItem.duration;
		if (duration > 0) {
			var selectedX = e.pageX - $(this).offset().left;
			var maxX = $(this).width();
			var targetTimeFraction = selectedX / maxX;
			var targetTime = duration * targetTimeFraction;
			$.post('/api/player?position=' + targetTime).then(function (data, status) {
				return;
			});
		}
		return false;
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
	// update player state every second
	window.setInterval(updateState, 1000);
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
				// console.log(JSON.stringify(data.roots));
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
	playlistMode = false;

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
		var fileIndex = $(this).index();
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
			return $.post('/api/player/play/0/' + fileIndex);
		}).then(function (data, status) {
			playlistMode = true;
			return;
		}).fail(console.log.bind(console));
	});
}

function updateState() {
	$.get('/api/query?player=true&playlistItems=true&plref=0&plrange=0:10000&plcolumns=%discnumber%,%tracknumber%,%title%,%artist%,%length%').then(function (data, status) {
		state = data;
		// console.log(JSON.stringify(state));
		if (playlistMode) {
			$('.browser').empty();
			for (var item of state.playlistItems.items) {
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
			// highlight currently playing in playlist
			$('.browser .track').removeClass('bg-primary');
			var trackIndex = state.player.activeItem.index;
			if (trackIndex >= 0) {
				$('.browser .track').eq(trackIndex).addClass('bg-primary');
			}
			// play track when clicked
			$('.browser .track').click(function () {
				var clickedIndex = $(this).index();
				$.post('/api/player/play/0/' + clickedIndex).then(function (data, status) {
					return;
				});
			});
		}
		// update currently playing
		var trackIndex = state.player.activeItem.index;
		if (trackIndex >= 0) {
			$('.currentSong').html(state.playlistItems.items[trackIndex].columns[2]);
			$('.currentArtist').html(state.playlistItems.items[trackIndex].columns[3]);
		} else {
			$('.currentSong').html('');
			$('.currentArtist').html('');
		}
		// update progress bar, time
		var currentTime = state.player.activeItem.position;
		var duration = state.player.activeItem.duration;
		if (duration === 0) {
			$('div.progress-bar').width('0%');
		} else {
			$('div.progress-bar').width(currentTime / duration * 100 + '%');
		}
		$('div.progress-bar').html('<div>' + stringifyTime(currentTime) + '</div>');
		$('.currentTime').html(stringifyTime(currentTime) + '&nbsp;/&nbsp;' + stringifyTime(duration));
		// update progress bar animation
		if (state.player.playbackState === "playing") {
			$('div.progress-bar').addClass('progress-bar-animated');
		} else {
			$('div.progress-bar').removeClass('progress-bar-animated');
		}
		// update repeat button (playback mode)
		var playbackMode = state.player.playbackModes[state.player.playbackMode];
		if (playbackMode === 'Repeat (track)') {
			$('button.repeat').css('filter', 'invert(100%)');
		} else {
			$('button.repeat').css('filter', 'invert(0%)');
		}

		return;
	});
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
		updateState();
		return;
	});
}

function audioPlay() {
	$.post('/api/player/stop').then(function (data, status) {
		return $.post('/api/player/play');
	}).then(function (data, status) {
		updateState();
		return;
	});
}

function audioPause() {
	$.post('/api/player/pause/toggle').then(function (data, status) {
		updateState();
		return;
	});
}

function audioPrevious() {
	$.post('/api/player/previous').then(function (data, status) {
		updateState();
		return;
	});
}

function audioNext() {
	$.post('/api/player/next').then(function (data, status) {
		updateState();
		return;
	});
}

function audioRepeat() {
	var playbackModeIndex;
	var playbackMode = state.player.playbackModes[state.player.playbackMode];
	if (playbackMode === 'Repeat (track)') {
		playbackModeIndex = state.player.playbackModes.indexOf('Repeat (playlist)')
	}
	else {
		playbackModeIndex = state.player.playbackModes.indexOf('Repeat (track)')
	}
	$.post('/api/player?playbackMode=' + playbackModeIndex).then(function (data, status) {
		updateState();
		return;
	});
}
