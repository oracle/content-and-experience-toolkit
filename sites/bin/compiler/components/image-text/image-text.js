var fs = require('fs'),
    path = require('path'),
    mustache = require('mustache');


var ImageText = function (args) {
    this.componentId = args.componentId; 
    this.componentInstanceObject = args.componentInstanceObject; 
    this.componentsFolder = args.componentsFolder;
    this.compData = this.componentInstanceObject.data;
};

ImageText.prototype.compile = function () {
    var compId = this.componentId,
        customSettingsData = this.compData.customSettingsData,
		layout = this.compData.componentLayout || 'default',
		alignImage = layout === 'default' ? 'left' : layout,
		showStoryLayout = layout === 'default' || layout === 'right';

    return new Promise(function (resolve, reject) {
        try {
            var dir = __dirname,
                templateFile = path.join(dir, 'image-text.html'),
                template = fs.readFileSync(templateFile, 'utf8');

            var model = {
				contentId: compId + '_content_runtime',
				alignCssClass: 'scs-align-' + alignImage,
				imageStyle: showStoryLayout ? 'width:' + customSettingsData.width : '',
				alignImage: alignImage,
                image: '{{{image}}}',
				paragraph: '{{{paragraph}}}'
            };

            var markup = '';
            markup = mustache.render(template, model);
            return resolve({
                hydrate: true,
                content: markup,
                nestedIDs: ['image', 'paragraph']
            });
        } catch (e) {
            console.log(type + ': failed to expand template');
            console.log(e);
        }
        return resolve({});
    });
};


module.exports = ImageText;

