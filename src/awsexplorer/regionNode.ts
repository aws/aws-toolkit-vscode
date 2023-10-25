/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { EmrServerlessNode } from '../emr-serverless/explorer/emrServerlessNode'
import { RedshiftNode } from '../redshift/explorer/redshiftNode'
import { IotNode } from '../iot/explorer/iotNodes'
import { Region } from '../shared/regions/endpoints'
import { defaultPartition, RegionProvider } from '../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { StepFunctionsNode } from '../stepFunctions/explorer/stepFunctionsNodes'
import { SsmDocumentNode } from '../ssmDocument/explorer/ssmDocumentNode'
import { ResourcesNode } from '../dynamicResources/explorer/nodes/resourcesNode'
import { AppRunnerNode } from '../apprunner/explorer/apprunnerNode'
import { DefaultAppRunnerClient } from '../shared/clients/apprunnerClient'
import { DefaultEcrClient } from '../shared/clients/ecrClient'
import { EmrServerlessClient } from '../shared/clients/emrServerlessClient'
import { DefaultRedshiftClient } from '../shared/clients/redshiftClient'
import { DefaultIotClient } from '../shared/clients/iotClient'
import { DefaultS3Client } from '../shared/clients/s3Client'
import { DefaultSchemaClient } from '../shared/clients/schemaClient'
import { getEcsRootNode } from '../ecs/model'
import { compareTreeItems, TreeShim } from '../shared/treeview/utils'
import { Ec2ParentNode } from '../ec2/explorer/ec2ParentNode'
import { DevSettings } from '../shared/settings'
import { Ec2Client } from '../shared/clients/ec2Client'
import { isCloud9 } from '../shared/extensionUtilities'

interface ServiceNode {
    allRegions?: boolean
    serviceId: string
    /**
     * Decides if the node should be shown. Example:
     * ```
     * when: () => DevSettings.instance.isDevMode()
     * ```
     */
    when?: () => boolean
    createFn: (regionCode: string, partitionId: string) => any
}

const serviceCandidates: ServiceNode[] = [
    {
        serviceId: 'apigateway',
        createFn: (regionCode: string, partitionId: string) => new ApiGatewayNode(partitionId, regionCode),
    },
    {
        serviceId: 'apprunner',
        createFn: (regionCode: string) => new AppRunnerNode(regionCode, new DefaultAppRunnerClient(regionCode)),
    },
    {
        serviceId: 'cloudformation',
        createFn: (regionCode: string) => new CloudFormationNode(regionCode),
    },
    {
        serviceId: 'logs',
        createFn: (regionCode: string) => new CloudWatchLogsNode(regionCode),
    },
    {
        serviceId: 'ec2',
        when: () => DevSettings.instance.isDevMode(),
        createFn: (regionCode: string, partitionId: string) =>
            new Ec2ParentNode(regionCode, partitionId, new Ec2Client(regionCode)),
    },
    {
        serviceId: 'ecr',
        createFn: (regionCode: string) => new EcrNode(new DefaultEcrClient(regionCode)),
    },
    {
        when: () => !isCloud9(),
        serviceId: 'redshift',
        createFn: (regionCode: string) => new RedshiftNode(new DefaultRedshiftClient(regionCode)),
    },
    {
        serviceId: 'ecs',
        createFn: (regionCode: string) => new TreeShim(getEcsRootNode(regionCode)),
    },
    {
        serviceId: 'emr-serverless',
        createFn: (regionCode: string) => new EmrServerlessNode(new EmrServerlessClient(regionCode)),
    },
    {
        serviceId: 'iot',
        createFn: (regionCode: string) => new IotNode(new DefaultIotClient(regionCode)),
    },
    {
        serviceId: 'lambda',
        createFn: (regionCode: string) => new LambdaNode(regionCode),
    },
    {
        serviceId: 's3',
        createFn: (regionCode: string) => new S3Node(new DefaultS3Client(regionCode)),
    },
    {
        serviceId: 'schemas',
        createFn: (regionCode: string) => new SchemasNode(new DefaultSchemaClient(regionCode)),
    },
    {
        serviceId: 'states',
        createFn: (regionCode: string) => new StepFunctionsNode(regionCode),
    },
    {
        serviceId: 'ssm',
        createFn: (regionCode: string) => new SsmDocumentNode(regionCode),
    },
    {
        allRegions: true,
        serviceId: 'cloudcontrol',
        createFn: (regionCode: string) => new ResourcesNode(regionCode),
    },
]

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private region: Region
    public override readonly regionCode: string

    public get regionName(): string {
        return this.region.name
    }

    public constructor(region: Region, private readonly regionProvider: RegionProvider) {
        super(region.name, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.region = region
        this.regionCode = region.id
        this.update(region)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        //  Services that are candidates to add to the region explorer.
        //  `serviceId`s are checked against ~/resources/endpoints.json to see whether or not the service is available in the given region.
        //  If the service is available, we use the `createFn` to generate the node for the region.
        //  This interface exists so we can add additional nodes to the array (otherwise Typescript types the array to what's already in the array at creation)
        const partitionId = this.regionProvider.getPartitionId(this.regionCode) ?? defaultPartition
        const childNodes: AWSTreeNodeBase[] = []
        for (const service of serviceCandidates) {
            if (service.when !== undefined && !service.when()) {
                continue
            }
            if (service.allRegions || this.regionProvider.isServiceInRegion(service.serviceId, this.regionCode)) {
                const node = service.createFn(this.regionCode, partitionId)
                if (node !== undefined) {
                    node.serviceId = service.serviceId
                    childNodes.push(node)
                }
            }
        }

        return this.sortNodes(childNodes)
    }

    private sortNodes(nodes: AWSTreeNodeBase[]) {
        return nodes.sort((a, b) => {
            // Always sort `ResourcesNode` at the bottom
            return a instanceof ResourcesNode ? 1 : b instanceof ResourcesNode ? -1 : compareTreeItems(a, b)
        })
    }
    public update(region: Region): void {
        this.region = region
        this.label = this.regionName
        this.tooltip = `${this.regionName} [${this.regionCode}]`
    }
}
