/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { CloudFormationNode } from '../lambda/explorer/cloudFormationNodes'
import { CloudWatchLogsNode } from '../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { LambdaNode } from '../lambda/explorer/lambdaNodes'
import { ActiveFeatureKeys, FeatureToggle } from '../shared/featureToggle'
import { Region } from '../shared/regions/endpoints'
import { RegionProvider } from '../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { StepFunctionsNode } from '../stepFunctions/explorer/stepFunctionsNodes'

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private region: Region
    private readonly childNodes: AWSTreeNodeBase[] = []

    public get regionCode(): string {
        return this.region.id
    }

    public get regionName(): string {
        return this.region.name
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
        const serviceCandidates = [
            { serviceId: 'cloudformation', createFn: () => new CloudFormationNode(this.regionCode) },
            // Feature Toggle for CloudWatch Logs
            // REMOVE_WHEN_CLOUDWATCH_LOGS_READY
            ...(FeatureToggle.getFeatureToggle().isFeatureActive(ActiveFeatureKeys.CloudWatchLogs)
                ? [{ serviceId: 'logs', createFn: () => new CloudWatchLogsNode(this.regionCode) }]
                : []),
            { serviceId: 'lambda', createFn: () => new LambdaNode(this.regionCode) },
            { serviceId: 'schemas', createFn: () => new SchemasNode(this.regionCode) },
            { serviceId: 'states', createFn: () => new StepFunctionsNode(this.regionCode) },
        ]

        for (const serviceCandidate of serviceCandidates) {
            this.addChildNodeIfInRegion(serviceCandidate.serviceId, regionProvider, serviceCandidate.createFn)
        }
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return this.childNodes
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
}
