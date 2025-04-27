/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings, getLogger, getServiceEnvVarConfig, Settings } from 'aws-core-vscode/shared'
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

// Taken from language server runtimes since they are not exported:
// https://github.com/aws/language-server-runtimes/blob/eae85672c345d8adaf4c8cbd741260b8a59750c4/runtimes/runtimes/util/loggingUtil.ts#L4-L10
const validLspLogLevels = ['error', 'warn', 'info', 'log', 'debug'] as const
export type LspLogLevel = (typeof validLspLogLevels)[number]
export const lspSettingsSection = 'amazonQ.lsp'

export function getLspLogSettings(): { traceChannelEnabled: boolean; lspLogLevel: LspLogLevel } {
    const lspSettings = Settings.instance.getSection(lspSettingsSection)
    const lspLogLevel = lspSettings.get('logLevel', 'info')
    const traceChannelEnabled = lspSettings.get('trace', false)

    return {
        traceChannelEnabled,
        lspLogLevel: sanitizeLogLevel(lspLogLevel),
    }
}

export function sanitizeLogLevel(lspLogLevel: string): LspLogLevel {
    if (!isValidLspLogLevel(lspLogLevel)) {
        getLogger('amazonqLsp').warn(
            `Invalid log level for ${lspSettingsSection}.logLevel: ${lspLogLevel}. Defaulting to 'info'.`
        )
        return 'info'
    }
    return lspLogLevel
}

function isValidLspLogLevel(value: unknown): value is LspLogLevel {
    return typeof value === 'string' && validLspLogLevels.includes(value as LspLogLevel)
}
