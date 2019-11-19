/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../../shared/extensionGlobals'

export interface IconPath {
    light: vscode.Uri
    dark: vscode.Uri
}

export function setupTestIconPaths() {
    ext.iconPaths.dark.help = '/icons/dark/help'
    ext.iconPaths.light.help = '/icons/light/help'

    ext.iconPaths.dark.cloudFormation = '/icons/dark/cloudformation'
    ext.iconPaths.light.cloudFormation = '/icons/light/cloudformation'

    ext.iconPaths.dark.lambda = '/icons/dark/lambda'
    ext.iconPaths.light.lambda = '/icons/light/lambda'
}

export function clearTestIconPaths() {
    ext.iconPaths.dark.help = ''
    ext.iconPaths.light.help = ''

    ext.iconPaths.dark.cloudFormation = ''
    ext.iconPaths.light.cloudFormation = ''

    ext.iconPaths.dark.lambda = ''
    ext.iconPaths.light.lambda = ''
}
