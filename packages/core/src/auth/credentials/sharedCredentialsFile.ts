/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the i/o of the credentials/config files
 */

import { join, resolve } from 'path'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { SystemUtilities } from '../../shared/systemUtilities'
import { isValidPath } from '../../shared/utilities/pathUtils'

export function getCredentialsFilename(): string {
    const env = process.env as EnvironmentVariables

    if (env.AWS_SHARED_CREDENTIALS_FILE && isValidPath(resolve(env.AWS_SHARED_CREDENTIALS_FILE))) {
        return resolve(env.AWS_SHARED_CREDENTIALS_FILE)
    }

    return join(SystemUtilities.getHomeDirectory(), '.aws/credentials')
}

export function getConfigFilename(): string {
    const env = process.env as EnvironmentVariables

    if (env.AWS_CONFIG_FILE && isValidPath(resolve(env.AWS_CONFIG_FILE))) {
        return resolve(env.AWS_CONFIG_FILE)
    }

    return join(SystemUtilities.getHomeDirectory(), '.aws/config')
}
