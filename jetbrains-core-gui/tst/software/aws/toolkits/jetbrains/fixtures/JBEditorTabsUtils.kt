// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.testGuiFramework.framework.Timeouts
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.util.step
import org.fest.swing.core.Robot
import org.fest.swing.fixture.ContainerFixture
import org.fest.swing.timing.Timeout
import java.awt.Container
import javax.swing.JPanel

// TODO: They re-did the tabs in 2019.2, so we are using hacks to attempt to hide that. Switch back to TabLabel / TabInfo FIX_WHEN_MIN_IS_192
class JBTabsFixture(private val robot: Robot, private val tabLabel: JPanel) {
    fun selectTab() {
        robot.click(tabLabel)
    }
}

fun <C : Container> ContainerFixture<C>.jbTab(tabTitle: String, timeout: Timeout = Timeouts.defaultTimeout) =
    step("search JBTabs with label '$tabTitle'") {
        val tabLabel: JPanel = findComponentWithTimeout(timeout) { it.toString() == tabTitle }
        JBTabsFixture(robot(), tabLabel)
    }
