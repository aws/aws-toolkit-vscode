/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getServiceEnvVarConfig, Settings } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'

export interface ExtendedAmazonQLSPConfig extends LspConfig {
    ui?: string
}

export const defaultAmazonQLspConfig: ExtendedAmazonQLSPConfig = {
    manifestUrl: 'https://d3akiidp1wvqyg.cloudfront.net/qAgenticChatServer/0/manifest.json', // TODO swap this back
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

// TODO: expose lsp logging settings to users and re-send on update.
export function getLspLogSettings(clientId: string) {
    const traceServerSetting = `${clientId}.trace.server`
    const lspLogLevelSetting = `${clientId}.lsp.logLevel`

    return {
        seperateTraceChannel: Settings.instance.get(traceServerSetting),
        lspLogLevel: Settings.instance.get(lspLogLevelSetting, String, 'info'),
    }
}
