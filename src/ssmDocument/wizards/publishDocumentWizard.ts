/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import { Prompter, PrompterButtons } from '../../shared/ui/prompter'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../../shared/awsContext'

import { ext } from '../../shared/extensionGlobals'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { validateDocumentName } from '../util/validateDocumentName'
import { Wizard } from '../../shared/wizards/wizard'
import { initializeInterface } from '../../shared/transformers'
import { createBackButton } from '../../shared/ui/buttons'
import { createLabelQuickPick, createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/picker'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/input'
const localize = nls.loadMessageBundle()

export interface PublishSSMDocumentWizardResponse {
    PublishSsmDocAction: PublishSSMDocumentAction
    name: string
    documentType?: SSM.DocumentType
    region: string
}

export enum PublishSSMDocumentAction {
    QuickCreate = 'Create',
    QuickUpdate = 'Update',
}

export interface PublishSSMDocumentWizardContext {
    loadSSMDocument(region: string, documentType?: SSM.Types.DocumentType): Promise<SSM.DocumentIdentifier[]> 

    createPublishPrompter(region: string): Prompter<PublishSSMDocumentAction>
    createRegionPrompter(): Prompter<string>
    createNamePrompter(): Prompter<string>
    createDocumentTypePrompter(): Prompter<SSM.DocumentType>
    createUpdateDocumentPrompter(region: string, documentType?: string): Prompter<string>
}

export class PublishSSMDocumentWizard extends Wizard<PublishSSMDocumentWizardResponse> {
    public constructor(context: PublishSSMDocumentWizardContext) {
        super(initializeInterface<PublishSSMDocumentWizardResponse>())

        this.form.region.bindPrompter(() => context.createRegionPrompter())
        this.form.PublishSsmDocAction.bindPrompter(form => context.createPublishPrompter(form.region!))
        //this.form.documentType.bindPrompter(() => context.createDocumentTypePrompter())
        this.form.name.bindPrompter(form => {
            switch (form.PublishSsmDocAction) {
                case (PublishSSMDocumentAction.QuickCreate): 
                    return context.createNamePrompter()
                case (PublishSSMDocumentAction.QuickUpdate): 
                    return context.createUpdateDocumentPrompter(form.region!, form.documentType)
            }
            throw new Error(`Unimplemented PublishSSMDocumentAction: "${form.PublishSsmDocAction}"`)
        })
    }
}

export class DefaultPublishSSMDocumentWizardContext implements PublishSSMDocumentWizardContext {
    private readonly buttons: PrompterButtons = [createBackButton()]

    public constructor(private readonly awsContext: AwsContext, private readonly regionProvider: RegionProvider) {}

    public createPublishPrompter(region: string): QuickPickPrompter<PublishSSMDocumentAction> {
        const publishItems: DataQuickPickItem<PublishSSMDocumentAction>[] = [
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
            buttons: this.buttons
        })
    }

    public createRegionPrompter(): QuickPickPrompter<string> {
        const partitionRegions = getRegionsForActiveCredentials(this.awsContext, this.regionProvider)

        return createLabelQuickPick(partitionRegions.map(region => ({ label: region.name, detail: region.id })), {
            title: localize(
                'AWS.message.prompt.ssmDocument.publishDocument.region',
                'Which AWS Region would you like to publish to?'
            ),
            matchOnDetail: true,
            buttons: this.buttons
        })
    }

    public createNamePrompter(): InputBoxPrompter {
        return createInputBox({
            title: localize('AWS.ssmDocument.publishWizard.ssmDocumentName.title', 'Name your document'),
            buttons: this.buttons,
            validateInput: validateDocumentName,
        })
    }

    // TODO: Uncomment code when supporting more document types in future
    // TODO: Add step numbers and update this.totalSteps if this gets added back in!
    //       Note: This will likely use the "this.additionalStep" pattern we're using elsewhere since this makes one branch longer than the other.
    public createDocumentTypePrompter(): QuickPickPrompter<string> {
        const documentTypeItems: DataQuickPickItem<string>[] = [
            {
                label: localize('AWS.ssmDocument.publishWizard.documentType.automation.label', 'Automation'),
                data: 'Automation',
            },
        ]

        return createQuickPick(documentTypeItems, {
            title: localize('AWS.ssmDocument.publishWizard.documentType.title', 'Select document type'),
            buttons: this.buttons
        })
    }

    public createUpdateDocumentPrompter(region: string, documentType?: string): QuickPickPrompter<string> {
        function showError() {
            vscode.window.showErrorMessage(
                localize(
                    'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.noDocument',
                    'No self-owned documents could be found. Please create and upload a Systems Manager Document before updating.'
                )
            )
            return undefined
        }

        const documentItems = this.loadSSMDocument(region, documentType).then(documents => {
            if (!documents || documents.length === 0) {
                showError()
            } else {
                 return documents.map(doc => ({
                    label: doc.Name!,
                    alwaysShow: false,
                    name: doc.Name,
                    description: `DocumentType:${doc.DocumentType}, DocumentVersion:${doc.DocumentVersion}`,
                }))
            }
        }).catch(() => showError())

        return createLabelQuickPick(documentItems, {
            title: localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.title',
                'Select a document to update ({0})',
                region
            ),
            buttons: this.buttons,
        })
    }

    public loadSSMDocument(region: string, documentType?: SSM.Types.DocumentType): Promise<SSM.DocumentIdentifier[]> {
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
        const client = ext.toolkitClientBuilder.createSsmClient(region)
        return toArrayAsync(
            client.listDocuments({
                Filters: filters,
            })
        )
    }
}
