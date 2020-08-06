/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'

export interface CloudWatchLogsClient {
    readonly regionCode: string

    describeLogGroups(): AsyncIterableIterator<CloudWatchLogs.LogGroup>

    getLogEvents(request: CloudWatchLogs.GetLogEventsRequest): Promise<CloudWatchLogs.GetLogEventsResponse>

    describeLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogs.DescribeLogStreamsResponse>
}
