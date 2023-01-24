/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as moment from 'moment'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { IotClient, IotCertificate } from '../../shared/clients/iotClient'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotThingNode } from './iotThingNode'
import { IotPolicyCertNode } from './iotPolicyNode'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { Commands } from '../../shared/vscode/commands'
import { getIcon } from '../../shared/icons'

const contextBase = 'awsIotCertificateNode'
/**
 * Represents an IoT Certificate that may have either a Thing Node or the
 * Certificate Folder Node as a parent.
 */
export abstract class IotCertificateNode extends AWSTreeNodeBase implements AWSResourceNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotCertsFolderNode | IotThingNode,
        public readonly iot: IotClient,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly things?: string[],
        protected readonly workspace = Workspace.vscode()
    ) {
        //Show only 8 characters in the explorer instead of the full 64. The entire
        //ID can be copied from the context menu or viewed when hovered over.
        super(certificate.id.substring(0, 8).concat('...'), collapsibleState)
        this.tooltip = localize(
            'AWS.explorerNode.iot.certTooltip',
            '{0}\nStatus: {1}\nCreated: {2}{3}',
            this.certificate.id,
            this.certificate.activeStatus,
            moment(this.certificate.creationDate).format(LOCALIZED_DATE_FORMAT),
            things?.length ?? 0 > 0 ? `\nAttached to: ${things!.join(', ')}` : ''
        )
        this.iconPath = getIcon('aws-iot-certificate')
        this.description = `\t[${this.certificate.activeStatus}]`
        this.contextValue = `${contextBase}.${this.certificate.activeStatus}`
    }

    public update(): void {
        return undefined
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noPolicy', '[No Policies found]')),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<IotPolicyCertNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listPrincipalPolicies({
            principal: this.certificate.arn,
            marker: continuationToken,
            pageSize: this.getMaxItemsPerPage(),
        })

        const newPolicies =
            response.policies
                ?.filter(policy => policy.policyArn && policy.policyName)
                .map(
                    policy =>
                        new IotPolicyCertNode({ arn: policy.policyArn!, name: policy.policyName! }, this, this.iot)
                ) ?? []

        getLogger().debug(`Loaded policies: %O`, newPolicies)
        return {
            newContinuationToken: response.nextMarker ?? undefined,
            newChildren: [...newPolicies],
        }
    }

    public async refreshNode(commands: Commands): Promise<void> {
        this.clearChildren()
        return commands.execute('aws.refreshAwsExplorerNode', this)
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('iot.maxItemsPerPage')
    }

    public get arn(): string {
        return this.certificate.arn
    }

    public get name(): string {
        return this.certificate.id
    }

    public [inspect.custom](): string {
        return `IotCertificateNode (certificate=${this.certificate.id})`
    }
}

export class IotThingCertNode extends IotCertificateNode {
    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotThingNode,
        public readonly iot: IotClient,
        public readonly things?: string[],
        protected readonly workspace = Workspace.vscode()
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, things, workspace)
        this.contextValue = `${contextBase}.Things.${this.certificate.activeStatus}`
    }
}

/**
 * Represents an IoT Certificate with the Certificate Folder Node as parent.
 */
export class IotCertWithPoliciesNode extends IotCertificateNode implements LoadMoreNode {
    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotCertsFolderNode,
        public readonly iot: IotClient,
        public readonly things?: string[],
        protected readonly workspace = Workspace.vscode()
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, things, workspace)
        this.contextValue = `${contextBase}.Policies.${this.certificate.activeStatus}`
    }
}
