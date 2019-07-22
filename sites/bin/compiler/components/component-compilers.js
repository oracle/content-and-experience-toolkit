var componentCompilers = [{
		type: 'scs-contentsearch',
		compiler: 'contentsearch/contentsearch',
		canNest: true
	},
	{
		type: 'scs-componentgroup',
		compiler: 'componentgroup/componentgroup',
		canNest: true
	},
	{
		type: 'scs-divider',
		compiler: 'divider/divider',
		canNest: true
	},
	{
		type: 'scs-spacer',
		compiler: 'spacer/spacer',
		canNest: true
	},
	{
		type: 'scs-video',
		compiler: 'video/video',
		canNest: true
	},
	{
		type: 'scs-image',
		compiler: 'image/image',
		canNest: true
	},
	{
		type: 'scs-component',
		compiler: 'component/component',
		canNest: false
	},
	{
		type: 'scs-title',
		compiler: 'title/title',
		canNest: true
	},
	{
		type: 'scs-text',
		compiler: 'title/title',
		canNest: true
	},
	{
		type: 'scs-paragraph',
		compiler: 'title/title',
		canNest: true
	},
	{
		type: 'scs-button',
		compiler: 'button/button',
		canNest: true
	}
];

module.exports = componentCompilers;