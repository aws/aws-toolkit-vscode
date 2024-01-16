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
import { registerCommands, initializeManifestPaths } from './extensionShared'
import { RegionProvider, defaultRegion } from './shared/regions/regionProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'

export async function activate(context: vscode.ExtensionContext) {
    setInBrowser(true) // THIS MUST ALWAYS BE FIRST

    void vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided'
    )

    try {
        // Setup the logger
        const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit', { log: true })
        await activateLogger(context, toolkitOutputChannel)

        setupGlobals()

        await initializeComputeRegion()
        initialize(context)
        initializeManifestPaths(context)

        await activateTelemetry(context, globals.awsContext, Settings.instance)
        registerCommands(context)
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger().error('Failed to activate extension in Browser', error)
        throw error
    }
}

/** Set up values for the `globals` object */
function setupGlobals() {
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)

    setupGlobalsTempStubs()
}

/**
 * Since we are still incrementally enabling certain functionality
 * in the browser, certain global variables will not have been set
 * and functionality we enabled will not work.
 *
 * This function sets up the minimum-required stubs for the necessary
 * variables to get things working.
 *
 * If needed we can eventually create the real implementations instead
 * of stubbing.
 */
function setupGlobalsTempStubs() {
    // This is required for telemetry to run.
    // The default region is arbitrary for now.
    // We didn't create an actual instance since it
    // will require non-trivial work to get the creation
    // of the instance in the browser working.
    globals.regionProvider = {
        guessDefaultRegion: () => defaultRegion,
    } as RegionProvider
}

export async function deactivate() {}
