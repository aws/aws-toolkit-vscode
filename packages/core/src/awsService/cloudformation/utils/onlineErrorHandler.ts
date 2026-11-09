/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, window } from 'vscode'
import { ResponseError } from 'vscode-languageclient'
import { extractErrorMessage } from '../utils'

// LSP error codes from server (must match OnlineFeatureErrorCode enum)
const OnlineFeatureErrorCode = {
    NoInternet: -32_001,
    NoAuthentication: -32_002,
    ExpiredCredentials: -32_003,
    AwsServiceError: -32_004,
} as const

interface OnlineFeatureErrorData {
    retryable: boolean
    requiresReauth: boolean
}

function isLspError(error: unknown): error is ResponseError<OnlineFeatureErrorData> {
    return error instanceof ResponseError
}

export async function handleLspError(error: unknown, context?: string): Promise<void> {
    if (!isLspError(error)) {
        const message = context ? `${context}: ${extractErrorMessage(error)}` : extractErrorMessage(error)
        void window.showErrorMessage(message)
        return
    }

    const { code, message, data } = error
    const fullMessage = context ? `${context}: ${message}` : message

    switch (code) {
        case OnlineFeatureErrorCode.ExpiredCredentials:
        case OnlineFeatureErrorCode.NoAuthentication:
            if (data?.requiresReauth) {
                const action = await window.showErrorMessage(fullMessage, 'Re-authenticate')
                if (action === 'Re-authenticate') {
                    await commands.executeCommand('aws.toolkit.login')
                }
            } else {
                void window.showErrorMessage(fullMessage)
            }
            break

        case OnlineFeatureErrorCode.NoInternet:
        case OnlineFeatureErrorCode.AwsServiceError:
            void window.showErrorMessage(fullMessage)
            break

        default:
            void window.showErrorMessage(fullMessage)
    }
}
