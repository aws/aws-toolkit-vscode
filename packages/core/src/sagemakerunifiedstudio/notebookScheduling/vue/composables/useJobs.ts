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

export const jobs: Ref<Job[]> = ref([
    {
        jobName: 'transcribe-audio-004',
        inputFilename: 'conference-call.mp3',
        outputFiles: 'conference-transcript.json',
        createdAt: '2024-01-15T13:00:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-005',
        inputFilename: 'podcast-episode.mp3',
        outputFiles: 'podcast-transcript.json',
        createdAt: '2024-01-15T14:30:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-006',
        inputFilename: 'voicemail.wav',
        outputFiles: 'voicemail-transcript.json',
        createdAt: '2024-01-15T15:15:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-007',
        inputFilename: 'presentation.mp3',
        outputFiles: 'presentation-transcript.json',
        createdAt: '2024-01-15T16:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-008',
        inputFilename: 'training-video.mp3',
        outputFiles: 'training-transcript.json',
        createdAt: '2024-01-15T16:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-009',
        inputFilename: 'customer-call.wav',
        outputFiles: 'customer-transcript.json',
        createdAt: '2024-01-15T17:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-010',
        inputFilename: 'webinar.mp3',
        outputFiles: 'webinar-transcript.json',
        createdAt: '2024-01-15T18:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-011',
        inputFilename: 'team-meeting.wav',
        outputFiles: 'meeting-transcript.json',
        createdAt: '2024-01-15T19:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-012',
        inputFilename: 'interview-2.mp3',
        outputFiles: 'interview2-transcript.json',
        createdAt: '2024-01-15T19:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-013',
        inputFilename: 'workshop.wav',
        outputFiles: 'workshop-transcript.json',
        createdAt: '2024-01-15T20:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-014',
        inputFilename: 'speech.mp3',
        outputFiles: 'speech-transcript.json',
        createdAt: '2024-01-15T21:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-015',
        inputFilename: 'lecture-2.wav',
        outputFiles: 'lecture2-transcript.json',
        createdAt: '2024-01-15T22:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-016',
        inputFilename: 'seminar.mp3',
        outputFiles: 'seminar-transcript.json',
        createdAt: '2024-01-15T22:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-017',
        inputFilename: 'meeting-notes.wav',
        outputFiles: 'notes-transcript.json',
        createdAt: '2024-01-15T23:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-018',
        inputFilename: 'conference.mp3',
        outputFiles: 'conference2-transcript.json',
        createdAt: '2024-01-16T00:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-001',
        inputFilename: 'meeting-recording.mp3',
        outputFiles: 'meeting-transcript.json',
        createdAt: '2024-01-15T10:30:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-002',
        inputFilename: 'interview.wav',
        outputFiles: 'interview-transcript.json',
        createdAt: '2024-01-15T11:45:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-003',
        inputFilename: 'lecture.mp3',
        outputFiles: 'lecture-transcript.json',
        createdAt: '2024-01-15T12:15:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-013',
        inputFilename: 'workshop.wav',
        outputFiles: 'workshop-transcript.json',
        createdAt: '2024-01-15T20:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-014',
        inputFilename: 'speech.mp3',
        outputFiles: 'speech-transcript.json',
        createdAt: '2024-01-15T21:15:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-015',
        inputFilename: 'lecture-2.wav',
        outputFiles: 'lecture2-transcript.json',
        createdAt: '2024-01-15T22:00:00Z',
        status: 'FAILED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-016',
        inputFilename: 'seminar.mp3',
        outputFiles: 'seminar-transcript.json',
        createdAt: '2024-01-15T22:45:00Z',
        status: 'COMPLETED',
        delete: false,
    },
    {
        jobName: 'transcribe-audio-017',
        inputFilename: 'meeting-notes.wav',
        outputFiles: 'notes-transcript.json',
        createdAt: '2024-01-15T23:30:00Z',
        status: 'IN_PROGRESS',
        delete: false,
    },
])
