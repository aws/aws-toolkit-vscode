/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createStubInstance, SinonStubbedInstance, stub, SinonStub, spy, SinonSpy } from 'sinon'
import { copyLambdaUrl, createLambdaFuncUrlPrompter, noLambdaFuncMessage } from '../../../lambda/commands/copyLambdaUrl'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import globals from '../../../shared/extensionGlobals'
import { addCodiconToString } from '../../../shared/utilities/textUtilities'
import { env } from 'vscode'
import { FunctionUrlConfig } from 'aws-sdk/clients/lambda'
import { createQuickPickTester } from '../../shared/ui/testUtils'

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

describe('copy lambda function URL to clipboard', async () => {
    let client: SinonStubbedInstance<LambdaClient>
    let node: Pick<LambdaFunctionNode, 'name' | 'regionCode'>
    let quickPickUrlFunc: SinonStub

    const nodeName = 'my-node-name'

    beforeEach(async () => {
        client = createStubInstance(DefaultLambdaClient)
        quickPickUrlFunc = stub()

        node = { name: nodeName, regionCode: 'myRegion' }
    })

    it('Single URL exists', async () => {
        const urlConfig = buildFunctionUrlConfig({ FunctionUrl: 'url1', FunctionArn: 'arn1' })
        client.getFunctionUrlConfigs.resolves([urlConfig])

        await copyLambdaUrl(node, client)

        assert.strictEqual(await env.clipboard.readText(), urlConfig.FunctionUrl)
    })

    it('Multiple URLs exists', async () => {
        const expectedConfig = buildFunctionUrlConfig({ FunctionUrl: 'url1', FunctionArn: 'arn1' })
        const urlConfigs = [expectedConfig, buildFunctionUrlConfig({ FunctionUrl: 'url2', FunctionArn: 'arn2' })]
        client.getFunctionUrlConfigs.resolves(urlConfigs)
        quickPickUrlFunc.resolves(expectedConfig.FunctionUrl)

        await copyLambdaUrl(node, client, quickPickUrlFunc)

        assert.deepStrictEqual(quickPickUrlFunc.args, [[urlConfigs]])
        assert.strictEqual(await env.clipboard.readText(), expectedConfig.FunctionUrl)
    })

    describe("URL doesn't exist", async () => {
        let spiedInformationMessage: SinonSpy
        let spiedStatusBarMessage: SinonSpy

        before(async () => {
            await env.clipboard.writeText('') // clear clipboard
            spiedInformationMessage = spy(globals.window, 'showWarningMessage')
            spiedStatusBarMessage = spy(globals.window, 'setStatusBarMessage')
        })

        afterEach(async () => {
            spiedInformationMessage.resetHistory()
            spiedStatusBarMessage.resetHistory()
        })

        it(`URL doesn't exist`, async () => {
            client.getFunctionUrlConfigs.resolves([])

            await copyLambdaUrl(node, client)

            assert.strictEqual(await env.clipboard.readText(), '')
            assert.deepStrictEqual(spiedInformationMessage.args, [[noLambdaFuncMessage]])
            assert.deepStrictEqual(spiedStatusBarMessage.args, [
                [addCodiconToString('circle-slash', 'No URL for Lambda function.'), 5000],
            ])
        })
    })
})

describe('lambda func url prompter', async () => {
    it('prompts for lambda function ARN', async () => {
        const configList: FunctionUrlConfig[] = [
            <FunctionUrlConfig>{ FunctionUrl: 'url1', FunctionArn: 'arn1' },
            <FunctionUrlConfig>{ FunctionUrl: 'url2', FunctionArn: 'arn2' },
        ]
        const prompter = createLambdaFuncUrlPrompter(configList)
        const tester = createQuickPickTester(prompter)
        tester.assertItems(
            configList.map(c => {
                return { label: c.FunctionArn, data: c.FunctionUrl } // order matters
            })
        )
        tester.acceptItem(configList[1].FunctionArn)
        await tester.result(configList[1].FunctionUrl)
    })
})
