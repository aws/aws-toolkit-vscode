/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
// TODO: Move off of deprecated `request` to `got` or similar modern library.
import * as request from 'request'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'

export class HttpResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()

    /**
     *
     * @param url URL to fetch a response body from via the `get` call
     * @param params Additional params for the fetcher
     * @param {boolean} params.showUrl Whether or not to the URL in log statements.
     * @param {string} params.friendlyName If URL is not shown, replaces the URL with this text.
     * @param {string} params.pipeLocation If provided, pipes output to file designated here.
     * @param {function} params.onSuccess Function to execute on successful request.
     */
    public constructor(
        private readonly url: string,
        private readonly params: {
            showUrl: boolean
            friendlyName?: string
            pipeLocation?: string
            onSuccess?(contents: string): void
        }
    ) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        try {
            this.logger.verbose(`Loading ${this.logText()}`)

            const contents = (await this.getResponseFromGetRequest()).body
            if (this.params.onSuccess) {
                this.params.onSuccess(contents)
            }

            this.logger.verbose(`Finished loading ${this.logText()}`)

            return contents
        } catch (err) {
            this.logger.error(`Error loading ${this.logText()}: %O`, err as Error)

            return undefined
        }
    }

    private logText(): string {
        return this.params.showUrl ? this.url : this.params.friendlyName ?? 'resource from URL'
    }

    private async getResponseFromGetRequest(): Promise<request.Response> {
        return new Promise<request.Response>((resolve, reject) => {
            const call = request(
                {
                    url: this.url,
                    headers: { 'User-Agent': VSCODE_EXTENSION_ID.awstoolkit },
                },
                (err, response, body) => {
                    if (err) {
                        // swallow error to keep URL private
                        // some AWS APIs use presigned links (e.g. Lambda.getFunction); showing these represent a securty concern.
                        reject({ code: err.code })
                    }
                    resolve(response)
                }
            )

            if (this.params.pipeLocation) {
                call.pipe(fs.createWriteStream(this.params.pipeLocation))
            }
        })
    }
}
