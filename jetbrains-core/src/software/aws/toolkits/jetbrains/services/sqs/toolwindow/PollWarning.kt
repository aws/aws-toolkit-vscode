// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.ui.components.JBLabel
import javax.swing.JButton
import javax.swing.JPanel
import software.aws.toolkits.resources.message

class PollWarning(private val pane: PollMessagePane) {
    lateinit var content: JPanel
    lateinit var warningText: JBLabel
    lateinit var pollButton: JButton

    init {
        warningText.text = message("sqs.poll.warning.text")
        pollButton.addActionListener {
            pane.startPolling()
        }
    }
}
