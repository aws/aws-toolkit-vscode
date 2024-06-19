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
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotCertWithPoliciesNode } from './iotCertificateNode'
import { IotNode } from './iotNodes'
import { Settings } from '../../shared/settings'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

/**
 * Represents the group of all IoT Certificates.
 */
export class IotCertsFolderNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly iot: IotClient,
        public readonly parent: IotNode,
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super('Certificates', vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = 'IoT Certificates'
        this.contextValue = 'awsIotCertsNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<IotCertWithPoliciesNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listCertificates({
            marker: continuationToken,
            pageSize: this.getMaxItemsPerPage(),
        })

        const newCerts =
            response.certificates
                ?.filter(cert => cert.certificateArn && cert.certificateId && cert.status && cert.creationDate)
                .map(
                    async cert =>
                        new IotCertWithPoliciesNode(
                            {
                                arn: cert.certificateArn!,
                                id: cert.certificateId!,
                                activeStatus: cert.status!,
                                creationDate: cert.creationDate!,
                            },
                            this,
                            this.iot,
                            await this.iot.listThingsForCert({ principal: cert.certificateArn! })
                        )
                ) ?? []

        const resolvedCerts = await Promise.all(newCerts)

        getLogger().debug(`Loaded certificates: %O`, newCerts)
        return {
            newContinuationToken: response.nextMarker ?? undefined,
            newChildren: [...resolvedCerts],
        }
    }

    public async refreshNode(): Promise<void> {
        this.clearChildren()
        return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }

    public [inspect.custom](): string {
        return `IotCertificates`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.settings.getSection('aws').get<number>('iot.maxItemsPerPage')
    }
}
