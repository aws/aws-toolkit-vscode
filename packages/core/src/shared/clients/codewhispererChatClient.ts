/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { getUserAgent } from '../telemetry/util'
import { Credentials, Token } from 'aws-sdk'

// Create a client for featureDev streaming based off of aws sdk v3
export async function createCodeWhispererChatStreamingClient(): Promise<CodeWhispererStreaming> {
    const credential = await AuthUtil.instance.getCredential()
    const authConfig =
        typeof credential === 'string'
            ? { token: new Token({ token: credential }) }
            : {
                  credentials: new Credentials({
                      accessKeyId: credential.accessKeyId,
                      secretAccessKey: credential.secretAccessKey,
                      sessionToken: credential.sessionToken,
                  }),
              }
    const cwsprConfig = getCodewhispererConfig()
    const streamingClient = new CodeWhispererStreaming({
        region: cwsprConfig.region,
        endpoint: cwsprConfig.endpoint,
        customUserAgent: getUserAgent(),
        retryStrategy: new ConfiguredRetryStrategy(1, (attempt: number) => 500 + attempt ** 10),
        ...authConfig,
    })
    return streamingClient
}
