// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.openapi.ui.ComboBoxWithWidePopup
import com.intellij.testGuiFramework.cellReader.ExtendedJComboboxCellReader
import com.intellij.testGuiFramework.framework.Timeouts
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.util.step
import org.fest.swing.core.Robot
import org.fest.swing.fixture.ContainerFixture
import org.fest.swing.fixture.JComboBoxFixture
import org.fest.swing.timing.Timeout
import java.awt.Container

class SdkChooserFixture(robot: Robot, jdkComboBox: ComboBoxWithWidePopup<*>) : JComboBoxFixture(robot, jdkComboBox) {
    init {
        this.replaceCellReader(ExtendedJComboboxCellReader())
    }
}

fun <C : Container> ContainerFixture<C>.sdkChooser(timeout: Timeout = Timeouts.defaultTimeout) =
    step("search for SDK combo box") {
        val jdkComboBox: ComboBoxWithWidePopup<*> = findComponentWithTimeout(timeout) {
            it.javaClass.name == "com.intellij.openapi.roots.ui.configuration.JdkComboBox"
        }
        SdkChooserFixture(robot(), jdkComboBox)
    }
