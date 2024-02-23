// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.ui.CellRendererPanel
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SeparatorWithText
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.components.panels.OpaquePanel
import java.awt.BorderLayout
import java.awt.Component
import javax.accessibility.AccessibleContext
import javax.swing.JList
import javax.swing.ListCellRenderer
import javax.swing.border.Border

class CawsProjectListRenderer(private val loadingRenderer: ListCellRenderer<in CawsProject>) : ColoredListCellRenderer<CawsProject>() {
    override fun getListCellRendererComponent(list: JList<out CawsProject>?, value: CawsProject?, index: Int, selected: Boolean, hasFocus: Boolean): Component {
        val c = super.getListCellRendererComponent(list, value, index, selected, hasFocus)
        list ?: return c
        if (list.model.size == 0) {
            // probably still loading
            return loadingRenderer.getListCellRendererComponent(list, value, index, selected, hasFocus)
        }

        val component = c as? SimpleColoredComponent ?: return c
        value ?: return c

        if (index == -1) {
            // if not a popup
            return c
        }

        val panel = object : CellRendererPanel() {
            init {
                layout = BorderLayout()
            }

            private val myContext: AccessibleContext = component.getAccessibleContext()
            override fun getAccessibleContext(): AccessibleContext {
                return myContext
            }

            override fun setBorder(border: Border?) {
                // we do not want to outer UI to add a border to that JPanel
                // see com.intellij.ide.ui.laf.darcula.ui.DarculaComboBoxUI.CustomComboPopup#customizeListRendererComponent
                component.border = border
            }
        }

        component.isOpaque = true
        panel.isOpaque = true
        panel.background = list.background
        panel.add(component, BorderLayout.CENTER)

        if (index == 0 || list.model.getElementAt(index - 0).space != value.space) {
            val separator = SeparatorWithText()
            separator.caption = value.space
            val wrapper = OpaquePanel(BorderLayout())
            wrapper.add(separator, BorderLayout.CENTER)
            wrapper.background = list.background

            panel.add(wrapper, BorderLayout.NORTH)
        }

        return panel
    }

    override fun customizeCellRenderer(list: JList<out CawsProject>, value: CawsProject?, index: Int, selected: Boolean, hasFocus: Boolean) {
        value ?: return
        if (index == -1) {
            // if not a popup
            append("${value.space} - ${value.project}")
        } else {
            append(value.project)
        }
    }
}
