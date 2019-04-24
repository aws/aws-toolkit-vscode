/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import { _Blob } from 'aws-sdk/clients/lambda'

export interface LambdaClient {
    readonly regionCode: string

    deleteFunction(name: string): Promise<void>

    invoke(name: string, payload?: _Blob): Promise<Lambda.InvocationResponse>

    listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration>
}
