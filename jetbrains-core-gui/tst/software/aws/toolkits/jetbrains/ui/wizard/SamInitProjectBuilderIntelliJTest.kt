// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.roots.ui.configuration.JdkComboBox
import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.combobox
import com.intellij.testGuiFramework.impl.findComponent
import com.intellij.testGuiFramework.impl.jList
import com.intellij.testGuiFramework.impl.waitAMoment
import com.intellij.testGuiFramework.util.scenarios.checkModule
import com.intellij.testGuiFramework.util.scenarios.openProjectStructureAndCheck
import com.intellij.testGuiFramework.util.scenarios.projectStructureDialogModel
import com.intellij.testGuiFramework.util.scenarios.projectStructureDialogScenarios
import com.intellij.ui.tabs.impl.TabLabel
import org.fest.swing.timing.Pause
import org.junit.Assert.assertTrue
import org.junit.Test

class SamInitProjectBuilderIntelliJTest : GuiTestCase() {
    @Test
    fun testNewFromTemplate_defaults() {
        welcomeFrame {
            createNewProject()
            // defensive wait...
            Pause.pause(500)
            dialog("New Project") {
                jList("AWS").clickItem("AWS")
                jList("AWS Serverless Application").clickItem("AWS Serverless Application")
                button("Next").click()
                button("Finish").click()
            }
            // wait for background tasks
            waitAMoment()
        }

        checkSdkVersion("1.8")
    }

    @Test
    fun testNewFromTemplate_java() {
        welcomeFrame {
            createNewProject()
            // defensive wait...
            Pause.pause(500)
            dialog("New Project") {
                jList("AWS").clickItem("AWS")
                jList("AWS Serverless Application").clickItem("AWS Serverless Application")
                button("Next").click()
                Pause.pause(1000)
                combobox("Runtime:").selectItem("java8")
                combobox("SAM Template:").selectItem("AWS SAM Hello World (Maven)")
                button("Finish").click()
            }
            // wait for background tasks
            waitAMoment()
        }

        checkSdkVersion("1.8")
    }

    @Test
    fun testNewFromTemplate_python() {
        welcomeFrame {
            createNewProject()
            // defensive wait...
            Pause.pause(500)
            dialog("New Project") {
                jList("AWS").clickItem("AWS")
                jList("AWS Serverless Application").clickItem("AWS Serverless Application")
                button("Next").click()
                Pause.pause(1000)
                combobox("Runtime:").selectItem("python3.6")
                button("Finish").click()
            }
            // wait for background tasks
            waitAMoment()
        }

        checkSdkVersion("Python")
    }

    fun GuiTestCase.checkSdkVersion(projectSdk: String) {
        projectStructureDialogScenarios.openProjectStructureAndCheck {
            // dialog fixture needs to be managed by the model or test will time out and fail
            projectStructureDialogModel.checkModule {
                val robot = robot()
                val dependenciesTab = robot.findComponent(target(), TabLabel::class.java) { it.accessibleContext.accessibleName == "Dependencies" }
                robot.click(dependenciesTab)
                val moduleSdkCombo = robot.findComponent(target(), JdkComboBox::class.java)
                // project sdk option is selected
                assertTrue(moduleSdkCombo.selectedItem is JdkComboBox.ProjectJdkComboBoxItem)

                jList("Project").clickItem("Project")
                val projectSdkCombo = robot.findComponent(target(), JdkComboBox::class.java)
                assertTrue(projectSdkCombo.selectedItem.sdkName?.contains(projectSdk) ?: false)
            }
        }
    }
}