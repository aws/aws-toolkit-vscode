// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class ResourceSelectorTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val mockResource = mock<Resource.Cached<List<String>>> {
        on { id }.thenReturn("mockResource")
    }

    private val mockResourceCache = MockResourceCache.getInstance(projectRule.project)

    @Test
    fun canSpecifyADefaultItem() {
        mockResourceCache.addEntry(mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        comboBox.selectedItem = "bar"

        waitForPopulationComplete(comboBox, 3)
        runInEdtAndWait {
            assertThat(comboBox.selected()).isEqualTo("bar")
        }
    }

    @Test
    fun previouslySelectedIsRetainedIfNoDefault() {
        mockResourceCache.addEntry(mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        comboBox.selectedItem = "bar"
        comboBox.reload()

        waitForPopulationComplete(comboBox, 3)
        runInEdtAndWait {
            assertThat(comboBox.selected()).isEqualTo("bar")
        }
    }

    @Test
    fun canSpecifyADefaultItemMatcher() {
        mockResourceCache.addEntry(mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        comboBox.reload()
        comboBox.selectedItem { it.endsWith("z") }

        waitForPopulationComplete(comboBox, 3)
        runInEdtAndWait {
            assertThat(comboBox.selected()).isEqualTo("baz")
        }
    }

    @Test
    fun loadFailureShowsAnErrorAndDisablesTheBox() {
        val future = CompletableFuture<List<String>>()
        mockResourceCache.addEntry(mockResource, future)
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        future.completeExceptionally(RuntimeException("boom"))

        runInEdtAndWait {
            assertThat(comboBox.isEnabled).isFalse()
            assertThat(comboBox.model.selectedItem).isEqualTo(message("loading_resource.failed"))
        }
    }

    @Test
    fun usePreviouslySelectedItemAfterReloadUnlessSelectItemSet() {
        mockResourceCache.addEntry(mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        runInEdtAndWait {
            comboBox.selectedItem = "bar"
        }

        comboBox.reload()

        waitForPopulationComplete(comboBox, 3)
        runInEdtAndWait {
            assertThat(comboBox.selected()).isEqualTo("bar")
        }
    }

    @Test
    fun comboBoxIsDisabledWhileEntriesAreLoading() {
        val future = CompletableFuture<List<String>>()
        mockResourceCache.addEntry(mockResource, future)
        val comboBox = ResourceSelector(projectRule.project, mockResource)

        assertThat(comboBox.selected()).isNull()

        comboBox.reload()
        runInEdtAndWait {
            assertThat(comboBox.isEnabled).isFalse()
            assertThat(comboBox.selectedItem).isEqualTo(message("loading_resource.loading"))
        }

        future.complete(listOf("foo", "bar", "baz"))
        runInEdtAndWait {
            assertThat(comboBox.isEnabled).isTrue()
            assertThat(comboBox.selectedItem).isNull()
        }
    }

    // Wait for the combo box population complete by detecting the item count
    private fun <T> waitForPopulationComplete(comboBox: ComboBox<T>, count: Int) {
        while (comboBox.itemCount != count) {
            Thread.sleep(100)
        }
    }
}