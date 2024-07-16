/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateDBClusterMessage } from '@aws-sdk/client-docdb'
import { DBStorageType, DefaultDocumentDBClient, DocumentDBClient } from '../../shared/clients/docdbClient'
import { validateClusterName, validatePassword, validateUsername } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { SkipPrompter } from '../../shared/ui/common/skipPrompter'

const DocDBHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/db-cluster-parameters.html'

export interface CreateClusterState extends CreateDBClusterMessage {
    // Required fields
    readonly DBClusterIdentifier: string
    readonly Engine: 'docdb'
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
            initState: {
                Engine: 'docdb',
                ...options.initState,
            },
            implicitState: options.implicitState,
            exitPrompterProvider: createExitPrompter,
        })
        this.client = client
        this.title = localize('AWS.docdb.createCluster.title', 'Create DocumentDB Cluster')
    }

    public override async init(): Promise<this> {
        const form = this.form

        form.DBClusterIdentifier.bindPrompter(() =>
            createInputBox({
                step: 1,
                title: this.title,
                placeholder: localize('AWS.docdb.createCluster.name.prompt', 'Specify a unique cluster name'),
                validateInput: validateClusterName,
            })
        )

        form.EngineVersion.bindPrompter(async () => await createEngineVersionPrompter(this.client))

        form.MasterUsername.bindPrompter(() =>
            createInputBox({
                step: 3,
                title: this.title,
                prompt: localize('AWS.docdb.createCluster.username.prompt', 'Specify a login username'),
                validateInput: validateUsername,
                buttons: createCommonButtons(DocDBHelpUrl),
            })
        )

        form.MasterUserPassword.bindPrompter(() =>
            createInputBox({
                step: 4,
                title: this.title,
                prompt: localize(
                    'AWS.docdb.createCluster.password.prompt',
                    'Specify a login password (8 characters minimum)'
                ),
                password: true,
                validateInput: validatePassword,
                buttons: createCommonButtons(DocDBHelpUrl),
            })
        )

        form.StorageEncrypted.bindPrompter(() =>
            createQuickPick(
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
                    step: 5,
                    title: localize('AWS.docdb.createCluster.storageEncrypted.prompt', 'Specify storage encryption'),
                    buttons: createCommonButtons(DocDBHelpUrl),
                }
            )
        )

        form.DBInstanceCount.bindPrompter(() =>
            createQuickPick(instanceCountItems(), {
                step: 6,
                title: localize('AWS.docdb.createCluster.dbInstanceCount.prompt', 'Number of instances'),
                buttons: createCommonButtons(DocDBHelpUrl),
            })
        )

        form.DBInstanceClass.bindPrompter(
            async (state) => await createInstanceClassPrompter(this.client, state.EngineVersion!)
        )

        form.DBInstanceCount.setDefault(3)
        form.DBInstanceClass.setDefault('db.t3.medium')

        return this
    }
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
        step: 2,
        title: localize('AWS.docdb.createCluster.engineVersion.prompt', 'Select engine version'),
        buttons: createCommonButtons(DocDBHelpUrl),
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
        step: 7,
        title: localize('AWS.docdb.createInstance.instanceClass.prompt', 'Select instance class'),
        buttons: createCommonButtons(DocDBHelpUrl),
    })
}

function instanceCountItems(max: number = 16): DataQuickPickItem<number>[] {
    const defaultCount = Math.min(3, max)
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
