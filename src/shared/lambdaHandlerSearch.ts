/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface LambdaHandlerCandidate {
    handlerName: string,
    filename: string,
    // Represents all of the component names that are used in a handler name (eg: filename, assembly, class, function)
    handlerStack: string[],
}

export interface LambdaHandlerSearch {

    /**
     * @description Looks for functions that appear to be valid Lambda Function Handlers.
     * @returns A collection of information for each detected candidate.
     */
    findCandidateLambdaHandlers(): Promise<LambdaHandlerCandidate[]>

}
