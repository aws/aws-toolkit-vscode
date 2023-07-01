/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cluster, Container, Service } from '../../ecs/model'
import { DefaultEcsClient } from '../../shared/clients/ecsClient'
import { assertChildren, assertTreeItem } from '../shared/treeview/testUtil'
import { createCollectionFromPages } from '../../shared/utilities/collectionUtils'
import { stub } from '../utilities/stubber'

const clusterData = {
    clusterArn: 'arn:aws:ecs:us-east-1:012345678910:cluster/my-cluster',
    clusterName: 'my-cluster',
}

const serviceData = {
    serviceArn: 'arn:aws:ecs:us-east-1:012345678910:service/my-cluster/my-service',
    serviceName: 'my-service',
    taskDefinition: 'arn:aws:ecs:us-east-1:012345678910:task-definition/my-task:1',
}

const containerData = {
    name: 'my-container',
    clusterArn: clusterData.clusterArn,
    taskRoleArn: 'arn:aws:iam::012345678910:role/my-role',
}

const getClient = () => stub(DefaultEcsClient, { regionCode: 'us-east-1' })

describe('Container', function () {
    const serviceName = 'my-service'

    it('has a tree item', async function () {
        const container = new Container(getClient(), serviceName, containerData)

        await assertTreeItem(container, {
            label: containerData.name,
            contextValue: 'awsEcsContainerNodeExecDisabled',
        })
    })

    it('has a tree item when "enableExecuteCommand" is set', async function () {
        const container = new Container(getClient(), serviceName, { ...containerData, enableExecuteCommand: true })

        await assertTreeItem(container, {
            label: containerData.name,
            contextValue: 'awsEcsContainerNodeExecEnabled',
        })
    })
})

describe('Service', function () {
    it('has a tree item', async function () {
        const service = new Service(getClient(), serviceData)

        await assertTreeItem(service, {
            label: serviceData.serviceName,
            contextValue: 'awsEcsServiceNode.DISABLED',
        })
    })

    it('lists containers', async function () {
        const client = getClient()
        client.describeTaskDefinition.resolves({ taskDefinition: { containerDefinitions: [containerData] } })

        const cluster = new Service(client, serviceData)
        await assertChildren(cluster, containerData.name)
    })
})

describe('Cluster', function () {
    it('has a tree item', async function () {
        const cluster = new Cluster(getClient(), clusterData)

        await assertTreeItem(cluster, {
            label: clusterData.clusterName,
            tooltip: clusterData.clusterArn,
            contextValue: 'awsEcsClusterNode',
        })
    })

    it('lists services', async function () {
        const client = getClient()
        client.listServices.returns(createCollectionFromPages([serviceData]))

        const cluster = new Cluster(client, clusterData)
        await assertChildren(cluster, serviceData.serviceName)
    })
})
