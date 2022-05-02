/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as mde from '../shared/clients/mdeClient'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { MdeInstanceNode } from './mdeInstanceNode'
import { PlaceholderNode } from '../shared/treeview/nodes/placeholderNode'
import { updateInPlace } from '../shared/utilities/collectionUtils'
import { VSCODE_MDE_TAGS } from './constants'
import { getEmailHash, makeLabelsString, MDE_STATUS_PRIORITY } from './mdeModel'
import { DevSettings } from '../shared/settings'
import { makeChildrenNodes } from '../shared/treeview/utils'

const localize = nls.loadMessageBundle()

const POLLING_INTERVAL = 20000
/**
 * Toplevel "MDE" node in the AWS treeview of services.
 */
export class MdeRootNode extends AWSTreeNodeBase {
    private readonly nodes: Map<string, MdeInstanceNode>
    private mdeClient: mde.MdeClient | undefined
    private pollTimer: NodeJS.Timeout | undefined
    private POLLING_STATUSES = new Set<string>(['PENDING', 'STARTING', 'STOPPING', 'DELETING'])
    private sortType: 'createdAt' | 'lastStartedAt' = 'lastStartedAt'

    public constructor(public readonly regionCode: string) {
        super(localize('AWS.mde.title', 'MDE'), vscode.TreeItemCollapsibleState.Collapsed)
        this.nodes = new Map<string, MdeInstanceNode>()
        this.contextValue = 'awsMdeNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        this.mdeClient = this.mdeClient ?? (await mde.MdeClient.create(this.regionCode))
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.nodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, localize('AWS.empty', '[Empty]')),
            sort: (a, b) => this.sortMdeNodes(a.env, b.env),
        })
    }

    public async updateChildren(): Promise<void> {
        const envs = await this.generateCurrentEnvs()
        let keys = [...envs.keys()]
        // TODO: Enable this or other filters?
        if (DevSettings.instance.get('mdeEmailFilter', true)) {
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
            keys,
            key => {
                // this.nodes.get(key)!.clearChildren(),
                const n = this.nodes.get(key)
                const env = envs.get(key)
                if (n && env) {
                    n.update(env)
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
    private sortMdeNodes(envA: mde.MdeEnvironment, envB: mde.MdeEnvironment): number {
        if (envA.status !== envB.status) {
            const val =
                (MDE_STATUS_PRIORITY.get(envA.status ?? 'FAILED') ?? 2) -
                (MDE_STATUS_PRIORITY.get(envB.status ?? 'FAILED') ?? 2)
            return val
        }
        if (envA && envB) {
            const dateA = envA[this.sortType]?.getTime() ?? Infinity
            const dateB = envB[this.sortType]?.getTime() ?? Infinity
            if (dateA !== dateB) {
                return dateB - dateA
            }
        }

        // Compare labels and env names if neither have a comparable date
        const labelA = makeLabelsString(envA)
        const labelB = makeLabelsString(envB)
        if (labelA && labelB) {
            return labelA.localeCompare(labelB)
        }
        if (labelA && !labelB) {
            return -1
        }
        if (!labelA && labelB) {
            return 1
        }

        return envA.id.localeCompare(envB.id)
    }

    private clearPollTimer(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }
    }

    public startPolling(): void {
        this.pollTimer = this.pollTimer ?? setInterval(this.refresh.bind(this), POLLING_INTERVAL)
    }

    private stopPolling(): void {
        this.clearPollTimer()
    }

    private async generateCurrentEnvs(): Promise<Map<string, mde.MdeEnvironment>> {
        let shouldPoll: boolean = false
        this.mdeClient = this.mdeClient ?? (await mde.MdeClient.create(this.regionCode))
        const items = this.mdeClient.listEnvironments({})
        const envs = new Map<string, mde.MdeEnvironment>()
        for await (const i of items) {
            if (!i || !i.id) {
                continue
            }
            envs.set(i.id, i)
            if (this.POLLING_STATUSES.has(i.status ?? '')) {
                shouldPoll = true
            }
        }
        if (!shouldPoll) {
            this.stopPolling()
        }

        return envs
    }
}
