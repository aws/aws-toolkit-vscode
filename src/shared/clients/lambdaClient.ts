/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import { _Blob } from 'aws-sdk/clients/lambda'

export interface LambdaClient {
    readonly regionCode: string

    /**
     * Deletes Lambda function from AWS
     * @param name Function to delete
     */
    deleteFunction(name: string): Promise<void>

    /**
     * Invokes a remote Lambda function
     * @param name Lambda to invoke
     * @param payload Payload to invoke with
     */
    invoke(name: string, payload?: _Blob): Promise<Lambda.InvocationResponse>

    /**
     * Lists available Lambda functions. Each iteration represents a single listed function
     *
     * TODO: Move to a more predictable iterator: iterate a page of results on each call so each call corresponds to a network request
     */
    listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration>

    /**
     * Runs AWS.Lambda.getFunction, which gets function metadata (including zip location)
     * @param name Function name
     */
    getFunction(name: string): Promise<Lambda.GetFunctionResponse>

    /**
     * Runs AWS.Lambda.updateFunctionCode
     * @param name Function name
     * @param zipFile Buffer containing zip file data
     *
     */
    updateFunctionCode(name: string, zipFile: Buffer): Promise<Lambda.FunctionConfiguration>
}
