/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../awsContext'
import { SettingsConfiguration } from '../settingsConfiguration'
import { AwsTelemetryOptOut } from './awsTelemetryOptOut'
import { DefaultTelemetryService } from './defaultTelemetryService'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'

/**
 * Sets up the Metrics system and initializes ext.telemetry
 */
export async function activate(activateArguments: {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    toolkitSettings: SettingsConfiguration
}) {
    const logger = getLogger()

    ext.telemetry = new DefaultTelemetryService(activateArguments.extensionContext, activateArguments.awsContext)
    new AwsTelemetryOptOut(ext.telemetry, activateArguments.toolkitSettings).ensureUserNotified().catch(err => {
        logger.warn(`Exception while displaying opt-out message: ${err}`)
    })
}
