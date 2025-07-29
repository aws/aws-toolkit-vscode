/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Page {
    name: string
    metadata: CreateJobPageMetadata | ViewJobsPageMetadata | JobDetailPageMetadata
}

export interface CreateJobPageMetadata {}

export interface ViewJobsPageMetadata {
    newJob?: string
    newJobDefinition?: string
}

export interface JobDetailPageMetadata {
    jobId: string
}

export const createJobPage: string = 'createJob'

export const viewJobsPage: string = 'viewJobs'

export const jobDetailPage: string = 'jobDetailPage'
