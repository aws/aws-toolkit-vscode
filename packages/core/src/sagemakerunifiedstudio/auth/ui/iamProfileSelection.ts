/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import { loadSharedCredentialsProfiles, parseIni } from '../../../auth/credentials/sharedCredentials'
import { getCredentialsFilename, getConfigFilename } from '../../../auth/credentials/sharedCredentialsFile'
import { SmusErrorCodes, DataZoneServiceId } from '../../shared/smusUtils'
import globals from '../../../shared/extensionGlobals'
import fs from '../../../shared/fs/fs'
import { tryConsoleLogin } from '../smusConsoleLogin'
import { telemetry } from '../../../shared/telemetry/telemetry'

/**
 * Actions available in the credential management dialog
 */
enum CredentialManagementAction {
    AddNewProfileConsole = 'ADD_NEW_PROFILE_CONSOLE',
    EditCredentialsFile = 'EDIT_CREDENTIALS_FILE',
    EditConfigFile = 'EDIT_CONFIG_FILE',
    AddNewProfile = 'ADD_NEW_PROFILE',
}

/**
 * Actions available in the profile selection dialog
 */
enum ProfileSelectionAction {
    SelectProfile = 'SELECT_PROFILE',
    ManageCredentials = 'MANAGE_CREDENTIALS',
}

/**
 * Actions available in the session token input dialog
 */
enum SessionTokenAction {
    Skip = 'SKIP',
    UseToken = 'USE_TOKEN',
    Warning = 'WARNING',
}

/**
 * Result of IAM profile selection
 */
export interface IamProfileSelection {
    profileName: string
    region: string
}

/**
 * Result indicating user chose to edit credential files
 */
export interface IamProfileEditingInProgress {
    isEditing: true
    message: string
}

/**
 * Result indicating user chose to go back
 */
export interface IamProfileBackNavigation {
    isBack: true
    message: string
}

/**
 * IAM profile selection interface for SMUS
 */
export class SmusIamProfileSelector {
    private static readonly logger = getLogger('smus')

    // Validation regex patterns (based on AWS STS API specifications)
    // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
    private static readonly profileNamePattern = /^[a-zA-Z0-9_-]+$/
    // AWS AccessKeyId: 16-128 chars, pattern [\w]* (alphanumeric + underscore)
    private static readonly accessKeyIdPattern = /^[a-zA-Z0-9_]*$/
    // AWS SecretAccessKey and SessionToken: Required per STS API, but no pattern/length constraints specified
    private static readonly regionLinePattern = /^region\s*=.*$/m

    /**
     * Creates a QuickPick with common settings for input dialogs
     * @param title Title for the QuickPick
     * @param placeholder Placeholder text
     * @returns Configured QuickPick instance
     */
    private static createInputQuickPick(title: string, placeholder: string): vscode.QuickPick<vscode.QuickPickItem> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.canSelectMany = false
        quickPick.ignoreFocusOut = true
        quickPick.buttons = [vscode.QuickInputButtons.Back]
        return quickPick
    }

    /**
     * Shows the IAM profile selection dialog matching the Figma design
     * @returns Promise resolving to the selected profile and region, editing status, or back navigation
     */
    public static async showIamProfileSelection(): Promise<
        IamProfileSelection | IamProfileEditingInProgress | IamProfileBackNavigation
    > {
        const logger = this.logger

        try {
            // Load available credential profiles
            const profiles = await loadSharedCredentialsProfiles()
            const profileNames = Object.keys(profiles)

            // Create QuickPick items for profiles
            const profileItems: (vscode.QuickPickItem & {
                action: ProfileSelectionAction
                profileName: string
                region: string
            })[] = profileNames.map((profileName) => {
                const profile = profiles[profileName]
                const region = profile.region || 'not-set'

                return {
                    label: `$(key) ${profileName}`,
                    description: `IAM Credentials, configured locally (${region})`,
                    detail: `Profile: ${profileName} | Region: ${region}`,
                    action: ProfileSelectionAction.SelectProfile,
                    profileName,
                    region,
                }
            })

            // Add "Add or edit credentials" option
            const addCredentialsItem: vscode.QuickPickItem & { action: ProfileSelectionAction } = {
                label: '$(add) Add or edit credentials',
                description: 'Manage AWS credential profiles',
                detail: 'Add new profiles or edit existing credential files',
                action: ProfileSelectionAction.ManageCredentials,
            }

            const options = [...profileItems, addCredentialsItem]

            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Select an IAM Profile'
            quickPick.placeholder = 'Choose an AWS credential profile to authenticate with SageMaker Unified Studio'
            quickPick.items = options
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            return new Promise((resolve, reject) => {
                let isCompleted = false

                quickPick.onDidAccept(() => {
                    const selectedItem = quickPick.selectedItems[0]
                    if (!selectedItem) {
                        quickPick.dispose()
                        reject(
                            new ToolkitError('No profile selected', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        )
                        return
                    }

                    isCompleted = true
                    quickPick.dispose()

                    const itemWithAction = selectedItem as vscode.QuickPickItem & {
                        action: ProfileSelectionAction
                        profileName?: string
                        region?: string
                    }

                    // Check if user selected "Add or edit credentials"
                    if (itemWithAction.action === ProfileSelectionAction.ManageCredentials) {
                        // Handle the async credential management flow
                        void (async () => {
                            try {
                                const managementResult = await SmusIamProfileSelector.showCredentialManagement()

                                // Check if a new profile was created (returns IamProfileSelection)
                                if (typeof managementResult === 'object' && 'profileName' in managementResult) {
                                    // User created a new profile, use it directly
                                    logger.debug(
                                        `SMUS Auth: Using newly created profile: ${managementResult.profileName}`
                                    )
                                    resolve(managementResult)
                                } else if (managementResult === true) {
                                    // User wants to restart profile selection (e.g., clicked back)
                                    const result = await SmusIamProfileSelector.showIamProfileSelection()
                                    resolve(result)
                                } else {
                                    // User chose to edit files, return a special result indicating this
                                    resolve({
                                        isEditing: true,
                                        message:
                                            'User chose to edit credential files. Please complete setup and try again.',
                                    })
                                }
                            } catch (error) {
                                // Handle user cancellation gracefully
                                if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                                    resolve({
                                        isEditing: true,
                                        message: 'User cancelled credential management.',
                                    })
                                } else {
                                    reject(error)
                                }
                            }
                        })()
                        return
                    }

                    // User selected an existing profile
                    // Ensure we have profile data (should always be present for SelectProfile action)
                    if (!itemWithAction.profileName || !itemWithAction.region) {
                        reject(new ToolkitError('Invalid profile selection', { code: 'InvalidProfileSelection' }))
                        return
                    }

                    const profileName = itemWithAction.profileName
                    const profileRegion = itemWithAction.region

                    logger.debug(`User selected profile: ${profileName}`)

                    // Check if region is not set and prompt for region selection
                    if (profileRegion === 'not-set') {
                        void (async () => {
                            try {
                                const selectedRegion = await SmusIamProfileSelector.showRegionSelection()

                                // Check if user clicked back on region selection
                                if (selectedRegion === 'BACK') {
                                    resolve({
                                        isBack: true,
                                        message: 'User chose to go back from region selection.',
                                    })
                                    return
                                }

                                // Update the profile with the selected region
                                await SmusIamProfileSelector.updateProfileRegion(profileName, selectedRegion)

                                resolve({
                                    profileName: profileName,
                                    region: selectedRegion,
                                })
                            } catch (error) {
                                reject(error)
                            }
                        })()
                    } else {
                        resolve({
                            profileName: profileName,
                            region: profileRegion,
                        })
                    }
                })

                quickPick.onDidTriggerButton((button) => {
                    if (button === vscode.QuickInputButtons.Back) {
                        isCompleted = true
                        quickPick.dispose()
                        resolve({
                            isBack: true,
                            message: 'User chose to go back to authentication method selection.',
                        })
                    }
                })

                quickPick.onDidHide(() => {
                    if (!isCompleted) {
                        quickPick.dispose()
                        reject(
                            new ToolkitError('Profile selection cancelled', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        )
                    }
                })

                quickPick.show()
            })
        } catch (error) {
            // Don't log or chain user cancellation as an error
            if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                throw error
            }
            logger.error('Failed to show IAM profile selection: %s', error)
            throw ToolkitError.chain(error, 'Failed to show IAM profile selection')
        }
    }

    /**
     * Shows region selection dialog for IAM authentication
     * @param options Configuration options for the region selection dialog
     * @returns Promise resolving to the selected region or 'BACK' if user wants to go back
     */
    public static async showRegionSelection(options?: {
        defaultRegion?: string
        title?: string
        placeholder?: string
        returnBackOnCancel?: boolean
    }): Promise<string> {
        const logger = this.logger

        // Get regions where DataZone service is available
        const allRegions = globals.regionProvider.getRegions()
        const dataZoneRegions = allRegions.filter((region) =>
            globals.regionProvider.isServiceInRegion(DataZoneServiceId, region.id)
        )

        // If no regions found with DataZone service, fall back to all regions
        const regions = dataZoneRegions.length > 0 ? dataZoneRegions : allRegions

        const regionItems: vscode.QuickPickItem[] = regions.map(
            (region) =>
                ({
                    label: region.name,
                    description: region.id,
                    detail: `AWS Region: ${region.id}`,
                    regionCode: region.id,
                }) as vscode.QuickPickItem & { regionCode: string }
        )

        const quickPick = this.createInputQuickPick(
            options?.title ?? 'Select AWS Region',
            options?.placeholder ?? 'Choose the AWS region for SageMaker Unified Studio'
        )
        quickPick.items = regionItems

        // Allow users to find matches by typing in the region code (e.g., us-east-1)
        quickPick.matchOnDescription = true

        // Pre-select default region if provided
        if (options?.defaultRegion) {
            const defaultItem = regionItems.find((item) => (item as any).regionCode === options.defaultRegion)
            if (defaultItem) {
                quickPick.activeItems = [defaultItem]
            }
        }

        return new Promise((resolve, reject) => {
            let isCompleted = false

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                if (!selectedItem) {
                    if (options?.returnBackOnCancel) {
                        quickPick.dispose()
                        resolve('BACK')
                    } else {
                        quickPick.dispose()
                        reject(
                            new ToolkitError('No region selected', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        )
                    }
                    return
                }

                isCompleted = true
                quickPick.dispose()

                const regionItem = selectedItem as vscode.QuickPickItem & { regionCode: string }

                logger.debug(`User selected region: ${regionItem.regionCode}`)

                resolve(regionItem.regionCode)
            })

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    if (options?.returnBackOnCancel) {
                        resolve('BACK')
                    } else {
                        reject(
                            new ToolkitError('Region selection cancelled', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        )
                    }
                }
            })

            quickPick.show()
        })
    }

    /**
     * Shows credential management options (Add/Edit credentials)
     * @returns Promise resolving to boolean indicating if profile selection should restart, or profile data if a new profile was created
     */
    public static async showCredentialManagement(): Promise<boolean | IamProfileSelection> {
        const logger = this.logger

        logger.debug('Showing credential management options')

        const options: (vscode.QuickPickItem & { action: CredentialManagementAction })[] = [
            {
                label: '$(globe) Add profile through console',
                description: 'Authenticate via browser using AWS CLI',
                detail: 'Opens a browser window for sign-in',
                action: CredentialManagementAction.AddNewProfileConsole,
            },

            {
                label: '$(file-text) Edit AWS Credentials File',
                description: 'Open ~/.aws/credentials file for editing',
                detail: 'Edit existing credential profiles or add new ones',
                action: CredentialManagementAction.EditCredentialsFile,
            },
            {
                label: '$(file-text) Edit AWS Config File',
                description: 'Open ~/.aws/config file for editing',
                detail: 'Edit AWS configuration settings and profiles',
                action: CredentialManagementAction.EditConfigFile,
            },
            {
                label: '$(add) Add New Profile Manually',
                description: 'Create a new AWS credential profile',
                detail: 'Enter access key, secret key, and session token manually',
                action: CredentialManagementAction.AddNewProfile,
            },
        ]

        const quickPick = vscode.window.createQuickPick()
        quickPick.title = 'Manage AWS Credentials'
        quickPick.placeholder = 'Choose how you want to manage your AWS credentials'
        quickPick.items = options
        quickPick.canSelectMany = false
        quickPick.ignoreFocusOut = true

        // Add back button
        const backButton = vscode.QuickInputButtons.Back
        quickPick.buttons = [backButton]

        return new Promise((resolve, reject) => {
            let isCompleted = false

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                if (!selectedItem) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('No option selected', { code: SmusErrorCodes.UserCancelled, cancelled: true })
                    )
                    return
                }

                isCompleted = true
                quickPick.dispose()

                // Handle the async operations after disposing the quick pick
                void (async () => {
                    try {
                        const itemWithAction = selectedItem as vscode.QuickPickItem & {
                            action: CredentialManagementAction
                        }

                        switch (itemWithAction.action) {
                            case CredentialManagementAction.AddNewProfileConsole: {
                                telemetry.smus_iamCredentialMethod.emit({ smusIamCredMethod: 'console' })
                                const newProfile = await this.addNewProfileConsole()
                                // Return the newly created profile data to use it directly
                                resolve(newProfile)
                                break
                            }
                            case CredentialManagementAction.EditCredentialsFile: {
                                telemetry.smus_iamCredentialMethod.emit({ smusIamCredMethod: 'editCredentials' })
                                const result = await this.openAwsFile('credentials')
                                // If user clicked "Select Profile", restart profile selection
                                resolve(result === 'RESTART_PROFILE_SELECTION')
                                break
                            }
                            case CredentialManagementAction.EditConfigFile: {
                                telemetry.smus_iamCredentialMethod.emit({ smusIamCredMethod: 'editConfig' })
                                const result = await this.openAwsFile('config')
                                // If user clicked "Select Profile", restart profile selection
                                resolve(result === 'RESTART_PROFILE_SELECTION')
                                break
                            }
                            case CredentialManagementAction.AddNewProfile: {
                                telemetry.smus_iamCredentialMethod.emit({ smusIamCredMethod: 'manual' })
                                const newProfile = await this.addNewProfile()
                                // Return the newly created profile data to use it directly
                                resolve(newProfile)
                                break
                            }
                        }
                    } catch (error) {
                        reject(error)
                    }
                })()
            })

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    // User wants to go back to profile selection
                    resolve(true)
                }
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('Credential management cancelled', {
                            code: SmusErrorCodes.UserCancelled,
                            cancelled: true,
                        })
                    )
                }
            })

            quickPick.show()
        })
    }

    /**
     * Opens the AWS credentials file in VS Code editor
     */
    /**
     * Opens an AWS configuration file in VS Code editor
     * @param fileType Type of file to open ('credentials' or 'config')
     */
    private static async openAwsFile(fileType: 'credentials' | 'config'): Promise<void | 'RESTART_PROFILE_SELECTION'> {
        const logger = this.logger
        const isCredentials = fileType === 'credentials'

        try {
            const filePath = isCredentials ? getCredentialsFilename() : getConfigFilename()
            const fileLabel = isCredentials ? 'credentials' : 'config'

            logger.debug(`Opening ${fileLabel} file: ${filePath}`)

            // Ensure the .aws directory exists
            await this.ensureAwsDirectoryExists()

            // Create the file if it doesn't exist
            if (!(await fs.existsFile(filePath))) {
                await fs.writeFile(filePath, '')
                logger.debug(`Created new ${fileLabel} file`)
            }

            // Open the file in VS Code
            const document = await vscode.workspace.openTextDocument(filePath)
            await vscode.window.showTextDocument(document)

            logger.debug(`${fileLabel} file opened successfully`)
        } catch (error) {
            const fileLabel = isCredentials ? 'credentials' : 'config'
            logger.error(`Failed to open ${fileLabel} file: %s`, error)
            throw new ToolkitError(`Failed to open AWS ${fileLabel} file: ${(error as Error).message}`, {
                code: isCredentials ? 'CredentialsFileError' : 'ConfigFileError',
            })
        }
    }

    /**
     * Console login flow to add a new AWS credential profile via browser-based authentication.
     * Prompts for profile name and region, then delegates to authenticateWithConsoleLogin.
     * Falls back to manual entry on failure.
     * @returns Promise resolving to the newly created profile data
     */
    private static async addNewProfileConsole(): Promise<IamProfileSelection> {
        const logger = this.logger

        try {
            logger.debug('Starting add new profile via console flow')

            // Step 1: Collect profile name and region with back navigation
            let currentStep = 1
            let profileName = ''
            let region = ''

            while (currentStep <= 2) {
                switch (currentStep) {
                    case 1: {
                        const result = await this.getProfileNameInput()
                        if (result === 'BACK') {
                            // User wants to go back to credential management menu
                            throw new ToolkitError('User navigated back', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        }
                        profileName = result
                        currentStep = 2
                        break
                    }
                    case 2: {
                        const result = await this.showRegionSelection({
                            title: 'Add Profile Through Console - Step 2 of 2',
                            placeholder: 'Select the AWS region for this profile',
                            returnBackOnCancel: true,
                        })
                        if (result === 'BACK') {
                            currentStep = 1
                        } else {
                            region = result
                            currentStep = 3
                        }
                        break
                    }
                }
            }

            // Step 2: Attempt console login
            const loginSuccess = await tryConsoleLogin(profileName, region)

            if (loginSuccess) {
                telemetry.smus_consoleLoginResult.emit({ smusConsoleLoginResult: true })
                return {
                    profileName,
                    region,
                }
            }

            // Console login failed — ask user if they want to fall back to manual entry
            const fallbackChoice = await this.showManualEntryFallbackPrompt()

            if (fallbackChoice === 'manual') {
                telemetry.smus_consoleLoginResult.emit({
                    smusConsoleLoginResult: false,
                    smusConsoleLoginFallback: true,
                })
                // Fall back to manual entry with prefilled profile name and region
                const profileData = await this.collectProfileData({ profileName, region })

                if (profileData === 'BACK') {
                    throw new ToolkitError('User navigated back from manual fallback', {
                        code: SmusErrorCodes.UserCancelled,
                        cancelled: true,
                    })
                }

                // Write the manually entered profile to disk
                await this.addProfileToCredentialsFile(
                    profileData.profileName,
                    profileData.accessKeyId,
                    profileData.secretAccessKey,
                    profileData.sessionToken,
                    profileData.region
                )

                return {
                    profileName: profileData.profileName,
                    region: profileData.region,
                }
            }

            // User declined manual entry — go back
            telemetry.smus_consoleLoginResult.emit({ smusConsoleLoginResult: false, smusConsoleLoginFallback: false })
            throw new ToolkitError('User declined manual fallback', {
                code: SmusErrorCodes.UserCancelled,
                cancelled: true,
            })
        } catch (error) {
            if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                logger.debug('User cancelled add new profile via console flow')
                throw error
            }
            logger.error('Failed to add new profile via console: %s', error)
            throw new ToolkitError(`Failed to add new profile via console: ${(error as Error).message}`, {
                code: 'AddProfileConsoleError',
            })
        }
    }

    /**
     * Shows a QuickPick asking the user if they want to fall back to manual credential entry
     * after console login fails.
     * @returns 'manual' if user wants to enter credentials manually, 'cancel' otherwise
     */
    private static async showManualEntryFallbackPrompt(): Promise<'manual' | 'cancel'> {
        const manualOption: vscode.QuickPickItem = {
            label: '$(edit) Enter credentials manually',
            detail: 'Enter access key, secret key, and session token manually',
        }

        const cancelOption: vscode.QuickPickItem = {
            label: '$(close) Cancel',
            detail: 'Return to credential management menu',
        }

        const quickPick = vscode.window.createQuickPick()
        quickPick.title = 'Console login failed'
        quickPick.placeholder = 'Would you like to enter credentials manually instead?'
        quickPick.items = [manualOption, cancelOption]
        quickPick.canSelectMany = false
        quickPick.ignoreFocusOut = true

        return new Promise((resolve) => {
            let isCompleted = false

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0]
                isCompleted = true
                quickPick.dispose()
                resolve(selected === manualOption ? 'manual' : 'cancel')
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve('cancel')
                }
            })

            quickPick.show()
        })
    }

    /**
     * Interactive flow to add a new AWS credential profile with back navigation
     * @returns Promise resolving to the newly created profile data
     */
    private static async addNewProfile(): Promise<IamProfileSelection> {
        const logger = this.logger

        try {
            logger.debug('Starting add new profile flow')

            const profileData = await this.collectProfileData()

            if (profileData === 'BACK') {
                // User navigated back, throw error to go back to credential management
                throw new ToolkitError('User navigated back', { code: SmusErrorCodes.UserCancelled, cancelled: true })
            }

            // Add the profile to credentials file
            await this.addProfileToCredentialsFile(
                profileData.profileName,
                profileData.accessKeyId,
                profileData.secretAccessKey,
                profileData.sessionToken,
                profileData.region
            )

            // Show success message
            void vscode.window.showInformationMessage(
                `AWS profile '${profileData.profileName}' has been added successfully and will be used for authentication.`
            )

            logger.debug(`Successfully added new profile: ${profileData.profileName}`)

            // Return the profile data to use it directly
            return {
                profileName: profileData.profileName,
                region: profileData.region,
            }
        } catch (error) {
            // Only log actual errors, not user cancellations
            if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                logger.debug('User cancelled add new profile flow')
                throw error // Re-throw for telemetry but don't log as error
            }
            logger.error('Failed to add new profile: %s', error)
            throw new ToolkitError(`Failed to add new profile: ${(error as Error).message}`, {
                code: 'AddProfileError',
            })
        }
    }

    /**
     * Collects profile data through a multi-step flow with back navigation
     * @param prefill Optional prefilled values (e.g., from console login fallback).
     *               If profileName is prefilled, step 1 is skipped and back on step 2 returns 'BACK'.
     *               If region is prefilled, step 5 is skipped.
     */
    private static async collectProfileData(prefill?: { profileName?: string; region?: string }): Promise<
        | {
              profileName: string
              accessKeyId: string
              secretAccessKey: string
              sessionToken?: string
              region: string
          }
        | 'BACK'
    > {
        let currentStep = prefill?.profileName ? 2 : 1
        let profileName = prefill?.profileName ?? ''
        let accessKeyId = ''
        let secretAccessKey = ''
        let sessionToken = ''
        let region = prefill?.region ?? ''

        const lastStep = prefill?.region ? 4 : 5

        while (currentStep <= lastStep) {
            switch (currentStep) {
                case 1: {
                    // Step 1: Profile Name
                    const result = await this.getProfileNameInput()
                    if (result === 'BACK') {
                        return 'BACK' // User wants to go back - exit to credential management menu
                    }
                    profileName = result
                    currentStep = 2
                    break
                }
                case 2: {
                    // Step 2: Access Key ID
                    const result = await this.getAccessKeyIdInput()
                    if (result === 'BACK') {
                        if (prefill?.profileName) {
                            // Profile was prefilled, back here means exit entirely
                            return 'BACK'
                        }
                        currentStep = 1 // Go back to step 1
                    } else {
                        accessKeyId = result
                        currentStep = 3
                    }
                    break
                }
                case 3: {
                    // Step 3: Secret Access Key
                    const result = await this.getSecretAccessKeyInput()
                    if (result === 'BACK') {
                        currentStep = 2 // Go back to step 2
                    } else {
                        secretAccessKey = result
                        currentStep = 4
                    }
                    break
                }
                case 4: {
                    // Step 4: Session Token (optional)
                    const result = await this.getSessionTokenInput()
                    if (result === 'BACK') {
                        currentStep = 3 // Go back to step 3
                    } else {
                        sessionToken = result
                        currentStep = 5
                    }
                    break
                }
                case 5: {
                    // Step 5: Region
                    const result = await this.showRegionSelection({
                        title: 'Add New AWS Profile - Step 5 of 5',
                        placeholder: 'Select a default region',
                        returnBackOnCancel: true,
                    })
                    if (result === 'BACK') {
                        currentStep = 4 // Go back to step 4
                    } else {
                        region = result
                        currentStep = 6 // Exit the loop
                    }
                    break
                }
            }
        }

        return {
            profileName,
            accessKeyId,
            secretAccessKey,
            sessionToken: sessionToken || undefined,
            region,
        }
    }

    /**
     * Gets profile name input with back navigation and existing profile validation
     */
    private static async getProfileNameInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = this.createInputQuickPick(
                'Add New AWS Profile - Step 1 of 5',
                'Type a profile name (e.g., my-profile, dev, prod)'
            )
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidChangeValue(async (value) => {
                // Show placeholder when empty
                if (!value) {
                    quickPick.items = [
                        {
                            label: '$(edit) Enter profile name',
                            description: 'e.g., my-profile, dev, prod',
                            detail: 'Profile names can contain letters, numbers, hyphens, and underscores',
                        },
                    ]
                    return
                }

                // Validate input as user types
                if (value.includes(' ')) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: '$(error) Cannot contain spaces',
                            detail: 'Valid characters: letters, numbers, hyphens, underscores',
                        },
                    ]
                } else if (!this.profileNamePattern.test(value)) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: '$(error) Invalid characters',
                            detail: 'Profile names can only contain letters, numbers, hyphens, and underscores',
                        },
                    ]
                } else if (value.length < 2) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: `$(info) Too short (${value.length}/2 min)`,
                            detail: 'Profile names should be at least 2 characters long',
                        },
                    ]
                } else {
                    // Check if profile already exists
                    try {
                        const profiles = await loadSharedCredentialsProfiles()
                        const profileExists = profiles[value] !== undefined

                        if (profileExists) {
                            quickPick.items = [
                                {
                                    label: `${value}`,
                                    description: '$(warning) Profile exists - will be overwritten',
                                    detail: 'Press Enter to overwrite the existing profile',
                                },
                            ]
                        } else {
                            quickPick.items = [
                                {
                                    label: `${value}`,
                                    description: `$(check) Valid (${value.length} characters)`,
                                    detail: 'Press Enter to use this profile name',
                                },
                            ]
                        }
                    } catch (error) {
                        // If we can't load profiles, just show as valid
                        quickPick.items = [
                            {
                                label: `${value}`,
                                description: `$(check) Valid (${value.length} characters)`,
                                detail: 'Press Enter to use this profile name',
                            },
                        ]
                    }
                }
            })

            quickPick.onDidAccept(async () => {
                const value = quickPick.value.trim()

                // Validate final input
                if (!value || value.length < 2) {
                    return // Don't accept empty or too short input
                }
                if (value.includes(' ')) {
                    return // Don't accept names with spaces
                }
                if (!this.profileNamePattern.test(value)) {
                    return // Don't accept invalid characters
                }

                // Check if profile exists and ask for confirmation
                try {
                    const profiles = await loadSharedCredentialsProfiles()
                    const profileExists = profiles[value] !== undefined

                    if (profileExists) {
                        isCompleted = true
                        quickPick.dispose()

                        // Ask for confirmation to overwrite
                        const overwrite = await vscode.window.showWarningMessage(
                            `Profile '${value}' already exists. Do you want to overwrite it?`,
                            { modal: true },
                            'Overwrite'
                        )

                        if (overwrite === 'Overwrite') {
                            resolve(value)
                        } else {
                            // User cancelled, restart the input
                            const result = await this.getProfileNameInput()
                            resolve(result)
                        }
                        return
                    }
                } catch (error) {
                    // If we can't load profiles, just continue
                }

                isCompleted = true
                quickPick.dispose()
                resolve(value)
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.show()
        })
    }

    /**
     * Gets access key ID input with back navigation
     */
    private static async getAccessKeyIdInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = this.createInputQuickPick(
                'Add New AWS Profile - Step 2 of 5',
                'Type your AWS Access Key ID (e.g., AKIAIOSFODNN7EXAMPLE)'
            )
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidChangeValue((value) => {
                // Show placeholder when empty
                if (!value) {
                    quickPick.items = [
                        {
                            label: '$(key) Enter AWS Access Key ID',
                            description: 'e.g., AKIAIOSFODNN7EXAMPLE',
                            detail: 'Access Key IDs are typically 16-32 characters long',
                        },
                    ]
                    return
                }

                // Validate input as user types (AWS STS API: 16-128 chars, pattern [\w]*)
                // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
                if (!this.accessKeyIdPattern.test(value)) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: '$(error) Invalid characters',
                            detail: 'Access Key IDs can only contain letters, numbers, and underscores',
                        },
                    ]
                } else if (value.length < 16) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: `$(info) Too short (${value.length}/16 min)`,
                            detail: 'AWS Access Key IDs must be 16-128 characters long',
                        },
                    ]
                } else if (value.length > 128) {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: `$(error) Too long (${value.length}/128 max)`,
                            detail: 'AWS Access Key IDs must be 16-128 characters long',
                        },
                    ]
                } else {
                    quickPick.items = [
                        {
                            label: `${value}`,
                            description: `$(check) Valid (${value.length} characters)`,
                            detail: 'Press Enter to use this Access Key ID',
                        },
                    ]
                }
            })

            quickPick.onDidAccept(() => {
                const value = quickPick.value.trim()

                // Validate final input (AWS STS API: 16-128 chars, pattern [\w]*)
                // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
                if (!value) {
                    return // Don't accept empty input
                }
                if (!this.accessKeyIdPattern.test(value)) {
                    return // Don't accept invalid characters
                }
                if (value.length < 16 || value.length > 128) {
                    return // Don't accept invalid length
                }

                isCompleted = true
                quickPick.dispose()
                resolve(value)
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.show()
        })
    }

    /**
     * Gets secret access key input with back navigation
     */
    private static async getSecretAccessKeyInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = this.createInputQuickPick(
                'Add New AWS Profile - Step 3 of 5',
                'Type your AWS Secret Access Key (will be hidden when typing)'
            )
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidChangeValue((value) => {
                // Show placeholder when empty
                if (!value) {
                    quickPick.items = [
                        {
                            label: '$(lock) Enter AWS Secret Access Key',
                            description: 'Required field',
                            detail: 'Enter your AWS Secret Access Key',
                        },
                    ]
                    return
                }

                // AWS STS API: Required, no specific pattern/length constraints in docs
                // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
                quickPick.items = [
                    {
                        label: '•'.repeat(Math.min(value.length, 40)),
                        description: `$(check) ${value.length} characters entered`,
                        detail: 'Press Enter to continue',
                    },
                ]
            })

            quickPick.onDidAccept(() => {
                const value = quickPick.value.trim()

                // Validate final input - AWS STS API only requires non-empty
                // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
                if (!value) {
                    return // Don't accept empty input
                }

                isCompleted = true
                quickPick.dispose()
                resolve(value)
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.show()
        })
    }

    /**
     * Gets session token input with back navigation
     */
    private static async getSessionTokenInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = this.createInputQuickPick(
                'Add New AWS Profile - Step 4 of 5',
                'Enter your AWS Session Token (optional for temporary credentials)'
            )

            // Start with skip option only
            quickPick.items = [
                {
                    label: '$(arrow-right) Skip',
                    description: 'Skip session token (for permanent credentials)',
                    detail: 'Use this for regular IAM user access keys',
                    action: SessionTokenAction.Skip,
                } as vscode.QuickPickItem & { action: SessionTokenAction },
            ]

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === vscode.QuickInputButtons.Back) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidChangeValue((value) => {
                if (!value) {
                    // Show skip option when empty
                    quickPick.items = [
                        {
                            label: '$(arrow-right) Skip',
                            description: 'Skip session token (for permanent credentials)',
                            detail: 'Use this for regular IAM user access keys',
                            action: SessionTokenAction.Skip,
                        } as vscode.QuickPickItem & { action: SessionTokenAction },
                    ]
                    return
                }

                // AWS STS API: Required for temporary credentials, no specific pattern/length constraints in docs
                // Reference: https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
                quickPick.items = [
                    {
                        label: '•'.repeat(Math.min(value.length, 40)),
                        description: `$(check) ${value.length} characters entered`,
                        detail: 'Press Enter to use this session token',
                        action: SessionTokenAction.UseToken,
                    } as vscode.QuickPickItem & { action: SessionTokenAction },
                    {
                        label: '$(arrow-right) Skip',
                        description: 'Skip session token (for permanent credentials)',
                        detail: 'Use this for regular IAM user access keys',
                        action: SessionTokenAction.Skip,
                    } as vscode.QuickPickItem & { action: SessionTokenAction },
                ]
            })

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                const currentValue = quickPick.value

                isCompleted = true
                quickPick.dispose()

                // If user typed something and pressed Enter without selecting an item, use the typed value (trimmed)
                if (!selectedItem && currentValue) {
                    resolve(currentValue.trim())
                    return
                }

                // If no selection with empty value, skip
                if (!selectedItem) {
                    resolve('')
                    return
                }

                const itemWithAction = selectedItem as vscode.QuickPickItem & { action: SessionTokenAction }

                // Handle based on action
                switch (itemWithAction.action) {
                    case SessionTokenAction.Skip:
                        resolve('')
                        break
                    case SessionTokenAction.UseToken:
                        resolve(currentValue.trim())
                        break
                    case SessionTokenAction.Warning:
                        // User can still proceed with warning, use the typed value
                        resolve(currentValue.trim())
                        break
                    default:
                        resolve('')
                }
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.show()
        })
    }

    /**
     * Ensures the ~/.aws directory exists
     */
    private static async ensureAwsDirectoryExists(): Promise<void> {
        const awsDir = path.join(fs.getUserHomeDir(), '.aws')
        if (!(await fs.existsDir(awsDir))) {
            await fs.mkdir(awsDir)
        }
    }

    /**
     * Adds a new profile to the credentials file or overwrites existing one
     */
    private static async addProfileToCredentialsFile(
        profileName: string,
        accessKeyId: string,
        secretAccessKey: string,
        sessionToken?: string,
        region?: string
    ): Promise<void> {
        const credentialsPath = getCredentialsFilename()

        // Ensure the .aws directory exists
        await this.ensureAwsDirectoryExists()

        // Read existing content or create new
        let content = ''
        if (await fs.existsFile(credentialsPath)) {
            content = await fs.readFileText(credentialsPath)
        }

        // Create new profile lines (no spaces around =)
        const newProfileLines = [
            `[${profileName}]`,
            `aws_access_key_id=${accessKeyId}`,
            `aws_secret_access_key=${secretAccessKey}`,
        ]

        if (sessionToken) {
            newProfileLines.push(`aws_session_token=${sessionToken}`)
        }

        if (region) {
            newProfileLines.push(`region=${region}`)
        }

        // Parse the file line by line to handle profile replacement properly
        const lines = content.split(os.EOL)
        const newLines: string[] = []
        let inTargetProfile = false
        let profileFound = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()

            // Check if this is a profile header
            if (line.startsWith('[') && line.endsWith(']')) {
                const currentProfileName = line.slice(1, -1)

                if (currentProfileName === profileName) {
                    // Found the target profile - replace it
                    if (!profileFound) {
                        newLines.push(...newProfileLines)
                        profileFound = true
                    }
                    inTargetProfile = true
                    continue
                } else {
                    // Different profile - end replacement mode
                    inTargetProfile = false
                    newLines.push(lines[i])
                }
            } else if (!inTargetProfile) {
                // Not in target profile, keep the line
                newLines.push(lines[i])
            }
            // If inTargetProfile is true, we skip the line (removing old profile content)
        }

        // If profile wasn't found, add it at the end
        if (!profileFound) {
            if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
                newLines.push('') // Add blank line before new profile
            }
            newLines.push(...newProfileLines)
        }

        // Update content with the new lines
        content = newLines.join(os.EOL)

        // Write back to file
        await fs.writeFile(credentialsPath, content)
    }

    /**
     * Updates an existing profile with a new region
     */
    private static async updateProfileRegion(profileName: string, region: string): Promise<void> {
        const logger = this.logger

        try {
            logger.debug(`Updating profile ${profileName} with region ${region}`)

            // Check both config and credential files
            const filepathsToCheck = [getCredentialsFilename(), getConfigFilename()]

            let profileUpdated = false

            for (const filePath of filepathsToCheck) {
                // File does not exist, try next file
                if (!(await fs.existsFile(filePath))) {
                    continue
                }

                const content = await fs.readFileText(filePath)
                const sections = parseIni(content, vscode.Uri.file(filePath))

                // Find the profile section in this file
                const profileSection = sections.find(
                    (section) => section.type === 'profile' && section.name === profileName
                )

                // Profile not in this file, try next file
                if (!profileSection) {
                    continue
                }

                // Find the profile section boundaries using the startLines from parsed section
                const profileStartLine = profileSection.startLines[0]
                const lines = content.split(os.EOL)

                // Find the next profile section or end of file
                let profileEndLine = lines.length
                for (let i = profileStartLine + 1; i < lines.length; i++) {
                    if (lines[i].match(/^\s*\[([^\[\]]+)]\s*$/)) {
                        profileEndLine = i
                        break
                    }
                }

                // Extract the profile section lines
                const profileLines = lines.slice(profileStartLine, profileEndLine)

                // Check if region already exists in the profile
                const regionLineIndex = profileLines.findIndex((line) => this.regionLinePattern.test(line))

                if (regionLineIndex !== -1) {
                    // Replace existing region
                    profileLines[regionLineIndex] = `region = ${region}`
                } else {
                    // Add region to the profile (after the last non-empty line)
                    let lastNonEmptyIndex = -1
                    for (let i = profileLines.length - 1; i >= 0; i--) {
                        if (profileLines[i].trim() !== '') {
                            lastNonEmptyIndex = i
                            break
                        }
                    }
                    profileLines.splice(lastNonEmptyIndex + 1, 0, `region = ${region}`)
                }

                // Reconstruct the file content
                const updatedLines = [
                    ...lines.slice(0, profileStartLine),
                    ...profileLines,
                    ...lines.slice(profileEndLine),
                ]
                const updatedContent = updatedLines.join(os.EOL)

                // Write back to file
                await fs.writeFile(filePath, updatedContent)

                logger.debug(`Successfully updated profile ${profileName} with region ${region} in ${filePath}`)
                profileUpdated = true
                break
            }

            if (!profileUpdated) {
                throw new ToolkitError(`Profile ${profileName} not found in credentials or config file`, {
                    code: 'ProfileNotFound',
                })
            }
        } catch (error) {
            logger.error('Failed to update profile region: %s', error)
            throw new ToolkitError(`Failed to update profile region: ${(error as Error).message}`, {
                code: 'UpdateProfileError',
            })
        }
    }
}
