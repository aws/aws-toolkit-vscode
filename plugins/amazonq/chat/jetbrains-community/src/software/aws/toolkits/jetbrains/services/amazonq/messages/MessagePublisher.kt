// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.messages

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * MessagePublisher is used for sending outbound messages
 */
interface MessagePublisher {
    suspend fun publish(message: AmazonQMessage)
}

/**
 * MessageListener is used to receive inbound messages
 */
interface MessageListener {
    val flow: Flow<AmazonQMessage>
}

/**
 * A MessageConnector is a uni-directional channel for passing messages between Amazon Q and App implementations. It is provided as either a MessagePublisher or
 * MessageListener depending on the intended direction of communication.
 */
class MessageConnector : MessagePublisher, MessageListener {
    private val _messages = MutableSharedFlow<AmazonQMessage>(extraBufferCapacity = 10, replay = 10)
    override val flow = _messages.asSharedFlow()

    override suspend fun publish(message: AmazonQMessage) {
        _messages.emit(message)
    }
}
