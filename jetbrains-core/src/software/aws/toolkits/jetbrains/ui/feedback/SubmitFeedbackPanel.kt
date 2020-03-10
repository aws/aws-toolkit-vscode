// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.ColorUtil
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.util.IconUtil
import com.intellij.util.text.nullize
import icons.AwsIcons
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.jetbrains.services.telemetry.ClientMetadata
import software.aws.toolkits.resources.message
import java.net.URLEncoder
import javax.swing.ButtonGroup
import javax.swing.JLabel
import javax.swing.JPanel

class SubmitFeedbackPanel(initiallyPositive: Boolean = true) {
    private lateinit var rootPanel: JPanel
    private lateinit var smileButton: JBRadioButton
    private lateinit var sadButton: JBRadioButton
    private lateinit var smileIcon: JLabel
    private lateinit var sadIcon: JLabel
    private lateinit var textArea: JBTextArea
    private lateinit var textAreaPane: JBScrollPane
    private lateinit var lengthLimitLabel: JLabel
    private lateinit var githubLink: JBLabel
    private lateinit var sentimentButtonGroup: ButtonGroup

    val panel: JPanel
        get() = rootPanel

    val sentiment: Sentiment?
        get() = when {
            smileButton.isSelected -> Sentiment.POSITIVE
            sadButton.isSelected -> Sentiment.NEGATIVE
            else -> null
        }

    var comment: String?
        get() = textArea.text?.nullize(true)
        @TestOnly
        internal set(value) { textArea.text = value }

    private fun createUIComponents() {
        textArea = JBTextArea(6, 70)
        textArea.lineWrap = true
        textAreaPane = JBScrollPane(textArea)
        smileIcon = JLabel(IconUtil.scale(AwsIcons.Misc.SMILE, null, 3f))
        sadIcon = JLabel(IconUtil.scale(AwsIcons.Misc.FROWN, null, 3f))
        lengthLimitLabel = JLabel()

        textArea.document.addUndoableEditListener { onTextAreaUpdate() }
    }

    init {
        // runs after $$$setupUI$$$
        // null out placeholder text
        smileIcon.text = null
        sadIcon.text = null

        // select initial value
        if (initiallyPositive) {
            smileButton.isSelected = true
        } else {
            sadButton.isSelected = true
        }

        // update remaining character count
        onTextAreaUpdate()
        // make links work
        githubLink.setCopyable(true)
    }

    private fun onTextAreaUpdate() {
        val currentLength = comment?.length ?: 0
        val lengthText = message("feedback.limit.label", currentLength, MAX_LENGTH)
        lengthLimitLabel.text = if (currentLength >= MAX_LENGTH) {
            "<html><font color='#${ColorUtil.toHex(DialogWrapper.ERROR_FOREGROUND_COLOR)}'>$lengthText</font></html>"
        } else {
            lengthText
        }

        val currentBody = comment ?: ""
        githubLink.text = message("feedback.github.link", "$GITHUB_LINK_BASE${URLEncoder.encode("$currentBody\n\n$toolkitMetadata", Charsets.UTF_8.name())}")
    }

    @TestOnly
    internal fun clearSentimentSelection() {
        sentimentButtonGroup.clearSelection()
    }

    companion object {
        const val MAX_LENGTH = 2000 // backend restriction

        private const val GITHUB_LINK_BASE = "https://github.com/aws/aws-toolkit-jetbrains/issues/new?body="
        private val toolkitMetadata = ClientMetadata.DEFAULT_METADATA.let {
            """
                ---
                Toolkit: ${it.productName} ${it.productVersion}
                OS: ${it.os} ${it.osVersion}
                IDE: ${it.parentProduct} ${it.parentProductVersion}
            """.trimIndent()
        }
    }
}
