/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DBCluster, OrderableDBInstanceOption } from '@aws-sdk/client-docdb'
import { DefaultDocumentDBClient, DocumentDBClient, DBStorageType } from '../../shared/clients/docdbClient'
import { validateInstanceName } from '../utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { SkipPrompter } from '../../shared/ui/common/skipPrompter'

const DocDBHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/db-instances.html'

export interface CreateInstanceState {
    DBInstanceIdentifier: string
    DBInstanceClass: string
}

/**
 * A wizard to prompt configuration of a new instance
 */
export class CreateInstanceWizard extends Wizard<CreateInstanceState> {
    title: string
    cluster: DBCluster
    constructor(
        region: string,
        cluster: DBCluster,
        options: WizardOptions<CreateInstanceState> = {},
        readonly client: DocumentDBClient = DefaultDocumentDBClient.create(region)
    ) {
        super({
            initState: {
                ...options.initState,
            },
            implicitState: options.implicitState,
            exitPrompterProvider: createExitPrompter,
        })
        this.cluster = cluster
        this.client = client
        this.title = localize('AWS.docdb.createInstance.title', 'Add Instance')
    }

    public override async init(): Promise<this> {
        const form = this.form

        form.DBInstanceIdentifier.bindPrompter(() =>
            createInputBox({
                step: 1,
                title: this.title,
                prompt: localize('AWS.docdb.createInstance.name.prompt', 'Instance Name'),
                placeholder: localize('AWS.docdb.createInstance.name.placeholder', 'Specify a unique identifier'),
                validateInput: validateInstanceName,
            })
        )

        form.DBInstanceClass.bindPrompter(async (state) => await this.createInstanceClassPrompter(state.stepCache))

        return this
    }

    private async createInstanceClassPrompter(cache: { [key: string]: any }) {
        const cachedOptions: OrderableDBInstanceOption[] = cache[this.client.regionCode]
        const options =
            cachedOptions ??
            (await this.client.listInstanceClassOptions(
                this.cluster.EngineVersion,
                this.cluster.StorageType ?? DBStorageType.Standard
            ))
        cache[this.client.regionCode] = options

        const items: DataQuickPickItem<string>[] = options.map((option) => {
            return {
                data: option.DBInstanceClass,
                label: option.DBInstanceClass ?? '(unknown)',
                description: undefined,
                detail: undefined,
                recentlyUsed: false,
            }
        })

        if (items.length === 0) {
            return new SkipPrompter<string>()
        }

        return createQuickPick(items, {
            step: 2,
            title: localize('AWS.docdb.createInstance.instanceClass.prompt', 'Select instance class'),
            buttons: createCommonButtons(DocDBHelpUrl),
        })
    }
}
