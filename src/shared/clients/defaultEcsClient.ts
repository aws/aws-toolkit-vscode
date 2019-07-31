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

    public async *listClusters(): AsyncIterableIterator<ECS.String> {
        const sdkClient = await this.createSdkClient()
        const request: ECS.ListClustersRequest = {}
        do {
            const response = await sdkClient.listClusters(request).promise()
            if (response.clusterArns) {
                yield* response.clusterArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listServices(cluster: string): AsyncIterableIterator<ECS.String> {
        const sdkClient = await this.createSdkClient()
        const request: ECS.ListServicesRequest = {
            cluster
        }
        do {
            const response = await sdkClient.listServices(request).promise()
            if (response.serviceArns) {
                yield* response.serviceArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listTaskDefinitions(): AsyncIterableIterator<ECS.String> {
        const sdkClient = await this.createSdkClient()
        // do we also want to cover inactive? If so, would we want to use a separate function?
        const request: ECS.ListTaskDefinitionsRequest = {
            status: 'ACTIVE'
        }
        do {
            const response = await sdkClient.listTaskDefinitions(request).promise()
            if (response.taskDefinitionArns) {
                yield* response.taskDefinitionArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    private async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            (options) => new ECS(options),
            undefined,
            this.regionCode
        )
    }
}
