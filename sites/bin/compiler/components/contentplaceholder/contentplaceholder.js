var ContentItem = require('../contentitem/contentitem.js');

var ContentPlaceholder = function (args) {
	this.componentId = args.componentId;
	this.componentInstanceObject = args.componentInstanceObject;
	this.componentsFolder = args.componentsFolder;
	this.SCSCompileAPI = args.SCSCompileAPI;

	// get the detail content item if it exists
	this.contentItem = args.SCSCompileAPI.detailContentItem;
};
ContentPlaceholder.prototype = Object.create(ContentItem.prototype);

ContentPlaceholder.prototype.isComponentValid = function (id, contentId) {
	if (!this.contentItem) {
		console.log(' - no content item specified for placeholder: ' + id + ' component will render at runtime.');
		return false; 
	} else {
		return true;
	}
};

ContentPlaceholder.prototype.getContentItem = function (args) {
	return Promise.resolve(this.contentItem);
};

module.exports = ContentPlaceholder;
