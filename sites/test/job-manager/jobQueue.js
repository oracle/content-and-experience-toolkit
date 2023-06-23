var JobQueue = function(args) {
	this.ps = args.ps;
	this.items = [];
	this.fetchItems();
};


JobQueue.prototype.isEmpty = function() {
	return this.items.length === 0;
};

JobQueue.prototype.enqueue = function(item) {
	// Always get it from the file first
	this.fetchItems();
	this.items.push(item);
	this.saveItems();
};

JobQueue.prototype.dequeue = function() {
	var item = null;

	this.fetchItems();
	if (!this.isEmpty()) {
		item = this.items.shift();
		this.saveItems();
	}

	return item;
};

// Fetch queue items from file
JobQueue.prototype.fetchItems = function() {
	var data = this.ps.getQueue(); // persistenceStore.getQueue();
	if (Array.isArray(data)) {
		this.items = data;
	} else {
		// Fallback is that queue is empty.
		this.items = [];
	}
};

// Save queue items to file
JobQueue.prototype.saveItems = function() {
	var args = { items: this.items };

	this.ps.setQueue(args);
	// persistenceStore.setQueue(args);
};

module.exports = function (args) {
	return new JobQueue(args);
};