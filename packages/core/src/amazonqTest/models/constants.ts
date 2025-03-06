/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProgressField, MynahIcons, ChatItemButton } from '@aws/mynah-ui'
import { ButtonActions } from '../chat/controller/messenger/messengerUtils'
import { TestGenerationBuildStep } from '../../codewhisperer/models/constants'
import { ChatSessionManager } from '../chat/storages/chatSession'
import { BuildStatus } from '../chat/session/session'

// For uniquely identifiying which chat messages should be routed to Test
export const testChat = 'testChat'

export const maxUserPromptLength = 4096 // user prompt character limit from MPS and API model.

const baseProgressField: Partial<ProgressField> = {
    status: 'default',
    value: -1,
}

export const cancelTestGenButton: ChatItemButton = {
    id: ButtonActions.STOP_TEST_GEN,
    text: 'Cancel',
    icon: 'cancel' as MynahIcons,
}

export const testGenProgressField: ProgressField = {
    ...baseProgressField,
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

export const cancelFixingTestButton: ChatItemButton = {
    id: ButtonActions.STOP_FIXING_TEST,
    text: 'Cancel',
    icon: 'cancel' as MynahIcons,
}

export const buildProgressField: ProgressField = {
    ...baseProgressField,
    text: 'Compiling project...',
    actions: [cancelBuildProgressButton],
}

export const fixingTestProgressField: ProgressField = {
    ...baseProgressField,
    text: 'Fixing test failures...',
    actions: [cancelFixingTestButton],
}

export const errorProgressField: ProgressField = {
    status: 'error',
    text: 'Error...Input needed',
    value: -1,
    actions: [cancelTestGenButton],
}

export const testGenSummaryMessage = (
    fileName: string,
    planSummary?: string
) => `Sure. This may take a few minutes. I'll share updates here as I work on this.

**Generating unit tests for the following methods in \`${fileName}\`**
${planSummary ? `\n\n${planSummary}` : ''}
`

const checkIcons = {
    wait: '&#9203;',
    current: '&#9203;',
    done: '<span style="color: green;">&#10004;</span>',
    error: '&#10060;',
}
// TODO: Commenting out this code to do a better UX in the V2 version after science support
/*
interface StepStatus {
    step: TestGenerationBuildStep
    status: 'wait' | 'current' | 'done' | 'error'
}

const stepStatuses: StepStatus[] = []
*/
export const testGenBuildProgressMessage = (currentStep: TestGenerationBuildStep, status?: string) => {
    const session = ChatSessionManager.Instance.getSession()
    let message = `Sure. This may take a few minutes and I'll update the progress here.\n
**Progress summary**\n\n`

    if (currentStep === TestGenerationBuildStep.START_STEP) {
        return message.trim()
    }

    if (currentStep === TestGenerationBuildStep.RUN_BUILD) {
        message += `${checkIcons['wait']} Project compiling\n\n`
    }
    if (currentStep === TestGenerationBuildStep.FIXING_TEST_CASES && session.buildStatus === BuildStatus.FAILURE) {
        message += `${checkIcons['wait']} Fixing test failures\n\n`
    } else if (
        currentStep >= TestGenerationBuildStep.FIXING_TEST_CASES &&
        session.buildStatus === BuildStatus.FAILURE
    ) {
        message += `${checkIcons['done']} Fixed test failures\n\n`
    }
    if (currentStep > TestGenerationBuildStep.RUN_BUILD && session.buildStatus === BuildStatus.SUCCESS) {
        message += `${checkIcons['done']} Project compiled\n${checkIcons['done']} All tests passed\n\n`
    }
    /*
    updateStepStatuses(currentStep, status)

    if (currentStep >= TestGenerationBuildStep.RUN_BUILD) {
        message += `${getIconForStep(TestGenerationBuildStep.RUN_BUILD)} ${
            currentStep === TestGenerationBuildStep.RUN_BUILD
                ? 'Project compiling\n'
                : session.buildStatus === BuildStatus.FAILURE
                  ? 'Unable to compile project\n'
                  : 'Project compiled\n'
        }`
    }

    if (currentStep === TestGenerationBuildStep.RUN_EXECUTION_TESTS) {
        message += `${getIconForStep(TestGenerationBuildStep.RUN_EXECUTION_TESTS)} Running tests\n`
    } else if (currentStep >= TestGenerationBuildStep.RUN_EXECUTION_TESTS) {
        message += `${getIconForStep(TestGenerationBuildStep.RUN_EXECUTION_TESTS)} ${
            session.buildStatus === BuildStatus.FAILURE ? 'Tests failed\n' : 'Tests passed\n'
        }`
    }

    if (currentStep === TestGenerationBuildStep.FIXING_TEST_CASES && session.buildStatus === BuildStatus.FAILURE) {
        message += `${getIconForStep(TestGenerationBuildStep.FIXING_TEST_CASES)} Fixing test failures\n\n`
    } else if (
        currentStep >= TestGenerationBuildStep.FIXING_TEST_CASES &&
        session.buildStatus === BuildStatus.FAILURE
    ) {
        message += `${checkIcons['done']} Fixed test failures\n\n`
    }
*/
    if (currentStep > TestGenerationBuildStep.PROCESS_TEST_RESULTS && session.buildStatus === BuildStatus.FAILURE) {
        message += `**Results**\n
Amazon Q executed the tests and identified at least one failure. Below are the suggested fixes.\n\n`
    }

    return message.trim()
}
/*
const updateStepStatuses = (currentStep: TestGenerationBuildStep, status?: string) => {
    const session = ChatSessionManager.Instance.getSession()
    for (let step = TestGenerationBuildStep.INSTALL_DEPENDENCIES; step <= currentStep; step++) {
        const stepStatus: StepStatus = {
            step: step,
            status: 'wait',
        }

        stepStatus.status =
            step === currentStep
                ? status === 'error' || status === 'done'
                    ? status
                    : 'current'
                : step < currentStep
                  ? session.buildStatus === BuildStatus.FAILURE
                      ? 'error'
                      : 'done'
                  : stepStatus.status

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
*/
