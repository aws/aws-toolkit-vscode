/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import { getLogger } from '../../shared/logger/logger'
import { authenticateWithConsoleLogin } from '../../auth/consoleSessionUtils'
import { getCredentialsFilename, getConfigFilename } from '../../auth/credentials/sharedCredentialsFile'
import fs from '../../shared/fs/fs'

const logger = getLogger('smus')

/** Credential keys that conflict with CLI cache-based credentials */
const conflictingKeys = ['aws_access_key_id', 'aws_secret_access_key', 'aws_session_token']

/**
 * Attempts browser-based console login via AWS CLI.
 * Removes conflicting credential keys first (the CLI refuses to run if they exist),
 * then calls authenticateWithConsoleLogin.
 * @returns true on success, false on failure
 */
export async function tryConsoleLogin(profileName: string, region: string): Promise<boolean> {
    try {
        await removeConflictingCredentialKeys(profileName)
        await authenticateWithConsoleLogin(profileName, region)
        await ensureProfileHasRegion(profileName, region)
        return true
    } catch (e) {
        logger.debug(`Console login failed: ${(e as Error).message}`)
        return false
    }
}

/**
 * Ensures the profile in ~/.aws/config has a region field.
 * `aws login` does not write region to the profile, which causes the SDK's
 * credential-provider-login to default to us-east-1 for session refresh.
 */
async function ensureProfileHasRegion(profileName: string, region: string): Promise<void> {
    const configPath = getConfigFilename()

    if (!(await fs.existsFile(configPath))) {
        return
    }

    const content = await fs.readFileText(configPath)
    const lines = content.split(os.EOL)
    const updatedLines: string[] = []

    let inTargetProfile = false
    let regionFound = false
    let lastNonEmptyIndexInProfile = -1

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            // If we just left the target profile without finding a region, insert after last non-empty line
            if (inTargetProfile && !regionFound && lastNonEmptyIndexInProfile >= 0) {
                updatedLines.splice(lastNonEmptyIndexInProfile + 1, 0, `region = ${region}`)
            }

            const header = trimmed.slice(1, -1).trim()
            inTargetProfile = header === profileName || header === `profile ${profileName}`
            regionFound = false
            lastNonEmptyIndexInProfile = -1
            updatedLines.push(lines[i])
            continue
        }

        if (inTargetProfile) {
            if (trimmed.startsWith('region')) {
                regionFound = true
            }
            if (trimmed !== '') {
                lastNonEmptyIndexInProfile = updatedLines.length
            }
        }

        updatedLines.push(lines[i])
    }

    // Handle case where target profile is the last section
    if (inTargetProfile && !regionFound && lastNonEmptyIndexInProfile >= 0) {
        updatedLines.splice(lastNonEmptyIndexInProfile + 1, 0, `region = ${region}`)
    }

    const updatedContent = updatedLines.join(os.EOL)
    if (updatedContent !== content) {
        await fs.writeFile(configPath, updatedContent)
        logger.debug(`Wrote region '${region}' to profile '${profileName}' in config`)
    }
}

/**
 * Removes conflicting credential keys (aws_access_key_id, aws_secret_access_key,
 * aws_session_token) from a profile in ~/.aws/credentials and ~/.aws/config.
 * This ensures the credential provider chain picks up cached credentials
 * written by `aws login` instead of stale keys in these files.
 */
export async function removeConflictingCredentialKeys(profileName: string): Promise<void> {
    const filesToCheck = [getCredentialsFilename(), getConfigFilename()]

    for (const filePath of filesToCheck) {
        if (!(await fs.existsFile(filePath))) {
            continue
        }

        const content = await fs.readFileText(filePath)
        const lines = content.split(os.EOL)
        const updatedLines: string[] = []

        let inTargetProfile = false

        for (const line of lines) {
            const trimmed = line.trim()

            // Detect profile headers
            // credentials file: [profileName]
            // config file: [profile profileName]
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                const header = trimmed.slice(1, -1).trim()
                inTargetProfile = header === profileName || header === `profile ${profileName}`
                updatedLines.push(line)
                continue
            }

            // If we're in the target profile, skip conflicting keys
            if (inTargetProfile) {
                const key = trimmed.split(/\s*=\s*/)[0]
                if (conflictingKeys.includes(key)) {
                    logger.debug(`Removing conflicting key '${key}' from profile '${profileName}' in ${filePath}`)
                    continue
                }
            }

            updatedLines.push(line)
        }

        const updatedContent = updatedLines.join(os.EOL)

        // Only write back if something changed
        if (updatedContent !== content) {
            await fs.writeFile(filePath, updatedContent)
            logger.debug(`Removed conflicting credential keys from profile '${profileName}' in ${filePath}`)
        }
    }
}
