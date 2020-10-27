/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
// TODO: Move off of deprecated `request` to `got` or similar modern library.
import * as request from 'request'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'

export class HttpResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()

    public constructor(
        private readonly url: string,
        private readonly params: { showUrl: boolean; friendlyName?: string; pipeLocation?: string }
    ) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        try {
            this.logger.verbose(`Loading ${this.logText()}`)

            const contents = (await this.getResponseFromGetRequest()).body

            this.logger.verbose(`Finished loading ${this.logText()}`)

            return contents
        } catch (err) {
            this.logger.error(`Error loading ${this.logText()}: %O`, err as Error)

            return undefined
        }
    }

    // TODO: Are there cases where we don't mind the URL?
    // Safer to do it this way assuming others use this fetcher.
    private logText(): string {
        return this.params.showUrl ? this.url : this.params.friendlyName ?? 'resource from URL'
    }

    private async getResponseFromGetRequest(): Promise<request.Response> {
        return new Promise<request.Response>((resolve, reject) => {
            const call = request(this.url, (err, response, body) => {
                if (err) {
                    // swallow error to keep URL private
                    // some AWS APIs use presigned links (e.g. Lambda.getFunction); showing these represent a securty concern.
                    reject('Error making request to URL.')
                }
                resolve(response)
            })

            if (this.params.pipeLocation) {
                call.pipe(fs.createWriteStream(this.params.pipeLocation))
            }
        })
    }
}
