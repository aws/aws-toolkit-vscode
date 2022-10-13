// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.sqs.model.Message
import software.amazon.awssdk.services.sqs.model.MessageSystemAttributeName
import software.aws.toolkits.core.utils.RuleUtils

class PollMessageUtilsTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun `Message mapped to columns as expected`() {
        val message = Message.builder()
            .body(RuleUtils.randomName(length = 10))
            .messageId("ABC")
            .attributes(
                mapOf(
                    Pair(MessageSystemAttributeName.SENDER_ID, "1234567890:test1"),
                    Pair(MessageSystemAttributeName.SENT_TIMESTAMP, "111111111")
                )
            )
            .build()
        val table = MessagesTable().apply {
            runInEdtAndWait {
                tableModel.addRow(message)
            }
        }

        assertThat(table.tableModel.items.size).isOne()
        assertThat(table.tableModel.items.first().body()).isEqualTo(message.body())
        assertThat(table.tableModel.items.first().messageId()).isEqualTo(message.messageId())
        assertThat(table.tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENDER_ID)).isEqualTo("1234567890:test1")
        assertThat(table.tableModel.items.first().attributes().getValue(MessageSystemAttributeName.SENT_TIMESTAMP)).isEqualTo("111111111")
    }
}
