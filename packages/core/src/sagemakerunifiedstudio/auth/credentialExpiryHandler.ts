/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { SmusErrorCodes } from '../shared/smusUtils'
import { SmusIamProfileSelector } from './ui/iamProfileSelection'
import { getCredentialsFilename, getConfigFilename } from '../../auth/credentials/sharedCredentialsFile'
import type { SmusAuthenticationProvider } from './providers/smusAuthenticationProvider'

export enum IamCredentialExpiryAction {
    Reauthenticate = 'reauthenticate',
    EditCredentials = 'editCredentials',
    SwitchProfile = 'switchProfile',
    SignOut = 'signOut',
    Cancelled = 'cancelled',
}

export type IamCredentialExpiryResult =
    | { action: IamCredentialExpiryAction.Reauthenticate }
    | { action: IamCredentialExpiryAction.EditCredentials }
    | { action: IamCredentialExpiryAction.SwitchProfile }
    | { action: IamCredentialExpiryAction.SignOut }
    | { action: IamCredentialExpiryAction.Cancelled }

/**
 * Shows credential expiry options for IAM connections
 * Provides options to re-authenticate, edit credentials, switch profiles, or sign out
 * @param authProvider The SMUS authentication provider
 * @param connection The expired IAM connection
 * @param extensionContext The extension context
 * @returns Promise that resolves with the action taken
 */
export async function showIamCredentialExpiryOptions(
    authProvider: SmusAuthenticationProvider,
    connection: any,
    extensionContext: vscode.ExtensionContext
): Promise<IamCredentialExpiryResult> {
    const logger = getLogger()

    type QuickPickItemWithAction = vscode.QuickPickItem & { action: IamCredentialExpiryAction }
    const options: QuickPickItemWithAction[] = [
        {
            label: '$(sync) Re-authenticate with current profile',
            description: `Profile: ${connection.profileName}`,
            detail: 'Refresh credentials using the same IAM profile',
            action: IamCredentialExpiryAction.Reauthenticate,
        },
        {
            label: '$(file-text) Edit credentials file',
            description: 'Open ~/.aws/credentials and ~/.aws/config',
            detail: 'Manually update your AWS credentials',
            action: IamCredentialExpiryAction.EditCredentials,
        },
        {
            label: '$(arrow-swap) Switch to another profile',
            description: 'Select a different IAM profile',
            detail: 'Choose from available credential profiles',
            action: IamCredentialExpiryAction.SwitchProfile,
        },
        {
            label: '$(trash) Sign out',
            description: 'Sign out from this connection',
            detail: 'Remove the expired connection',
            action: IamCredentialExpiryAction.SignOut,
        },
    ]

    const quickPick = vscode.window.createQuickPick()
    quickPick.title = 'IAM Credentials Expired'
    quickPick.placeholder = 'Choose how to fix your expired credentials'
    quickPick.items = options
    quickPick.canSelectMany = false
    quickPick.ignoreFocusOut = true

    return new Promise((resolve, reject) => {
        let isCompleted = false

        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0]
            if (!selectedItem) {
                quickPick.dispose()
                reject(new ToolkitError('No option selected', { code: SmusErrorCodes.UserCancelled, cancelled: true }))
                return
            }

            isCompleted = true
            quickPick.dispose()

            const itemWithAction = selectedItem as QuickPickItemWithAction

            try {
                switch (itemWithAction.action) {
                    case IamCredentialExpiryAction.Reauthenticate: {
                        logger.debug(
                            `SMUS: Re-authenticating with current IAM profile: ${connection.profileName} in region ${connection.region}`
                        )
                        // For IAM connections, just validate the credentials are still valid
                        // The auth system will handle refreshing them automatically
                        const validation = await authProvider.validateIamProfile(connection.profileName)
                        if (validation.isValid) {
                            // Credentials are valid, refresh the connection state
                            await authProvider.auth.refreshConnectionState(connection)
                            void vscode.window.showInformationMessage(
                                'Successfully reauthenticated with SageMaker Unified Studio'
                            )
                            resolve({ action: IamCredentialExpiryAction.Reauthenticate })
                        } else {
                            const errorMsg = validation.error || 'Unknown validation error'
                            // Throw error for telemetry - activation.ts will show the notification
                            throw new ToolkitError(
                                `Failed to re-authenticate, ensure credential has been updated: ${errorMsg}`,
                                { code: SmusErrorCodes.IamValidationFailed }
                            )
                        }
                        break
                    }
                    case IamCredentialExpiryAction.EditCredentials: {
                        logger.debug('SMUS: Opening AWS credentials and config files for editing')
                        // Open both credentials and config files like AWS Explorer does
                        const credentialsPath = getCredentialsFilename()
                        const configPath = getConfigFilename()

                        // Open both files
                        const [credentialsDoc, configDoc] = await Promise.all([
                            vscode.workspace.openTextDocument(credentialsPath),
                            vscode.workspace.openTextDocument(configPath),
                        ])

                        // Show both documents
                        await vscode.window.showTextDocument(credentialsDoc, { preview: false })
                        await vscode.window.showTextDocument(configDoc, {
                            preview: false,
                            viewColumn: vscode.ViewColumn.Beside,
                        })

                        void vscode.window.showInformationMessage(
                            'AWS credentials and config files opened. Please update your credentials and try reconnecting.'
                        )
                        resolve({ action: IamCredentialExpiryAction.EditCredentials })
                        break
                    }
                    case IamCredentialExpiryAction.SwitchProfile: {
                        logger.debug('SMUS: Switching to another IAM profile')
                        try {
                            const profileSelection = await SmusIamProfileSelector.showIamProfileSelection()

                            // Handle back navigation - show the credential expiry menu again
                            if ('isBack' in profileSelection) {
                                logger.debug('SMUS: User clicked back, showing credential expiry options again')
                                // Recursively show the credential expiry options menu
                                const result = await showIamCredentialExpiryOptions(
                                    authProvider,
                                    connection,
                                    extensionContext
                                )
                                resolve(result)
                                return
                            }

                            // Handle editing mode - This is if user picks edit during the profile selection
                            if ('isEditing' in profileSelection) {
                                logger.debug('SMUS: User is editing credentials')
                                resolve({ action: IamCredentialExpiryAction.EditCredentials })
                                return
                            }

                            // User selected a new profile, authenticate with it using the selected profile
                            // Use dynamic import to avoid circular dependency
                            const { SmusAuthenticationOrchestrator } = await import('./authenticationOrchestrator.js')
                            const result = await SmusAuthenticationOrchestrator.handleIamAuthentication(
                                authProvider,
                                { record: () => {} }, // Minimal span object
                                extensionContext,
                                profileSelection.profileName,
                                profileSelection.region
                            )

                            if (result.status === 'SUCCESS') {
                                void vscode.window.showInformationMessage(
                                    `Successfully switched to profile: ${profileSelection.profileName}`
                                )
                                resolve({ action: IamCredentialExpiryAction.SwitchProfile })
                            } else if (result.status === 'INVALID_PROFILE') {
                                void vscode.window.showErrorMessage(`Failed to switch profile: ${result.error}`)
                                resolve({ action: IamCredentialExpiryAction.SwitchProfile })
                            } else {
                                // BACK or EDITING - shouldn't happen here but handle gracefully
                                resolve({ action: IamCredentialExpiryAction.Cancelled })
                            }
                        } catch (switchError) {
                            // Handle user cancellation gracefully
                            if (
                                switchError instanceof ToolkitError &&
                                switchError.code === SmusErrorCodes.UserCancelled
                            ) {
                                logger.debug('SMUS: Profile switch cancelled by user')
                                resolve({ action: IamCredentialExpiryAction.Cancelled })
                            } else {
                                // Show error message for actual failures
                                const errorMsg = (switchError as Error).message
                                void vscode.window.showErrorMessage(`Failed to switch profile: ${errorMsg}`)
                                logger.error('SMUS: Profile switch failed: %s', switchError)
                                resolve({ action: IamCredentialExpiryAction.SwitchProfile })
                            }
                        }
                        break
                    }
                    case IamCredentialExpiryAction.SignOut: {
                        logger.debug('SMUS: Signing out from connection')
                        // Use the provider's signOut method which properly handles metadata cleanup
                        await authProvider.signOut()
                        void vscode.window.showInformationMessage('Successfully signed out')
                        resolve({ action: IamCredentialExpiryAction.SignOut })
                        break
                    }
                }
            } catch (error) {
                logger.error('SMUS: Failed to handle credential expiry action: %s', error)
                // Only show error for non-reauthenticate cases (reauthenticate handles its own errors)
                if (itemWithAction.action !== IamCredentialExpiryAction.Reauthenticate) {
                    void vscode.window.showErrorMessage(`Failed to complete action: ${(error as Error).message}`)
                }
                reject(error)
            }
        })

        quickPick.onDidHide(() => {
            if (!isCompleted) {
                quickPick.dispose()
                logger.debug('SMUS: Credential expiry options cancelled by user')
                resolve({ action: IamCredentialExpiryAction.Cancelled })
            }
        })

        quickPick.show()
    })
}
