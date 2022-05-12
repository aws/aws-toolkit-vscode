/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, workspace } from 'vscode'
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
import { ConsolasNode } from '../vector/consolas/explorer/consolasNode'
import globals from '../shared/extensionGlobals'
import { ConsolasConstants } from '../vector/consolas/models/constants'

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private region: Region
    private consolasNode: ConsolasNode
    private readonly childNodes: AWSTreeNodeBase[] = []

    public get regionCode(): string {
        return this.region.id
    }
    public get regionName(): string {
        return this.region.name
    }

    public get isConsolasNodeExistInChildNodes(): boolean {
        for (const node of this.childNodes) {
            if (node instanceof ConsolasNode) {
                return true
            }
        }
        return false
    }

    public constructor(region: Region, regionProvider: RegionProvider) {
        super(region.name, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.region = region
        this.update(region)

        //  Services that are candidates to add to the region explorer.
        //  `serviceId`s are checked against ~/resources/endpoints.json to see whether or not the service is available in the given region.
        //  If the service is available, we use the `createFn` to generate the node for the region.
        //  This interface exists so we can add additional nodes to the array (otherwise Typescript types the array to what's already in the array at creation)
        const partitionId = regionProvider.getPartitionId(this.regionCode) ?? DEFAULT_PARTITION
        const serviceCandidates = [
            { serviceId: 'apigateway', createFn: () => new ApiGatewayNode(partitionId, this.regionCode) },
            {
                serviceId: 'apprunner',
                createFn: () =>
                    new AppRunnerNode(
                        this.regionCode,
                        globals.toolkitClientBuilder.createAppRunnerClient(this.regionCode)
                    ),
            },
            { serviceId: 'cloudformation', createFn: () => new CloudFormationNode(this.regionCode) },
            { serviceId: 'logs', createFn: () => new CloudWatchLogsNode(this.regionCode) },
            {
                serviceId: 'ecr',
                createFn: () => new EcrNode(globals.toolkitClientBuilder.createEcrClient(this.regionCode)),
            },
            {
                serviceId: 'ecs',
                createFn: () => new EcsNode(globals.toolkitClientBuilder.createEcsClient(this.regionCode)),
            },
            {
                serviceId: 'iot',
                createFn: () => new IotNode(globals.toolkitClientBuilder.createIotClient(this.regionCode)),
            },
            { serviceId: 'lambda', createFn: () => new LambdaNode(this.regionCode) },
            {
                serviceId: 's3',
                createFn: () => new S3Node(globals.toolkitClientBuilder.createS3Client(this.regionCode)),
            },
            ...(isCloud9() ? [] : [{ serviceId: 'schemas', createFn: () => new SchemasNode(this.regionCode) }]),
            { serviceId: 'states', createFn: () => new StepFunctionsNode(this.regionCode) },
            { serviceId: 'ssm', createFn: () => new SsmDocumentNode(this.regionCode) },
        ]

        for (const serviceCandidate of serviceCandidates) {
            this.addChildNodeIfInRegion(serviceCandidate.serviceId, regionProvider, serviceCandidate.createFn)
        }
        this.childNodes.push(new ResourcesNode(this.regionCode))
        this.consolasNode = new ConsolasNode()
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
        let nodes = this.childNodes
        if (this.shouldShowConsolas()) {
            nodes = [...this.childNodes, this.consolasNode]
        }
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
        this.tooltip = `${this.regionName} [${this.regionCode}]`
    }

    private addChildNodeIfInRegion(
        serviceId: string,
        regionProvider: RegionProvider,
        childNodeProducer: () => AWSTreeNodeBase
    ) {
        if (regionProvider.isServiceInRegion(serviceId, this.regionCode)) {
            this.childNodes.push(childNodeProducer())
        }
    }

    private shouldShowConsolas(): boolean {
        return workspace.getConfiguration('aws.experiments').get(ConsolasConstants.CONSOLAS_PREVIEW) || false
    }
}
