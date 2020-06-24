const DirEntry = require('./DirEntry.js');

module.exports = class Directory extends DirEntry {

	constructor(name, path, dirUrl) {
		super('dir', name, path);
		this.dirUrl = dirUrl;
	}

}
