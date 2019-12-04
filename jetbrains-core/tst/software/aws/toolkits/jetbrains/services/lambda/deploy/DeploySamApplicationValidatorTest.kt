// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.ui.MutableCollectionComboBoxModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message

@RunsInEdt
class DeploySamApplicationValidatorTest {
    private val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    private lateinit var view: DeployServerlessApplicationPanel
    private lateinit var sut: DeploySamApplicationValidator

    @Before
    fun wireMocksTogetherWithValidOptions() {

        val parameters = listOf<Parameter>(
                TestParameter("param1", "value1"),
                TestParameter("param2", "value2")
        )

        view = runInEdtAndGet {
            DeployServerlessApplicationPanel(projectRule.project)
        }

        view.withTemplateParameters(parameters)

        view.updateStack.isSelected = true
        view.stacks.model = MutableCollectionComboBoxModel(listOf(Stack("stack123"))).also { it.selectedItem = Stack("stack123") }
        view.stacks.forceLoaded()

        view.s3Bucket.model = MutableCollectionComboBoxModel(listOf("bucket123")).also { it.selectedItem = "bucket123" }
        view.s3Bucket.forceLoaded()

        sut = DeploySamApplicationValidator(view)
    }

    @Test
    fun validInputsReturnsNull() {
        assertThat(sut.validateSettings()).isNull()
    }

    @Test
    fun validInputsWithNewStackReturnsNull() {
        view.createStack.isSelected = true
        view.newStackName.text = "createStack"
        assertThat(sut.validateSettings()).isNull()

        view.newStackName.text = "n"
        assertThat(sut.validateSettings()).isNull()

        view.newStackName.text = "n1"
        assertThat(sut.validateSettings()).isNull()
    }

    @Test
    fun stackMustBeSpecified() {
        view.stacks.selectedItem = null
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.stack.missing"))
    }

    @Test
    fun newStackNameMustBeSpecified() {
        view.createStack.isSelected = true
        view.newStackName.text = null
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.missing"))
    }

    @Test
    fun invalidStackName_TooLong() {
        view.createStack.isSelected = true
        view.newStackName.text = "x".repeat(DeploySamApplicationValidator.MAX_STACK_NAME_LENGTH + 1)
        assertThat(sut.validateSettings()?.message).contains(
                message("serverless.application.deploy.validation.new.stack.name.too.long", DeploySamApplicationValidator.MAX_STACK_NAME_LENGTH)
        )
    }

    @Test
    fun invalidStackName_Duplicate() {
        view.createStack.isSelected = true
        view.newStackName.text = "bar"
        view.stacks.model = MutableCollectionComboBoxModel(listOf(Stack("foo"), Stack("bar"), Stack("baz")))
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.duplicate"))
    }

    @Test
    fun invalidStackName_InvalidChars() {
        view.createStack.isSelected = true
        view.newStackName.text = "stack_1"
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))

        view.newStackName.text = "stack 1"
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))

        view.newStackName.text = "stack#1"
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))

        view.newStackName.text = "1stack"
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))

        view.newStackName.text = " stack"
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))

        view.newStackName.text = "stack!@#$%^&*()_+-="
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.new.stack.name.invalid"))
    }

    @Test
    fun templateParameterMissing_Single() {
        val parameters = listOf<Parameter>(
                TestParameter("param1", "value1"),
                TestParameter("param2", "")
        )
        view.withTemplateParameters(parameters)
        assertThat(sut.validateSettings()?.message).contains("Template values are missing:")
        assertThat(sut.validateSettings()?.message).contains("param2")
    }

    @Test
    fun templateParameterMissing_Multi() {
        val parameters = listOf<Parameter>(
                TestParameter("param1", ""),
                TestParameter("param2", "")
        )
        view.withTemplateParameters(parameters)
        assertThat(sut.validateSettings()?.message).contains("Template values are missing:")
        assertThat(sut.validateSettings()?.message).contains("param1")
        assertThat(sut.validateSettings()?.message).contains("param2")
    }

    @Test
    fun s3BucketMustBeSpecified() {
        view.s3Bucket.selectedItem = null
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.s3.bucket.empty"))
    }

    private class TestParameter(
        var name: String,
        var defaultValue: String
    ) : Parameter {
        override fun getScalarProperty(key: String): String {
            throw NotImplementedError()
        }

        override fun getOptionalScalarProperty(key: String): String? {
            throw NotImplementedError()
        }

        override fun setScalarProperty(key: String, value: String) {
            throw NotImplementedError()
        }

        var description: String? = null
        var constraintDescription: String? = null

        override val logicalName: String
            get() = name

        override fun defaultValue(): String? = defaultValue

        override fun description(): String? = description

        override fun constraintDescription(): String? = constraintDescription
    }
}
