/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigurationTarget } from 'vscode'
import { AwsDevSetting, SettingsConfiguration } from '../../shared/settingsConfiguration'

/**
 * Test utility class with an in-memory Settings Configuration key-value storage
 */
export class TestSettingsConfiguration implements SettingsConfiguration {
    private readonly _data: { [key: string]: any } = {}

    public async disablePrompt(promptName: string): Promise<void> {
        const p = `aws.suppressPrompt.${promptName}`
        this._data[p] = false
    }

    public async isPromptEnabled(promptName: string): Promise<boolean> {
        const p = `aws.suppressPrompt.${promptName}`
        return (this._data[p] ?? true) === true
    }

    public async getSuppressPromptSetting(promptName: string): Promise<{ [prompt: string]: boolean } | undefined> {
        return {}
    }

    public ensureToolkitInVscodeRemoteSsh(): boolean {
        throw new Error('Method not implemented.')
    }

    public readSetting<T>(settingKey: string, defaultValue?: T | undefined): T | undefined {
        return this._data[settingKey] as T
    }

    public getSetting<T>(
        key: string,
        type?: 'string',
        opt?: { silent?: 'no' | 'yes' | 'notfound' | undefined; logging?: boolean | undefined }
    ): T | undefined {
        throw new Error('Method not implemented.')
    }

    public updateSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<boolean> {
        throw new Error('Method not implemented.')
    }

    public async writeSetting<T>(settingKey: string, value: T, target?: any): Promise<boolean> {
        this._data[settingKey] = value
        return true
    }

    public readDevSetting<T>(key: AwsDevSetting, type: string = 'string', silent: boolean = false): T | undefined {
        return this._data[key] as T
    }
}
