/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getServiceEnvVarConfig } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'

export const defaultAmazonQLspConfig: LspConfig = {
    manifestUrl: 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json',
    supportedVersions: '^3.1.1',
    id: 'AmazonQ', // used for identification in global storage/local disk location. Do not change.
    path: undefined,
}

export function getAmazonQLspConfig(): LspConfig {
    return {
        ...defaultAmazonQLspConfig,
        ...(DevSettings.instance.getServiceConfig('amazonqLsp', {}) as LspConfig),
        ...getServiceEnvVarConfig('amazonqLsp', Object.keys(defaultAmazonQLspConfig)),
    }
}
