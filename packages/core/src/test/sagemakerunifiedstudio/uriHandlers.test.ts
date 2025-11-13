/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SearchParams } from '../../shared/vscode/uriHandler'
import { parseConnectParams } from '../../sagemakerunifiedstudio/uriHandlers'

describe('SMUS URI Handler', function () {
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
})
