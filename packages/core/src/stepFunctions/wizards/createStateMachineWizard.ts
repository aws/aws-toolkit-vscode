/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Wizard } from '../../shared/wizards/wizard'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { sfnCreateStateMachineUrl } from '../../shared/constants'

export const starterTemplates: DataQuickPickItem<string>[] = [
    {
        label: localize('AWS.stepfunctions.template.helloWorld.label', 'Hello world'),
        description: localize(
            'AWS.stepfunctions.template.helloWorld.description',
            'A basic example using a Pass state.'
        ),
        data: 'HelloWorld.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.retryFailure.label', 'Retry failure'),
        description: localize(
            'AWS.stepfunctions.template.retryFailure.description',
            'An example of a Task state using a retry policy to handle Lambda failures.'
        ),
        data: 'RetryFailure.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.waitState.label', 'Wait state'),
        description: localize(
            'AWS.stepfunctions.template.waitState.description',
            'Delays the state machine from continuing for a specified time.'
        ),
        data: 'WaitState.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.parallel.label', 'Parallel'),
        description: localize(
            'AWS.stepfunctions.template.parallel.description',
            'Used to create parallel branches of execution in your state machine.'
        ),
        data: 'Parallel.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.mapState.label', 'Map state'),
        description: localize(
            'AWS.stepfunctions.template.mapState.description',
            'Use a Map state to dynamically process data in an array.'
        ),
        data: 'MapState.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.catchFailure.label', 'Catch failure'),
        description: localize(
            'AWS.stepfunctions.template.catchFailure.description',
            'An example of a Task state using Catchers to handle Lambda failures.'
        ),
        data: 'CatchFailure.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.choiceState.label', 'Choice state'),
        description: localize(
            'AWS.stepfunctions.template.choiceState.description',
            'Adds branching logic to a state machine.'
        ),
        data: 'ChoiceState.asl.json',
    },
]

export enum TemplateFormats {
    YAML = 'YAML',
    JSON = 'JSON',
}

interface CreateStateMachineWizardResponse {
    readonly templateFile: string
    readonly templateFormat: TemplateFormats
}

export class CreateStateMachineWizard extends Wizard<CreateStateMachineWizardResponse> {
    public constructor() {
        super()

        this.form.templateFile.bindPrompter(() =>
            createQuickPick(starterTemplates, {
                title: localize(
                    'AWS.message.prompt.selectStateMachineTemplate.placeholder',
                    'Select a starter template'
                ),
                buttons: createCommonButtons(sfnCreateStateMachineUrl),
            })
        )

        const templateItems = Object.values(TemplateFormats).map(v => ({ label: v, data: v }))
        this.form.templateFormat.bindPrompter(() =>
            createQuickPick(templateItems, {
                title: localize(
                    'AWS.message.prompt.selectStateMachineTemplateFormat.placeholder',
                    'Select template format'
                ),
                buttons: createCommonButtons(sfnCreateStateMachineUrl),
            })
        )
    }
}
