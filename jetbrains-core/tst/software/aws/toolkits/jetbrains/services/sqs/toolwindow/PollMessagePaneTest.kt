// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesResponse
import software.amazon.awssdk.services.sqs.model.Message
import software.amazon.awssdk.services.sqs.model.MessageSystemAttributeName
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest
import software.amazon.awssdk.services.sqs.model.ReceiveMessageResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message

class PollMessagePaneTest : BaseCoroutineTest() {
    val queue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/test1", AwsRegion.GLOBAL)

    private val message: Message = Message.builder()
        .body("ABC")
        .messageId("XYZ")
        .attributes(mapOf(Pair(MessageSystemAttributeName.SENDER_ID, "1234567890:test1"), Pair(MessageSystemAttributeName.SENT_TIMESTAMP, "111111111")))
        .build()

    @Test
    fun `Message received`() {
        val client = mockClientManagerRule.create<SqsClient>()
        whenever(client.receiveMessage(Mockito.any<ReceiveMessageRequest>())).thenReturn(
            ReceiveMessageResponse.builder().messages(message).build()
        )
        val pane = PollMessagePane(projectRule.project, client, queue)
        val tableModel = pane.messagesTable.tableModel
        runBlocking {
            pane.requestMessages()
            tableModel.waitForModelToBeAtLeast(1)
        }

        assertThat(tableModel.items.first().messageId()).isEqualTo("XYZ")
        assertThat(tableModel.items.first().body()).isEqualTo("ABC")
        assertThat(tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENDER_ID)).isEqualTo("1234567890:test1")
        assertThat(tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENT_TIMESTAMP)).isEqualTo("111111111")
    }

    @Test
    fun `No messages received`() {
        val client = mockClientManagerRule.create<SqsClient>()
        whenever(client.receiveMessage(Mockito.any<ReceiveMessageRequest>())).thenReturn(
            ReceiveMessageResponse.builder().build()
        )
        val pane = PollMessagePane(projectRule.project, client, queue)
        runBlocking {
            pane.requestMessages()
            waitForTrue { pane.messagesTable.table.emptyText.text == message("sqs.message.no_messages") }
        }

        assertThat(pane.messagesTable.tableModel.items.size).isZero()
    }

    @Test
    fun `Error receiving messages`() {
        val client = mockClientManagerRule.create<SqsClient>()
        whenever(client.receiveMessage(Mockito.any<ReceiveMessageRequest>())).then {
            throw IllegalStateException("Network Error")
        }
        val pane = PollMessagePane(projectRule.project, client, queue)
        runBlocking {
            pane.requestMessages()
            waitForTrue { pane.messagesTable.table.emptyText.text == message("sqs.failed_to_poll_messages") }
        }

        assertThat(pane.messagesTable.table.listTableModel.items.size).isZero()
    }

    @Test
    fun `Available messages are displayed`() {
        val client = mockClientManagerRule.create<SqsClient>()
        whenever(client.getQueueAttributes(Mockito.any<GetQueueAttributesRequest>())).thenReturn(
            GetQueueAttributesResponse.builder().attributes(mutableMapOf(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES to "10")).build()
        )
        val pane = PollMessagePane(projectRule.project, client, queue)
        runBlocking {
            pane.getAvailableMessages()
        }

        assertThat(pane.messagesAvailableLabel.text).isEqualTo(message("sqs.messages.available.text", 10))
    }

    @Test
    fun `Error displaying messages available`() {
        val client = mockClientManagerRule.create<SqsClient>()
        whenever(client.getQueueAttributes(Mockito.any<GetQueueAttributesRequest>())).then {
            throw IllegalStateException("Network Error")
        }
        val pane = PollMessagePane(projectRule.project, client, queue)
        runBlocking {
            pane.getAvailableMessages()
        }

        assertThat(pane.messagesAvailableLabel.text).isEqualTo(message("sqs.failed_to_load_total"))
    }
}
