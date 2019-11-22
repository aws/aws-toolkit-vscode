// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.toolwindow

import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import java.util.UUID
import javax.swing.JLabel

class ToolkitToolWindowManagerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val jbToolWindowManager = ToolWindowManager.getInstance(projectRule.project)

    @Test
    fun canAddAToolWindow() {
        val testToolWindow = aToolkitToolWindow()

        val sut = ToolkitToolWindowManager.getInstance(projectRule.project, testToolWindow)

        sut.addTab("World", JLabel().also { it.text = "Hello" })

        val label = (jbToolWindowManager.getToolWindow(testToolWindow.id)?.contentManager?.getContent(0)?.component as? JLabel)

        assertThat(label?.text).isEqualTo("Hello")
    }

    @Test
    fun toolWindowIsRemovedWhenAllComponentsAreClosed() {
        val testToolWindow = aToolkitToolWindow()

        val sut = ToolkitToolWindowManager.getInstance(projectRule.project, testToolWindow)
        val component = JLabel().also { it.text = "Hello" }

        val tab = sut.addTab("World", component)

        tab.dispose()

        assertThat(jbToolWindowManager.getToolWindow(testToolWindow.id)).isNull()
    }

    @Test
    fun canFindAPreviouslyAddedTab() {
        val testToolWindow = aToolkitToolWindow()

        val sut = ToolkitToolWindowManager.getInstance(projectRule.project, testToolWindow)
        val tab = sut.addTab("World", JLabel().also { it.text = "Hello" }, id = "myId")

        assertThat(sut.find("myId")).isSameAs(tab)
    }

    @Test
    fun onlyOneToolWindowCreatedPerType() {
        val testToolWindow = aToolkitToolWindow()

        val sut = ToolkitToolWindowManager.getInstance(projectRule.project, testToolWindow)

        assertThat(ToolkitToolWindowManager.getInstance(projectRule.project, testToolWindow)).isSameAs(sut)
    }

    private fun aToolkitToolWindow() = ToolkitToolWindowType(UUID.randomUUID().toString(), "Tool Window")
}
