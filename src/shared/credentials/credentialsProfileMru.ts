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

    private static readonly ConfigurationSettingName: string = "recentCredentials"
    private readonly _configuration: SettingsConfiguration

    constructor(configuration: SettingsConfiguration) {
        this._configuration = configuration
    }

    /**
     * @description Returns the most recently used credentials names
     * @param maxEntries Optional, caps the amount of items returns
     */
    public getMruList(maxEntries?: number): string[] {
        const mruStr = this._configuration.readSetting(CredentialsProfileMru.ConfigurationSettingName)

        const mru = mruStr ? mruStr.split(",") : []

        if (maxEntries) {
            mru.splice(maxEntries)
        }

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

        await this._configuration.writeSetting(CredentialsProfileMru.ConfigurationSettingName, mru, vscode.ConfigurationTarget.Global)
    }
}