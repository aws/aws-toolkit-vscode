/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { ssmDocumentPublishGuideUrl } from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { createHelpButton } from '../../shared/ui/buttons'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { MultiStepWizard, WizardContext, WizardStep } from '../../shared/wizards/multiStepWizard'
const localize = nls.loadMessageBundle()

export interface PublishSSMDocumentWizardResponse {
    createResponse?: {
        name: string
        documentType: SSM.DocumentType
    }
    updateResponse?: {
        name: string
    }
}

export enum PublishSSMDocumentAction {
    QuickCreate,
    QuickUpdate,
}

export interface PublishSSMDocumentWizardContext {
    promptUserForPublishAction(
        publishAction: PublishSSMDocumentAction | undefined
    ): Promise<PublishSSMDocumentAction | undefined>
    promptUserForDocumentName(): Promise<string | undefined>
    promptUserForDocumentToUpdate(): Promise<string | undefined>
    promptUserForDocumentType(): Promise<SSM.DocumentType | undefined>
    loadSSMDocument(): Promise<void>
}

export class PublishSSMDocumentWizard extends MultiStepWizard<PublishSSMDocumentWizardResponse> {
    private name?: string
    private publishAction?: PublishSSMDocumentAction
    private documentType?: SSM.DocumentType

    public constructor(private readonly context: PublishSSMDocumentWizardContext) {
        super()
    }

    protected get startStep() {
        return this.PUBLISH_ACTION
    }

    protected getResult(): PublishSSMDocumentWizardResponse | undefined {
        switch (this.publishAction) {
            case PublishSSMDocumentAction.QuickCreate: {
                if (!this.name || !this.documentType) {
                    return undefined
                }

                return {
                    createResponse: {
                        name: this.name,
                        documentType: this.documentType,
                    },
                }
            }

            case PublishSSMDocumentAction.QuickUpdate: {
                if (!this.name) {
                    return undefined
                }

                return {
                    updateResponse: {
                        name: this.name,
                    },
                }
            }

            default: {
                return undefined
            }
        }
    }

    private readonly PUBLISH_ACTION: WizardStep = async () => {
        this.publishAction = await this.context.promptUserForPublishAction(this.publishAction)

        switch (this.publishAction) {
            case PublishSSMDocumentAction.QuickCreate: {
                return this.NEW_SSM_DOCUMENT_NAME
            }

            case PublishSSMDocumentAction.QuickUpdate: {
                return this.EXISTING_SSM_DOCUMENT_NAME
            }

            default: {
                return undefined
            }
        }
    }

    private readonly NEW_SSM_DOCUMENT_TYPE: WizardStep = async () => {
        this.documentType = await this.context.promptUserForDocumentType()

        return this.documentType ? undefined : this.PUBLISH_ACTION
    }

    private readonly NEW_SSM_DOCUMENT_NAME: WizardStep = async () => {
        this.name = await this.context.promptUserForDocumentName()

        return this.name ? this.NEW_SSM_DOCUMENT_TYPE : this.PUBLISH_ACTION
    }

    private readonly EXISTING_SSM_DOCUMENT_NAME: WizardStep = async () => {
        await this.context.loadSSMDocument()
        this.name = await this.context.promptUserForDocumentToUpdate()

        return this.name ? undefined : this.PUBLISH_ACTION
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
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Documentation'))
    private documents: SSM.Types.DocumentIdentifierList | undefined
    private readonly ssmDocumentClient: SsmDocumentClient

    public constructor(private readonly defaultRegion: string) {
        super()
        this.ssmDocumentClient = ext.toolkitClientBuilder.createSsmClient(this.defaultRegion)
    }

    public async loadSSMDocument(): Promise<void> {
        if (!this.documents) {
            this.documents = await toArrayAsync(
                this.ssmDocumentClient.listDocuments({
                    Filters: [
                        {
                            Key: 'Owner',
                            Values: ['Self'],
                        },
                    ],
                })
            )
        }
    }

    public async promptUserForDocumentType(): Promise<SSM.DocumentType | undefined> {
        const documentTypeItems: DocumentTypeQuickPickItem[] = [
            {
                label: localize('AWS.ssmDocument.publishWizard.documentType.automation.label', 'Automation'),
                documentType: 'Automation',
            },
        ]

        const quickPick = picker.createQuickPick<DocumentTypeQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.ssmDocument.publishWizard.documentType.title', 'Select document type'),
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: documentTypeItems,
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

        return picked ? picked.documentType : undefined
    }

    public async promptUserForDocumentName(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.ssmDocument.publishWizard.ssmDocumentName.title', 'Name your document'),
                ignoreFocusOut: true,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
        })

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: (value: string) => {
                if (!value) {
                    return localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.empty',
                        'Document name cannot be empty'
                    )
                }

                if (value.startsWith('AWS-') || value.startsWith('Amazon')) {
                    return localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.reservedWord',
                        'Document name cannot start with Amazon or AWS-'
                    )
                }

                if (!value.match(/^[a-zA-Z0-9_\-.]+$/g)) {
                    return localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.invalidCharacter',
                        'Document name contains invalid characters, only a-z, A-Z, 0-9, and _, -, and . are allowed'
                    )
                }

                if (value.length < 3 || value.length > 128) {
                    return localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.invalidLength',
                        'Document name length must be between 3 and 128 characters'
                    )
                }

                return undefined
            },
            onDidTriggerButton: (button, resolve, _reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
    }

    public async promptUserForDocumentToUpdate(): Promise<string | undefined> {
        let documentItems: UpdateDocumentQuickPickItem[]
        if (!this.documents || !this.documents.length) {
            documentItems = [
                {
                    label: localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.noDocument.label',
                        'No document owned by me could be found'
                    ),
                    alwaysShow: true,
                    name: undefined,
                    detail: localize(
                        'AWS.ssmDocument.publishWizard.ssmDocumentToUpdate.noDocument.detail',
                        'Please create and upload a SSM Document before updating.'
                    ),
                },
            ]
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
                    this.defaultRegion
                ),
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
        currentAction: PublishSSMDocumentAction | undefined
    ): Promise<PublishSSMDocumentAction | undefined> {
        const publishItems: PublishActionQuickPickItem[] = [
            {
                label: localize('AWS.ssmDocument.publishWizard.publishAction.quickCreate.label', 'Quick Create'),
                detail: localize(
                    'AWS.ssmDocument.publishWizard.publishAction.quickCreate.detail',
                    'Upload a local SSM Document as a new Document'
                ),
                action: PublishSSMDocumentAction.QuickCreate,
            },
            {
                label: localize('AWS.ssmDocument.publishWizard.publishAction.quickUpdate.label', 'Quick Update'),
                detail: localize(
                    'AWS.ssmDocument.publishWizard.publishAction.quickUpdate.detail',
                    'Upload a local SSM Document to update an existing Document'
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
                    'Publish to AWS SSM Document ({0})',
                    this.defaultRegion
                ),
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: publishItems,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, _reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(ssmDocumentPublishGuideUrl))
                }
            },
        })
        const picked = picker.verifySinglePickerOutput(choices)

        return picked ? picked.action : undefined
    }
}
