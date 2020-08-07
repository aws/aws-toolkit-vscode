// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.sqs.model.Message
import software.amazon.awssdk.services.sqs.model.MessageSystemAttributeName
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_POLLED_MESSAGES

class PollMessageUtilsTest {
    private val message1 = buildMessage(RuleUtils.randomName(length = 10))
    private val message2 = buildMessage(RuleUtils.randomName(length = 1024))
    private val message3 = buildMessage(RuleUtils.randomName(length = 1025))

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun `Message mapped to columns as expected`() {
        val table = MessagesTable().apply {
            tableModel.addRow(message1)
        }

        assertThat(table.tableModel.items.size).isOne()
        assertThat(table.tableModel.items.first().body()).isEqualTo(message1.body())
        assertThat(table.tableModel.items.first().messageId()).isEqualTo(message1.messageId())
        assertThat(table.tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENDER_ID)).isEqualTo("1234567890:test1")
        assertThat(table.tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENT_TIMESTAMP)).isEqualTo("111111111")
    }

    @Test
    fun `Long message body is truncated`() {
        // Message 1 has length below 1024
        val column1 = MessageBodyColumn().valueOf(message1)
        // Message 2 has length of 1024
        val column2 = MessageBodyColumn().valueOf(message2)
        // Message 3 has length of 1025
        val column3 = MessageBodyColumn().valueOf(message3)

        assertThat(column1?.length).isEqualTo(10)
        assertThat(column2?.length).isEqualTo(MAX_LENGTH_OF_POLLED_MESSAGES)
        assertThat(column3?.length).isEqualTo(MAX_LENGTH_OF_POLLED_MESSAGES)
    }

    private fun buildMessage(body: String): Message {
        val message = Message.builder()
            .body(body)
            .messageId("ABC")
            .attributes(mapOf(Pair(MessageSystemAttributeName.SENDER_ID, "1234567890:test1"), Pair(MessageSystemAttributeName.SENT_TIMESTAMP, "111111111")))
            .build()
        return message
    }
}
