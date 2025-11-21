/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SmusUtils } from '../../shared/smusUtils'

/**
 * SSO authentication UI components for SMUS
 */
export class SmusSsoAuthenticationUI {
    /**
     * Shows domain URL input with back button support
     */
    public static async showDomainUrlInput(): Promise<string | 'BACK' | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'SageMaker Unified Studio Authentication'
            quickPick.placeholder = 'Enter your SageMaker Unified Studio Domain URL'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Start with placeholder item
            quickPick.items = [
                {
                    label: '$(globe) Enter Domain URL',
                    description: 'e.g., https://dzd_xxxxxxxxx.sagemaker.region.on.aws',
                    detail: 'Type your SageMaker Unified Studio domain URL above',
                },
            ]

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidChangeValue((value) => {
                if (!value) {
                    quickPick.items = [
                        {
                            label: '$(globe) Enter Domain URL',
                            description: 'e.g., https://dzd_xxxxxxxxx.sagemaker.region.on.aws',
                            detail: 'Type your SageMaker Unified Studio domain URL above',
                        },
                    ]
                    return
                }

                // Validate input as user types
                const validation = SmusUtils.validateDomainUrl(value)
                if (validation) {
                    quickPick.items = [
                        {
                            label: '$(error) Invalid Domain URL',
                            description: validation,
                            detail: `Current input: "${value}"`,
                        },
                    ]
                } else {
                    quickPick.items = [
                        {
                            label: '$(check) Use this Domain URL',
                            description: 'Press Enter to connect',
                            detail: `Domain URL: ${value}`,
                        },
                    ]
                }
            })

            quickPick.onDidAccept(() => {
                const value = quickPick.value.trim()

                // Validate final input
                if (!value) {
                    return // Don't accept empty input
                }

                const validation = SmusUtils.validateDomainUrl(value)
                if (validation) {
                    return // Don't accept invalid URLs
                }

                isCompleted = true
                quickPick.dispose()
                resolve(value)
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve(undefined) // User cancelled
                }
            })

            quickPick.show()
        })
    }
}
