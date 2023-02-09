/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { join } from 'path'
import { loadSharedConfigFiles, Profile, SharedConfigFiles } from '../shared/credentials/credentialsFile'
import { EnvironmentVariables } from '../shared/environmentVariables'
import { SystemUtilities } from '../shared/systemUtilities'
import { union } from '../shared/utilities/collectionUtils'

export function getCredentialsFilename(): string {
    const env = process.env as EnvironmentVariables

    return env.AWS_SHARED_CREDENTIALS_FILE || join(SystemUtilities.getHomeDirectory(), '.aws', 'credentials')
}

export function getConfigFilename(): string {
    const env = process.env as EnvironmentVariables

    return env.AWS_CONFIG_FILE || join(SystemUtilities.getHomeDirectory(), '.aws', 'config')
}

export async function loadSharedCredentialsProfiles(): Promise<Map<string, Profile>> {
    const profiles = new Map<string, Profile>()
    // These should eventually be changed to use `parse` to allow for credentials from other file systems
    const profileData = await loadSharedConfigFiles({
        config: vscode.Uri.file(getConfigFilename()),
        credentials: vscode.Uri.file(getCredentialsFilename()),
    })

    const profileNames = getAllProfileNames(profileData)

    for (const profileName of profileNames) {
        const profile = mergeProfileProperties(
            profileData.credentialsFile[profileName],
            profileData.configFile[profileName]
        )

        profiles.set(profileName, profile)
    }

    return profiles
}

function getAllProfileNames(sharedCredentialsData: SharedConfigFiles): string[] {
    const profileNames = union(
        Object.keys(sharedCredentialsData.configFile),
        Object.keys(sharedCredentialsData.credentialsFile)
    )

    return [...profileNames]
}

function mergeProfileProperties(credentialsProfile?: Profile, configProfile?: Profile): Profile {
    let profile: Profile = {}

    // Start with the config profile (if exists), then apply any credentials profile properties on top
    if (configProfile) {
        profile = configProfile
    }

    if (credentialsProfile) {
        for (const index of Object.keys(credentialsProfile)) {
            profile[index] = credentialsProfile[index]
        }
    }

    return profile
}

export async function updateAwsSdkLoadConfigEnvVar(): Promise<void> {
    const configFileExists = await SystemUtilities.fileExists(getConfigFilename())
    process.env.AWS_SDK_LOAD_CONFIG = configFileExists ? 'true' : ''
}
