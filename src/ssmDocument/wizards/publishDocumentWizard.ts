/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../../shared/awsContext'

import { ext } from '../../shared/extensionGlobals'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import {
    MultiStepWizard,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
    WizardContext,
    wizardContinue,
    WizardStep,
} from '../../shared/wizards/multiStepWizard'
import { validateDocumentName } from '../util/validateDocumentName'
const localize = nls.loadMessageBundle()

export interface PublishSSMDocumentWizardResponse {
    PublishSsmDocAction: string
    name: string
    documentType?: SSM.DocumentType
    region: string
}

export enum PublishSSMDocumentAction {
    QuickCreate,
    QuickUpdate,
}

export interface PublishSSMDocumentWizardContext {
    promptUserForPublishAction(
        region: string,
        publishAction: PublishSSMDocumentAction | undefined
    ): Promise<PublishSSMDocumentAction | undefined>
    promptUserForRegion(initialRegionCode?: string): Promise<string | undefined>
    promptUserForDocumentName(): Promise<string | undefined>
    promptUserForDocumentToUpdate(region: string): Promise<string | undefined>
    promptUserForDocumentType(): Promise<SSM.DocumentType | undefined>
    loadSSMDocument(region: string, documentType?: SSM.Types.DocumentType): Promise<void>
}

export class PublishSSMDocumentWizard extends MultiStepWizard<PublishSSMDocumentWizardResponse> {
    private name?: string
    private publishAction?: PublishSSMDocumentAction
    private documentType?: SSM.DocumentType
    private region: string | undefined

    public constructor(private readonly context: PublishSSMDocumentWizardContext) {
        super()
    }

    protected get startStep() {
        return this.REGION
    }

    protected getResult(): PublishSSMDocumentWizardResponse | undefined {
        if (!this.region) {
            return undefined
        }
        switch (this.publishAction) {
            case PublishSSMDocumentAction.QuickCreate: {
                if (!this.name || !this.documentType) {
                    return undefined
                }

                return {
                    PublishSsmDocAction: 'Create',
                    name: this.name,
                    documentType: this.documentType,
                    region: this.region,
                }
            }

            case PublishSSMDocumentAction.QuickUpdate: {
                if (!this.name) {
                    return undefined
                }

                return {
                    PublishSsmDocAction: 'Update',
                    name: this.name,
                    region: this.region,
                }
            }

            default: {
                return undefined
            }
        }
    }

    private readonly REGION: WizardStep = async () => {
        this.region = await this.context.promptUserForRegion(this.region)

        return this.region ? wizardContinue(this.PUBLISH_ACTION) : WIZARD_TERMINATE
    }

    private readonly PUBLISH_ACTION: WizardStep = async () => {
        this.publishAction = await this.context.promptUserForPublishAction(this.region ?? '', this.publishAction)

        switch (this.publishAction) {
            case PublishSSMDocumentAction.QuickCreate: {
                return wizardContinue(this.NEW_SSM_DOCUMENT_NAME)
            }

            case PublishSSMDocumentAction.QuickUpdate: {
                return wizardContinue(this.EXISTING_SSM_DOCUMENT_NAME)
            }

            default: {
                return WIZARD_GOBACK
            }
        }
    }

    private readonly NEW_SSM_DOCUMENT_TYPE: WizardStep = async () => {
        this.documentType = await this.context.promptUserForDocumentType()

        return this.documentType ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    private readonly NEW_SSM_DOCUMENT_NAME: WizardStep = async () => {
        this.name = await this.context.promptUserForDocumentName()

        return this.name ? wizardContinue(this.NEW_SSM_DOCUMENT_TYPE) : WIZARD_GOBACK
    }

    private readonly EXISTING_SSM_DOCUMENT_NAME: WizardStep = async () => {
        this.documentType = await this.context.promptUserForDocumentType()
        // TODO: make this return and pass the return value to the next step, otherwise the values here will never readjust.
        await this.context.loadSSMDocument(this.region ?? '', this.documentType)
        this.name = await this.context.promptUserForDocumentToUpdate(this.region ?? '')

        return this.name ? WIZARD_TERMINATE : WIZARD_GOBACK
    }
}

export interface PublishActionQuickPickItem {
    label: string
    description?: string
    detail: string
    action: PublishSSMDocumentAction
}

export interface DocumentTypeQuickPickItem {
    label: string
    description?: string
    detail?: string
    documentType: SSM.DocumentType
}

export interface UpdateDocumentQuickPickItem {
    label: string
    description?: string
    detail?: string
    alwaysShow: boolean
    name?: string
}

export class DefaultPublishSSMDocumentWizardContext extends WizardContext implements PublishSSMDocumentWizardContext {
    private documents: SSM.Types.DocumentIdentifierList | undefined

    private readonly totalSteps: number = 3

    public constructor(private readonly awsContext: AwsContext, private readonly regionProvider: RegionProvider) {
        super()
    }

    public async promptUserForRegion(initialRegionCode?: string): Promise<string | undefined> {
        const partitionRegions = getRegionsForActiveCredentials(this.awsContext, this.regionProvider)

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                title: localize(
                    'AWS.message.prompt.ssmDocument.publishDocument.region',
                    'Which AWS Region would you like to publish to?'
                ),
                value: initialRegionCode,
                matchOnDetail: true,
                ignoreFocusOut: true,
                step: 1,
                totalSteps: this.totalSteps,
            },
            items: partitionRegions.map(region => ({
                label: region.name,
                detail: region.id,
                // this is the only way to get this to show on going back
                // this will make it so it always shows even when searching for something else
                alwaysShow: region.id === initialRegionCode,
                description:
                    region.id === initialRegionCode
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : '',
            })),
            buttons: [vscode.QuickInputButtons.Back],
        })

        const choices = await picker.promptUser<vscode.QuickPickItem>({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val?.detail
    }

    public async loadSSMDocument(region: string, documentType?: SSM.Types.DocumentType): Promise<void> {
        if (!this.documents) {
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
            this.documents = await toArrayAsync(
                client.listDocuments({
                    Filters: filters,
                })
            )
        }
    }

    // TODO: Uncomment code when supporting more document types in future
    // TODO: Add step numbers and update this.totalSteps if this gets added back in!
    //       Note: This will likely use the "this.additionalStep" pattern we're using elsewhere since this makes one branch longer than the other.
    public async promptUserForDocumentType(): Promise<SSM.DocumentType | undefined> {
        // const documentTypeItems: DocumentTypeQuickPickItem[] = [
        //     {
        //         label: localize('AWS.ssmDocument.publishWizard.documentType.automation.label', 'Automation'),
        //         documentType: 'Automation',
        //     },
        // ]

        // const quickPick = picker.createQuickPick<DocumentTypeQuickPickItem>({
        //     options: {
        //         ignoreFocusOut: true,
        //         title: localize('AWS.ssmDocument.publishWizard.documentType.title', 'Select document type'),
        //     },
        //     buttons: [vscode.QuickInputButtons.Back],
        //     items: documentTypeItems,
        // })

        // const choices = await picker.promptUser({
        //     picker: quickPick,
        //     onDidTriggerButton: (button, resolve, _reject) => {
        //         if (button === vscode.QuickInputButtons.Back) {
        //             resolve(undefined)
        //         }
        //     },
        // })
        // const picked = picker.verifySinglePickerOutput(choices)

        // return picked ? picked.documentType : undefined
        return 'Automation'
    }

    public async promptUserForDocumentName(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.ssmDocument.publishWizard.ssmDocumentName.title', 'Name your document'),
                ignoreFocusOut: true,
                step: 3,
                totalSteps: this.totalSteps,
            },
            buttons: [vscode.QuickInputButtons.Back],
        })

        return await input.promptUser({
            inputBox: inputBox,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
            onValidateInput: validateDocumentName,
        })
    }

    public async promptUserForDocumentToUpdate(region: string): Promise<string | undefined> {
        let documentItems: UpdateDocumentQuickPickItem[]
        if (!this.documents || !this.documents.length) {
            vscode.window.showErrorMessage(
                localize(
                    'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.noDocument',
                    'No self-owned documents could be found. Please create and upload a Systems Manager Document before updating.'
                )
            )
            return undefined
        } else {
            documentItems = this.documents.map(doc => ({
                label: doc.Name!,
                alwaysShow: false,
                name: doc.Name,
                description: `DocumentType:${doc.DocumentType}, DocumentVersion:${doc.DocumentVersion}`,
            }))
        }

        const quickPick = picker.createQuickPick<UpdateDocumentQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.title',
                    'Select a document to update ({0})',
                    region
                ),
                step: 3,
                totalSteps: this.totalSteps,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: documentItems,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, _reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
        const picked = picker.verifySinglePickerOutput(choices)

        return picked ? picked.name : undefined
    }

    public async promptUserForPublishAction(
        region: string,
        currentAction: PublishSSMDocumentAction | undefined
    ): Promise<PublishSSMDocumentAction | undefined> {
        const publishItems: PublishActionQuickPickItem[] = [
            {
                label: localize('AWS.ssmDocument.publishWizard.publishAction.quickCreate.label', 'Quick Create'),
                detail: localize(
                    'AWS.ssmDocument.publishWizard.publishAction.quickCreate.detail',
                    'Create a Systems Manager Document'
                ),
                action: PublishSSMDocumentAction.QuickCreate,
            },
            {
                label: localize('AWS.ssmDocument.publishWizard.publishAction.quickUpdate.label', 'Quick Update'),
                detail: localize(
                    'AWS.ssmDocument.publishWizard.publishAction.quickUpdate.detail',
                    'Update an existing Systems Manager Document'
                ),
                action: PublishSSMDocumentAction.QuickUpdate,
            },
        ].map((item: PublishActionQuickPickItem) => {
            if (item.action === currentAction) {
                item.description = localize('AWS.wizard.selectedPreviously', 'Selected Previously')
            }

            return item
        })

        const quickPick = picker.createQuickPick<PublishActionQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.ssmDocument.publishWizard.publishAction.title',
                    'Publish to AWS Systems Manager Document ({0})',
                    region
                ),
                step: 2,
                totalSteps: this.totalSteps,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: publishItems,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, _reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
        const picked = picker.verifySinglePickerOutput(choices)

        return picked ? picked.action : undefined
    }
}
