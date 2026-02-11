/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SmusUtils } from '../../shared/smusUtils'
import { getRecentDomains, removeDomainFromCache, formatTimestamp } from '../utils/domainCache'

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
            quickPick.placeholder = 'Select a recent domain or enter a new domain URL'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Create delete button for items
            const deleteButton: vscode.QuickInputButton = {
                iconPath: new vscode.ThemeIcon('trash'),
                tooltip: 'Delete this domain',
            }

            // Function to build items list
            const buildItemsList = () => {
                const cachedDomains = getRecentDomains()
                const items: vscode.QuickPickItem[] = []

                // Add cached domains as clickable items with delete button
                for (const domain of cachedDomains) {
                    // Use domain name if available, otherwise use domain ID
                    const displayName = domain.domainName || domain.domainId

                    items.push({
                        label: `$(globe) ${displayName} (${domain.region})`,
                        description: domain.domainId,
                        detail: `Last used: ${formatTimestamp(domain.lastUsedTimestamp)}`,
                        alwaysShow: true,
                        buttons: [deleteButton],
                    })
                }

                return { items, cachedDomains }
            }

            // Initial load
            let cachedDomains: ReturnType<typeof getRecentDomains>
            const refreshItems = () => {
                const result = buildItemsList()
                cachedDomains = result.cachedDomains
                quickPick.items = result.items
            }

            refreshItems()

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidTriggerItemButton(async (event) => {
                if (event.button === deleteButton) {
                    // Find the domain to delete
                    const itemToDelete = event.item
                    const domainToDelete = cachedDomains.find((d) => itemToDelete.description === d.domainId)

                    if (domainToDelete) {
                        // Remove from cache
                        await removeDomainFromCache(domainToDelete.domainUrl)

                        // Refresh the list
                        refreshItems()
                    }
                }
            })

            quickPick.onDidChangeSelection((items) => {
                if (items.length > 0) {
                    const selected = items[0]

                    // Check if user selected a cached domain (match by domain ID in description)
                    const cachedDomain = cachedDomains.find((d) => selected.description === d.domainId)

                    if (cachedDomain) {
                        // User clicked a cached domain - use it immediately
                        isCompleted = true
                        quickPick.dispose()
                        resolve(cachedDomain.domainUrl)
                    }
                }
            })

            quickPick.onDidChangeValue((value) => {
                if (!value) {
                    // Reset to initial items when input is cleared
                    refreshItems()
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
