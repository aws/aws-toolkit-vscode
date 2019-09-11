// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.jTree
import com.intellij.testGuiFramework.impl.textfield
import com.intellij.testGuiFramework.util.step
import org.junit.Test
import software.aws.toolkits.jetbrains.fixtures.openSettingsDialog

class SetSamCli : GuiTestCase() {
    @Test
    fun setSamCli() {
        val samPath = System.getenv("SAM_CLI_EXEC") ?: SamExecutableDetector().detect() ?: "sam"
        welcomeFrame {
            // this may become obsolete once jetbrains provides a util to open the settings dialog
            openSettingsDialog()
            dialog(defaultSettingsTitle) {
                jTree("Tools", "AWS").clickPath()
                step("Set SAM CLI executable path to $samPath") {
                    val execPath = textfield("SAM CLI executable:")
                    execPath.setText(samPath)
                }
                button("OK").click()
            }
        }
    }
}
