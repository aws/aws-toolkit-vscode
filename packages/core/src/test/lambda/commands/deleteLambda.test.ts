/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { deleteLambda } from '../../../lambda/commands/deleteLambda'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import { getTestWindow } from '../../shared/vscode/window'
import { stub } from '../../utilities/stubber'

describe('deleteLambda', async function () {
    function createLambdaClient() {
        const client = stub(DefaultLambdaClient, { regionCode: 'region-1' })
        client.deleteFunction.resolves()

        return client
    }

    const buildDeleteRegExp = (name: string) => new RegExp(`delete.*${name}`)

    it('throws if there is no function name', async function () {
        await assert.rejects(deleteLambda({}, createLambdaClient()))
    })

    it('should delete lambda when confirmed', async function () {
        const client = createLambdaClient()
        const confirmDialog = getTestWindow().waitForMessage(buildDeleteRegExp('my-function'))

        await Promise.all([
            confirmDialog.then(dialog => dialog.selectItem('Delete')),
            deleteLambda({ FunctionName: 'my-function' }, client),
        ])

        assert.strictEqual(client.deleteFunction.callCount, 1)

        // TODO(sijaden): remove `duration` from metric metadata (it's not metadata?)
        // assertTelemetry('lambda_delete', { result: 'Succeeded' })
    })

    it('should not delete lambda when cancelled', async function () {
        const client = createLambdaClient()
        const confirmDialog = getTestWindow().waitForMessage(buildDeleteRegExp('another-function'))

        await Promise.all([
            confirmDialog.then(dialog => dialog.close()),
            deleteLambda({ FunctionName: 'another-function' }, client),
        ])

        assert.strictEqual(client.deleteFunction.callCount, 0)
        // assertTelemetry('lambda_delete', { result: 'Cancelled' })
    })

    it('should handles errors gracefully', async function () {
        const client = createLambdaClient()
        const confirmDialog = getTestWindow().waitForMessage(buildDeleteRegExp('bad-name'))
        const viewLogs = getTestWindow().waitForMessage(/There was an error/)

        client.deleteFunction.rejects(new Error('Lambda function does not exist'))

        await Promise.all([
            viewLogs.then(dialog => dialog.close()),
            confirmDialog.then(dialog => dialog.selectItem('Delete')),
            deleteLambda({ FunctionName: 'bad-name' }, client),
        ])

        // assertTelemetry('lambda_delete', { result: 'Failed' })
    })
})
