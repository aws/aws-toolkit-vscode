/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { Ec2LogDocumentProvider } from '../../../awsService/ec2/ec2LogDocumentProvider'
import { ec2LogsScheme } from '../../../shared/constants'
import { Ec2Client } from '../../../shared/clients/ec2Client'

describe('LogDataDocumentProvider', async function () {
    let provider: Ec2LogDocumentProvider

    before(function () {
        provider = new Ec2LogDocumentProvider()
    })

    it('throws error on attempt to get content from other schemes', async function () {
        const wrongSchemeUri = vscode.Uri.parse(`ec2-not:us-west1:id`)

        await assert.rejects(async () => await provider.provideTextDocumentContent(wrongSchemeUri), {
            message: `Invalid EC2 Logs URI: ${wrongSchemeUri.toString()}`,
        })
    })

    it('fetches content for valid ec2 log URI', async function () {
        const validUri = vscode.Uri.parse(`${ec2LogsScheme}:us-west1:instance1`)
        const expectedContent = 'log content'
        sinon.stub(Ec2Client.prototype, 'getConsoleOutput').resolves({
            InstanceId: 'instance1',
            Output: expectedContent,
        })
        const content = await provider.provideTextDocumentContent(validUri)
        assert.strictEqual(content, expectedContent)
        sinon.restore()
    })
})
