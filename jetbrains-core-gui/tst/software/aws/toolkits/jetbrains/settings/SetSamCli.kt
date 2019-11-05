// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.testGuiFramework.fixtures.JDialogFixture
import com.intellij.testGuiFramework.fixtures.SearchTextFieldFixture
import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.impl.jTree
import com.intellij.testGuiFramework.impl.textfield
import com.intellij.testGuiFramework.util.Key
import com.intellij.testGuiFramework.util.Modifier
import com.intellij.testGuiFramework.util.plus
import com.intellij.testGuiFramework.util.step
import com.intellij.ui.SearchTextField
import org.junit.Test

class SetSamCli : GuiTestCase() {
    @Test
    fun setSamCli() {
        val samPath = System.getenv("SAM_CLI_EXEC") ?: SamExecutableDetector().detect() ?: "sam"
        welcomeFrame {
            step("Open preferences page") {
                shortcut(Modifier.CONTROL + Modifier.ALT + Key.S, Modifier.META + Key.COMMA)

                dialog(defaultSettingsTitle) {
                    // Search for AWS because sometimes it is off the screen
                    step("Search for AWS") {
                        findSearchTextField().click()

                        robot().enterText("AWS")
                    }

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

    private fun JDialogFixture.findSearchTextField(): SearchTextFieldFixture {
        val searchTextField = findComponentWithTimeout(this.target(), SearchTextField::class.java)
        return SearchTextFieldFixture(this.robot(), searchTextField)
    }
}
