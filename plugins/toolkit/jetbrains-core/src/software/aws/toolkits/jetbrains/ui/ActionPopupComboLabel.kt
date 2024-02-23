// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.icons.AllIcons
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.components.BorderLayoutPanel
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.event.ChangeListener

open class ActionPopupComboLabel(private val logic: ActionPopupComboLogic) : BorderLayoutPanel() {
    private val label = JBLabel()

    init {
        isOpaque = false

        val arrowLabel = JBLabel(AllIcons.General.ArrowDown)
        addToCenter(label)
        addToRight(arrowLabel)

        val clickAdapter = object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                logic.showPopup(this@ActionPopupComboLabel)
            }
        }
        label.addMouseListener(clickAdapter)
        arrowLabel.addMouseListener(clickAdapter)
        logic.addChangeListener {
            updateText()
        }

        updateText()
    }

    fun updateText() {
        label.text = logic.displayValue()
        label.toolTipText = logic.tooltip()
    }
}

interface ActionPopupComboLogic {
    fun showPopup(sourceComponent: JComponent)
    fun displayValue(): String
    fun addChangeListener(changeListener: ChangeListener)
    fun tooltip(): String? = null
}
