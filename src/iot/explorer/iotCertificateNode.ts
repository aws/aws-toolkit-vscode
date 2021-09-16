/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as moment from 'moment'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { IotClient, IotCertificate, DefaultIotPolicy } from '../../shared/clients/iotClient'
import { ext } from '../../shared/extensionGlobals'
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
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotThingNode } from './iotThingNode'
import { IotPolicyNode } from './iotPolicyNode'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'

const CONTEXT_BASE = 'awsIotCertificateNode'
/**
 * Represents an IoT Certificate that may have either a Thing Node or the
 * Certificate Folder Node as a parent.
 */
export abstract class IotCertificateNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotCertsFolderNode | IotThingNode,
        public readonly iot: IotClient,
        collapsibleState: vscode.TreeItemCollapsibleState,
        protected readonly workspace = Workspace.vscode()
    ) {
        //Show only 8 characters in the explorer instead of the full 64. The entire
        //ID can be copied from the context menu or viewed when hovered over.
        super(certificate.id.substring(0, 8).concat('...'), collapsibleState)
        this.tooltip = localize(
            'AWS.explorerNode.iot.certTooltip',
            '{0}\nStatus: {1}\nCreated: {2}',
            this.certificate.id,
            this.certificate.activeStatus,
            moment(this.certificate.creationDate).format(LOCALIZED_DATE_FORMAT)
        )
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.certificate),
            light: vscode.Uri.file(ext.iconPaths.light.certificate),
        }
        this.description = `\t[${this.certificate.activeStatus}]`
        this.contextValue = `${CONTEXT_BASE}.${this.certificate.activeStatus}`
    }

    public update(): void {
        return undefined
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
        protected readonly workspace = Workspace.vscode()
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.None, workspace)
        this.contextValue = `${CONTEXT_BASE}.Things.${this.certificate.activeStatus}`
    }
}

/**
 * Represents an IoT Certificate with the Certificate Folder Node as parent.
 */
export class IotCertWithPoliciesNode extends IotCertificateNode implements LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotCertsFolderNode,
        public readonly iot: IotClient,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, workspace)
        this.contextValue = `${CONTEXT_BASE}.Policies.${this.certificate.activeStatus}`
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage> {
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
                        new IotPolicyNode(
                            new DefaultIotPolicy({ arn: policy.policyArn!, name: policy.policyName! }),
                            this,
                            this.iot
                        )
                ) ?? []

        getLogger().debug(`Loaded policies: %O`, newPolicies)
        return {
            newContinuationToken: response.nextMarker ?? undefined,
            newChildren: [...newPolicies],
        }
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('iot.maxItemsPerPage')
    }
}
