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
import globals from '../../shared/extensionGlobals'
import { SharedCredentialsKeys } from '../../auth/credentials/types'

const logger = getLogger('smus')

/** Global-state key holding a pending console sign-in to resume after a window reload. */
const pendingConsoleSignInKey = 'aws.smus.pendingSignIn'
/** A resume marker only ever needs to survive one reload; anything older is ignored. */
const pendingConsoleSignInMaxAgeMs = 5 * 60 * 1000

/** Persisted intent to resume an IAM console sign-in after a credential-cache window reload. */
export interface PendingConsoleSignIn {
    profileName: string
    region: string
    /** Epoch ms when the marker was written; used to discard stale markers. */
    at: number
}

/** Credential keys that conflict with CLI cache-based credentials */
const conflictingKeys = ['aws_access_key_id', 'aws_secret_access_key', 'aws_session_token']

/**
 * Attempts browser-based console login via AWS CLI.
 * @returns true on success, false on failure
 */
export async function tryConsoleLogin(profileName: string, region: string): Promise<boolean> {
    // Whether this profile was already a console-login (login_session) profile *before* this
    // attempt. If it was not, `aws login` is about to add a login_session that the SDK's
    // already-cached config won't see until a window reload, so credential resolution later in
    // this flow fails with "does not contain login_session" and the shared handler prompts a
    // reload. Persist a resume marker now (only on CLI success) so SMUS can continue the
    // sign-in straight to domain selection after that reload.
    const wasConsoleProfile = await profileHasConsoleSession(profileName)
    try {
        await authenticateWithConsoleLogin(profileName, region)
    } catch (e) {
        logger.debug(`Console login failed: ${(e as Error).message}`)
        return false
    }

    if (!wasConsoleProfile) {
        await persistPendingConsoleSignIn(profileName, region)
    }
    return true
}

/**
 * Reads ~/.aws/credentials and ~/.aws/config from disk and returns true if the profile already
 * carries a login_session key (i.e., it is already a console-login profile). A raw disk read,
 * deliberately independent of the SDK's in-memory config cache.
 */
async function profileHasConsoleSession(profileName: string): Promise<boolean> {
    const filesToCheck = [getCredentialsFilename(), getConfigFilename()]

    for (const filePath of filesToCheck) {
        if (!(await fs.existsFile(filePath))) {
            continue
        }

        try {
            const content = await fs.readFileText(filePath)
            const sections = parseIni(content, vscode.Uri.file(filePath))
            const profileSection = sections.find(
                (section) => section.type === 'profile' && section.name === profileName
            )
            if (profileSection?.assignments.some((a) => a.key === SharedCredentialsKeys.CONSOLE_SESSION)) {
                return true
            }
        } catch (e) {
            logger.debug(`Failed to parse ${filePath} for console-session check: ${(e as Error).message}`)
        }
    }

    return false
}

/**
 * Persists a resume marker so a console sign-in interrupted by a credential-cache window reload
 * can continue automatically on the next activation. Written only on `aws login` success.
 */
export async function persistPendingConsoleSignIn(profileName: string, region: string): Promise<void> {
    const pending: PendingConsoleSignIn = { profileName, region, at: Date.now() }
    await globals.globalState.update(pendingConsoleSignInKey, pending)
    logger.info(`Persisted pending console sign-in for profile ${profileName} to resume after reload`)
}

/**
 * Reads and clears the resume marker (consume-once). Returns it only if present and recent; a
 * stale marker is discarded. Clearing before the caller resumes prevents any reload loop: a
 * failing resume can never leave a marker behind to trigger a second reload.
 */
export async function consumePendingConsoleSignIn(): Promise<PendingConsoleSignIn | undefined> {
    const pending = globals.globalState.get<PendingConsoleSignIn>(pendingConsoleSignInKey)
    if (pending !== undefined) {
        await globals.globalState.update(pendingConsoleSignInKey, undefined)
    }
    if (!pending?.profileName || !pending.region || !pending.at) {
        return undefined
    }
    if (Date.now() - pending.at > pendingConsoleSignInMaxAgeMs) {
        logger.debug('Ignoring stale pending console sign-in marker')
        return undefined
    }
    return pending
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

/**
 * Reads ~/.aws/credentials and ~/.aws/config once and returns the set of profile names that
 * contain conflicting credential keys (aws_access_key_id, aws_secret_access_key,
 * aws_session_token). These profiles can't be used for `aws login` console sessions.
 *
 * Computed once up front so the profile-name input can flag a conflicting name inline as the
 * user types, without hitting the filesystem on every keystroke.
 */
export async function getConflictingProfileNames(): Promise<Set<string>> {
    const conflicting = new Set<string>()
    const filesToCheck = [getCredentialsFilename(), getConfigFilename()]

    for (const filePath of filesToCheck) {
        if (!(await fs.existsFile(filePath))) {
            continue
        }

        try {
            const content = await fs.readFileText(filePath)
            const sections = parseIni(content, vscode.Uri.file(filePath))

            for (const section of sections) {
                if (section.type !== 'profile') {
                    continue
                }
                if (section.assignments.some((assignment) => conflictingKeys.includes(assignment.key))) {
                    conflicting.add(section.name)
                }
            }
        } catch (e) {
            logger.debug(`Failed to parse ${filePath} for conflicting profile names: ${(e as Error).message}`)
        }
    }

    return conflicting
}
