// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam.sync

import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.validation.DialogValidation
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.TemporaryDirectory
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.io.write
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.yaml.psi.YAMLSequence
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.amazon.awssdk.services.ecr.EcrClient
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.lambda.sam.ValidateSamParameters
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.nio.file.Files

@RunsInEdt
class SyncSamApplicationValidatorTest {
    private val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    @Rule
    @JvmField
    val tempDir = TemporaryDirectory()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private lateinit var sut: SyncServerlessApplicationDialog
    private lateinit var sutPanel: DialogPanel

    private val parameters = listOf<Parameter>(
        TestParameter(logicalName = "param1", type = "String", defaultValue = "value1"),
        TestParameter(logicalName = "param2", type = "String", defaultValue = "value2")
    )

    @Before
    fun wireMocksTogetherWithValidOptions() {
        mockClientManagerRule.apply {
            create<CloudFormationClient>()
            create<S3Client>()
            create<EcrClient>()
        }

        val dir = Files.createDirectory(tempDir.newPath()).toAbsolutePath()
        runInEdtAndWait {
            val template = VfsUtil.findFileByIoFile(dir.resolve("path.yaml").write("".toByteArray()).toFile(), true)

            if (template != null) {
                sut = SyncServerlessApplicationDialog(
                    projectRule.project,
                    template,
                    emptyList<StackSummary>(),
                    loadResourcesOnCreate = false
                )
            }

            sutPanel = sut.getParameterDialog()
        }

        val repo = Repository("repoName", "arn", "repositoryuri")
        sut.forceUi(
            sutPanel,
            isCreateStack = false,
            hasImageFunctions = false,
            stacks = listOf(StackSummary.builder().stackName("stack123").build()),
            buckets = listOf("bucket123"),
            ecrRepos = listOf(repo),
            stackName = "stack123",
            bucket = "bucket123",
            ecrRepo = repo.repositoryName,
            useContainer = true
        )
        sut.populateParameters(parameters, parameters)
    }

    @Test
    fun `Valid inputs returns null`() {
        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `valid inputs no repo returns null`() {
        sut.forceUi(sutPanel, forceEcrRepo = true, ecrRepo = null)
        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `valid inputs with new stack returns null`() {
        sut.forceUi(sutPanel, isCreateStack = true, stackName = "createStack")
        assertThat(validateAll()).isEmpty()

        sut.forceUi(sutPanel, stackName = "n")
        assertThat(validateAll()).isEmpty()

        sut.forceUi(sutPanel, stackName = "n1")
        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `valid inputs with image returns null`() {
        sut.forceUi(sutPanel, hasImageFunctions = true)
        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `stack must be selected`() {
        sut.forceUi(sutPanel, isCreateStack = false, forceStackName = true, stackName = null)
        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains(message("serverless.application.sync.validation.stack.missing")) == true }
    }

    @Test
    fun `new stack name must be specified`() {
        sut.forceUi(sutPanel, isCreateStack = true, forceStackName = true, stackName = null)
        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains(message("serverless.application.sync.validation.new.stack.name.missing")) == true }
    }

    @Test
    fun `invalid stack name too long`() {
        val maxLength = ValidateSamParameters.MAX_STACK_NAME_LENGTH
        sut.forceUi(sutPanel, isCreateStack = true, stackName = "x".repeat(maxLength + 1))

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains(message("serverless.application.deploy.validation.new.stack.name.too.long", maxLength)) == true }
    }

    @Test
    fun `invalid stack name duplicate`() {
        sut.forceUi(
            sutPanel,
            isCreateStack = true,
            stackName = "bar",
            stacks = listOf(
                StackSummary.builder().stackName("foo").build(),
                StackSummary.builder().stackName("bar").build(),
                StackSummary.builder().stackName("baz").build()
            )
        )

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains(message("serverless.application.deploy.validation.new.stack.name.duplicate")) == true }
    }

    @Test
    fun `invalid stack name invalid chars`() {
        val invalid = listOf(
            "stack_1",
            "stack#1",
            "1stack",
            " stack",
            "stack!@#$%^&*()_+-="
        )
        invalid.forEach { stackName ->
            sut.forceUi(sutPanel, isCreateStack = true, stackName = stackName)
            assertThat(validateAll())
                .singleElement()
                .matches({
                    it.validate()?.message?.contains(message("serverless.application.deploy.validation.new.stack.name.invalid")) == true
                }, "for input $stackName")
        }
    }

    @Test
    fun `template parameter all types valid has values`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `template parameter all types valid no values`() {
        val parameters = listOf<Parameter>(
            TestParameter(logicalName = "param1", type = "String", defaultValue = ""),
            TestParameter(logicalName = "param4", type = "List<Number>", defaultValue = ""),
            TestParameter(logicalName = "param5", type = "CommaDelimitedList", defaultValue = ""),
            TestParameter(logicalName = "param6", type = "AWS::EC2::AvailabilityZone::Name", defaultValue = ""),
            TestParameter(logicalName = "param7", type = "List<AWS::EC2::AvailabilityZone::Name>", defaultValue = ""),
            TestParameter(logicalName = "param8", type = "AWS::SSM::Parameter::Value<String>", defaultValue = ""),
        )
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `template parameterstring regex`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `template parameterstring too short`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("tooShort does not meet MinLength") == true }
    }

    @Test
    fun `template parameter string too long`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("tooLong exceeds MaxLength") == true }
    }

    @Test
    fun `template parameter string fails regex`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("regexFail does not match AllowedPattern") == true }
    }

    @Test
    fun `template parameter string constraints invalid`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("AllowedPattern for badRegex is not valid") == true }
    }

    @Test
    fun `template parameter number invalid`() {
        val parameters = listOf<Parameter>(
            TestParameter(logicalName = "notANumber", type = "Number", defaultValue = "f"),
            TestParameter(logicalName = "notANumber2", type = "Number", defaultValue = "")
        )
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("not a number") == true }
    }

    @Test
    fun `template parameter number too small`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("tooSmall is smaller than MinValue") == true }
    }

    @Test
    fun `template parameter number too big`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains("tooBig is larger than MaxValue") == true }
    }

    @Test
    fun `template parameter number constraints invalid`() {
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
        sut.populateParameters(parameters, parameters)

        assertThat(validateAll()).isEmpty()
    }

    @Test
    fun `s3 bucket must be specified`() {
        sut.forceUi(sutPanel, forceBucket = true, bucket = null)

        assertThat(validateAll()).singleElement()
            .matches { it.validate()?.message?.contains(message("serverless.application.sync.validation.s3.bucket.empty")) == true }
    }

    private fun validateAll(): List<DialogValidation> =
        sutPanel.validationsOnApply.flatMap { it.value }.filter { it.validate() != null }

    private class TestParameter(
        override val logicalName: String,
        private val type: String,
        private val defaultValue: String?,
        private val additionalProperties: Map<String, String> = emptyMap()
    ) : Parameter {
        override fun getScalarProperty(key: String): String = getOptionalScalarProperty(key) ?: throw Exception("Cannot be null")

        override fun getOptionalScalarProperty(key: String): String? {
            if (key == "Type") {
                return type
            }
            return additionalProperties[key]
        }

        override fun setScalarProperty(key: String, value: String) {
            throw NotImplementedError()
        }

        override fun getSequenceProperty(key: String): YAMLSequence {
            throw NotImplementedError()
        }

        override fun getOptionalSequenceProperty(key: String): YAMLSequence? {
            throw NotImplementedError()
        }

        override fun defaultValue(): String? = defaultValue

        override fun description(): String? = null

        override fun constraintDescription(): String? = null
    }
}
