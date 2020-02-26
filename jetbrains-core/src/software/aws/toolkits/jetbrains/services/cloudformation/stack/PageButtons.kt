// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.openapi.Disposable
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * Next/Prev [Page] buttons
 * [onPageButtonClick] called when user clicks page
 */
class PageButtons(private val onPageButtonClick: (Page) -> Unit) : Disposable {
    private val buttons = Page.values().map { page ->
        page to JButton(page.icon).apply {
            addActionListener { onPageButtonClick(page) }
        }
    }.toMap()
    val component = JPanel(FlowLayout(FlowLayout.RIGHT)).apply {
        buttons.values.forEach { add(it) }
    }

    /**
     * [availablePages] only enable these pages
     */
    fun setPagesAvailable(availablePages: Set<Page>) {
        assert(SwingUtilities.isEventDispatchThread())
        buttons.forEach { it.value.isEnabled = it.key in availablePages }
    }

    override fun dispose() {
        buttons.values.forEach { button ->
            button.actionListeners.forEach { listener -> button.removeActionListener(listener) }
        }
    }
}
