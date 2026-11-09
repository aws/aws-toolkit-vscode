/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { isCredentialExpirationError } from './smusUtils'
import { SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'

/**
 *
 * If the provided error indicates expired credentials, it marks the connection as invalid.
 * This refreshes the SmusAuthInfo node to reflect the updated authentication state.
 *
 * @param err The error
 * @param showError If true, shows error message to user. If false, silently handles the error.
 */
export async function handleCredExpiredError(err: any, showError: boolean = false): Promise<void> {
    const errorMessage = (err as Error).message
    if (isCredentialExpirationError(err)) {
        if (showError) {
            void vscode.window.showErrorMessage(
                'Connection to SageMaker Unified Studio has expired. Please try again after reauthentication.'
            )
        }
        const smusAuthProvider = SmusAuthenticationProvider.fromContext()
        await smusAuthProvider.invalidateConnection()
        smusAuthProvider.dispose()
    } else {
        if (showError) {
            void vscode.window.showErrorMessage(errorMessage)
        }
    }
}
