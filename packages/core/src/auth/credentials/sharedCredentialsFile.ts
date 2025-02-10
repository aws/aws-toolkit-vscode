/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the i/o of the credentials/config files
 */

import { join, resolve } from 'path'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'

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
