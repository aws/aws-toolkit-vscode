/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { authenticateWithConsoleLogin } from '../../auth/consoleSessionUtils'
import { getCredentialsFilename, getConfigFilename } from '../../auth/credentials/sharedCredentialsFile'
import { parseIni } from '../../auth/credentials/sharedCredentials'
import fs from '../../shared/fs/fs'

const logger = getLogger('smus')

/** Credential keys that conflict with CLI cache-based credentials */
const conflictingKeys = ['aws_access_key_id', 'aws_secret_access_key', 'aws_session_token']

/**
 * Attempts browser-based console login via AWS CLI.
 * @returns true on success, false on failure
 */
export async function tryConsoleLogin(profileName: string, region: string): Promise<boolean> {
    try {
        await authenticateWithConsoleLogin(profileName, region)
        return true
    } catch (e) {
        logger.debug(`Console login failed: ${(e as Error).message}`)
        return false
    }
}

/** Which AWS shared file a conflict was found in. */
export type ConflictingKeysFile = 'credentials' | 'config'

/**
 * Checks whether a profile in ~/.aws/credentials or ~/.aws/config contains
 * conflicting credential keys (aws_access_key_id, aws_secret_access_key,
 * aws_session_token). These keys conflict with the CLI's cache-based credentials
 * from `aws login` and the CLI itself fails to run if these conflicts are present
 *
 * @returns the file ('credentials' or 'config') containing the conflict, or undefined if none
 */
export async function checkConflictingCredentialKeys(profileName: string): Promise<ConflictingKeysFile | undefined> {
    const filesToCheck: { path: string; type: ConflictingKeysFile }[] = [
        { path: getCredentialsFilename(), type: 'credentials' },
        { path: getConfigFilename(), type: 'config' },
    ]

    for (const { path: filePath, type } of filesToCheck) {
        if (!(await fs.existsFile(filePath))) {
            continue
        }

        try {
            const content = await fs.readFileText(filePath)
            const sections = parseIni(content, vscode.Uri.file(filePath))

            // Find profile section matching this profile name
            const profileSection = sections.find(
                (section) => section.type === 'profile' && section.name === profileName
            )

            if (!profileSection) {
                continue
            }

            // Check if any assignment keys conflict
            for (const assignment of profileSection.assignments) {
                if (conflictingKeys.includes(assignment.key)) {
                    logger.info(
                        `Conflicting credential key '${assignment.key}' found for profile '${profileName}' in ${filePath}`
                    )
                    return type
                }
            }
        } catch (e) {
            logger.debug(`Failed to parse ${filePath} for conflicting keys check: ${(e as Error).message}`)
        }
    }

    return undefined
}
