/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrainingJob, TrainingJobStatus } from '@aws-sdk/client-sagemaker'
import { RuntimeEnvironmentParameterName, JobEnvironmentVariableName, JobTag } from './constants'

export function getJobName(job: TrainingJob): string | undefined {
    if (job.Tags) {
        for (const { Key, Value } of job.Tags) {
            if (Key === JobTag.NAME) {
                return Value
            }
        }
    }
}

export function getJobStatus(job: TrainingJob) {
    if (job.TrainingJobStatus === TrainingJobStatus.IN_PROGRESS) {
        return 'In progress'
    }

    return job.TrainingJobStatus
}

export function getJobInputNotebookName(job: TrainingJob): string | undefined {
    if (job.Environment) {
        return job.Environment[JobEnvironmentVariableName.SM_INPUT_NOTEBOOK_NAME]
    }
}

export function getJobEnvironmentName(job: TrainingJob): string | undefined {
    if (job.Environment) {
        return job.Environment[JobEnvironmentVariableName.SM_ENV_NAME]
    }
}

export function getJobKernelName(job: TrainingJob): string | undefined {
    if (job.Environment) {
        return job.Environment[JobEnvironmentVariableName.SM_KERNEL_NAME]
    }
}

export function getJobParameters(job: TrainingJob): { key: string; value: string }[] | undefined {
    if (job.HyperParameters) {
        const result = []

        for (const [key, value] of Object.entries(job.HyperParameters)) {
            result.push({ key, value })
        }

        return result
    }
}

export function getJobEnvironmentParameters(job: TrainingJob) {
    if (job.Environment) {
        const runtimeEnvironmentParameterSet: Set<string> = new Set(Object.values(RuntimeEnvironmentParameterName))
        const jobEnvironmentVariableSet: Set<string> = new Set(Object.values(JobEnvironmentVariableName))

        const result = []

        for (const [key, value] of Object.entries(job.Environment)) {
            if (!(runtimeEnvironmentParameterSet.has(key) || jobEnvironmentVariableSet.has(key))) {
                result.push({ key, value })
            }
        }

        return result
    }
}

export function getJobRanWithInputFolder(job: TrainingJob): boolean {
    if (job.Environment && JobEnvironmentVariableName.SM_PACKAGE_INPUT_FOLDER in job.Environment) {
        return job.Environment[JobEnvironmentVariableName.SM_PACKAGE_INPUT_FOLDER].toLowerCase() === 'true'
    }

    return false
}

export function getFormattedDateTime(utcString: string): string {
    const date = new Date(utcString)

    const pad = (n: number) => n.toString().padStart(2, '0')

    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())

    let hours = date.getHours()
    const minutes = pad(date.getMinutes())

    // Determine AM or PM
    const ampm = hours >= 12 ? 'PM' : 'AM'

    // Convert to 12-hour format
    hours = hours % 12
    hours = hours ? hours : 12 // 0 should be 12

    const formatted = `${year}-${month}-${day}, ${pad(hours)}:${minutes} ${ampm}`
    return formatted
}

export function getFormattedCurrentTime(): string {
    const date = new Date()

    const pad = (n: number) => n.toString().padStart(2, '0')

    let hours = date.getHours()
    const minutes = pad(date.getMinutes())
    const seconds = pad(date.getSeconds())

    // Determine AM or PM
    const ampm = hours >= 12 ? 'PM' : 'AM'

    // Convert to 12-hour format
    hours = hours % 12
    hours = hours ? hours : 12 // 0 should be 12

    const formatted = `${pad(hours)}:${minutes}:${seconds} ${ampm}`
    return formatted
}
