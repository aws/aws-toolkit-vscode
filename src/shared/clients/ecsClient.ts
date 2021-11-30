/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import globals from '../extensionGlobals'
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
        const clusterResponse = await sdkClient.describeClusters({ clusters: clusterArnList.clusterArns }).promise()
        const response: EcsResourceAndToken = {
            resource: clusterResponse.clusters!,
            nextToken: clusterArnList.nextToken,
        }
        return response
    }

    public async getServices(cluster: string, nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = await this.createSdkClient()
        const serviceArnList = await sdkClient
            .listServices({ cluster: cluster, maxResults: MAX_RESULTS_PER_RESPONSE, nextToken })
            .promise()
        if (serviceArnList.serviceArns?.length === 0) {
            return { resource: [] }
        }
        const services = await this.describeServices(cluster, serviceArnList.serviceArns!)
        const response: EcsResourceAndToken = {
            resource: services,
            nextToken: serviceArnList.nextToken,
        }
        return response
    }

    public async getContainerNames(taskDefinition: string): Promise<string[]> {
        const sdkClient = await this.createSdkClient()
        const describeTaskDefinitionResponse = await sdkClient.describeTaskDefinition({ taskDefinition }).promise()
        const containerNames = describeTaskDefinitionResponse.taskDefinition?.containerDefinitions?.map(cd => {
            return cd.name ?? ''
        })
        return containerNames ?? []
    }

    public async listTasks(cluster: string, serviceName: string): Promise<string[]> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.ListTasksRequest = { cluster: cluster, serviceName: serviceName }
        const listTasksResponse = await sdkClient.listTasks(params).promise()
        return listTasksResponse.taskArns ?? []
    }

    public async updateService(cluster: string, serviceName: string, enable: boolean): Promise<void> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.UpdateServiceRequest = {
            cluster,
            service: serviceName,
            enableExecuteCommand: enable,
            forceNewDeployment: true,
        }
        await sdkClient.updateService(params).promise()
    }

    public async describeTasks(cluster: string, tasks: string[]): Promise<ECS.Task[]> {
        const sdkClient = await this.createSdkClient()

        const params: ECS.DescribeTasksRequest = { cluster, tasks }
        const describedTasks = await sdkClient.describeTasks(params).promise()
        return describedTasks.tasks ?? []
    }

    public async describeServices(cluster: string, services: string[]): Promise<ECS.Service[]> {
        const sdkClient = await this.createSdkClient()
        return (await sdkClient.describeServices({ cluster, services }).promise()).services ?? []
    }

    protected async createSdkClient(): Promise<ECS> {
        return await globals.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }

    public async executeCommand(
        cluster: string,
        container: string,
        task: string,
        command: string
    ): Promise<ECS.ExecuteCommandResponse> {
        const sdkClient = await this.createSdkClient()

        // Currently the 'interactive' flag is required and needs to be true for ExecuteCommand: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ExecuteCommand.html
        // This may change 'in the near future' as explained here: https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/
        const params: ECS.ExecuteCommandRequest = {
            command: command,
            interactive: true,
            task: task,
            cluster: cluster,
            container: container,
        }

        return await sdkClient.executeCommand(params).promise()
    }
}
