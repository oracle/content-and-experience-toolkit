#!/bin/bash
#set -x

# setup compile script names
SEEDED_COMPILE_SCRIPT="seeded_compile_site.sh"
SITE_COMPILE_SCRIPT="compile_site.sh"
JOB_ID="job${RANDOM}"

# default the compile script to use the seeded version
COMPILE_SCRIPT=${SEEDED_COMPILE_SCRIPT}

# set default timeout at 2 hours
#TIMEOUT=7200

# assumes proxy is not necessary
unset http_proxy
unset https_proxy
unset no_proxy
unset HTTP_PROXY
unset HTTPS_PROXY
unset NO_PROXY

if [[ $# -eq 0 ]]
then
  echo "usage: cec-compile-site"
  echo " -s --siteName siteName"
  echo " -r --server registered server"
  echo " -f --folder cec install folder"
  echo " -j --jobId jobId"
  echo " -h --timeout"
  echo " "
  echo "example: "
  echo " cec-compile-site -s starterSite -r sampleServer -f `pwd`"
  echo " "
  exit 1
fi

# Extract command line arguments
while [[ $# -gt 0 ]]
do
key="$1"

POSITIONAL=()
case $key in
    -s|--siteName)
    SITE_NAME="$2"
    shift # past argument
    shift # past value
    ;;
    -r|--server)
    REGISTERED_SERVER="$2"
    shift # past argument
    shift # past value
    ;;
    -f|--folder)
    CEC_INSTALL_FOLDER="$2"
    shift # past argument
    shift # past value
    ;;
    -j|--jobId)
    JOB_ID="$2"
    shift # past argument
    shift # past value
    ;;
    -h|--timeout)
    TIMEOUT="$2"
    shift # past argument
    shift # past value
    ;;
    --default)
    DEFAULT=YES
    shift # past argument
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done

VALID=0
if [ -z "$SITE_NAME" ]
then
  echo "Required parameter: -s --siteName siteName"
  VALID=1
fi
if [ -z "$REGISTERED_SERVER" ]
then
  echo "Required parameter: -r --server registeredServer"
  VALID=1
fi
if [ -z "$CEC_INSTALL_FOLDER" ]
then
  echo "Required parameter: -f --folder cecInstallFolder"
  VALID=1
fi

if [ $VALID -eq 1 ]
then
  exit 1
fi

echo "SITE_NAME: ${SITE_NAME}"
echo "REGISTERED_SERVER: ${REGISTERED_SERVER}"
echo "TIMEOUT: ${TIMEOUT}"

# navigate to the cec install folder for the cec user
echo "Navigating to the cec install folder: ${CEC_INSTALL_FOLDER}"
cd ${CEC_INSTALL_FOLDER}


# name and initialize the log file
LOG_FILE="./${SITE_NAME}-compilation.log"
echo "Log File: ${LOG_FILE}"
COMPILE_LOG_FILE="./${SITE_NAME}-compilation-compile.log"
echo "Start Time: "`date -u +"%Y-%m-%dT%H:%M:%SZ"` | tee ${LOG_FILE}

echo "Current folder: $(pwd)" | tee -a ${LOG_FILE}
echo "CEC TOOLKIT VERSION: $(cec --version)" | tee -a ${LOG_FILE}


# Check if compile_site.sh exists for the site
echo "cec download-file site:${SITE_NAME}/${SITE_COMPILE_SCRIPT} -s ${REGISTERED_SERVER} -f . >> ${LOG_FILE}"
cec download-file site:${SITE_NAME}/${SITE_COMPILE_SCRIPT} -s ${REGISTERED_SERVER} -f . >> ${LOG_FILE}
DOWNLOAD_RESULT=$?
echo "Download Result: ${DOWNLOAD_RESULT}"
echo "Elapsed time: ${SECONDS}s" | tee -a ${LOG_FILE}

if [ "${DOWNLOAD_RESULT}" -eq "0" ]
then
  echo "Downloaded custom compile script" | tee -a ${LOG_FILE}
  # successfully downloaded compile script, 
  # make the file compatible with unix and an executable so it can be used
  if [ -x "$(command -v dos2unix)" ]
  then
    dos2unix -n ./${SITE_COMPILE_SCRIPT} ./${SITE_COMPILE_SCRIPT}
  else
    echo "Warning: No dos2unix command found, running compile_site.sh without converting to unix " | tee -a ${LOG_FILE}
  fi
  chmod +x ./${SITE_COMPILE_SCRIPT}

  # switch to use custom site compile script
  COMPILE_SCRIPT=${SITE_COMPILE_SCRIPT}
else 
  echo "Unable to download custom compile script, copying seeded compile script" | tee -a ${LOG_FILE}
  CEC_BIN_FOLDER=`which cec`
  SRC_COMPILE_SITE_FILE="${CEC_BIN_FOLDER/node_modules\/*/}data/config/src-compile_site.sh"
  if [ -f "${SRC_COMPILE_SITE_FILE}" ]
  then
    cp ${SRC_COMPILE_SITE_FILE} ${SEEDED_COMPILE_SCRIPT}
  else
    echo "Unable to locate seeded compile script: ${SRC_COMPILE_SITE_FILE}"
    exit 1;
  fi
fi

# Get the channel token for the site
CHANNEL_TOKEN="noToken"
setChannelToken () {
  echo "Channel Token: " $1
  if [ -z "$1" ] 
  then
    CHANNEL_TOKEN="noToken"
  else
    CHANNEL_TOKEN="${1}"
  fi
}
setChannelToken `cec describe-channel ${SITE_NAME} -s serverForCompilation | grep ^Token | awk '{ print $2 }'` 

# Get the site security
SECURE_SITE_OPTION=""
setSiteSecurity () {
  echo "Secure Site: " $1
  if [ "$1" = "true" ]  
  then
    SECURE_SITE_OPTION="-u true"
  fi
}
setSiteSecurity `cec get-site-security ${SITE_NAME} -s serverForCompilation | grep "secure site:" | awk '{split($0,a,":"); print a[2]}'`

# see if there is a incremental compile job.json file available for this compile
echo -e "Checking for incremental compile definition.  If the file doesn't exist, the call will report an error that can be ignored." | tee -a ${LOG_FILE}
if [[ $JOB_ID == job* ]]
then
  echo "No jobId on the command line, will do full compilation" | tee -a ${LOG_FILE}
else
  # try to download the job.json file
  echo "cec download-file site:${SITE_NAME}/jobs/${JOB_ID}.json -s ${REGISTERED_SERVER} -f . >> ${LOG_FILE}"
  cec download-file site:${SITE_NAME}/jobs/${JOB_ID}.json -s ${REGISTERED_SERVER} -f . >> ${LOG_FILE} 2>&1
  DOWNLOAD_RESULT=$?
  echo "Elapsed time: ${SECONDS}s" | tee -a ${LOG_FILE}

  if [ "${DOWNLOAD_RESULT}" -eq "0" ]
  then
    echo "Downloaded incremental compile definition" | tee -a ${LOG_FILE}
    # Tell the toolkit to use this file during compile
    export CEC_TOOLKIT_INCREMENTAL_COMPILE_FILE=`pwd`/${JOB_ID}.json
  else 
    echo "No incremental compile definition file for job ${JOB_ID}, will do full compilation" | tee -a ${LOG_FILE}
  fi
fi

# Compile the site with the compilation script
echo "Compilation Command: ./${COMPILE_SCRIPT} -s ${SITE_NAME} -r ${REGISTERED_SERVER} -t "${SITE_NAME}${RANDOM}" ${SECURE_SITE_OPTION} -f `pwd` -c ${CHANNEL_TOKEN} -j ${JOB_ID} > ${COMPILE_LOG_FILE} 2>&1"
./${COMPILE_SCRIPT} -s ${SITE_NAME} -r ${REGISTERED_SERVER} -t "${SITE_NAME}${RANDOM}" ${SECURE_SITE_OPTION} -f `pwd` -c ${CHANNEL_TOKEN} -j ${JOB_ID} > ${COMPILE_LOG_FILE} 2>&1
FINISH_RESULT=$?

# cat the log so it's shown in the compilation server output as well
cat ${COMPILE_LOG_FILE} | tee -a ${LOG_FILE}
echo "Elapsed time: ${SECONDS}s" | tee -a ${LOG_FILE}
FINISH_TIME=`date -u +"%Y-%m-%dT%H:%M:%SZ"`

uploadJobFile () {
  echo "Upload the log file to the server"
  # Note: This expects the `cec upload-file` command output to contain a line in the format of: 
  #  - file ${LOG_FILE} uploaded to folder site:${SITE_NAME} (Id: D47883C8A128A2770CBC947CA1B974BCDE24E503FDCA version:3 size: 2312) [0s]
  LOG_FILE_DETAILS=`cec upload-file ${LOG_FILE} -f site:${SITE_NAME} -s ${REGISTERED_SERVER} | grep "uploaded to folder" | awk -F'[)(]' '{print $2}'`

  # check if the jobId was passed on the command line
  if [[ $JOB_ID == job* ]]
  then
     echo "No jobId on the command line, log file is not associated with any compilation job"
  else
    echo "extract the GUID and version from the upload message"
    LOG_FILE_GUID=`echo ${LOG_FILE_DETAILS} | awk '{print $2}'`
    LOG_FILE_VERSION=`echo ${LOG_FILE_DETAILS} | awk '{print $3}' | cut -d ':' -f 2`

    if [ -z "${LOG_FILE_GUID}" ]
    then
      echo "No compilation log file guid, log file is not associated with any compilation job"
    else
      echo "Associating log file '${LOG_FILE_GUID}:${LOG_FILE_VERSION}' with compilation job '${JOB_ID}'"
      cec update-site ${SITE_NAME} -s ${REGISTERED_SERVER} -c '{"parentJobID": "'${JOB_ID}'", "compilationLogID": "'${LOG_FILE_GUID}':'${LOG_FILE_VERSION}'"}'
    fi
  fi
}

# Check the exit result 
# - successful finish is 0
# - failure will have a non-zero code
# - timeout will have code 124
if [ "${FINISH_RESULT}" -eq "0" ]
then
  echo "Upload the log file"
  uploadJobFile

  echo "Updating metadata to make sure job is marked as complete"
  cec update-site ${SITE_NAME} -s ${REGISTERED_SERVER} -m '{"scsCompileStatus": {"jobId":"'${JOB_ID}'","status":"COMPILED","progress":"100%","compiledAt":"'${FINISH_TIME}'"}}'
else
  # add error to the log file
  echo "Compile Command failed with error code: ${FINISH_RESULT}" | tee -a ${LOG_FILE}

  # this should never happen since we don't have a timeout for the compile command but leaving for consistency
  if [ "${FINISH_RESULT}" -eq "124" ]
  then
    echo "Compile Command timed out after: ${TIMEOUT} seconds" | tee -a ${LOG_FILE}
  fi

  echo "Upload the log file"
  uploadJobFile

  # note that the compilation completed with errors
  echo "Updating metadata to make sure job is marked as complete, regardless of how the process exited"
  cec update-site ${SITE_NAME} -s ${REGISTERED_SERVER} -m '{"scsCompileStatus": {"jobId":"'${JOB_ID}'","status":"FAILED","progress":"100%","compiledAt":"'${FINISH_TIME}'"}}'
fi
echo "Compile completed - we're done"