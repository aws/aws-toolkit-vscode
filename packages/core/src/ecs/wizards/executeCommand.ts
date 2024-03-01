/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ecsExecToolkitGuideUrl } from '../../shared/constants'
import { codicon, getIcon } from '../../shared/icons'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { WIZARD_EXIT, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { Container } from '../model'

export interface CommandWizardState {
    task: string
    command: string
    confirmation?: 'yes' | 'suppress'
}

function createTaskPrompter(node: Container) {
    const taskItems = (async () => {
        // Filter for only 'Running' tasks
        return (await node.listTasks()).map(task => {
            // TODO: get task definition name and include it in the item detail
            // The last 32 digits of the task arn is the task identifier
            const taskId = task.taskArn.substring(task.taskArn.length - 32)
            const invalidSelection = task.lastStatus !== 'RUNNING'

            return {
                label: codicon`${invalidSelection ? getIcon('vscode-error') : ''}${taskId}`,
                detail: `Status: ${task.lastStatus}  Desired status: ${task.desiredStatus}`,
                description:
                    invalidSelection && task.desiredStatus === 'RUNNING'
                        ? 'Container instance starting, try again later.'
                        : undefined,
                data: taskId,
                invalidSelection,
            }
        })
    })()

    return createQuickPick(taskItems, {
        title: localize('AWS.command.ecs.runCommandInContainer.chooseInstance', 'Choose a container instance'),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
        noItemsFoundItem: {
            label: localize(
                'AWS.command.ecs.runCommandInContainer.noInstances',
                'No valid instances for this container'
            ),
            detail: localize(
                'AWS.command.ecs.runCommandInContainer.noInstances.description',
                'If command execution was recently enabled, try again in a few minutes.'
            ),
            data: WIZARD_BACK,
        },
        compare: (a, b) => (a.invalidSelection ? 1 : b.invalidSelection ? -1 : 0),
    })
}

function createCommandPrompter(node: Container) {
    return createInputBox({
        title: localize(
            'AWS.command.ecs.runCommandInContainer.prompt',
            'Enter the command to run in container: {0}',
            node.description.name!
        ),
        placeholder: localize('AWS.command.ecs.runCommandInContainer.placeHolder', 'Command to run'),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
    })
}

function createConfirmationPrompter(node: Container, task: string, command: string) {
    const choices: DataQuickPickItem<'yes' | 'suppress'>[] = [
        {
            label: localize('AWS.generic.response.yes', 'Yes'),
            data: 'yes' as 'yes' | 'suppress',
            detail: `Task: ${task}  Command: ${command}`,
        },
        {
            label: localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again"),
            data: 'suppress' as 'yes' | 'suppress',
        },
        { label: localize('AWS.generic.response.no', 'No'), data: WIZARD_EXIT },
    ]
    return createQuickPick(choices, {
        title: localize(
            'AWS.command.ecs.runCommandInContainer.warnBeforeExecute',
            'Command may modify the running container {0}. Are you sure?',
            node.description.name!
        ),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
    })
}

export class CommandWizard extends Wizard<CommandWizardState> {
    public constructor(container: Container, shouldShowConfirmation: boolean, command?: string) {
        super({ initState: { command } })

        this.form.task.bindPrompter(() => createTaskPrompter(container))
        this.form.command.bindPrompter(() => createCommandPrompter(container))
        if (shouldShowConfirmation) {
            this.form.confirmation.bindPrompter(state =>
                createConfirmationPrompter(container, state.task!, state.command!)
            )
        }
    }
}
