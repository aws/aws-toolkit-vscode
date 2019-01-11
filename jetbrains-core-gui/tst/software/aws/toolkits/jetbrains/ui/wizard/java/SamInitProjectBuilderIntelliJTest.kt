// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.java

import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.combobox
import com.intellij.testGuiFramework.impl.jList
import com.intellij.testGuiFramework.impl.waitAMoment
import org.fest.swing.timing.Pause
import org.junit.Test

class SamInitProjectBuilderIntelliJTest : GuiTestCase() {
    @Test
    fun test_new_from_template() {
        welcomeFrame {
            createNewProject()
            // defensive wait...
            Pause.pause(500)
            dialog("New Project") {
                // select runtime and SDK
                jList("AWS Serverless Application").clickItem("AWS Serverless Application")
                combobox("Runtime:").selectItem("java8")
                combobox("Project SDK:").selectItem("1.8")
                button("Next").click()
                // select template
                jList("AWS SAM Hello World").clickItem("AWS SAM Hello World")
                button("Next").click()
                // project location
                button("Finish").click()
            }
            // wait for background tasks
            waitAMoment()
        }
    }
}