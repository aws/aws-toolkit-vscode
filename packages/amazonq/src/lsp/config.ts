/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { DevSettings, getServiceEnvVarConfig } from 'aws-core-vscode/shared'
import { LspConfig } from 'aws-core-vscode/amazonq'
import { LanguageClient } from 'vscode-languageclient'
import {
    DidChangeConfigurationNotification,
    updateConfigurationRequestType,
} from '@aws/language-server-runtimes/protocol'

export interface ExtendedAmazonQLSPConfig extends LspConfig {
    ui?: string
}

// Taken from language server runtimes since they are not exported:
// https://github.com/aws/language-server-runtimes/blob/eae85672c345d8adaf4c8cbd741260b8a59750c4/runtimes/runtimes/util/loggingUtil.ts#L4-L10
const validLspLogLevels = ['error', 'warn', 'info', 'log', 'debug'] as const
export type LspLogLevel = (typeof validLspLogLevels)[number]
const lspLogLevelMapping: Map<vscode.LogLevel, LspLogLevel> = new Map([
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
    manifestUrl: 'https://aws-language-servers-gamma.amazonaws.com/qAgenticChatServer/0/manifest.json',
    supportedVersions: '1.*.*',
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
/**
 * The language server logging levels do not directly match those used in VSC. Therefore, we must perform a mapping defined by {@link lspLogLevelMapping}
 * @param logLevel vscode log level (0-5)
 * @returns language server log level
 */
export function toAmazonQLSPLogLevel(logLevel: vscode.LogLevel): LspLogLevel {
    return lspLogLevelMapping.get(logLevel) ?? 'info'
}

/**
 * Request/Notify a config value to the language server, effectively updating it with the
 * latest configuration from the client.
 *
 * The issue is we need to push certain configs to different places, since there are
 * different handlers for specific configs. So this determines the correct place to
 * push the given config.
 */
export async function pushConfigUpdate(client: LanguageClient, config: QConfigs) {
    switch (config.type) {
        case 'profile':
            await client.sendRequest(updateConfigurationRequestType.method, {
                section: 'aws.q',
                settings: { profileArn: config.profileArn },
            })
            break
        case 'customization':
            client.sendNotification(DidChangeConfigurationNotification.type.method, {
                section: 'aws.q',
                settings: { customization: config.customization },
            })
            break
        case 'logLevel':
            client.sendNotification(DidChangeConfigurationNotification.type.method, {
                section: 'aws.logLevel',
            })
            break
    }
}
type ProfileConfig = {
    type: 'profile'
    profileArn: string | undefined
}
type CustomizationConfig = {
    type: 'customization'
    customization: string | undefined
}
type LogLevelConfig = {
    type: 'logLevel'
}
type QConfigs = ProfileConfig | CustomizationConfig | LogLevelConfig
