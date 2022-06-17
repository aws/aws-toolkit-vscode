/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import {
    enableCodeSuggestions,
    enterAccessToken,
    requestAccess,
    showIntroduction,
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    requestAccessCloud9,
} from '../commands/basicCommands'
import { ConsolasConstants } from '../models/constants'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableConsolasNode.label', 'Enable Consolas Code Suggestions'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
        tooltip: localize('AWS.explorerNode.enableConsolasNode.tooltip', 'Click to open the node'),
    })

export const createAutoSuggestionsNode = (pause: boolean) =>
    toggleCodeSuggestions.build().asTreeNode(
        pause
            ? {
                  label: localize('AWS.explorerNode.pauseConsolasNode.label', 'Pause Auto-suggestions'),
                  iconPath: {
                      dark: vscode.Uri.file(globals.iconPaths.dark.pause),
                      light: vscode.Uri.file(globals.iconPaths.light.pause),
                  },
              }
            : {
                  label: localize('AWS.explorerNode.resumeConsolasNode.label', 'Resume Auto-suggestions'),
                  iconPath: {
                      dark: vscode.Uri.file(globals.iconPaths.dark.run),
                      light: vscode.Uri.file(globals.iconPaths.light.run),
                  },
              }
    )

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

export const createEnterAccessCodeNode = () =>
    enterAccessToken.build().asTreeNode({
        label: localize('AWS.explorerNode.enterConsolasAccessTokenNode.label', 'Enter Preview Access Code'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.email),
            light: vscode.Uri.file(globals.iconPaths.light.email),
        },
    })

export const createRequestAccessNode = () =>
    requestAccess.build().asTreeNode({
        label: localize('AWS.explorerNode.requestConsolasAccessNode.label', 'Request Preview Access'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.megaphone),
            light: vscode.Uri.file(globals.iconPaths.light.megaphone),
        },
    })

export const createOpenReferenceLogNode = () =>
    showReferenceLog.build().asTreeNode({
        label: localize('AWS.explorerNode.consolasOpenReferenceLogNode.label', 'Open Code Reference Panel'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.file),
            light: vscode.Uri.file(globals.iconPaths.light.file),
        },
        tooltip: localize(
            'AWS.explorerNode.consolasOpenReferenceLogNode.tooltip',
            'Click to open Code Reference Panel'
        ),
        contextValue: 'awsConsolasOpenReferenceLogNode',
    })

export const createSecurityScanNode = () => {
    const running = globals.context.globalState.get<boolean>(ConsolasConstants.codeScanStartedKey)
    const prefix = running ? 'Running' : 'Start'
    return showSecurityScan.build().asTreeNode({
        label: `${prefix} Security Scan`,
        iconPath: running
            ? {
                  dark: vscode.Uri.file(globals.iconPaths.dark.loading),
                  light: vscode.Uri.file(globals.iconPaths.light.loading),
              }
            : {
                  dark: vscode.Uri.file(globals.iconPaths.dark.securityScan),
                  light: vscode.Uri.file(globals.iconPaths.light.securityScan),
              },
        tooltip: `${prefix} Security Scan`,
        contextValue: `awsConsolas${prefix}SecurityScanNode`,
    })
}

export const createRequestAccessNodeCloud9 = () => {
    return requestAccessCloud9.build().asTreeNode({
        label: `Request Access`,
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.megaphone),
            light: vscode.Uri.file(globals.iconPaths.light.megaphone),
        },
        tooltip: `Request Access`,
        contextValue: `awsConsolasRequestAccessNodeCloud9`,
    })
}
