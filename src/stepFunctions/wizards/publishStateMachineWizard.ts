/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM, StepFunctions } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { IamClient } from '../../shared/clients/iamClient'
import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import {
    sfnCreateIamRoleUrl,
    sfnCreateStateMachineNameParamUrl,
    sfnDeveloperGuideUrl,
    sfnUpdateStateMachineUrl,
} from '../../shared/constants'
import { ext } from '../../shared/extensionGlobals'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { createHelpButton } from '../../shared/ui/buttons'
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
import { isStepFunctionsRole } from '../utils'
const localize = nls.loadMessageBundle()

export interface PublishStateMachineWizardContext {
    promptUserForStateMachineToUpdate(): Promise<string | undefined>
    promptUserForPublishAction(
        publishAction: PublishStateMachineAction | undefined
    ): Promise<PublishStateMachineAction | undefined>
    promptUserForStateMachineName(): Promise<string | undefined>
    promptUserForIamRole(currRoleArn?: string): Promise<string | undefined>
    loadIamRoles(): Promise<void>
    loadStateMachines(): Promise<void>
}

export enum PublishStateMachineAction {
    QuickCreate,
    QuickUpdate,
}

export interface PublishStateMachineWizardResponse {
    createResponse?: PublishStateMachineWizardCreateResponse
    updateResponse?: PublishStateMachineWizardUpdateResponse
}

export interface PublishStateMachineWizardCreateResponse {
    name: string
    roleArn: string
}

export interface PublishStateMachineWizardUpdateResponse {
    stateMachineArn: string
}

interface AwsResourceQuickPickItem {
    label: string
    description?: string
    arn?: string
    detail?: string
    alwaysShow: boolean
}

interface PublishActionQuickPickItem {
    label: string
    description?: string
    detail: string
    action: PublishStateMachineAction
}
export class DefaultPublishStateMachineWizardContext extends WizardContext implements PublishStateMachineWizardContext {
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))
    private iamRoles: IAM.roleListType | undefined
    private stateMachines: StepFunctions.StateMachineList | undefined
    private readonly iamClient: IamClient
    private readonly stepFunctionsClient: StepFunctionsClient

    private readonly totalSteps = 2
    private additionalSteps: number = 0

    public constructor(private readonly defaultRegion: string) {
        super()
        this.stepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(this.defaultRegion)
        this.iamClient = ext.toolkitClientBuilder.createIamClient(this.defaultRegion)
    }

    public async promptUserForPublishAction(
        currPublishAction: PublishStateMachineAction | undefined
    ): Promise<PublishStateMachineAction | undefined> {
        this.additionalSteps = 0
        const publishItems: PublishActionQuickPickItem[] = [
            {
                label: localize('AWS.stepFunctions.publishWizard.publishAction.quickCreate.label', 'Quick Create'),
                detail: localize(
                    'AWS.stepFunctions.publishWizard.publishAction.quickCreate.detail',
                    'Create a state machine from the ASL definition using default settings'
                ),
                action: PublishStateMachineAction.QuickCreate,
            },
            {
                label: localize('AWS.stepFunctions.publishWizard.publishAction.quickUpdate.label', 'Quick Update'),
                detail: localize(
                    'AWS.stepFunctions.publishWizard.publishAction.quickUpdate.detail',
                    'Update an existing state machine with the ASL definition'
                ),
                action: PublishStateMachineAction.QuickUpdate,
            },
        ].map((item: PublishActionQuickPickItem) => {
            if (item.action === currPublishAction) {
                item.description = localize('AWS.wizard.selectedPreviously', 'Selected Previously')
            }

            return item
        })

        const quickPick = picker.createQuickPick<PublishActionQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.stepFunctions.publishWizard.publishAction.title',
                    'Publish to {0} Step Functions ({1})',
                    getIdeProperties().company,
                    this.defaultRegion
                ),
                step: 1,
                totalSteps: this.totalSteps,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: publishItems,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(sfnDeveloperGuideUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput(choices)

        return val ? val.action : undefined
    }

    public async promptUserForStateMachineName(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.stepFunctions.publishWizard.stateMachineName.title', 'Name your state machine'),
                ignoreFocusOut: true,
                step: 3,
                totalSteps: this.totalSteps + this.additionalSteps,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
        })

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: (value: string) => {
                if (!value) {
                    return localize(
                        'AWS.stepFunctions.publishWizard.stateMachineName.validation.empty',
                        'State machine name cannot be empty'
                    )
                }

                return undefined
            },
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(sfnCreateStateMachineNameParamUrl))
                }
            },
        })
    }

    public async loadIamRoles() {
        if (!this.iamRoles) {
            this.iamRoles = (await this.iamClient.listRoles()).Roles.filter(isStepFunctionsRole)
        }
    }

    public async promptUserForIamRole(currRoleArn?: string): Promise<string | undefined> {
        this.additionalSteps = 1
        let roles: AwsResourceQuickPickItem[]
        if (!this.iamRoles || this.iamRoles.length === 0) {
            roles = [
                {
                    label: localize('AWS.stepFunctions.publishWizard.iamRole.noRoles.label', 'No roles could be found'),
                    alwaysShow: true,
                    arn: undefined,
                    detail: localize(
                        'AWS.stepFunctions.publishWizard.iamRole.noRoles.detail',
                        'Create an IAM role before proceeding. See documentation for details.'
                    ),
                },
            ]
        } else {
            roles = this.iamRoles.map(iamRole => ({
                label: iamRole.RoleName,
                alwaysShow: iamRole.Arn === currRoleArn,
                arn: iamRole.Arn,
                description:
                    iamRole.Arn === currRoleArn
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : iamRole.Arn,
            }))
        }

        const quickPick = picker.createQuickPick<AwsResourceQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.stepFunctions.publishWizard.iamRole.title',
                    'Select execution role ({0})',
                    this.defaultRegion
                ),
                value: currRoleArn ? currRoleArn : '',
                step: 2,
                totalSteps: this.totalSteps + this.additionalSteps,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: roles,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(sfnCreateIamRoleUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput<AwsResourceQuickPickItem>(choices)

        return val ? val.arn : undefined
    }

    public async loadStateMachines() {
        if (!this.stateMachines) {
            this.stateMachines = await toArrayAsync(this.stepFunctionsClient.listStateMachines())
        }
    }

    public async promptUserForStateMachineToUpdate(): Promise<string | undefined> {
        let stateMachines: AwsResourceQuickPickItem[]
        if (!this.stateMachines || this.stateMachines.length === 0) {
            stateMachines = [
                {
                    label: localize(
                        'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.label',
                        'No state machines could be found'
                    ),
                    alwaysShow: true,
                    arn: undefined,
                    detail: localize(
                        'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.detail',
                        'Create a state machine before proceeding. See documentation for details.'
                    ),
                },
            ]
        } else {
            stateMachines = this.stateMachines.map(stateMachine => ({
                label: stateMachine.name,
                alwaysShow: false,
                arn: stateMachine.stateMachineArn,
                description: stateMachine.stateMachineArn,
            }))
        }

        const quickPick = picker.createQuickPick<AwsResourceQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.title',
                    'Select state machine to update ({0})',
                    this.defaultRegion
                ),
                step: 2,
                totalSteps: this.totalSteps,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: stateMachines,
        })

        const choices = await picker.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(sfnUpdateStateMachineUrl))
                }
            },
        })
        const val = picker.verifySinglePickerOutput<AwsResourceQuickPickItem>(choices)

        return val ? val.arn : undefined
    }
}
export class PublishStateMachineWizard extends MultiStepWizard<PublishStateMachineWizardResponse> {
    private name?: string
    private roleArn?: string
    private publishAction?: PublishStateMachineAction
    private stateMachineArn?: string

    public constructor(private readonly context: PublishStateMachineWizardContext) {
        super()
    }

    protected get startStep() {
        return this.PUBLISH_ACTION
    }

    protected getResult(): PublishStateMachineWizardResponse | undefined {
        switch (this.publishAction) {
            case PublishStateMachineAction.QuickCreate:
                if (!this.name || !this.roleArn) {
                    return undefined
                }

                return {
                    createResponse: {
                        name: this.name,
                        roleArn: this.roleArn,
                    },
                }

            case PublishStateMachineAction.QuickUpdate:
                if (!this.stateMachineArn) {
                    return undefined
                }

                return {
                    updateResponse: {
                        stateMachineArn: this.stateMachineArn,
                    },
                }

            default:
                return undefined
        }
    }

    private readonly PUBLISH_ACTION: WizardStep = async () => {
        this.publishAction = await this.context.promptUserForPublishAction(this.publishAction)

        switch (this.publishAction) {
            case PublishStateMachineAction.QuickCreate:
                return wizardContinue(this.ROLE_ARN)

            case PublishStateMachineAction.QuickUpdate:
                return wizardContinue(this.EXISTING_STATE_MACHINE_ARN)

            default:
                return WIZARD_TERMINATE
        }
    }

    private readonly ROLE_ARN: WizardStep = async () => {
        await this.context.loadIamRoles()
        this.roleArn = await this.context.promptUserForIamRole(this.roleArn)

        return this.roleArn ? wizardContinue(this.NEW_STATE_MACHINE_NAME) : WIZARD_GOBACK
    }

    private readonly NEW_STATE_MACHINE_NAME: WizardStep = async () => {
        this.name = await this.context.promptUserForStateMachineName()

        return this.name ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    private readonly EXISTING_STATE_MACHINE_ARN: WizardStep = async () => {
        await this.context.loadStateMachines()
        this.stateMachineArn = await this.context.promptUserForStateMachineToUpdate()

        return this.stateMachineArn ? WIZARD_TERMINATE : WIZARD_GOBACK
    }
}
