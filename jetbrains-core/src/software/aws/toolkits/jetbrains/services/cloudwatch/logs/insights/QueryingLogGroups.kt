// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryRequest
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

const val fields = "fields"
class QueryingLogGroups(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("ExecutingQuery") {

    fun executeStartQuery(queryStartEndDate: StartEndDate, logGroupNames: List<String>, query: String, client: CloudWatchLogsClient) = launch {
        // TODO: Multiple log groups queried (currently only a single log group can be selected and queried)
        try {
            val request = StartQueryRequest.builder()
                .endTime(queryStartEndDate.endDate.epochSecond)
                .logGroupName(logGroupNames[0])
                .queryString(query)
                .startTime(queryStartEndDate.startDate.epochSecond)
                .build()
            val response = client.startQuery(request)
            val queryId: String = response.queryId()
            val fieldList = getFields(query)
            QueryResultsWindow.getInstance(project).showResults(queryId, fieldList, logGroupNames[0])
        } catch (e: Exception) {
            notifyError(message("cloudwatch.logs.query_result_completion_status"), e.toString())
            throw e
        }
    }

    fun getFields(query: String): List<String> {
        val fieldList = mutableListOf<List<String>>()
        query.replace("\\|", "")
        val queries = query.split("|")
        for (item in queries) {
            val splitQuery = item.trim()
            if (splitQuery.startsWith(fields, ignoreCase = false)) {
                val fields = splitQuery.substring(fields.length + 1)
                fieldList.add(fields.split(",").map { it.trim() })
            }
        }
        if (fieldList.isEmpty()) {
            return listOf("@message", "@timestamp")
        }
        return fieldList.flatten()
    }
}
