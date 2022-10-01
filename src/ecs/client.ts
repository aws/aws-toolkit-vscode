/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { defineClient } from '../shared/clientBuilder'
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { isNonNullable } from '../shared/utilities/tsUtils'

export class EcsClient extends defineClient(ECS) {
    public constructor(public readonly regionCode: string) {
        super({ region: regionCode })
    }

    public listAndDescribeClusters(request: ECS.ListClustersRequest = {}): AsyncCollection<ECS.Cluster[]> {
        const collection = this.listClusters.paginate('nextToken', request)

        return collection
            .map(resp => resp.clusterArns)
            .filter(isNonNullable)
            .map(async clusters => {
                if (clusters.length === 0) {
                    return []
                }

                const resp = await this.describeClusters({ clusters })
                return resp.clusters!
            })
    }

    public listAndDescribeServices(request: ECS.ListServicesRequest = {}): AsyncCollection<ECS.Service[]> {
        const collection = this.listServices.paginate('nextToken', request)

        return collection
            .map(resp => resp.serviceArns)
            .filter(isNonNullable)
            .map(async services => {
                if (services.length === 0) {
                    return []
                }

                const resp = await this.describeServices({ cluster: request.cluster, services })
                return resp.services!
            })
    }

    public listAndDescribeTasks(request: ECS.ListTasksRequest = {}): AsyncCollection<ECS.Task[]> {
        const collection = this.listTasks.paginate('nextToken', request)

        return collection
            .map(resp => resp.taskArns)
            .filter(isNonNullable)
            .map(async tasks => {
                if (tasks.length === 0) {
                    return []
                }

                const resp = await this.describeTasks({ cluster: request.cluster, tasks })
                return resp.tasks!
            })
    }

    public executeInteractiveCommand(request: Omit<ECS.ExecuteCommandRequest, 'interactive'>) {
        // Currently the 'interactive' flag is required and needs to be true for ExecuteCommand: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ExecuteCommand.html
        // This may change 'in the near future' as explained here: https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/
        return this.executeCommand({ ...request, interactive: true })
    }
}
