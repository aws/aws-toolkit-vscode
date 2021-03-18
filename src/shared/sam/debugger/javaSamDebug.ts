/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../../extensions'
import { getLogger } from '../../logger'

export async function activateJavaExtensionIfInstalled() {
    const extension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.java)

    // If the extension is not installed, it is not a failure. There may be reduced functionality.
    if (extension && !extension.isActive) {
        getLogger().info('Java CodeLens Provider is activating the Java extension')
        await extension.activate()
    }
}
