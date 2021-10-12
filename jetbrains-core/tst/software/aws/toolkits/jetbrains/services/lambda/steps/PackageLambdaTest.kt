// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

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
import software.aws.toolkits.jetbrains.services.lambda.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
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
            envVars = emptyMap(),
            s3Bucket = aString()
        )

        assertThatThrownBy {
            sut.run(Context(), ConsoleMessageEmitter("PackageLambdaTest"))
        }.hasMessageContaining("We broke it")
    }

    @Test
    fun `s3 bucket URI is parsed`() {
        testPackageStep(
            packagedTemplate = """
                Resources:
                  Function:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: helloworld.App::handleRequest
                      CodeUri: s3://FooBucket/Foo/Key
                      Runtime: java8.al2
                      Timeout: 300
                      MemorySize: 128
            """.trimIndent(),
            s3Bucket = aString()
        ) {
            assertThat(it).isInstanceOfSatisfying(UploadedS3Code::class.java) { code ->
                assertThat(code.bucket).isEqualTo("FooBucket")
                assertThat(code.key).isEqualTo("Foo/Key")
                assertThat(code.version).isNull()
            }
        }
    }

    @Test
    fun `s3 block is parsed`() {
        testPackageStep(
            packagedTemplate = """
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
            """.trimIndent(),
            s3Bucket = aString()
        ) {
            assertThat(it).isInstanceOfSatisfying(UploadedS3Code::class.java) { code ->
                assertThat(code.bucket).isEqualTo("FooBucket")
                assertThat(code.key).isEqualTo("FooKey")
                assertThat(code.version).isEqualTo("FooVersion")
            }
        }
    }

    @Test
    fun `image uri block is parsed`() {
        testPackageStep(
            packagedTemplate = """
                Resources:
                  Function:
                    Type: AWS::Serverless::Function
                    Properties:
                      PackageType: Image
                      ImageUri: 111122223333.dkr.ecr.us-east-1.amazonaws.com/repo:tag
                      Timeout: 300
                      MemorySize: 128
            """.trimIndent(),
            ecrRepo = aString()
        ) {
            assertThat(it).isInstanceOfSatisfying(UploadedEcrCode::class.java) { code ->
                assertThat(code.imageUri).isEqualTo("111122223333.dkr.ecr.us-east-1.amazonaws.com/repo:tag")
            }
        }
    }

    private fun testPackageStep(packagedTemplate: String, s3Bucket: String? = null, ecrRepo: String? = null, assertBlock: (UploadedCode) -> Unit = {}) {
        setSamExecutable(SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()))

        val templatePath = tempFolder.newFile().toPath()
        templatePath.writeText(packagedTemplate)

        val sut = PackageLambda(
            templatePath = tempFolder.newFile().toPath(),
            packagedTemplatePath = templatePath,
            logicalId = "Function",
            envVars = emptyMap(),
            s3Bucket = s3Bucket,
            ecrRepo = ecrRepo
        )

        val context = Context()
        sut.run(context, ConsoleMessageEmitter("PackageLambdaTest"))

        val uploadedCode = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)
        assertBlock(uploadedCode)
    }

    private fun setSamExecutable(path: Path) {
        ExecutableManager.getInstance().setExecutablePath<SamExecutable>(path).value
    }
}
