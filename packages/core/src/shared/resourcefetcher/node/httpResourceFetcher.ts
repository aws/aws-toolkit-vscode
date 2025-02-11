/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as http from 'http'
import * as https from 'https'
import * as stream from 'stream'
import got, { RequestError } from 'got'
import urlToOptions from 'got/dist/source/core/utils/url-to-options'
import Request from 'got/dist/source/core'
import { VSCODE_EXTENSION_ID } from '../../extensions'
import { getLogger, Logger } from '../../logger/logger'
import { Timeout, CancellationError, CancelEvent } from '../../utilities/timeoutUtils'
import { isCloud9 } from '../../extensionUtilities'
import { Headers } from 'got/dist/source/core'

// XXX: patched Got module for compatability with older VS Code versions (e.g. Cloud9)
// `got` has also deprecated `urlToOptions`
const patchedGot = got.extend({
    request: (url, options, callback) => {
        if (url.protocol === 'https:') {
            return https.request({ ...options, ...urlToOptions(url) }, callback)
        }
        return http.request({ ...options, ...urlToOptions(url) }, callback)
    },
})

/** Promise that resolves/rejects when all streams close. Can also access streams directly. */
type FetcherResult = Promise<void> & {
    /** Download stream piped to `fsStream`. */
    requestStream: Request // `got` doesn't add the correct types to 'on' for some reason
    /** Stream writing to the file system. */
    fsStream: fs.WriteStream
}

type RequestHeaders = { eTag?: string; gZip?: boolean }

/**
 * Legacy HTTP Resource Fetcher used specifically for streaming information.
 * Only kept around until web streams are compatible with node streams
 */
export class HttpResourceFetcher {
    private readonly logger: Logger = getLogger()

    /**
     *
     * @param url URL to fetch a response body from via the `get` call
     * @param params Additional params for the fetcher
     * @param {boolean} params.showUrl Whether or not to the URL in log statements.
     * @param {string} params.friendlyName If URL is not shown, replaces the URL with this text.
     * @param {function} params.onSuccess Function to execute on successful request. No effect if piping to a location.
     * @param {Timeout} params.timeout Timeout token to abort/cancel the request. Similar to `AbortSignal`.
     */
    public constructor(
        private readonly url: string,
        private readonly params: {
            showUrl: boolean
            friendlyName?: string
            timeout?: Timeout
        }
    ) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     *
     * @param pipeLocation Optionally pipe the download to a file system location
     */
    public get(pipeLocation: string): FetcherResult {
        this.logger.verbose(`downloading: ${this.logText()}`)

        const result = this.pipeGetRequest(pipeLocation, this.params.timeout)
        result.fsStream.on('exit', () => {
            this.logger.verbose(`downloaded: ${this.logText()}`)
        })

        return result
    }

    private logText(): string {
        return this.params.showUrl ? this.url : (this.params.friendlyName ?? 'resource from URL')
    }

    private logCancellation(event: CancelEvent) {
        getLogger().debug(`Download for "${this.logText()}" ${event.agent === 'user' ? 'cancelled' : 'timed out'}`)
    }

    // TODO: make pipeLocation a vscode.Uri
    private pipeGetRequest(pipeLocation: string, timeout?: Timeout): FetcherResult {
        const requester = isCloud9() ? patchedGot : got
        const requestStream = requester.stream(this.url, { headers: this.buildRequestHeaders() })
        const fsStream = fs.createWriteStream(pipeLocation)

        const done = new Promise<void>((resolve, reject) => {
            const pipe = stream.pipeline(requestStream, fsStream, (err) => {
                if (err instanceof RequestError) {
                    return reject(Object.assign(new Error('Failed to download file'), { code: err.code }))
                }
                err ? reject(err) : resolve()
            })

            const cancelListener = timeout?.token.onCancellationRequested((event) => {
                this.logCancellation(event)
                pipe.destroy(new CancellationError(event.agent))
            })

            pipe.on('close', () => cancelListener?.dispose())
        })

        return Object.assign(done, { requestStream, fsStream })
    }

    private buildRequestHeaders(requestHeaders?: RequestHeaders): Headers {
        const headers: Headers = {}

        headers['User-Agent'] = VSCODE_EXTENSION_ID.awstoolkit

        if (requestHeaders?.eTag !== undefined) {
            headers['If-None-Match'] = requestHeaders.eTag
        }

        if (requestHeaders?.gZip) {
            headers['Accept-Encoding'] = 'gzip'
        }

        return headers
    }
}
