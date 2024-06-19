/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import {
    sfnCreateIamRoleUrl,
    sfnCreateStateMachineNameParamUrl,
    sfnDeveloperGuideUrl,
    sfnSupportedRegionsUrl,
    sfnUpdateStateMachineUrl,
} from '../../shared/constants'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { isStepFunctionsRole } from '../utils'
import { createRolePrompter } from '../../shared/ui/common/roles'
import { DefaultIamClient } from '../../shared/clients/iamClient'
import { DefaultStepFunctionsClient } from '../../shared/clients/stepFunctionsClient'

export enum PublishStateMachineAction {
    QuickCreate,
    QuickUpdate,
}

function createPublishActionPrompter(region: string): QuickPickPrompter<PublishStateMachineAction> {
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
            region
        ),
        buttons: createCommonButtons(sfnDeveloperGuideUrl),
    })

    return prompter
}

function createNamePrompter(): InputBoxPrompter {
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
        buttons: createCommonButtons(sfnCreateStateMachineNameParamUrl),
    })

    return prompter
}

export interface PublishStateMachineWizardState {
    readonly region: string
    readonly publishAction: PublishStateMachineAction
    readonly createResponse?: {
        readonly name: string
        readonly roleArn: string
    }
    readonly updateResponse?: {
        readonly stateMachineArn: string
    }
}

function createStepFunctionsRolePrompter(region: string) {
    const client = new DefaultIamClient(region)

    return createRolePrompter(client, {
        helpUrl: vscode.Uri.parse(sfnCreateIamRoleUrl),
        title: localize('AWS.stepFunctions.publishWizard.iamRole.title', 'Select execution role ({0})', region),
        noRoleDetail: localize(
            'AWS.stepFunctions.publishWizard.iamRole.noRoles.detail',
            'Create an IAM role before proceeding. See documentation for details.'
        ),
        roleFilter: isStepFunctionsRole,
    })
}

async function* listStateMachines(region: string) {
    const client = new DefaultStepFunctionsClient(region)

    for await (const machine of client.listStateMachines()) {
        yield [
            {
                label: machine.name,
                data: machine.stateMachineArn,
                description: machine.stateMachineArn,
            },
        ]
    }
}

function createUpdateStateMachinePrompter(region: string): QuickPickPrompter<string> {
    const prompter = createQuickPick(listStateMachines(region), {
        title: localize(
            'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.title',
            'Select state machine to update ({0})',
            region
        ),
        buttons: createCommonButtons(sfnUpdateStateMachineUrl),
        noItemsFoundItem: {
            label: localize(
                'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.label',
                'No state machines could be found'
            ),
            alwaysShow: true,
            data: WIZARD_BACK,
            detail: localize(
                'AWS.stepFunctions.publishWizard.stateMachineNameToUpdate.noStateMachines.detail',
                'Create a state machine before proceeding. See documentation for details.'
            ),
        },
    })

    return prompter
}

export class PublishStateMachineWizard extends Wizard<PublishStateMachineWizardState> {
    public constructor(region?: string) {
        super({ initState: { region } })
        const form = this.form

        form.region.bindPrompter(() =>
            createRegionPrompter(undefined, {
                serviceFilter: 'states',
                helpUrl: sfnSupportedRegionsUrl,
            }).transform(r => r.id)
        )

        form.publishAction.bindPrompter(({ region }) => createPublishActionPrompter(region!))

        form.createResponse.roleArn.bindPrompter(
            ({ region }) => createStepFunctionsRolePrompter(region!).transform(r => r.Arn),
            {
                showWhen: form => form.publishAction === PublishStateMachineAction.QuickCreate,
            }
        )

        form.createResponse.name.bindPrompter(() => createNamePrompter(), {
            showWhen: form => form.publishAction === PublishStateMachineAction.QuickCreate,
        })

        form.updateResponse.stateMachineArn.bindPrompter(({ region }) => createUpdateStateMachinePrompter(region!), {
            showWhen: form => form.publishAction === PublishStateMachineAction.QuickUpdate,
        })
    }
}
