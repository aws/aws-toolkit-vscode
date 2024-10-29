/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateAssistantResponseCommandOutput, GenerateAssistantResponseRequest } from '@amzn/codewhisperer-streaming'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { ChatSession } from 'aws-core-vscode/codewhispererChat'
import { api } from 'aws-core-vscode/amazonq'

export default {
    chatApi: {
        async chat(request: GenerateAssistantResponseRequest): Promise<GenerateAssistantResponseCommandOutput> {
            const chatSession = new ChatSession()
            return chatSession.chat(request)
        },
    },
    authApi: {
        async reauthIfNeeded() {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.showReauthenticatePrompt()
            }
        },
        async getChatAuthState() {
            return AuthUtil.instance.getChatAuthState()
        },
    },
} satisfies api
