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
import software.aws.toolkits.jetbrains.fixtures.ServerlessProjectOptions
import software.aws.toolkits.jetbrains.fixtures.checkLibraryPrefixPresent
import software.aws.toolkits.jetbrains.fixtures.checkProject
import software.aws.toolkits.jetbrains.fixtures.createServerlessProject
import software.aws.toolkits.jetbrains.fixtures.jbTab
import software.aws.toolkits.jetbrains.fixtures.sdkChooser
import java.io.Serializable

@RunWith(GuiTestSuiteParam::class)
class SamInitProjectBuilderIntelliJTest(private val testParameters: TestParameters) : GuiTestCase() {
    data class TestParameters(
        val runtime: String,
        val templateName: String,
        val sdk: String,
        val libraries: Set<String> = emptySet()
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
                testParameters.sdk
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
                                    sdkChooser().requireSelection("${testParameters.sdk}.*".toPattern())
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
        }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data() = listOf(
            TestParameters(
                runtime = "java8",
                templateName = "AWS SAM Hello World (Maven)",
                sdk = "1.8",
                libraries = setOf("Maven: com.amazonaws:aws-lambda-java-core:")
            ),
            TestParameters(
                runtime = "java8",
                templateName = "AWS SAM Hello World (Maven)",
                sdk = "1.8"
            ),
            TestParameters(
                runtime = "python3.6",
                templateName = "AWS SAM Hello World",
                sdk = "Python"
            )
        )
    }
}