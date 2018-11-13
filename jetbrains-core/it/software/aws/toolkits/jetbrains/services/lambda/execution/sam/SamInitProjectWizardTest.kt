// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.ide.projectWizard.ChooseTemplateStep
import com.intellij.ide.projectWizard.NewProjectWizardTestCase
import com.intellij.ide.projectWizard.ProjectSettingsStep
import com.intellij.ide.projectWizard.ProjectTypeStep
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.projectRoots.SdkType
import com.intellij.testFramework.IdeaTestUtil
import com.jetbrains.python.sdk.PythonSdkType
import org.assertj.core.api.Assertions.assertThatExceptionOfType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.ui.wizard.java.SamInitModuleBuilder
import software.aws.toolkits.jetbrains.ui.wizard.java.SamInitTemplateSelectionStep
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk3x
import kotlin.reflect.KClass

// JUnit3-style to take advantage of IDEA's test base
class SamInitProjectWizardTest : NewProjectWizardTestCase() {
    override fun setUp() {
        super.setUp()
        // Since we're setting up real modules, throw away real SDKs...
        for (sdk in ProjectJdkTable.getInstance().allJdks) {
            ApplicationManager.getApplication().runWriteAction {
                ProjectJdkTable.getInstance().removeJdk(sdk)
            }
        }
        // and replace with fake ones
        addSdk(IdeaTestUtil.getMockJdk18())
        addSdk((PyTestSdk3x()))
    }

    fun testExceptionIfSamNotConfigured() {
        assertThatExceptionOfType(RuntimeException::class.java).isThrownBy {
            createProject { step ->
                if (step is ProjectTypeStep) {
                    assertTrue(step.setSelectedTemplate("SAM", null))
                    val builder = myWizard.projectBuilder as SamInitModuleBuilder
                    builder.runtimeSelectionPanel.samExecutableField.text = ""
                }
            }
        }.satisfies {
            it.localizedMessage == "SAM CLI executable not configured" ||
            it.localizedMessage == "com.intellij.ide.projectWizard.ProjectTypeStep is not validated"
        }
    }

    fun testPython36Runtime() {
        helloWorldTest(Runtime.PYTHON3_6, PythonSdkType::class)
    }

    fun testPython27Runtime() {
        helloWorldTest(Runtime.PYTHON2_7, PythonSdkType::class)
    }

    fun testJavaRuntime() {
        helloWorldTest(Runtime.JAVA8, JavaSdk::class)
    }

    private fun helloWorldTest(runtime: Runtime, sdkType: KClass<out SdkType>) {
        SamSettings.getInstance().savedExecutablePath = "sam"

        createProject { step ->
            val stepNum = myWizard.currentStep
            when (step) {
                is ProjectTypeStep -> { // Wizard first page
                    assertEquals(0, stepNum)
                    assertTrue(step.setSelectedTemplate("SAM", null))
                    // step count changes after we select SAM
                    assertEquals("Found steps: ${myWizard.sequence.selectedSteps}.", 4, myWizard.sequence.selectedSteps.size)

                    // builder is not of type until we select SAM
                    val builder = myWizard.projectBuilder as SamInitModuleBuilder
                    // ensure we have set the executable path
                    assertNotNull(builder.runtimeSelectionPanel.samExecutableField.text)
                    // select python
                    builder.runtimeSelectionPanel.runtime.selectedItem = runtime
                }
                is ChooseTemplateStep -> { // Invisible to user, but forced step
                    assertEquals(1, stepNum)
                }
                is SamInitTemplateSelectionStep -> { // Custom template selection step
                    assertEquals(2, stepNum)

                    val builder = myWizard.projectBuilder as SamInitModuleBuilder
                    assertEquals(runtime, builder.runtimeSelectionPanel.runtime.selectedItem)
                    assertInstanceOf(builder.getSdkType(), sdkType.java)
                    assertEquals("AWS SAM Hello World", step.templateSelectionPanel.selectedTemplate!!.name)
                }
                is ProjectSettingsStep -> {
                    assertEquals(3, stepNum)
                }
                else -> {
                    fail("Unknown step!")
                }
            }
        }
    }
}