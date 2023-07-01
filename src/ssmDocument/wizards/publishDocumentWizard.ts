/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SSM } from 'aws-sdk'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { validateDocumentName } from '../util/validateDocumentName'
import { DefaultSsmDocumentClient } from '../../shared/clients/ssmDocumentClient'

export interface PublishSSMDocumentWizardResponse {
    readonly action: PublishSSMDocumentAction
    readonly name: string
    readonly documentType: 'Automation'
    readonly region: string
}

export enum PublishSSMDocumentAction {
    QuickCreate = 'Create',
    QuickUpdate = 'Update',
}

async function* loadDocuments(region: string, documentType?: SSM.Types.DocumentType) {
    const filters: SSM.Types.DocumentKeyValuesFilterList = [
        {
            Key: 'Owner',
            Values: ['Self'],
        },
    ]
    if (documentType !== undefined) {
        filters.push({
            Key: 'DocumentType',
            Values: [documentType],
        })
    }
    const client = new DefaultSsmDocumentClient(region)

    for await (const document of client.listDocuments({ Filters: filters })) {
        yield [
            {
                label: document.Name!,
                data: document.Name!,
                description: `DocumentType: ${document.DocumentType}, DocumentVersion: ${document.DocumentVersion}`,
            },
        ]
    }
}

function createNamePrompter() {
    return createInputBox({
        title: localize('AWS.ssmDocument.publishWizard.ssmDocumentName.title', 'Name your document'),
        buttons: createCommonButtons(),
        validateInput: validateDocumentName,
    })
}

function createUpdateDocumentPrompter(region: string, documentType?: string) {
    return createQuickPick(loadDocuments(region, documentType), {
        title: localize(
            'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.title',
            'Select a document to update ({0})',
            region
        ),
        noItemsFoundItem: {
            label: localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.noDocument',
                'No self-owned documents could be found. Please create and upload a Systems Manager Document before updating.'
            ),
            data: WIZARD_BACK,
        },
        buttons: createCommonButtons(),
    })
}

function createPublishPrompter(region: string) {
    const publishItems = [
        {
            label: localize('AWS.ssmDocument.publishWizard.publishAction.quickCreate.label', 'Quick Create'),
            detail: localize(
                'AWS.ssmDocument.publishWizard.publishAction.quickCreate.detail',
                'Create a Systems Manager Document'
            ),
            data: PublishSSMDocumentAction.QuickCreate,
        },
        {
            label: localize('AWS.ssmDocument.publishWizard.publishAction.quickUpdate.label', 'Quick Update'),
            detail: localize(
                'AWS.ssmDocument.publishWizard.publishAction.quickUpdate.detail',
                'Update an existing Systems Manager Document'
            ),
            data: PublishSSMDocumentAction.QuickUpdate,
        },
    ]

    return createQuickPick(publishItems, {
        title: localize(
            'AWS.ssmDocument.publishWizard.publishAction.title',
            'Publish to AWS Systems Manager Document ({0})',
            region
        ),
        buttons: createCommonButtons(),
    })
}

export class PublishSSMDocumentWizard extends Wizard<PublishSSMDocumentWizardResponse> {
    public constructor(region?: string) {
        super({ initState: { region } })
        const form = this.form

        // TODO: add prompt when more types are supported
        form.documentType.setDefault('Automation')

        form.region.bindPrompter(() =>
            createRegionPrompter(undefined, {
                title: localize(
                    'AWS.message.prompt.ssmDocument.publishDocument.region',
                    'Which AWS Region would you like to publish to?'
                ),
                serviceFilter: 'ssm',
            }).transform(r => r.id)
        )

        form.action.bindPrompter(state => createPublishPrompter(state.region!))

        form.name.bindPrompter(state => {
            switch (state.action!) {
                case PublishSSMDocumentAction.QuickCreate:
                    return createNamePrompter()
                case PublishSSMDocumentAction.QuickUpdate:
                    return createUpdateDocumentPrompter(state.region!, state.documentType)
                default:
                    throw new Error(`Invalid publish action: ${state.action}`)
            }
        })
    }
}
