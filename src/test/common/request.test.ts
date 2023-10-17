/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonStub, stub } from 'sinon'
import assert from 'assert'
import crossFetch from 'cross-fetch'
import fetch, { RequestCancelledError, RequestError } from '../../common/request'
import globals from '../../shared/extensionGlobals'

describe('fetch()', function () {
    /** We built a wrapper around an actual fetch implementation, this is a fake stub of it for testing. */
    let wrappedFetch: SinonStub<Parameters<typeof crossFetch>, Promise<Response>>
    const testStatusCode = 123456
    const actualResponse: Response = {
        ok: true,
        status: testStatusCode,
    } as Response

    beforeEach(function () {
        // stub underlying fetch response with some default values
        wrappedFetch = stub()
        wrappedFetch.resolves(actualResponse)
    })

    it('passes the expected arguments to the wrapped fetch implementation', async function () {
        const response = await fetch('GET', 'http://test.com', { mode: 'cors' }, wrappedFetch).response

        assert.strictEqual(wrappedFetch.callCount, 1)
        assert.deepStrictEqual(wrappedFetch.getCall(0).args, [
            'http://test.com',
            { method: 'GET', mode: 'cors', signal: new AbortController().signal },
        ])

        assert.strictEqual(response.status, actualResponse.status)
    })

    it('throws if a request gets a bad response', async function () {
        // stub to resolve a bad response
        wrappedFetch.resolves({
            ok: false,
            text: () => Promise.resolve('test text'),
            status: testStatusCode,
        } as Response)

        const request = fetch('GET', 'http://test.com', {}, wrappedFetch)

        await assert.rejects(async () => {
            await request.response
        }, RequestError)
    })

    it('throws an AbortError if cancel() is called while the request is being made', async function () {
        // How does this test work?
        // - There are multiple event queues that the event loop pops events from for asynchronous code
        // - There are microtask and macrotask queues
        // - A Promise is a microtask
        // - A setTimeout is a macrotask
        // - Microtasks take priority over macrotasks, so Promises take priority over setTimeouts
        // - If a Promise has a ~nested Promise~, when it is popped for processing from the microtask queue it
        //   will push the ~nested Promise~ to the microtask queue and then that will be popped/processed.
        // - All of this is done before anything on the macrotask queue (setTimeout) is processed.
        // - Once all microTasks are completed/exhausted, only then will the event loop
        //   pickup a single macrotask. This process then repeats.

        const request = fetch('GET', 'https://aws.amazon.com/', {})

        // cancel() call is part of the macrotask queue.
        globals.clock.setTimeout(() => {
            request.cancel()
        }, 0)

        // The response and the wrapped fetch request pushed to the microtask queue.
        assert.rejects(
            () => request.response,
            e => {
                return e instanceof RequestCancelledError
            }
        )
    })
})
