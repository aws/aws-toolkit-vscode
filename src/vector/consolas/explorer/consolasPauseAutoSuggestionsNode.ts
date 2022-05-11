/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { toggleCodeSuggestions } from '../commands/treeNodeCommands'

export const createPauseAutoSuggestionsNode = () =>
    toggleCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.pauseConsolasNode.label', 'Pause auto-suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.pause),
            light: vscode.Uri.file(globals.iconPaths.light.pause),
        },
        contextValue: 'awsConsolasPauseAutoSuggestionsNode',
    })
