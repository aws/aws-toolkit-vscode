/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../../src/shared/utilities/vsCodeUtils'
import * as vscode from 'vscode'
import { AslVisualization } from '../../../src/stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { getStateMachineDefinitionFromCfnTemplate, toUnescapedAslJsonString } from '../../stepFunctions/commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'
import { writeFile } from 'fs';

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
        const text = toUnescapedAslJsonString(definitionString ? definitionString : '')
        writeFile(`/Users/yonakim/Desktop/NewCDKExamples/aws-cdk-examples/typescript/Testing/${this.uniqueIdentifier}.asl.json`, text, (err) => {
            // When a request is aborted - the callback is called with an AbortError
          });
        //console.log(this.templatePath)
        //console.log(toUnescapedAslJsonString(definitionString ? definitionString : ''))
        return toUnescapedAslJsonString(definitionString ? definitionString : '')
    }

    protected makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
        return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', this.uniqueIdentifier)
    }

    
}