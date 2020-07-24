'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.validateVariableParameters = exports.validateVariableValues = void 0
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const constants_1 = require('../constants/constants')
const util_1 = require('../util/util')
function validateVariableValues(textDocument) {
    /* The validateor creates diagnostics for all variables of format {{ ACTION.VAR }}
     * and checks 1. ACTION is an existing action 2. VAR is an existing input property or
     * output value
     */
    if (
        util_1.findSchemaVersion(textDocument.getText()) !== '0.3' ||
        util_1.findDocumentType(textDocument) !== 'automation'
    ) {
        return []
    }
    const diagnostics = []
    const varPattern = /{{[ ]?\w+\.\w+[ ]?}}/g
    // tslint:disable:no-unsafe-any
    let obj
    try {
        obj = util_1.parseDocument(textDocument)
    } catch (err) {
        // Fail to parse document (document contains basic JSON/YAML syntax errors)
        return diagnostics
    }
    const variables = util_1.findRegPattern(textDocument, varPattern)
    variables.forEach(variable => {
        if (!obj.hasOwnProperty('mainSteps')) {
            // document does not contain mainSteps
            const diagnostic = {
                severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
                range: {
                    start: variable.start,
                    end: variable.end,
                },
                message: 'Missing required property "mainSteps"',
            }
            diagnostics.push(diagnostic)
        } else {
            const actions = obj.mainSteps
            const [targetAction, targetVarValue] = util_1.getVariableName(variable.value).split('.')
            const foundActions = actions.filter(action => action.name === targetAction)
            if (!foundActions || !foundActions.length) {
                // mainSteps does not contain the action
                const diagnostic = {
                    severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
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
                    if (action.action && constants_1.automationAction[action.action].includes(targetVarValue)) {
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
                    const diagnostic = {
                        severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
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
exports.validateVariableValues = validateVariableValues
function validateVariableParameters(textDocument) {
    /* The validator creates diagnostics for all variables of format {{ VAR_NAME }}
     * and checks whether the corresponding VARNAME appeared under parameters
     */
    const diagnostics = []
    const varPattern = /{{[ ]?\w+[ ]?}}/g
    let obj
    try {
        obj = util_1.parseDocument(textDocument)
    } catch (err) {
        // Fail to parse document (document contains basic JSON/YAML syntax errors)
        return diagnostics
    }
    const params = util_1.findRegPattern(textDocument, varPattern)
    params.forEach(param => {
        const varName = util_1.getVariableName(param.value)
        if (!obj.hasOwnProperty('parameters')) {
            const diagnostic = {
                severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
                range: {
                    start: param.start,
                    end: param.end,
                },
                message: 'Missing required property "parameters".',
            }
            diagnostics.push(diagnostic)
        } else {
            if (obj.parameters && !obj.parameters.hasOwnProperty(varName)) {
                const diagnostic = {
                    severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
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
exports.validateVariableParameters = validateVariableParameters
//# sourceMappingURL=validateVariables.js.map
