/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { toggleCodeSuggestions } from '../commands/treeNodeCommands'

export const createResumeAutoSuggestionsNode = () =>
    toggleCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.resumeConsolasNode.label', 'Resume auto-suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
        contextValue: 'awsConsolasResumeAutoSuggestionsNode',
    })
