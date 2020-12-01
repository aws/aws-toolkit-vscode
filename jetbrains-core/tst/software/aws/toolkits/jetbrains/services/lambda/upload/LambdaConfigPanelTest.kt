// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass
import software.aws.toolkits.jetbrains.utils.waitToLoad

class LambdaConfigPanelTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private val role = Role.builder()
        .arn(aString())
        .assumeRolePolicyDocument(LAMBDA_PRINCIPAL)
        .build()

    @Before
    fun wireMocksTogetherWithValidOptions() {
        val project = projectRule.project

        resourceCache.addEntry(
            project,
            IamResources.LIST_RAW_ROLES,
            listOf(role)
        )

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = sdk
            }
        }

        projectRule.fixture.openClass(
            """
            package com.example;
            public class LambdaHandler {
                public static void handleRequest(InputStream input, OutputStream output) { }
            }
            """
        )
    }

    @Test
    fun `valid zip config returns null when create`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageZip.isSelected = true
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `valid zip config returns null when update`() {
        val sut = createConfigPanel(isUpdate = true)
        runInEdtAndWait {
            sut.packageZip.isSelected = true
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `valid image config returns null whe create`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `valid image config returns null whe update`() {
        val sut = createConfigPanel(isUpdate = true)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `handler cannot be blank`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.handlerPanel.handler.text = ""
        }
        assertThat(sut.validatePanel()?.message).contains("Handler must be specified")
    }

    @Test
    fun `handler must exist to build when create`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.handlerPanel.handler.text = "Foo"
        }
        assertThat(sut.validatePanel()?.message).contains("Must be able to locate the handler")
    }

    @Test
    fun `handler may not exist when update`() {
        val sut = createConfigPanel(isUpdate = true)
        runInEdtAndWait {
            sut.handlerPanel.handler.text = "Foo"
        }
        assertThat(sut.validatePanel()).isNull()
    }

    @Test
    fun `runtime must be selected`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.runtime.selectedItem = null
        assertThat(sut.validatePanel()?.message).contains("Runtime must be specified")
    }

    @Test
    fun `iam role must be selected`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.iamRole.selectedItem = null
        assertThat(sut.validatePanel()?.message).contains("IAM role must be specified")
    }

    @Test
    fun `timeout must be specified`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.timeoutSlider.textField.text = ""
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be numeric`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.timeoutSlider.textField.text = "foo"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be positive`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.timeoutSlider.textField.text = "-1"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within lower bound`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.timeoutSlider.textField.text = "0"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within upper bound`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.timeoutSlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be specified`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.memorySlider.textField.text = ""
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory mus be numeric`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.memorySlider.textField.text = "foo"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be positive`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.memorySlider.textField.text = "-1"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within lower bound`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.memorySlider.textField.text = "0"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within upper bound`() {
        val sut = createConfigPanel(isUpdate = false)
        sut.memorySlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `dockerfile must be a found if in image mode and not an update`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            sut.dockerFile.text = ""
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    @Test
    fun `dockerfile must exist if in image mode and not an update`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            sut.dockerFile.text = "iDontExist"
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    @Test
    fun `dockerfile must be a file if in image mode and not an update`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            sut.dockerFile.text = temporaryFolder.newFolder().absolutePath
            assertThat(sut.validatePanel()?.message).contains("Dockerfile not found")
        }
    }

    @Test
    fun `dockerfile is not validated when an update`() {
        val sut = createConfigPanel(isUpdate = true)
        runInEdtAndWait {
            sut.packageImage.isSelected = true
            sut.dockerFile.text = "iDonExist"
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `correct elements are showing when image is selected when not in update mode`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageImage.isSelected = true

            assertThat(sut.packageType()).isEqualTo(PackageType.IMAGE)
            assertThat(sut.packageZip.isSelected).isFalse()
            assertThat(sut.handlerLabel.isVisible).isFalse()
            assertThat(sut.handlerPanel.isVisible).isFalse()
            assertThat(sut.runtimeLabel.isVisible).isFalse()
            assertThat(sut.runtime.isVisible).isFalse()

            assertThat(sut.dockerFileLabel.isVisible).isTrue()
            assertThat(sut.dockerFile.isVisible).isTrue()
        }
    }

    @Test
    fun `correct elements are showing when image is selected when in update mode`() {
        val sut = createConfigPanel(isUpdate = true)
        runInEdtAndWait {
            sut.packageImage.isSelected = true

            assertThat(sut.packageType()).isEqualTo(PackageType.IMAGE)
            assertThat(sut.packageZip.isSelected).isFalse()
            assertThat(sut.handlerLabel.isVisible).isFalse()
            assertThat(sut.handlerPanel.isVisible).isFalse()
            assertThat(sut.runtimeLabel.isVisible).isFalse()
            assertThat(sut.runtime.isVisible).isFalse()

            assertThat(sut.dockerFileLabel.isVisible).isFalse()
            assertThat(sut.dockerFile.isVisible).isFalse()
        }
    }

    @Test
    fun `correct elements are showing when zip is selected`() {
        val sut = createConfigPanel(isUpdate = false)
        runInEdtAndWait {
            sut.packageZip.isSelected = true

            assertThat(sut.packageType()).isEqualTo(PackageType.ZIP)
            assertThat(sut.packageZip.isSelected).isTrue()
            assertThat(sut.handlerLabel.isVisible).isTrue()
            assertThat(sut.handlerPanel.isVisible).isTrue()
            assertThat(sut.runtimeLabel.isVisible).isTrue()
            assertThat(sut.runtime.isVisible).isTrue()

            assertThat(sut.dockerFileLabel.isVisible).isFalse()
            assertThat(sut.dockerFile.isVisible).isFalse()
        }
    }

    private fun createConfigPanel(isUpdate: Boolean): LambdaConfigPanel {
        val sut = runInEdtAndGet {
            LambdaConfigPanel(projectRule.project, isUpdate = isUpdate).also {
                it.dockerFile.text = temporaryFolder.newFile().absolutePath
                it.handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
                it.runtime.selectedItem = Runtime.JAVA8
                it.timeoutSlider.value = 30
                it.memorySlider.value = 512
            }
        }

        sut.iamRole.waitToLoad()

        runInEdtAndWait {
            sut.iamRole.selectedItem = IamRole(role.arn())
        }

        return sut
    }
}
