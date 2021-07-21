/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AslVisualization } from '../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { getStateMachineDefinitionFromCfnTemplate, toUnescapedAslJsonString } from '../explorer/nodes/getCfnDefinition'

export class AslVisualizationCDK extends AslVisualization {
    public readonly templatePath: string
    public readonly uniqueIdentifier: string

    public constructor(textDocument: vscode.TextDocument, templatePath: string, uniqueIdentifier: string) {
        super(textDocument)
        this.templatePath = templatePath
        this.uniqueIdentifier = uniqueIdentifier
    }

    protected getText(textDocument: vscode.TextDocument): string {
        const definitionString = getStateMachineDefinitionFromCfnTemplate(this.uniqueIdentifier, this.templatePath)
        return toUnescapedAslJsonString(definitionString!)
    }
}