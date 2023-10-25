/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { EmrServerlessApplicationNode } from '../../../emr-serverless/explorer/emrServerlessApplicationNode'
import { EmrApplication, EmrServerlessClient } from '../../../shared/clients/emrServerlessClient'
import { EmrServerlessNode } from '../../../emr-serverless/explorer/emrServerlessNode'
import { stopApplication } from '../../../emr-serverless/commands/stopApplication'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { getTestWindow } from '../../shared/vscode/window'

describe('stopApplicationCommand', function () {
    const appId = 'app01'
    const parentNode: EmrServerlessNode = {} as EmrServerlessNode
    let sandbox: sinon.SinonSandbox
    let emrServerlessClient: EmrServerlessClient
    let node: EmrServerlessApplicationNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        emrServerlessClient = new EmrServerlessClient('')
        node = new EmrServerlessApplicationNode(parentNode, emrServerlessClient, {
            id: appId,
            state: 'STOPPED',
        } as EmrApplication)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('stops the application, shows progress bar, and refreshes parent node', async function () {
        const commands = new FakeCommands()
        const stub = sandbox.stub(emrServerlessClient, 'stopApplication').callsFake(async id => {
            assert.strictEqual(id, appId)
        })

        await stopApplication(node, commands)

        getTestWindow().getFirstMessage().assertProgress(`Stopping ${appId}...`)

        assert.strictEqual(stub.calledOnce, true)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
