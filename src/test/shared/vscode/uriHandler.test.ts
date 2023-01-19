/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { SearchParams, UriHandler } from '../../../shared/vscode/uriHandler'

describe('UriHandler', function () {
    const testPath = '/my/path'
    let uriHandler: UriHandler

    function makeUri(query?: string): vscode.Uri {
        return vscode.Uri.parse(`scheme://authority${testPath}${query !== undefined ? `?${query}` : ''}`)
    }

    beforeEach(function () {
        uriHandler = new UriHandler()
    })

    it('can register a handler', async function () {
        uriHandler.registerHandler(testPath, q => assert.strictEqual(q.get('key'), 'value'))
        return uriHandler.handleUri(makeUri('key=value'))
    })

    it('uses parser if available', async function () {
        uriHandler.registerHandler(
            testPath,
            q => assert.strictEqual(q.myNumber, 123),
            (q: SearchParams) => ({ myNumber: Number(q.get('myString')) })
        )
        return uriHandler.handleUri(makeUri('myString=123'))
    })

    it('can handle lists', async function () {
        uriHandler.registerHandler(testPath, q => assert.deepStrictEqual(q.get('list'), ['1', '2', '3']))
        return uriHandler.handleUri(makeUri('list=1&list=2&list=3'))
    })

    it('can dispose handlers', async function () {
        return new Promise((resolve, reject) => {
            uriHandler.registerHandler(testPath, () => reject(new Error('this should not be called'))).dispose()
            uriHandler.handleUri(makeUri()).then(resolve)
        })
    })

    it('throws when registering handler for same path', function () {
        uriHandler.registerHandler(testPath, () => {})
        assert.throws(() => uriHandler.registerHandler(testPath, () => {}))
    })

    it('catches errors thrown by the parser', function (done) {
        const handler = () => done(new Error('this should not be called'))
        const parser = () => {
            throw new Error()
        }

        uriHandler.registerHandler(testPath, handler, parser)
        assert.doesNotReject(uriHandler.handleUri(makeUri('key=value'))).then(done, done)
    })

    it('catches errors thrown by the handler', async function () {
        const handler = () => {
            throw new Error()
        }

        uriHandler.registerHandler(testPath, handler)
        return assert.doesNotReject(uriHandler.handleUri(makeUri()))
    })
})

describe('SearchParams', function () {
    const params = new SearchParams({ foo: 'bar', baz: 'qaz', number: '1' })

    it('can map params', function () {
        assert.strictEqual(params.getAs('number', Number), 1)
    })

    it('can convert keys to an object', function () {
        assert.deepStrictEqual(params.getFromKeys('foo', 'baz', 'xyz'), { foo: 'bar', baz: 'qaz', xyz: undefined })
    })

    it('can throw if the parameter does not exist', function () {
        assert.throws(() => params.getOrThrow('foob', ''))
        assert.throws(() => params.getOrThrow('foob', new Error()))
    })
})
