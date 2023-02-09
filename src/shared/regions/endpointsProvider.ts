/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger'
import { ResourceFetcher } from '../resourcefetcher/resourcefetcher'
import { Endpoints, loadEndpoints } from './endpoints'

export class EndpointsProvider {
    /**
     * @param localFetcher Retrieves endpoints manifest from local sources available to the toolkit. Expected
     *                      to resolve fast, and is both a placeholder until the remote resources are loaded, and
     *                      is a fallback in case the toolkit is unable to load a remote resource
     * @param remoteFetcher Retrieves endpoints manifest from remote host
     */
    public constructor(
        private readonly localFetcher: ResourceFetcher,
        private readonly remoteFetcher: ResourceFetcher
    ) {}

    public async load(): Promise<Endpoints> {
        getLogger().info('Retrieving AWS endpoint data')
        const remoteEndpointsJson = await this.remoteFetcher.get()
        if (remoteEndpointsJson) {
            const remoteEndpoints = loadEndpoints(remoteEndpointsJson)
            if (remoteEndpoints) {
                return remoteEndpoints
            }
        }

        const localEndpointsJson = await this.localFetcher.get()
        if (localEndpointsJson) {
            const localEndpoints = loadEndpoints(localEndpointsJson)
            if (localEndpoints) {
                return localEndpoints
            }
        }

        // If endpoints were never loaded by this point, we have a critical error
        throw new Error('Failure to load any endpoints manifest data')
    }
}
