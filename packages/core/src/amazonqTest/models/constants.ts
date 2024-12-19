/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProgressField, MynahIcons, ChatItemButton } from '@aws/mynah-ui'
import { ButtonActions } from '../chat/controller/messenger/messengerUtils'
import { TestGenerationBuildStep } from '../../codewhisperer'
import { ChatSessionManager } from '../chat/storages/chatSession'
import { BuildStatus } from '../chat/session/session'

// For uniquely identifiying which chat messages should be routed to Test
export const testChat = 'testChat'

export const cancelTestGenButton: ChatItemButton = {
    id: ButtonActions.STOP_TEST_GEN,
    text: 'Cancel',
    icon: 'cancel' as MynahIcons,
}

export const testGenProgressField: ProgressField = {
    status: 'default',
    value: -1,
    text: 'Generating unit tests...',
    actions: [cancelTestGenButton],
}

export const testGenCompletedField: ProgressField = {
    status: 'success',
    value: 100,
    text: 'Complete...',
    actions: [],
}

export const cancellingProgressField: ProgressField = {
    status: 'warning',
    text: 'Cancelling...',
    value: -1,
    actions: [],
}

export const cancelBuildProgressButton: ChatItemButton = {
    id: ButtonActions.STOP_BUILD,
    text: 'Cancel',
    icon: 'cancel' as MynahIcons,
}

export const buildProgressField: ProgressField = {
    status: 'default',
    value: -1,
    text: 'Executing...',
    actions: [cancelBuildProgressButton],
}

export const errorProgressField: ProgressField = {
    status: 'error',
    text: 'Error...Input needed',
    value: -1,
    actions: [cancelBuildProgressButton],
}

export const testGenSummaryMessage = (
    fileName: string,
    planSummary?: string
) => `Sure. This may take a few minutes. I'll share updates here as I work on this.

**Generating unit tests for the following methods in \`${fileName}\`**
${planSummary ? `\n\n${planSummary}` : ''}
`

const checkIcons = {
    wait: '&#9744;',
    current: '&#9744;',
    done: '<span style="color: green;">&#10004;</span>',
    error: '&#10060;',
}

interface StepStatus {
    step: TestGenerationBuildStep
    status: 'wait' | 'current' | 'done' | 'error'
}

const stepStatuses: StepStatus[] = []

export const testGenBuildProgressMessage = (currentStep: TestGenerationBuildStep, status?: string) => {
    const session = ChatSessionManager.Instance.getSession()
    const statusText = BuildStatus[session.buildStatus].toLowerCase()
    const icon = session.buildStatus === BuildStatus.SUCCESS ? checkIcons['done'] : checkIcons['error']
    let message = `Sure. This may take a few minutes and I'll share updates on my progress here.
**Progress summary**\n\n`

    if (currentStep === TestGenerationBuildStep.START_STEP) {
        return message.trim()
    }

    updateStepStatuses(currentStep, status)

    if (currentStep >= TestGenerationBuildStep.RUN_BUILD) {
        message += `${getIconForStep(TestGenerationBuildStep.RUN_BUILD)} Started build execution\n`
    }

    if (currentStep >= TestGenerationBuildStep.RUN_EXECUTION_TESTS) {
        message += `${getIconForStep(TestGenerationBuildStep.RUN_EXECUTION_TESTS)} Executing tests\n`
    }

    if (currentStep >= TestGenerationBuildStep.FIXING_TEST_CASES && session.buildStatus === BuildStatus.FAILURE) {
        message += `${getIconForStep(TestGenerationBuildStep.FIXING_TEST_CASES)} Fixing errors in tests\n\n`
    }

    if (currentStep > TestGenerationBuildStep.PROCESS_TEST_RESULTS) {
        message += `**Test case summary**
${session.shortAnswer?.testCoverage ? `- Unit test coverage ${session.shortAnswer?.testCoverage}%` : ``}
${icon} Build ${statusText}
${icon} Assertion ${statusText}`
        // TODO: Update Assertion %
    }

    return message.trim()
}
// TODO: Work on UX to show the build error in the progress message
const updateStepStatuses = (currentStep: TestGenerationBuildStep, status?: string) => {
    for (let step = TestGenerationBuildStep.INSTALL_DEPENDENCIES; step <= currentStep; step++) {
        const stepStatus: StepStatus = {
            step: step,
            status: 'wait',
        }

        if (step === currentStep) {
            stepStatus.status = status === 'failed' ? 'error' : 'current'
        } else if (step < currentStep) {
            stepStatus.status = 'done'
        }

        const existingIndex = stepStatuses.findIndex((s) => s.step === step)
        if (existingIndex !== -1) {
            stepStatuses[existingIndex] = stepStatus
        } else {
            stepStatuses.push(stepStatus)
        }
    }
}

const getIconForStep = (step: TestGenerationBuildStep) => {
    const stepStatus = stepStatuses.find((s) => s.step === step)
    return stepStatus ? checkIcons[stepStatus.status] : checkIcons.wait
}
