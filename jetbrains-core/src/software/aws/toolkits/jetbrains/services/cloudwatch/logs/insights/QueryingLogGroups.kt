// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryRequest
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

class QueryingLogGroups(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("ExecutingQuery") {
    fun executeStartQuery(queryStartEndDate: StartEndDate, logGroupNames: List<String>, query: String, client: CloudWatchLogsClient) = launch {
        // TODO: Multiple log groups queried (currently only a single log group can be selected and queried)
        val request = StartQueryRequest.builder()
            .endTime(queryStartEndDate.endDate.epochSecond)
            .logGroupName(logGroupNames[0])
            .queryString(query)
            .startTime(queryStartEndDate.startDate.epochSecond)
            .build()
        val response = client.startQuery(request)
        val queryId = response.queryId()
        // TODO: Get the results of the query with qid
    }
}
