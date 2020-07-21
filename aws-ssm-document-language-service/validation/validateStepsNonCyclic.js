'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.validateStepsNonCyclic = exports.dfs = exports.getOrderedSteps = void 0
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const util_1 = require('../util/util')
function getOrderedSteps(obj) {
    // tslint:disable:no-unsafe-any
    const steps = obj.mainSteps
    const stepList = []
    const stepDict = new Map()
    try {
        steps.forEach((step, index) => {
            stepList.push(step.name)
            stepDict[step.name] = {
                next: [],
                isEnd: false,
            }
            if (index !== 0) {
                const prevStep = steps[index - 1]
                if (!stepDict[prevStep.name].next.includes(step.name) && !prevStep.hasOwnProperty('nextStep')) {
                    stepDict[prevStep.name].next.push(step.name)
                }
            }
            if (step.hasOwnProperty('isEnd')) {
                stepDict[step.name].isEnd = step.isEnd
            }
            if (step.hasOwnProperty('nextStep')) {
                if (!stepDict[step.name].next.includes(step.nextStep)) {
                    stepDict[step.name].next.push(step.nextStep)
                }
            }
            if (step.action === 'aws:branch' && step.hasOwnProperty('inputs')) {
                if (step.inputs.hasOwnProperty('Choices')) {
                    step.inputs.Choices.forEach(choice => {
                        if (choice.hasOwnProperty('NextStep') && !stepDict[step.name].next.includes(choice.NextStep)) {
                            stepDict[step.name].next.push(choice.NextStep)
                        }
                    })
                }
                if (step.inputs.hasOwnProperty('Default') && !stepDict[step.name].next.includes(step.inputs.Default)) {
                    stepDict[step.name].next.push(step.inputs.Default)
                }
            }
        })
    } catch (error) {
        return { stepList: stepList, stepDict: stepDict }
    }
    return { stepList: stepList, stepDict: stepDict }
}
exports.getOrderedSteps = getOrderedSteps
function dfs(currStep, stepDict, util) {
    if (!util.visited[currStep]) {
        // mark node as visited and add note to recursion stack
        util.visited[currStep] = true
        util.recStack[currStep] = true
        if (stepDict[currStep] && !stepDict[currStep].isEnd) {
            // iterate through all possible next steps
            for (const nextStep of stepDict[currStep].next) {
                if (!util.visited[nextStep] && dfs(nextStep, stepDict, util)) {
                    return true
                }
                if (util.recStack[nextStep]) {
                    return true
                }
            }
        }
    }
    // remove node from recursion stack
    util.recStack[currStep] = false
    return false
}
exports.dfs = dfs
function validateStepsNonCyclic(textDoc) {
    const docText = textDoc.getText()
    if (util_1.findSchemaVersion(docText) !== '0.3' || util_1.findDocumentType(textDoc) !== 'automation') {
        return []
    }
    const diagnostics = []
    let obj
    try {
        obj = util_1.parseDocument(textDoc)
    } catch (err) {
        const diagnostic = {
            severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
            range: {
                start: textDoc.positionAt(0),
                end: textDoc.positionAt(1),
            },
            message: err.message,
        }
        diagnostics.push(diagnostic)
        // Fail to parse document (document contains basic JSON/YAML syntax errors)
        return diagnostics
    }
    if (obj.hasOwnProperty('mainSteps')) {
        const { stepList, stepDict } = getOrderedSteps(obj)
        const dup = stepList.filter((item, idx) => stepList.indexOf(item) !== idx)
        if (dup && dup.length) {
            const diagnostic = {
                severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
                range: {
                    start: textDoc.positionAt(docText.indexOf('mainSteps')),
                    end: textDoc.positionAt(docText.indexOf('mainSteps') + 'mainSteps'.length),
                },
                message: 'Mainsteps contains actions with duplicated names.',
            }
            diagnostics.push(diagnostic)
            return diagnostics
        }
        const visited = {}
        const recStack = {}
        const recUtil = {
            visited,
            recStack,
        }
        stepList.forEach(step => {
            recUtil.visited[step] = false
            recUtil.recStack[step] = false
        })
        for (const step of stepList) {
            if (dfs(step, stepDict, recUtil)) {
                const diagnostic = {
                    severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
                    range: {
                        start: textDoc.positionAt(docText.indexOf('mainSteps')),
                        end: textDoc.positionAt(docText.indexOf('mainSteps') + 'mainSteps'.length),
                    },
                    message: 'Action steps contain cycles.',
                }
                diagnostics.push(diagnostic)
                return diagnostics
            }
        }
    }
    return []
}
exports.validateStepsNonCyclic = validateStepsNonCyclic
//# sourceMappingURL=validateStepsNonCyclic.js.map
