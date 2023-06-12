/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the i/o of the credentials/config files
 */

import { join } from 'path'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { SystemUtilities } from '../../shared/systemUtilities'

export function getCredentialsFilename(): string {
    const env = process.env as EnvironmentVariables

    return env.AWS_SHARED_CREDENTIALS_FILE || join(SystemUtilities.getHomeDirectory(), '.aws', 'credentials')
}

export function getConfigFilename(): string {
    const env = process.env as EnvironmentVariables

    return env.AWS_CONFIG_FILE || join(SystemUtilities.getHomeDirectory(), '.aws', 'config')
}
