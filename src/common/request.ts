/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import crossFetch from 'cross-fetch'

/**
 * Make a fetch request.
 *
 * @example
 * const request = fetch('GET', 'https://example.com')
 * setTimeout(() => request.cancel(), 10_000)
 * const response = await request.response
 * const text = await response.text()
 *
 * @param wrappedFetch - The actual fetch implementation
 */
export default function fetch(
    method: RequestMethod,
    url: string,
    params?: RequestParamsArg,
    wrappedFetch = crossFetch
): FetchRequest {
    return new FetchRequest(url, { ...params, method }, wrappedFetch)
}

type RequestMethod = 'GET' | 'POST' | 'PUT'
/** All possible params of a fetch request (eg: headers) */
type RequestParams = RequestInit
/** The params of a fetch request that are allowed to be passed in as an argument by a caller. */
type RequestParamsArg = Omit<RequestParams, 'method' | 'signal'>

/**
 * This object holds all of the required information to make a fetch request.
 *
 * Use {@link FetchRequest.response} to make the actual request and get the response.
 */
class FetchRequest {
    private requestCanceller: AbortController | undefined

    constructor(
        private readonly url: string,
        private readonly params: RequestParams = {},
        private readonly wrappedFetch: typeof crossFetch
    ) {}

    /**
     * The response of the fetch request.
     *
     * @throws {RequestError} If the request gets a non-successful response
     * @throws {RequestCancelledError} If the request was cancelled before completion
     */
    get response(): Promise<Response> {
        return new Promise(async (resolve, reject) => {
            try {
                // Setup cancellation ability
                this.requestCanceller = new AbortController()
                const params = this.makeRequestCancellable(this.params, this.requestCanceller)

                // Make the actual request
                const actualResponse = await this.wrappedFetch(this.url, params)

                await this.throwIfBadResponse(this.params, actualResponse, this.url)
                this.requestCanceller = undefined

                resolve(actualResponse)
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    reject(new RequestCancelledError())
                }
                reject(err)
            }
        })
    }

    /**
     * Cancels the request if in progress.
     */
    cancel() {
        if (this.requestCanceller === undefined) {
            return
        }
        this.requestCanceller.abort()
        this.requestCanceller = undefined
    }

    // ----- Private -----

    private makeRequestCancellable(params: RequestParams, requestCanceller: AbortController): RequestParams {
        return { ...params, signal: requestCanceller.signal }
    }

    private async throwIfBadResponse(request: RequestParams, response: Response, url: string) {
        if (response.ok) {
            return
        }

        const code = response.status
        const body = await response.text()
        throw new RequestError({ url, code, body, request, response })
    }
}

/** When a request results in a failed response. */
export class RequestError extends Error {
    code: number
    body: string

    request: RequestParams
    response: Response

    constructor(args: { url: string; code: number; body: string; request: RequestParams; response: Response }) {
        const message = `"${args.request.method}" request failed with code "${args.code}" to "${args.url}": ${args.body}`
        super(message)
        this.code = args.code
        this.body = args.body
        this.request = args.request
        this.response = args.response
    }
}

export class RequestCancelledError extends Error {
    constructor() {
        super('Request cancelled')
    }
}
