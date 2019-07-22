var fs = require('fs'),
    path = require('path'),
    mustache = require('mustache');


var Headline = function () {};

Headline.prototype.compile = function (args) {
    var compId = args.compId,
        customSettingsData = args.customSettingsData,
        alignImage = args.componentLayout  === 'right' ? 'right' : 'left';

    return new Promise(function (resolve, reject) {
        try {
            var dir = __dirname,
                templateFile = path.join(dir, 'headline.html'),
                template = fs.readFileSync(templateFile, 'utf8');

            var model = {
				contentId: compId + '_content_' + args.viewMode,
				alignCssClass: 'scs-align-' + alignImage,
				imageStyle: 'flex-basis:' + customSettingsData.width || '200px',
				alignImage: alignImage,
                image: '{{{image}}}',
                title: '{{{title}}}',
				byLine: '{{{byLine}}}'
            };

            var markup = '';
            markup = mustache.render(template, model);
            return resolve({
                hydrate: true,
                content: markup,
                nestedIDs: ['image', 'title', 'byLine']
            });
        } catch (e) {
            console.log(type + ': failed to expand template');
            console.log(e);
        }
        return resolve({});
    });
};


module.exports = new Headline();

