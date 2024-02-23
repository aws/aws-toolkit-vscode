// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import software.amazon.awssdk.services.cloudwatchlogs.model.ResultField

/**
 * Mapped from response from the GetQueryResults call
 */
typealias LogResult = Map<String, String>

/**
 * Returned from the GetLogRecordResponse call
 */
typealias LogRecord = Map<String, String>
typealias LogRecordFieldPair = Pair<String, String>

fun List<ResultField>.toLogResult() = this.map { it.field() to it.value() }.toMap()

// @ptr is a unique identifier for each resultant log event which is used here to ensure results are not repeatedly displayed
fun LogResult.identifier(): String = this["@ptr"] ?: throw IllegalStateException("CWL GetQueryResults returned record without @ptr field")
