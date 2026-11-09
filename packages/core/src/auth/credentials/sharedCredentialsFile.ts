/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the i/o of the credentials/config files
 */

import * as vscode from 'vscode'
import { join, resolve } from 'path'
import { stat } from 'fs/promises'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import { isWin } from '../../shared/vscode/env'

/**
 * Returns env var value if it is non-empty.
 *
 * Asynchronously checks if the value is a valid file (not directory) path and logs an error if not.
 * The value is still returned in that case.
 */
function tryGetValidFileEnvVar(envVar: string): string | undefined {
    const envVal = process.env[envVar]

    if (envVal) {
        const f = resolve(envVal)
        fs.existsFile(f)
            .then((r) => {
                if (!r) {
                    getLogger().error('$%s filepath is invalid (or is a directory): %O', envVar, f)
                }
            })
            .catch((e) => getLogger().error(e))
        return f
    }
}

export function getCredentialsFilename(): string {
    const envVal = tryGetValidFileEnvVar('AWS_SHARED_CREDENTIALS_FILE')

    if (envVal) {
        return envVal
    }

    return join(fs.getUserHomeDir(), '.aws/credentials')
}

export function getConfigFilename(): string {
    const envVal = tryGetValidFileEnvVar('AWS_CONFIG_FILE')

    if (envVal) {
        return envVal
    }

    return join(fs.getUserHomeDir(), '.aws/config')
}

/**
 * Creates the directory (owner-only, 0700) if it doesn't exist. Existing directories are left untouched.
 */
export async function createSharedCredentialsDir(dir: string): Promise<void> {
    if (!(await fs.existsDir(dir))) {
        await fs.mkdir(dir)
        await fs.chmod(dir, 0o700)
    }
}

/**
 * Writes a shared credentials/config file. New files are created readable only by the owner (0600).
 * Existing files keep their permissions (they may have been set intentionally), but the user is
 * warned if the credentials file is accessible by other users.
 */
export async function writeSharedCredentialsFile(path: string, content: string): Promise<void> {
    const existed = await fs.existsFile(path)
    await fs.writeFile(path, content, { mode: 0o600 })
    if (existed && resolve(path) === resolve(getCredentialsFilename())) {
        await warnIfCredentialsFileIsPermissive(path)
    }
}

async function warnIfCredentialsFileIsPermissive(path: string): Promise<void> {
    if (isWin()) {
        return
    }
    try {
        const mode = (await stat(path)).mode & 0o777
        if ((mode & 0o077) === 0) {
            return
        }
        getLogger().warn('Credentials file %s is accessible by other users (mode %s)', path, mode.toString(8))

        const fix = 'Restrict Permissions'
        void vscode.window
            .showWarningMessage(
                `Your AWS credentials file (${path}) can be read by other users on this machine. Restrict it to owner-only (0600)?`,
                fix
            )
            .then(async (choice) => {
                if (choice === fix) {
                    await fs.chmod(path, 0o600)
                }
            })
            .then(undefined, (e) => getLogger().error('Failed to restrict permissions of %s: %O', path, e))
    } catch (err) {
        getLogger().debug('Failed to check permissions of %s: %O', path, err)
    }
}
