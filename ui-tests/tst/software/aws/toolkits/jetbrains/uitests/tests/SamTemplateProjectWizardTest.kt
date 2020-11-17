// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.io.TempDir
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.editorTab
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.newProjectWizard
import software.aws.toolkits.jetbrains.uitests.fixtures.preferencesDialog
import software.aws.toolkits.jetbrains.uitests.fixtures.projectStructureDialog
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SamTemplateProjectWizardTest {
    @TempDir
    lateinit var tempDir: Path

    @BeforeAll
    fun setUpSamCli() {
        val samPath = System.getenv("SAM_CLI_EXEC")
        if (samPath.isNullOrEmpty()) {
            log.warn("No custom SAM set, skipping setup")
            return
        }

        uiTest {
            welcomeFrame {
                step("Open preferences page") {
                    openPreferences()

                    preferencesDialog {
                        // Search for AWS because sometimes it is off the screen
                        search("AWS")

                        selectPreferencePage("Tools", "AWS")

                        step("Set SAM CLI executable path to $samPath") {
                            textField("SAM CLI executable:").text = samPath
                        }

                        pressOk()
                    }

                    selectTab("Projects")
                }
            }
        }
    }

    @Test
    @CoreTest
    fun createSamApp() {
        uiTest {
            welcomeFrame {
                openNewProjectWizard()

                step("Run New Project Wizard") {
                    newProjectWizard {
                        selectProjectCategory("AWS")
                        selectProjectType("AWS Serverless Application")

                        pressNext()

                        setProjectLocation(tempDir.toAbsolutePath().toString())

                        // TODO: Runtime
                        // TODO: Sam Template

                        pressFinish()
                    }
                }
            }

            idea {
                waitForBackgroundTasks()

                step("Validate Readme is opened") {
                    editorTab("README.md")
                }

                step("Validate project structure") {
                    openProjectStructure()
                    projectStructureDialog {
                        val fixture = comboBox(byXpath("//div[@class='JdkComboBox']"))
                        // TODO set based on Runtime
                        assertThat(fixture.selectedText()).isEqualTo("11")
                    }
                }
            }
        }
    }
}
