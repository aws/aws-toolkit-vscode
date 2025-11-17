/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals.js'
import { SmusAuthenticationMethod } from '../ui/authenticationMethodSelection.js'

/**
 * Configuration for IAM profile preferences
 */
export interface SmusIamProfileConfig {
    profileName: string
    region: string
    lastUsed?: Date
    isDefault?: boolean
}

/**
 * SMUS authentication preferences
 */
export interface SmusAuthenticationPreferences {
    preferredMethod?: SmusAuthenticationMethod
    lastUsedSsoConnection?: string
    lastUsedIamProfile?: SmusIamProfileConfig
    rememberChoice: boolean
}

/**
 * Manager for SMUS authentication preferences
 */
export class SmusAuthenticationPreferencesManager {
    private static readonly logger = getLogger()
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private static readonly PREFERENCES_KEY = 'aws.smus.authenticationPreferences'

    /**
     * Gets the current authentication preferences
     * @param context VS Code extension context (unused, kept for API compatibility)
     * @returns Current authentication preferences
     */
    public static getPreferences(context?: vscode.ExtensionContext): SmusAuthenticationPreferences {
        const stored = globals.globalState.get<SmusAuthenticationPreferences>(this.PREFERENCES_KEY)

        return {
            rememberChoice: false,
            ...stored,
        }
    }

    /**
     * Updates authentication preferences
     * @param context VS Code extension context (unused, kept for API compatibility)
     * @param preferences Preferences to update
     */
    public static async updatePreferences(
        context: vscode.ExtensionContext,
        preferences: Partial<SmusAuthenticationPreferences>
    ): Promise<void> {
        const logger = this.logger

        const current = this.getPreferences()
        const updated = { ...current, ...preferences }

        logger.debug(
            `SMUS Auth: Updating authentication preferences - preferredMethod: ${updated.preferredMethod}, rememberChoice: ${updated.rememberChoice}`
        )

        await globals.globalState.update(this.PREFERENCES_KEY, updated)
    }

    /**
     * Sets the preferred authentication method
     * @param context VS Code extension context
     * @param method Preferred authentication method
     * @param rememberChoice Whether to remember this choice
     */
    public static async setPreferredMethod(
        context: vscode.ExtensionContext,
        method: SmusAuthenticationMethod,
        rememberChoice: boolean
    ): Promise<void> {
        await this.updatePreferences(context, {
            preferredMethod: method,
            rememberChoice,
        })
    }

    /**
     * Gets the preferred authentication method
     * @param context VS Code extension context (unused, kept for API compatibility)
     * @returns Preferred authentication method or undefined if not set
     */
    public static getPreferredMethod(context?: vscode.ExtensionContext): SmusAuthenticationMethod | undefined {
        const preferences = this.getPreferences()
        return preferences.rememberChoice ? preferences.preferredMethod : undefined
    }

    /**
     * Sets the last used SSO connection
     * @param context VS Code extension context
     * @param connectionId Connection ID
     */
    public static async setLastUsedSsoConnection(
        context: vscode.ExtensionContext,
        connectionId: string
    ): Promise<void> {
        await this.updatePreferences(context, {
            lastUsedSsoConnection: connectionId,
        })
    }

    /**
     * Sets the last used IAM profile configuration
     * @param context VS Code extension context
     * @param profileConfig IAM profile configuration
     */
    public static async setLastUsedIamProfile(
        context: vscode.ExtensionContext,
        profileConfig: SmusIamProfileConfig
    ): Promise<void> {
        await this.updatePreferences(context, {
            lastUsedIamProfile: {
                ...profileConfig,
                lastUsed: new Date(),
            },
        })
    }

    /**
     * Gets the last used IAM profile configuration
     * @param context VS Code extension context (unused, kept for API compatibility)
     * @returns Last used IAM profile configuration or undefined
     */
    public static getLastUsedIamProfile(context?: vscode.ExtensionContext): SmusIamProfileConfig | undefined {
        const preferences = this.getPreferences()
        return preferences.lastUsedIamProfile
    }

    /**
     * Clears all authentication preferences
     * @param context VS Code extension context (unused, kept for API compatibility)
     */
    public static async clearPreferences(context?: vscode.ExtensionContext): Promise<void> {
        const logger = this.logger
        logger.debug('SMUS Auth: Clearing authentication preferences')

        await globals.globalState.update(this.PREFERENCES_KEY, undefined)
    }

    /**
     * Clears only connection-specific preferences, preserving authentication method preference
     * @param context VS Code extension context (unused, kept for API compatibility)
     */
    public static async clearConnectionPreferences(context?: vscode.ExtensionContext): Promise<void> {
        const logger = this.logger
        logger.debug('SMUS Auth: Clearing connection-specific preferences (preserving auth method preference)')

        const currentPrefs = this.getPreferences()

        // Keep only the authentication method preference and rememberChoice flag
        const preservedPrefs: SmusAuthenticationPreferences = {
            preferredMethod: currentPrefs.preferredMethod,
            rememberChoice: currentPrefs.rememberChoice,
            // Clear connection-specific data
            lastUsedSsoConnection: undefined,
            lastUsedIamProfile: undefined,
        }

        await globals.globalState.update(this.PREFERENCES_KEY, preservedPrefs)
    }

    /**
     * Switches the authentication method preference
     * @param context VS Code extension context
     * @param newMethod New authentication method to switch to
     */
    public static async switchAuthenticationMethod(
        context: vscode.ExtensionContext,
        newMethod: SmusAuthenticationMethod
    ): Promise<void> {
        const logger = this.logger
        logger.debug(`SMUS Auth: Switching authentication method to: ${newMethod}`)

        await this.updatePreferences(context, {
            preferredMethod: newMethod,
        })
    }
}
