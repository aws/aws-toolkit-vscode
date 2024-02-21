/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { setWeb } from './common/webUtils'
import { getLogger } from './shared/logger'
import { activateShared, deactivateShared } from './extensionShared'
import { RegionProvider, defaultRegion } from './shared/regions/regionProvider'
import os from 'os'

export async function activate(context: vscode.ExtensionContext) {
    setWeb(true) // THIS MUST ALWAYS BE FIRST

    void vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided'
    )

    try {
        patchOsVersion()

        // IMPORTANT: Any new activation code should be done in the function below unless
        // it is browser specific activation code.
        await activateShared(context, () => {
            return {
                guessDefaultRegion: () => defaultRegion,
            } as RegionProvider
        })
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger().error(`Failed to activate extension`, error)
    }
}

/**
 * The browserfied version of os does not have a `version()` method,
 * so we patch it.
 */
function patchOsVersion() {
    ;(os.version as any) = () => '1.0.0'
}

export async function deactivate() {
    await deactivateShared()
}
