#!/bin/bash
validate()
{
  if [ -z "$1" ]
	then
	  echo "You must supply the temporal CLI environment to use to connect to the order management namespace."
	  exit 1
        else
           TEMPORAL_ENV=$1
  fi

        if ! command -v temporal 2>&1 > /dev/null
        then
                echo "Please install the temporal command line onto your path."
                exit 1
        fi

        if [ $(temporal env list | grep ${TEMPORAL_ENV} | wc -l) -eq 1 ]
        then
                echo "environment setup"
        else
                echo "Environment for CLI not setup."
                echo "Using the command line please setup an environment that will allow the temporal"
                echo "command line to connect to your Temporal service and namespace."
                exit 1
        fi

        temporal workflow list --env ${TEMPORAL_ENV} 2>&1 > /dev/null
        if [ $? -eq 0 ]
        then
                echo "Successfully connected to temporal service."
        else
                echo "Failed to connect to the temporal service.  Please check operations from the command line."
                exit 1
        fi

}
validate-environment()
{
   echo "Validating env vars have been set"
   if [ -z "${TEMPORAL_NAMESPACE}" ]
	then
		echo "Please set environment variable TEMPORAL_NAMESPACE"
		exit 1
   fi
   if [ -z "${TEMPORAL_ADDRESS}" ]
	then
		echo "Please set environment variable TEMPORAL_ADDRESS"
		exit 1
   fi
   if [ -z "${TEMPORAL_KEY_PATH}" ]
	then
		echo "Please set environment variable TEMPORAL_KEY_PATH"
		exit 1
   fi
   if [ -z "${TEMPORAL_CERT_PATH}" ]
	then
		echo "Please set environment variable TEMPORAL_CERT_PATH"
		exit 1
   fi
	
}

# ******************************************************************************
if [ -z "$1" ]
    then
 	validate-environment
else
    	validate $1
    	source setcloudenv.sh ${TEMPORAL_ENV}
fi
env | grep TEMPORAL
./mvnw spring-boot:run -Dspring-boot.run.profiles=tc -f ./pom.xml 
