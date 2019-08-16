/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EnvironmentVariables } from '../environmentVariables'
import { SystemUtilities } from '../systemUtilities'
import { loadSharedConfigFiles, Profile, saveProfile } from './credentialsFile'
import { CredentialsFileReaderWriter } from './credentialsFileReaderWriter'
import { UserCredentialsUtils } from './userCredentialsUtils'

export class DefaultCredentialsFileReaderWriter implements CredentialsFileReaderWriter {
    public async getProfileNames(): Promise<string[]> {
        // TODO: cache the file and attach a watcher to it
        const sharedCredentials = await loadSharedConfigFiles()

        const credentialsProfileNames = Object.keys(sharedCredentials.credentialsFile)
        const configProfileNames = this.getCanUseConfigFile() ? Object.keys(sharedCredentials.configFile) : []

        const profileNames = new Set(credentialsProfileNames.concat(configProfileNames))

        return Promise.resolve(Array.from(profileNames))
    }

    public async addProfileToFile(profileName: string, accessKey: string, secretKey: string): Promise<void> {
        await saveProfile(profileName, accessKey, secretKey)
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
     * Indicates if credentials information can be retrieved from
     * the config file in addition to the credentials file.
     */
    public getCanUseConfigFile(): boolean {
        const env = process.env as EnvironmentVariables

        return !!env.AWS_SDK_LOAD_CONFIG
    }

    /**
     * Specifies whether or not credentials information can be retrieved from
     * the config file in addition to the credentials file.
     *
     * @param allow - true: load from credentials and config, false: load from credentials only
     */
    public setCanUseConfigFile(allow: boolean): void {
        const env = process.env as EnvironmentVariables

        env.AWS_SDK_LOAD_CONFIG = allow ? true : ''
    }

    /**
     * @description Calls setCanUseConfigFile , setting it to true if the config file exists, false otherwise
     */
    public async setCanUseConfigFileIfExists(): Promise<void> {
        this.setCanUseConfigFile(await SystemUtilities.fileExists(UserCredentialsUtils.getConfigFilename()))
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

        if (this.getCanUseConfigFile()) {
            if (credentialFiles.configFile && credentialFiles.configFile[profileName]) {
                profile = credentialFiles.configFile[profileName]
            }
        }

        if (credentialFiles.credentialsFile && credentialFiles.credentialsFile[profileName]) {
            const credentialsProfile = credentialFiles.credentialsFile[profileName]
            for (const index of Object.keys(credentialsProfile)) {
                profile[index] = credentialsProfile[index]
            }
        }

        return Promise.resolve(profile)
    }
}
