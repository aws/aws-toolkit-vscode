/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import {
    compareSamLambdaRuntime,
    getDependencyManager,
    getFamily,
    samZipLambdaRuntimes,
    RuntimeFamily,
    samImageLambdaRuntimes,
    samLambdaCreatableRuntimes,
} from '../../../lambda/models/samLambdaRuntime'

describe('compareSamLambdaRuntime', async function () {
    const scenarios: {
        lowerRuntime: Runtime
        higherRuntime: Runtime
    }[] = [
        { lowerRuntime: 'nodejs12.x', higherRuntime: 'nodejs14.x' },
        { lowerRuntime: 'nodejs14.x', higherRuntime: 'nodejs14.x (Image)' },
        { lowerRuntime: 'nodejs12.x (Image)', higherRuntime: 'nodejs14.x' },
    ]

    scenarios.forEach(scenario => {
        it(`${scenario.lowerRuntime} < ${scenario.higherRuntime}`, () => {
            assert.ok(compareSamLambdaRuntime(scenario.lowerRuntime, scenario.higherRuntime) < 0)
        })

        it(`${scenario.higherRuntime} > ${scenario.lowerRuntime}`, () => {
            assert.ok(compareSamLambdaRuntime(scenario.higherRuntime, scenario.lowerRuntime) > 0)
        })
    })
})

describe('getDependencyManager', function () {
    it('all runtimes are handled', function () {
        samZipLambdaRuntimes.forEach(runtime => {
            assert.ok(getDependencyManager(runtime))
        })
    })
    it('throws on deprecated runtimes', function () {
        assert.throws(() => getDependencyManager('nodejs'))
    })
    it('throws on unknown runtimes', function () {
        assert.throws(() => getDependencyManager('BASIC'))
    })
})

describe('getFamily', function () {
    it('unknown runtime name', function () {
        assert.strictEqual(getFamily('foo'), RuntimeFamily.Unknown)
    })
    it('handles all known runtimes', function () {
        samZipLambdaRuntimes.forEach(runtime => {
            assert.notStrictEqual(getFamily(runtime), RuntimeFamily.Unknown)
        })
    })
    it('throws on deprecated runtimes', function () {
        assert.throws(() => getFamily('nodejs'))
    })
})

describe('runtimes', function () {
    it('cloud9', function () {
        assert.deepStrictEqual(samLambdaCreatableRuntimes(true).toArray().sort(), [
            'nodejs12.x',
            'nodejs14.x',
            'python3.7',
            'python3.8',
            'python3.9',
        ])
        assert.deepStrictEqual(samImageLambdaRuntimes(true).toArray().sort(), [
            'nodejs12.x',
            'nodejs14.x',
            'python3.7',
            'python3.8',
            'python3.9',
        ])
    })
    it('vscode', function () {
        assert.deepStrictEqual(samLambdaCreatableRuntimes(false).toArray().sort(), [
            'dotnetcore2.1',
            'dotnetcore3.1',
            'go1.x',
            'java11',
            'java8',
            'java8.al2',
            'nodejs12.x',
            'nodejs14.x',
            'python3.6',
            'python3.7',
            'python3.8',
            'python3.9',
        ])
        assert.deepStrictEqual(samImageLambdaRuntimes(false).toArray().sort(), [
            'dotnet5.0',
            'dotnetcore2.1',
            'dotnetcore3.1',
            'go1.x',
            'java11',
            'java8',
            'java8.al2',
            'nodejs12.x',
            'nodejs14.x',
            'python3.6',
            'python3.7',
            'python3.8',
            'python3.9',
        ])
    })
})
