/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateDBClusterMessage } from '@aws-sdk/client-docdb'
import { DefaultDocumentDBClient, DocumentDBClient } from '../../shared/clients/docdbClient'
import { validateClusterName, validatePassword, validateUsername } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'

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

        return this
    }
}

async function createEngineVersionPrompter(docdbClient: DocumentDBClient) {
    const versions = await docdbClient.listEngineVersions()
    // sort in descending order
    versions.sort((a, b) => b.EngineVersion!.localeCompare(a.EngineVersion!))

    const items: DataQuickPickItem<string>[] = versions.map(v => {
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
