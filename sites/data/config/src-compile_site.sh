#!/bin/bash

# Custom Site Compilation Script

# -----------------------
# 1. Command line parsing
# -----------------------

CURRENT_TIME=0

echo "command line: " $0 $*
echo ""

if [[ $# -eq 0 ]]
then
  echo "usage: compile_site.sh"
  echo " -s --sitename siteName*"
  echo " -t --templatename templateName"
  echo " -r --server registered server*"
  echo " -f --folder cec install folder*"
  echo " -j --jobid compilation job ID when called from the server"
  echo " -c --channeltoken site's channel token (use dummy token for standard sites)*"
  echo " -u --securesite [true | false] if the site is a secure site"
  echo " "
  echo "example: "
  echo " compile_site.sh -s sampleSite -r sampleServer -f `pwd` -c sampleChannelToken"
  echo " "
  exit 1
fi


# extract command line arguments
while [[ $# -gt 0 ]]
do
key="$1"

POSITIONAL=()
case $key in
    -s|--sitename)
    SITE_NAME="$2"
    shift # past argument
    shift # past value
    ;;
    -t|--templatename)
    TEMPLATE_NAME="$2"
    shift # past argument
    shift # past value
    ;;
    -r|--server)
    REGISTERED_SERVER="$2"
    shift # past argument
    shift # past value
    ;;
    -f|--folder)
    INSTALL_FOLDER="$2"
    shift # past argument
    shift # past value
    ;;
    -j|--jobid)
    JOB_ID="$2"
    shift # past argument
    shift # past value
    ;;
    -c|--channeltoken)
    CHANNEL_TOKEN="$2"
    shift # past argument
    shift # past argument
    ;;
    -u|--securesite)
    IS_SECURE_SITE="$2"
    shift # past argument
    shift # past argument
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
  echo "Missing required parameter: -s --sitename siteName"
  VALID=1
fi
if [ -z "$REGISTERED_SERVER" ]
then
  echo "Missing required parameter: -r --server registered server"
  VALID=1
fi
if [ -z "$INSTALL_FOLDER" ]
then
  echo "Missing required parameter: -f --folder cec install folder"
  VALID=1
fi
if [ -z "$CHANNEL_TOKEN" ]
then
  echo "Missing required parameter: -c --channeltoken site's channel token"
  VALID=1
fi

if [ $VALID -eq 1 ]
then
  echo ""
  exit 1
fi

# default the template name based on the site name if not given
if [ -z "$TEMPLATE_NAME" ]
then
    TEMPLATE_NAME=${SITE_NAME}${RANDOM}
fi

echo "Compiling Site with following parameters: "
echo "  SITE_NAME: ${SITE_NAME}"
echo "  CHANNEL_TOKEN: ${CHANNEL_TOKEN}"
echo "  TEMPLATE_NAME: ${TEMPLATE_NAME}"
echo "  REGISTERED_SERVER: ${REGISTERED_SERVER}"
echo "  INSTALL_FOLDER: ${INSTALL_FOLDER}"
echo "  JOB_ID: ${JOB_ID}"
echo "  IS_SECURE_SITE: ${IS_SECURE_SITE}"
echo ""

# set the secure site option
SECURE_SITE_OPTION=""
if [ "${IS_SECURE_SITE}" = "true" ]
then
  SECURE_SITE_OPTION="-u"
fi



# -----------------------------------
# 2. Environment and helper functions
# -----------------------------------

# confirm the toolkit version
echo "CEC TOOLKIT VERSION: $(cec --version)"
echo ""


# assumes proxy is not necessary
# remove any proxy settings
unset http_proxy
unset https_proxy
unset no_proxy
unset HTTP_PROXY
unset HTTPS_PROXY
unset NO_PROXY


# update the job on the server if jobId available
updateJobStatus () {
  # update the job status
  if [ -z "$JOB_ID" ] 
  then 
    echo "Percentage Complete: $2"
    echo ""
  else 
    # Update the site metadata to represent the progress
    UTC_DATE=`date -u +"%Y-%m-%dT%H:%M:%SZ"`
    cec update-site ${SITE_NAME} -s ${REGISTERED_SERVER} -m '{"scsCompileStatus": {"jobId":"'${JOB_ID}'","status":"'${1}'","progress":'${2}',"compiledAt":"'${UTC_DATE}'"}}'
  fi
  echo ""
}

# check the result of a compilation step and handle as appropriate
checkResult () {
  # note elapsed time 
  echo ""
  let STEP_DURATION="${SECONDS} - ${CURRENT_TIME}"
  CURRENT_TIME=${SECONDS}
  echo " $1 duration ${STEP_DURATION} seconds"
  echo ""

  if [ "$2" -eq "0" ]
  then
    echo "Step $1 completed successfully."
    echo ""
  else
    echo "Step $1 failed, with exit code $2 - exiting."
    echo ""
    exit $2
  fi
  echo ""
}


# --------------------
# 3. Compilation Steps
# --------------------

# hint: set -x option to enable debugging of the compilation steps in the log file when run through the OCM server
# note: if doing this, remove the command echos
#set -x

# navigate to the cec install folder
cd ${INSTALL_FOLDER}

# STEP: 1 - CREATE A TEMPLATE FROM THE SITE, THEME & COMPONENTS
# -------------------------------------------------------------
# download the site template
# hint: exclude folders and components from template download that aren't required for compilation to save time.  For example: -d theme:/assets
updateJobStatus "CREATE_TEMPLATE" 20
echo "cec create-template ${TEMPLATE_NAME} -s ${SITE_NAME} -r ${REGISTERED_SERVER} -x"
cec create-template ${TEMPLATE_NAME} -s ${SITE_NAME} -r ${REGISTERED_SERVER} -x
checkResult "create-template" $?

# hint: it may be useful to introduce a "publish content step" to publish all assets in site's publishing channel to make sure it is up to date before compiling the site


# STEP: 2 - COMPILE THE TEMPLATE
# ------------------------------
updateJobStatus "COMPILE_TEMPLATE" 30

# example of using a backgound job to compile. 
# this can be useful for running multiple compile jobs in parallel to improve compilation times. For example, splitting compile across locales.
# note: make sure -x (excludeContent) is included to avoid downloading content export, which isn't required as content calls are back to the server
# note: make sure -i (ignoreErrors) is included so that a single error in compile doesn't stop all publishing
# hint: update parameters such as --includeLocale as required
echo "cec compile-template ${TEMPLATE_NAME} -s ${REGISTERED_SERVER} -c  ${CHANNEL_TOKEN} -n ${SITE_NAME} ${SECURE_SITE_OPTION} -t published -v -i > job1.log 2>&1 &"
cec compile-template ${TEMPLATE_NAME} -s ${REGISTERED_SERVER} -c  ${CHANNEL_TOKEN} -n ${SITE_NAME} ${SECURE_SITE_OPTION} -t published -v -i > job1.log 2>&1 &

# after spawning multiple processes, wait for all to complete and catch any failures
COMPILE_FAIL_COUNT=0
for processId in `jobs -p`
do
    wait $processId || let "COMPILE_FAIL_COUNT+=1"
done

# write out the compilation logs to stdout for each compilation job
# note: update with each background job log file - cat job1.log job2.log job3.log
cat job1.log 
rm -f job1.log 

# check the result of the compilation jobs
# if COMPILE_FAIL_COUNT is not 0, then the process will exit as at least background compilation job failed
checkResult "compile-template" ${COMPILE_FAIL_COUNT}


# STEP: 3 - UPLOAD STATIC FILES
# -----------------------------
# remove any existing static files
# hint: if doing an incremental compile, you may need to skip this step and/or download the static files before compile
updateJobStatus "DELETE_STATIC" 60
echo "cec delete-static-site-files ${SITE_NAME} -s ${REGISTERED_SERVER}"
cec delete-static-site-files ${SITE_NAME} -s ${REGISTERED_SERVER}  
# ignore error if no static files exist in the site - pass in 0 as exit code
checkResult "delete-static-site-files" 0

# upload the static files
updateJobStatus "UPLOAD_STATIC" 70
echo "cec upload-static-site-files ${INSTALL_FOLDER}/src/templates/${TEMPLATE_NAME}/static -s ${SITE_NAME} -r ${REGISTERED_SERVER}"
cec upload-static-site-files ${INSTALL_FOLDER}/src/templates/${TEMPLATE_NAME}/static -s ${SITE_NAME} -r ${REGISTERED_SERVER}
checkResult "upload-static-site-files" $?


# STEP: 4 - PUBLISH STATIC FILES
# ------------------------------
updateJobStatus "PUBLISH_STATIC" 80
echo "cec control-site publish -r ${REGISTERED_SERVER} -s ${SITE_NAME} -t"
cec control-site publish -r ${REGISTERED_SERVER} -s ${SITE_NAME} -t
checkResult "control-site publish" $?
updateJobStatus "PUBLISHED_STATIC" 95

# exit (job will be updated by calling process)
echo ""
echo "Custom compile completed successfully"
echo ""
exit 0
