/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the i/o of the credentials/config files
 */
import fs from 'fs'
import { join, resolve } from 'path'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { SystemUtilities } from '../../shared/systemUtilities'

export function getCredentialsFilename(): string {
    const env = process.env as EnvironmentVariables

    if (
        env.AWS_SHARED_CREDENTIALS_FILE &&
        env.AWS_SHARED_CREDENTIALS_FILE?.length !== 0 &&
        fs.existsSync(resolve(env.AWS_SHARED_CREDENTIALS_FILE))
    ) {
        return env.AWS_SHARED_CREDENTIALS_FILE
    }

    return join(SystemUtilities.getHomeDirectory(), '.aws', 'credentials')
}

export function getConfigFilename(): string {
    const env = process.env as EnvironmentVariables

    if (env.AWS_CONFIG_FILE && env.AWS_CONFIG_FILE?.length !== 0 && fs.existsSync(resolve(env.AWS_CONFIG_FILE))) {
        return env.AWS_CONFIG_FILE
    }

    return join(SystemUtilities.getHomeDirectory(), '.aws', 'config')
}
