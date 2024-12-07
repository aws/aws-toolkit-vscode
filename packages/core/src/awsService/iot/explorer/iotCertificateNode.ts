/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { IotClient, IotCertificate } from '../../../shared/clients/iotClient'

import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../../awsexplorer/childNodeLoader'
import { inspect } from 'util'
import { getLogger } from '../../../shared/logger'
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotThingNode } from './iotThingNode'
import { IotPolicyCertNode } from './iotPolicyNode'
import { getIcon } from '../../../shared/icons'
import { truncate } from '../../../shared/utilities/textUtilities'
import { Settings } from '../../../shared/settings'
import { ClassToInterfaceType } from '../../../shared/utilities/tsUtils'
import { formatLocalized } from '../../../shared/datetime'

const contextBase = 'awsIotCertificateNode'
/**
 * Represents an IoT Certificate that may have either a Thing Node or the
 * Certificate Folder Node as a parent.
 */
export abstract class IotCertificateNode extends AWSTreeNodeBase implements AWSResourceNode {
    private readonly childLoader = new ChildNodeLoader(this, (token) => this.loadPage(token))

    public constructor(
        public readonly certificate: IotCertificate,
        public readonly parent: IotCertsFolderNode | IotThingNode,
        public readonly iot: IotClient,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly things?: string[],
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        // Show only 8 characters in the explorer instead of the full 64. The entire
        // ID can be copied from the context menu or viewed when hovered over.
        super(truncate(certificate.id, 8), collapsibleState)

        this.tooltip = localize(
            'AWS.explorerNode.iot.certTooltip',
            '{0}\nStatus: {1}\nCreated: {2}{3}',
            this.certificate.id,
            this.certificate.activeStatus,
            formatLocalized(this.certificate.creationDate),
            (things?.length ?? 0 > 0) ? `\nAttached to: ${things!.join(', ')}` : ''
        )
        this.iconPath = getIcon('aws-iot-certificate')
        this.description = `\t[${this.certificate.activeStatus}]`
        this.contextValue = `${contextBase}.${this.certificate.activeStatus}`
    }

    public update(): void {
        return undefined
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
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
                ?.filter((policy) => policy.policyArn && policy.policyName)
                .map(
                    (policy) =>
                        new IotPolicyCertNode({ arn: policy.policyArn!, name: policy.policyName! }, this, this.iot)
                ) ?? []

        getLogger().debug(`Loaded policies: %O`, newPolicies)
        return {
            newContinuationToken: response.nextMarker ?? undefined,
            newChildren: [...newPolicies],
        }
    }

    public async refreshNode(): Promise<void> {
        this.clearChildren()
        return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.settings.getSection('aws').get<number>('iot.maxItemsPerPage')
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
        public override readonly certificate: IotCertificate,
        public override readonly parent: IotThingNode,
        public override readonly iot: IotClient,
        public override readonly things?: string[],
        protected override readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, things, settings)
        this.contextValue = `${contextBase}.Things.${this.certificate.activeStatus}`
    }
}

/**
 * Represents an IoT Certificate with the Certificate Folder Node as parent.
 */
export class IotCertWithPoliciesNode extends IotCertificateNode implements LoadMoreNode {
    public constructor(
        public override readonly certificate: IotCertificate,
        public override readonly parent: IotCertsFolderNode,
        public override readonly iot: IotClient,
        public override readonly things?: string[],
        protected override readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(certificate, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, things, settings)
        this.contextValue = `${contextBase}.Policies.${this.certificate.activeStatus}`
    }
}
