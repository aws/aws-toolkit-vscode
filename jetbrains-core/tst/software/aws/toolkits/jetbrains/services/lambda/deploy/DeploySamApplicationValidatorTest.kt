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
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
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

    private val parameters = listOf<Parameter>(
        TestParameter(logicalName = "param1", type = "String", defaultValue = "value1"),
        TestParameter(logicalName = "param2", type = "String", defaultValue = "value2")
    )

    @Before
    fun wireMocksTogetherWithValidOptions() {
        view = runInEdtAndGet {
            DeployServerlessApplicationPanel(projectRule.project)
        }

        view.withTemplateParameters(parameters)

        view.updateStack.isSelected = true
        view.stacks.model = MutableCollectionComboBoxModel(listOf(Stack("stack123"))).also { it.selectedItem = Stack("stack123") }
        view.stacks.forceLoaded()

        view.s3Bucket.model = MutableCollectionComboBoxModel(listOf("bucket123")).also { it.selectedItem = "bucket123" }
        view.s3Bucket.forceLoaded()

        val repo = Repository("repoName", "arn", "repositoryuri")
        view.ecrRepo.model = MutableCollectionComboBoxModel(listOf(repo)).also { it.selectedItem = repo }
        view.ecrRepo.forceLoaded()

        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
    }

    @Test
    fun validInputsReturnsNull() {
        assertThat(sut.validateSettings()).isNull()
    }

    @Test
    fun validInputsNoRepoReturnsNull() {
        view.ecrRepo.selectedItem = null
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
    fun validInputsWithImageReturnsNull() {
        sut = DeploySamApplicationValidator(view, hasImageFunctions = true, templateParameters = parameters)
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
    fun templateParameterAllTypesValid_hasValues() {
        val parameters = listOf<Parameter>(
            TestParameter(logicalName = "param1", type = "String", defaultValue = "value1"),
            TestParameter(logicalName = "param2", type = "Number", defaultValue = "1"),
            TestParameter(logicalName = "param3", type = "Number", defaultValue = "1.2"),
            TestParameter(logicalName = "param4", type = "List<Number>", defaultValue = "10,20,1.2"),
            TestParameter(logicalName = "param5", type = "CommaDelimitedList", defaultValue = "param1,param2"),
            TestParameter(logicalName = "param6", type = "AWS::EC2::AvailabilityZone::Name", defaultValue = "us-fake-1"),
            TestParameter(logicalName = "param7", type = "List<AWS::EC2::AvailabilityZone::Name>", defaultValue = "us-fake-1a,us-fake-1b"),
            TestParameter(logicalName = "param8", type = "AWS::SSM::Parameter::Value<String>", defaultValue = "something"),

        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()).isNull()
    }

    @Test
    fun templateParameterAllTypesValid_noValues() {
        val parameters = listOf<Parameter>(
            TestParameter(logicalName = "param1", type = "String", defaultValue = ""),
            TestParameter(logicalName = "param4", type = "List<Number>", defaultValue = ""),
            TestParameter(logicalName = "param5", type = "CommaDelimitedList", defaultValue = ""),
            TestParameter(logicalName = "param6", type = "AWS::EC2::AvailabilityZone::Name", defaultValue = ""),
            TestParameter(logicalName = "param7", type = "List<AWS::EC2::AvailabilityZone::Name>", defaultValue = ""),
            TestParameter(logicalName = "param8", type = "AWS::SSM::Parameter::Value<String>", defaultValue = ""),
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()).isNull()
    }

    @Test
    fun templateParameter_stringRegex() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "goodRegex",
                type = "String",
                defaultValue = "example@example.com",
                additionalProperties = mapOf(
                    "AllowedPattern" to "^[_A-Za-z0-9-\\+]+(\\.[_A-Za-z0-9-]+)*@[A-Za-z0-9-]+(\\.[A-Za-z0-9]+)*(\\.[A-Za-z]{2,})$"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).isNull()
    }

    @Test
    fun templateParameter_stringTooShort() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "tooShort",
                type = "String",
                defaultValue = "",
                additionalProperties = mapOf(
                    "MinLength" to "1",
                    "MaxLength" to "5"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("tooShort does not meet MinLength")
    }

    @Test
    fun templateParameter_stringTooLong() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "tooLong",
                type = "String",
                defaultValue = "aaaaaaaaaa",
                additionalProperties = mapOf(
                    "MinLength" to "1",
                    "MaxLength" to "5"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("tooLong exceeds MaxLength")
    }

    @Test
    fun templateParameter_stringFailsRegex() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "regexFail",
                type = "String",
                defaultValue = "aaaaaaaaaa",
                additionalProperties = mapOf(
                    "AllowedPattern" to "b*"

                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("regexFail does not match AllowedPattern")
    }

    @Test
    fun templateParameter_stringConstraintsInvalid() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "badRegex",
                type = "String",
                defaultValue = "",
                additionalProperties = mapOf(
                    "AllowedPattern" to ")]]]]]totallyValidRegex([[[["
                )
            ),
            TestParameter(
                logicalName = "badLengthConstraints",
                type = "String",
                defaultValue = "",
                additionalProperties = mapOf(
                    "MinLength" to "-42",
                    "MaxLength" to "3.14"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("AllowedPattern for badRegex is not valid")
    }

    @Test
    fun templateParameter_numberInvalid() {
        val parameters = listOf<Parameter>(
            TestParameter(logicalName = "notANumber", type = "Number", defaultValue = "f"),
            TestParameter(logicalName = "notANumber2", type = "Number", defaultValue = "")
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("not a number")
    }

    @Test
    fun templateParameter_numberTooSmall() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "tooSmall",
                type = "Number",
                defaultValue = "0",
                additionalProperties = mapOf(
                    "MinValue" to "0.1",
                    "MaxValue" to "5"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("tooSmall is smaller than MinValue")
    }

    @Test
    fun templateParameter_numberTooBig() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "tooBig",
                type = "Number",
                defaultValue = "${Float.MAX_VALUE}",
                additionalProperties = mapOf(
                    "MinValue" to "0.1",
                    "MaxValue" to "5"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).contains("tooBig is larger than MaxValue")
    }

    @Test
    fun templateParameter_numberConstraintsInvalid() {
        val parameters = listOf<Parameter>(
            TestParameter(
                logicalName = "badValueConstraints",
                type = "Number",
                defaultValue = "0",
                additionalProperties = mapOf(
                    "MinValue" to "--3",
                    "MaxValue" to "++3"
                )
            )
        )
        sut = DeploySamApplicationValidator(view, hasImageFunctions = false, templateParameters = parameters)
        view.withTemplateParameters(parameters)

        assertThat(sut.validateSettings()?.message).isNull()
    }

    @Test
    fun s3BucketMustBeSpecified() {
        view.s3Bucket.selectedItem = null
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.s3.bucket.empty"))
    }

    @Test
    fun ecrReoMustBeSpecifiedWithImages() {
        sut = DeploySamApplicationValidator(view, hasImageFunctions = true, templateParameters = parameters)
        view.ecrRepo.selectedItem = null
        assertThat(sut.validateSettings()?.message).contains(message("serverless.application.deploy.validation.ecr.repo.empty"))
    }

    private class TestParameter(
        override val logicalName: String,
        private val type: String,
        private val defaultValue: String?,
        private val additionalProperties: Map<String, String> = emptyMap()
    ) : Parameter {
        override fun getScalarProperty(key: String): String = getOptionalScalarProperty(key)!!

        override fun getOptionalScalarProperty(key: String): String? {
            if (key == "Type") {
                return type
            }
            return additionalProperties.get(key)
        }

        override fun setScalarProperty(key: String, value: String) {
            throw NotImplementedError()
        }

        override fun defaultValue(): String? = defaultValue

        override fun description(): String? = null

        override fun constraintDescription(): String? = null
    }
}
