/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'

const logger = getLogger('smus')

/**
 * Attempts browser-based console login via AWS CLI.
 * @returns true on success, false on failure
 */
export async function tryConsoleLogin(profileName: string, region: string): Promise<boolean> {
    try {
        // Dynamic import to avoid loading consoleSessionUtils at module parse time.
        // consoleSessionUtils uses a package self-reference import ('aws-core-vscode/shared')
        // that can fail in certain test runner configurations.
        const { authenticateWithConsoleLogin } = await import('../../auth/consoleSessionUtils.js')
        await authenticateWithConsoleLogin(profileName, region)
        await removeConflictingCredentialKeys(profileName)
        return true
    } catch (e) {
        logger.debug(`Console login failed: ${(e as Error).message}`)
        return false
    }
}

/**
 * Removes conflicting credential keys (aws_access_key_id, aws_secret_access_key,
 * aws_session_token) from a profile in ~/.aws/credentials and ~/.aws/config.
 * This ensures the credential provider chain picks up cached credentials
 * written by `aws login` instead of stale keys in these files.
 */
export async function removeConflictingCredentialKeys(profileName: string): Promise<void> {
    // TODO
}
