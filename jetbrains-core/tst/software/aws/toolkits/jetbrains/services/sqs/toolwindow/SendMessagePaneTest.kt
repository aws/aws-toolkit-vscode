// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.ide.util.PropertiesComponent
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest
import software.amazon.awssdk.services.sqs.model.SendMessageResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_FIFO_ID
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message

class SendMessagePaneTest : BaseCoroutineTest() {
    private lateinit var client: SqsClient
    private lateinit var region: AwsRegion
    private lateinit var standardQueue: Queue
    private lateinit var fifoQueue: Queue
    private lateinit var standardPane: SendMessagePane
    private lateinit var fifoPane: SendMessagePane
    private lateinit var cache: PropertiesComponent

    @Before
    fun reset() {
        client = mockClientManagerRule.create()
        region = MockRegionProvider.getInstance().defaultRegion()
        standardQueue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/standard", region)
        fifoQueue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/fifo.fifo", region)
        cache = PropertiesComponent.getInstance(projectRule.project)
        standardPane = SendMessagePane(client, standardQueue, cache)
        fifoPane = SendMessagePane(client, fifoQueue, cache)
    }

    @Test
    fun `No input fails to send for standard`() {
        standardPane.apply {
            inputText.text = ""
            runBlocking { sendMessage() }
        }

        assertThat(standardPane.bodyErrorLabel.isVisible).isTrue()
        assertThat(standardPane.fifoFields.component.isVisible).isFalse()
    }

    @Test
    fun `No input fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = ""
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = ""
            runBlocking { sendMessage() }
        }

        assertThat(fifoPane.bodyErrorLabel.isVisible).isTrue()
        assertThat(fifoPane.fifoFields.deduplicationErrorLabel.isVisible).isTrue()
        assertThat(fifoPane.fifoFields.groupErrorLabel.isVisible).isTrue()
    }

    @Test
    fun `No deduplication ID fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = GROUP_ID
            runBlocking { sendMessage() }
        }

        assertThat(fifoPane.bodyErrorLabel.isVisible).isFalse()
        assertThat(fifoPane.fifoFields.deduplicationErrorLabel.isVisible).isTrue()
        assertThat(fifoPane.fifoFields.groupErrorLabel.isVisible).isFalse()
    }

    @Test
    fun `No group ID fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = DEDUPLICATION_ID
            fifoFields.groupId.text = ""
            runBlocking { sendMessage() }
        }

        assertThat(fifoPane.bodyErrorLabel.isVisible).isFalse()
        assertThat(fifoPane.fifoFields.deduplicationErrorLabel.isVisible).isFalse()
        assertThat(fifoPane.fifoFields.groupErrorLabel.isVisible).isTrue()
    }

    @Test
    fun `ID too long fails`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = RuleUtils.randomName(length = MAX_LENGTH_OF_FIFO_ID + 1)
            fifoFields.groupId.text = GROUP_ID
            runBlocking { sendMessage() }
        }

        assertThat(fifoPane.bodyErrorLabel.isVisible).isFalse()
        assertThat(fifoPane.fifoFields.deduplicationErrorLabel.isVisible).isTrue()
        assertThat(fifoPane.fifoFields.groupErrorLabel.isVisible).isFalse()
        assertThat(fifoPane.fifoFields.deduplicationErrorLabel.text).isEqualTo(message("sqs.message.validation.long.id"))
    }

    @Test
    fun `Error sending message`() {
        whenever(client.sendMessage(Mockito.any<SendMessageRequest>())).then {
            throw IllegalStateException("Network Error")
        }

        standardPane.apply {
            inputText.text = MESSAGE
            runBlocking {
                sendMessage()
                waitForTrue { standardPane.confirmationLabel.isVisible }
            }
        }

        assertThat(standardPane.confirmationLabel.text).isEqualTo(message("sqs.failed_to_send_message"))
    }

    @Test
    fun `Message sent for standard`() {
        whenever(client.sendMessage(Mockito.any<SendMessageRequest>())).thenReturn(
            SendMessageResponse.builder().messageId(MESSAGE_ID).build()
        )
        standardPane.apply {
            inputText.text = MESSAGE
            runBlocking {
                sendMessage()
                waitForTrue { standardPane.confirmationLabel.isVisible }
            }
        }

        assertThat(standardPane.confirmationLabel.text).isEqualTo(message("sqs.send.message.success", MESSAGE_ID))
    }

    @Test
    fun `Message sent for fifo`() {
        whenever(client.sendMessage(Mockito.any<SendMessageRequest>())).thenReturn(
            SendMessageResponse.builder().messageId(MESSAGE_ID).build()
        )
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = DEDUPLICATION_ID
            fifoFields.groupId.text = GROUP_ID
            runBlocking {
                sendMessage()
                waitForTrue { fifoPane.confirmationLabel.isVisible }
            }
        }

        assertThat(fifoPane.confirmationLabel.text).isEqualTo(message("sqs.send.message.success", MESSAGE_ID))
    }

    private companion object {
        const val MESSAGE_ID = "123"
        const val MESSAGE = "Message body"
        const val DEDUPLICATION_ID = "Deduplication ID"
        const val GROUP_ID = "Group Id"
    }
}
