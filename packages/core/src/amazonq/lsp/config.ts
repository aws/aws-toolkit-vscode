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
    suppressPromptPrefix: string
    path?: string
}

export const defaultAmazonQWorkspaceLspConfig: LspConfig = {
    manifestUrl: 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json',
    supportedVersions: '0.1.47',
    id: 'AmazonQ-Workspace', // used across IDEs for identifying global storage/local disk locations. Do not change.
    suppressPromptPrefix: 'amazonQWorkspace',
    path: undefined,
}

export function getAmazonQWorkspaceLspConfig(): LspConfig {
    return {
        ...defaultAmazonQWorkspaceLspConfig,
        ...(DevSettings.instance.getServiceConfig('amazonqWorkspaceLsp', {}) as LspConfig),
        ...getServiceEnvVarConfig('amazonqWorkspaceLsp', Object.keys(defaultAmazonQWorkspaceLspConfig)),
    }
}
