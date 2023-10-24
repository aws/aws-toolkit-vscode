/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'

const ENDPOINT = 'https://rts-641299012133.test.codewhisperer.ai.aws.dev'
const REGION = 'us-west-2'

export class CodeWhispererStreamingClient {
    public async createSdkClient(): Promise<CodeWhispererStreaming> {
        const bearerToken = await AuthUtil.instance.getBearerToken()

        const client = new CodeWhispererStreaming({
            endpoint: ENDPOINT,
            region: REGION,
            token: { token: bearerToken },
        })

        return client
    }
}
