/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { StepFunctions } from 'aws-sdk'
import * as yaml from 'js-yaml'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../shared/clients/stepFunctionsClient'
import {
    DiagnosticSeverity,
    DocumentLanguageSettings,
    getLanguageService,
    TextDocument as ASLTextDocument,
} from 'amazon-states-language-service'
import { fromExtensionManifest } from '../shared/settings'
import { IamRole } from '../shared/clients/iam'

const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
const languageService = getLanguageService({})

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
