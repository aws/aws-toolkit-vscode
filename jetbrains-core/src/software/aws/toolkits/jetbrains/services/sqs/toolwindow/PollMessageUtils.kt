// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.util.ui.ColumnInfo
import software.amazon.awssdk.services.sqs.model.Message
import software.amazon.awssdk.services.sqs.model.MessageSystemAttributeName
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_POLLED_MESSAGES
import software.aws.toolkits.jetbrains.utils.ui.ResizingDateColumnRenderer
import software.aws.toolkits.jetbrains.utils.ui.ResizingTextColumnRenderer
import software.aws.toolkits.jetbrains.utils.ui.WrappingCellRenderer
import software.aws.toolkits.resources.message
import javax.swing.table.TableCellRenderer

class MessageIdColumn : ColumnInfo<Message, String>(message("sqs.message.message_id")) {
    private val renderer = ResizingTextColumnRenderer()
    override fun valueOf(item: Message?): String? = item?.messageId()
    override fun isCellEditable(item: Message?): Boolean = false
    override fun getRenderer(item: Message?): TableCellRenderer? = renderer
}

class MessageBodyColumn : ColumnInfo<Message, String>(message("sqs.message.message_body")) {
    // Truncated the message body to show up to 1024 characters, as it can be up to 256KB in size. Cannot limit the retrieved message size through API.
    private val renderer = WrappingCellRenderer(wrapOnSelection = true, wrapOnToggle = false, truncateAfterChars = MAX_LENGTH_OF_POLLED_MESSAGES)

    override fun valueOf(item: Message?): String? = item?.body()
    override fun isCellEditable(item: Message?): Boolean = false
    override fun getRenderer(item: Message?): TableCellRenderer? = renderer
}

class MessageSenderIdColumn : ColumnInfo<Message, String>(message("sqs.message.sender_id")) {
    private val renderer = ResizingTextColumnRenderer()
    override fun valueOf(item: Message?): String? = item?.attributes()?.getValue(MessageSystemAttributeName.SENDER_ID)
    override fun isCellEditable(item: Message?): Boolean = false
    override fun getRenderer(item: Message?): TableCellRenderer? = renderer
}

class MessageDateColumn : ColumnInfo<Message, String>(message("sqs.message.timestamp")) {
    private val renderer = ResizingDateColumnRenderer(showSeconds = true)
    override fun valueOf(item: Message?): String? = item?.attributes()?.getValue(MessageSystemAttributeName.SENT_TIMESTAMP)
    override fun isCellEditable(item: Message?): Boolean = false
    override fun getRenderer(item: Message?): TableCellRenderer? = renderer
}
