#!/bin/sh

TEMPORAL_ENV=$1
echo "Getting values from the temporal env [" $TEMPORAL_ENV "]"

export TEMPORAL_ADDRESS=$(temporal env get --env ${TEMPORAL_ENV} --key address -o json | jq -r '.[].value')
export TEMPORAL_NAMESPACE=$(temporal env get --env ${TEMPORAL_ENV} --key namespace -o json | jq -r '.[].value')
export TEMPORAL_CERT_PATH=$(temporal env get --env ${TEMPORAL_ENV} --key tls-cert-path -o json | jq -r '.[].value')
export TEMPORAL_KEY_PATH=$(temporal env get --env ${TEMPORAL_ENV} --key tls-key-path -o json | jq -r '.[].value')

