/* globals app, module, __dirname */

var JobQueue = function() {
        this.items = [];
    };


JobQueue.prototype.isEmpty = function() {
    return this.items.length === 0;
}

JobQueue.prototype.enqueue = function(item) {
    this.items.push(item);
};

JobQueue.prototype.dequeue = function() {
    if (this.isEmpty()) {
        return null;
    } else {
        return this.items.shift();
    }
};


module.exports = new JobQueue();