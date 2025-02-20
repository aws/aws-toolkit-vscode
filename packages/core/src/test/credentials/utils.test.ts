/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { BuilderIdKind, ExtensionUse, SsoKind, hasBuilderId, hasIamCredentials, hasSso } from '../../auth/utils'
import { Connection, SsoConnection, scopesCodeCatalyst } from '../../auth/connection'
import { builderIdConnection, iamConnection, ssoConnection } from './testUtil'
import { amazonQScopes } from '../../codewhisperer/util/authUtil'
import globals from '../../shared/extensionGlobals'

describe('ExtensionUse.isFirstUse()', function () {
    let instance: ExtensionUse
    const notHasExistingConnections = () => false

    beforeEach(async function () {
        instance = new ExtensionUse()
        await makeStateValueNotExist()
    })

    it('is true only on first startup', function () {
        assert.strictEqual(instance.isFirstUse(notHasExistingConnections), true, 'Failed on first call.')
        assert.strictEqual(instance.isFirstUse(notHasExistingConnections), true, 'Failed on second call.')

        const nextStartup = nextExtensionStartup()
        assert.strictEqual(nextStartup.isFirstUse(notHasExistingConnections), false, 'Failed on new startup.')
    })

    it('true when: (state value not exists + NOT has existing connections)', async function () {
        await makeStateValueNotExist()
        assert.strictEqual(
            instance.isFirstUse(notHasExistingConnections),
            true,
            'No existing connections, should be first use'
        )
        assert.strictEqual(nextExtensionStartup().isFirstUse(), false)
    })

    it('false when: (state value not exists + has existing connections)', async function () {
        await makeStateValueNotExist()
        const hasExistingConnections = () => true
        assert.strictEqual(
            instance.isFirstUse(hasExistingConnections),
            false,
            'Found existing connections, should not be first use'
        )
        assert.strictEqual(nextExtensionStartup().isFirstUse(), false)
    })

    /**
     * This makes the backend state value: undefined, mimicking a brand new user.
     * We use this state value to track if user is a first time user.
     */
    async function makeStateValueNotExist() {
        await globals.globalState.update(ExtensionUse.instance.isExtensionFirstUseKey, undefined)
    }

    /**
     * Mimics when the extension startsup a subsequent time (i.e user closes vscode and opens again).
     */
    function nextExtensionStartup() {
        return new ExtensionUse()
    }
})

type SsoTestCase = { kind: SsoKind; connections: Connection[]; expected: boolean }
type BuilderIdTestCase = { kind: BuilderIdKind; connections: Connection[]; expected: boolean }

describe('connection exists funcs', function () {
    const cwIdcConnection: SsoConnection = { ...ssoConnection, scopes: amazonQScopes, label: 'codeWhispererSso' }
    const cwBuilderIdConnection: SsoConnection = {
        ...builderIdConnection,
        scopes: amazonQScopes,
        label: 'codeWhispererBuilderId',
    }
    const ccBuilderIdConnection: SsoConnection = {
        ...builderIdConnection,
        scopes: scopesCodeCatalyst,
        label: 'codeCatalystBuilderId',
    }
    const ssoConnections: Connection[] = [
        ssoConnection,
        builderIdConnection,
        cwIdcConnection,
        cwBuilderIdConnection,
        ccBuilderIdConnection,
    ]
    const allConnections = [iamConnection, ...ssoConnections]

    describe('ssoExists()', function () {
        const anyCases: SsoTestCase[] = [
            { connections: [ssoConnection], expected: true },
            { connections: allConnections, expected: true },
            { connections: [], expected: false },
            { connections: [iamConnection], expected: false },
        ].map((c) => {
            return { ...c, kind: 'any' }
        })
        const cwIdcCases: SsoTestCase[] = [
            { connections: [cwIdcConnection], expected: true },
            { connections: allConnections, expected: true },
            { connections: [], expected: false },
            { connections: allConnections.filter((c) => c !== cwIdcConnection), expected: false },
        ].map((c) => {
            return { ...c, kind: 'codewhisperer' }
        })
        const allCases = [...anyCases, ...cwIdcCases]

        for (const args of allCases) {
            it(`ssoExists() returns '${args.expected}' when kind '${args.kind}' given [${args.connections
                .map((c) => c.label)
                .join(', ')}]`, async function () {
                assert.strictEqual(await hasSso(args.kind, async () => args.connections), args.expected)
            })
        }
    })

    describe('builderIdExists()', function () {
        const cwBuilderIdCases: BuilderIdTestCase[] = [
            { connections: [cwBuilderIdConnection], expected: true },
            { connections: allConnections, expected: true },
            { connections: [], expected: false },
            { connections: allConnections.filter((c) => c !== cwBuilderIdConnection), expected: false },
        ].map((c) => {
            return { ...c, kind: 'codewhisperer' }
        })

        const ccBuilderIdCases: BuilderIdTestCase[] = [
            { connections: [ccBuilderIdConnection], expected: true },
            { connections: allConnections, expected: true },
            { connections: [], expected: false },
            { connections: allConnections.filter((c) => c !== ccBuilderIdConnection), expected: false },
        ].map((c) => {
            return { ...c, kind: 'codecatalyst' }
        })

        const allCases = [...cwBuilderIdCases, ...ccBuilderIdCases]

        for (const args of allCases) {
            it(`builderIdExists() returns '${args.expected}' when kind '${args.kind}' given [${args.connections
                .map((c) => c.label)
                .join(', ')}]`, async function () {
                assert.strictEqual(await hasBuilderId(args.kind, async () => args.connections), args.expected)
            })
        }
    })

    describe('credentialExists()', function () {
        const cases: [Connection[], boolean][] = [
            [[iamConnection], true],
            [allConnections, true],
            [[], false],
            [allConnections.filter((c) => c !== iamConnection), false],
        ]

        for (const args of cases) {
            it(`credentialExists() returns '${args[1]}' given [${args[0]
                .map((c) => c.label)
                .join(', ')}]`, async function () {
                const connections = args[0]
                const expected = args[1]

                assert.strictEqual(await hasIamCredentials(async () => connections), expected)
            })
        }
    })
})
