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

    public async listClusters(): Promise<ECS.Cluster[]> {
        const sdkClient = await this.createSdkClient()
        const clusterArnList = await sdkClient.listClusters().promise()
        const clusterReponse =  await sdkClient.describeClusters({ clusters: clusterArnList.clusterArns}).promise()
        return clusterReponse.clusters ?? []
    }

    public async listServices(cluster: string): Promise<ECS.Service[]> {
        const sdkClient = await this.createSdkClient()
        const serviceArnList = await sdkClient.listServices({cluster: cluster}).promise()
        if (!serviceArnList.serviceArns) {
            return []
        }
        const serviceResponse = await sdkClient.describeServices({services: serviceArnList.serviceArns, cluster: cluster}).promise()
        return serviceResponse.services ?? []
    }

    protected async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }
}
