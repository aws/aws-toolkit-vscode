/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from './resourcefetcher'

// TODO: replace this with something more generic like Log.all(...)
export class CompositeResourceFetcher implements ResourceFetcher {
    private readonly logger: Logger = getLogger()
    private readonly fetchers: ResourceFetcher[]

    /**
     * @param fetchers - resource load is attempted from provided fetchers until one succeeds
     */
    public constructor(...fetchers: ResourceFetcher[]) {
        this.fetchers = fetchers
    }

    /**
     * Returns the contents of the resource from the first fetcher that successfully retrieves it, or undefined if the resource could not be retrieved.
     */
    public async get(): Promise<string | undefined> {
        for (const fetcher of this.fetchers) {
            const contents = await fetcher.get().catch(err => {
                this.logger.debug('fetch failed: %s', (err as Error).message)
            })
            if (contents) {
                return contents
            }
        }
    }
}
