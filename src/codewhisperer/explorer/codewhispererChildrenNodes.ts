/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { localize } from '../../shared/utilities/vsCodeUtils'
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
import { codeScanState } from '../models/model'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableCodeWhispererNode.label', 'Enable CodeWhisperer'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        },
        tooltip: localize('AWS.explorerNode.enableCodeWhispererNode.tooltip', 'Click to Enable CodeWhisperer'),
    })

export const createAutoSuggestionsNode = (pause: boolean) =>
    toggleCodeSuggestions.build().asTreeNode(
        pause
            ? {
                  label: localize('AWS.explorerNode.pauseCodeWhispererNode.label', 'Pause Auto-suggestions'),
                  iconPath: {
                      dark: vscode.Uri.file(globals.iconPaths.dark.pause),
                      light: vscode.Uri.file(globals.iconPaths.light.pause),
                  },
              }
            : {
                  label: localize('AWS.explorerNode.resumeCodeWhispererNode.label', 'Resume Auto-suggestions'),
                  iconPath: {
                      dark: vscode.Uri.file(globals.iconPaths.dark.run),
                      light: vscode.Uri.file(globals.iconPaths.light.run),
                  },
              }
    )

export const createIntroductionNode = () =>
    showIntroduction.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererIntroductionNode.label', 'What is CodeWhisperer?'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.question),
            light: vscode.Uri.file(globals.iconPaths.light.question),
        },
        tooltip: localize('AWS.explorerNode.codewhispererIntroductionNode.tooltip', 'Click to open the node'),
        contextValue: 'awsCodeWhispererIntroductionNode',
    })

export const createEnterAccessCodeNode = () =>
    enterAccessToken.build().asTreeNode({
        label: localize('AWS.explorerNode.enterCodeWhispererAccessTokenNode.label', 'Enter Preview Access Code'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.email),
            light: vscode.Uri.file(globals.iconPaths.light.email),
        },
    })

export const createRequestAccessNode = () =>
    requestAccess.build().asTreeNode({
        label: localize('AWS.explorerNode.requestCodeWhispererAccessNode.label', 'Request Preview Access'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.megaphone),
            light: vscode.Uri.file(globals.iconPaths.light.megaphone),
        },
    })

export const createOpenReferenceLogNode = () =>
    showReferenceLog.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererOpenReferenceLogNode.label', 'Open Code Reference Panel'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.file),
            light: vscode.Uri.file(globals.iconPaths.light.file),
        },
        tooltip: localize(
            'AWS.explorerNode.codewhispererOpenReferenceLogNode.tooltip',
            'Click to open Code Reference Panel'
        ),
        contextValue: 'awsCodeWhispererOpenReferenceLogNode',
    })

export const createSecurityScanNode = () => {
    const prefix = codeScanState.running ? 'Running' : 'Run'
    return showSecurityScan.build().asTreeNode({
        label: `${prefix} Security Scan`,
        iconPath: codeScanState.running
            ? {
                  dark: vscode.Uri.file(globals.iconPaths.dark.loading),
                  light: vscode.Uri.file(globals.iconPaths.light.loading),
              }
            : {
                  dark: vscode.Uri.file(globals.iconPaths.dark.securityScan),
                  light: vscode.Uri.file(globals.iconPaths.light.securityScan),
              },
        tooltip: `${prefix} Security Scan`,
        contextValue: `awsCodeWhisperer${prefix}SecurityScanNode`,
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
        contextValue: `awsCodeWhispererRequestAccessNodeCloud9`,
    })
}
