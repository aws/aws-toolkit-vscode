// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import java.awt.event.MouseEvent
import javax.swing.DefaultComboBoxModel
import javax.swing.JCheckBox
import javax.swing.JTextField

class UiUtilsTest {

    @Test
    fun canBindQuickEnableEventToAComponent() {
        val component = object : JTextField() {
            override fun contains(x: Int, y: Int) = true
        }
        val checkbox = JCheckBox().apply { isSelected = false }
        val runnable = mock<Runnable>()

        component.addQuickSelect(checkbox, runnable)

        val click = MouseEvent(component, MouseEvent.BUTTON1, 0, 0, 100, 100, 1, false)
        component.mouseListeners.forEach { it.mousePressed(click); it.mouseReleased(click) }
        assertThat(checkbox.isSelected).isTrue()
        verify(runnable).run()
    }

    @Test
    fun canFindAnElementFromAListModel() {
        val listModel = DefaultComboBoxModel<String>(arrayOf("hello", "world"))
        assertThat(listModel.find { it == "hello" }).isEqualTo("hello")
        assertThat(listModel.find { it == "bye" }).isNull()
    }
}
