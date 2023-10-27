/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    Cluster,
    DescribeTaskDefinitionCommandOutput,
    DescribeTasksCommandInput,
    ECS,
    ExecuteCommandCommandInput,
    ExecuteCommandCommandOutput,
    ListClustersCommandInput,
    ListServicesCommandInput,
    ListTasksCommandInput,
    RegisterTaskDefinitionCommandInput,
    Service,
    Task,
    UpdateServiceCommandInput,
} from "@aws-sdk/client-ecs";

import globals from '../extensionGlobals'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType, isNonNullable } from '../utilities/tsUtils'

export type EcsClient = ClassToInterfaceType<DefaultEcsClient>

export type EcsResourceAndToken = {
    resource: Cluster[] | Service[]
    nextToken?: string
}

const maxResultsPerResponse = 10
export class DefaultEcsClient {
    public constructor(public readonly regionCode: string) {}

    public async getClusters(nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = await this.createSdkClient()
        const clusterArnList = await sdkClient.listClusters({ maxResults: maxResultsPerResponse, nextToken }).promise()
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

    public listClusters(request: ListClustersCommandInput = {}): AsyncCollection<Cluster[]> {
        const client = this.createSdkClient()
        const requester = async (req: ListClustersCommandInput) => (await client).listClusters(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'clusterArns')

        return collection.filter(isNonNullable).map(async clusters => {
            if (clusters.length === 0) {
                return []
            }

            const resp = await (await client).describeClusters({ clusters }).promise()
            return resp.clusters!
        })
    }

    public async getServices(cluster: string, nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = await this.createSdkClient()
        const serviceArnList = await sdkClient
            .listServices({ cluster: cluster, maxResults: maxResultsPerResponse, nextToken })
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

    public listServices(request: ListServicesCommandInput = {}): AsyncCollection<Service[]> {
        const client = this.createSdkClient()
        const requester = async (req: ListServicesCommandInput) => (await client).listServices(req).promise()
        const collection = pageableToCollection(requester, request, 'nextToken', 'serviceArns')

        return collection.filter(isNonNullable).map(async services => {
            if (services.length === 0) {
                return []
            }

            const resp = await (await client).describeServices({ cluster: request.cluster, services }).promise()
            return resp.services!
        })
    }

    public async describeTaskDefinition(taskDefinition: string): Promise<DescribeTaskDefinitionCommandOutput> {
        const sdkClient = await this.createSdkClient()
        return await sdkClient.describeTaskDefinition({ taskDefinition }).promise()
    }

    public async listTasks(args: ListTasksCommandInput): Promise<string[]> {
        const sdkClient = await this.createSdkClient()
        const listTasksResponse = await sdkClient.listTasks(args).promise()
        return listTasksResponse.taskArns ?? []
    }

    public async updateService(request: UpdateServiceCommandInput): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.updateService(request).promise()
    }

    public async describeTasks(cluster: string, tasks: string[]): Promise<Task[]> {
        const sdkClient = await this.createSdkClient()

        const params: DescribeTasksCommandInput = { cluster, tasks }
        const describedTasks = await sdkClient.describeTasks(params).promise()
        return describedTasks.tasks ?? []
    }

    public async describeServices(cluster: string, services: string[]): Promise<Service[]> {
        const sdkClient = await this.createSdkClient()
        return (await sdkClient.describeServices({ cluster, services }).promise()).services ?? []
    }

    protected async createSdkClient(): Promise<ECS> {
        return await globals.sdkClientBuilder.createAwsService(ECS, undefined, this.regionCode)
    }

    public async executeCommand(
        request: Omit<ExecuteCommandCommandInput, 'interactive'>
    ): Promise<ExecuteCommandCommandOutput> {
        const sdkClient = await this.createSdkClient()

        // Currently the 'interactive' flag is required and needs to be true for ExecuteCommand: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ExecuteCommand.html
        // This may change 'in the near future' as explained here: https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/
        return await sdkClient.executeCommand({ ...request, interactive: true }).promise()
    }

    public async registerTaskDefinition(request: RegisterTaskDefinitionCommandInput) {
        const sdkClient = await this.createSdkClient()
        return sdkClient.registerTaskDefinition(request).promise()
    }
}
