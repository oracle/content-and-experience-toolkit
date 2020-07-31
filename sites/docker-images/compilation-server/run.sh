#!/bin/bash

# Change Log
# - Added mount paths and path creations
# - Removed key creation and server registration
# - Added support for port selection from environment variable

cd /home/${CEC_COMPILATION_USER}/${CEC_DIR_NAME}

echo "CEC TOOLKIT VERSION: $(cec --version)"

SERVER_OUT=./server.log
LOG_FLAG="-l /home/${CEC_COMPILATION_USER}/${CEC_DIR_NAME}"
TIMEOUT="-t 1800000"

PORT_FLAG=""
if [ "${CEC_COMPILATION_PORT}" == "" ]; then
  PORT_FLAG=""
else
  PORT_FLAG="-p ${CEC_COMPILATION_PORT}"
fi

# assumes proxy is not necessary
unset http_proxy
unset https_proxy
unset no_proxy
unset HTTP_PROXY
unset HTTPS_PROXY
unset NO_PROXY

echo "PORT_FLAG: $PORT_FLAG" >> $SERVER_OUT
echo "LOG_FLAG: $LOG_FLAG" >> $SERVER_OUT
echo "TIMEOUT: $TIMEOUT" >> $SERVER_OUT
echo "SERVER_OUT: $SERVER_OUT" >> $SERVER_OUT
cec compilation-server $PORT_FLAG $LOG_FLAG $TIMEOUT &>> $SERVER_OUT &

# Tail on server output file and wait (otherwise container will exit)
tail -f $SERVER_OUT &
childPID=$!
wait ${childPID}
