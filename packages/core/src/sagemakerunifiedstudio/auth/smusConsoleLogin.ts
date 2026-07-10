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

/**
 * Checks whether a profile in ~/.aws/credentials or ~/.aws/config contains
 * conflicting credential keys (aws_access_key_id, aws_secret_access_key,
 * aws_session_token). These keys conflict with the CLI's cache-based credentials
 * from `aws login` and prevent the credential provider from working correctly.
 *
 * @returns true if conflicting keys are detected, false otherwise
 */
export async function checkConflictingCredentialKeys(profileName: string): Promise<boolean> {
    const filesToCheck = [getCredentialsFilename(), getConfigFilename()]

    for (const filePath of filesToCheck) {
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
                    return true
                }
            }
        } catch (e) {
            logger.debug(`Failed to parse ${filePath} for conflicting keys check: ${(e as Error).message}`)
        }
    }

    return false
}
