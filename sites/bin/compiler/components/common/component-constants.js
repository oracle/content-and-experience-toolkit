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
(function defineComponentConstants(scope, factory) {
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
}(this, function componentConstantsFactory(exports) {
    exports.constants = {
        ACTION_EVENT_NAME: 'scsActionEvent',
        ACTION_TRIGGER_PAYLOAD_VALUE: '$payload',
        ALIGNMENT_LEFT: 'left',
        ALIGNMENT_CENTER: 'center',
        ALIGNMENT_RIGHT: 'right',
        ALIGNMENT_FILL: 'fill',
        CONTENT_LAYOUT_VARIANT_MOBILE: 'mobile',
        LINK_TYPE_WEBPAGE: 'scs-link-webpage',
        LINK_TYPE_SEARCHPAGE: 'scs-link-searchpage',
        LINK_TYPE_SITEPAGE: 'scs-link-sitepage',
        LINK_TYPE_FILE: 'scs-link-file',
        LINK_TYPE_FILE_PREVIEW: 'scs-link-file-preview',
        LINK_TYPE_CONTENT_ITEM: 'scs-link-item',
        LINK_TYPE_EMAIL: 'scs-link-email',
        LINK_TYPE_NO_LINK: 'scs-link-no-link',
        LINK_TYPE_LIGHTBOX: 'scs-link-lightbox',
        LINK_TYPE_ACTION: 'scs-link-action',
        LINK_TYPE_MAP: 'scs-link-map',
        LINK_TYPE_TEL: 'scs-link-tel',
        LINK_DIGITAL_ASSET_PREFIX: '[!--$SCS_DIGITAL_ASSET--]',
        LINK_DIGITAL_ASSET_SUFFIX: '[/!--$SCS_DIGITAL_ASSET--]',
        LINK_DIGITAL_ASSET_PUBLISHED_PREFIX: '[!--$SCS_DIGITAL_ASSET_PUBLISHED--]',
        LINK_DIGITAL_ASSET_PUBLISHED_SUFFIX: '[/!--$SCS_DIGITAL_ASSET_PUBLISHED--]',
        LINK_CONTENT_PREFIX: '[!--$SCS_CONTENT_URL--]/',
        LINK_CONTENT_MACRO_PREFIX: '[!--$SCS_CONTENT_URL--]',
        LINK_COMP_CATALOG_MACRO_PREFIX: '[!--$SCS_COMP_CATALOG_URL--]',
        LINK_THEME_PREFIX: '/_themes/[!--$SCS_THEME_NAME--]',
        LINK_DISTRIBUTION_FOLDER: '[!--$SCS_DIST_FOLDER--]',
        LINK_DISTRIBUTION_IMAGE_FOLDER: '[!--$SCS_DIST_IMG_FOLDER--]',
        LINK_PAGE_PREFIX: '[!--$SCS_PAGE--]',
        LINK_PAGE_SUFFIX: '[/!--$SCS_PAGE--]',
        LINK_CONTENT_DETAIL_PREFIX: '[!--$SCS_CONTENT_DETAIL--]',
        LINK_CONTENT_DETAIL_SUFFIX: '[/!--$SCS_CONTENT_DETAIL--]',
        LINK_VBCS_CONNECTION_URL: '[!--$SCS_VBCS_CONNECTION_URL--]',
        MAP_TYPE_ROADMAP: 'roadmap',
        MAP_TYPE_TERRAIN: 'terrain',
        MAP_TYPE_SATELLITE: 'satellite',
        MAP_TYPE_HYBRID: 'hybrid',
        MAP_PROVIDER_ORACLE: 'oracle',
        MAP_PROVIDER_GOOGLE: 'google',
        MAP_BASE_URL: '//elocation.oracle.com/mapviewer/',
        MAP_ELOCATION_URL: '//elocation.oracle.com/elocation',
        MAP_IMAGE_URL: '//elocation.oracle.com/elocation/ajax/images/',
        MAP_TILE_SOURCE: 'elocation_mercator.world_map',
        MAP_COPYRIGHT: 'Copyright &copy; 2015 Oracle, &copy; 2015 Nokia',
        APP_DEFAULT_HEIGHT: 300,
        SETTINGS_STORAGE_LIMIT: 1500
    };
    return exports.constants;
}));