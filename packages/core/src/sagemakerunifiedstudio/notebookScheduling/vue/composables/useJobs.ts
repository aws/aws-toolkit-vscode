/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ref, Ref, onBeforeMount } from 'vue'
import { TrainingJob } from '@aws-sdk/client-sagemaker'
import { client } from './useClient'

export interface JobDefinition {
    id: string
    name: string
    inputFilename: string
    outputDirectory: string
    createdAt: string
    updatedAt: string
    environment: string
    schedule: string
    timeZone: string
    ranWithInputFolder: boolean
    status: string
    image: string
    kernel: string
    maxRetryAttempts: number
    maxRunTime: number
    envVariables?: { key: string; value: string }[]
    delete: boolean
}

export const jobDefinitions: Ref<JobDefinition[]> = ref([
    {
        id: '1',
        name: 'job-defintion-1',
        inputFilename: 'notebook-1.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        envVariables: [{ key: 'foo', value: 'bar' }],
        delete: false,
    },
    {
        id: '2',
        name: 'job-defintion-2',
        inputFilename: 'notebook-2.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        envVariables: [
            { key: 'foo', value: 'bar' },
            { key: 'hello', value: 'world' },
        ],
        delete: false,
    },
    {
        id: '3',
        name: 'job-defintion-3',
        inputFilename: 'notebook-3.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        envVariables: [{ key: 'foo', value: 'bar' }],
        delete: false,
    },
    {
        id: '4',
        name: 'job-defintion-4',
        inputFilename: 'notebook-4.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '5',
        name: 'job-defintion-5',
        inputFilename: 'notebook-5.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '6',
        name: 'job-defintion-6',
        inputFilename: 'notebook-6.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '7',
        name: 'job-defintion-7',
        inputFilename: 'notebook-7.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '8',
        name: 'job-defintion-8',
        inputFilename: 'notebook-8.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '9',
        name: 'job-defintion-9',
        inputFilename: 'notebook-9.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '10',
        name: 'job-defintion-10',
        inputFilename: 'notebook-10.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '11',
        name: 'job-defintion-11',
        inputFilename: 'notebook-11.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
    {
        id: '12',
        name: 'job-defintion-12',
        inputFilename: 'notebook-12.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        outputDirectory: '-',
        updatedAt: '2024-01-15T23:30:00Z',
        environment: 'sagemaker-default-env',
        timeZone: 'UTC',
        ranWithInputFolder: false,
        image: 'SageMaker Distribution',
        kernel: 'python3',
        maxRetryAttempts: 1,
        maxRunTime: 172800,
        delete: false,
    },
])

// Reactive states for tracking useJobs hook status
export const jobs: Ref<TrainingJob[]> = ref([])
const isLoadingTrainingJobs: Ref<boolean> = ref(true)
const isErrorTrainingJobs: Ref<boolean> = ref(false)
const errorMessageTrainingJobs: Ref<string | undefined> = ref(undefined)

let hasFetchedTrainingJobs = false

export function useJobs(config: { refetch?: boolean } = { refetch: false }): {
    jobs: Ref<TrainingJob[]>
    isLoading: Ref<boolean>
    isError: Ref<boolean>
    errorMessage: Ref<string | undefined>
} {
    async function fetchTrainingJobs(): Promise<void> {
        if (hasFetchedTrainingJobs && !config.refetch) {
            return
        }

        hasFetchedTrainingJobs = true
        isLoadingTrainingJobs.value = true
        isErrorTrainingJobs.value = false
        errorMessageTrainingJobs.value = undefined

        const result = await client.listJobs()

        jobs.value.length = 0

        if (result.jobs) {
            for (const job of result.jobs) {
                jobs.value.push(job)
            }
        } else {
            isErrorTrainingJobs.value = true
            errorMessageTrainingJobs.value = result.error
        }

        isLoadingTrainingJobs.value = false
    }

    if (config.refetch) {
        void fetchTrainingJobs()
    } else {
        onBeforeMount(fetchTrainingJobs)
    }

    return {
        jobs: jobs,
        isLoading: isLoadingTrainingJobs,
        isError: isErrorTrainingJobs,
        errorMessage: errorMessageTrainingJobs,
    }
}
