/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AslVisualization } from '../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { getStateMachineDefinitionFromCfnTemplate, toUnescapedAslJson } from '../explorer/nodes/getCfnDefinition'

export class AslVisualizationCDK extends AslVisualization {
    public readonly templatePath: string
    public readonly uniqueIdentifier: string

    public constructor(textDocument: vscode.TextDocument, templatePath: string, uniqueIdentifier: string) {
        super(textDocument)
        this.templatePath = templatePath
        this.uniqueIdentifier = uniqueIdentifier
    }

    protected override getText(textDocument: vscode.TextDocument): string {
        console.log('aslVisualizationCDK.ts')
        const definitionString = getStateMachineDefinitionFromCfnTemplate(this.uniqueIdentifier, this.templatePath)
        const cfnDefinition = toUnescapedAslJson(definitionString!)
        return cfnDefinition
    }
}