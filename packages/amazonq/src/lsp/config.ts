/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getLogger, getServiceEnvVarConfig, Settings } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'

// Taken from language server runtimes since they are not exported:
// https://github.com/aws/language-server-runtimes/blob/eae85672c345d8adaf4c8cbd741260b8a59750c4/runtimes/runtimes/util/loggingUtil.ts#L4-L10
const validLspLogLevels = ['error', 'warn', 'info', 'log', 'debug']
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
export function getLspLogSettings() {
    const lspSettings = Settings.instance.getSection('lsp')
    const lspLogLevel = lspSettings.get('logLevel', 'info')
    const traceChannelEnabled = lspSettings.get('trace', false)

    return {
        traceChannelEnabled,
        lspLogLevel: sanitizeLogLevel(lspLogLevel),
    }
}

export function sanitizeLogLevel(lspLogLevel: string) {
    if (!validLspLogLevels.includes(lspLogLevel)) {
        getLogger('amazonqLsp').warn(
            `Invalid log level for amazonq.lsp.logLevel: ${lspLogLevel}. Defaulting to 'info'.`
        )
        return 'info'
    }
    return lspLogLevel
}
