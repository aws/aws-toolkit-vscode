// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.utils.waitToLoad

class LambdaConfigPanelTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    private lateinit var sut: LambdaConfigPanel
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

        runInEdtAndWait {
            sut = LambdaConfigPanel(project)
            sut.handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
            sut.runtime.selectedItem = Runtime.JAVA8
            sut.timeoutSlider.value = 30
            sut.memorySlider.value = 512
        }

        sut.iamRole.waitToLoad()

        runInEdtAndWait {
            sut.iamRole.selectedItem = IamRole(role.arn())
        }
    }

    @Test
    fun `valid config returns null`() {
        runInEdtAndWait {
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `handler cannot be blank`() {
        runInEdtAndWait {
            sut.handlerPanel.handler.text = ""
        }
        assertThat(sut.validatePanel()?.message).contains("Handler must be specified")
    }

    @Test
    fun `runtime must be selected`() {
        sut.runtime.selectedItem = null
        assertThat(sut.validatePanel()?.message).contains("Runtime must be specified")
    }

    @Test
    fun `iam role must be selected`() {
        sut.iamRole.selectedItem = null
        assertThat(sut.validatePanel()?.message).contains("IAM role must be specified")
    }

    @Test
    fun `timeout must be specified`() {
        sut.timeoutSlider.textField.text = ""
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be numeric`() {
        sut.timeoutSlider.textField.text = "foo"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be positive`() {
        sut.timeoutSlider.textField.text = "-1"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within lower bound`() {
        sut.timeoutSlider.textField.text = "0"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within upper bound`() {
        sut.timeoutSlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be specified`() {
        sut.memorySlider.textField.text = ""
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory mus be numeric`() {
        sut.memorySlider.textField.text = "foo"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be positive`() {
        sut.memorySlider.textField.text = "-1"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within lower bound`() {
        sut.memorySlider.textField.text = "0"
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within upper bound`() {
        sut.memorySlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel()?.message).contains("The specified value must be an integer and between")
    }
}
