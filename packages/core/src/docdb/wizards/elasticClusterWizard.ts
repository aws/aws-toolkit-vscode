/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentDBClient } from '../../shared/clients/docdbClient'
import { validateClusterName, validatePassword, validateUsername } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { Auth, CreateClusterInput } from '@aws-sdk/client-docdb-elastic'
import { Prompter } from '../../shared/ui/prompter'

const DocDBElasticHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/elastic-how-it-works.html'
const DefaultShardCount = 2
const DefaultCapacity = 2

export interface ElasticClusterConfiguration extends Partial<CreateClusterInput> {}

/**
 * A wizard to prompt configuration of a new cluster
 */
export class ElasticClusterWizard extends Wizard<ElasticClusterConfiguration> {
    constructor(
        readonly client: DocumentDBClient,
        readonly title: string
    ) {
        super()
        this.client = client
        const form = this.form

        form.clusterName.bindPrompter(() =>
            createInputBox({
                title: this.title,
                prompt: localize('AWS.docdb.createCluster.name.prompt', 'Specify a unique cluster name'),
                validateInput: validateClusterName,
                buttons: createCommonButtons(DocDBElasticHelpUrl),
            })
        )

        form.adminUserName.bindPrompter(() => createUsernamePrompter(this.title))
        form.adminUserPassword.bindPrompter(() => createPasswordPrompter(this.title))
        form.authType.setDefault(() => Auth.PLAIN_TEXT)
        form.shardCount.bindPrompter(() => createShardCountPrompter(this.title), {
            setDefault: () => DefaultShardCount,
        })
        form.shardInstanceCount.bindPrompter(
            () =>
                createQuickPick(instanceCountItems(2), {
                    title: localize(
                        'AWS.docdb.createCluster.dbInstanceCount.prompt',
                        'The number of replica instances applying to all shards in the elastic cluster'
                    ),
                    buttons: createCommonButtons(DocDBElasticHelpUrl),
                }),
            { setDefault: () => 2 }
        )
        form.shardCapacity.bindPrompter(() => createShardCapacityPrompter(this.title), {
            setDefault: () => DefaultCapacity,
        })

        return this
    }
}

function createUsernamePrompter(title: string) {
    return createInputBox({
        title,
        prompt: localize('AWS.docdb.createCluster.username.prompt', 'Specify a login username'),
        validateInput: validateUsername,
        buttons: createCommonButtons(DocDBElasticHelpUrl),
    })
}

function createPasswordPrompter(title: string) {
    return createInputBox({
        title,
        prompt: localize('AWS.docdb.createCluster.password.prompt', 'Specify a login password (8 characters minimum)'),
        password: true,
        validateInput: validatePassword,
        buttons: createCommonButtons(DocDBElasticHelpUrl),
    })
}

function createShardCountPrompter(title: string): Prompter<number> {
    const maxShardCount = 32
    const prompter = createInputBox({
        title,
        prompt: localize('AWS.docdb.createCluster.shardCount.prompt', 'Number of shards the Elastic Cluster will use'),
        validateInput: (value) => {
            const num = parseInt(value)
            if (num < 1 || num > maxShardCount || isNaN(num)) {
                return localize(
                    'AWS.docdb.createCluster.shardCount.invalidValue',
                    `Enter a numeric value between 1 and ${maxShardCount}`
                )
            }
            return undefined
        },
        buttons: createCommonButtons(DocDBElasticHelpUrl),
    })
    return prompter.transform((value) => parseInt(value))
}

function createShardCapacityPrompter(title: string): Prompter<number> {
    const items = [2, 4, 8, 16, 32, 64].map<DataQuickPickItem<number>>((data) => ({
        data,
        label: data.toString(),
    }))
    return createQuickPick(items, {
        title,
        placeholder: localize('AWS.docdb.createCluster.shardCapacity.placeholder', 'vCPU capacity of shard instances'),
        buttons: createCommonButtons(DocDBElasticHelpUrl),
    })
}

function instanceCountItems(defaultCount: number, max: number = 16): DataQuickPickItem<number>[] {
    const items = []
    for (let i = 1; i <= max; i++) {
        const item: DataQuickPickItem<number> = {
            label: i.toString(),
            data: i,
            description: i === defaultCount ? '(recommended)' : undefined,
        }

        items.push(item)
    }

    return items
}
