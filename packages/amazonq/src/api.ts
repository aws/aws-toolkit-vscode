/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil, AuthState, getChatAuthState } from 'aws-core-vscode/codewhisperer'

/**
 * API for the toolkit extension to understand the state of Amazon Q.
 */

const getConnectionState = async () => {
    return (await getChatAuthState()).codewhispererChat
}

export const amazonQApi = {
    getConnectionState,
    async registerStateChangeCallback(cb: (e: AuthState) => Promise<void>) {
        AuthUtil.instance.auth.onDidChangeConnectionState(async () => {
            await cb(await getConnectionState())
        })
        AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(async () => {
            await cb(await getConnectionState())
        })
    },
}
