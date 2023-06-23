/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */

var serverUtils = require('./serverUtils');

// define the default value for featureFlags known in the toolkit
// NOTE: also update the knownFeatureFlags value in gemini/js/core/util/FeatureFlags.js file to allow setting in the server
var knownFeatureFlags = {
	'scs.toolkit.useFetchInContentSDK': true
};

var featureFlags = knownFeatureFlags;
var featureFlagsPromise;
var featureFlagsInitialized = false;

var getFeatureFlags = function (server) {
	featureFlagsPromise = featureFlagsPromise || new Promise(function (resolve, reject) {
		// get the tenant config information
		serverUtils.getScsTenantConfig(server).then(function (config) {
			// extract the feature flags
			try {
				var serverFeatureFlags = JSON.parse(config && config.featureFlags || "{}");
				featureFlags = { ...knownFeatureFlags, ...serverFeatureFlags};
			} catch (e) {
				console.log('featureFlags.getFeatureFlags: failed to parse tenant config feature flags');
			}

			featureFlagsInitialized = true;
			return resolve(featureFlags);
		});
	});

	return featureFlagsPromise;
}

var checkFeatureFlag = function (server, featureFlag) {
	return getFeatureFlags(server).then(function () {
		return Promise.resolve(featureFlags[featureFlag]);
	});
};

var checkFeatureFlagSync = function (featureFlag) {
	if (featureFlagsInitialized) {
		return featureFlags[featureFlag];
	} else {
		throw new Error('featureFlags.checkFeatureFlagSync: Feature flags not initialized.');
	}
};

module.exports = {
	getFeatureFlags: getFeatureFlags,
	checkFeatureFlag: checkFeatureFlag,
	checkFeatureFlagSync: checkFeatureFlagSync
}
