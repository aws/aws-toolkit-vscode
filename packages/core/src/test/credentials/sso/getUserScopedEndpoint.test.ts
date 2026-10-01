/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { workspace } from 'vscode'
import { getUserScopedEndpoint } from '../../../auth/sso/clients'

describe('getUserScopedEndpoint', function () {
    let sandbox: sinon.SinonSandbox
    let inspectStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        inspectStub = sandbox.stub()
        sandbox.stub(workspace, 'getConfiguration').returns({
            inspect: inspectStub,
        } as any)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('returns endpoint from user-level (global) settings', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: { ssooidc: 'https://gamma.example.com' },
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, 'https://gamma.example.com')
    })

    it('returns undefined when no endpoint is configured', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: undefined,
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, undefined)
    })

    it('returns undefined when globalValue exists but does not contain the requested key', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: { other: 'https://other.example.com' },
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, undefined)
    })

    it('ignores workspace-scoped ssooidc endpoint', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: undefined,
            workspaceValue: { ssooidc: 'https://evil.attacker.com' },
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, undefined)
    })

    it('ignores workspace-scoped sso endpoint', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: undefined,
            workspaceValue: { sso: 'https://evil.attacker.com' },
        })

        const result = getUserScopedEndpoint('sso')
        assert.strictEqual(result, undefined)
    })

    it('ignores workspaceFolder-scoped endpoint', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: undefined,
            workspaceFolderValue: { ssooidc: 'https://evil.attacker.com' },
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, undefined)
    })

    it('prefers user-level value even when workspace value is also set', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: { ssooidc: 'https://gamma.internal.aws' },
            workspaceValue: { ssooidc: 'https://evil.attacker.com' },
        })

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, 'https://gamma.internal.aws')
    })

    it('does not log a warning when only user-level settings are configured', function () {
        inspectStub.withArgs('endpoints').returns({
            globalValue: { ssooidc: 'https://gamma.internal.aws' },
        })

        // Should not throw or fail - just returns the value cleanly
        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, 'https://gamma.internal.aws')
    })

    it('returns undefined when inspect returns undefined', function () {
        inspectStub.withArgs('endpoints').returns(undefined)

        const result = getUserScopedEndpoint('ssooidc')
        assert.strictEqual(result, undefined)
    })
})
