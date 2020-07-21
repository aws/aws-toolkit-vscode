/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { Diagnostic, TextDocument } from 'vscode-json-languageservice'
export interface Step {
    next: string[]
    isEnd: boolean
}
export declare function getOrderedSteps(obj: {
    mainSteps: Step[]
}): {
    stepList: string[]
    stepDict: object
}
export declare function dfs(
    currStep: string,
    stepDict: object,
    util: {
        visited: object
        recStack: object
    }
): boolean
export declare function validateStepsNonCyclic(textDoc: TextDocument): Diagnostic[]
