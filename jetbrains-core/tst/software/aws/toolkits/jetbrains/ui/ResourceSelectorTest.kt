// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.util.concurrent.CountDownLatch

class ResourceSelectorTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    val comboBox = ResourceSelector<String>()

    @Test
    fun comboBoxPopulation_useDefaultSelected() {
        val items = listOf("foo", "bar", "baz")

        comboBox.model.selectedItem = "foo"
        comboBox.populateValues(default = "bar") { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("bar")
    }

    @Test
    fun comboBoxPopulation_overrideDefaultSelected() {
        val items = listOf("foo", "bar", "baz")

        comboBox.model.selectedItem = "foo"
        comboBox.populateValues(default = "bar", forceSelectDefault = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("foo")
    }

    @Test
    fun comboBoxPopulation_useDefaultSelectedWhenPreviouslySelectedIsNull() {
        val items = listOf("foo", "bar", "baz")

        comboBox.populateValues(default = "bar", forceSelectDefault = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.selectedItem).isEqualTo("bar")
    }

    @Test
    fun comboBoxPopulation_notUpdateState() {
        val items = listOf("foo", "bar", "baz")

        comboBox.isEnabled = false
        comboBox.populateValues(updateStatus = false) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.isEnabled).isEqualTo(false)
    }

    @Test
    fun comboBoxPopulation_updateStateToDesired() {
        val items = listOf("foo", "bar", "baz")

        val latch = CountDownLatch(1)

        comboBox.isEnabled = false
        comboBox.populateValues(updateStatus = false) {
            latch.await()
            items
        }
        // Wait for the ComboBox to be in loading status.
        while (comboBox.loadingStatus != ResourceSelector.ResourceLoadingStatus.LOADING) {
            Thread.sleep(100L)
        }
        // In the loading status, even enabling the ComboBox, the status will not be changed until the loading finishes.
        comboBox.isEnabled = true
        assertThat(comboBox.isEnabled).isEqualTo(false)
        latch.countDown()
        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.isEnabled).isEqualTo(true)
    }

    @Test
    fun comboBoxPopulation_updateStateToTrueWhenItemsAreNotEmpty() {
        val items = listOf("foo", "bar", "baz")

        comboBox.isEnabled = false
        comboBox.populateValues(updateStatus = true) { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.isEnabled).isEqualTo(true)
    }

    @Test
    fun comboBoxPopulation_updateStateToFalseWhenItemsAreEmpty() {

        arrayOf("foo", "bar").forEach { comboBox.addItem(it) }

        comboBox.isEnabled = true
        comboBox.populateValues(updateStatus = true) { listOf() }

        waitForPopulationComplete(comboBox, 0)
        assertThat(comboBox.isEnabled).isEqualTo(false)
    }

    @Test
    fun comboBoxPopulation_loadingAndFailed() {

        arrayOf("foo", "bar").forEach { comboBox.addItem(it) }

        val exception = Exception("Failed")
        comboBox.populateValues { throw exception }

        waitForPopulationComplete(comboBox, 0)
        assertThat(comboBox.loadingException).isEqualTo(exception)
    }

    @Test
    fun comboBoxPopulation_values() {
        val items = setOf("foo", "bar", "baz")
        comboBox.populateValues() { items }

        waitForPopulationComplete(comboBox, items.size)
        assertThat(comboBox.values()).isEqualTo(items)
    }

    // Wait for the combo box population complete by detecting the item count
    private fun <T> waitForPopulationComplete(comboBox: ComboBox<T>, count: Int) {
        while (comboBox.itemCount != count) {
            Thread.sleep(100)
        }
    }
}