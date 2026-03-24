/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { SearchParams, UriHandler } from '../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID_CONSTANTS } from '../../shared/extensionIds'
import { parseConnectParams, register } from '../../sagemakerunifiedstudio/uriHandlers'

function createConnectUri(params: { [key: string]: string }): vscode.Uri {
    const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID_CONSTANTS.awstoolkit}/connect/smus?${query}`)
}

describe('SMUS URI Handler', function () {
    let handler: UriHandler
    let deeplinkConnectStub: sinon.SinonStub

    beforeEach(function () {
        handler = new UriHandler()
        deeplinkConnectStub = sinon.stub().resolves()
        sinon.replace(require('../../awsService/sagemaker/commands'), 'deeplinkConnect', deeplinkConnectStub)

        register({
            uriHandler: handler,
        } as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('parseConnectParams', function () {
        const validParams = {
            connection_identifier: 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space',
            domain: 'd-abc123',
            user_profile: 'test-user',
            session: 'sess-abc123',
            ws_url: 'wss://ssm.us-west-2.amazonaws.com/stream',
            'cell-number': '1',
            token: 'bearer-token-xyz',
        }

        it('successfully parses all required parameters', function () {
            const query = new SearchParams(validParams)
            const result = parseConnectParams(query)

            assert.strictEqual(result.connection_identifier, validParams.connection_identifier)
            assert.strictEqual(result.domain, validParams.domain)
            assert.strictEqual(result.user_profile, validParams.user_profile)
            assert.strictEqual(result.session, validParams.session)
            assert.strictEqual(result.ws_url, validParams.ws_url)
            assert.strictEqual(result['cell-number'], validParams['cell-number'])
            assert.strictEqual(result.token, validParams.token)
        })

        it('throws error when required parameters are missing', function () {
            const requiredParams = [
                'connection_identifier',
                'domain',
                'user_profile',
                'session',
                'ws_url',
                'cell-number',
                'token',
            ] as const

            for (const param of requiredParams) {
                const { [param]: _removed, ...paramsWithoutOne } = validParams
                const query = new SearchParams(paramsWithoutOne)

                assert.throws(
                    () => parseConnectParams(query),
                    new RegExp(`${param}.*must be provided`),
                    `Should throw error for missing ${param}`
                )
            }
        })

        it('handles optional parameters correctly', function () {
            // Test with all optional parameters present
            const paramsWithAllOptional = {
                ...validParams,
                app_type: 'CodeEditor',
                smus_domain_id: 'smus-domain-789',
                smus_domain_account_id: '111222333444',
                smus_project_id: 'project-999',
                smus_domain_region: 'eu-west-1',
            }
            const queryWithOptional = new SearchParams(paramsWithAllOptional)
            const resultWithOptional = parseConnectParams(queryWithOptional)

            assert.strictEqual(resultWithOptional.app_type, 'CodeEditor')
            assert.strictEqual(resultWithOptional.smus_domain_id, 'smus-domain-789')
            assert.strictEqual(resultWithOptional.smus_domain_account_id, '111222333444')
            assert.strictEqual(resultWithOptional.smus_project_id, 'project-999')
            assert.strictEqual(resultWithOptional.smus_domain_region, 'eu-west-1')

            // Test without optional parameters - should return undefined
            const queryWithoutOptional = new SearchParams(validParams)
            const resultWithoutOptional = parseConnectParams(queryWithoutOptional)

            assert.strictEqual(resultWithoutOptional.app_type, undefined)
            assert.strictEqual(resultWithoutOptional.smus_domain_id, undefined)
            assert.strictEqual(resultWithoutOptional.smus_domain_account_id, undefined)
            assert.strictEqual(resultWithoutOptional.smus_project_id, undefined)
            assert.strictEqual(resultWithoutOptional.smus_domain_region, undefined)
        })
    })

    it('properly encodes cell-number with spaces and special characters', async function () {
        const params = {
            connection_identifier: 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space',
            domain: 'd-abc123',
            user_profile: 'test-user',
            session: 'sess-abc123',
            ws_url: 'wss://ssm.us-west-2.amazonaws.com/stream',
            'cell-number': 'test/data with spaces',
            token: 'bearer-token-xyz',
        }

        const uri = createConnectUri(params)
        await handler.handleUri(uri)

        assert.ok(deeplinkConnectStub.calledOnce)
        const expectedUrl = 'wss://ssm.us-west-2.amazonaws.com/stream&cell-number=test%2Fdata%20with%20spaces'
        assert.deepStrictEqual(deeplinkConnectStub.firstCall.args[3], expectedUrl)
    })

    it('includes AMZ headers in WebSocket URL when provided', async function () {
        const params = {
            connection_identifier: 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space',
            domain: 'd-abc123',
            user_profile: 'test-user',
            session: 'sess-abc123',
            ws_url: 'wss://ssm.us-west-2.amazonaws.com/stream',
            'cell-number': 'test123',
            token: 'bearer-token-xyz',
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

        assert.ok(actualUrl.includes('cell-number=test123'))
        assert.ok(actualUrl.includes('X-Amz-Security-Token=fake%2Ftoken%2Bwith%3Dspecial'))
        assert.ok(actualUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'))
        assert.ok(actualUrl.includes('X-Amz-Date=20240101T120000Z'))
        assert.ok(actualUrl.includes('X-Amz-SignedHeaders=host'))
        assert.ok(actualUrl.includes('X-Amz-Credential=AKIATEST%2F20240101%2Fus-west-2%2Fssmmessages%2Faws4_request'))
        assert.ok(actualUrl.includes('X-Amz-Expires=60'))
        assert.ok(actualUrl.includes('X-Amz-Signature=fakesignature123'))
    })
})
