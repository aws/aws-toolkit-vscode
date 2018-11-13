// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.openapi.ui.ComboBox
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule
import java.awt.event.MouseEvent
import javax.swing.DefaultComboBoxModel
import javax.swing.JCheckBox
import javax.swing.JTextField

class UiUtilsTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

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
        assertThat(listModel.find { it == "bye" }).isEqualTo(null)
    }

    @Test
    fun comboBoxPopulation_useDefaultSelected() {
        val comboBox = ComboBox<String>()
        val items = listOf("foo", "bar", "baz")

        comboBox.model.selectedItem = "foo"
        comboBox.populateValues(default = "bar") { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("bar")
    }

    @Test
    fun comboBoxPopulation_overrideDefaultSelected() {
        val comboBox = ComboBox<String>()
        val items = listOf("foo", "bar", "baz")

        comboBox.model.selectedItem = "foo"
        comboBox.populateValues(default = "bar", forceSelectDefault = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("foo")
    }

    @Test
    fun comboBoxPopulation_useDefaultSelectedWhenPreviouslySelectedIsNull() {
        val comboBox = ComboBox<String>()
        val items = listOf("foo", "bar", "baz")

        comboBox.populateValues(default = "bar", forceSelectDefault = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("bar")
    }

    @Test
    fun comboBoxPopulation_notUpdateState() {
        val comboBox = ComboBox<String>()
        val items = listOf("foo", "bar", "baz")

        comboBox.isEnabled = false
        comboBox.populateValues(updateStatus = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.isEnabled).isEqualTo(false)
    }

    @Test
    fun comboBoxPopulation_updateStateToTrueWhenItemsAreNotEmpty() {
        val comboBox = ComboBox<String>()
        val items = listOf("foo", "bar", "baz")

        comboBox.isEnabled = false
        comboBox.populateValues(updateStatus = true) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.isEnabled).isEqualTo(true)
    }

    @Test
    fun comboBoxPopulation_updateStateToFalseWhenItemsAreEmpty() {
        val comboBox = ComboBox<String>(arrayOf("foo", "bar"))

        comboBox.isEnabled = true
        comboBox.populateValues(updateStatus = true) { listOf() }

        waitForPopulationComplete(comboBox, 0)
        assertThat(comboBox.isEnabled).isEqualTo(false)
    }

    // Wait for the combo box population complete by detecting the item count
    private fun <T> waitForPopulationComplete(comboBox: ComboBox<T>, count: Int) {
        while (comboBox.itemCount != count) {
            Thread.sleep(100)
        }
    }
}