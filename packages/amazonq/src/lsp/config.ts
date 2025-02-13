/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getServiceEnvVarConfig } from 'aws-core-vscode/shared'

export interface AmazonQLspConfig {
    manifestUrl: string
    supportedVersions: string
    id: string
    locationOverride?: string
}

export const defaultAmazonQLspConfig: AmazonQLspConfig = {
    manifestUrl: 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json',
    supportedVersions: '^3.1.1',
    id: 'AmazonQ', // used for identification in global storage/local disk location. Do not change.
    locationOverride: undefined,
}

export function getAmazonQLspConfig(): AmazonQLspConfig {
    return {
        ...defaultAmazonQLspConfig,
        ...(DevSettings.instance.getServiceConfig('amazonqLsp', {}) as AmazonQLspConfig),
        ...getServiceEnvVarConfig('amazonqLsp', Object.keys(defaultAmazonQLspConfig)),
    }
}
