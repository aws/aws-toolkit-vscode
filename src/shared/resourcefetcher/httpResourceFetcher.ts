/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import * as vscode from 'vscode'
import * as semver from 'semver'
import * as stream from 'stream'
import got, { Response, RequestError, CancelError } from 'got'
import urlToOptions from 'got/dist/source/core/utils/url-to-options'
import Request from 'got/dist/source/core'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'
import { Timeout } from '../utilities/timeoutUtils'

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
// I can't track down the real version but this seems close enough
// VSC 1.44.2 seems to work, but on C9 it does not?
const MIN_VERSION_FOR_GOT = '1.47.0'

// Minimal interface for hooking into download + file write streams
interface FetcherStreams {
    /** Download stream piped to `fsStream`. */
    requestStream: Request // `got` doesn't add the correct types to 'on' for some reason
    /** Stream writing to the file system. */
    fsStream: fs.WriteStream
    /** Promise that fulfills when all streams have closed or when an error event occurs. */
    done: Promise<void>
}

export class HttpResourceFetcher implements ResourceFetcher {
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
            onSuccess?(contents: string): void
            timeout?: Timeout
        }
    ) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     *
     * @param pipeLocation Optionally pipe the download to a file system location
     */
    public get(): Promise<string | undefined>
    public get(pipeLocation: string): FetcherStreams
    public get(pipeLocation?: string): Promise<string | undefined> | FetcherStreams {
        this.logger.verbose(`Downloading ${this.logText()}`)

        if (pipeLocation) {
            const streams = this.pipeGetRequest(pipeLocation, this.params.timeout)
            streams.done.then(() => {
                this.logger.verbose(`Finished downloading ${this.logText()}`)
            })
            return streams
        }

        return this.downloadRequest()
    }

    private async downloadRequest(): Promise<string | undefined> {
        try {
            // HACK(?): receiving JSON as a string without `toString` makes it so we can't deserialize later
            const contents = (await this.getResponseFromGetRequest(this.params.timeout)).body.toString()
            if (this.params.onSuccess) {
                this.params.onSuccess(contents)
            }

            this.logger.verbose(`Finished downloading ${this.logText()}`)

            return contents
        } catch (err) {
            const error = err as CancelError | { message?: string; code?: number }
            this.logger.verbose(`Error downloading ${this.logText()}: %s`, error.message ?? error.code)

            return undefined
        }
    }

    private logText(): string {
        return this.params.showUrl ? this.url : this.params.friendlyName ?? 'resource from URL'
    }

    // TODO: make pipeLocation a vscode.Uri
    private pipeGetRequest(pipeLocation: string, timeout?: Timeout): FetcherStreams {
        const requester = semver.lt(vscode.version, MIN_VERSION_FOR_GOT) ? patchedGot : got
        const requestStream = requester.stream(this.url, { headers: { 'User-Agent': VSCODE_EXTENSION_ID.awstoolkit } })
        const fsStream = fs.createWriteStream(pipeLocation)

        const done = new Promise<void>((resolve, reject) => {
            const pipe = stream.pipeline(requestStream, fsStream, err => {
                if (err instanceof RequestError) {
                    return reject(Object.assign(new Error('Failed to download file'), { code: err.code }))
                }
                err ? reject(err) : resolve()
            })

            timeout?.timer.catch(err => (pipe.end(), reject(err)))
        })

        return { requestStream, fsStream, done }
    }

    private async getResponseFromGetRequest(timeout?: Timeout): Promise<Response<string>> {
        const requester = semver.lt(vscode.version, MIN_VERSION_FOR_GOT) ? patchedGot : got
        const promise = requester(this.url, {
            headers: { 'User-Agent': VSCODE_EXTENSION_ID.awstoolkit },
        })
        timeout?.timer.catch(err => promise.cancel(err.message))

        return promise.catch((err: RequestError | CancelError) => {
            // Cancel error has no sensitive info
            if (err instanceof CancelError) {
                throw err
            }
            throw { code: err.code } // Swallow URL since it may contain sensitive data
        })
    }
}

/**
 * Retrieves JSON property value from a remote resource
 * @param property property to retrieve
 * @param url url of JSON resource
 * @param fetcher optional HTTP resource fetcher to use
 * @returns property value if available or undefined
 */
export async function getPropertyFromJsonUrl(
    url: string,
    property: string,
    fetcher?: HttpResourceFetcher
): Promise<any | undefined> {
    const resourceFetcher = fetcher ?? new HttpResourceFetcher(url, { showUrl: true })
    const result = await resourceFetcher.get()
    if (result) {
        try {
            const json = JSON.parse(result)
            if (json[property]) {
                return json[property]
            }
        } catch (err) {
            getLogger().error(`JSON at ${url} not parsable: ${err}`)
        }
    }
}
