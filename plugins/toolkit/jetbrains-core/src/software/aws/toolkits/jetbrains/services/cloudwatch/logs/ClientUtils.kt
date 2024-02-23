// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceNotFoundException

fun CloudWatchLogsClient.checkIfLogGroupExists(logGroup: String): Boolean {
    val existingGroups = describeLogGroups { it.logGroupNamePrefix(logGroup) }
    return existingGroups.logGroups().any { it.logGroupName() == logGroup }
}

fun CloudWatchLogsClient.checkIfLogStreamExists(logGroup: String, logStream: String) = try {
    val existingStreams = describeLogStreams { it.logGroupName(logGroup).logStreamNamePrefix(logStream) }
    existingStreams.logStreams().any { it.logStreamName() == logStream }
    // Thrown if the log group does not exist
} catch (e: ResourceNotFoundException) {
    false
}
