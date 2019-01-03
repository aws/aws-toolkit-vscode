// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.progress.util.AbstractProgressIndicatorExBase
import com.intellij.openapi.wm.ex.ProgressIndicatorEx
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.UIUtil.invokeLaterIfNeeded
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JProgressBar

class ProgressPanel(progressIndicator: ProgressIndicatorEx) : AbstractProgressIndicatorExBase() {
    private lateinit var text2Label: JBLabel
    private lateinit var textLabel: JLabel
    private lateinit var progressBar: JProgressBar
    private lateinit var cancelButton: JButton
    private lateinit var content: JPanel

    init {
        progressIndicator.addStateDelegate(this)
        setModalityProgress(null)

        cancelButton.addActionListener {
            progressIndicator.cancel()
        }
    }

    override fun setText(text: String?) {
        super.setText(text)
        invokeLaterIfNeeded {
            textLabel.text = text
        }
    }

    override fun setFraction(fraction: Double) {
        super.setFraction(fraction)
        invokeLaterIfNeeded {
            val value = (100 * fraction).toInt()
            progressBar.value = value
            progressBar.string = "$value%"
        }
    }

    override fun setText2(text: String?) {
        super.setText2(text)
        invokeLaterIfNeeded {
            text2Label.text = text
        }
    }

    override fun setIndeterminate(indeterminate: Boolean) {
        invokeLaterIfNeeded {
            progressBar.isIndeterminate = indeterminate
        }
    }

    override fun cancel() {
        super.cancel()
        cancelButton.isEnabled = false
    }
}
