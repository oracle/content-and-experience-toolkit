var ContentItem = require('../contentitem/contentitem.js');
var compilationReporter = require('../../reporter.js');

var ContentPlaceholder = function (args) {
	this.componentId = args.componentId;
	this.componentInstanceObject = args.componentInstanceObject;
	this.componentsFolder = args.componentsFolder;
	this.SCSCompileAPI = args.SCSCompileAPI;

	// get the detail content item if it exists
	this.contentItem = args.SCSCompileAPI.detailContentItem;

	// set the default to content placeholder default
	this.defaultContentLayoutCategory = 'Content Placeholder Default';
};
ContentPlaceholder.prototype = Object.create(ContentItem.prototype);

ContentPlaceholder.prototype.isComponentValid = function (id, contentId) {
	if (!this.contentItem) {
		compilationReporter.info({
			message: 'no content item specified for placeholder: ' + id + ' component will render at runtime.'
		});
		return false;
	} else {
		return true;
	}
};

ContentPlaceholder.prototype.getContentItem = function (args) {
	return Promise.resolve(this.contentItem);
};

ContentPlaceholder.prototype.getContentType = function (args) {
	return this.contentItem ? this.contentItem.type : this.componentInstanceObject.data.contentTypes[0];
};


module.exports = ContentPlaceholder;
