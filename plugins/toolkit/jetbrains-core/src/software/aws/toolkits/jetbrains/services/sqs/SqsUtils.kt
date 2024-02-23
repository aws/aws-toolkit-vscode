// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import org.intellij.lang.annotations.Language
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.amazon.awssdk.services.sqs.model.SqsException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.telemetry.SqsQueueType

const val MAX_NUMBER_OF_POLLED_MESSAGES = 10
const val MAX_LENGTH_OF_POLLED_MESSAGES = 1024
const val MAX_LENGTH_OF_FIFO_ID = 128
const val MAX_LENGTH_OF_QUEUE_NAME = 80

// Maximum length of queue name is 80, but the maximum will be 75 for FIFO queues due to '.fifo' suffix
const val MAX_LENGTH_OF_FIFO_QUEUE_NAME = 75

// Queue attribute limits
const val MIN_DELIVERY_DELAY = 0
const val MAX_DELIVERY_DELAY = 900
const val DELIVERY_DELAY_TICK = (MAX_DELIVERY_DELAY - MIN_DELIVERY_DELAY) / 30
const val MIN_MESSAGE_SIZE_LIMIT = 1024
const val MAX_MESSAGE_SIZE_LIMIT = 262144
const val MIN_RETENTION_PERIOD = 60
const val MAX_RETENTION_PERIOD = 1209600
const val MIN_VISIBILITY_TIMEOUT = 0
const val MAX_VISIBILITY_TIMEOUT = 43200
const val VISIBILITY_TIMEOUT_TICK = (MAX_VISIBILITY_TIMEOUT - MIN_VISIBILITY_TIMEOUT) / 30
const val MIN_WAIT_TIME = 0
const val MAX_WAIT_TIME = 20
const val WAIT_TIME_TICK = 1

const val sqsPolicyStatementArray = "Statement"

// Extension function to get telemetry type from Queue
fun Queue.telemetryType() = if (isFifo) SqsQueueType.Fifo else SqsQueueType.Standard

/*
 * Get the approximate number of messages from a queue. Returns null when there is a service exception
 * thrown, or the value returned is not an int.
 * @param queueUrl The queue url to retrieve the approximate number of messages from
 */
fun SqsClient.approximateNumberOfMessages(queueUrl: String): Int? = try {
    getQueueAttributes {
        it.queueUrl(queueUrl)
        it.attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES)
    }.attributes().getValue(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES).toIntOrNull()
} catch (e: SqsException) {
    getLogger<SqsClient>().error(e) { "SqsClient threw an exception getting approximate number of messages" }
    null
}

/**
 * Create a policy statement that allows sending SNS messages to an SQS queue. The Sid
 * matches how the console does sid (so it won't duplicate it), and the overall policy
 * matches how the console does it.
 */
@Language("JSON")
fun createSqsSnsSubscribePolicyStatement(sqsArn: String, snsArn: String): String =
    """
    {
        "Sid": "topic-subscription-$snsArn",
        "Effect": "Allow",
        "Principal": {
            "AWS": "*"
        },
        "Action": "SQS:SendMessage",
        "Resource": "$sqsArn",
        "Condition": {
            "ArnLike": {
                "aws:SourceArn": "$snsArn"
            }
        }
    }
    """

/**
 * When a queue is created with the default parameters, the policy is null when returned with `getQueueAttributes`
 * (even though in the console it shows up properly) so we have to create our own whole policy document if that happens
 */
@Language("JSON")
fun createSqsPolicy(arn: String): String =
    """
    {
        "Version": "2012-10-17",
        "Id": "$arn/SQSDefaultPolicy"
    }
    """
