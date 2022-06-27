/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { ApiGatewayNode } from '../apigateway/explorer/apiGatewayNodes'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { CloudFormationNode } from '../lambda/explorer/cloudFormationNodes'
import { CloudWatchLogsNode } from '../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { LambdaNode } from '../lambda/explorer/lambdaNodes'
import { S3Node } from '../s3/explorer/s3Nodes'
import { EcrNode } from '../ecr/explorer/ecrNode'
import { IotNode } from '../iot/explorer/iotNodes'
import { EcsNode } from '../ecs/explorer/ecsNode'
import { isCloud9 } from '../shared/extensionUtilities'
import { Region } from '../shared/regions/endpoints'
import { RegionProvider } from '../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { StepFunctionsNode } from '../stepFunctions/explorer/stepFunctionsNodes'
import { DEFAULT_PARTITION } from '../shared/regions/regionUtilities'
import { SsmDocumentNode } from '../ssmDocument/explorer/ssmDocumentNode'
import { ResourcesNode } from '../dynamicResources/explorer/nodes/resourcesNode'
import { AppRunnerNode } from '../apprunner/explorer/apprunnerNode'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import globals from '../shared/extensionGlobals'

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private region: Region
    private readonly childNodes: AWSTreeNodeBase[] = []

    public get regionName(): string {
        return this.region.name
    }

    public constructor(region: Region, regionProvider: RegionProvider) {
        super(region.name, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.region = region
        this.update(region)

        this.regionCode = this.regionCode ? this.regionCode : this.region.id
        //  Services that are candidates to add to the region explorer.
        //  `serviceId`s are checked against ~/resources/endpoints.json to see whether or not the service is available in the given region.
        //  If the service is available, we use the `createFn` to generate the node for the region.
        //  This interface exists so we can add additional nodes to the array (otherwise Typescript types the array to what's already in the array at creation)
        const partitionId = regionProvider.getPartitionId(this.regionCode) ?? DEFAULT_PARTITION
        const serviceCandidates = [
            { serviceId: 'apigateway', createFn: () => new ApiGatewayNode(partitionId, this.region.id) },
            {
                serviceId: 'apprunner',
                createFn: () =>
                    new AppRunnerNode(
                        this.region.id,
                        globals.toolkitClientBuilder.createAppRunnerClient(this.region.id)
                    ),
            },
            { serviceId: 'cloudformation', createFn: () => new CloudFormationNode(this.region.id) },
            { serviceId: 'logs', createFn: () => new CloudWatchLogsNode(this.region.id) },
            {
                serviceId: 'ecr',
                createFn: () => new EcrNode(globals.toolkitClientBuilder.createEcrClient(this.region.id)),
            },
            {
                serviceId: 'ecs',
                createFn: () => new EcsNode(globals.toolkitClientBuilder.createEcsClient(this.region.id)),
            },
            {
                serviceId: 'iot',
                createFn: () => new IotNode(globals.toolkitClientBuilder.createIotClient(this.region.id)),
            },
            { serviceId: 'lambda', createFn: () => new LambdaNode(this.region.id) },
            {
                serviceId: 's3',
                createFn: () => new S3Node(globals.toolkitClientBuilder.createS3Client(this.region.id)),
            },
            ...(isCloud9()
                ? []
                : [
                      {
                          serviceId: 'schemas',
                          createFn: () =>
                              new SchemasNode(globals.toolkitClientBuilder.createSchemaClient(this.region.id)),
                      },
                  ]),
            { serviceId: 'states', createFn: () => new StepFunctionsNode(this.region.id) },
            { serviceId: 'ssm', createFn: () => new SsmDocumentNode(this.region.id) },
        ]

        for (const serviceCandidate of serviceCandidates) {
            this.addChildNodeIfInRegion(serviceCandidate.serviceId, regionProvider, serviceCandidate.createFn)
        }
        this.childNodes.push(new ResourcesNode(this.regionCode))
    }

    private tryClearChildren(): void {
        this.childNodes.forEach(cn => {
            if ('clearChildren' in cn) {
                ;(cn as AWSTreeNodeBase & LoadMoreNode).clearChildren()
            }
        })
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        this.tryClearChildren()
        const nodes = this.childNodes
        return this.sortNodes(nodes)
    }

    private sortNodes(nodes: AWSTreeNodeBase[]) {
        return nodes.sort((a, b) => {
            // Always sort `ResourcesNode` at the bottom
            return a instanceof ResourcesNode
                ? 1
                : b instanceof ResourcesNode
                ? -1
                : (a.label ?? '').localeCompare(b.label ?? '')
        })
    }
    public update(region: Region): void {
        this.region = region
        this.label = this.regionName
        this.tooltip = `${this.regionName} [${this.region.id}]`
    }

    private addChildNodeIfInRegion(
        serviceId: string,
        regionProvider: RegionProvider,
        childNodeProducer: () => AWSTreeNodeBase
    ) {
        if (regionProvider.isServiceInRegion(serviceId, this.region.id)) {
            this.childNodes.push(childNodeProducer())
        }
    }
}
