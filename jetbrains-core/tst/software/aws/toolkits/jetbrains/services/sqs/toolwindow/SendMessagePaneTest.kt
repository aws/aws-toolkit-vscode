// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest
import software.amazon.awssdk.services.sqs.model.SendMessageResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_FIFO_ID
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message

class SendMessagePaneTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val mockClientManagerRule = MockClientManagerRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val regionProvider = MockRegionProviderRule()

    private lateinit var client: SqsClient
    private lateinit var region: AwsRegion
    private lateinit var standardQueue: Queue
    private lateinit var fifoQueue: Queue
    private lateinit var standardPane: SendMessagePane
    private lateinit var fifoPane: SendMessagePane

    @Before
    fun reset() {
        client = mockClientManager.create()
        region = regionProvider.defaultRegion()
        standardQueue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/standard", region)
        fifoQueue = Queue("https://sqs.us-east-1.amazonaws.com/123456789012/fifo.fifo", region)
        standardPane = SendMessagePane(projectRule.project, client, standardQueue, disposableRule.disposable)
        fifoPane = SendMessagePane(projectRule.project, client, fifoQueue, disposableRule.disposable)
    }

    @Test
    fun `No input fails to send for standard`() {
        standardPane.apply {
            inputText.text = ""
        }

        assertThat(runBlocking { standardPane.validateFields() }).isFalse()
        assertThat(standardPane.fifoFields.component.isVisible).isFalse()
    }

    @Test
    fun `No input fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = ""
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = ""
        }

        runBlocking {
            assertThat(fifoPane.validateFields()).isFalse()
        }
    }

    @Test
    fun `No deduplication ID fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = GROUP_ID
        }

        assertThat(runBlocking { fifoPane.validateFields() }).isFalse()
    }

    @Test
    fun `No group ID fails to send for fifo`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = DEDUPLICATION_ID
            fifoFields.groupId.text = ""
        }

        runBlocking { fifoPane.sendMessage() }

        assertThat(runBlocking { fifoPane.validateFields() }).isFalse()
    }

    @Test
    fun `ID too long fails`() {
        fifoPane.apply {
            inputText.text = MESSAGE
            fifoFields.deduplicationId.text = RuleUtils.randomName(length = MAX_LENGTH_OF_FIFO_ID + 1)
            fifoFields.groupId.text = GROUP_ID
        }

        runBlocking { fifoPane.sendMessage() }

        assertThat(runBlocking { fifoPane.validateFields() }).isFalse()
    }

    @Test
    fun `Error sending message`() {
        whenever(client.sendMessage(Mockito.any<SendMessageRequest>())).then {
            throw IllegalStateException("Network Error")
        }

        standardPane.apply {
            inputText.text = MESSAGE
        }

        runBlocking {
            standardPane.sendMessage()
            waitForTrue { standardPane.messageSentLabel.isVisible }
        }

        assertThat(standardPane.messageSentLabel.text).isEqualTo(message("sqs.failed_to_send_message"))
    }

    @Test
    fun `Message sent for standard`() {
        whenever(client.sendMessage(Mockito.any<SendMessageRequest>())).thenReturn(
            SendMessageResponse.builder().messageId(MESSAGE_ID).build()
        )
        standardPane.apply {
            inputText.text = MESSAGE
        }

        runBlocking {
            standardPane.sendMessage()
            waitForTrue { standardPane.messageSentLabel.isVisible }
        }

        assertThat(standardPane.messageSentLabel.text).isEqualTo(message("sqs.send.message.success", MESSAGE_ID))
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
        }

        runBlocking {
            fifoPane.sendMessage()
            waitForTrue { fifoPane.messageSentLabel.isVisible }
        }

        assertThat(fifoPane.messageSentLabel.text).isEqualTo(message("sqs.send.message.success", MESSAGE_ID))
    }

    private companion object {
        const val MESSAGE_ID = "123"
        const val MESSAGE = "Message body"
        const val DEDUPLICATION_ID = "Deduplication ID"
        const val GROUP_ID = "Group Id"
    }
}
