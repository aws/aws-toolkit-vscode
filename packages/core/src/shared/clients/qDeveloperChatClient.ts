/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { QDeveloperStreaming } from '@amzn/amazon-q-developer-streaming-client'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { getUserAgent } from '../telemetry/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { AuthUtil } from '../../codewhisperer/util/authUtil'

// Create a client for featureDev streaming based off of aws sdk v3
export async function createQDeveloperStreamingClient(): Promise<QDeveloperStreaming> {
    const cwsprConfig = getCodewhispererConfig()
    const credentials = await AuthUtil.instance.getCredentials()
    const streamingClient = new QDeveloperStreaming({
        region: cwsprConfig.region,
        endpoint: cwsprConfig.endpoint,
        credentials: credentials,
        customUserAgent: getUserAgent(),
        // SETTING max attempts to 0 FOR BETA. RE-ENABLE FOR RE-INVENT
        // Implement exponential back off starting with a base of 500ms (500 + attempt^10)
        retryStrategy: new ConfiguredRetryStrategy(0, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
}
