/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as StepFunctions from '@aws-sdk/client-sfn'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../shared/clients/stepFunctions'
import { WorkflowStudioEditorProvider } from './workflowStudio/workflowStudioEditorProvider'

/**
 * Opens a state machine definition in Workflow Studio
 * @param stateMachineArn The ARN of the state machine
 * @param region The AWS region
 */
export const openWorkflowStudio = async (stateMachineArn: string, region: string) => {
    const client: StepFunctionsClient = new StepFunctionsClient(region)
    const stateMachineDetails: StepFunctions.DescribeStateMachineCommandOutput = await client.getStateMachineDetails({
        stateMachineArn,
    })

    await openWorkflowStudioWithDefinition(stateMachineDetails.definition)
}

/**
 * Opens a state machine definition in Workflow Studio using pre-fetched definition content
 * @param definition The state machine definition content
 * @param options Optional webview configuration options
 */
export const openWorkflowStudioWithDefinition = async (
    definition: string | undefined,
    options?: {
        preserveFocus?: boolean
        viewColumn?: vscode.ViewColumn
    }
) => {
    const doc = await vscode.workspace.openTextDocument({
        language: 'asl',
        content: definition,
    })

    const textEditor = await vscode.window.showTextDocument(doc)
    await WorkflowStudioEditorProvider.openWithWorkflowStudio(textEditor.document.uri, {
        preserveFocus: options?.preserveFocus ?? false,
        viewColumn: options?.viewColumn ?? vscode.ViewColumn.One,
    })
}
