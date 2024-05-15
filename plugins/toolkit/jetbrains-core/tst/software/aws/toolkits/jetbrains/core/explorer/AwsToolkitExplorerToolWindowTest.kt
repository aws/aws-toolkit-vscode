// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.RegisterExtension
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.ToolWindowHeadlessManagerImpl

class AwsToolkitExplorerToolWindowTest {
    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
    }

    @Test
    fun `save current tab state`() {
        (ToolWindowManager.getInstance(projectExtension.project) as ToolWindowHeadlessManagerImpl)
            .doRegisterToolWindow(AwsToolkitExplorerFactory.TOOLWINDOW_ID)
        val sut = runInEdtAndGet { AwsToolkitExplorerToolWindow(projectExtension.project) }

        runInEdt {
            sut.selectTab(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID)
            assertThat(sut.state.selectedTab).isEqualTo(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID)

            sut.selectTab(AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID)
            assertThat(sut.state.selectedTab).isEqualTo(AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID)
        }
    }

    @Test
    fun `load tab state`() {
        (ToolWindowManager.getInstance(projectExtension.project) as ToolWindowHeadlessManagerImpl)
            .doRegisterToolWindow(AwsToolkitExplorerFactory.TOOLWINDOW_ID)
        val sut = runInEdtAndGet { AwsToolkitExplorerToolWindow(projectExtension.project) }
        runInEdt {
            sut.loadState(
                AwsToolkitExplorerToolWindowState().apply {
                    selectedTab =
                        AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID
                }
            )
            assertThat(sut.state.selectedTab).isEqualTo(AwsToolkitExplorerToolWindow.Q_TAB_ID)

            sut.loadState(
                AwsToolkitExplorerToolWindowState().apply {
                    selectedTab =
                        AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID
                }
            )
            assertThat(sut.state.selectedTab).isEqualTo(AwsToolkitExplorerToolWindow.Q_TAB_ID)
        }
    }

    @Test
    fun `handles loading invalid state`() {
        (ToolWindowManager.getInstance(projectExtension.project) as ToolWindowHeadlessManagerImpl)
            .doRegisterToolWindow(AwsToolkitExplorerFactory.TOOLWINDOW_ID)
        val sut = runInEdtAndGet { AwsToolkitExplorerToolWindow(projectExtension.project) }

        sut.loadState(
            AwsToolkitExplorerToolWindowState().apply {
                selectedTab = aString()
            }
        )
    }
}
