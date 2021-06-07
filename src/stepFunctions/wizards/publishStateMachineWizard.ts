/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { createBackButton, createHelpButton } from '../../shared/ui/buttons'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { Prompter, PrompterButtons } from '../../shared/ui/prompter'
import { isStepFunctionsRole } from '../utils'
import { initializeInterface } from '../../shared/transformers'
import { Wizard } from '../../shared/wizards/wizard'
import { DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/picker'
import { createQuickPick } from '../../shared/ui/picker'
import { InputBoxPrompter, createInputBox } from '../../shared/ui/input'
const localize = nls.loadMessageBundle()

export interface PublishStateMachineWizardContext {
    createUpdateStateMachinePrompter(): Prompter<string>
    createPublishActionPrompter(): Prompter<PublishStateMachineAction>
    createNamePrompter(): Prompter<string>
    createRolePrompter(): Prompter<string>
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

type PublishStateMachineWizardForm = {
    publishAction: PublishStateMachineAction
    createResponse: {
        name: string
        roleArn: string
    }
    updateResponse: {
        stateMachineArn: string
    }
}

export class DefaultPublishStateMachineWizardContext implements PublishStateMachineWizardContext {
    private readonly buttons: PrompterButtons = [createBackButton()]
    private readonly iamClient: IamClient
    private readonly stepFunctionsClient: StepFunctionsClient

    public constructor(private readonly defaultRegion: string) {
        this.stepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(this.defaultRegion)
        this.iamClient = ext.toolkitClientBuilder.createIamClient(this.defaultRegion)
    }

    public createPublishActionPrompter(): QuickPickPrompter<PublishStateMachineAction> {
        const publishItems: DataQuickPickItem<PublishStateMachineAction>[] = [
            {
                label: localize('AWS.stepFunctions.publishWizard.publishAction.quickCreate.label', 'Quick Create'),
                detail: localize(
                    'AWS.stepFunctions.publishWizard.publishAction.quickCreate.detail',
                    'Create a state machine from the ASL definition using default settings'
                ),
                data: PublishStateMachineAction.QuickCreate,
            },
            {
                label: localize('AWS.stepFunctions.publishWizard.publishAction.quickUpdate.label', 'Quick Update'),
                detail: localize(
                    'AWS.stepFunctions.publishWizard.publishAction.quickUpdate.detail',
                    'Update an existing state machine with the ASL definition'
                ),
                data: PublishStateMachineAction.QuickUpdate,
            },
        ]

        const prompter = createQuickPick(publishItems, {
            title: localize(
                'AWS.stepFunctions.publishWizard.publishAction.title',
                'Publish to AWS Step Functions ({0})',
                this.defaultRegion
            ),
            buttons: this.buttons.concat(createHelpButton(sfnDeveloperGuideUrl))
        })

        return prompter
    }

    public createNamePrompter(): InputBoxPrompter {
        function validate(value: string): string | undefined {
            if (!value) {
                return localize(
                    'AWS.stepFunctions.publishWizard.stateMachineName.validation.empty',
                    'State machine name cannot be empty'
                )
            }

            return undefined
        }

        const prompter = createInputBox({
            title: localize('AWS.stepFunctions.publishWizard.stateMachineName.title', 'Name your state machine'),
            validateInput: validate,
            buttons: this.buttons.concat(createHelpButton(sfnCreateStateMachineNameParamUrl))
        })

        return prompter
    }

    public createRolePrompter(): QuickPickPrompter<string> {
        const roles = this.iamClient.listRoles().then(roles => 
            roles.Roles.filter(isStepFunctionsRole)).then(roles => {
                if (!roles || roles.length === 0) {
                    return [
                        {
                            label: localize('AWS.stepFunctions.publishWizard.iamRole.noRoles.label', 'No roles could be found'),
                            alwaysShow: true,
                            data: undefined,
                            detail: localize(
                                'AWS.stepFunctions.publishWizard.iamRole.noRoles.detail',
                                'Create an IAM role before proceeding. See documentation for details.'
                            ),
                        },
                    ]
                } else {
                    return roles.map(iamRole => ({
                        label: iamRole.RoleName,
                        data: iamRole.Arn,
                    }))
                }
            })

        const prompter = createQuickPick(roles, {
            title: localize(
                'AWS.stepFunctions.publishWizard.iamRole.title',
                'Select execution role ({0})',
                this.defaultRegion
            ),
            buttons: this.buttons.concat(createHelpButton(sfnCreateIamRoleUrl))
        })

        return prompter
    }

    public createUpdateStateMachinePrompter(): QuickPickPrompter<string> {
        const stateMachines = 
            toArrayAsync(this.stepFunctionsClient.listStateMachines()).then(machines => {
                if (!machines || machines.length === 0) {
                    return [
                        {
                            label: localize(
                                'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.label',
                                'No state machines could be found'
                            ),
                            alwaysShow: true,
                            data: undefined,
                            detail: localize(
                                'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.detail',
                                'Create a state machine before proceeding. See documentation for details.'
                            ),
                        },
                    ]
                } else {
                    return machines.map(stateMachine => ({
                        label: stateMachine.name,
                        data: stateMachine.stateMachineArn,
                        description: stateMachine.stateMachineArn,
                    }))
                }
            })

        const prompter = createQuickPick(stateMachines, {
            title: localize(
                'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.title',
                'Select state machine to update ({0})',
                this.defaultRegion
            ),
            buttons: this.buttons.concat(createHelpButton(sfnUpdateStateMachineUrl))
        })

        return prompter
    }
}

export class PublishStateMachineWizard extends Wizard<PublishStateMachineWizardForm> {
    public constructor(context: PublishStateMachineWizardContext) {
        super(initializeInterface<PublishStateMachineWizardForm>())
        this.form.publishAction.bindPrompter(() => context.createPublishActionPrompter())
        
        this.form.createResponse.roleArn.bindPrompter(() => context.createRolePrompter(), {
            showWhen: form => form.publishAction === PublishStateMachineAction.QuickCreate
        })
        this.form.createResponse.name.bindPrompter(() => context.createNamePrompter(), {
            showWhen: form => form.publishAction === PublishStateMachineAction.QuickCreate
        })
        this.form.updateResponse.stateMachineArn.bindPrompter(() => context.createUpdateStateMachinePrompter(), {
            showWhen: form => form.publishAction === PublishStateMachineAction.QuickUpdate
        })
    }
}
