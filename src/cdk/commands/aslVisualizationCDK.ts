/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../../src/shared/utilities/vsCodeUtils'
import * as vscode from 'vscode'
import { AslVisualization } from '../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { getStateMachineDefinitionFromCfnTemplate, toUnescapedAslJsonString } from '../../stepFunctions/commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'

export class AslVisualizationCDK extends AslVisualization {
    public readonly templatePath: string
    public readonly cdkAppName: string
    public readonly stateMachineName: string

    public constructor(textDocument: vscode.TextDocument, templatePath: string, cdkAppName: string, stateMachineName: string) {
        super(textDocument)
        this.templatePath = templatePath
        this.cdkAppName = cdkAppName
        this.stateMachineName = stateMachineName
    }

    protected getText(textDocument: vscode.TextDocument): string {
        const definitionString = getStateMachineDefinitionFromCfnTemplate(this.stateMachineName, this.templatePath)
        return toUnescapedAslJsonString(definitionString ? definitionString : '')
    }

    // protected makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
    //     return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', this.stateMachineName)
    // }
}