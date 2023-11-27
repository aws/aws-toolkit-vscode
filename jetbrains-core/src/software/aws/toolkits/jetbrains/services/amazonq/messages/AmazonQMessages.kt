// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.messages

interface AmazonQMessage

/**
 * Message that is sent when a command is received that does not have a registered deserialization class. The content is the plain-text representation of the
 * received JSON.
 */
data class UnknownMessageType(val content: String) : AmazonQMessage
