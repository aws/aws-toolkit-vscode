/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ParsedUrlQuery as Query } from 'querystring'
import { UriHandler } from '../../../shared/vscode/uriHandler'
import * as mdeUriHandlers from '../../../mde/mdeUriHandlers'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('UriHandler', function () {
    const TEST_PATH = '/my/path'
    let uriHandler: UriHandler

    function makeUri(query?: string): vscode.Uri {
        return vscode.Uri.parse(`scheme://authority${TEST_PATH}${query !== undefined ? `?${query}` : ''}`)
    }

    beforeEach(function () {
        uriHandler = new UriHandler()
    })

    it('can register a handler', async function () {
        uriHandler.registerHandler(TEST_PATH, q => assert.strictEqual(q['key'], 'value'))
        return uriHandler.handleUri(makeUri('key=value'))
    })

    it('uses parser if available', async function () {
        uriHandler.registerHandler(
            TEST_PATH,
            q => assert.strictEqual(q.myNumber, 123),
            (q: Query) => ({ myNumber: Number(q['myString']) })
        )
        return uriHandler.handleUri(makeUri('myString=123'))
    })

    it('can handle lists', async function () {
        uriHandler.registerHandler(TEST_PATH, q => assert.deepStrictEqual(q['list'], ['1', '2', '3']))
        return uriHandler.handleUri(makeUri('list=1&list=2&list=3'))
    })

    it('can dispose handlers', async function () {
        return new Promise((resolve, reject) => {
            uriHandler.registerHandler(TEST_PATH, () => reject(new Error('this should not be called'))).dispose()
            uriHandler.handleUri(makeUri()).then(resolve)
        })
    })

    it('throws when registering handler for same path', function () {
        uriHandler.registerHandler(TEST_PATH, () => {})
        assert.throws(() => uriHandler.registerHandler(TEST_PATH, () => {}))
    })

    it('catches errors thrown by the parser', function (done) {
        const handler = () => done(new Error('this should not be called'))
        const parser = () => {
            throw new Error()
        }

        uriHandler.registerHandler(TEST_PATH, handler, parser)
        assert.doesNotReject(uriHandler.handleUri(makeUri('key=value'))).then(done, done)
    })

    it('catches errors thrown by the handler', async function () {
        const handler = () => {
            throw new Error()
        }

        uriHandler.registerHandler(TEST_PATH, handler)
        return assert.doesNotReject(uriHandler.handleUri(makeUri()))
    })
})

describe('MDE, CAWS UriHandlers', function () {
    let uriHandler: UriHandler

    beforeEach(function () {
        uriHandler = new UriHandler()
    })

    it('xxx', async function () {
        const ctx = await FakeExtensionContext.getFakeExtContext()
        mdeUriHandlers.activateUriHandlers(ctx.extensionContext, uriHandler)
        // TODO: this will open a prompt, causing tests to stall
        uriHandler.handleUri(
            vscode.Uri.parse(
                'vscode://amazonwebservices.aws-toolkit-vscode/remote?url=https%3A%2F%2Fcode.aws%2Ffoo%2Fbar.git'
            )
        )
    })
})
