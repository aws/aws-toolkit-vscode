/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from '../resourcefetcher/resourcefetcher'
import { Endpoints, loadEndpoints } from './endpoints'

export class EndpointsProvider {
    private readonly logger: Logger = getLogger()
    public get onEndpointsUpdated(): vscode.Event<EndpointsProvider> {
        return this.onEndpointsUpdatedEmitter.event
    }
    private readonly onEndpointsUpdatedEmitter: vscode.EventEmitter<EndpointsProvider> = new vscode.EventEmitter()
    private endpoints: Endpoints | undefined

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

    public getEndpoints(): Endpoints | undefined {
        return this.endpoints
    }

    public async load(): Promise<void> {
        this.logger.info('Retrieving AWS endpoint data')
        const localEndpointsJson = await this.localFetcher.get()
        if (localEndpointsJson) {
            const localEndpoints = loadEndpoints(localEndpointsJson)
            if (localEndpoints) {
                this.updateEndpoints(localEndpoints)
            }
        }

        const remoteEndpointsJson = await this.remoteFetcher.get()
        if (remoteEndpointsJson) {
            const remoteEndpoints = loadEndpoints(remoteEndpointsJson)
            if (remoteEndpoints) {
                this.updateEndpoints(remoteEndpoints)
            }
        }

        // If endpoints were never loaded by this point, we have a critical error
        if (!this.endpoints) {
            throw new Error('Failure to load any endpoints manifest data')
        }
    }

    private updateEndpoints(endpoints: Endpoints) {
        this.endpoints = endpoints
        this.onEndpointsUpdatedEmitter.fire(this)
    }
}
