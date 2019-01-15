/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ext } from '../extensionGlobals'
import { SettingsConfiguration } from '../settingsConfiguration'

/**
 * Tracks the credentials selected by the user, ordered by most recent.
 */
export class CredentialsProfileMru {
    public static readonly MAX_CREDENTIAL_MRU_SIZE = 5

    private static readonly configurationSettingName: string = 'recentCredentials'
    private readonly _configuration: SettingsConfiguration

    public constructor(configuration: SettingsConfiguration) {
        this._configuration = configuration
    }

    /**
     * @description Returns the most recently used credentials names
     */
    public getMruList(): string[] {
        const mru = this._configuration.readSetting<string[]>(CredentialsProfileMru.configurationSettingName)

        return mru || []
    }

    /**
     * @description Places a credential at the top of the MRU list
     * @param profileName The credentials most recently used
     */
    public async setMostRecentlyUsedProfile(profileName: string): Promise<void> {
        const mru: string[] = this.getMruList()

        const currentIndex = mru.indexOf(profileName)
        if (currentIndex !== -1) {
            mru.splice(currentIndex, 1)
        }

        mru.splice(0, 0, profileName)

        mru.splice(CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE)

        await this._configuration.writeSetting(
            CredentialsProfileMru.configurationSettingName,
            mru,
            ext.vscode.ConfigurationTarget.Global
        )
    }
}
