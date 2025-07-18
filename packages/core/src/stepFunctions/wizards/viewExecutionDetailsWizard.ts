/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { validate } from '@aws-sdk/util-arn-parser'
import { isExpressExecution } from '../utils'

function createExecutionArnPrompter(): InputBoxPrompter {
    function validateArn(value: string): string | undefined {
        if (!value) {
            return localize(
                'AWS.stepFunctions.viewExecutionDetails.executionArn.validation.empty',
                'Execution ARN cannot be empty'
            )
        }

        if (!validate(value)) {
            return localize(
                'AWS.stepFunctions.viewExecutionDetails.executionArn.validation.invalid',
                'Invalid ARN format. Please provide a valid Step Functions execution ARN'
            )
        }

        return undefined
    }

    const prompter = createInputBox({
        title: localize('AWS.stepFunctions.viewExecutionDetails.executionArn.title', 'Enter Execution ARN'),
        placeholder:
            'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:12345678-1234-1234-1234-123456789012',
        validateInput: validateArn,
        buttons: createCommonButtons(),
    })

    return prompter
}

function createStartTimePrompter(): InputBoxPrompter {
    function validateStartTime(value: string): string | undefined {
        if (!value) {
            return localize(
                'AWS.stepFunctions.viewExecutionDetails.startTime.validation.empty',
                'Start time cannot be empty for express executions'
            )
        }

        // Checking if the value is a numeric string (Unix timestamp)
        if (/^\d+$/.test(value)) {
            const timestamp = Number(value)
            const date = new Date(timestamp)
            if (!isNaN(date.getTime())) {
                return undefined
            }
        }

        // parsing ISO date format
        const date = new Date(value)
        if (isNaN(date.getTime())) {
            return localize(
                'AWS.stepFunctions.viewExecutionDetails.startTime.validation.invalid',
                'Invalid time format. Use Unix timestamp or ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
            )
        }

        return undefined
    }

    const prompter = createInputBox({
        title: localize('AWS.stepFunctions.viewExecutionDetails.startTime.title', 'Enter Start Time'),
        placeholder: localize(
            'AWS.stepFunctions.viewExecutionDetails.startTime.placeholder',
            'Start time of the express execution (e.g., 2023-12-01T10:00:00.000Z)'
        ),
        validateInput: validateStartTime,
        buttons: createCommonButtons(),
    })

    return prompter
}

export interface ViewExecutionDetailsWizardState {
    readonly executionArn: string
    readonly startTime?: string
}

export class ViewExecutionDetailsWizard extends Wizard<ViewExecutionDetailsWizardState> {
    public constructor() {
        super()
        const form = this.form

        form.executionArn.bindPrompter(() => createExecutionArnPrompter())

        form.startTime.bindPrompter(() => createStartTimePrompter(), {
            showWhen: (state) => {
                if (!state.executionArn) {
                    return false
                }
                return isExpressExecution(state.executionArn)
            },
        })
    }
}
