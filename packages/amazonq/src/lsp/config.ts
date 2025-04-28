/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { DevSettings, getServiceEnvVarConfig } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'

export interface ExtendedAmazonQLSPConfig extends LspConfig {
    ui?: string
}

// Taken from language server runtimes since they are not exported:
// https://github.com/aws/language-server-runtimes/blob/eae85672c345d8adaf4c8cbd741260b8a59750c4/runtimes/runtimes/util/loggingUtil.ts#L4-L10
const validLspLogLevels = ['error', 'warn', 'info', 'log', 'debug'] as const
export type LspLogLevel = (typeof validLspLogLevels)[number]
export const lspLogLevelMapping: Map<vscode.LogLevel, LspLogLevel> = new Map([
    [vscode.LogLevel.Error, 'error'],
    [vscode.LogLevel.Warning, 'warn'],
    [vscode.LogLevel.Info, 'info'],
    [vscode.LogLevel.Debug, 'log'],
    [vscode.LogLevel.Trace, 'debug'],
    [vscode.LogLevel.Off, 'error'], // TODO: once the language server supports a no-log setting, we can map to that.
])

const configSections = ['aws.q', 'aws.codeWhisperer', 'aws.logLevel'] as const
export type ConfigSection = (typeof configSections)[number]

export function isValidConfigSection(section: unknown): section is ConfigSection {
    return typeof section === 'string' && configSections.includes(section as ConfigSection)
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

export function toAmazonQLSPLogLevel(logLevel: vscode.LogLevel): LspLogLevel {
    return lspLogLevelMapping.get(logLevel) ?? 'info'
}
