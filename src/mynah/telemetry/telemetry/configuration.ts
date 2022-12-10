/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const TELMETRY_QUEUE_MAX_LENGTH = 10_000
export const TELEMETRY_QUEUE_FILL_THRESHOLD = 0.6
export const TELEMETRY_PUBLISH_INTERVAL = 20_000
export const TELEMETRY_PUBLISH_BATCH_SIZE = 100
export const TELEMETRY_MAX_PUBLISH_ITERATIONS = 3

export const TELEMETRY_CLIENT_CONNECTION_TIMEOUT = 500
export const TELEMETRY_CLIENT_SOCKET_TIMEOUT = 2_000

// Endpoint for the Beta ingestion stack
//
// We'll have to update this to provide a more flexible
// way of getting stage/region configuration (a la JSON/BrazilConfig)
export const TELEMETRY_ENDPOINT = 'https://40f573ts0g.execute-api.us-east-1.amazonaws.com/beta'

export const AUTHENTICATION_REGION = 'us-east-1'
