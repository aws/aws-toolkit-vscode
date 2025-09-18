/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IoTSecureTunnelingClient } from '@aws-sdk/client-iotsecuretunneling'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { getUserAgent } from '../../shared/telemetry/util'
import globals from '../../shared/extensionGlobals'

const customUserAgentBase = 'LAMBDA-DEBUG/1.0.0'

export function getLambdaClientWithAgent(region: string, customUserAgent?: string): DefaultLambdaClient {
    if (!customUserAgent) {
        customUserAgent = getLambdaUserAgent()
    }
    return new DefaultLambdaClient(region, customUserAgent)
}

// Example user agent:
// LAMBDA-DEBUG/1.0.0 AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/1.102.2 ClientId/11111111-1111-1111-1111-111111111111
export function getLambdaDebugUserAgent(): string {
    return `${customUserAgentBase} ${getLambdaUserAgent()}`
}

// Example user agent:
// AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/1.102.2 ClientId/11111111-1111-1111-1111-111111111111
export function getLambdaUserAgent(): string {
    return `${getUserAgent({ includePlatform: true, includeClientId: true })}`
}

export function getIoTSTClientWithAgent(region: string): IoTSecureTunnelingClient {
    const customUserAgent = `${customUserAgentBase} ${getUserAgent({ includePlatform: true, includeClientId: true })}`
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: IoTSecureTunnelingClient,
        clientOptions: {
            userAgent: [[customUserAgent]],
            region,
        },
        userAgent: false,
    })
}
