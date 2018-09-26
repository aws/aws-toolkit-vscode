/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { SettingsConfiguration } from '../settingsConfiguration'

/**
 * Tracks the credentials selected by the user, ordered by most recent.
 */
export class CredentialsProfileMru {

    public static readonly MaxCredentialMruSize = 5

    private static readonly ConfigurationSettingName: string = "recentCredentials"
    private readonly _configuration: SettingsConfiguration

    constructor(configuration: SettingsConfiguration) {
        this._configuration = configuration
    }

    /**
     * @description Returns the most recently used credentials names
     */
    public getMruList(): string[] {
        const mruStr = this._configuration.readSetting(CredentialsProfileMru.ConfigurationSettingName)

        const mru = mruStr ? mruStr.split(",") : []

        return mru
    }

    /**
     * @description Places a credential at the top of the MRU list
     * @param profileName The credentials most recently used
     */
    public async setMostRecentlyUsedProfile(profileName: string): Promise<void> {
        const mru = this.getMruList()

        const currentIndex = mru.indexOf(profileName)
        if (currentIndex !== -1) {
            mru.splice(currentIndex, 1)
        }

        mru.splice(0, 0, profileName)

        mru.splice(CredentialsProfileMru.MaxCredentialMruSize)

        await this._configuration.writeSetting(CredentialsProfileMru.ConfigurationSettingName, mru, vscode.ConfigurationTarget.Global)
    }
}