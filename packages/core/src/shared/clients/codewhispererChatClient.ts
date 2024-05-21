/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { AuthUtil } from '../../codewhisperer/util/authUtil'

// Create a client for featureDev streaming based off of aws sdk v3
export async function createCodeWhispererChatStreamingClient(): Promise<CodeWhispererStreaming> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const cwsprConfig = getCodewhispererConfig()
    const streamingClient = new CodeWhispererStreaming({
        region: cwsprConfig.region,
        endpoint: cwsprConfig.endpoint,
        token: { token: bearerToken },
        // SETTING max attempts to 0 FOR BETA. RE-ENABLE FOR RE-INVENT
        // Implement exponential back off starting with a base of 500ms (500 + attempt^10)
        retryStrategy: new ConfiguredRetryStrategy(0, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
}
