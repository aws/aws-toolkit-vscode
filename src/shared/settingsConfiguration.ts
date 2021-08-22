/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger'

/**
 * Wraps the VSCode configuration API and provides Toolkit-related
 * configuration functions.
 */
export interface SettingsConfiguration {
    readSetting<T>(settingKey: string): T | undefined
    readSetting<T>(settingKey: string, defaultValue: T): T

    // array values are serialized as a comma-delimited string
    /**
     * Sets a config value.
     *
     * Writing to the (VSCode) config store may fail if the user does not have
     * write permissions, or if some requirement is not met.  For example, the
     * `vscode.ConfigurationTarget.Workspace` scope requires a workspace.
     *
     * @param settingKey  Config key name
     * @param value  Config value
     * @param target  Config _scope_
     *
     * @returns true on success, else false
     */
    writeSetting<T>(settingKey: string, value: T | undefined, target: vscode.ConfigurationTarget): Promise<boolean>
}

// default configuration settings handler for production release
export class DefaultSettingsConfiguration implements SettingsConfiguration {
    public constructor(public readonly extensionSettingsPrefix: string) {}

    public readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix)

        if (!settings) {
            return defaultValue
        }

        const val = settings.get<T>(settingKey)
        return val ?? defaultValue
    }

    public async writeSetting<T>(settingKey: string, value: T, target: vscode.ConfigurationTarget): Promise<boolean> {
        try {
            const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix)
            await settings.update(settingKey, value, target)
            return true
        } catch (e) {
            getLogger().error('failed to set config: %O=%O, error: %O', settingKey, value, e)
            return false
        }
    }
    /**
     * Sets a prompt message as suppressed.
     * @param promptName Name of prompt to suppress
     */
    public async disablePrompt(promptName: string): Promise<void> {
        const setting = await this.getSuppressPromptSetting(promptName)
        if (setting === undefined || setting[promptName]) {
            return
        }
        setting[promptName] = true
        await this.writeSetting('suppressPrompts', setting, vscode.ConfigurationTarget.Global)
    }
    /**
     * Verifies if a prompt should be displayed again.
     * @param promptName Name of the prompt
     * @returns False when prompt has been suppressed
     */
    public async shouldDisplayPrompt(promptName: string): Promise<boolean> {
        const promptSetting = await this.getSuppressPromptSetting(promptName)
        if (promptSetting !== undefined && promptSetting[promptName]) {
            return false
        }
        return true
    }

    /**
     * Gets the 'aws.suppressPrompts' setting. This will reset the setting to default if it does not
     * recieve an object or the prompt's value is not a boolean.
     * @param promptName
     * @returns The settings object
     */
    public async getSuppressPromptSetting(promptName: string): Promise<{ [prompt: string]: boolean } | undefined> {
        try {
            const setting = this.readSetting<{ [prompt: string]: boolean }>('suppressPrompts')
            if (setting === undefined) {
                return undefined
            }

            if (typeof setting !== 'object') {
                getLogger().warn('Setting "aws.suppressPrompts" has an unexpected type. Resetting to default.')
                // writing this setting to an empty object reverts the setting to its default
                await this.writeSetting('suppressPrompts', {}, vscode.ConfigurationTarget.Global)
                return undefined
            }

            if (!(promptName in setting)) {
                getLogger().error(`Prompt not found in "aws.suppressPrompts": ${promptName}`)
                return undefined
            }

            if (typeof setting[promptName] !== 'boolean') {
                getLogger().warn(
                    `Value for prompts in "aws.suppressPrompts" must be type boolean. Resetting prompt: ${promptName}`
                )
                setting[promptName] = false
                await this.writeSetting('suppressPrompts', setting, vscode.ConfigurationTarget.Global)
                return setting
            }

            return setting
        } catch (e) {
            getLogger().error('Failed to get the setting: suppressPrompts', e)
        }
    }
}
