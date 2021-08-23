/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsDevSetting, SettingsConfiguration } from '../../shared/settingsConfiguration'

/**
 * Test utility class with an in-memory Settings Configuration key-value storage
 */
export class TestSettingsConfiguration implements SettingsConfiguration {
    private readonly _data: { [key: string]: any } = {}

    public readSetting<T>(settingKey: string, defaultValue?: T | undefined): T | undefined {
        return this._data[settingKey] as T
    }

    public async writeSetting<T>(settingKey: string, value: T, target?: any): Promise<boolean> {
        this._data[settingKey] = value
        return true
    }

    public readDevSetting<T>(key: AwsDevSetting, type: string = 'string', silent: boolean = false): T | undefined {
        return undefined
    }
}
