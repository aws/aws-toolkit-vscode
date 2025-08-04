/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import IoTSecureTunneling from 'aws-sdk/clients/iotsecuretunneling'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { getUserAgent } from '../../shared/telemetry/util'
import globals from '../../shared/extensionGlobals'

const customUserAgentBase = 'LAMBDA-DEBUG/1.0.0'

export function getLambdaClientWithAgent(region: string): DefaultLambdaClient {
    const customUserAgent = `${customUserAgentBase} ${getUserAgent({ includePlatform: true, includeClientId: true })}`
    return new DefaultLambdaClient(region, customUserAgent)
}

export function getIoTSTClientWithAgent(region: string): Promise<IoTSecureTunneling> {
    const customUserAgent = `${customUserAgentBase} ${getUserAgent({ includePlatform: true, includeClientId: true })}`
    return globals.sdkClientBuilder.createAwsService(
        IoTSecureTunneling,
        {
            customUserAgent,
        },
        region
    )
}
