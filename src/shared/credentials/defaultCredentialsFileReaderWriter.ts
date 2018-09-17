/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CredentialsFileReaderWriter } from "./credentialsFileReaderWriter"
import { loadSharedConfigFiles, saveProfile, Profile } from "./credentialsFile"

export class DefaultCredentialsFileReaderWriter implements CredentialsFileReaderWriter {
    async getProfileNames(): Promise<string[]> {
        // TODO: cache the file and attach a watcher to it
        const credentialFiles = await loadSharedConfigFiles()

        const credentialsProfiles = Object.keys(credentialFiles.credentialsFile)
        const configProfiles = Object.keys(credentialFiles.configFile)

        const profileNames = new Set(credentialsProfiles.concat(configProfiles))

        return Promise.resolve(Array.from(profileNames))
    }

    async addProfileToFile(profileName: string, accessKey: string, secretKey: string): Promise<void> {
        await saveProfile(profileName, accessKey, secretKey)
    }

    /**
     * Gets the default region for a credentials profile
     * 
     * @param profileName Profile to get the default region from
     * @returns Default region, undefined if region is not set
     */
    async getDefaultRegion(profileName: string): Promise<string | undefined> {
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
        const credentialFiles = await loadSharedConfigFiles()

        let profile: Profile = {}

        if (credentialFiles.configFile && credentialFiles.configFile[profileName]) {
            profile = credentialFiles.configFile[profileName]
        }

        if (credentialFiles.credentialsFile && credentialFiles.credentialsFile[profileName]) {
            const credentialsProfile = credentialFiles.credentialsFile[profileName]
            for (const index in credentialsProfile) {
                profile[index] = credentialsProfile[index]
            }
        }

        return Promise.resolve(profile)
    }
}