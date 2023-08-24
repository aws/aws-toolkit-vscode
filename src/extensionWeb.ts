/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { setInBrowser } from './common/browserUtils'
import { activate as activateLogger } from './shared/logger/activation'
import { initializeComputeRegion } from './shared/extensionUtilities'

import { activate as activateTelemetry } from './shared/telemetry/activation'
import { getLogger } from './shared/logger'
import { DefaultAwsContext } from './shared/awsContext'
import { Settings } from './shared/settings'
import globals, { initialize } from './shared/extensionGlobals'

import { TelemetryService } from './shared/telemetry/telemetryService'
import { TelemetryLogger } from './shared/telemetry/telemetryLogger'
import { initializeManifestPaths } from './extensionShared'
import { RegionProvider, defaultRegion } from './shared/regions/regionProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'

export async function activate(context: vscode.ExtensionContext) {
    setInBrowser(true) // THIS MUST ALWAYS BE FIRST

    // This is temporary and required for the logger to run.
    // It assumes the following exists and uses it during execution.
    globals.telemetry = {
        record: (event: any, awsContext?: any) => {},
    } as TelemetryService & { logger: TelemetryLogger }

    // Setup the logger
    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit')
    await activateLogger(context, toolkitOutputChannel)

    await initializeComputeRegion()
    initialize(context)
    initializeManifestPaths(context)

    vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided',
        { modal: false }
    )

    try {
        const awsContext = new DefaultAwsContext()
        globals.awsContext = awsContext

        globals.regionProvider = {
            guessDefaultRegion: () => defaultRegion,
        } as RegionProvider
        globals.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)

        const settings = Settings.instance

        await activateTelemetry(context, awsContext, settings)
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger('channel').error('error')
        throw error
    }
}

export async function deactivate() {}
