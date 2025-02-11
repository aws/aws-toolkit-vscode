/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './shared/logger/logger'
import { activateCommon, deactivateCommon } from './extension'
import { activateWebShared } from './extensionWebShared'

export async function activate(context: vscode.ExtensionContext) {
    const contextPrefix = 'toolkit'

    await activateWebShared(context)

    try {
        // IMPORTANT: Any new activation code should be done in the function below unless
        // it is web mode specific activation code.
        // This should happen as early as possible, as initialize() must be called before
        // isWeb() calls will work.
        await activateCommon(context, contextPrefix, true)
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger().error(`Failed to activate extension`, error)
    }
}

export async function deactivate() {
    await deactivateCommon()
}
