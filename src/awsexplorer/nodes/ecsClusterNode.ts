/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { convertArnToResourceName } from '../explorerUtils'
import { DefaultEcsClusterServicesNode } from './ecsClusterServicesNode'
import { EcsClusterNode, EcsClusterServicesNode, EcsClustersNode } from './ecsNodeInterfaces'

export class DefaultEcsClusterNode extends AWSTreeErrorHandlerNode implements EcsClusterNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    private readonly servicesNode: EcsClusterServicesNode

    public constructor(
        public readonly parent: EcsClustersNode,
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        this.servicesNode = new DefaultEcsClusterServicesNode(this, this.getExtensionAbsolutePath)
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsCluster.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsCluster.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.tooltip = arn
        this.label = convertArnToResourceName(arn)
    }

    public async getChildren() {
        return [this.servicesNode]
    }
}
