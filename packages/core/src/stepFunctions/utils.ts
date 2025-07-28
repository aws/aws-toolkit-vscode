/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as StepFunctions from '@aws-sdk/client-sfn'
import * as yaml from 'js-yaml'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../shared/clients/stepFunctions'
import {
    DiagnosticSeverity,
    DocumentLanguageSettings,
    getLanguageService,
    TextDocument as ASLTextDocument,
} from 'amazon-states-language-service'
import { fromExtensionManifest } from '../shared/settings'
import { IamRole } from '../shared/clients/iam'
import { ExecutionDetailsContext } from './messageHandlers/types'
import { WorkflowStudioEditorProvider } from './workflowStudio/workflowStudioEditorProvider'

const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
const languageService = getLanguageService({})

const arnResourceTypeSegmentIndex = 5
const expressExecutionArnSegmentCount = 9
const arnRegionSegmentIndex = 3
const arnAccountIdSegmentIndex = 4
const arnStateMachineNameSegmentIndex = 6

export async function* listStateMachines(
    client: StepFunctionsClient
): AsyncIterableIterator<StepFunctions.StateMachineListItem> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.statemachines', 'Loading State Machines...')
    )

    try {
        yield* client.listStateMachines()
    } finally {
        if (status) {
            status.dispose()
        }
    }
}

/**
 * Checks if the given IAM Role is assumable by AWS Step Functions.
 * @param role The IAM role to check
 */
export function isStepFunctionsRole(role: IamRole): boolean {
    const stepFunctionsSevicePrincipal: string = 'states.amazonaws.com'
    const assumeRolePolicyDocument: string | undefined = role.AssumeRolePolicyDocument

    return !!assumeRolePolicyDocument?.includes(stepFunctionsSevicePrincipal)
}

export async function isDocumentValid(text: string, textDocument?: vscode.TextDocument): Promise<boolean> {
    if (!textDocument || !text) {
        return false
    }

    const doc = ASLTextDocument.create(textDocument.uri.path, textDocument.languageId, textDocument.version, text)
    const jsonDocument = languageService.parseJSONDocument(doc)
    const diagnostics = await languageService.doValidation(doc, jsonDocument, documentSettings)
    const isValid = !diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)

    return isValid
}

/**
 * Checks if the JSON content in an ASL text document is invalid.
 * Returns `true` for invalid JSON; `false` for valid JSON, empty content, or non-JSON files.
 *
 * @param textDocument - The text document to check.
 * @returns `true` if invalid; `false` otherwise.
 */
export const isInvalidJsonFile = (textDocument: vscode.TextDocument): boolean => {
    const documentContent = textDocument.getText().trim()
    // An empty file or whitespace-only text is considered valid JSON for our use case
    return textDocument.languageId === 'asl' && documentContent ? isInvalidJson(documentContent) : false
}

/**
 * Checks if the YAML content in an ASL text document is invalid.
 * Returns `true` for invalid YAML; `false` for valid YAML, empty content, or non-YAML files.
 *
 * @param textDocument - The text document to check.
 * @returns `true` if invalid; `false` otherwise.
 */
export const isInvalidYamlFile = (textDocument: vscode.TextDocument): boolean => {
    try {
        if (textDocument.languageId === 'asl-yaml') {
            yaml.load(textDocument.getText())
        }
        return false
    } catch {
        return true
    }
}

/**
 * Determines if execution ARN is for an express execution
 * @param arn  Execution ARN to check
 * @returns true if it's an express execution, false if its a standard execution
 */
export const isExpressExecution = (arn: string): boolean => {
    const arnSegments = arn.split(':')
    return (
        arnSegments.length === expressExecutionArnSegmentCount && arnSegments[arnResourceTypeSegmentIndex] === 'express'
    )
}

/**
 * Parses an execution ARN to extract state machine information
 * @param executionArn The execution ARN to parse
 * @returns Object containing region, state machine name, and state machine ARN
 */
export const parseExecutionArnForStateMachine = (executionArn: string) => {
    const arnSegments = executionArn.split(':')
    const region = arnSegments[arnRegionSegmentIndex]
    const stateMachineName = arnSegments[arnStateMachineNameSegmentIndex]
    const stateMachineArn = `arn:aws:states:${region}:${arnSegments[arnAccountIdSegmentIndex]}:stateMachine:${stateMachineName}`

    return {
        region,
        stateMachineName,
        stateMachineArn,
    }
}

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
 */
export const openWorkflowStudioWithDefinition = async (definition: string | undefined) => {
    const doc = await vscode.workspace.openTextDocument({
        language: 'asl',
        content: definition,
    })

    const textEditor = await vscode.window.showTextDocument(doc)
    await WorkflowStudioEditorProvider.openWithWorkflowStudio(textEditor.document.uri, {
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.Beside,
    })
}

export const openWFSfromARN = async (context: ExecutionDetailsContext) => {
    const params = parseExecutionArnForStateMachine(context.executionArn)
    await openWorkflowStudio(params.stateMachineArn, params.region)
}

const isInvalidJson = (content: string): boolean => {
    try {
        JSON.parse(content)
        return false
    } catch {
        return true
    }
}

const descriptor = {
    maxItemsComputed: (v: unknown) => Math.trunc(Math.max(0, Number(v))),
    ['format.enable']: Boolean,
}

export class StepFunctionsSettings extends fromExtensionManifest('aws.stepfunctions.asl', descriptor) {}
