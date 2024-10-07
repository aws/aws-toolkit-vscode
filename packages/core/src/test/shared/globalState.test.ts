/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { GlobalState } from '../../shared/globalState'
import { FakeMemento } from '../fakeExtensionContext'
import * as redshift from '../../awsService/redshift/models/models'

describe('GlobalState', function () {
    let globalState: GlobalState
    const testKey = 'aws.downloadPath'

    beforeEach(async function () {
        const memento = new FakeMemento()
        globalState = new GlobalState(memento)
    })

    afterEach(async function () {})

    const scenarios = [
        { testValue: 1234, desc: 'number' },
        { testValue: 0, desc: 'default number' },
        { testValue: 'hello world', desc: 'string' },
        { testValue: '', desc: 'default string' },
        { testValue: true, desc: 'true' },
        { testValue: false, desc: 'false' },
        { testValue: [], desc: 'empty array' },
        { testValue: [{ value: 'foo' }, { value: 'bar' }], desc: 'array' },
        { testValue: {}, desc: 'empty object' },
        { testValue: { value: 'foo' }, desc: 'object' },
    ]

    describe('get()', function () {
        scenarios.forEach((scenario) => {
            it(scenario.desc, async () => {
                await globalState.update(testKey, scenario.testValue)

                const actualValue = globalState.get(testKey)
                assert.deepStrictEqual(actualValue, scenario.testValue)
            })
        })
    })

    describe('update()', function () {
        scenarios.forEach((scenario) => {
            it(scenario.desc, async () => {
                await globalState.update(testKey, scenario.testValue)
                const savedValue = globalState.get(testKey)
                assert.deepStrictEqual(savedValue, scenario.testValue)
            })
        })
    })

    it('getStrict()', async () => {
        //
        // Missing item:
        //
        const testKey = 'aws.downloadPath'
        assert.strictEqual(globalState.get(testKey), undefined)
        assert.strictEqual(globalState.getStrict(testKey, Boolean), undefined)
        assert.strictEqual(globalState.getStrict(testKey, Boolean, true), true)

        //
        // Item exists but has wrong type:
        //
        await globalState.update(testKey, 123)
        assert.throws(() => globalState.getStrict(testKey, String))
        assert.throws(() => globalState.getStrict(testKey, Object))
        assert.throws(() => globalState.getStrict(testKey, Boolean))
        // Wrong type, but defaultValue was given:
        assert.throws(() => globalState.getStrict(testKey, String, ''))
        assert.throws(() => globalState.getStrict(testKey, Object, {}))
        assert.throws(() => globalState.getStrict(testKey, Boolean, true))
    })

    it('tryGet()', async () => {
        //
        // Missing item:
        //
        const testKey = 'aws.downloadPath'
        assert.strictEqual(globalState.get(testKey), undefined)
        assert.strictEqual(globalState.tryGet(testKey, Boolean), undefined)
        assert.strictEqual(globalState.tryGet(testKey, Boolean, true), true)

        //
        // Item exists but has wrong type:
        //
        await globalState.update(testKey, 123)
        assert.strictEqual(globalState.tryGet(testKey, String), undefined)
        assert.strictEqual(globalState.tryGet(testKey, Object), undefined)
        assert.strictEqual(globalState.tryGet(testKey, Boolean), undefined)
        // Wrong type, but defaultValue was given:
        assert.deepStrictEqual(globalState.tryGet(testKey, String, ''), '')
        assert.deepStrictEqual(globalState.tryGet(testKey, Object, {}), {})
        assert.deepStrictEqual(globalState.tryGet(testKey, Boolean, true), true)
    })

    it('clear()', async () => {
        const keys = ['CODECATALYST_RECONNECT', 'SAM_INIT_ARCH_KEY', 'aws.redshift.connections']
        await globalState.update(keys[0] as any, 'val1')
        await globalState.update(keys[1] as any, 'val2')
        await globalState.update(keys[2] as any, 'val3')
        assert.deepStrictEqual(globalState.keys(), keys)
        assert.deepStrictEqual(globalState.values(), ['val1', 'val2', 'val3'])

        await globalState.clear()

        assert.deepStrictEqual(globalState.keys(), [])
        assert.deepStrictEqual(globalState.values(), [])
    })

    describe('redshift state', function () {
        const testArn1 = 'arn:foo/bar/baz/1'
        const testArn2 = 'arn:foo/bar/baz/2'

        const fakeCxn1: redshift.ConnectionParams = {
            connectionType: redshift.ConnectionType.SecretsManager,
            database: 'fake-db',
            warehouseIdentifier: 'warhouse-id-1',
            warehouseType: redshift.RedshiftWarehouseType.SERVERLESS,
            region: {
                id: 'us-east-2',
                name: 'region name',
            },
            password: 'password-1',
            secret: 'secret 1',
        }
        const fakeCxn2: redshift.ConnectionParams = {
            ...fakeCxn1,
            password: 'pw 2',
            secret: 'secret 2',
            warehouseIdentifier: 'wh-id-2',
            database: 'fake db 2',
        }

        it('get/set connection state and special DELETE_CONNECTION value', async () => {
            await globalState.saveRedshiftConnection(testArn1, 'DELETE_CONNECTION')
            await globalState.saveRedshiftConnection(testArn2, undefined)
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn1), 'DELETE_CONNECTION')
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn2), undefined)
            await globalState.saveRedshiftConnection(testArn1, fakeCxn1)
            await globalState.saveRedshiftConnection(testArn2, fakeCxn2)
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn1), fakeCxn1)
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn2), fakeCxn2)
        })

        it('validation', async () => {
            await globalState.saveRedshiftConnection(testArn1, 'foo' as any)
            await globalState.saveRedshiftConnection(testArn2, 99 as any)

            // Assert that bad state was set.
            assert.deepStrictEqual(globalState.get('aws.redshift.connections'), {
                [testArn1]: 'foo',
                [testArn2]: 99,
            })

            // Bad state is logged and returns undefined.
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn1), undefined)
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn2), undefined)

            await globalState.saveRedshiftConnection(testArn2, fakeCxn2)
            assert.deepStrictEqual(globalState.getRedshiftConnection(testArn2), fakeCxn2)
            // Stored state is now "partially bad".
            assert.deepStrictEqual(globalState.get('aws.redshift.connections'), {
                [testArn1]: 'foo',
                [testArn2]: fakeCxn2,
            })
        })
    })

    describe('SSO sessions', function () {
        const session1 = 'session-1'
        const session2 = 'session-2'
        const time1 = new Date(Date.now() - 42 * 1000) // in the past.
        const time2 = new Date()

        it('get/set', async () => {
            await globalState.setSsoSessionCreationDate(session1, time1)
            await globalState.setSsoSessionCreationDate(session2, time2)
            assert.deepStrictEqual(globalState.getSsoSessionCreationDate(session1), time1.getTime())
            assert.deepStrictEqual(globalState.getSsoSessionCreationDate(session2), time2.getTime())
        })

        it('validation', async () => {
            // Set bad state.
            await globalState.update('#sessionCreationDates', {
                [session1]: 'foo',
                [session2]: {},
            })

            // Bad state is logged and returns undefined.
            assert.deepStrictEqual(globalState.getSsoSessionCreationDate(session1), undefined)
            assert.deepStrictEqual(globalState.getSsoSessionCreationDate(session2), undefined)

            await globalState.setSsoSessionCreationDate(session2, time2)
            assert.deepStrictEqual(globalState.getSsoSessionCreationDate(session2), time2.getTime())
            // Stored state is now "partially bad".
            assert.deepStrictEqual(globalState.get('#sessionCreationDates'), {
                [session1]: 'foo',
                [session2]: time2.getTime(),
            })
        })
    })
})
