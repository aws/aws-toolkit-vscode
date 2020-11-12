/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from './awsContext'
import { RegionProvider } from './regions/regionProvider'
import { SettingsConfiguration } from './settingsConfiguration'
import { TelemetryService } from './telemetry/telemetryService'
import { ChannelLogger } from './utilities/vsCodeUtils'
import { CredentialsStore } from '../credentials/credentialsStore'

export const VSCODE_EXTENSION_ID = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    python: 'ms-python.python',
    // python depends on jupyter plugin
    jupyter: 'ms-toolsai.jupyter',
    yaml: 'redhat.vscode-yaml',
}

/**
 * Long-lived, extension-scoped, shared globals.
 */
export interface ExtContext {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    regionProvider: RegionProvider
    settings: SettingsConfiguration
    outputChannel: vscode.OutputChannel
    telemetryService: TelemetryService
    chanLogger: ChannelLogger
    credentialsStore: CredentialsStore
}

/**
 * Version of the .vsix produced by the `packageDebug` script.
 */
export const EXTENSION_ALPHA_VERSION = '1.99.0-SNAPSHOT'
