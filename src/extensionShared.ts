/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module contains shared code between the main extension and browser/web
 * extension entrypoints.
 */

import vscode from 'vscode'
import globals from './shared/extensionGlobals'
import { join } from 'path'

export function initializeManifestPaths(extensionContext: vscode.ExtensionContext) {
    globals.manifestPaths.endpoints = extensionContext.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.manifestPaths.lambdaSampleRequests = extensionContext.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
}
