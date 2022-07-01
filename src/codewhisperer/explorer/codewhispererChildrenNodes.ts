/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getIcon } from '../../shared/icons'
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
        iconPath: getIcon('vscode-debug-start'),
        tooltip: localize('AWS.explorerNode.enableCodeWhispererNode.tooltip', 'Click to Enable CodeWhisperer'),
    })

export const createAutoSuggestionsNode = (pause: boolean) =>
    toggleCodeSuggestions.build().asTreeNode(
        pause
            ? {
                  label: localize('AWS.explorerNode.pauseCodeWhispererNode.label', 'Pause Auto-suggestions'),
                  iconPath: getIcon('vscode-debug-pause'),
              }
            : {
                  label: localize('AWS.explorerNode.resumeCodeWhispererNode.label', 'Resume Auto-suggestions'),
                  iconPath: getIcon('vscode-debug-start'),
              }
    )

export const createIntroductionNode = () =>
    showIntroduction.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererIntroductionNode.label', 'What is CodeWhisperer?'),
        iconPath: getIcon('vscode-help'),
        tooltip: localize('AWS.explorerNode.codewhispererIntroductionNode.tooltip', 'Click to open the node'),
        contextValue: 'awsCodeWhispererIntroductionNode',
    })

export const createEnterAccessCodeNode = () =>
    enterAccessToken.build().asTreeNode({
        label: localize('AWS.explorerNode.enterCodeWhispererAccessTokenNode.label', 'Enter Preview Access Code'),
        iconPath: getIcon('vscode-mail'),
    })

export const createRequestAccessNode = () =>
    requestAccess.build().asTreeNode({
        label: localize('AWS.explorerNode.requestCodeWhispererAccessNode.label', 'Request Preview Access'),
        iconPath: getIcon('vscode-megaphone'),
    })

export const createOpenReferenceLogNode = () =>
    showReferenceLog.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererOpenReferenceLogNode.label', 'Open Code Reference Panel'),
        iconPath: getIcon('vscode-file'),
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
        iconPath: codeScanState.running ? getIcon('vscode-loading~spin') : getIcon('vscode-debug-alt-small'),
        tooltip: `${prefix} Security Scan`,
        contextValue: `awsCodeWhisperer${prefix}SecurityScanNode`,
    })
}

export const createRequestAccessNodeCloud9 = () => {
    return requestAccessCloud9.build().asTreeNode({
        label: `Request Access`,
        iconPath: getIcon('vscode-megaphone'),
        tooltip: `Request Access`,
        contextValue: `awsCodeWhispererRequestAccessNodeCloud9`,
    })
}
