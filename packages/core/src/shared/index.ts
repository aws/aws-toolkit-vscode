/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Contains exports that work in both node and web.
 */

export { ExtContext } from './extensions'
export { initialize, isWeb, ToolkitGlobals, default as globals } from './extensionGlobals'
export { activate as activateLogger } from './logger/activation'
export { activate as activateTelemetry } from './telemetry/activation'
export { DefaultAwsContext } from './awsContext'
export { DefaultAWSClientBuilder, ServiceOptions } from './awsClientBuilder'
export { Settings } from './settings'
export { initializeComputeRegion } from './extensionUtilities'
export { RegionProvider } from './regions/regionProvider'
export { Commands } from './vscode/commands2'
export { getMachineId } from './vscode/env'
export { getLogger } from './logger/logger'
export { activateExtension } from './utilities/vsCodeUtils'
export { waitUntil, sleep } from './utilities/timeoutUtils'
export { Prompter } from './ui/prompter'
export { VirtualFileSystem } from './virtualFilesystem'
export { VirtualMemoryFile } from './virtualMemoryFile'
export { AmazonqCreateUpload, Metric } from './telemetry/telemetry'
export { getClientId, getOperatingSystem } from './telemetry/util'
export { extensionVersion } from './vscode/env'
export { cast } from './utilities/typeConstructors'
export {
    CodewhispererUserTriggerDecision,
    CodewhispererLanguage,
    CodewhispererCompletionType,
    CodewhispererSuggestionState,
    CodewhispererUserDecision,
    CodewhispererSecurityScan,
} from './telemetry/telemetry.gen'
export { randomUUID } from './crypto'
export * from './environmentVariables'
export * from './vscode/setContext'
export * from './utilities/textUtilities'
export * from './filesystemUtilities'
export * from './localizedText'
export * as env from './vscode/env'
export * from './vscode/commands2'
export * from './utilities/pathUtils'
export * from './errors'
export * as messages from './utilities/messages'
export * as errors from './errors'
export * as funcUtil from './utilities/functionUtils'
export { fs } from './fs/fs'
export * from './handleUninstall'
export { CrashMonitoring } from './crashMonitoring'
