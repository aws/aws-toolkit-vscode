// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import software.amazon.awssdk.services.cloudwatchlogs.model.FilteredLogEvent
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent

data class LogStreamEntry(val message: String, val timestamp: Long)

fun OutputLogEvent.toLogStreamEntry() = LogStreamEntry(message() ?: "", timestamp() ?: 0)
fun FilteredLogEvent.toLogStreamEntry() = LogStreamEntry(message() ?: "", timestamp() ?: 0)
