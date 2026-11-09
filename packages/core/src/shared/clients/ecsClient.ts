/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Cluster,
    DescribeClustersCommand,
    DescribeServicesCommand,
    DescribeTaskDefinitionCommand,
    DescribeTaskDefinitionResponse,
    DescribeTasksCommand,
    DescribeTasksRequest,
    ECSClient,
    ExecuteCommandCommand,
    ExecuteCommandRequest,
    ExecuteCommandResponse,
    ListClustersCommand,
    ListClustersRequest,
    ListServicesCommand,
    ListServicesRequest,
    ListTasksCommand,
    ListTasksRequest,
    RegisterTaskDefinitionCommand,
    RegisterTaskDefinitionRequest,
    Service,
    Task,
    UpdateServiceCommand,
    UpdateServiceRequest,
} from '@aws-sdk/client-ecs'
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
        const sdkClient = this.createSdkClient()
        const clusterArnList = await sdkClient.send(
            new ListClustersCommand({ maxResults: maxResultsPerResponse, nextToken })
        )
        if (clusterArnList.clusterArns?.length === 0) {
            return { resource: [] }
        }
        const clusterResponse = await sdkClient.send(
            new DescribeClustersCommand({ clusters: clusterArnList.clusterArns })
        )
        const response: EcsResourceAndToken = {
            resource: clusterResponse.clusters!,
            nextToken: clusterArnList.nextToken,
        }
        return response
    }

    public listClusters(request: ListClustersRequest = {}): AsyncCollection<Cluster[]> {
        const client = this.createSdkClient()
        const requester = async (req: ListClustersRequest) => client.send(new ListClustersCommand(req))
        const collection = pageableToCollection(requester, request, 'nextToken', 'clusterArns')

        return collection.filter(isNonNullable).map(async (clusters) => {
            if (clusters.length === 0) {
                return []
            }

            const resp = await client.send(new DescribeClustersCommand({ clusters }))
            return resp.clusters!
        })
    }

    public async getServices(cluster: string, nextToken?: string): Promise<EcsResourceAndToken> {
        const sdkClient = this.createSdkClient()
        const serviceArnList = await sdkClient.send(
            new ListServicesCommand({ cluster: cluster, maxResults: maxResultsPerResponse, nextToken })
        )
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

    public listServices(request: ListServicesRequest = {}): AsyncCollection<Service[]> {
        const client = this.createSdkClient()
        const requester = async (req: ListServicesRequest) => client.send(new ListServicesCommand(req))
        const collection = pageableToCollection(requester, request, 'nextToken', 'serviceArns')

        return collection.filter(isNonNullable).map(async (services) => {
            if (services.length === 0) {
                return []
            }

            const resp = await client.send(new DescribeServicesCommand({ cluster: request.cluster, services }))
            return resp.services!
        })
    }

    public async describeTaskDefinition(taskDefinition: string): Promise<DescribeTaskDefinitionResponse> {
        const sdkClient = this.createSdkClient()
        return await sdkClient.send(new DescribeTaskDefinitionCommand({ taskDefinition }))
    }

    public async listTasks(args: ListTasksRequest): Promise<string[]> {
        const sdkClient = this.createSdkClient()
        const listTasksResponse = await sdkClient.send(new ListTasksCommand(args))
        return listTasksResponse.taskArns ?? []
    }

    public async updateService(request: UpdateServiceRequest): Promise<void> {
        const sdkClient = this.createSdkClient()
        await sdkClient.send(new UpdateServiceCommand(request))
    }

    public async describeTasks(cluster: string, tasks: string[]): Promise<Task[]> {
        const sdkClient = this.createSdkClient()

        const params: DescribeTasksRequest = { cluster, tasks }
        const describedTasks = await sdkClient.send(new DescribeTasksCommand(params))
        return describedTasks.tasks ?? []
    }

    public async describeServices(cluster: string, services: string[]): Promise<Service[]> {
        const sdkClient = this.createSdkClient()
        return (await sdkClient.send(new DescribeServicesCommand({ cluster, services }))).services ?? []
    }

    protected createSdkClient(): ECSClient {
        return globals.sdkClientBuilderV3.createAwsService({
            serviceClient: ECSClient,
            clientOptions: { region: this.regionCode },
        })
    }

    public async executeCommand(request: Omit<ExecuteCommandRequest, 'interactive'>): Promise<ExecuteCommandResponse> {
        const sdkClient = this.createSdkClient()

        // Currently the 'interactive' flag is required and needs to be true for ExecuteCommand: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ExecuteCommand.html
        // This may change 'in the near future' as explained here: https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/
        return await sdkClient.send(new ExecuteCommandCommand({ ...request, interactive: true }))
    }

    public async registerTaskDefinition(request: RegisterTaskDefinitionRequest) {
        const sdkClient = this.createSdkClient()
        return sdkClient.send(new RegisterTaskDefinitionCommand(request))
    }
}
