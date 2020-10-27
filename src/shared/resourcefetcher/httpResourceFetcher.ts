/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../logger'
import { getResponseFromGetRequest } from '../utilities/requestUtils'
import { ResourceFetcher } from './resourcefetcher'

export class HttpResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()

    public constructor(private readonly url: string, private readonly friendlyName?: string) {}

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        try {
            this.logger.verbose(`Loading ${this.logText()}`)

            const contents = await this.loadFromUrl()

            this.logger.verbose(`Finished loading ${this.logText()}`)

            return contents
        } catch (err) {
            this.logger.error(`Error loading ${this.logText()}: %O`, err as Error)

            return undefined
        }
    }

    // TODO: Are there cases where we don't mind the URL?
    // Safer to do it this way assuming others use this library.
    private logText(): string {
        return this.friendlyName ?? 'resource from external URL'
    }

    private async loadFromUrl(): Promise<string | undefined> {
        return (await getResponseFromGetRequest(this.url)).body
    }
}
