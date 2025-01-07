/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateDBClusterCommandInput } from '@aws-sdk/client-docdb'
import { DBStorageType, DocDBEngine, DocumentDBClient, MaxInstanceCount } from '../../shared/clients/docdbClient'
import { isSupportedGlobalInstanceClass, validateClusterName, validatePassword, validateUsername } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { SkipPrompter } from '../../shared/ui/common/skipPrompter'

const DocDBClusterHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/db-cluster-parameters.html'

export interface RegionalClusterConfiguration extends CreateDBClusterCommandInput {
    DBClusterIdentifier: string
    // These options cannot be changed later
    EngineVersion: string
    MasterUsername: string
    MasterUserPassword: string
    StorageEncrypted: boolean
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
export class RegionalClusterWizard extends Wizard<RegionalClusterConfiguration> {
    constructor(
        readonly client: DocumentDBClient,
        readonly title: string,
        readonly isPrimaryCluster: boolean = true,
        options: WizardOptions<RegionalClusterConfiguration> = {}
    ) {
        super(options)
        this.client = client
    }

    public override async init(): Promise<this> {
        const form = this.form

        form.DBClusterIdentifier.bindPrompter(
            () =>
                createInputBox({
                    step: 1,
                    title: this.title,
                    prompt: localize('AWS.docdb.createCluster.name.prompt', 'Specify a unique cluster name'),
                    validateInput: validateClusterName,
                    buttons: createCommonButtons(DocDBClusterHelpUrl),
                }),
            { relativeOrder: 1 }
        )

        form.Engine.setDefault(() => DocDBEngine)
        form.EngineVersion.bindPrompter(async () => await createEngineVersionPrompter(this.client), {
            showWhen: () => this.isPrimaryCluster,
            setDefault: () => this.options.initState?.EngineVersion,
        })
        form.MasterUsername.bindPrompter(() => createUsernamePrompter(this.title), {
            showWhen: () => this.isPrimaryCluster,
        })
        form.MasterUserPassword.bindPrompter(() => createPasswordPrompter(this.title), {
            showWhen: () => this.isPrimaryCluster,
        })
        form.StorageEncrypted.bindPrompter(() => createEncryptedStoragePrompter(), {
            showWhen: () => this.isPrimaryCluster,
        })

        form.DBInstanceCount.bindPrompter(
            () =>
                createQuickPick(instanceCountItems(3), {
                    title: localize('AWS.docdb.createCluster.dbInstanceCount.prompt', 'Number of instances'),
                    buttons: createCommonButtons(DocDBClusterHelpUrl),
                }),
            {
                setDefault: () => 3,
            }
        )

        form.DBInstanceClass.bindPrompter(
            async (state) =>
                await createInstanceClassPrompter(this.client, state.EngineVersion!, this.isPrimaryCluster),
            {
                setDefault: () => 'db.t3.medium',
                showWhen: (state) => state.DBInstanceCount! > 0,
            }
        )

        return this
    }
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

async function createInstanceClassPrompter(
    docdbClient: DocumentDBClient,
    engineVersion: string,
    isPrimaryCluster: boolean
) {
    const options = await docdbClient.listInstanceClassOptions(engineVersion, DBStorageType.Standard)

    const items: DataQuickPickItem<string>[] = options
        .filter((option) => isPrimaryCluster || isSupportedGlobalInstanceClass(option.DBInstanceClass!))
        .map((option) => ({
            data: option.DBInstanceClass,
            label: option.DBInstanceClass ?? '(unknown)',
            description: undefined,
            detail: undefined,
        }))

    if (items.length === 0) {
        return new SkipPrompter<string>()
    }

    return createQuickPick(items, {
        title: localize('AWS.docdb.createInstance.instanceClass.prompt', 'Select instance class'),
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}

//TODO: Make this it's own picker class
function instanceCountItems(defaultCount: number, max: number = MaxInstanceCount): DataQuickPickItem<number>[] {
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
