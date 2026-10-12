/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
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
        uriHandler.onPath(testPath, (q) => assert.strictEqual(q.get('key'), 'value'))
        return uriHandler.handleUri(makeUri('key=value'))
    })

    it('uses parser if available', async function () {
        uriHandler.onPath(
            testPath,
            (q) => assert.strictEqual(q.myNumber, 123),
            (q: SearchParams) => ({ myNumber: Number(q.get('myString')) })
        )
        return uriHandler.handleUri(makeUri('myString=123'))
    })

    it('can handle lists', async function () {
        uriHandler.onPath(testPath, (q) => assert.deepStrictEqual(q.get('list'), ['1', '2', '3']))
        return uriHandler.handleUri(makeUri('list=1&list=2&list=3'))
    })

    it('can dispose handlers', async function () {
        return new Promise((resolve, reject) => {
            uriHandler.onPath(testPath, () => reject(new Error('this should not be called'))).dispose()
            return uriHandler.handleUri(makeUri()).then(resolve)
        })
    })

    it('throws when registering handler for same path', function () {
        uriHandler.onPath(testPath, () => {})
        assert.throws(() => uriHandler.onPath(testPath, () => {}))
    })

    it('catches errors thrown by the parser', async function () {
        const handler = () => {
            throw new Error('this should not be called')
        }
        const parser = () => {
            throw new Error()
        }

        uriHandler.onPath(testPath, handler, parser)
        await assert.doesNotReject(uriHandler.handleUri(makeUri('key=value')))
    })

    it('catches errors thrown by the handler', async function () {
        const handler = () => {
            throw new Error()
        }

        uriHandler.onPath(testPath, handler)
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

describe('UriHandler query decoding', function () {
    let uriHandler: UriHandler

    function makeUri(query: string): vscode.Uri {
        return vscode.Uri.parse(`scheme://authority/my/path?${query}`)
    }

    beforeEach(function () {
        uriHandler = new UriHandler()
    })

    it('decodes %3D and %26 in query string for non-http protocol handlers (Cursor/Kiro)', async function () {
        let receivedParams: SearchParams | undefined
        uriHandler.onPath('/my/path', (q) => {
            receivedParams = q as SearchParams
        })

        // Simulate what Cursor/Kiro OS protocol handlers do: encode = as %3D and & as %26
        const uri = makeUri('refreshUrl%3Dhttps%253A%252F%252Fexample.com%26sessionId%3Ds1')
        await uriHandler.handleUri(uri)

        assert.ok(receivedParams)
        assert.strictEqual(receivedParams!.get('refreshUrl'), 'https%3A%2F%2Fexample.com')
        assert.strictEqual(receivedParams!.get('sessionId'), 's1')
    })

    it('preserves + as literal plus (not space) in query values', async function () {
        let receivedParams: SearchParams | undefined
        uriHandler.onPath('/my/path', (q) => {
            receivedParams = q as SearchParams
        })

        const uri = makeUri('token=abc+def+ghi')
        await uriHandler.handleUri(uri)

        assert.ok(receivedParams)
        assert.strictEqual(receivedParams!.get('token'), 'abc+def+ghi')
    })

    it('normal VS Code URIs with real delimiters still parse correctly', async function () {
        let receivedParams: SearchParams | undefined
        uriHandler.onPath('/my/path', (q) => {
            receivedParams = q as SearchParams
        })

        const uri = makeUri('sessionId=s1&streamUrl=wss%3A%2F%2Fhost&token=tok1')
        await uriHandler.handleUri(uri)

        assert.ok(receivedParams)
        assert.strictEqual(receivedParams!.get('sessionId'), 's1')
        assert.strictEqual(receivedParams!.get('streamUrl'), 'wss://host')
        assert.strictEqual(receivedParams!.get('token'), 'tok1')
    })
})
