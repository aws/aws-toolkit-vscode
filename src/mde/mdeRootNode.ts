/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as mde from '../shared/clients/mdeClient'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { MdeInstanceNode } from './mdeInstanceNode'
import * as treeNodeUtil from '../shared/treeview/treeNodeUtilities'
import { PlaceholderNode } from '../shared/treeview/nodes/placeholderNode'
import { ErrorNode } from '../shared/treeview/nodes/errorNode'
import { updateInPlace } from '../shared/utilities/collectionUtils'

const localize = nls.loadMessageBundle()

/**
 * Toplevel "MDE" node in the AWS treeview of services.
 */
export class MdeRootNode extends AWSTreeNodeBase {
    private readonly nodes: Map<string, MdeInstanceNode>
    private mdeClient: mde.MdeClient | undefined

    public constructor(public readonly regionCode: string) {
        super(localize('AWS.mde.title', 'MDE'), vscode.TreeItemCollapsibleState.Collapsed)
        this.nodes = new Map<string, MdeInstanceNode>()
        this.contextValue = 'awsMdeNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        this.mdeClient = this.mdeClient ?? (await mde.MdeClient.create(this.regionCode))
        return await treeNodeUtil.makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.nodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, localize('AWS.empty', '[Empty]')),
            sort: (nodeA: MdeInstanceNode, nodeB: MdeInstanceNode) => {
                // sort by: userId, envId
                const compareStatus = (nodeA.env.userArn ?? '').localeCompare(nodeB.env.userArn ?? '')
                if (compareStatus !== 0) {
                    return compareStatus
                }
                return (nodeA.label ?? '').localeCompare(nodeB.label ?? '')
            },
        })
    }

    public async updateChildren(): Promise<void> {
        this.mdeClient = this.mdeClient ?? (await mde.MdeClient.create(this.regionCode))
        const items = this.mdeClient.listEnvironments({})
        const envs = new Map<string, mde.MdeEnvironment>()
        for await (const i of items) {
            if (!i || !i.id) {
                continue
            }
            envs.set(i.id, i)
        }
        updateInPlace(
            this.nodes,
            envs.keys(),
            key => {
                // this.nodes.get(key)!.clearChildren(),
                const n = this.nodes.get(key)
                const env = envs.get(key)
                if (n && env) {
                    const status = env.status === 'RUNNING' ? '' : env.status
                    n.label = `${env.id.substring(0, 7)}… ${env.userArn} ${status}`
                }
            },
            key => {
                const env = envs.get(key)
                if (env) {
                    return new MdeInstanceNode(this, env)
                }
            }
        )
    }
}
