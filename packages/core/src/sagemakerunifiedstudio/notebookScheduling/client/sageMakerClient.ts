/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    SageMakerClient as SageMakerClientSDK,
    SearchCommandInput,
    paginateSearch,
    TrainingJob,
} from '@aws-sdk/client-sagemaker'
import { ClientWrapper } from '../../../shared/clients/clientWrapper'
import { getLogger } from '../../../shared/logger/logger'
import { SageMakerSearchSortOrder, JobTag } from '../utils/constants'

export interface ListJobsResponse {
    jobs?: TrainingJob[]
    error?: string
}

export class SageMakerClient extends ClientWrapper<SageMakerClientSDK> {
    private projectId: string

    public constructor(regionCode: string, projectId: string) {
        super(regionCode, SageMakerClientSDK)

        this.projectId = projectId
    }

    public async listJobs(): Promise<ListJobsResponse> {
        const searchRequest: SearchCommandInput = {
            MaxResults: 100,
            Resource: 'TrainingJob',
            SortBy: 'CreationTime',
            SortOrder: SageMakerSearchSortOrder.DESCENDING,
            SearchExpression: {
                Filters: [
                    {
                        Name: `Tags.${JobTag.IS_STUDIO_ARCHIVED}`,
                        Operator: 'Equals',
                        Value: 'false',
                    },
                ],
                SubExpressions: [
                    {
                        Filters: [
                            {
                                Name: `Tags.${JobTag.IS_SCHEDULING_NOTEBOOK_JOB}`,
                                Operator: 'Equals',
                                Value: 'true',
                            },
                            {
                                Name: `Tags.${JobTag.NOTEBOOK_JOB_ORIGIN}`,
                                Operator: 'Equals',
                                Value: 'PIPELINE_STEP',
                            },
                        ],
                        Operator: 'Or',
                    },
                ],
            },
            VisibilityConditions: [
                {
                    Key: `Tags.${JobTag.AmazonDataZoneProject}`,
                    Value: this.projectId,
                },
            ],
        }

        try {
            const jobs: TrainingJob[] = []
            const paginator = paginateSearch({ client: this.getClient() }, searchRequest)

            for await (const page of paginator) {
                for (const result of page.Results ?? []) {
                    if (result.TrainingJob) {
                        jobs.push(result.TrainingJob)
                    }
                }
            }

            return { jobs }
        } catch (error: any) {
            getLogger().error('SageMakerClient.listJobs: %s', error)
            return { error: `${error}` }
        }
    }
}
