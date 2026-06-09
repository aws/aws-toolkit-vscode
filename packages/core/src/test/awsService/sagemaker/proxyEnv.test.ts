/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { getLocalProxyEnv } from '../../../awsService/sagemaker/model'

describe('getLocalProxyEnv', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function stubConfig(values: Record<string, any>) {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: (key: string, defaultValue?: any) => (key in values ? values[key] : defaultValue),
        } as any)
    }

    it('returns empty object when no proxy is configured', function () {
        stubConfig({})
        const env = getLocalProxyEnv()
        assert.deepStrictEqual(env, {})
    })

    it('sets HTTP_PROXY and HTTPS_PROXY from http.proxy', function () {
        stubConfig({ proxy: 'http://myproxy:8080' })
        const env = getLocalProxyEnv()
        assert.strictEqual(env.HTTP_PROXY, 'http://myproxy:8080')
        assert.strictEqual(env.HTTPS_PROXY, 'http://myproxy:8080')
    })

    it('joins noProxy array into comma-separated NO_PROXY', function () {
        stubConfig({ proxy: 'http://myproxy:8080', noProxy: ['localhost', '127.0.0.1', '.internal.com'] })
        const env = getLocalProxyEnv()
        assert.strictEqual(env.NO_PROXY, 'localhost,127.0.0.1,.internal.com')
    })

    it('does not set NO_PROXY when noProxy is empty array', function () {
        stubConfig({ proxy: 'http://myproxy:8080', noProxy: [] })
        const env = getLocalProxyEnv()
        assert.strictEqual(env.NO_PROXY, undefined)
    })

    it('sets NODE_TLS_REJECT_UNAUTHORIZED when proxyStrictSSL is false', function () {
        stubConfig({ proxy: 'http://myproxy:8080', proxyStrictSSL: false })
        const env = getLocalProxyEnv()
        assert.strictEqual(env.NODE_TLS_REJECT_UNAUTHORIZED, '0')
    })

    it('does not set NODE_TLS_REJECT_UNAUTHORIZED when proxyStrictSSL is true', function () {
        stubConfig({ proxy: 'http://myproxy:8080', proxyStrictSSL: true })
        const env = getLocalProxyEnv()
        assert.strictEqual(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined)
    })
})
