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
}
