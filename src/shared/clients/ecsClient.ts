/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type EcsClient = ClassToInterfaceType<DefaultEcsClient>

export type ServicesAndToken =  {
    services: ECS.Service[],
    nextToken?: string
}
export class DefaultEcsClient {
    public constructor(public readonly regionCode: string) {}

    public async listClusters(): Promise<ECS.Cluster[]> {
        const sdkClient = await this.createSdkClient()
        const clusterArnList = await sdkClient.listClusters().promise()
        const clusterResponse =  await sdkClient.describeClusters({ clusters: clusterArnList.clusterArns}).promise()
        return clusterResponse.clusters ?? []
    }

    public async listServices(cluster: string, nextToken?: string): Promise<ServicesAndToken> {
        const sdkClient = await this.createSdkClient()
        const serviceArnList = await sdkClient.listServices({cluster: cluster, nextToken: nextToken}).promise()
        try {
            const serviceResponse = await sdkClient.describeServices({services: serviceArnList.serviceArns!, cluster: cluster}).promise()
            const response: ServicesAndToken = {
                services: serviceResponse.services!,
                nextToken: serviceArnList.nextToken,
            }
            return response
        } catch (error) {
            getLogger().error('Failed to list services for cluster %s: %O', cluster, error)
            throw error
        }
        
    }

    protected async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }
}
