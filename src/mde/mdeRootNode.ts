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
import { VSCODE_MDE_TAGS } from './constants'
import { getEmailHash, getStatusIcon } from './mdeModel'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'

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

        let keys = [...envs.keys()]
        const settings = new DefaultSettingsConfiguration('aws')
        // TODO: Enable this or other filters?
        if (settings.readDevSetting<boolean>('aws.dev.mde.emailFilter', 'boolean', true)) {
            const emailHash = await getEmailHash()
            if (emailHash) {
                keys = keys.filter(key => {
                    const tags = envs.get(key)!.tags
                    if (tags) {
                        return tags[VSCODE_MDE_TAGS.email] === emailHash
                    }

                    return false
                })
            }
        }
        updateInPlace(
            this.nodes,
            keys.sort((a, b) => this.sortMdeNodes(a, b, envs)),
            key => {
                // this.nodes.get(key)!.clearChildren(),
                const n = this.nodes.get(key)
                const env = envs.get(key)
                if (n && env) {
                    const status = env.status === 'RUNNING' ? '' : env.status
                    n.iconPath = getStatusIcon(env.status ?? '')
                    n.label = `${env.id.substring(0, 7)}… ${status}`
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

    /**
     * Sorts on the following criteria:
     * * If both have repos:
     *   * If both have different branches, return branch comparison
     *   * Else return repo comparison
     * * Else return whatever has a repo first
     * * Lastly, return a sort by name if repo doesn't exist or all comparables are matches
     */
    private sortMdeNodes(a: string, b: string, envs: Map<string, mde.MdeEnvironment>): number {
        const valsA = this.getMdeNodeComparables(envs.get(a)!)
        const valsB = this.getMdeNodeComparables(envs.get(b)!)
        if (valsA.repo && valsB.repo) {
            if (valsA.repo === valsB.repo) {
                if (valsA.branch && valsB.branch && valsA.branch !== valsB.branch) {
                    return valsA.branch.localeCompare(valsB.branch)
                }
            } else {
                return valsA.repo.localeCompare(valsB.repo)
            }
        } else if (valsA.repo && !valsB.repo) {
            return -1
        } else if (valsB.repo && !valsA.repo) {
            return 1
        }

        // no comparable tags or all comparable tags are equal
        return a.localeCompare(b)
    }

    private getMdeNodeComparables(env: mde.MdeEnvironment): { repo: string | undefined; branch: string | undefined } {
        const val: { repo: string | undefined; branch: string | undefined } = { repo: undefined, branch: undefined }
        if (env.tags) {
            val.repo = env.tags[VSCODE_MDE_TAGS.repository]
            val.branch = env.tags[VSCODE_MDE_TAGS.repositoryBranch]
        }

        return val
    }
}
