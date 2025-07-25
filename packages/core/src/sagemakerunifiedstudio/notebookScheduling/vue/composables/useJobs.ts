/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ref, Ref } from 'vue'

interface Job {
    jobName: string
    inputFilename: string
    outputFiles: string
    createdAt: string
    status: string
    delete: boolean
}

interface JobDefinition {
    name: string
    inputFilename: string
    createdAt: string
    schedule: string
    status: string
    delete: boolean
}

export const jobs: Ref<Job[]> = ref([
    {
        jobName: 'notebook-job-1',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'conference-transcript.json',
        createdAt: '2024-01-15T13:00:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-2',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'podcast-transcript.json',
        createdAt: '2024-01-15T14:30:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-3',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'voicemail-transcript.json',
        createdAt: '2024-01-15T15:15:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-4',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'presentation-transcript.json',
        createdAt: '2024-01-15T16:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'notebook-job-5',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'training-transcript.json',
        createdAt: '2024-01-15T16:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-6',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'customer-transcript.json',
        createdAt: '2024-01-15T17:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-7',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'webinar-transcript.json',
        createdAt: '2024-01-15T18:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-8',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'meeting-transcript.json',
        createdAt: '2024-01-15T19:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'notebook-job-9',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'interview2-transcript.json',
        createdAt: '2024-01-15T19:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-10',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'workshop-transcript.json',
        createdAt: '2024-01-15T20:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-111',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'speech-transcript.json',
        createdAt: '2024-01-15T21:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-12',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'lecture2-transcript.json',
        createdAt: '2024-01-15T22:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'notebook-job-13',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'seminar-transcript.json',
        createdAt: '2024-01-15T22:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-14',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'notes-transcript.json',
        createdAt: '2024-01-15T23:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-15',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'conference2-transcript.json',
        createdAt: '2024-01-16T00:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-16',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'meeting-transcript.json',
        createdAt: '2024-01-15T10:30:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-17',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'interview-transcript.json',
        createdAt: '2024-01-15T11:45:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-18',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'lecture-transcript.json',
        createdAt: '2024-01-15T12:15:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'notebook-job-19',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'workshop-transcript.json',
        createdAt: '2024-01-15T20:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'notebook-job-20',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'speech-transcript.json',
        createdAt: '2024-01-15T21:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-21',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'lecture2-transcript.json',
        createdAt: '2024-01-15T22:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'notebook-job-22',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'seminar-transcript.json',
        createdAt: '2024-01-15T22:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'notebook-job-23',
        inputFilename: 'notebook-1.ipynb',
        outputFiles: 'notes-transcript.json',
        createdAt: '2024-01-15T23:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
])

export const jobDefinitions: Ref<JobDefinition[]> = ref([
    {
        name: 'job-defintion-1',
        inputFilename: 'notebook-1.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-2',
        inputFilename: 'notebook-2.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-3',
        inputFilename: 'notebook-3.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
    {
        name: 'job-defintion-4',
        inputFilename: 'notebook-4.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-5',
        inputFilename: 'notebook-5.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
    {
        name: 'job-defintion-6',
        inputFilename: 'notebook-6.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-7',
        inputFilename: 'notebook-7.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
    {
        name: 'job-defintion-8',
        inputFilename: 'notebook-8.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-9',
        inputFilename: 'notebook-9.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
    {
        name: 'job-defintion-10',
        inputFilename: 'notebook-10.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Active',
        delete: false,
    },
    {
        name: 'job-defintion-11',
        inputFilename: 'notebook-11.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
    {
        name: 'job-defintion-12',
        inputFilename: 'notebook-12.ipynb',
        createdAt: '2024-01-15T23:30:00Z',
        schedule: 'Daily',
        status: 'Paused',
        delete: false,
    },
])
