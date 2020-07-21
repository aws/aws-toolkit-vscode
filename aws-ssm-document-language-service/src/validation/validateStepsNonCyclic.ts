/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-json-languageservice'
import { findDocumentType, findSchemaVersion, parseDocument } from '../util/util'

export interface Step {
    next: string[] // all potential next steps
    isEnd: boolean
}

export function getOrderedSteps(obj: { mainSteps: Step[] }): { stepList: string[]; stepDict: object } {
    // tslint:disable:no-unsafe-any
    const steps: any[] = obj.mainSteps
    const stepList: string[] = []
    const stepDict = new Map<string, Step>()

    try {
        steps.forEach((step, index) => {
            stepList.push(step.name)
            stepDict[step.name] = {
                next: [] as string[],
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

export function dfs(currStep: string, stepDict: object, util: { visited: object; recStack: object }): boolean {
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

export function validateStepsNonCyclic(textDoc: TextDocument): Diagnostic[] {
    const docText = textDoc.getText()
    if (findSchemaVersion(docText) !== '0.3' || findDocumentType(textDoc) !== 'automation') {
        return []
    }
    const diagnostics: Diagnostic[] = []
    let obj: any
    try {
        obj = parseDocument(textDoc)
    } catch (err) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
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
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDoc.positionAt(docText.indexOf('mainSteps')),
                    end: textDoc.positionAt(docText.indexOf('mainSteps') + 'mainSteps'.length),
                },
                message: 'Mainsteps contains actions with duplicated names.',
            }
            diagnostics.push(diagnostic)

            return diagnostics
        }

        const visited: object = {}
        const recStack: object = {}
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
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
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
