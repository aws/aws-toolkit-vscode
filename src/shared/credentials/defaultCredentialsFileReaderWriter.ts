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
        const sharedCredentials = await loadSharedConfigFiles()

        const credentialsProfileNames = Object.keys(sharedCredentials.credentialsFile)
        const configProfileNames = this.getCanUseConfigFile() ? Object.keys(sharedCredentials.configFile) : []

        const profileNames = new Set(credentialsProfileNames.concat(configProfileNames))

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

    /**
     * Indicates if credentials information can be retrieved from
     * the config file in addition to the credentials file.
     */
    getCanUseConfigFile(): boolean {
        return process.env.AWS_SDK_LOAD_CONFIG
    }

    /**
     * Specifies whether or not credentials information can be retrieved from
     * the config file in addition to the credentials file.
 
     * @param allow - true: load from credentials and config, false: load from credentials only
     */
    setCanUseConfigFile(allow: boolean): void {
        process.env.AWS_SDK_LOAD_CONFIG = allow
    }
}