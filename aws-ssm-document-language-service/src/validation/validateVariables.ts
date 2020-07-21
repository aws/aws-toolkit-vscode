/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-json-languageservice'
import { automationAction } from '../constants/constants'
import { findDocumentType, findRegPattern, findSchemaVersion, getVariableName, parseDocument } from '../util/util'

interface Action {
    name: string
    action: string
    inputs: object
    outputs?: {
        Name: string
    }[]
}

export function validateVariableValues(textDocument: TextDocument): Diagnostic[] {
    /* The validateor creates diagnostics for all variables of format {{ ACTION.VAR }}
     * and checks 1. ACTION is an existing action 2. VAR is an existing input property or
     * output value
     */

    if (findSchemaVersion(textDocument.getText()) !== '0.3' || findDocumentType(textDocument) !== 'automation') {
        return []
    }

    const diagnostics: Diagnostic[] = []
    const varPattern = /{{[ ]?\w+\.\w+[ ]?}}/g
    // tslint:disable:no-unsafe-any
    let obj: any

    try {
        obj = parseDocument(textDocument)
    } catch (err) {
        // Fail to parse document (document contains basic JSON/YAML syntax errors)
        return diagnostics
    }

    const variables = findRegPattern(textDocument, varPattern)
    variables.forEach(variable => {
        if (!obj.hasOwnProperty('mainSteps')) {
            // document does not contain mainSteps
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: variable.start,
                    end: variable.end,
                },
                message: 'Missing required property "mainSteps"',
            }
            diagnostics.push(diagnostic)
        } else {
            const actions: Action[] = obj.mainSteps
            const [targetAction, targetVarValue] = getVariableName(variable.value).split('.')

            const foundActions = actions.filter(action => action.name === targetAction)
            if (!foundActions || !foundActions.length) {
                // mainSteps does not contain the action
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: variable.start,
                        end: variable.end,
                    },
                    message: `Cannot find action ${targetAction}`,
                }
                diagnostics.push(diagnostic)
            } else {
                const foundProperty = foundActions.filter(action => {
                    // targetVarValue is an output property of action
                    if (action.action && automationAction[action.action].includes(targetVarValue)) {
                        return action
                    }
                    // targetVarValue is an input property of action
                    if (action.inputs && action.inputs.hasOwnProperty(targetVarValue)) {
                        return action
                    }
                    // targetVarValue is the name of a custom output property
                    if (
                        action.outputs &&
                        action.outputs.filter(output => output.hasOwnProperty('Name') && output.Name === targetVarValue)
                    ) {
                        return action
                    }
                })

                // action does not contain the property
                if (!foundProperty || !foundProperty.length) {
                    const diagnostic: Diagnostic = {
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: variable.start,
                            end: variable.end,
                        },
                        message: `Cannot find property ${targetVarValue} of action ${targetAction}`,
                    }
                    diagnostics.push(diagnostic)
                }
            }
        }
    })

    return diagnostics
}

export function validateVariableParameters(textDocument: TextDocument): Diagnostic[] {
    /* The validator creates diagnostics for all variables of format {{ VAR_NAME }}
     * and checks whether the corresponding VARNAME appeared under parameters
     */
    const diagnostics: Diagnostic[] = []
    const varPattern = /{{[ ]?\w+[ ]?}}/g
    let obj: any

    try {
        obj = parseDocument(textDocument)
    } catch (err) {
        // Fail to parse document (document contains basic JSON/YAML syntax errors)
        return diagnostics
    }

    const params = findRegPattern(textDocument, varPattern)
    params.forEach(param => {
        const varName = getVariableName(param.value)
        if (!obj.hasOwnProperty('parameters')) {
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: param.start,
                    end: param.end,
                },
                message: 'Missing required property "parameters".',
            }
            diagnostics.push(diagnostic)
        } else {
            if (obj.parameters && !obj.parameters.hasOwnProperty(varName)) {
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: param.start,
                        end: param.end,
                    },
                    message: `Missing required property ${varName} under \"parameters\". ${varName} should be a parameter.`,
                }
                diagnostics.push(diagnostic)
            }
        }
    })

    return diagnostics
}
