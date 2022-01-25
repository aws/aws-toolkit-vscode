/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'
import { ecsExecToolkitGuideUrl } from '../../shared/constants'
import { isCloud9 } from '../../shared/extensionUtilities'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { WIZARD_EXIT, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { EcsContainerNode } from '../explorer/ecsContainerNode'

export interface CommandWizardState {
    task: string
    command: string
    confirmation?: 'yes' | 'suppress'
}

function createValidTaskFilter(containerName: string) {
    return function (t: ECS.Task): t is ECS.Task & { taskArn: string } {
        const managed = !!t.containers?.find(
            c => c?.name === containerName && c.managedAgents?.find(a => a.name === 'ExecuteCommandAgent')
        )

        return t.taskArn !== undefined && managed
    }
}

function createTaskPrompter(node: EcsContainerNode) {
    const taskItems = (async () => {
        const taskArns = await node.listTasks()
        if (taskArns.length === 0) {
            return []
        }
        // Filter for only 'Running' tasks
        return (await node.describeTasks(taskArns)).filter(createValidTaskFilter(node.containerName)).map(task => {
            // The last 32 digits of the task arn is the task identifier
            const taskId = task.taskArn.substring(task.taskArn.length - 32)
            const invalidSelection = task.lastStatus !== 'RUNNING'

            return {
                label: `${invalidSelection && !isCloud9() ? '$(error) ' : ''}${taskId}`,
                detail: `Status: ${task.lastStatus}  Desired status: ${task.desiredStatus}`,
                description:
                    invalidSelection && task.desiredStatus === 'RUNNING'
                        ? 'Task starting, try again later.'
                        : undefined,
                data: taskId,
                invalidSelection,
            }
        })
    })()
    return createQuickPick(taskItems, {
        title: localize('AWS.command.ecs.runCommandInContainer.chooseTask', 'Choose a task'),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
        noItemsFoundItem: {
            label: localize('AWS.command.ecs.runCommandInContainer.noTasks', 'No valid tasks for this container'),
            detail: localize(
                'AWS.command.ecs.runCommandInContainer.noTasks.description',
                'If command execution was recently enabled, try again in a few minutes.'
            ),
            data: WIZARD_BACK,
        },
        compare: (a, b) => (a.invalidSelection ? 1 : b.invalidSelection ? -1 : 0),
    })
}

function createCommandPrompter(node: EcsContainerNode) {
    return createInputBox({
        title: localize(
            'AWS.command.ecs.runCommandInContainer.prompt',
            'Enter the command to run in container: {0}',
            node.containerName
        ),
        placeholder: localize('AWS.command.ecs.runCommandInContainer.placeHolder', 'Command to run'),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
    })
}

function createConfirmationPrompter(node: EcsContainerNode, task: string, command: string) {
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
            node.containerName
        ),
        buttons: createCommonButtons(ecsExecToolkitGuideUrl),
    })
}

export class CommandWizard extends Wizard<CommandWizardState> {
    public constructor(node: EcsContainerNode, shouldShowConfirmation: boolean) {
        super()
        this.form.task.bindPrompter(() => createTaskPrompter(node))
        this.form.command.bindPrompter(() => createCommandPrompter(node))
        if (shouldShowConfirmation) {
            this.form.confirmation.bindPrompter(state => createConfirmationPrompter(node, state.task!, state.command!))
        }
    }
}
