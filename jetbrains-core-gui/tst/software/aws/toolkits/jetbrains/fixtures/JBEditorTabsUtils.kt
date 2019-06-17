// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.testGuiFramework.framework.Timeouts
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.util.step
import com.intellij.ui.tabs.JBTabs
import com.intellij.ui.tabs.TabInfo
import com.intellij.ui.tabs.impl.TabLabel
import org.fest.swing.edt.GuiActionRunner.execute
import org.fest.swing.edt.GuiTask
import org.fest.swing.fixture.ContainerFixture
import org.fest.swing.timing.Timeout
import java.awt.Container

class JBTabsFixture(private val tabInfo: TabInfo, private val tabs: JBTabs) {
    fun selectTab() {
        execute(object : GuiTask() {
            override fun executeInEDT() {
                tabs.select(tabInfo, true)
            }
        })
    }
}

fun <C : Container> ContainerFixture<C>.jbTab(tabTitle: String, timeout: Timeout = Timeouts.defaultTimeout) =
    step("search JBTabs with label '$tabTitle'") {
        val tabLabel: TabLabel = findComponentWithTimeout(timeout) { it.info.text == tabTitle }
        JBTabsFixture(tabLabel.info, tabLabel.parent as JBTabs)
    }
