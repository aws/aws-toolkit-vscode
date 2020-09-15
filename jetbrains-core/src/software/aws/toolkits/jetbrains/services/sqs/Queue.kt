// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.resources.message

// TODO This does not support FIPS

/**
 * @param queueUrl The format for queueUrl is https://sqs.<region>.amazonaws.com/<accountId>/<queueName>
 * queueName cannot contain '/', so it is safe enough to do string manipulation on it
 */
class Queue(val queueUrl: String, val region: AwsRegion) {
    val accountId: String by lazy {
        val id = queueUrl.substringBeforeLast("/").substringAfterLast("/")
        if ((id == queueUrl) || (id.length != 12) || id.isBlank()) {
            throw IllegalArgumentException(message("sqs.url.parse_error"))
        } else {
            id
        }
    }

    val queueName: String by lazy {
        val name = queueUrl.substringAfterLast("/")
        if (name == queueUrl || name.isBlank()) {
            throw IllegalArgumentException(message("sqs.url.parse_error"))
        } else {
            name
        }
    }

    val arn = "arn:${region.partitionId}:sqs:${region.id}:$accountId:$queueName"
    val isFifo: Boolean by lazy { queueName.endsWith(".fifo") }
}
