/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Page {
    name: string
    metadata:
        | CreateJobPageMetadata
        | ViewJobsPageMetadata
        | JobDetailPageMetadata
        | JobDefinitionDetailPageMetadata
        | EditJobDefinitionPageMetadata
}

export interface CreateJobPageMetadata {}

export interface ViewJobsPageMetadata {
    newJob?: string
    newJobDefinition?: string
    showJobDefinitions?: boolean
}

export interface JobDetailPageMetadata {
    jobId: string
}

export interface JobDefinitionDetailPageMetadata {
    jobDefinitionId: string
}

export interface EditJobDefinitionPageMetadata {
    jobDefinitionId: string
}

export const createJobPage: string = 'createJob'

export const viewJobsPage: string = 'viewJobs'

export const jobDetailPage: string = 'jobDetailPage'

export const jobDefinitionDetailPage: string = 'jobDefinitionDetailPage'

export const editJobDefinitionPage: string = 'editJobDefinitionPage'
