/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage } from 'http'
import * as request from 'request'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'

export class HttpResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()

    public constructor(private readonly url: string) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        try {
            this.logger.verbose(`Loading resource from ${this.url}`)

            const contents = await this.loadFromUrl()

            this.logger.verbose(`Finished loading resource from ${this.url}`)

            return contents
        } catch (err) {
            this.logger.error(`Error loading resource from ${this.url}: %O`, err as Error)

            return undefined
        }
    }

    private async loadFromUrl(): Promise<string | undefined> {
        return new Promise<string>((resolve, reject) => {
            request(this.url, (error: any, response: IncomingMessage, body: any) => {
                if (error) {
                    reject(error)
                } else {
                    // tslint:disable-next-line: no-unsafe-any
                    resolve(body.toString())
                }
            })
        })
    }
}
