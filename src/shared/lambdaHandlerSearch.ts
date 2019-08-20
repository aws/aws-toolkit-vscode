/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Range } from 'vscode'

export interface AbsoluteCharOffset {
    positionStart: number
    positionEnd: number
}

export type RangeOrCharOffset = Range | AbsoluteCharOffset

export interface LambdaHandlerCandidate {
    handlerName: string
    filename: string
    range: RangeOrCharOffset
}

export interface LambdaHandlerSearch {
    /**
     * @description Looks for functions that appear to be valid Lambda Function Handlers.
     * @returns A collection of information for each detected candidate.
     */
    findCandidateLambdaHandlers(): Promise<LambdaHandlerCandidate[]>
}
