/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { asyncGenerator } from '../../utilities/collectionUtils'

export class MockLambdaClient implements LambdaClient {
    public readonly regionCode: string
    public readonly deleteFunction: (name: string) => Promise<void>
    public readonly invoke: (name: string, payload?: Lambda._Blob) => Promise<Lambda.InvocationResponse>
    public readonly listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration>
    public readonly getFunction: (name: string) => Promise<Lambda.GetFunctionResponse>
    public readonly updateFunctionCode: (name: string, zipFile: Buffer) => Promise<Lambda.FunctionConfiguration>

    public constructor({
        regionCode = '',
        deleteFunction = async (name: string) => {},
        invoke = async (name: string, payload?: Lambda._Blob) => ({}),
        listFunctions = () => asyncGenerator([]),
        getFunction = async (name: string) => ({}),
        updateFunctionCode = async (name: string, zipFile: Buffer) => ({}),
    }: {
        regionCode?: string
        deleteFunction?(name: string): Promise<void>
        invoke?(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse>
        listFunctions?(): AsyncIterableIterator<Lambda.FunctionConfiguration>
        getFunction?(name: string): Promise<Lambda.GetFunctionResponse>
        updateFunctionCode?(name: string, zipFile: Buffer): Promise<Lambda.FunctionConfiguration>
    }) {
        this.regionCode = regionCode
        this.deleteFunction = deleteFunction
        this.invoke = invoke
        this.listFunctions = listFunctions
        this.getFunction = getFunction
        this.updateFunctionCode = updateFunctionCode
    }
}
