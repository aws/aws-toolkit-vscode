/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createStubInstance, SinonStubbedInstance, stub, SinonStub, spy, SinonSpy } from 'sinon'
import { copyLambdaUrl } from '../../../lambda/commands/copyLambdaUrl'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import globals from '../../../shared/extensionGlobals'
import { addCodiconToString } from '../../../shared/utilities/textUtilities'
import { buildFunctionUrlConfig } from '../../shared/clients/defaultLambdaClient.test'
import { env } from 'vscode'
import { createUrlForLambdaFunctionUrl } from '../../../shared/constants'

describe('copy lambda function URL to clipboard', async () => {
    let client: SinonStubbedInstance<LambdaClient>
    let node: SinonStubbedInstance<LambdaFunctionNode>
    let quickPickUrlFunc: SinonStub

    const nodeName = 'my-node-name'

    beforeEach(async () => {
        client = createStubInstance(DefaultLambdaClient)
        quickPickUrlFunc = stub()

        node = createStubInstance(LambdaFunctionNode)
        stub(node, 'name').get(() => nodeName)
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
            assert.deepStrictEqual(spiedInformationMessage.args, [
                [`No URL for Lambda function. [How to create URL.](${createUrlForLambdaFunctionUrl})`],
            ])
            assert.deepStrictEqual(spiedStatusBarMessage.args, [
                [addCodiconToString('circle-slash', 'No URL for Lambda function.'), 5000],
            ])
        })
    })
})
