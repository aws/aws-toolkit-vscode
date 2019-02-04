/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { IniLoader } from 'aws-sdk'
import { CredentialsFileReaderProcessor, Profile } from './credentialsFileProcessor'

export class DefaultCredentialsFileProcessor implements CredentialsFileReaderProcessor {
    public async getProfileNames(): Promise<string[]> {
        // TODO: cache the file and attach a watcher to it
        const iniLoader = new IniLoader()
        const profiles = iniLoader.loadFrom({})

        return Promise.resolve(Array.from(Object.keys(profiles)))
    }

    /**
     * Gets the default region for a credentials profile
     *
     * @param profileName Profile to get the default region from
     * @returns Default region, undefined if region is not set
     */
    public async getDefaultRegion(profileName: string): Promise<string | undefined> {
        const profile = await this.getProfile(profileName)

        return Promise.resolve(profile.region)
    }

    /**
     * Returns a credentials profile, combined from the config and credentials file where applicable.
     *
     * @param profileName Credentials Profile to load
     * @returns Profile data. Nonexistent Profiles will return an empty mapping.
     */
    private async getProfile(profileName: string): Promise<Profile> {
        const iniLoader = new IniLoader()
        const profiles = iniLoader.loadFrom({})

        return Promise.resolve(profiles[profileName])
    }
}
