/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { IotThing, IotClient } from '../../shared/clients/iotClient'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotThingFolderNode } from './iotThingFolderNode'
import { IotThingCertNode } from './iotCertificateNode'
import { Commands } from '../../shared/vscode/commands'
import globals from '../../shared/extensionGlobals'

/**
 * Represents an IoT Thing that may have attached certificates.
 */
export class IotThingNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly thing: IotThing,
        public readonly parent: IotThingFolderNode,
        public readonly iot: IotClient,
        private readonly workspace = Workspace.vscode()
    ) {
        super(thing.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = thing.name
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.thing),
            light: vscode.Uri.file(globals.iconPaths.light.thing),
        }
        this.contextValue = 'awsIotThingNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noCerts', '[No Certificates found]')),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<IotThingCertNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listThingCertificates({
            thingName: this.thing.name,
            nextToken: continuationToken,
            maxResults: this.getMaxItemsPerPage(),
        })

        const newCerts =
            response.certificates
                ?.filter(cert => cert.certificateArn && cert.certificateId && cert.status && cert.creationDate)
                .map(
                    cert =>
                        new IotThingCertNode(
                            {
                                arn: cert.certificateArn!,
                                id: cert.certificateId!,
                                activeStatus: cert.status!,
                                creationDate: cert.creationDate!,
                            },
                            this,
                            this.iot
                        )
                ) ?? []

        getLogger().debug(`Loaded certificates: %O`, newCerts)
        return {
            newContinuationToken: response.nextToken ?? undefined,
            newChildren: [...newCerts],
        }
    }

    public get arn(): string {
        return this.thing.arn
    }

    public get name(): string {
        return this.thing.name
    }

    public async refreshNode(commands: Commands): Promise<void> {
        this.clearChildren()
        return commands.execute('aws.refreshAwsExplorerNode', this)
    }

    public [inspect.custom](): string {
        return `IotThingNode (thing=${this.thing.name})`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('iot.maxItemsPerPage')
    }
}
