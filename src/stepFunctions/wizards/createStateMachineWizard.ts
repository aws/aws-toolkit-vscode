/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Prompter, PrompterButtons } from '../../shared/ui/prompter'
import { Wizard } from '../../shared/wizards/wizard'
import { initializeInterface } from '../../shared/transformers'
import { createBackButton } from '../../shared/ui/buttons'
import { createLabelQuickPick, createQuickPick, DataQuickPickItem } from '../../shared/ui/picker'

export const STARTER_TEMPLATES: DataQuickPickItem<string>[] = [
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

const TEMPLATE_FORMATS = [{ label: TemplateFormats.JSON }, { label: TemplateFormats.YAML }]

interface CreateStateMachineWizardResponse {
    templateFile: string
    templateFormat: TemplateFormats
}

export interface CreateStateMachineWizardPrompters {
    templateFile: () => Prompter<string>
    templateFormat: () => Prompter<TemplateFormats>
}

const BUTTONS: PrompterButtons = [createBackButton()]

const DEFAULT_PROMPTERS: CreateStateMachineWizardPrompters = {
    templateFile: () => createQuickPick(STARTER_TEMPLATES, {
        title: localize(
            'AWS.message.prompt.selectStateMachineTemplate.placeholder',
            'Select a starter template'
        ),
        buttons: BUTTONS,
    }),
    templateFormat: () => createLabelQuickPick(TEMPLATE_FORMATS, {
        title: localize(
            'AWS.message.prompt.selectStateMachineTemplateFormat.placeholder',
            'Select template format'
        ),
        buttons: BUTTONS,
    })
}

export default class CreateStateMachineWizard extends Wizard<CreateStateMachineWizardResponse> {
    public constructor(prompters: CreateStateMachineWizardPrompters = DEFAULT_PROMPTERS) {
        super(initializeInterface<CreateStateMachineWizardResponse>())
        this.form.templateFile.bindPrompter(prompters.templateFile)
        this.form.templateFormat.bindPrompter(prompters.templateFormat)
    }
}
