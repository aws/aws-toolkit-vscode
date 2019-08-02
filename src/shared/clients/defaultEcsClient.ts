/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, ECS } from 'aws-sdk'
import { PromiseResult } from 'aws-sdk/lib/request'
import { ext } from '../extensionGlobals'
import { EcsClient } from './ecsClient'

export class DefaultEcsClient implements EcsClient {

    public constructor(
        public readonly regionCode: string
    ) { }

    public async *listClusters(): AsyncIterableIterator<string> {
        const request: ECS.ListClustersRequest = {}
        do {
            const response = await this.invokeListClusters(request)
            if (response.clusterArns) {
                yield* response.clusterArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listServices(cluster: string): AsyncIterableIterator<string> {
        const request: ECS.ListServicesRequest = {
            cluster
        }
        do {
            const response = await this.invokeListServices(request)
            if (response.serviceArns) {
                yield* response.serviceArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listTaskDefinitions(): AsyncIterableIterator<string> {
        // do we also want to cover inactive? If so, would we want to use a separate function?
        const request: ECS.ListTaskDefinitionsRequest = {
            status: 'ACTIVE'
        }
        do {
            const response = await this.invokeListTaskDefinitions(request)
            if (response.taskDefinitionArns) {
                yield* response.taskDefinitionArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    protected async invokeListClusters(request: ECS.ListClustersRequest)
        : Promise<PromiseResult<ECS.ListClustersResponse, AWSError>> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.listClusters(request).promise()
    }

    protected async invokeListServices(request: ECS.ListServicesRequest)
        : Promise<PromiseResult<ECS.ListServicesResponse, AWSError>> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.listServices(request).promise()
    }

    protected async invokeListTaskDefinitions(request: ECS.ListTaskDefinitionsRequest)
        : Promise<PromiseResult<ECS.ListTaskDefinitionsResponse, AWSError>> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.listTaskDefinitions(request).promise()
    }

    private async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            (options) => new ECS(options),
            undefined,
            this.regionCode
        )
    }
}
