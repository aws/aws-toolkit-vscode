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

// Determine the remote SSH extension based on the editor
const getRemoteSshExtension = () => {
    const isCursor = vscode?.env?.appName?.toLowerCase().includes('cursor')
    return isCursor
        ? { id: 'anysphere.remote-ssh', minVersion: '1.0.2' }
        : { id: 'ms-vscode-remote.remote-ssh', minVersion: '0.74.0' }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_EXTENSION_ID = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    amazonq: 'amazonwebservices.amazon-q-vscode',
    python: 'ms-python.python',
    // python depends on jupyter plugin
    jupyter: 'ms-toolsai.jupyter',
    yaml: 'redhat.vscode-yaml',
    go: 'golang.go',
    java: 'redhat.java',
    javadebug: 'vscjava.vscode-java-debug',
    dotnet: 'ms-dotnettools.csdevkit',
    git: 'vscode.git',
    get remotessh() {
        return getRemoteSshExtension()
    },
} as const

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
