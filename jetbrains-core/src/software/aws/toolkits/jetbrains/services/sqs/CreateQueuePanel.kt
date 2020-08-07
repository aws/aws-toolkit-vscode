// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.icons.AllIcons
import com.intellij.ide.HelpTooltip
import software.aws.toolkits.resources.message
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JRadioButton
import javax.swing.JTextField

class CreateQueuePanel {
    lateinit var component: JPanel
    lateinit var queueName: JTextField
    lateinit var standardType: JRadioButton
    lateinit var fifoType: JRadioButton
    lateinit var fifoSuffixLabel: JLabel
    lateinit var queueNameContextHelp: JLabel

    init {
        setRadioButton()
        setTooltip()
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
}
