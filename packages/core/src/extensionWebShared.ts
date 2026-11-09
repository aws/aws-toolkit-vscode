/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './shared/logger/logger'
import os from 'os'

/**
 * This executes the web activation code that all extensions share. So any extension supporting web
 * should run this as part of their web activation.
 */
export async function activateWebShared(context: vscode.ExtensionContext) {
    try {
        patchOsVersion()
    } catch (error) {
        getLogger().error(`Failed activation in extensionWebShared:`, error)
    }
}

/**
 * The browserfied version of os does not have a `version()` method,
 * so we patch it.
 */
function patchOsVersion() {
    ;(os.version as any) = () => '1.0.0'
}
