/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'

import {
    MultiStepWizard,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
    wizardContinue,
    WizardStep,
} from '../../shared/wizards/multiStepWizard'

export interface StateMachineTemplateQuickPickItem {
    label: string
    description: string
    fileName: string
}

export const STARTER_TEMPLATES: StateMachineTemplateQuickPickItem[] = [
    {
        label: localize('AWS.stepfunctions.template.helloWorld.label', 'Hello world'),
        description: localize(
            'AWS.stepfunctions.template.helloWorld.description',
            'A basic example using a Pass state.'
        ),
        fileName: 'HelloWorld.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.retryFailure.label', 'Retry failure'),
        description: localize(
            'AWS.stepfunctions.template.retryFailure.description',
            'An example of a Task state using a retry policy to handle Lambda failures.'
        ),
        fileName: 'RetryFailure.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.waitState.label', 'Wait state'),
        description: localize(
            'AWS.stepfunctions.template.waitState.description',
            'Delays the state machine from continuing for a specified time.'
        ),
        fileName: 'WaitState.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.parallel.label', 'Parallel'),
        description: localize(
            'AWS.stepfunctions.template.parallel.description',
            'Used to create parallel branches of execution in your state machine.'
        ),
        fileName: 'Parallel.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.mapState.label', 'Map state'),
        description: localize(
            'AWS.stepfunctions.template.mapState.description',
            'Use a Map state to dynamically process data in an array.'
        ),
        fileName: 'MapState.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.catchFailure.label', 'Catch failure'),
        description: localize(
            'AWS.stepfunctions.template.catchFailure.description',
            'An example of a Task state using Catchers to handle Lambda failures.'
        ),
        fileName: 'CatchFailure.asl.json',
    },
    {
        label: localize('AWS.stepfunctions.template.choiceState.label', 'Choice state'),
        description: localize(
            'AWS.stepfunctions.template.choiceState.description',
            'Adds branching logic to a state machine.'
        ),
        fileName: 'ChoiceState.asl.json',
    },
]

export enum TemplateFormats {
    YAML = 'YAML',
    JSON = 'JSON',
}

const TEMPLATE_FORMATS = [{ label: TemplateFormats.JSON }, { label: TemplateFormats.YAML }]

interface CreateStateMachineWizardResponse {
    template: StateMachineTemplateQuickPickItem
    templateFormat: TemplateFormats
}

export default class CreateStateMachineWizard extends MultiStepWizard<CreateStateMachineWizardResponse> {
    private template?: StateMachineTemplateQuickPickItem
    private templateFormat?: TemplateFormats
    private promptUser: typeof picker.promptUser

    public constructor(promptUser?: typeof picker.promptUser) {
        super()

        this.promptUser = promptUser || picker.promptUser.bind(picker)
    }

    protected get startStep() {
        return this.CREATE_TEMPLATE_ACTION
    }

    private readonly CREATE_TEMPLATE_ACTION: WizardStep = async () => {
        const quickPick = picker.createQuickPick<StateMachineTemplateQuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectStateMachineTemplate.placeholder',
                    'Select a starter template'
                ),
                step: 1,
                totalSteps: 2,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: STARTER_TEMPLATES,
        })

        const choices = await this.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        console.log(choices)

        this.template = picker.verifySinglePickerOutput<StateMachineTemplateQuickPickItem>(choices)

        return this.template ? wizardContinue(this.TEMPLATE_FORMAT_ACTION) : WIZARD_GOBACK
    }

    private readonly TEMPLATE_FORMAT_ACTION: WizardStep = async () => {
        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectStateMachineTemplateFormat.placeholder',
                    'Select template format'
                ),
                step: 2,
                totalSteps: 2,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: TEMPLATE_FORMATS,
        })

        const choices = await this.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        this.templateFormat = picker.verifySinglePickerOutput<{ label: TemplateFormats }>(choices)?.label

        return this.templateFormat ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    protected getResult() {
        return (
            (this.template &&
                this.templateFormat && {
                    template: this.template,
                    templateFormat: this.templateFormat,
                }) ||
            undefined
        )
    }
}
