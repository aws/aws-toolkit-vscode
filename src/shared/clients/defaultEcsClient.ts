/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { EcsClient } from './ecsClient'

export class DefaultEcsClient implements EcsClient {

    public constructor(
        public readonly regionCode: string
    ) { }

    public async *listClusters(): AsyncIterableIterator<string> {
        const sdkClient = await this.createSdkClient()
        const request: ECS.ListClustersRequest = {}
        do {
            const response = await this.invokeListClusters(request, sdkClient)
            if (response.clusterArns) {
                yield* response.clusterArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listServices(cluster: string): AsyncIterableIterator<string> {
        const sdkClient = await this.createSdkClient()
        const request: ECS.ListServicesRequest = {
            cluster
        }
        do {
            const response = await this.invokeListServices(request, sdkClient)
            if (response.serviceArns) {
                yield* response.serviceArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listTaskDefinitions(): AsyncIterableIterator<string> {
        const sdkClient = await this.createSdkClient()
        // do we also want to cover inactive? If so, would we want to use a separate function?
        const request: ECS.ListTaskDefinitionsRequest = {
            status: 'ACTIVE'
        }
        do {
            const response = await this.invokeListTaskDefinitions(request, sdkClient)
            if (response.taskDefinitionArns) {
                yield* response.taskDefinitionArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    protected async invokeListClusters(request: ECS.ListClustersRequest, sdkClient: ECS)
        : Promise<ECS.ListClustersResponse> {
        return sdkClient.listClusters(request).promise()
    }

    protected async invokeListServices(request: ECS.ListServicesRequest, sdkClient: ECS)
        : Promise<ECS.ListServicesResponse> {
        return sdkClient.listServices(request).promise()
    }

    protected async invokeListTaskDefinitions(request: ECS.ListTaskDefinitionsRequest, sdkClient: ECS)
        : Promise<ECS.ListTaskDefinitionsResponse> {
        return sdkClient.listTaskDefinitions(request).promise()
    }

    protected async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            (options) => new ECS(options),
            undefined,
            this.regionCode
        )
    }
}
