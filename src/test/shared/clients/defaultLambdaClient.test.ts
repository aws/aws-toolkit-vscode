/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import { stub, createStubInstance, SinonStubbedInstance } from 'sinon'
import { Lambda, Request } from 'aws-sdk'
import * as assert from 'assert'
import { FunctionUrlConfigList, FunctionUrlConfig, ListFunctionUrlConfigsResponse } from 'aws-sdk/clients/lambda'

describe('Test the default lambda client', async () => {
    let client: LambdaClient
    const regionCode: string = 'my-region-code'
    const lambdaFuncName = 'lambda-func-name'
    let lambdaApiMock: SinonStubbedInstance<Lambda>

    beforeEach(async () => {
        lambdaApiMock = stub(new Lambda())
        client = new DefaultLambdaClient(regionCode)
    })

    describe('Test method getFunctionUrlConfigs()', async () => {
        /**
         * Stubs the listFunctionUrlConfigs() method with the given
         * value.
         * @param functionUrlConfigs
         */
        function stubListFunctionUrlConfigs(functionUrlConfigs: FunctionUrlConfigList): void {
            const functionUrlConfigsList: ListFunctionUrlConfigsResponse = {
                FunctionUrlConfigs: functionUrlConfigs,
            }
            const requestStub = createStubInstance(Request)
            requestStub.promise.resolves(functionUrlConfigsList)
            lambdaApiMock.listFunctionUrlConfigs.returns(requestStub as any)
        }

        const testCases: FunctionUrlConfigList[] = [
            [],
            [buildFunctionUrlConfig({ FunctionUrl: 'url1' })],
            [buildFunctionUrlConfig({ FunctionUrl: 'url1' }), buildFunctionUrlConfig({ FunctionUrl: 'url2' })],
        ]

        testCases.forEach(functionUrlConfigs => {
            it('gets the expected url config list', async () => {
                stubListFunctionUrlConfigs(functionUrlConfigs)

                // Call to test
                const result = await client.getFunctionUrlConfigs(lambdaFuncName, <Lambda>(<unknown>lambdaApiMock))

                assert.deepStrictEqual(lambdaApiMock.listFunctionUrlConfigs.args, [[{ FunctionName: lambdaFuncName }]])
                assert.deepStrictEqual(result, functionUrlConfigs)
            })
        })
    })
})

/**
 * Builds an instance of {@link FunctionUrlConfig} without the
 * need to define all values.
 *
 * @param options key + value of {@link FunctionUrlConfig}
 */
export function buildFunctionUrlConfig(options: Partial<FunctionUrlConfig>): FunctionUrlConfig {
    return {
        AuthType: options.AuthType ?? '',
        CreationTime: options.CreationTime ?? '',
        FunctionArn: options.FunctionArn ?? '',
        FunctionUrl: options.FunctionUrl ?? '',
        LastModifiedTime: options.LastModifiedTime ?? '',
    }
}
