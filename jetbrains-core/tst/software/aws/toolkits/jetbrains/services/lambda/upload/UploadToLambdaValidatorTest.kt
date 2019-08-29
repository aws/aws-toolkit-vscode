// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.ui.MutableCollectionComboBoxModel
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
        view.iamRole.model = MutableCollectionComboBoxModel(listOf(role)).also { it.selectedItem = role }
        view.iamRole.forceLoaded()
        view.runtime.model = DefaultComboBoxModel(Runtime.knownValues().toTypedArray())
        view.runtime.selectedItem = Runtime.JAVA8
        val bucket = "sourceBucket"
        view.sourceBucket.model = MutableCollectionComboBoxModel(listOf(bucket)).also { it.selectedItem = bucket }
        view.sourceBucket.forceLoaded()
        view.timeoutSlider.value = 30
        view.memorySlider.value = 512

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
        view.timeoutSlider.textField.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun timeoutMustBeNumeric() {
        view.timeoutSlider.textField.text = "foo"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun timeoutMustBeWithinLowerBound() {
        view.timeoutSlider.textField.text = "0"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun timeoutMustBeWithinUpperBound() {
        view.timeoutSlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun memoryMustBeSpecified() {
        view.memorySlider.textField.text = ""
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun memoryMustBeNumeric() {
        view.memorySlider.textField.text = "foo"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun memoryMustBeWithinLowerBound() {
        view.memorySlider.textField.text = "0"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun memoryMustBeAnIncrementOf64() {
        view.memorySlider.textField.text = "13"
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
    }

    @Test
    fun memoryMustBeWithinUpperBound() {
        view.memorySlider.textField.text = Integer.MAX_VALUE.toString()
        assertThat(sut.validateConfigurationSettings(view)?.message).contains("The specified value must be an integer and between")
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