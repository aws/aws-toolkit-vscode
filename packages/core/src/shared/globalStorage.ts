/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from './extensionGlobals'

/**
 * Toolkit filesystem-based global storage (wraps vscode globalStorage).
 *
 * TODO: use {@link TypedSettings}
 */
export class GlobalStorage {
    public static devfileSchemaUri() {
        return vscode.Uri.joinPath(globals.context.globalStorageUri, 'devfile.schema.json')
    }

    public static samAndCfnSchemaDestinationUri() {
        return vscode.Uri.joinPath(globals.context.globalStorageUri, 'sam.schema.json')
    }
}
