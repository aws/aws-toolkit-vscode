// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.setExecutablePath
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UploadedCode
import software.aws.toolkits.jetbrains.utils.execution.steps.ConsoleMessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.value
import java.nio.file.Path

class PackageLambdaTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Before
    fun setUp() {
        ExecutableManager.getInstance().removeExecutable(SamExecutable())
    }

    @Test
    fun `error fails the step`() {
        setSamExecutable(SamCommonTestUtils.makeATestSam(message = "We broke it", exitCode = -1))

        val sut = PackageLambda(
            templatePath = tempFolder.newFile().toPath(),
            packagedTemplatePath = tempFolder.newFile().toPath(),
            logicalId = aString(),
            s3Bucket = aString(),
            envVars = emptyMap()
        )

        assertThatThrownBy {
            sut.run(Context(projectRule.project), ConsoleMessageEmitter("PackageLambdaTest"))
        }.hasMessageContaining("We broke it")
    }

    @Test
    fun `s3 bucket URI is parsed`() {
        testPackageStep(
            """
            Resources:
              Function:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: helloworld.App::handleRequest
                  CodeUri: s3://FooBucket/Foo/Key
                  Runtime: java8.al2
                  Timeout: 300
                  MemorySize: 128
            """.trimIndent()
        ) {
            assertThat(it.bucket).isEqualTo("FooBucket")
            assertThat(it.key).isEqualTo("Foo/Key")
            assertThat(it.version).isNull()
        }
    }

    @Test
    fun `s3 block is parsed`() {
        testPackageStep(
            """
            Resources:
              Function:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: helloworld.App::handleRequest
                  CodeUri: 
                    Bucket: FooBucket
                    Key: FooKey
                    Version: FooVersion
                  Runtime: java8.al2
                  Timeout: 300
                  MemorySize: 128
            """.trimIndent()
        ) {
            assertThat(it.bucket).isEqualTo("FooBucket")
            assertThat(it.key).isEqualTo("FooKey")
            assertThat(it.version).isEqualTo("FooVersion")
        }
    }

    @Test
    fun `wrong S3 scheme throws`() {
        assertThatThrownBy {
            testPackageStep(
                """
                Resources:
                  Function:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: helloworld.App::handleRequest
                      CodeUri:  file://FooBucket/Foo/Key
                      Runtime: java8.al2
                      Timeout: 300
                      MemorySize: 128
                """.trimIndent()
            )
        }.hasMessageContaining("does not start with s3://")
    }

    @Test
    fun `wrong S3 URI format throws`() {
        assertThatThrownBy {
            testPackageStep(
                """
                Resources:
                  Function:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: helloworld.App::handleRequest
                      CodeUri:  s3://FooBucket
                      Runtime: java8.al2
                      Timeout: 300
                      MemorySize: 128
                """.trimIndent()
            )
        }.hasMessageContaining("does not follow the format s3://<bucket>/<key>")
    }

    private fun testPackageStep(packagedTemplate: String, assertBlock: (UploadedCode) -> Unit = {}) {
        setSamExecutable(SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()))

        val templatePath = tempFolder.newFile().toPath()
        templatePath.writeText(packagedTemplate)

        val sut = PackageLambda(
            templatePath = tempFolder.newFile().toPath(),
            packagedTemplatePath = templatePath,
            logicalId = "Function",
            s3Bucket = aString(),
            envVars = emptyMap()
        )

        val context = Context(projectRule.project)
        sut.run(context, ConsoleMessageEmitter("PackageLambdaTest"))

        val uploadedCode = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)
        assertBlock(uploadedCode)
    }

    private fun setSamExecutable(path: Path) {
        ExecutableManager.getInstance().setExecutablePath<SamExecutable>(path).value
    }
}
