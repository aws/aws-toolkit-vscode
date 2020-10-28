// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
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

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = sdk
            }

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
    fun `valid config returns null`() {
        runInEdtAndWait {
            assertThat(sut.validatePanel(handlerMustExist = false)).isNull()
            assertThat(sut.validatePanel(handlerMustExist = true)).isNull()
        }
    }

    @Test
    fun `handler cannot be blank`() {
        runInEdtAndWait {
            sut.handlerPanel.handler.text = ""
        }
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("Handler must be specified")
    }

    @Test
    fun `handler must exist to build`() {
        runInEdtAndWait {
            sut.handlerPanel.handler.text = "Foo"
        }
        assertThat(sut.validatePanel(handlerMustExist = true)?.message).contains("Must be able to locate the handler")
    }

    @Test
    fun `runtime must be selected`() {
        sut.runtime.selectedItem = null
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("Runtime must be specified")
    }

    @Test
    fun `iam role must be selected`() {
        sut.iamRole.selectedItem = null
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("IAM role must be specified")
    }

    @Test
    fun `timeout must be specified`() {
        sut.timeoutSlider.textField.text = ""
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be numeric`() {
        sut.timeoutSlider.textField.text = "foo"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be positive`() {
        sut.timeoutSlider.textField.text = "-1"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within lower bound`() {
        sut.timeoutSlider.textField.text = "0"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `timeout must be within upper bound`() {
        sut.timeoutSlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be specified`() {
        sut.memorySlider.textField.text = ""
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory mus be numeric`() {
        sut.memorySlider.textField.text = "foo"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be positive`() {
        sut.memorySlider.textField.text = "-1"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within lower bound`() {
        sut.memorySlider.textField.text = "0"
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun `memory must be within upper bound`() {
        sut.memorySlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validatePanel(handlerMustExist = false)?.message).contains("The specified value must be an integer and between")
    }
}
