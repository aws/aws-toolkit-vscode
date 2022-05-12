/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { enableCodeSuggestions, showIntroduction, toggleCodeSuggestions } from '../commands/basicCommands'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableConsolasNode.label', 'Enable Consolas Code Suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
        tooltip: localize('AWS.explorerNode.enableConsolasNode.tooltip', 'Click to open the node'),
    })

export const createPauseAutoSuggestionsNode = () =>
    toggleCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.pauseConsolasNode.label', 'Pause auto-suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.pause),
            light: vscode.Uri.file(globals.iconPaths.light.pause),
        },
    })

export const createResumeAutoSuggestionsNode = () =>
    toggleCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.resumeConsolasNode.label', 'Resume auto-suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
    })

export const createIntroductionNode = () =>
    showIntroduction.build().asTreeNode({
        label: localize('AWS.explorerNode.consolasIntroductionNode.label', 'What is Consolas?'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.question),
            light: vscode.Uri.file(globals.iconPaths.light.question),
        },
        tooltip: localize('AWS.explorerNode.consolasIntroductionNode.tooltip', 'Click to open the node'),
        contextValue: 'awsConsolasIntroductionNode',
    })
