/**
 * Confidential and Proprietary for Oracle Corporation
 *
 * This computer program contains valuable, confidential, and
 * proprietary information. Disclosure, use, or reproduction
 * without the written authorization of Oracle is prohibited.
 * This unpublished work by Oracle is protected by the laws
 * of the United States and other countries. If publication
 * of this computer program should occur, the following notice
 * shall apply:
 *
 * Copyright (c) 2015 Oracle Corp.
 * All rights reserved.
 *
 * $Id: component-registration.js 166785 2019-01-10 18:46:18Z muralik $
 */
/* global define, module, exports, require */
(function defineComponentRegistration(scope, factory) {
	// configure to run in various JS environments
	if (typeof define === 'function' && define.amd) {
		// RequireJS, pass in the factory and use the 'exports' empty object
		//  define(['exports', 'mustache'], factory); // if you wanted to require in another moule
		define(['exports'], factory);
	} else if (typeof exports === 'object' && exports && typeof exports.nodeName !== 'string') {
		// NodeJS (CommonJS), pass in the exports object and populate it
		// factory(exports, require('mustache'));
		factory(exports);
	} else {
		// not supported
	}
}(this, function componentRegistrationFactory(exports) {
	exports['component-registration'] = {
		'types': {
			'IMAGE': 'scs-image',
			'MAP': 'scs-map',
			'DOCUMENT': 'scs-document',
			'TITLE': 'scs-title',
			'PARAGRAPH': 'scs-paragraph',
			'INLINETEXT': 'scs-inline-text',
			'INLINEIMAGE': 'scs-inline-image',
			'APP': 'scs-app',
			'COMPONENT': 'scs-component',
			'BUTTON': 'scs-button',
			'DIVIDER': 'scs-divider',
			'SPACER': 'scs-spacer',
			'GALLERY': 'scs-gallery',
			'GALLERYGRID': 'scs-gallerygrid',
			'YOUTUBE': 'scs-youtube',
			'SOCIALBAR': 'scs-socialbar',
			'SLOT': 'scs-slot',
			'COMPONENTGROUP': 'scs-componentgroup',
			'SECTIONLAYOUT': 'scs-sectionlayout',
			'VIDEO': 'scs-video',
			'CONTENTLIST': 'scs-contentlist',
			'RECOMMENDATION': 'scs-recommendation',
			'CONTENTSEARCH': 'scs-contentsearch',
			'OPAINTERVIEW': 'scs-opainterview'
		},
		'definitions': {
			'scs-image': {
				'config': {
					'displayName': 'COMP_CONFIG_IMAGE_DISPLAY_NAME',
					'description': 'COMP_CONFIG_IMAGE_DESCRIPTION',
					'icon': 'image.svg',
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'imageTarget': '_self',
						'linkType': 'scs-link-no-link',
						'marginBottom': 0,
						'marginLeft': 0,
						'marginRight': 0,
						'marginTop': 0,
						'useStyleClass': 'true',
						'visible': true,
						'width': 300
					},
					'properties': [
						'alignment',
						'altText',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'caption',
						'contentId',
						'contentViewing',
						'filePreviewShowDownload',
						'imageHref',
						'imageHrefContentViewing',
						'imageHrefName',
						'imageName',
						'imageTarget',
						'imageUrl',
						'linkType',
						'linkRendition',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'rendition',
						'renderOnAccess',
						'styleClass',
						'title',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'hasPublishedVersion',
						'openFilePicker'
					],
					'instanceProperties': [
						'contentId',
						'contentViewing',
						'imageName',
						'imageTarget',
						'linkType',
						'rendition',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
							'propName': 'altText',
							'propType': 'string',
							'propDisplayName': 'COMP_IMAGE_ALTTEXT'
						},
						{
							'propName': 'caption',
							'propType': 'string',
							'propDisplayName': 'COMP_IMAGE_CAPTION'
						},
						{
							'propName': 'imageHref',
							'propType': 'link',
							'propDisplayName': 'COMP_IMAGE_HREF'
						},
						{
							'propName': 'imageHrefContentViewing',
							'propType': 'string',
							'propDisplayName': 'COMP_IMAGE_HREF'
						},
						{
							'propName': 'imageHrefName',
							'propType': 'string',
							'propDisplayName': 'COMP_IMAGE_HREF'
						},
						{
							'propName': 'imageUrl',
							'propType': 'image',
							'propDisplayName': 'COMP_IMAGE_URL'
						},
						{
							'propName': 'title',
							'propType': 'string',
							'propDisplayName': 'COMP_IMAGE_TITLE'
						}
					],
					'fileReferenceProperties': [{
							'propName': 'imageUrl',
							'propType': 'string'
						},
						{
							'propName': 'imageHref',
							'propType': 'string'
						}
					],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'supportedDataFlavors': [
						'images/jpg',
						'images/png',
						'images/svg',
						'images/gif'
					],
					'triggers': [{
						'triggerName': 'scsLinkClicked',
						'triggerDescription': 'ACTION_TRIGGER_LINK_CLICKED_DESCRIPTION',
						'triggerPayload': []
					}]
				}
			},
			'scs-map': {
				'config': {
					'displayName': 'COMP_CONFIG_MAP_DISPLAY_NAME',
					'description': 'COMP_CONFIG_MAP_DESCRIPTION',
					'icon': 'map.svg',
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'defaultMapLocation': 'San Francisco, CA',
						'height': 400,
						'mapControls': ['zoomControl'],
						'mapLat': '37.7577',
						'mapLong': '-122.4376',
						'mapType': 'roadmap',
						'marginBottom': 0,
						'marginLeft': 0,
						'marginRight': 0,
						'marginTop': 0,
						'useStyleClass': 'true',
						'visible': true,
						'width': 400,
						'zoom': 12
					},
					'properties': [
						'alignment',
						'apiKey',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'defaultMapLocation',
						'height',
						'mapControls',
						'mapLat',
						'mapLocation',
						'mapLong',
						'mapType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'provider',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width',
						'zoom'
					],
					'asynchronousUpdateProperties': [
						'mapLat',
						'mapLong'
					],
					'instanceProperties': [
						'defaultMapLocation',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
							'propName': 'apiKey',
							'propType': 'string',
							'propDisplayName': 'COMP_MAP_APIKEY'
						},
						{
							'propName': 'mapLocation',
							'propType': 'string',
							'propDisplayName': 'COMP_MAP_LOCATION'
						},
						{
							'propName': 'provider',
							'propType': 'string',
							'propDisplayName': 'COMP_MAP_PROVIDER'
						}
					],
					'desktopControls': [
						'overviewMapControl',
						'zoomControl',
						'streetViewControl'
					]
				}
			},
			'scs-document': {
				'config': {
					'displayName': 'COMP_CONFIG_DOCUMENT_DISPLAY_NAME',
					'description': 'COMP_CONFIG_DOCUMENT_DESCRIPTION',
					'icon': 'doc.svg',
					'defaultValues': {
						'alignment': 'fill',
						'aspectRatio': 'auto',
						'backgroundColor': '#444444',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'documentRatio': 1.2308,
						'documentTitle': '',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'scaling': 'fitPage',
						'showIndexer': 'false',
						'showPages': 'false',
						'showPrevNext': 'true',
						'showThumbnails': 'true',
						'useLightbox': false,
						'useStyleClass': 'true',
						'visible': true,
						'width': 300
					},
					'properties': [
						'alignment',
						'aspectRatio',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'documentRatio',
						'documentTitle',
						'documentUrl',
						'images',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'scaling',
						'showIndexer',
						'showPages',
						'showPrevNext',
						'showThumbnails',
						'styleClass',
						'useLightbox',
						'filePreviewShowDownload',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'asynchronousUpdateProperties': [
						'images',
						'documentRatio'
					],
					'transientProperties': [
						'openFilePicker'
					],
					'fileReferenceProperties': [{
						'propName': 'documentUrl',
						'propType': 'string'
					}],
					'instanceProperties': [
						'images',
						'documentRatio',
						'documentTitle',
						'visible',
						'visibleOnMobile'
					],
					'supportedFileExtensions': [
						'doc',
						'docx',
						'xls',
						'xlsx',
						'ppt',
						'pptx',
						'txt',
						'rtf',
						'ps',
						'eps',
						'pdf',
						'pages'
					]
				}
			},
			'scs-title': {
				'config': {
					'displayName': 'COMP_CONFIG_TITLE_DISPLAY_NAME',
					'description': 'COMP_CONFIG_TITLE_DESCRIPTION',
					'icon': 'title.svg',
					'seedData': {},
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'fontColor': '#333333',
						'fontFamily': '\'Helvetica Neue\', Helvetica, Arial, sans-serif',
						'fontSize': 24,
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'useStyleClass': 'true',
						'visible': true,
						'width': 400
					},
					'properties': [
						'alignment',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'fontColor',
						'fontFamily',
						'fontSize',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'placeholderText',
						'renderOnAccess',
						'styleClass',
						'styleClassName',
						'styleClassTag',
						'toolbarGroups',
						'useStyleClass',
						'userText',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'instanceProperties': [
						'placeholderText',
						'toolbarGroups',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'userText',
						'propType': 'richText',
						'propDisplayName': 'COMP_TITLE_USER_TEXT'
					}],
					'fileReferenceProperties': [{
						'propName': 'userText',
						'propType': 'richText'
					}],
					'transientProperties': [
						'openFilePicker',
						'linkPickerData'
					],
					'triggers': [{
						'triggerName': 'scsLinkClicked',
						'triggerDescription': 'ACTION_TRIGGER_LINK_CLICKED_DESCRIPTION',
						'triggerPayload': []
					}]
				}
			},
			'scs-paragraph': {
				'config': {
					'displayName': 'COMP_CONFIG_PARAGRAPH_DISPLAY_NAME',
					'description': 'COMP_CONFIG_PARAGRAPH_DESCRIPTION',
					'icon': 'paragraph.svg',
					'seedData': {},
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'fontColor': '#333333',
						'fontFamily': '\'Helvetica Neue\', Helvetica, Arial, sans-serif',
						'fontSize': 16,
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'useStyleClass': 'true',
						'visible': true,
						'width': 400
					},
					'properties': [
						'alignment',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'fontColor',
						'fontFamily',
						'fontSize',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'placeholderText',
						'renderOnAccess',
						'styleClass',
						'styleClassName',
						'styleClassTag',
						'toolbarGroups',
						'useStyleClass',
						'userText',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'instanceProperties': [
						'placeholderText',
						'toolbarGroups',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'userText',
						'propType': 'richText',
						'propDisplayName': 'COMP_PARAGRAPH_USER_TEXT'
					}],
					'fileReferenceProperties': [{
						'propName': 'userText',
						'propType': 'richText'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'transientProperties': [
						'openFilePicker',
						'linkPickerData'
					],
					'triggers': [{
						'triggerName': 'scsLinkClicked',
						'triggerDescription': 'ACTION_TRIGGER_LINK_CLICKED_DESCRIPTION',
						'triggerPayload': []
					}]
				}
			},
			'scs-divider': {
				'config': {
					'displayName': 'COMP_CONFIG_DIVIDER_DISPLAY_NAME',
					'description': 'COMP_CONFIG_DIVIDER_DESCRIPTION',
					'icon': 'divider_h.svg',
					'defaultValues': {
						'dividerColor': '#d3d3d3',
						'dividerRadius': 0,
						'dividerStyle': 'solid',
						'height': 1,
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'dividerColor',
						'dividerRadius',
						'dividerStyle',
						'height',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					]
				}
			},
			'scs-button': {
				'config': {
					'displayName': 'COMP_CONFIG_BUTTON_DISPLAY_NAME',
					'description': 'COMP_CONFIG_BUTTON_DESCRIPTION',
					'icon': 'button.svg',
					'defaultValues': {
						'actions': [],
						'alignment': 'left',
						'backgroundColor': '#DDDDDD',
						'backgroundColorHover': '#EEEEEE',
						'borderColor': '#808080',
						'borderColorHover': '#2222DD',
						'borderRadius': 0,
						'borderStyle': 'solid',
						'borderWidth': 1,
						'fontColor': '#000000',
						'fontColorHover': '#2222DD',
						'fontFamily': '\'Helvetica Neue\', Helvetica, Arial, sans-serif',
						'fontSize': 14,
						'height': 0,
						'linkType': 'scs-link-no-link',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'target': '_self',
						'useStyleClass': 'true',
						'visible': true,
						'width': 0
					},
					'properties': [
						'actions',
						'alignment',
						'backgroundColor',
						'backgroundColorHover',
						'borderColor',
						'borderColorHover',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'fontColor',
						'fontColorHover',
						'fontFamily',
						'fontSize',
						'height',
						'href',
						'hrefContentViewing',
						'hrefName',
						'isCobrowse',
						'linkType',
						'linkRendition',
						'filePreviewShowDownload',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'styleClass',
						'styleClassName',
						'target',
						'text',
						'title',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'instanceProperties': [
						'actions',
						'linkType',
						'target',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
							'propName': 'href',
							'propType': 'link',
							'propDisplayName': 'COMP_BUTTON_HREF'
						},
						{
							'propName': 'hrefContentViewing',
							'propType': 'link',
							'propDisplayName': 'COMP_BUTTON_HREF'
						},
						{
							'propName': 'hrefName',
							'propType': 'link',
							'propDisplayName': 'COMP_BUTTON_HREF'
						},
						{
							'propName': 'text',
							'propType': 'string',
							'propDisplayName': 'COMP_BUTTON_TEXT'
						},
						{
							'propName': 'title',
							'propType': 'string',
							'propDisplayName': 'COMP_BUTTON_TITLE'
						}
					],
					'fileReferenceProperties': [{
						'propName': 'href',
						'propType': 'string'
					}],
					'triggers': [{
						'triggerName': 'scsLinkClicked',
						'triggerDescription': 'ACTION_TRIGGER_LINK_CLICKED_DESCRIPTION',
						'triggerPayload': []
					}]
				}
			},
			'scs-app': {
				'config': {
					'displayName': 'COMP_CONFIG_APP_DISPLAY_NAME',
					'description': 'COMP_CONFIG_APP_DESCRIPTION',
					'icon': 'app.svg',
					'seedData': {},
					'defaultValues': {
						'actions': [],
						'alignment': 'fill',
						'autoHeight': true,
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'customRenderComplete': false,
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'seeded': false,
						'useStyleClass': 'true',
						'visible': true,
						'linkType': 'scs-link-action',
						'width': 400
					},
					'properties': [
						'actions',
						'alignment',
						'appGUID', //assigned during app registration ( builder or marketplace)
						'appName',
						'appSrc',
						'appType',
						'assets',
						'autoHeight',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'cloudService',
						'compSettingsId',
						'company',
						'customRenderComplete',
						'customSettingsData',
						'componentConfig', // json blob of component registration data
						'description',
						'height',
						'instance', //runtime mode token is saved in page model
						'linkType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'seeded', // is this a seeded app
						'settingsHeight',
						'settingsSrc',
						'settingsWidth',
						'styleClass',
						'styleClassName',
						'supportEmail',
						'supportPhone',
						'supportUrl',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'asynchronousUpdateProperties': [
						'appSrc',
						'assets',
						'settingsSrc',
						'settingsWidth',
						'settingsHeight',
						'compSettingsId',
						'instance',
						'autoHeight',
						'description',
						'componentConfig'
					],
					'transientProperties': [
						'componentCatalogName',
						'editingSessionToken',
						'heightBuffer',
						'widthBuffer'
					],
					'instanceProperties': [
						'actions',
						'appGUID',
						'appName',
						'appType',
						'company',
						'componentConfig',
						'instance',
						'linkType',
						'seeded',
						'styleClassName',
						'supportEmail',
						'supportPhone',
						'supportUrl',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'customSettingsData',
						'propType': 'object',
						'propDisplayName': 'COMP_APP_CUSTOM_SETTINGS'
					}],
					'triggers': [{
						'triggerName': 'scsLinkClicked',
						'triggerDescription': 'ACTION_TRIGGER_LINK_CLICKED_DESCRIPTION',
						'triggerPayload': []
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'fileReferenceProperties': [{
						'propName': 'assets',
						'propType': 'array'
					}]
				}
			},
			'scs-component': {
				'config': {
					'displayName': 'COMP_CONFIG_COMPONENT_DISPLAY_NAME',
					'description': 'COMP_CONFIG_COMPONENT_DESCRIPTION',
					'icon': '',
					'seedData': {},
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'componentConfig': '', // !!important indicates whether read is required from themes
						'contentPlaceholder': false,
						'contentTypes': [],
						'customRenderComplete': false,
						'initialized': false,
						'isCaaSLayout': false,
						'isCaaSLayoutDefined': true,
						'linkType': 'scs-link-action',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'nestedComponents': [],
						'seeded': true,
						'useStyleClass': 'true',
						'targetedChannels': [],
						'validComponentImplementation': true,
						'visible': true,
						'visibleNestedComponents': [],
						'width': 0
					},
					'properties': [
						'actions',
						'alignment',
						'assets',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'componentId', // Identifier for for theme-based components
						'componentName', // Identifier for component catalog components
						'componentFactory',
						'componentLayout',
						'contentId',
						'contentLayoutCategory',
						'contentPlaceholder',
						'contentTypes',
						'contentViewing',
						'customRenderComplete',
						'customSettingsData',
						'componentConfig', // json blob of custom component registration data
						'description',
						'detailPageId',
						'height',
						'initialized', // component initialized
						'isCaaSLayout',
						'linkType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'nestedComponents',
						'renderOnAccess',
						'styleClass',
						'styleClassName',
						'seeded', // is this a seeded custom comp
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'visibleNestedComponents',
						'width'
					],
					'asynchronousUpdateProperties': [
						'assets',
						'description',
						'linkType',
						'nestedComponents',
						'visibleNestedComponents',
						'initialized',
						'componentConfig'
					],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'transientProperties': [
						'accessToken',
						'componentCatalogName',
						'contentItemCache',
						'contentItemDescription',
						'contentItemUpdatedDate',
						'contentItemUpdatedBy',
						'handlePickerSelectedinEdit',
						'isCaaSLayoutDefined',
						'openFilePicker',
						'targetedChannels',
						'validComponentImplementation'
					],
					'instanceProperties': [
						'actions',
						'componentId',
						'componentName',
						'componentFactory',
						'componentConfig',
						'contentId',
						'contentPlaceholder',
						'contentTypes',
						'contentViewing',
						'detailPageId',
						'linkType',
						'nestedComponents',
						'seeded',
						'styleClassName',
						'visible',
						'visibleOnMobile',
						'visibleNestedComponents'
					],
					'caasProperties': [
						'contentId',
						'contentLayoutCategory',
						'contentPlaceholder',
						'contentTypes',
						'contentViewing',
						'detailPageId'
					],
					'dataProperties': [{
						'propName': 'customSettingsData',
						'propType': 'object',
						'propDisplayName': 'COMP_COMPONENT_CUSTOM_SETTINGS'
					}],
					'fileReferenceProperties': [{
						'propName': 'assets',
						'propType': 'array'
					}],
					'supportedDataFlavors': [
						'contentitem'
					]
				}
			},
			'scs-spacer': {
				'config': {
					'displayName': 'COMP_CONFIG_SPACER_DISPLAY_NAME',
					'description': 'COMP_CONFIG_SPACER_DESCRIPTION',
					'icon': 'spacer_v.svg',
					'defaultValues': {
						'height': 50,
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'height',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					]
				}
			},
			'scs-youtube': {
				'config': {
					'displayName': 'COMP_CONFIG_YOUTUBE_DISPLAY_NAME',
					'description': 'COMP_CONFIG_YOUTUBE_DESCRIPTION',
					'icon': 'YouTube.svg',
					'defaultValues': {
						'alignment': 'fill',
						'aspectRatio': 'auto',
						'autoplay': 'false',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'controls': 'true',
						'loop': 'false',
						'marginBottom': 0,
						'marginLeft': 0,
						'marginRight': 0,
						'marginTop': 0,
						'showinfo': 'true',
						'useStyleClass': 'true',
						'visible': true,
						'width': 560
					},
					'properties': [
						'alignment',
						'aspectRatio',
						'autoplay',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'controls',
						'loop',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'showinfo',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width',
						'youtubeUrl'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'youtubeUrl',
						'propType': 'string',
						'propDisplayName': 'COMP_YOUTUBE_URL'
					}]
				}
			},
			'scs-gallery': {
				'config': {
					'displayName': 'COMP_CONFIG_GALLERY_DISPLAY_NAME',
					'description': 'COMP_CONFIG_GALLERY_DESCRIPTION',
					'icon': 'gallery-s.svg',
					'defaultValues': {
						'alignment': 'fill',
						'autoPlay': 'false',
						'backgroundColor': '#444444',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'displayTime': 3,
						'images': [],
						'marginBottom': 0,
						'marginLeft': 0,
						'marginRight': 0,
						'marginTop': 0,
						'scaling': 'crop',
						'showCaption': 'true',
						'showIndexer': 'true',
						'showPrevNext': 'true',
						'showThumbnails': 'false',
						'transitionTime': 0.5,
						'useLightbox': false,
						'useStyleClass': 'true',
						'visible': true,
						'width': 300
					},
					'properties': [
						'alignment',
						'autoPlay',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'displayTime',
						'images',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'scaling',
						'showCaption',
						'showIndexer',
						'showPrevNext',
						'showThumbnails',
						'styleClass',
						'transitionTime',
						'useLightbox',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'openFilePicker',
						'handlePickerSelectedinEdit'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'images',
						'propType': 'object',
						'propDisplayName': 'COMP_GALLERY_IMAGES'
					}],
					'fileReferenceProperties': [{
						'propName': 'images',
						'propType': 'array'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'supportedDataFlavors': [
						'images/jpg',
						'images/png',
						'images/svg',
						'images/gif'
					]
				}
			},
			'scs-gallerygrid': {
				'config': {
					'displayName': 'COMP_CONFIG_GALLERYGRID_DISPLAY_NAME',
					'description': 'COMP_CONFIG_GALLERYGRID_DESCRIPTION',
					'icon': 'gallery.svg',
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'columns': 3,
						'imageHeight': 300,
						'imageRatio': '1:1',
						'images': [],
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'responsive': false,
						'scaling': 'crop',
						'layout': 'columns',
						'useLightbox': false,
						'useStyleClass': 'true',
						'imageSpacing': 5,
						'imageWidth': 300,
						'visible': true,
						'width': 300
					},
					'properties': [
						'alignment',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'columns',
						'imageHeight',
						'imageRatio',
						'images',
						'imageSpacing',
						'imageWidth',
						'layout',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'responsive',
						'scaling',
						'styleClass',
						'useLightbox',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'transientProperties': [
						'openFilePicker'
					],
					'dataProperties': [{
						'propName': 'images',
						'propType': 'object',
						'propDisplayName': 'COMP_GALLERYGRID_IMAGES'
					}],
					'fileReferenceProperties': [{
						'propName': 'images',
						'propType': 'array'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'supportedDataFlavors': [
						'images/jpg',
						'images/png',
						'images/svg',
						'images/gif'
					]
				}
			},
			'scs-socialbar': {
				'config': {
					'displayName': 'COMP_CONFIG_SOCIALBAR_DISPLAY_NAME',
					'description': 'COMP_CONFIG_SOCIALBAR_DESCRIPTION',
					'icon': 'share.svg',
					'defaultValues': {
						'alignment': 'right',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'iconSize': 24,
						'iconSpacing': 5,
						'images': [{
								'id': 'icon320382885',
								'name': 'COMP_ICON_FACEBOOK',
								'class': 'scs-facebook-icon',
								'title': '',
								'altText': ''
							},
							{
								'id': 'icon131811662',
								'name': 'COMP_ICON_LINKEDIN',
								'class': 'scs-linkedin-icon',
								'title': '',
								'altText': ''
							},
							{
								'id': 'icon486530998',
								'name': 'COMP_ICON_TWITTER',
								'class': 'scs-twitter-icon',
								'title': '',
								'altText': ''
							},
							{
								'id': 'icon263767943',
								'name': 'COMP_ICON_GOOGLEPLUS',
								'class': 'scs-googleplus-icon',
								'title': '',
								'altText': ''
							},
							{
								'id': 'icon737027322',
								'name': 'COMP_ICON_YOUTUBE',
								'class': 'scs-youtube-icon',
								'title': '',
								'altText': ''
							}
						],
						'layout': 'horizontal',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'alignment',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'iconSize',
						'iconSpacing',
						'images',
						'layout',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'images',
						'propType': 'object',
						'propDisplayName': 'COMP_SOCIALBAR_IMAGES'
					}],
					'fileReferenceProperties': [{
						'propName': 'images',
						'propType': 'array'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'supportedDataFlavors': [
						'images/jpg',
						'images/png',
						'images/svg',
						'images/gif'
					]
				}
			},
			'scs-slot': {
				'config': {
					'displayName': 'COMP_CONFIG_SLOT_DISPLAY_NAME',
					'description': 'COMP_CONFIG_SLOT_DESCRIPTION',
					'icon': 'gallery-s.svg',
					'defaultValues': {
						'backgroundAttachment': 'scroll',
						'backgroundPosition': 'left top',
						'backgroundRepeat': 'no-repeat',
						'backgroundSize': 'auto',
						'visible': true
					},
					'properties': [
						'backgroundAttachment',
						'backgroundColor',
						'backgroundImage',
						'backgroundPosition',
						'backgroundRepeat',
						'backgroundSize',
						'slotScope',
						'visible',
						'visibleOnMobile'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'fileReferenceProperties': [{
						'propName': 'backgroundImage',
						'propType': 'string'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					]
				}
			},
			'scs-componentgroup': {
				'config': {
					'displayName': 'COMP_CONFIG_COMPONENTGROUP_DISPLAY_NAME',
					'description': 'COMP_CONFIG_COMPONENTGROUP_DESCRIPTION',
					'icon': 'componentgroup.svg',
					'defaultValues': {
						'visible': true,
						'backgroundAttachment': 'scroll',
						'backgroundPosition': 'left top',
						'backgroundRepeat': 'no-repeat',
						'backgroundSize': 'auto',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'useStyleClass': 'true'
					},
					'properties': [
						'visible',
						'visibleOnMobile',
						'backgroundAttachment',
						'backgroundColor',
						'backgroundImage',
						'backgroundPosition',
						'backgroundRepeat',
						'backgroundSize',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'styleClass',
						'useStyleClass'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile'
					],
					'fileReferenceProperties': [{
						'propName': 'backgroundImage',
						'propType': 'string'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					]
				}
			},
			'scs-sectionlayout': {
				'config': {
					'displayName': 'COMP_CONFIG_SECTIONLAYOUT_DISPLAY_NAME',
					'description': 'COMP_CONFIG_SECTIONLAYOUT_DESCRIPTION',
					'icon': 'sectionlayout.svg',
					'defaultValues': {
						'backgroundAttachment': 'scroll',
						'backgroundPosition': 'left top',
						'backgroundRepeat': 'no-repeat',
						'backgroundSize': 'auto',
						'borderColor': '#808080',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'nestedComponents': [],
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'backgroundAttachment',
						'backgroundColor',
						'backgroundImage',
						'backgroundPosition',
						'backgroundRepeat',
						'backgroundSize',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'componentFactory',
						'customSettingsData',
						'nestedComponents',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile'
					],
					'instanceProperties': [
						'nestedComponents',
						'componentFactory',

						'visible',
						'visibleOnMobile'
					],
					'asynchronousUpdateProperties': [
						'nestedComponents'
					],
					'dataProperties': [{
						'propName': 'customSettingsData',
						'propType': 'object',
						'propDisplayName': 'COMP_COMPONENT_CUSTOM_SETTINGS'
					}],
					'fileReferenceProperties': [{
						'propName': 'backgroundImage',
						'propType': 'string'
					}],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					]
				}
			},
			'scs-video': {
				'config': {
					'displayName': 'COMP_CONFIG_VIDEO_DISPLAY_NAME',
					'description': 'COMP_CONFIG_VIDEO_DESCRIPTION',
					'icon': 'video.svg',
					'defaultValues': {
						'alignment': 'fill',
						'autoplay': 'false',
						'borderColor': 'black',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'controls': 'true',
						'loop': 'false',
						'marginBottom': 0,
						'marginLeft': 0,
						'marginRight': 0,
						'marginTop': 0,
						'muted': 'false',
						'useStyleClass': 'true',
						'visible': true,
						'width': 320
					},
					'properties': [
						'alignment',
						'autoplay',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'controls',
						'posterName',
						'posterUrl',
						'loop',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'muted',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'videoName',
						'videoUrl',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'openFilePicker'
					],
					'instanceProperties': [
						'posterName',
						'videoName',
						'visible',
						'visibleOnMobile'
					],
					'dataProperties': [{
						'propName': 'videoUrl',
						'propType': 'video',
						'propDisplayName': 'COMP_VIDEO_URL'
					}],
					'fileReferenceProperties': [{
							'propName': 'videoUrl',
							'propType': 'string'
						},
						{
							'propName': 'posterUrl',
							'propType': 'string'
						}
					],
					'supportedFileExtensions': [
						'mp4'
					]
				}
			},
			'scs-inline-text': {
				'config': {
					'displayName': 'COMP_CONFIG_INLINE_TEXT_DISPLAY_NAME',
					'description': 'COMP_CONFIG_INLINE_TEXT_DESCRIPTION',
					'icon': '',
					'seedData': {},
					'defaultValues': {
						'innerHTML': null
					},
					'properties': [
						'innerHTML'
					],
					'dataProperties': [{
						'propName': 'innerHTML',
						'propType': 'richText',
						'propDisplayName': 'COMP_INLINE_TEXT_HTML'
					}],
					'transientProperties': [
						'openFilePicker',
						'linkPickerData'
					],
					'fileReferenceProperties': [{
						'propName': 'innerHTML',
						'propType': 'richText'
					}],
					'triggers': []
				}
			},
			'scs-inline-image': {
				'config': {
					'displayName': 'COMP_CONFIG_INLINE_IMAGE_DISPLAY_NAME',
					'description': 'COMP_CONFIG_INLINE_IMAGE_DESCRIPTION',
					'icon': '',
					'seedData': {},
					'defaultValues': {
						'attr_src': null,
						'attr_alt': null,
						'attr_title': null
					},
					'properties': [
						'attr_src',
						'attr_alt',
						'attr_title',
						'imageName',
						'rendition'
					],
					'transientProperties': [
						'originalAttributes',
						'hasPublishedVersion',
						'openFilePicker'
					],
					'supportedFileExtensions': [
						'gif',
						'jpg',
						'png',
						'jpeg',
						'svg'
					],
					'fileReferenceProperties': [{
						'propName': 'attr_src',
						'propType': 'string'
					}],
					'triggers': []
				}
			},
			'scs-contentlist': {
				'config': {
					'displayName': 'COMP_CONFIG_CONTENTLIST_DISPLAY_NAME',
					'description': 'COMP_CONFIG_CONTENTLIST_DESCRIPTION',
					'icon': 'content-list.svg',
					'defaultValues': {
						'additionalItems': 2,
						'alignment': 'fill',
						'appendOffset': 0,
						'autoRefreshOnSearch': true,
						'borderColor': 'black',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'contentTypes': [],
						'dateFilter': 'all',
						'dateFilterNumber': 1,
						'dateFilterNumber2': 1,
						'dateFilterUnits': 'days',
						'emptyListLayoutCategory': 'None',
						'firstItem': 0,
						'fontColor': '#333333',
						'fontFamily': '\'Helvetica Neue\', Helvetica, Arial, sans-serif',
						'fontSize': 13,
						'lazyLoadClickText': 'Load More...',
						'linkType': 'scs-link-action',
						'loadType': 'none',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'maxResults': 10,
						'offset': 0,
						'paginationAlignment': 'center',
						'showFirstLast': 'false',
						'showPageNumbers': 'true',
						'showPagination': 'false',
						'showPrevNext': 'true',
						'sortOrder': 'nameasc',
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'actions',
						'additionalItems',
						'alignment',
						'autoRefreshOnSearch',
						'backgroundColor',
						'backgroundColorHover',
						'borderColor',
						'borderColorHover',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'contentTypes',
						'customSettingsData',
						'dateFilter',
						'dateFilterBegin',
						'dateFilterEnd',
						'dateFilterNumber',
						'dateFilterNumber2',
						'dateFilterUnits',
						'detailPageId',
						'emptyListLayoutCategory',
						'firstItem',
						'firstLabel',
						'fontColor',
						'fontColorHover',
						'fontFamily',
						'fontSize',
						'language',
						'lastLabel',
						'layoutCategory',
						'lazyLoadClickText',
						'linkType',
						'loadType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'maxResults',
						'nextLabel',
						'paginationAlignment',
						'prevLabel',
						'queryString',
						'renderOnAccess',
						'sectionLayout',
						'sectionLayoutInstanceId',
						'showFirstLast',
						'showPageNumbers',
						'showPagination',
						'showPrevNext',
						'sortOrder',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'appendOffset',
						'offset',
						'totalResults',
						'search',
						'sectionLayoutData',
						'where'
					],
					'instanceProperties': [
						'contentTypes',
						'detailPageId',
						'sectionLayout',
						'sectionLayoutInstanceId',
						'visible',
						'visibleOnMobile'
					],
					'actionModifiableProperties': [
						'additionalItems',
						'dateFilter',
						'dateFilterBegin',
						'dateFilterEnd',
						'dateFilterNumber',
						'dateFilterNumber2',
						'dateFilterUnits',
						'layoutCategory',
						'maxResults',
						'queryString',
						'search',
						'sortOrder',
						'where'
					]
				}
			},
			'scs-recommendation': {
				'config': {
					'displayName': 'COMP_CONFIG_RECOMMENDATION_DISPLAY_NAME',
					'description': 'COMP_CONFIG_RECOMMENDATION_DESCRIPTION',
					'icon': 'recommendation.svg',
					'defaultValues': {
						'additionalItems': 2,
						'alignment': 'fill',
						'appendOffset': 0,
						'borderColor': 'black',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'emptyListLayoutCategory': 'None',
						'firstItem': 0,
						'fontColor': '#333333',
						'fontFamily': '\'Helvetica Neue\', Helvetica, Arial, sans-serif',
						'fontSize': 13,
						'lazyLoadClickText': 'Load More...',
						'linkType': 'scs-link-action',
						'loadType': 'none',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'maxResults': 10,
						'offset': 0,
						'paginationAlignment': 'center',
						'recommendationAttrs': {},
						'showFirstLast': 'false',
						'showPageNumbers': 'true',
						'showPagination': 'false',
						'showPrevNext': 'true',
						'useStyleClass': 'true',
						'visible': true
					},
					'properties': [
						'actions',
						'additionalItems',
						'alignment',
						'backgroundColor',
						'backgroundColorHover',
						'borderColor',
						'borderColorHover',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'customSettingsData',
						'detailPageId',
						'emptyListLayoutCategory',
						'firstItem',
						'firstLabel',
						'fontColor',
						'fontColorHover',
						'fontFamily',
						'fontSize',
						'lastLabel',
						'layoutCategory',
						'lazyLoadClickText',
						'linkType',
						'loadType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'maxResults',
						'nextLabel',
						'paginationAlignment',
						'prevLabel',
						'recommendationId',
						'recommendationAttrs',
						'renderOnAccess',
						'sectionLayout',
						'sectionLayoutInstanceId',
						'showFirstLast',
						'showPageNumbers',
						'showPagination',
						'showPrevNext',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'appendOffset',
						'contentTypes',
						'offset',
						'totalResults',
						'sectionLayoutData'
					],
					'instanceProperties': [
						'detailPageId',
						'sectionLayout',
						'sectionLayoutInstanceId',
						'visible',
						'visibleOnMobile'
					],
					'actionModifiableProperties': [
						'additionalItems',
						'layoutCategory',
						'maxResults'
					]
				}
			},
			'scs-contentsearch': {
				'config': {
					'displayName': 'COMP_CONFIG_CONTENTSEARCH_DISPLAY_NAME',
					'description': 'COMP_CONFIG_CONTENTSEARCH_DESCRIPTION',
					'icon': 'content-search.svg',
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': 'black',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'contentTypes': [],
						'fontSize': 16,
						'linkType': 'scs-link-action',
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'placeholderText': 'CAAS_CONTENT_SEARCH',
						'showSearchIcon': true,
						'target': '_self',
						'useStyleClass': 'true',
						'visible': true,
						'width': 0
					},
					'properties': [
						'actions',
						'alignment',
						'backgroundColor',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'contentTypes',
						'fontColor',
						'fontFamily',
						'fontSize',
						'href',
						'linkType',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'placeholderText',
						'renderOnAccess',
						'showSearchIcon',
						'styleClass',
						'target',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width'
					],
					'transientProperties': [
						'queryString'
					],
					'instanceProperties': [
						'contentTypes',
						'href',
						'linkType',
						'target',
						'visible',
						'visibleOnMobile'
					]
				}
			},
			'scs-opainterview': {
				'config': {
					'displayName': 'COMP_CONFIG_OPAINTERVIEW_DISPLAY_NAME',
					'description': 'COMP_CONFIG_OPAINTERVIEW_DESCRIPTION',
					'icon': 'opa-interview.svg',
					'defaultValues': {
						'alignment': 'fill',
						'borderColor': 'black',
						'borderRadius': 0,
						'borderStyle': 'none',
						'borderWidth': 1,
						'marginBottom': 5,
						'marginLeft': 5,
						'marginRight': 5,
						'marginTop': 5,
						'useStyleClass': 'true',
						'visible': true,
						'renderType': 'embed',
						'width': 0
					},
					'properties': [
						'alignment',
						'borderColor',
						'borderRadius',
						'borderStyle',
						'borderWidth',
						'marginBottom',
						'marginLeft',
						'marginRight',
						'marginTop',
						'renderOnAccess',
						'styleClass',
						'useStyleClass',
						'visible',
						'visibleOnMobile',
						'width',
						'renderType',
						'interviewName'
					],
					'instanceProperties': [
						'visible',
						'visibleOnMobile',
						'renderType',
						'interviewName'
					],
					'dataProperties': [{
							'propName': 'renderType',
							'propType': 'string',
							'propDisplayName': 'COMP_OPA_INTERVIEW_RENDER_TYPE'
						},
						{
							'propName': 'interviewName',
							'propType': 'string',
							'propDisplayName': 'COMP_OPA_INTERVIEW_NAME'
						}
					]
				}
			}
		}
	};
	return exports['component-registration'];
}));
