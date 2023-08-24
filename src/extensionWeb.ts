/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { setInBrowser } from './common/browserUtils'
import { activate as activateLogger } from './shared/logger/activation'
import { initializeComputeRegion } from './shared/extensionUtilities'
import globals from './shared/extensionGlobals'
import { TelemetryService } from './shared/telemetry/telemetryService'
import { TelemetryLogger } from './shared/telemetry/telemetryLogger'

export async function activate(context: vscode.ExtensionContext) {
    // This is temporary and required for the logger to run.
    // It assumes the following exists and uses it during execution.
    globals.telemetry = {
        record: (event: any, awsContext?: any) => {},
    } as TelemetryService & { logger: TelemetryLogger }

    setInBrowser(true)
    await initializeComputeRegion()

    vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided',
        { modal: false }
    )

    // Disabling for now since this has webpack issues that will be fixed in future commits:
    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit')
    await activateLogger(context, toolkitOutputChannel)
}

export async function deactivate() {}
