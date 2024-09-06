/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AslVisualization } from './aslVisualization'
import {
    getStateMachineDefinitionFromCfnTemplate,
    toUnescapedAslJsonString,
} from './getStateMachineDefinitionFromCfnTemplate'

export class AslVisualizationCDK extends AslVisualization {
    public constructor(
        textDocument: vscode.TextDocument,
        public readonly templatePath: string,
        public readonly stateMachineName: string
    ) {
        super(textDocument)
        this.templatePath = templatePath
        this.stateMachineName = stateMachineName
    }

    protected override getText(textDocument: vscode.TextDocument): string {
        this.updateWebviewTitle()
        const definitionString = getStateMachineDefinitionFromCfnTemplate(this.stateMachineName, this.templatePath)
        return toUnescapedAslJsonString(definitionString ? definitionString : '')
    }

    protected updateWebviewTitle(): void {
        if (this.getPanel()) {
            this.getPanel()!.title = this.stateMachineName
        }
    }
}
