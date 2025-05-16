/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { getUserAgent } from '../telemetry/util'

// Create a client for featureDev streaming based off of aws sdk v3
export async function createCodeWhispererChatStreamingClient(): Promise<CodeWhispererStreaming> {
    const bearerToken = await AuthUtil.instance.getToken()
    const cwsprConfig = getCodewhispererConfig()
    const streamingClient = new CodeWhispererStreaming({
        region: cwsprConfig.region,
        endpoint: cwsprConfig.endpoint,
        token: { token: bearerToken },
        customUserAgent: getUserAgent(),
        retryStrategy: new ConfiguredRetryStrategy(1, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
}
