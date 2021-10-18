/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type EcsClient = ClassToInterfaceType<DefaultEcsClient>

export type EcsResourceAndToken = {
    resource: ECS.Cluster[] | ECS.Service[]
    nextToken?: string
}

const MAX_RESULTS_PER_RESPONSE = 100
export class DefaultEcsClient {
    public constructor(public readonly regionCode: string) {}

    public async getClusters(nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = await this.createSdkClient()
        const clusterArnList = await sdkClient
            .listClusters({ maxResults: MAX_RESULTS_PER_RESPONSE, nextToken })
            .promise()
        if (clusterArnList.clusterArns?.length === 0) {
            return { resource: [] }
        }
        try {
            const clusterResponse = await sdkClient.describeClusters({ clusters: clusterArnList.clusterArns }).promise()
            const response: EcsResourceAndToken = {
                resource: clusterResponse.clusters!,
                nextToken: clusterArnList.nextToken,
            }
            return response
        } catch (error) {
            getLogger().error('ecs: Failed to list clusters: %s', error)
            throw error
        }
    }

    public async getServices(cluster: string, nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = await this.createSdkClient()
        const serviceArnList = await sdkClient
            .listServices({ cluster: cluster, maxResults: MAX_RESULTS_PER_RESPONSE, nextToken })
            .promise()
        if (serviceArnList.serviceArns?.length === 0) {
            return { resource: [] }
        }
        try {
            const services = await this.describeServices(cluster, serviceArnList.serviceArns!)
            const response: EcsResourceAndToken = {
                resource: services,
                nextToken: serviceArnList.nextToken,
            }
            return response
        } catch (error) {
            getLogger().error('ecs: Failed to list services for cluster %s: %O', cluster, error)
            throw error
        }
    }

    public async getContainerNames(taskDefinition: string): Promise<string[]> {
        const sdkClient = await this.createSdkClient()
        try {
            const describeTaskDefinitionResponse = await sdkClient.describeTaskDefinition({ taskDefinition }).promise()
            const containerNames = describeTaskDefinitionResponse.taskDefinition?.containerDefinitions?.map(cd => {
                return cd.name ?? ''
            })
            return containerNames ?? []
        } catch (error) {
            getLogger().error('ecs: Failed to list containers for task definition %s: %O', taskDefinition, error)
            throw error
        }
    }

    public async listTasks(cluster: string, serviceName: string): Promise<string[]> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.ListTasksRequest = { cluster: cluster, serviceName: serviceName }
        try {
            const listTasksResponse = await sdkClient.listTasks(params).promise()
            return listTasksResponse.taskArns ?? []
        } catch (error) {
            getLogger().error(
                `ecs: Failed to get tasks for Cluster "${cluster}" and Service "${serviceName}": ${error}`
            )
            throw error
        }
    }

    public async updateService(cluster: string, serviceName: string, enable: boolean): Promise<void> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.UpdateServiceRequest = {
            cluster,
            service: serviceName,
            enableExecuteCommand: enable,
            forceNewDeployment: true,
        }
        try {
            await sdkClient.updateService(params).promise()
        } catch (error) {
            getLogger().error(`ecs: Failed to update service: ${error} `)
            throw error
        }
    }

    public async describeTasks(cluster: string, tasks: string[]): Promise<ECS.Task[]> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.DescribeTasksRequest = { cluster, tasks }
        try {
            const describedTasks = await sdkClient.describeTasks(params).promise()
            return describedTasks.tasks ?? []
        } catch (error) {
            getLogger().error(error as Error)
            throw error
        }
    }

    public async describeServices(cluster: string, services: string[]): Promise<ECS.Service[]> {
        const sdkClient = await this.createSdkClient()
        return (await sdkClient.describeServices({ cluster, services }).promise()).services ?? []
    }

    protected async createSdkClient(): Promise<ECS> {
        return await ext.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }
}
