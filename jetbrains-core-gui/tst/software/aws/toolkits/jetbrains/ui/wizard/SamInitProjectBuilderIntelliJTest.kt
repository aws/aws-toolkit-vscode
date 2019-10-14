// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.testGuiFramework.framework.param.GuiTestSuiteParam
import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.impl.waitAMoment
import com.intellij.testGuiFramework.util.scenarios.checkModule
import com.intellij.testGuiFramework.util.scenarios.newProjectDialogModel
import com.intellij.testGuiFramework.util.scenarios.openProjectStructureAndCheck
import com.intellij.testGuiFramework.util.scenarios.projectStructureDialogModel
import com.intellij.testGuiFramework.util.scenarios.projectStructureDialogScenarios
import com.intellij.testGuiFramework.util.step
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.fixtures.ServerlessProjectOptions
import software.aws.toolkits.jetbrains.fixtures.checkLibraryPrefixPresent
import software.aws.toolkits.jetbrains.fixtures.checkProject
import software.aws.toolkits.jetbrains.fixtures.createServerlessProject
import software.aws.toolkits.jetbrains.fixtures.jbTab
import software.aws.toolkits.jetbrains.fixtures.sdkChooser
import java.io.Serializable
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@RunWith(GuiTestSuiteParam::class)
class SamInitProjectBuilderIntelliJTest(private val testParameters: TestParameters) : GuiTestCase() {
    data class TestParameters(
        val runtime: String,
        val templateName: String,
        val sdkRegex: Regex,
        val libraries: Set<String> = emptySet(),
        val runConfigNames: Set<String> = emptySet()
    ) : Serializable {
        override fun toString() = "$runtime - $templateName"
    }

    @Test
    fun testNewFromTemplate() {
        welcomeFrame {
            createNewProject()
            newProjectDialogModel.createServerlessProject(
                projectFolder,
                ServerlessProjectOptions(testParameters.runtime, testParameters.templateName),
                testParameters.sdkRegex
            )
        }

        waitAMoment()

        ideFrame {
            step("check the project structure is correct") {
                with(projectStructureDialogModel) {
                    projectStructureDialogScenarios.openProjectStructureAndCheck {
                        step("check the SDKs are correct") {
                            step("check the module SDK is inheriting project SDK") {
                                projectStructureDialogModel.checkModule {
                                    step("select the dependencies tab") {
                                        jbTab("Dependencies").selectTab()
                                        sdkChooser().requireSelection("Project SDK.*".toPattern())
                                    }
                                }
                            }

                            step("check the project SDK is correct") {
                                projectStructureDialogModel.checkProject {
                                    sdkChooser().requireSelection(testParameters.sdkRegex.toPattern())
                                }
                            }
                        }

                        if (testParameters.libraries.isNotEmpty()) {
                            step("check the libraries are correct") {
                                testParameters.libraries.forEach {
                                    step("looking for library '$it'") {
                                        checkLibraryPrefixPresent(it)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            step("check the run configuration is created") {
                retryableAssert {
                    assertTrue(runConfigurationList.getRunConfigurationList().containsAll(testParameters.runConfigNames))
                }
            }

            step("check the default README.md file is open in editor") {
                assertEquals("README.md", editor.currentFileName)
            }
        }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data() = listOf(
            TestParameters(
                runtime = "java8",
                templateName = "AWS SAM Hello World (Maven)",
                sdkRegex = """.*(1\.8|11).*""".toRegex(),
                libraries = setOf("Maven: com.amazonaws:aws-lambda-java-core:"),
                runConfigNames = setOf("[Local] HelloWorldFunction")
            ),
            TestParameters(
                runtime = "java8",
                templateName = "AWS SAM Hello World (Gradle)",
                sdkRegex = """.*(1\.8|11).*""".toRegex(),
                libraries = setOf("Gradle: com.amazonaws:aws-lambda-java-core:"),
                runConfigNames = setOf("[Local] HelloWorldFunction")
            ),
            TestParameters(
                runtime = "python3.6",
                templateName = "AWS SAM Hello World",
                sdkRegex = "Python.*".toRegex(),
                runConfigNames = setOf("[Local] HelloWorldFunction")
            ),
            TestParameters(
                runtime = "python3.6",
                templateName = "AWS SAM DynamoDB Event Example",
                sdkRegex = "Python.*".toRegex(),
                runConfigNames = setOf("[Local] ReadDynamoDBEvent")
            )
        )
    }
}
