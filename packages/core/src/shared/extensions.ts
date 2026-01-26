/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from './awsContext'
import { RegionProvider } from './regions/regionProvider'
import { TelemetryService } from './telemetry/telemetryService'
import { CredentialsStore } from '../auth/credentials/store'
import { SamCliContext } from './sam/cli/samCliContext'
import { UriHandler } from './vscode/uriHandler'
import { VSCODE_EXTENSION_ID_CONSTANTS, VSCODE_REMOTE_SSH_EXTENSION } from './extensionIds'

// Determine the remote SSH extension based on the editor
const getRemoteSshExtension = () => {
    const appName = vscode?.env?.appName?.toLowerCase()

    if (appName?.includes('cursor')) {
        return VSCODE_REMOTE_SSH_EXTENSION.cursor
    }

    return VSCODE_REMOTE_SSH_EXTENSION.vscode
}

// For actual use in IDE, not test environment
// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_EXTENSION_ID = {
    ...VSCODE_EXTENSION_ID_CONSTANTS,
    get remotessh() {
        return getRemoteSshExtension()
    },
} as const

// Re-export for backward compatibility
export { VSCODE_REMOTE_SSH_EXTENSION }

/** @deprecated Use `extensionGlobals.ts:globals` instead. */
export interface ExtContext {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    samCliContext: () => SamCliContext
    regionProvider: RegionProvider
    outputChannel: vscode.OutputChannel
    telemetryService: TelemetryService
    credentialsStore: CredentialsStore
    uriHandler: UriHandler
}

/**
 * Version of the .vsix produced by package.ts with the --debug option.
 */
export const extensionAlphaVersion = '99.0.0-SNAPSHOT'

export const cloudformation = 'cloudformation'
