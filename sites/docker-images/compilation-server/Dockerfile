# LICENSE UPL 1.0
#
# Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
#
# ORACLE DOCKERFILES PROJECT
# --------------------------
# This is the Dockerfile for Oracle OCE Compilation Server
#
# REQUIRED FILES TO BUILD THIS IMAGE
# ----------------------------------
#   ./run.sh
#
# HOW TO BUILD THIS IMAGE
# -----------------------
# Put all downloaded files in the same directory as this Dockerfile
# Run:
#      $ docker build --no-cache --tag oce-compilation:latest `pwd`
#
# HOW TO RUN THE BUILT DOCKER IMAGE
# ---------------------------------
# Run: 
#       $ docker run -p 8087:8087 -d oce-compilation:latest
#    or $ docker run --network host <imageId>
#    or $ docker run -p 8087:8087 <imageId> 
#
# HOW TO TEST THE RUNNING DOCKER IMAGE
# ------------------------------------
# In a browser, enter:  
#       http://<server>:8087/compiler/rest/api
# The page will show the supported api versions: 
#   [ "v1" ]
#
#

# Pull base image
# ---------------
FROM container-registry.oracle.com/os/oraclelinux:latest as base

MAINTAINER  Oracle Corporation


# OCE Directories and resources
# -----------------------------
ENV CEC_COMPILATION_BASE_DIR=/u02/d01 \
    CEC_COMPILATION_DIR_NAME=compilation \
    CEC_TOOLKIT_ZIP=master.zip \
    CEC_TOOLKIT_DOWNLOAD=https://github.com/oracle/content-and-experience-toolkit/archive/master.zip \
    CEC_TOOLKIT_DIR_NAME=sites-toolkit \
    CEC_DIR_NAME=cec-src \
    CEC_COMPILATION_GROUP=compilegroup \
    CEC_COMPILATION_USER=compileagent 

ENV CEC_COMPILATION_HOME=${CEC_COMPILATION_BASE_DIR}/${CEC_COMPILATION_DIR_NAME}

ENV CEC_TOOLKIT_BIN_DIR_NAME=${CEC_COMPILATION_HOME}/${CEC_TOOLKIT_DIR_NAME}/node_modules/.bin

ENV CEC_COMPILATION_USER_DIR=/home/${CEC_COMPILATION_USER}

# Create compilation user and directories
# ---------------------------------------
RUN groupadd -r ${CEC_COMPILATION_GROUP} \
  && useradd -r -g ${CEC_COMPILATION_GROUP} ${CEC_COMPILATION_USER} \
  && mkdir -p ${CEC_COMPILATION_HOME} \
  && chown ${CEC_COMPILATION_USER}:${CEC_COMPILATION_GROUP} -R ${CEC_COMPILATION_HOME} \
  && mkdir -p ${CEC_COMPILATION_USER_DIR} \
  && chown ${CEC_COMPILATION_USER}:${CEC_COMPILATION_GROUP} -R ${CEC_COMPILATION_USER_DIR}

# Allow $CEC_COMPILATION_USER to su to $CEC_COMPILATION_USER - still needed for single user use-case
RUN echo "auth            [success=ignore default=1] pam_succeed_if.so user = $CEC_COMPILATION_USER" >> /etc/pam.d/su && \
    echo "auth            sufficient      pam_succeed_if.so use_uid user = $CEC_COMPILATION_USER" >> /etc/pam.d/su && \
    printf "15,16m2\nwq\n" | vi -e /etc/pam.d/su && \
    cat /etc/pam.d/su


# install curl, unzip && dos2unix
# -------------------------------
RUN yum install -y unzip \
  && yum install -y curl \
  && yum install -y dos2unix

# install node
# ------------
RUN curl -L -o node-v12.18.3-linux-x64.tar.gz  https://nodejs.org/dist/latest-v12.x/node-v12.18.3-linux-x64.tar.gz \
  && tar xvf node-v12.18.3-linux-x64.tar.gz \
  && cp -rp node-v12.18.3-linux-x64 /opt/node \
  && ln -s /opt/node/bin/node /usr/local/bin/node \
  && ln -s /opt/node/bin/npm /usr/local/bin/npm

RUN node --version \
  && npm --version


# Switch to the compileagent user
# -------------------------------
USER compileagent

# Download the OCE toolkit
# ------------------------
WORKDIR ${CEC_COMPILATION_HOME}
RUN curl -L -o ${CEC_TOOLKIT_ZIP} ${CEC_TOOLKIT_DOWNLOAD}
RUN unzip -oq ${CEC_TOOLKIT_ZIP} 
RUN mv content-and-experience-toolkit-master/sites  ${CEC_TOOLKIT_DIR_NAME} \
  && chmod +x ${CEC_TOOLKIT_DIR_NAME}/test/job-manager/compileExec.sh

# Build OCE Toolkit
# -----------------
RUN cd ${CEC_TOOLKIT_DIR_NAME} \
  && pwd \
  && export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
  && node --version \
  && npm install \
  && export PATH=${PATH}:${CEC_TOOLKIT_BIN_DIR_NAME} \
  && echo $PATH \
  && npm install bin/cec --no-save

# add cec command to /usr/local/bin
USER root
RUN ln -s ${CEC_TOOLKIT_BIN_DIR_NAME}/cec /usr/local/bin/cec
USER compileagent

RUN cec --version

# cleanup
RUN rm ${CEC_COMPILATION_HOME}/${CEC_TOOLKIT_ZIP}

# Build the OCE source folder for compilations
# ----------------------------------------------
RUN pwd \
  && export PATH=${PATH}:${CEC_TOOLKIT_BIN_DIR_NAME} \
  && export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
  && cd ${CEC_COMPILATION_USER_DIR} \
  && mkdir ${CEC_DIR_NAME} \
  && cd ${CEC_DIR_NAME} \
  && cec install \
  && npm install mustache \
  && npm install marked \
  && cd .. \
  && cd ${CEC_DIR_NAME} \
  && cec --version


# Copy and run the compilation server
# -----------------------------------
COPY ./run.sh ${CEC_COMPILATION_HOME}
RUN dos2unix -n ${CEC_COMPILATION_HOME}/run.sh ${CEC_COMPILATION_HOME}/run.sh

EXPOSE 8087 

CMD exec ${CEC_COMPILATION_HOME}/run.sh
