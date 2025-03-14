/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings } from '../../shared/settings'
import { getServiceEnvVarConfig } from '../../shared/vscode/env'

export interface LspConfig {
    manifestUrl: string
    supportedVersions: string
    id: string
    path?: string
}

export const defaultAmazonQWorkspaceLspConfig: LspConfig = {
    manifestUrl: 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json',
    supportedVersions: '0.1.42',
    id: 'AmazonQ-Workspace', // used for identification in global storage/local disk location. Do not change.
    path: undefined,
}

export function getAmazonQWorkspaceLspConfig(): LspConfig {
    return {
        ...defaultAmazonQWorkspaceLspConfig,
        ...(DevSettings.instance.getServiceConfig('amazonqWorkspaceLsp', {}) as LspConfig),
        ...getServiceEnvVarConfig('amazonqWorkspaceLsp', Object.keys(defaultAmazonQWorkspaceLspConfig)),
    }
}
