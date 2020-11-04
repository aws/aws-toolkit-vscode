/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { default as got, Response } from 'got'
import * as stream from 'stream'
import { promisify } from 'util'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'
const pipeline = promisify(stream.pipeline)

// TODO pipe to file needs to be split out, and it needs to allow the caller to handle errors better
export class HttpResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()

    /**
     *
     * @param url URL to fetch a response body from via the `get` call
     * @param params Additional params for the fetcher
     * @param {boolean} params.showUrl Whether or not to the URL in log statements.
     * @param {string} params.friendlyName If URL is not shown, replaces the URL with this text.
     * @param {string} params.pipeLocation If provided, pipes output to file designated here. 
     * If this is selected, the function will not return a value.
     */
    public constructor(
        private readonly url: string,
        private readonly params: { showUrl: boolean; friendlyName?: string; pipeLocation?: string }
    ) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved or if it
     * is piped somewhere else
     */
    public async get(): Promise<string | undefined> {
        try {
            this.logger.verbose(`Loading ${this.logText()}`)

            let response: Response<string> | undefined
            if (this.params.pipeLocation) {
                await pipeline(got.stream(this.url), fs.createWriteStream(this.params.pipeLocation))
            } else {
                response = await got(this.url)
            }
            this.logger.verbose(`Finished loading ${this.logText()}`)
            return response?.body
        } catch (err) {
            // only get the code as to keep the url private. Some AWS APIs use presigned links
            // which we don't want to print to output
            this.logger.error(`Error loading ${this.logText()}: %O`, err?.response?.statusCode)

            return undefined
        }
    }

    private logText(): string {
        return this.params.showUrl ? this.url : this.params.friendlyName ?? 'resource from URL'
    }
}
