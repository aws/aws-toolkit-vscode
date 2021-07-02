/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type EcsClient = ClassToInterfaceType<DefaultEcsClient>
export class DefaultEcsClient {
    public constructor(public readonly regionCode: string) {}

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
            cluster,
        }
        do {
            const response = await this.invokeListServices(request, sdkClient)
            if (response.serviceArns) {
                yield* response.serviceArns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async *listTaskDefinitionFamilies(): AsyncIterableIterator<string> {
        const sdkClient = await this.createSdkClient()
        // do we also want to cover inactive? If so, would we want to use a separate function?
        const request: ECS.ListTaskDefinitionFamiliesRequest = {}
        do {
            const response = await this.invokeListTaskDefinitionFamilies(request, sdkClient)
            if (response.families) {
                yield* response.families
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    protected async invokeListClusters(
        request: ECS.ListClustersRequest,
        sdkClient: ECS
    ): Promise<ECS.ListClustersResponse> {
        return sdkClient.listClusters(request).promise()
    }

    protected async invokeListServices(
        request: ECS.ListServicesRequest,
        sdkClient: ECS
    ): Promise<ECS.ListServicesResponse> {
        return sdkClient.listServices(request).promise()
    }

    protected async invokeListTaskDefinitionFamilies(
        request: ECS.ListTaskDefinitionFamiliesRequest,
        sdkClient: ECS
    ): Promise<ECS.ListTaskDefinitionFamiliesResponse> {
        return sdkClient.listTaskDefinitionFamilies(request).promise()
    }

    protected async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }
}
