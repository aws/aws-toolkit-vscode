/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'

export interface IconPath {
    light: vscode.Uri
    dark: vscode.Uri
}

export function setupTestIconPaths() {
    globals.iconPaths.dark.help = '/icons/dark/help'
    globals.iconPaths.light.help = '/icons/light/help'

    globals.iconPaths.dark.cloudFormation = '/icons/dark/cloudformation'
    globals.iconPaths.light.cloudFormation = '/icons/light/cloudformation'

    globals.iconPaths.dark.cloudWatchLogGroup = '/icons/dark/cloudWatchLogGroup'
    globals.iconPaths.light.cloudWatchLogGroup = '/icons/light/cloudWatchLogGroup'

    globals.iconPaths.dark.lambda = '/icons/dark/lambda'
    globals.iconPaths.light.lambda = '/icons/light/lambda'

    globals.iconPaths.dark.settings = '/icons/dark/settings'
    globals.iconPaths.light.settings = '/icons/light/settings'

    globals.iconPaths.dark.registry = '/icons/dark/registry'
    globals.iconPaths.light.registry = '/icons/light/registry'

    globals.iconPaths.dark.s3 = '/icons/dark/s3'
    globals.iconPaths.light.s3 = '/icons/light/s3'

    globals.iconPaths.dark.folder = '/icons/dark/folder'
    globals.iconPaths.light.folder = '/icons/light/folder'

    globals.iconPaths.dark.file = '/icons/dark/file'
    globals.iconPaths.light.file = '/icons/light/file'

    globals.iconPaths.dark.schema = '/icons/dark/schema'
    globals.iconPaths.light.schema = '/icons/light/schema'
}

export function clearTestIconPaths() {
    globals.iconPaths.dark.help = ''
    globals.iconPaths.light.help = ''

    globals.iconPaths.dark.cloudFormation = ''
    globals.iconPaths.light.cloudFormation = ''

    globals.iconPaths.dark.lambda = ''
    globals.iconPaths.light.lambda = ''

    globals.iconPaths.dark.settings = ''
    globals.iconPaths.light.settings = ''

    globals.iconPaths.dark.registry = ''
    globals.iconPaths.light.registry = ''

    globals.iconPaths.dark.s3 = ''
    globals.iconPaths.light.s3 = ''

    globals.iconPaths.dark.folder = ''
    globals.iconPaths.light.folder = ''

    globals.iconPaths.dark.file = ''
    globals.iconPaths.light.file = ''

    globals.iconPaths.dark.schema = ''
    globals.iconPaths.light.schema = ''
}
