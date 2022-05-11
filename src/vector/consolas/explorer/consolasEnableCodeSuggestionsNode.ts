/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { enableCodeSuggestions } from '../commands/treeNodeCommands'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableConsolasNode.label', 'Enable Consolas Code Suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
        tooltip: localize('AWS.explorerNode.enableConsolasNode.tooltip', 'Click to open the node'),
        contextValue: 'awsConsolasEnableCodeSuggestionsNode',
    })
