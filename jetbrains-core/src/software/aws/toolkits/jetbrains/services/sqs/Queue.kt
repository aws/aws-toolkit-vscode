// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import software.aws.toolkits.core.region.AwsRegion
import java.lang.IllegalArgumentException
import software.aws.toolkits.resources.message

/*This does not support FIPS*/
class Queue(val queueUrl: String, val region: AwsRegion) {
    val accountId: String by lazy {
        val id = queueUrl.substringAfter("${region.id}").substringAfter("/").substringBefore("/")
        if ((id == queueUrl) || (id.length != 12) || id.isBlank()) {
                throw IllegalArgumentException(message("sqs.url.parse_error"))
        } else {
            id
        }
    }

    val queueName: String by lazy {
        val name = queueUrl.substringAfter("$accountId/")
        if (name == queueUrl || name.isBlank()) {
            throw IllegalArgumentException(message("sqs.url.parse_error"))
        } else {
            name
        }
    }

    val arn = "arn:${region.partitionId}:sqs:${region.id}:$accountId:$queueName"
}
