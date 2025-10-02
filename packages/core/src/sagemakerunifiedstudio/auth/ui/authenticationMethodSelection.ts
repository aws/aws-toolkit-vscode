/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import { SmusErrorCodes } from '../../shared/smusUtils'

/**
 * Authentication method types supported by SMUS
 */
export type SmusAuthenticationMethod = 'sso' | 'iam'

/**
 * Result of authentication method selection
 */
export interface AuthenticationMethodSelection {
    method: SmusAuthenticationMethod
}

/**
 * Authentication method selection dialog for SMUS
 */
export class SmusAuthenticationMethodSelector {
    private static readonly logger = getLogger()

    /**
     * Shows the authentication method selection dialog matching the Figma design
     * @param defaultMethod Optional default method to pre-select
     * @returns Promise resolving to the selected authentication method
     */
    public static async showAuthenticationMethodSelection(
        defaultMethod?: SmusAuthenticationMethod
    ): Promise<AuthenticationMethodSelection> {
        const logger = this.logger

        const iamOption: vscode.QuickPickItem = {
            label: '$(key) IAM Role',
            description: 'SageMaker Unified Studio Lightning/Express',
            detail: 'Use Lightning IAM role credentials to access your Unified Studio Lightning resources',
        }

        const ssoOption: vscode.QuickPickItem = {
            label: '$(organization) SSO',
            description: 'SageMaker Unified Studio',
            detail: "Use your organization's Single Sign-On to access Unified Studio resources",
        }

        const options = [iamOption, ssoOption]

        // Set default selection based on preference
        let defaultIndex = 0
        if (defaultMethod === 'sso') {
            defaultIndex = 1
        }

        const quickPick = vscode.window.createQuickPick()
        quickPick.title = 'Select a sign in method'
        quickPick.placeholder = 'Choose how you want to authenticate with SageMaker Unified Studio'
        quickPick.items = options
        quickPick.canSelectMany = false
        quickPick.ignoreFocusOut = true

        // Pre-select the default method
        if (options[defaultIndex]) {
            quickPick.activeItems = [options[defaultIndex]]
        }

        return new Promise((resolve, reject) => {
            let isCompleted = false

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                if (!selectedItem) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('No authentication method selected', {
                            code: SmusErrorCodes.UserCancelled,
                            cancelled: true,
                        })
                    )
                    return
                }

                const method: SmusAuthenticationMethod = selectedItem === iamOption ? 'iam' : 'sso'

                logger.debug(`SMUS Auth: User selected authentication method: ${method}`)

                isCompleted = true
                quickPick.dispose()

                // Return the selected method without asking about preferences
                resolve({ method })
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('Authentication method selection cancelled', {
                            code: SmusErrorCodes.UserCancelled,
                            cancelled: true,
                        })
                    )
                }
            })

            quickPick.show()
        })
    }
}
