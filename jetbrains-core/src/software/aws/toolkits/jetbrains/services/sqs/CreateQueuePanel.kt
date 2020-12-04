// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.icons.AllIcons
import com.intellij.ide.HelpTooltip
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.JBColor
import com.intellij.ui.SideBorder
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JRadioButton
import javax.swing.JTextField

class CreateQueuePanel {
    lateinit var component: JPanel
        private set
    lateinit var queueName: JTextField
        private set
    lateinit var standardType: JRadioButton
        private set
    lateinit var fifoType: JRadioButton
        private set
    lateinit var queueNameContextHelp: JLabel
        private set
    lateinit var fifoSuffix: JPanel
        private set
    lateinit var textPanel: JPanel
        private set

    init {
        setRadioButton()
        setTooltip()
        setFields()
    }

    private fun setRadioButton() {
        fifoSuffixLabel.isVisible = false
        fifoType.addActionListener {
            fifoSuffixLabel.isVisible = true
        }
        standardType.addActionListener {
            fifoSuffixLabel.isVisible = false
        }
    }

    private fun setTooltip() {
        queueNameContextHelp.icon = AllIcons.General.ContextHelp
        HelpTooltip().apply {
            setDescription(message("sqs.queue.name.tooltip"))
            installOn(queueNameContextHelp)
        }
    }

    private fun setFields() {
        queueName.apply {
            border = IdeBorderFactory.createBorder(SideBorder.TOP or SideBorder.BOTTOM or SideBorder.LEFT)
        }
        fifoSuffix.apply {
            background = queueName.background
            layout = BorderLayout()
            border = IdeBorderFactory.createBorder(SideBorder.TOP or SideBorder.BOTTOM or SideBorder.RIGHT)
            add(fifoSuffixLabel, BorderLayout.WEST)
        }
    }

    companion object {
        val fifoSuffixLabel = JLabel(".fifo").apply {
            foreground = JBColor.GRAY
        }
    }
}
