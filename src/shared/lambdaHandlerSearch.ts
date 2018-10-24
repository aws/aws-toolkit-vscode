/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface LambdaHandlerCandidate {
    handlerName: string,
    filename: string,
}

export interface LambdaHandlerSearch {

    /**
     * @description Looks for functions that appear to be valid Lambda Function Handlers.
     * @returns A collection of information for each detected candidate.
     */
    findCandidateLambdaHandlers(): Promise<LambdaHandlerCandidate[]>

}
