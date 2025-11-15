/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IoTSecureTunnelingClient } from '@aws-sdk/client-iotsecuretunneling'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { getUserAgentPairs, userAgentPairsToString } from '../../shared/telemetry/util'
import globals from '../../shared/extensionGlobals'
import type { UserAgent } from '@aws-sdk/types'

const customUserAgentName = 'LAMBDA-DEBUG'
const customUserAgentVersion = '1.0.0'

export function getLambdaClientWithAgent(region: string, customUserAgent?: UserAgent): DefaultLambdaClient {
    if (!customUserAgent) {
        customUserAgent = getLambdaUserAgentPairs()
    }
    return new DefaultLambdaClient(region, customUserAgent)
}

/**
 * Returns properly formatted UserAgent pairs for AWS SDK v3
 */
export function getLambdaDebugUserAgentPairs(): UserAgent {
    return [
        [customUserAgentName, customUserAgentVersion],
        ...getUserAgentPairs({ includePlatform: true, includeClientId: true }),
    ]
}

/**
 * Returns properly formatted UserAgent pairs for AWS SDK v3
 */
export function getLambdaUserAgentPairs(): UserAgent {
    return getUserAgentPairs({ includePlatform: true, includeClientId: true })
}

/**
 * Returns user agent string for Lambda debugging in traditional format.
 * Example: "LAMBDA-DEBUG/1.0.0 AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/1.105.1 ClientId/11111111-1111-1111-1111-111111111111"
 */
export function getLambdaDebugUserAgent(): string {
    return userAgentPairsToString(getLambdaDebugUserAgentPairs())
}

export function getIoTSTClientWithAgent(region: string): IoTSecureTunnelingClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: IoTSecureTunnelingClient,
        clientOptions: {
            customUserAgent: [[customUserAgentName, customUserAgentVersion]],
            region,
        },
        userAgent: false,
    })
}
