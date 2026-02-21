/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { UriHandler } from '../../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID_CONSTANTS } from '../../../shared/extensionIds'
import { register } from '../../../awsService/sagemaker/uriHandlers'

function createConnectUri(params: { [key: string]: string }): vscode.Uri {
    const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID_CONSTANTS.awstoolkit}/connect/sagemaker?${query}`)
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
            app_type: 'jupyterlab',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[1], 'abc123')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[2], 'sess-xyz')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[3], 'wss://example.com&cell-number=4')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[4], 'my-token')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[5], 'my-domain')
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[6], 'jupyterlab')
    })

    it('calls deeplinkConnect with undefined app_type when not provided', async function () {
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
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[6], undefined)
    })

    it('properly encodes cell-number with spaces and special characters', async function () {
        const params = {
            connection_identifier: 'abc123',
            domain: 'my-domain',
            user_profile: 'me',
            session: 'sess-xyz',
            ws_url: 'wss://example.com',
            'cell-number': 'test/data with spaces',
            token: 'my-token',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        // Verify cell-number is properly encoded
        const expectedUrl = 'wss://example.com&cell-number=test%2Fdata%20with%20spaces'
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[3], expectedUrl)
    })

    it('includes AMZ headers in WebSocket URL when provided', async function () {
        const params = {
            connection_identifier: 'abc123',
            domain: 'my-domain',
            user_profile: 'me',
            session: 'sess-xyz',
            ws_url: 'wss://example.com',
            'cell-number': 'test123',
            token: 'my-token',
            'X-Amz-Security-Token': 'fake/token+with=special',
            'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
            'X-Amz-Date': '20240101T120000Z',
            'X-Amz-SignedHeaders': 'host',
            'X-Amz-Credential': 'AKIATEST/20240101/us-west-2/ssmmessages/aws4_request',
            'X-Amz-Expires': '60',
            'X-Amz-Signature': 'fakesignature123',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        const actualUrl = deeplinkConnectStub.firstCall.args[3]

        // Verify all AMZ headers are included and properly encoded
        assert.ok(actualUrl.includes('cell-number=test123'))
        assert.ok(actualUrl.includes('X-Amz-Security-Token=fake%2Ftoken%2Bwith%3Dspecial'))
        assert.ok(actualUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'))
        assert.ok(actualUrl.includes('X-Amz-Date=20240101T120000Z'))
        assert.ok(actualUrl.includes('X-Amz-SignedHeaders=host'))
        assert.ok(actualUrl.includes('X-Amz-Credential=AKIATEST%2F20240101%2Fus-west-2%2Fssmmessages%2Faws4_request'))
        assert.ok(actualUrl.includes('X-Amz-Expires=60'))
        assert.ok(actualUrl.includes('X-Amz-Signature=fakesignature123'))
    })

    it('works without AMZ headers', async function () {
        const params = {
            connection_identifier: 'abc123',
            domain: 'my-domain',
            user_profile: 'me',
            session: 'sess-xyz',
            ws_url: 'wss://example.com',
            'cell-number': 'simple',
            token: 'my-token',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[3], 'wss://example.com&cell-number=simple')
    })
})
