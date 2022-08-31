/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { CodeWhispererConstants } from '../models/constants'
import {
    createEnableCodeSuggestionsNode,
    createEnterAccessCodeNode,
    createIntroductionNode,
    createAutoSuggestionsNode,
    createRequestAccessNode,
    createOpenReferenceLogNode,
    createSecurityScanNode,
    createRequestAccessNodeCloud9,
} from './codewhispererChildrenNodes'
import { Commands } from '../../shared/vscode/commands2'
import { RootNode } from '../../awsexplorer/localExplorer'
import { Experiments } from '../../shared/settings'
import { isCloud9 } from '../../shared/extensionUtilities'
import { Cloud9AccessState } from '../models/model'
import { telemetry } from '../../shared/telemetry/telemetry'
export class CodeWhispererNode implements RootNode {
    public readonly id = 'codewhisperer'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    constructor() {
        Experiments.instance.onDidChange(async ({ key }) => {
            if (key === 'CodeWhisperer') {
                this.onDidChangeVisibilityEmitter.fire()
                const codewhispererEnabled = await Experiments.instance.isExperimentEnabled('CodeWhisperer')
                telemetry.aws_experimentActivation.emit({
                    experimentId: CodeWhispererConstants.experimentId,
                    experimentState: codewhispererEnabled ? 'activated' : 'deactivated',
                    passive: false,
                })
            }
        })
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('CodeWhisperer (Preview)')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsCodeWhispererNode'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public getChildren() {
        const termsAccepted = globals.context.globalState.get<boolean>(CodeWhispererConstants.termsAcceptedKey)
        const autoTriggerEnabled =
            globals.context.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false

        if (isCloud9()) {
            const cloud9AccessState = globals.context.globalState.get<number | undefined>(
                CodeWhispererConstants.cloud9AccessStateKey
            )
            if (cloud9AccessState === undefined) {
                return [createIntroductionNode()]
            } else if (
                cloud9AccessState === Cloud9AccessState.NoAccess ||
                cloud9AccessState === Cloud9AccessState.RequestedAccess
            ) {
                return [createIntroductionNode(), createRequestAccessNodeCloud9()]
            } else {
                if (termsAccepted) {
                    return [createAutoSuggestionsNode(autoTriggerEnabled), createOpenReferenceLogNode()]
                } else {
                    return [createIntroductionNode(), createEnableCodeSuggestionsNode()]
                }
            }
        } else {
            if (globals.context.globalState.get<string | undefined>(CodeWhispererConstants.accessToken)) {
                if (termsAccepted) {
                    return [
                        createAutoSuggestionsNode(autoTriggerEnabled),
                        createOpenReferenceLogNode(),
                        createSecurityScanNode(),
                    ]
                } else {
                    return [createIntroductionNode(), createEnableCodeSuggestionsNode()]
                }
            } else {
                return [createIntroductionNode(), createEnterAccessCodeNode(), createRequestAccessNode()]
            }
        }
    }

    public async canShow(): Promise<boolean> {
        return await Experiments.instance.isExperimentEnabled('CodeWhisperer')
    }
}

export const codewhispererNode = new CodeWhispererNode()
export const refreshCodeWhisperer = Commands.register(
    'aws.codeWhisperer.refresh',
    codewhispererNode.refresh.bind(codewhispererNode)
)
