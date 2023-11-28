// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.toolwindow

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import javax.swing.JLabel

class ToolkitToolWindowTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var jbToolWindowManager: ToolWindowManager
    private lateinit var sut: ToolkitToolWindow

    @Before
    fun setUp() {
        jbToolWindowManager = ToolWindowManager.getInstance(projectRule.project)

        val testWindowId = "testWindow"
        ToolWindowManager.getInstance(projectRule.project).registerToolWindow(
            RegisterToolWindowTask(
                id = testWindowId
            )
        )
        sut = object : ToolkitToolWindow {
            override val project = projectRule.project
            override val toolWindowId = testWindowId
        }
    }

    @Test
    fun `can add a tab`() {
        sut.addTab("World", JLabel().also { it.text = "Hello" })

        val label = (jbToolWindowManager.getToolWindow(sut.toolWindowId)?.contentManager?.getContent(0)?.component as? JLabel)

        assertThat(label?.text).isEqualTo("Hello")
    }

    @Test
    fun `can remove a tab`() {
        val tab = sut.addTab("World", JLabel().also { it.text = "Hello" })
        val tab2 = sut.addTab("Tab2", JLabel().also { it.text = "Hello" })
        assertThat(jbToolWindowManager.getToolWindow(sut.toolWindowId)?.contentManager?.contentCount).isEqualTo(2)

        runInEdt {
            sut.removeContent(tab)

            assertThat(jbToolWindowManager.getToolWindow(sut.toolWindowId)?.contentManager).satisfies {
                it!!
                assertThat(it.contentCount).isEqualTo(1)
                assertThat(it.getContent(0)).isEqualTo(tab2)
            }
        }
    }

    @Test
    fun `can find added tab`() {
        val tab = sut.addTab("World", JLabel().also { it.text = "Hello" })
        val tab2 = sut.addTab("Tab2", JLabel().also { it.text = "Hello" })

        assertThat(sut.find("World")).isEqualTo(tab)
        assertThat(sut.find("Tab2")).isEqualTo(tab2)
    }

    @Test
    fun `can show previously added tab`() {
        sut.addTab("World", JLabel().also { it.text = "Hello" }, id = "myId")

        assertThat(sut.showExistingContent("myId")).isTrue
    }

    @Test
    fun `can activate requested tab`() {
        val tab = sut.addTab("World", JLabel().also { it.text = "Hello" })
        val tab2 = sut.addTab("Tab2", JLabel().also { it.text = "Hello" })
        val jbManager = jbToolWindowManager.getToolWindow(sut.toolWindowId)?.contentManager!!

        sut.show(tab2)
        assertThat(jbManager.selectedContent).isEqualTo(tab2)

        sut.show(tab)
        assertThat(jbManager.selectedContent).isEqualTo(tab)
    }
}
