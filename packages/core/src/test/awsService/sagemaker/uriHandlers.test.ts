/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { UriHandler } from '../../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID } from '../../../shared/extensions'
import { register } from '../../../awsService/sagemaker/uriHandlers'

function createConnectUri(params: { [key: string]: string }): vscode.Uri {
    const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/connect/sagemaker?${query}`)
}

describe('SageMaker URI handler', function () {
    let handler: UriHandler
    let deeplinkConnectStub: sinon.SinonStub

    beforeEach(function () {
        handler = new UriHandler()
        deeplinkConnectStub = sinon.stub().resolves()
        sinon.replace(require('../../../awsService/sagemaker/commands'), 'deeplinkConnect', deeplinkConnectStub)

        register({
            uriHandler: handler,
        } as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('calls deeplinkConnect with all expected params', async function () {
        const params = {
            connection_identifier: 'abc123',
            domain: 'my-domain',
            user_profile: 'me',
            session: 'sess-xyz',
            ws_url: 'wss://example.com',
            'cell-number': '4',
            token: 'my-token',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[1], 'abc123')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[2], 'sess-xyz')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[3], 'wss://example.com&cell-number=4')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[4], 'my-token')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[5], 'my-domain')
    })
})
