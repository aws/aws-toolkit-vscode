/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getServiceEnvVarConfig } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'

export interface ExtendedAmazonQLSPConfig extends LspConfig {
    ui?: string
}

export const defaultAmazonQLspConfig: ExtendedAmazonQLSPConfig = {
    manifestUrl:
        'https://raw.githubusercontent.com/aws/aws-toolkit-vscode/7399e6e32e8f674fc16791944a0a99305b81045c/qAgenticServerManifest.json', // TODO swap this back
    supportedVersions: '*', // TODO swap this back
    id: 'AmazonQ', // used across IDEs for identifying global storage/local disk locations. Do not change.
    suppressPromptPrefix: 'amazonQ',
    path: undefined,
    ui: undefined,
}

export function getAmazonQLspConfig(): ExtendedAmazonQLSPConfig {
    return {
        ...defaultAmazonQLspConfig,
        ...(DevSettings.instance.getServiceConfig('amazonqLsp', {}) as ExtendedAmazonQLSPConfig),
        ...getServiceEnvVarConfig('amazonqLsp', Object.keys(defaultAmazonQLspConfig)),
    }
}
