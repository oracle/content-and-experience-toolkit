/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* globals app, module, __dirname */
/* jshint esversion: 6 */

/**
 * Manage persistence of the job during the jobs lifecycle. <br/>
 * This module is responsible for saving the state of the job and managing the state during startup/shutdown & failover. <br/>
 * <ul>
 *   <li>Specifically, it needs to: 
 *     <ul>
 *       <li>Keep track of all the jobs.</li>
 *       <li>For each job: 
 *         <ul>
 *           <li>Store metadata about the job and mapping it to the project in the Language Service Provider.</li>
 *           <li>Store/Unpack the zip file provided by the OCE translation job.</li>
 *           <li>Store metadata about each file in the zip mapping the file to the entry in the Language Service Provider.</li>
 *           <li>Store all the translations for each of the files as they become available.</li>
 *           <li>Create a final zip of all the translated files in the format required for ingestion into the OCE translation jobs.</li>
 *           <li>On job delete, remove all artifacts associated with the job.</li>
 *         </ul>
 *       </li>
 *     </ul>
 *   </li>
 * </ul>
 * @constructor
 * @alias PersistenceStoreInterface
 */
var PersistenceStoreInterface = function () {};

PersistenceStoreInterface.prototype = {
    /**
     * Get all the jobs currently tracked by the {@link PersistenceApi}<br/>
     * @returns {Promise.<SampleJobManager.JobConfig[]>} A Promise that returns an array of the metadata for each of the translation jobs. 
     */

    getAllJobs: function () {
        return Promise.reject('PersistenceStoreInterface.getAllJobs(): not implemented');
    },

    //
    // Job CRUD
    // 
    /**
     * Create a translation job<br/>
     * Create an entry for this translation job in the persistence store. 
     * @param {object} args JavaScript object containing the "createJob" parameters. 
     * @param {string} args.jobName Name of the OCE translation job.
     * @param {string} args.workflowId Language Service Provider workflow identifier to use to translate this job. 
     * @param {string} args.authToken Language Service Provider Authorization header to use to communicate with the LSP. 
     * @returns {Promise.<SampleJobManager.JobConfig>} The metadata created and stored for this job. 
     */
    createJob: function (args) {
        return Promise.reject('PersistenceStoreInterface.createJob(): not implemented');
    },
    /**
     * Get a translation job.<br/>
     * Retrieve the job metadata from the persistence store for this job. 
     * @param {object} args JavaScript object containing the "getJob" parameters. 
     * @param {string} args.jobId Identifier for the job in the persistence store. 
     * @returns {Promise.<SampleJobManager.JobConfig>} The metadata created and stored for this job. 
     */
    getJob: function (args) {
        return Promise.reject('PersistenceStoreInterface.getJob(): not implemented');
    },
    /**
     * Update a translation job.<br/>
     * Update the translation job with new metadata about the jobs state.<br/>
     * Note: This currently supports only updating the following properties in the metadata: 
     * <ul>
     *   <li>status<li>
     *   <li>statusMessage<li>
     *   <li>translatedZipFile<li>
     *   <li>progress<li>
     * </ul>
     * @param {SampleJobManager.JobConfig} args JavaScript object containing the metadata to update for this job. 
     * @returns {Promise.<SampleJobManager.JobConfig>} The updated metadata stored for this job. 
     */
    updateJob: function (args) {
        return Promise.reject('PersistenceStoreInterface.updateJob(): not implemented');
    },
    /**
     * Delete all persistence data related to the provided job identifier. 
     * @param {object} args JavaScript object containing the "deleteJob" parameters. 
     * @param {string} args.jobId Identifier of the job to be deleted. 
     * @returns {Promise} A Promise that is resolved when the job has been deleted.
     */
    deleteJob: function (args) {
        return Promise.reject('PersistenceStoreInterface.deleteJob(): not implemented');
    },
    /**
     * Create log stream to write log entries.
     * @param {object} args Javascript object containing the getLogStream parameters.
     * @param {string} args.jobId Identifier for the job in the persistence store. 
     */
    getLogStream: function (args) {
        return Promise.reject('PersistenceStoreInterface.getLogStream(): not implemented');
    },
    /**
     * Read log file of the job.
     * @param {object} args Javascript object containing the readLog parameters.
     * @param {string} args.jobId Identifier for the job in the persistence store. 
     */
    readLog: function (args) {
        return Promise.reject('PersistenceStoreInterface.readLog(): not implemented');
    },
    /**
     * Get queue file
     * @param {object} args
     */
    getQueue: function (args) {
        return Promise.reject('PersistenceStoreInterface.getQueue(): not implemented');
    },
    /**
     * Set queue file
     * @param {object} args
     */
    setQueue: function (args) {
        return Promise.reject('PersistenceStoreInterface.setQueue(): not implemented');
    }
};

// Export the persistence store 
module.exports = {
    api: PersistenceStoreInterface,
    factory: {
        create: function (persistenceStore) {
            return require(persistenceStore || './sampleFilePersistenceStore');
        }
    }
};