/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { getLogger, Logger } from '../../shared/logger'
import * as picker from '../../shared/ui/picker'

interface StateMachineTemplateQuickPickItem {
    label: string
    description: string
    fileName: string
}

const STARTER_TEMPLATES: StateMachineTemplateQuickPickItem[] = [
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

export async function createStateMachineFromTemplate(context: vscode.ExtensionContext) {
    const logger: Logger = getLogger()

    const quickPick = picker.createQuickPick<StateMachineTemplateQuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectStateMachineTemplate.placeholder', 'Select a starter template'),
            step: 1,
            totalSteps: 1,
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: STARTER_TEMPLATES,
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (_, resolve) => {
            resolve(undefined)
        },
    })

    const selection = picker.verifySinglePickerOutput(choices)

    // User pressed escape
    if (selection === undefined) {
        return
    }

    try {
        logger.debug(`User selected the ${selection.label} template.`)

        const textDocumentFromSelection = await getTextDocumentForSelectedItem(selection, context.extensionPath)

        vscode.window.showTextDocument(textDocumentFromSelection)
    } catch (err) {
        logger.error(err as Error)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.stepfunctions.getTextDocumentForSelectedItem',
                'There was an error creating the State Machine Template, check log for details.'
            )
        )
    }
}

async function getTextDocumentForSelectedItem(
    item: StateMachineTemplateQuickPickItem,
    extensionPath: string
): Promise<vscode.TextDocument> {
    const options = {
        content: await readFileAsString(path.join(extensionPath, 'templates', item.fileName)),
        language: 'asl',
    }

    return await vscode.workspace.openTextDocument(options)
}
