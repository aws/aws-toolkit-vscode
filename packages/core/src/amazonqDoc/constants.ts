/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons, Status } from '@aws/mynah-ui'
import { FollowUpTypes } from '../amazonq/commons/types'
import { NewFileInfo } from './types'
import { i18n } from '../shared/i18n-helper'

// For uniquely identifiying which chat messages should be routed to Doc
export const docChat = 'docChat'

export const docScheme = 'aws-doc'

export const featureName = 'Amazon Q Doc Generation'

export function getFileSummaryPercentage(input: string): number {
    // Split the input string by newline characters
    const lines = input.split('\n')

    // Find the line containing "summarized:"
    const summaryLine = lines.find((line) => line.includes('summarized:'))

    // If the line is not found, return null
    if (!summaryLine) {
        return -1
    }

    // Extract the numbers from the summary line
    const [summarized, total] = summaryLine.split(':')[1].trim().split(' of ').map(Number)

    // Calculate the percentage
    const percentage = (summarized / total) * 100

    return percentage
}

const checkIcons = {
    wait: '&#9744;',
    current: '&#9744;',
    done: '&#9745;',
}

const getIconForStep = (targetStep: number, currentStep: number) => {
    return currentStep === targetStep
        ? checkIcons.current
        : currentStep > targetStep
          ? checkIcons.done
          : checkIcons.wait
}

export enum DocGenerationStep {
    UPLOAD_TO_S3,
    SUMMARIZING_FILES,
    GENERATING_ARTIFACTS,
}

export const docGenerationProgressMessage = (currentStep: DocGenerationStep, mode: Mode) => `
${mode === Mode.CREATE ? i18n('AWS.amazonq.doc.answer.creating') : i18n('AWS.amazonq.doc.answer.updating')}

${getIconForStep(DocGenerationStep.UPLOAD_TO_S3, currentStep)} ${i18n('AWS.amazonq.doc.answer.scanning')}

${getIconForStep(DocGenerationStep.SUMMARIZING_FILES, currentStep)} ${i18n('AWS.amazonq.doc.answer.summarizing')}

${getIconForStep(DocGenerationStep.GENERATING_ARTIFACTS, currentStep)} ${i18n('AWS.amazonq.doc.answer.generating')}


`

export const FolderSelectorFollowUps = [
    {
        icon: 'ok' as MynahIcons,
        pillText: 'Yes',
        prompt: 'Yes',
        status: 'success' as Status,
        type: FollowUpTypes.ProceedFolderSelection,
    },
    {
        icon: 'refresh' as MynahIcons,
        pillText: 'Change folder',
        prompt: 'Change folder',
        status: 'info' as Status,
        type: FollowUpTypes.ChooseFolder,
    },
    {
        icon: 'cancel' as MynahIcons,
        pillText: 'Cancel',
        prompt: 'Cancel',
        status: 'error' as Status,
        type: FollowUpTypes.CancelFolderSelection,
    },
]

export const SynchronizeDocumentation = {
    pillText: i18n('AWS.amazonq.doc.pillText.update'),
    prompt: i18n('AWS.amazonq.doc.pillText.update'),
    type: FollowUpTypes.SynchronizeDocumentation,
}

export const EditDocumentation = {
    pillText: i18n('AWS.amazonq.doc.pillText.makeChange'),
    prompt: i18n('AWS.amazonq.doc.pillText.makeChange'),
    type: FollowUpTypes.EditDocumentation,
}

export enum Mode {
    NONE = 'None',
    CREATE = 'Create',
    SYNC = 'Sync',
    EDIT = 'Edit',
}

/**
 *
 * @param paths file paths
 * @returns the path to a README.md, or undefined if none exist
 */
export const findReadmePath = (paths?: NewFileInfo[]) => {
    return paths?.find((path) => /readme\.md$/i.test(path.relativePath))
}
