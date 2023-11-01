/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotClient } from '../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { IotThingNode } from './iotThingNode'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotNode } from './iotNodes'
import { Settings } from '../../shared/settings'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

/**
 * Represents the group of all IoT Things.
 */
export class IotThingFolderNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly iot: IotClient,
        public readonly parent: IotNode,
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super('Things', vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = 'IoT Things'
        this.contextValue = 'awsIotThingsNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noThings', '[No Things found]')),
        })
    }

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<IotThingNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listThings({
            nextToken: continuationToken,
            maxResults: this.getMaxItemsPerPage(),
        })

        let newThings: IotThingNode[] = []
        if (response.things) {
            newThings = response.things
                .filter(thing => thing.thingName && thing.thingArn)
                .map(thing => new IotThingNode({ name: thing.thingName!, arn: thing.thingArn! }, this, this.iot))
        }

        getLogger().debug(`Loaded things: %O`, newThings)
        return {
            newContinuationToken: response.nextToken ?? undefined,
            newChildren: [...newThings],
        }
    }

    public async refreshNode(): Promise<void> {
        this.clearChildren()
        return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }

    public [inspect.custom](): string {
        return `IotThings`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.settings.getSection('aws').get<number>('iot.maxItemsPerPage')
    }
}
