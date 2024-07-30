/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateDBClusterCommandInput } from '@aws-sdk/client-docdb'
import { DBStorageType, DefaultDocumentDBClient, DocumentDBClient } from '../../shared/clients/docdbClient'
import { validateClusterName, validatePassword, validateUsername } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions, WizardState } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { SkipPrompter } from '../../shared/ui/common/skipPrompter'
import { Auth, CreateClusterInput } from '@aws-sdk/client-docdb-elastic'
import { Prompter } from '../../shared'

const DocDBClusterHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/db-cluster-parameters.html'
const DocDBElasticHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/elastic-how-it-works.html'

const isRegionalCluster = (state: WizardState<CreateClusterState>) => state.ClusterType === 'regional'
const isElasticCluster = (state: WizardState<CreateClusterState>) => state.ClusterType === 'elastic'

export interface RegionalClusterConfiguration extends CreateDBClusterCommandInput {
    // These options cannot be changed later
    EngineVersion?: string | undefined
    MasterUsername?: string | undefined
    MasterUserPassword?: string | undefined
    StorageEncrypted?: boolean | undefined
    KmsKeyId?: string | undefined
    DBSubnetGroupName?: string | undefined
    VpcSecurityGroupIds?: string[] | undefined
    // Instance fields
    DBInstanceCount?: number | undefined
    DBInstanceClass?: string | undefined
}

export interface ElasticClusterConfiguration extends CreateClusterInput {}

export interface CreateClusterState {
    ClusterType: string
    ClusterName: string
    readonly RegionalCluster: RegionalClusterConfiguration
    readonly ElasticCluster: Partial<ElasticClusterConfiguration>
}

/**
 * A wizard to prompt configuration of a new cluster
 */
export class CreateClusterWizard extends Wizard<CreateClusterState> {
    title: string
    constructor(
        region: string,
        options: WizardOptions<CreateClusterState> = {},
        readonly client: DocumentDBClient = new DefaultDocumentDBClient(region)
    ) {
        super({
            initState: options.initState,
            implicitState: options.implicitState,
            exitPrompterProvider: createExitPrompter,
        })
        this.client = client
        this.title = localize('AWS.docdb.createCluster.title', 'Create DocumentDB Cluster')
    }

    public override async init(): Promise<this> {
        const form = this.form

        form.ClusterName.bindPrompter(
            () =>
                createInputBox({
                    step: 1,
                    title: this.title,
                    prompt: localize('AWS.docdb.createCluster.name.prompt', 'Specify a unique cluster name'),
                    validateInput: validateClusterName,
                }),
            {
                relativeOrder: 1,
            }
        )
        form.RegionalCluster.Engine.setDefault(() => 'docdb')
        form.RegionalCluster.DBClusterIdentifier.setDefault((state) => state.ClusterName)
        form.ElasticCluster.clusterName.setDefault((state) => state.ClusterName)

        form.ClusterType.bindPrompter(() => createClusterTypePrompter(), {
            relativeOrder: 2,
        })

        form.RegionalCluster.EngineVersion.bindPrompter(async () => await createEngineVersionPrompter(this.client), {
            showWhen: isRegionalCluster,
        })
        form.RegionalCluster.MasterUsername.bindPrompter(() => createUsernamePrompter(this.title), {
            showWhen: isRegionalCluster,
        })
        form.RegionalCluster.MasterUserPassword.bindPrompter(() => createPasswordPrompter(this.title), {
            showWhen: isRegionalCluster,
        })
        form.RegionalCluster.StorageEncrypted.bindPrompter(() => createEncryptedStoragePrompter(), {
            showWhen: isRegionalCluster,
        })

        form.RegionalCluster.DBInstanceCount.bindPrompter(
            () =>
                createQuickPick(instanceCountItems(3), {
                    title: localize('AWS.docdb.createCluster.dbInstanceCount.prompt', 'Number of instances'),
                    buttons: createCommonButtons(DocDBClusterHelpUrl),
                }),
            {
                showWhen: isRegionalCluster,
                setDefault: () => 3,
            }
        )

        form.RegionalCluster.DBInstanceClass.bindPrompter(
            async (state) => await createInstanceClassPrompter(this.client, state.RegionalCluster!.EngineVersion!),
            {
                showWhen: isRegionalCluster,
                setDefault: () => 'db.t3.medium',
            }
        )

        form.ElasticCluster.adminUserName.bindPrompter(() => createUsernamePrompter(this.title), {
            showWhen: isElasticCluster,
        })
        form.ElasticCluster.adminUserPassword.bindPrompter(() => createPasswordPrompter(this.title), {
            showWhen: isElasticCluster,
        })
        form.ElasticCluster.authType.setDefault(() => Auth.PLAIN_TEXT)
        form.ElasticCluster.shardCount.bindPrompter(() => createShardCountPrompter(this.title), {
            showWhen: isElasticCluster,
            setDefault: () => 2,
        })
        form.ElasticCluster.shardInstanceCount.bindPrompter(
            () =>
                createQuickPick(instanceCountItems(2), {
                    title: localize(
                        'AWS.docdb.createCluster.dbInstanceCount.prompt',
                        'The number of replica instances applying to all shards in the elastic cluster'
                    ),
                    buttons: createCommonButtons(DocDBElasticHelpUrl),
                }),
            {
                showWhen: isElasticCluster,
                setDefault: () => 2,
            }
        )
        form.ElasticCluster.shardCapacity.bindPrompter(() => createShardCapacityPrompter(this.title), {
            showWhen: isElasticCluster,
            setDefault: () => 2,
        })

        return this
    }
}

function createClusterTypePrompter() {
    const regionalType: DataQuickPickItem<string> = {
        data: 'regional',
        label: localize('AWS.docdb.createCluster.clusterType.regional.label', 'Instance Based Cluster'),
        detail: localize(
            'AWS.docdb.createCluster.clusterType.regional.detail',
            'Instance based cluster can scale your database to millions of reads per second and up to 128 TiB of storage capacity. With instance based clusters you can choose your instance type based on your requirements.'
        ),
    }
    const elasticType: DataQuickPickItem<string> = {
        data: 'elastic',
        label: localize('AWS.docdb.createCluster.clusterType.elastic.label', 'Elastic Cluster'),
        detail: localize(
            'AWS.docdb.createCluster.clusterType.elastic.detail',
            'Elastic clusters can scale your database to millions of reads and writes per second, with petabytes of storage capacity. Elastic clusters support MongoDB compatible sharding APIs. With Elastic Clusters, you do not need to choose, manage or upgrade instances.'
        ),
    }

    return createQuickPick([regionalType, elasticType], {
        step: 1,
        title: localize('AWS.docdb.createCluster.clusterType.prompt', 'Cluster type'),
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

function createUsernamePrompter(title: string) {
    return createInputBox({
        step: 3,
        title,
        prompt: localize('AWS.docdb.createCluster.username.prompt', 'Specify a login username'),
        validateInput: validateUsername,
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

function createPasswordPrompter(title: string) {
    return createInputBox({
        step: 4,
        title,
        prompt: localize('AWS.docdb.createCluster.password.prompt', 'Specify a login password (8 characters minimum)'),
        password: true,
        validateInput: validatePassword,
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

function createEncryptedStoragePrompter() {
    return createQuickPick(
        [
            {
                label: localize('AWS.docdb.createCluster.storage.encrypted', 'Encrypt'),
                description: '(recommended)',
                data: true,
            },
            {
                label: localize('AWS.docdb.createCluster.storage.notEncrypted', "Don't encrypt"),
                data: false,
            },
        ],
        {
            title: localize('AWS.docdb.createCluster.storageEncrypted.prompt', 'Specify storage encryption'),
            buttons: createCommonButtons(DocDBClusterHelpUrl),
        }
    )
}

async function createEngineVersionPrompter(docdbClient: DocumentDBClient) {
    const versions = await docdbClient.listEngineVersions()
    // sort in descending order
    versions.sort((a, b) => b.EngineVersion!.localeCompare(a.EngineVersion!))

    const items: DataQuickPickItem<string>[] = versions.map((v) => {
        return {
            label: v.EngineVersion ?? '',
            data: v.EngineVersion,
        }
    })

    if (items.length === 0) {
        items.push({ label: '5.0.0 (default)', data: '5.0.0' })
    }

    items[0].picked = true

    return createQuickPick(items, {
        title: localize('AWS.docdb.createCluster.engineVersion.prompt', 'Select engine version'),
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

async function createInstanceClassPrompter(docdbClient: DocumentDBClient, engineVersion: string) {
    const options = await docdbClient.listInstanceClassOptions(engineVersion, DBStorageType.Standard)

    const items: DataQuickPickItem<string>[] = options.map((option) => {
        return {
            data: option.DBInstanceClass,
            label: option.DBInstanceClass ?? '(unknown)',
            description: undefined,
            detail: undefined,
        }
    })

    if (items.length === 0) {
        return new SkipPrompter('db.t3.medium')
    }

    return createQuickPick(items, {
        title: localize('AWS.docdb.createInstance.instanceClass.prompt', 'Select instance class'),
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

function instanceCountItems(defaultCount: number, max: number = 16): DataQuickPickItem<number>[] {
    const items = []

    for (let index = 1; index <= max; index++) {
        const item: DataQuickPickItem<number> = {
            label: index.toString(),
            data: index,
            description: index === defaultCount ? '(recommended)' : undefined,
        }
        items.push(item)
    }

    return items
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
