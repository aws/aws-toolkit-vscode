/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import { loadSharedCredentialsProfiles } from '../../../auth/credentials/sharedCredentials'
import { getCredentialsFilename, getConfigFilename } from '../../../auth/credentials/sharedCredentialsFile'
import { SmusErrorCodes } from '../../shared/smusUtils'
import fs from '../../../shared/fs/fs'

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
    private static readonly logger = getLogger()

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
            const profileItems: vscode.QuickPickItem[] = profileNames.map((profileName) => {
                const profile = profiles[profileName]
                const region = profile.region || 'not-set'

                return {
                    label: `$(key) ${profileName}`,
                    description: `IAM Credentials, configured locally (${region})`,
                    detail: `Profile: ${profileName} | Region: ${region}`,
                    // Store profile data for easy access
                    profileName,
                    region,
                } as vscode.QuickPickItem & { profileName: string; region: string }
            })

            // Add "Add and edit credentials" option
            const addCredentialsItem: vscode.QuickPickItem = {
                label: '$(add) Add and edit credentials',
                description: 'Manage AWS credential profiles',
                detail: 'Add new profiles or edit existing credential files',
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

                    // Check if user selected "Add and edit credentials"
                    if (selectedItem === addCredentialsItem) {
                        // Handle the async credential management flow
                        void (async () => {
                            try {
                                const shouldRestart = await SmusIamProfileSelector.showCredentialManagement()
                                if (shouldRestart) {
                                    // Only restart if user completed the "Add New Profile" flow
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
                    const profileItem = selectedItem as vscode.QuickPickItem & { profileName: string; region: string }

                    logger.debug(`SMUS Auth: User selected profile: ${profileItem.profileName}`)

                    // Check if region is not set and prompt for region selection
                    if (profileItem.region === 'not-set') {
                        void (async () => {
                            try {
                                const selectedRegion = await SmusIamProfileSelector.showRegionSelection()

                                // Update the profile with the selected region
                                await SmusIamProfileSelector.updateProfileRegion(
                                    profileItem.profileName,
                                    selectedRegion
                                )

                                resolve({
                                    profileName: profileItem.profileName,
                                    region: selectedRegion,
                                })
                            } catch (error) {
                                reject(error)
                            }
                        })()
                    } else {
                        resolve({
                            profileName: profileItem.profileName,
                            region: profileItem.region,
                        })
                    }
                })

                quickPick.onDidTriggerButton((button) => {
                    if (button === backButton) {
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
            logger.error('SMUS Auth: Failed to show IAM profile selection: %s', error)
            throw ToolkitError.chain(error, 'Failed to show IAM profile selection')
        }
    }

    /**
     * Shows region selection dialog for IAM authentication
     * @param defaultRegion Optional default region to pre-select
     * @returns Promise resolving to the selected region or 'BACK' if user wants to go back
     */
    public static async showRegionSelection(defaultRegion?: string): Promise<string> {
        const logger = this.logger

        // Common AWS regions
        const regions = [
            { name: 'US East (N. Virginia)', code: 'us-east-1' },
            { name: 'US East (Ohio)', code: 'us-east-2' },
            { name: 'US West (Oregon)', code: 'us-west-2' },
            { name: 'US West (N. California)', code: 'us-west-1' },
            { name: 'Europe (Ireland)', code: 'eu-west-1' },
            { name: 'Europe (London)', code: 'eu-west-2' },
            { name: 'Europe (Frankfurt)', code: 'eu-central-1' },
            { name: 'Asia Pacific (Singapore)', code: 'ap-southeast-1' },
            { name: 'Asia Pacific (Sydney)', code: 'ap-southeast-2' },
            { name: 'Asia Pacific (Tokyo)', code: 'ap-northeast-1' },
        ]

        const regionItems: vscode.QuickPickItem[] = regions.map(
            (region) =>
                ({
                    label: region.name,
                    description: region.code,
                    detail: `AWS Region: ${region.code}`,
                    regionCode: region.code,
                }) as vscode.QuickPickItem & { regionCode: string }
        )

        const quickPick = vscode.window.createQuickPick()
        quickPick.title = 'Select AWS Region'
        quickPick.placeholder = 'Choose the AWS region for SageMaker Unified Studio'
        quickPick.items = regionItems
        quickPick.canSelectMany = false
        quickPick.ignoreFocusOut = true

        // Add back button
        const backButton = vscode.QuickInputButtons.Back
        quickPick.buttons = [backButton]

        // Pre-select default region if provided
        if (defaultRegion) {
            const defaultItem = regionItems.find((item) => (item as any).regionCode === defaultRegion)
            if (defaultItem) {
                quickPick.activeItems = [defaultItem]
            }
        }

        return new Promise((resolve, reject) => {
            let isCompleted = false

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                if (!selectedItem) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('No region selected', { code: SmusErrorCodes.UserCancelled, cancelled: true })
                    )
                    return
                }

                isCompleted = true
                quickPick.dispose()

                const regionItem = selectedItem as vscode.QuickPickItem & { regionCode: string }

                logger.debug(`SMUS Auth: User selected region: ${regionItem.regionCode}`)

                resolve(regionItem.regionCode)
            })

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    reject(
                        new ToolkitError('Region selection cancelled', {
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
     * Validates an IAM credential profile
     * @param profileName Profile name to validate
     * @returns Promise resolving to validation result
     */
    public static async validateProfile(profileName: string): Promise<{ isValid: boolean; error?: string }> {
        const logger = this.logger

        try {
            logger.debug(`SMUS Auth: Validating profile: ${profileName}`)

            // Load profiles to check if the profile exists
            const profiles = await loadSharedCredentialsProfiles()

            if (!profiles[profileName]) {
                return {
                    isValid: false,
                    error: `Profile '${profileName}' not found in AWS credentials`,
                }
            }

            const profile = profiles[profileName]

            // Basic validation - check for required fields
            if (!profile.aws_access_key_id && !profile.role_arn && !profile.sso_start_url) {
                return {
                    isValid: false,
                    error: `Profile '${profileName}' is missing required credentials`,
                }
            }

            logger.debug(`SMUS Auth: Profile validation successful: ${profileName}`)

            return { isValid: true }
        } catch (error) {
            logger.error(`SMUS Auth: Profile validation failed: ${profileName}`, error)

            return {
                isValid: false,
                error: `Failed to validate profile '${profileName}': ${(error as Error).message}`,
            }
        }
    }

    /**
     * Shows credential management options (Add/Edit credentials)
     * @returns Promise resolving to boolean indicating if profile selection should restart
     */
    public static async showCredentialManagement(): Promise<boolean> {
        const logger = this.logger

        logger.debug('SMUS Auth: Showing credential management options')

        const options: vscode.QuickPickItem[] = [
            {
                label: '$(file-text) Edit AWS Credentials File',
                description: 'Open ~/.aws/credentials file for editing',
                detail: 'Edit existing credential profiles or add new ones',
            },
            {
                label: '$(file-text) Edit AWS Config File',
                description: 'Open ~/.aws/config file for editing',
                detail: 'Edit AWS configuration settings and profiles',
            },
            {
                label: '$(add) Add New Profile',
                description: 'Create a new AWS credential profile',
                detail: 'Interactive setup for a new credential profile',
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
                        if (selectedItem.label.includes('Edit AWS Credentials File')) {
                            const result = await this.openCredentialsFile()
                            // If user clicked "Select Profile", restart profile selection
                            resolve(result === 'RESTART_PROFILE_SELECTION')
                        } else if (selectedItem.label.includes('Edit AWS Config File')) {
                            const result = await this.openConfigFile()
                            // If user clicked "Select Profile", restart profile selection
                            resolve(result === 'RESTART_PROFILE_SELECTION')
                        } else if (selectedItem.label.includes('Add New Profile')) {
                            await this.addNewProfile()
                            // Restart profile selection after adding new profile
                            resolve(true)
                        }
                    } catch (error) {
                        if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                            // User cancelled, don't treat as error
                            reject(error)
                        } else {
                            reject(error)
                        }
                    }
                })()
            })

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
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
    private static async openCredentialsFile(): Promise<void | 'RESTART_PROFILE_SELECTION'> {
        const logger = this.logger

        try {
            const credentialsPath = getCredentialsFilename()
            logger.debug(`SMUS Auth: Opening credentials file: ${credentialsPath}`)

            // Ensure the .aws directory exists
            await this.ensureAwsDirectoryExists()

            // Create the file if it doesn't exist
            if (!(await fs.existsFile(credentialsPath))) {
                await fs.writeFile(credentialsPath, this.getDefaultCredentialsContent())
                logger.debug('SMUS Auth: Created new credentials file')
            }

            // Open the file in VS Code
            const document = await vscode.workspace.openTextDocument(credentialsPath)
            await vscode.window.showTextDocument(document)

            // Show helpful message with options
            const action = await vscode.window.showInformationMessage(
                'AWS credentials file opened. You can edit your profiles or select an existing one.',
                'Select Profile',
                'Open Credentials File',
                'Done'
            )

            if (action === 'Select Profile') {
                // Directly restart profile selection - much cleaner than throwing errors
                return 'RESTART_PROFILE_SELECTION'
            } else if (action === 'Open Credentials File') {
                // Keep the file open and let user edit
                // File is already open, nothing more to do
            }
            // If "Done" or dismissed, just continue

            logger.debug('SMUS Auth: Credentials file opened successfully')
        } catch (error) {
            logger.error('SMUS Auth: Failed to open credentials file: %s', error)
            throw new ToolkitError(`Failed to open AWS credentials file: ${(error as Error).message}`, {
                code: 'CredentialsFileError',
            })
        }
    }

    /**
     * Opens the AWS config file in VS Code editor
     */
    private static async openConfigFile(): Promise<void | 'RESTART_PROFILE_SELECTION'> {
        const logger = this.logger

        try {
            const configPath = getConfigFilename()
            logger.debug(`SMUS Auth: Opening config file: ${configPath}`)

            // Ensure the .aws directory exists
            await this.ensureAwsDirectoryExists()

            // Create the file if it doesn't exist
            if (!(await fs.existsFile(configPath))) {
                await fs.writeFile(configPath, this.getDefaultConfigContent())
                logger.debug('SMUS Auth: Created new config file')
            }

            // Open the file in VS Code
            const document = await vscode.workspace.openTextDocument(configPath)
            await vscode.window.showTextDocument(document)

            // Show helpful message with options
            const action = await vscode.window.showInformationMessage(
                'AWS config file opened. You can edit your configuration or select an existing profile.',
                'Select Profile',
                'Open Config File',
                'Done'
            )

            if (action === 'Select Profile') {
                // Directly restart profile selection - much cleaner than throwing errors
                return 'RESTART_PROFILE_SELECTION'
            } else if (action === 'Open Config File') {
                // Keep the file open and let user edit
                // File is already open, nothing more to do
            }
            // If "Done" or dismissed, just continue

            logger.debug('SMUS Auth: Config file opened successfully')
        } catch (error) {
            logger.error('SMUS Auth: Failed to open config file: %s', error)
            throw new ToolkitError(`Failed to open AWS config file: ${(error as Error).message}`, {
                code: 'ConfigFileError',
            })
        }
    }

    /**
     * Interactive flow to add a new AWS credential profile with back navigation
     */
    private static async addNewProfile(): Promise<void> {
        const logger = this.logger

        try {
            logger.debug('SMUS Auth: Starting add new profile flow')

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
            const openFile = await vscode.window.showInformationMessage(
                `AWS profile '${profileData.profileName}' has been added successfully!`,
                'Open Credentials File',
                'Done'
            )

            if (openFile === 'Open Credentials File') {
                await this.openCredentialsFile()
            }

            logger.debug(`SMUS Auth: Successfully added new profile: ${profileData.profileName}`)
        } catch (error) {
            // Only log actual errors, not user cancellations
            if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                logger.debug('SMUS Auth: User cancelled add new profile flow')
                throw error // Re-throw for telemetry but don't log as error
            }
            logger.error('SMUS Auth: Failed to add new profile: %s', error)
            throw new ToolkitError(`Failed to add new profile: ${(error as Error).message}`, {
                code: 'AddProfileError',
            })
        }
    }

    /**
     * Collects profile data through a multi-step flow with back navigation
     */
    private static async collectProfileData(): Promise<
        | {
              profileName: string
              accessKeyId: string
              secretAccessKey: string
              sessionToken?: string
              region?: string
          }
        | 'BACK'
    > {
        let currentStep = 1
        let profileName = ''
        let accessKeyId = ''
        let secretAccessKey = ''
        let sessionToken = ''
        let region = ''

        while (currentStep <= 5) {
            switch (currentStep) {
                case 1: {
                    // Step 1: Profile Name
                    const result = await this.getProfileNameInput()
                    if (result === 'BACK') {
                        return 'BACK' // Exit the entire flow
                    }
                    profileName = result
                    currentStep = 2
                    break
                }
                case 2: {
                    // Step 2: Access Key ID
                    const result = await this.getAccessKeyIdInput()
                    if (result === 'BACK') {
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
                    // Step 5: Region (optional)
                    const result = await this.getRegionInput()
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
            region: region || undefined,
        }
    }

    /**
     * Gets profile name input with back navigation and existing profile validation
     */
    private static async getProfileNameInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Add New AWS Profile - Step 1 of 5'
            quickPick.placeholder = 'Type a profile name (e.g., my-profile, dev, prod)'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Enable text input
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
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
                            label: '$(error) Profile name cannot contain spaces',
                            description: 'Remove spaces from the profile name',
                            detail: 'Valid characters: letters, numbers, hyphens, underscores',
                        },
                    ]
                } else if (!/^[a-zA-Z0-9_-]*$/.test(value)) {
                    quickPick.items = [
                        {
                            label: '$(error) Invalid characters in profile name',
                            description: 'Profile names can only contain letters, numbers, hyphens, and underscores',
                            detail: `Current input: "${value}"`,
                        },
                    ]
                } else if (value.length < 2) {
                    quickPick.items = [
                        {
                            label: '$(info) Profile name is too short',
                            description: 'Profile names should be at least 2 characters long',
                            detail: `Current length: ${value.length} characters`,
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
                                    label: `$(warning) ${value}`,
                                    description: 'Profile already exists - will be overwritten',
                                    detail: 'Press Enter to overwrite the existing profile',
                                },
                            ]
                        } else {
                            quickPick.items = [
                                {
                                    label: `$(check) ${value}`,
                                    description: 'Press Enter to use this profile name',
                                    detail: `Valid profile name (${value.length} characters)`,
                                },
                            ]
                        }
                    } catch (error) {
                        // If we can't load profiles, just show as valid
                        quickPick.items = [
                            {
                                label: `$(check) ${value}`,
                                description: 'Press Enter to use this profile name',
                                detail: `Valid profile name (${value.length} characters)`,
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
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
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
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Add New AWS Profile - Step 2 of 5'
            quickPick.placeholder = 'Type your AWS Access Key ID (e.g., AKIAIOSFODNN7EXAMPLE)'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Enable text input
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
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

                // Validate input as user types
                if (!/^[A-Z0-9]*$/.test(value)) {
                    quickPick.items = [
                        {
                            label: '$(error) Invalid characters in Access Key ID',
                            description: 'Access Key IDs should only contain uppercase letters and numbers',
                            detail: `Current input: "${value}"`,
                        },
                    ]
                } else if (value.length < 16) {
                    quickPick.items = [
                        {
                            label: '$(info) Access Key ID seems short',
                            description: 'Access Key IDs are typically 16-32 characters long',
                            detail: `Current length: ${value.length} characters`,
                        },
                    ]
                } else if (value.length > 32) {
                    quickPick.items = [
                        {
                            label: '$(error) Access Key ID seems too long',
                            description: 'Access Key IDs are typically 16-32 characters long',
                            detail: `Current length: ${value.length} characters`,
                        },
                    ]
                } else {
                    quickPick.items = [
                        {
                            label: `$(check) ${value}`,
                            description: 'Press Enter to use this Access Key ID',
                            detail: `Valid Access Key ID (${value.length} characters)`,
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
                if (value.length < 16 || value.length > 32) {
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
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Add New AWS Profile - Step 3 of 5'
            quickPick.placeholder = 'Type your AWS Secret Access Key (will be hidden when typing)'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            // Add back button
            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Enable text input
            quickPick.items = []

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
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
                            description: 'e.g., wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                            detail: 'Secret Access Keys are typically 40+ characters long',
                        },
                    ]
                    return
                }

                // Validate input as user types (but don't show the actual value for security)
                if (value.length < 20) {
                    quickPick.items = [
                        {
                            label: '$(info) Secret Access Key seems short',
                            description: 'Secret Access Keys are typically 40+ characters long',
                            detail: `Current length: ${value.length} characters`,
                        },
                    ]
                } else if (value.length >= 20) {
                    quickPick.items = [
                        {
                            label: `$(check) Secret Access Key entered (${value.length} characters)`,
                            description: 'Press Enter to use this Secret Access Key',
                            detail: 'Secret key length looks good',
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
                if (value.length < 20) {
                    return // Don't accept keys that are too short
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
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Add New AWS Profile - Step 4 of 5'
            quickPick.placeholder = 'Enter your AWS Session Token (optional for temporary credentials)'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            // Start with skip option only
            quickPick.items = [
                {
                    label: '$(arrow-right) Skip',
                    description: 'Skip session token (for permanent credentials)',
                    detail: 'Use this for regular IAM user access keys',
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
                    // Show skip option when empty
                    quickPick.items = [
                        {
                            label: '$(arrow-right) Skip',
                            description: 'Skip session token (for permanent credentials)',
                            detail: 'Use this for regular IAM user access keys',
                        },
                    ]
                    return
                }

                // Validate input as user types
                if (value.length < 50) {
                    quickPick.items = [
                        {
                            label: '$(warning) Session token seems too short',
                            description: 'AWS session tokens are typically much longer',
                            detail: `Current length: ${value.length} characters`,
                        },
                        {
                            label: '$(arrow-right) Skip',
                            description: 'Skip session token (for permanent credentials)',
                            detail: 'Use this for regular IAM user access keys',
                        },
                    ]
                } else {
                    quickPick.items = [
                        {
                            label: '$(check) Use this session token',
                            description: 'Session token looks valid',
                            detail: `Length: ${value.length} characters`,
                        },
                        {
                            label: '$(arrow-right) Skip',
                            description: 'Skip session token (for permanent credentials)',
                            detail: 'Use this for regular IAM user access keys',
                        },
                    ]
                }
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

                // If user selected skip or no selection with empty value
                if (!selectedItem || selectedItem.label.includes('Skip')) {
                    resolve('')
                    return
                }

                // If user selected "Use this session token", use the typed value (trimmed)
                if (selectedItem.label.includes('Use this session token')) {
                    resolve(currentValue.trim())
                    return
                }

                // Default to empty
                resolve('')
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
     * Gets region input with back navigation
     */
    private static async getRegionInput(): Promise<string | 'BACK'> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Add New AWS Profile - Step 5 of 5'
            quickPick.placeholder = 'Select a default region (optional)'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            const backButton = vscode.QuickInputButtons.Back
            quickPick.buttons = [backButton]

            const regions = [
                { name: 'US East (N. Virginia)', code: 'us-east-1' },
                { name: 'US East (Ohio)', code: 'us-east-2' },
                { name: 'US West (Oregon)', code: 'us-west-2' },
                { name: 'US West (N. California)', code: 'us-west-1' },
                { name: 'Europe (Ireland)', code: 'eu-west-1' },
                { name: 'Europe (London)', code: 'eu-west-2' },
                { name: 'Europe (Frankfurt)', code: 'eu-central-1' },
                { name: 'Asia Pacific (Singapore)', code: 'ap-southeast-1' },
                { name: 'Asia Pacific (Sydney)', code: 'ap-southeast-2' },
                { name: 'Asia Pacific (Tokyo)', code: 'ap-northeast-1' },
            ]

            const regionItems = regions.map((region) => ({
                label: region.name,
                description: region.code,
                detail: `AWS Region: ${region.code}`,
                regionCode: region.code,
            }))

            const skipItem = {
                label: '$(arrow-right) Skip',
                description: 'No default region',
                detail: 'You can set this later if needed',
            }

            quickPick.items = [...regionItems, skipItem]

            let isCompleted = false

            quickPick.onDidTriggerButton((button) => {
                if (button === backButton) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve('BACK')
                }
            })

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]
                if (!selectedItem) {
                    return
                }

                isCompleted = true
                quickPick.dispose()

                if (selectedItem === skipItem) {
                    resolve('')
                } else {
                    const regionItem = selectedItem as any
                    resolve(regionItem.regionCode)
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
        const lines = content.split('\n')
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
        content = newLines.join('\n')

        // Write back to file
        await fs.writeFile(credentialsPath, content)
    }

    /**
     * Updates an existing profile with a new region
     */
    private static async updateProfileRegion(profileName: string, region: string): Promise<void> {
        const logger = this.logger

        try {
            logger.debug(`SMUS Auth: Updating profile ${profileName} with region ${region}`)

            const credentialsPath = getCredentialsFilename()

            if (!(await fs.existsFile(credentialsPath))) {
                throw new ToolkitError('Credentials file not found', { code: 'CredentialsFileNotFound' })
            }

            // Read the current credentials file
            const content = await fs.readFileText(credentialsPath)

            // Find the profile section
            const profileSectionRegex = new RegExp(`^\\[${profileName}\\]$`, 'm')
            const profileMatch = content.match(profileSectionRegex)

            if (!profileMatch) {
                throw new ToolkitError(`Profile ${profileName} not found in credentials file`, {
                    code: 'ProfileNotFound',
                })
            }

            // Find the next profile section or end of file
            const profileStartIndex = profileMatch.index!
            const nextProfileMatch = content.slice(profileStartIndex + 1).match(/^\[.*\]$/m)
            const profileEndIndex = nextProfileMatch ? profileStartIndex + 1 + nextProfileMatch.index! : content.length

            // Extract the profile section
            const profileSection = content.slice(profileStartIndex, profileEndIndex)

            // Check if region already exists in the profile
            const regionRegex = /^region\s*=.*$/m
            let updatedProfileSection: string

            if (regionRegex.test(profileSection)) {
                // Replace existing region
                updatedProfileSection = profileSection.replace(regionRegex, `region = ${region}`)
            } else {
                // Add region to the profile (before any empty lines at the end)
                const lines = profileSection.split('\n')
                // Find the last non-empty line index (compatible with older JS versions)
                let lastNonEmptyIndex = -1
                for (let i = lines.length - 1; i >= 0; i--) {
                    if (lines[i].trim() !== '') {
                        lastNonEmptyIndex = i
                        break
                    }
                }
                lines.splice(lastNonEmptyIndex + 1, 0, `region = ${region}`)
                updatedProfileSection = lines.join('\n')
            }

            // Replace the profile section in the content
            const updatedContent =
                content.slice(0, profileStartIndex) + updatedProfileSection + content.slice(profileEndIndex)

            // Write back to file
            await fs.writeFile(credentialsPath, updatedContent)

            logger.debug(`SMUS Auth: Successfully updated profile ${profileName} with region ${region}`)
        } catch (error) {
            logger.error('SMUS Auth: Failed to update profile region: %s', error)
            throw new ToolkitError(`Failed to update profile region: ${(error as Error).message}`, {
                code: 'UpdateProfileError',
            })
        }
    }

    /**
     * Returns default content for a new credentials file
     */
    private static getDefaultCredentialsContent(): string {
        return `# AWS Credentials File
# 
# This file stores your AWS access credentials.
# Each profile should have the following format:
#
# For permanent credentials:
# [profile-name]
# aws_access_key_id = YOUR_ACCESS_KEY_ID
# aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
# region = us-east-1
#
# For temporary/role-based credentials:
# [temp-profile]
# aws_access_key_id = YOUR_ACCESS_KEY_ID
# aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
# aws_session_token = YOUR_SESSION_TOKEN
# region = us-east-1
#
# Example:
# [default]
# aws_access_key_id = AKIAIOSFODNN7EXAMPLE
# aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# region = us-east-1

`
    }

    /**
     * Returns default content for a new config file
     */
    private static getDefaultConfigContent(): string {
        return `# AWS Config File
#
# This file stores AWS configuration settings.
# Each profile should have the following format:
#
# [profile profile-name]
# region = us-east-1
# output = json
#
# For the default profile, use:
# [default]
# region = us-east-1
# output = json

`
    }
}
