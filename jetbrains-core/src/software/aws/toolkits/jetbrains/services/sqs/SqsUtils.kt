// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

const val MAX_NUMBER_OF_POLLED_MESSAGES = 10
const val MAX_LENGTH_OF_POLLED_MESSAGES = 1024
const val MAX_LENGTH_OF_FIFO_ID = 128
const val MAX_LENGTH_OF_QUEUE_NAME = 80
// Maximum length of queue name is 80, but the maximum will be 75 for FIFO queues due to '.fifo' suffix
const val MAX_LENGTH_OF_FIFO_QUEUE_NAME = 75
