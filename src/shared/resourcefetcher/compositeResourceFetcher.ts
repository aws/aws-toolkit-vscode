/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'

export class CompositeResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()
    private readonly fetchers: ResourceFetcher[]

    /**
     * Tries loading from fetchers in order until one returns a resource
     */
    public constructor(...fetchers: ResourceFetcher[]) {
        this.fetchers = fetchers
    }

    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        try {
            for (const fetcher of this.fetchers) {
                const contents = await this.tryGet(fetcher)
                if (contents) {
                    return contents
                }
            }
        } catch (err) {
            this.logger.error('Error loading resource from resource fetchers', err as Error)

            return undefined
        }
    }

    private async tryGet(fetcher: ResourceFetcher): Promise<string | undefined> {
        try {
            return await fetcher.get()
        } catch (err) {
            this.logger.error('Error loading resource from resource fetcher', err as Error)

            return undefined
        }
    }
}
