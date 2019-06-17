// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass
import javax.swing.DefaultComboBoxModel

@RunsInEdt
class UploadToLambdaValidatorTest {
    private val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    private val sut = UploadToLambdaValidator()
    private lateinit var view: EditFunctionPanel

    @Before
    fun wireMocksTogetherWithValidOptions() {
        view = runInEdtAndGet {
            EditFunctionPanel(projectRule.project)
        }

        view.name.text = "name"
        view.description.text = "description"
        view.handler.text = "com.example.LambdaHandler::handleRequest"
        val role = IamRole("DummyArn")
        view.iamRole.model = DefaultComboBoxModel(arrayOf(role))
        view.iamRole.selectedItem = role
        view.runtime.model = DefaultComboBoxModel(Runtime.knownValues().toTypedArray())
        view.runtime.selectedItem = Runtime.JAVA8
        val bucket = "sourceBucket"
        view.sourceBucket.model = DefaultComboBoxModel(arrayOf(bucket))
        view.sourceBucket.selectedItem = bucket
        view.timeout.text = "30"
        view.memorySize.text = "512"

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
    fun validFunctionReturnsNull() {
        assertThat(sut.validateConfigurationSettings(view)).isNull()
    }

    @Test
    fun nameMustBeSpecified() {
        view.name.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Function Name must be specified")
    }

    @Test
    fun validFunctionNameLength() {
        view.name.text = "aStringThatIsGreaterThanSixtyFourCharactersInLengthAndIsThereforeInvalid"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("must not exceed 64 characters")
    }

    @Test
    fun validFunctionCanOnlyContainAlphanumerics() {
        view.name.text = "a string"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("alphanumerics")
    }

    @Test
    fun handlerCannotBeBlank() {
        view.handler.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Handler must be specified")
    }

    @Test
    fun runtimeMustBeSelected() {
        view.runtime.selectedItem = null
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Runtime must be specified")
    }

    @Test
    fun iamRoleMustBeSelected() {
        view.iamRole.selectedItem = null
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("IAM role must be specified")
    }

    @Test
    fun timeoutMustBeSpecified() {
        view.timeout.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Timeout must be between")
    }

    @Test
    fun timeoutMustBeNumeric() {
        view.timeout.text = "foo"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Timeout must be between")
    }

    @Test
    fun timeoutMustBeWithinLowerBound() {
        view.timeout.text = "0"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Timeout must be between")
    }

    @Test
    fun timeoutMustBeWithinUpperBound() {
        view.timeout.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Timeout must be between")
    }

    @Test
    fun memoryMustBeSpecified() {
        view.memorySize.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Memory must be between")
    }

    @Test
    fun memoryMustBeNumeric() {
        view.memorySize.text = "foo"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Memory must be between")
    }

    @Test
    fun memoryMustBeWithinLowerBound() {
        view.memorySize.text = "0"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Memory must be between")
    }

    @Test
    fun memoryMustBeAnIncrementOf64() {
        view.memorySize.text = "13"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Memory must be between")
    }

    @Test
    fun memoryMustBeWithinUpperBound() {
        view.memorySize.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("Memory must be between")
    }

    @Test
    fun sourceBucketMustBeSelectedToDeploy() {
        view.sourceBucket.selectedItem = null
        assertThat(sut.validateCodeSettings(projectRule.project, view)?.message).contains("Bucket must be specified")
    }

    @Test
    fun handlerMustBeInProjectToDeploy() {
        view.handler.text = "Foo"
        assertThat(sut.validateCodeSettings(projectRule.project, view)?.message).contains("Must be able to locate the handler")
    }

    @Test
    fun runtimeMustBeSupportedToDeploy() {
        view.runtime.selectedItem = Runtime.NODEJS4_3
        assertThat(sut.validateCodeSettings(projectRule.project, view)?.message).contains("Deploying using the runtime")
    }
}