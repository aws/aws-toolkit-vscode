// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.yaml

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.ex.FakeFileType
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.jetbrains.annotations.NotNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.LambdaFunction
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.io.File
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class YamlCloudFormationTemplateTest {
    @Rule
    @JvmField
    val projectRule = CodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Test
    fun canListResources() {
        val template = yamlTemplate()
        runInEdtAndWait {
            assertThat(template.resources().toList()).hasSize(2)
        }
    }

    @Test
    fun canListResourcesWithGlobals() {
        val template = yamlTemplate(template = TEST_TEMPLATE_WITH_GLOBALS)
        runInEdtAndWait {
            assertThat(template.resources().toList()).hasSize(3)
        }
    }

    @Test
    fun noResourcesReturnsEmpty() {
        val template = yamlTemplate("""
Description: "Some description"
        """.trimIndent())
        runInEdtAndWait {
            assertThat(template.resources().toList()).isEmpty()
        }
    }

    @Test
    fun emptyResourcesReturnsEmpty() {
        val template = yamlTemplate("""
Description: "Some description"
Resources:


        """.trimIndent())
        runInEdtAndWait {
            assertThat(template.resources().toList()).isEmpty()
        }
    }

    @Test
    fun partialResourceIsIgnored() {
        val template = yamlTemplate("""
Description: "Some description"
Resources:
    Foo:
        """.trimIndent())
        runInEdtAndWait {
            assertThat(template.resources().toList()).isEmpty()
        }
    }

    @Test
    fun canListParameters() {
        val template = yamlTemplate()
        runInEdtAndWait {
            assertThat(template.parameters().toList()).hasSize(2)
        }
    }

    @Test
    fun noParametersReturnsEmpty() {
        val template = yamlTemplate("""
Description: "Some description"
        """.trimIndent())
        runInEdtAndWait {
            assertThat(template.parameters().toList()).isEmpty()
        }
    }

    @Test
    fun emptyParametersReturnsEmpty() {
        val template = yamlTemplate("""
Description: "Some description"
Parameters:


        """.trimIndent())
        runInEdtAndWait {
            assertThat(template.parameters().toList()).isEmpty()
        }
    }

    @Test
    fun nullProperties() {
        val template = yamlTemplate()
        runInEdtAndWait {
            assertThat(template.parameters().toList()).hasSize(2)
            val tableTag = template.parameters().firstOrNull { it.logicalName == "TableTag" }
            assertNotNull(tableTag)
            assertNull(tableTag.defaultValue())
            assertNotNull(tableTag.description())
            assertNull(tableTag.constraintDescription())
        }
    }

    @Test
    fun canUpdateAScalarValue() {
        val updatedTemplate = runInEdtAndGet {
            val template = yamlTemplate()
            val resource = template.getResourceByName("MyFunction")
            resource!!.setScalarProperty("CodeUri", "new/uri.jar")
            template.text()
        }

        assertThat(updatedTemplate).isEqualTo(
            """
Description: "Some description"
Parameters:
    TableName:
        Default: someTable
        Description: Storage for your data
        ConstraintDescription: No emojis
    TableTag:
        Description: Tag to add to the DynamoDb table
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: new/uri.jar
    MyDynamoTable:
        Type: AWS::DynamoDB::Table
        Properties:
            AttributeDefinitions:
                - AttributeName: "ArtistId"
                  AttributeType: "S"
                - AttributeName: "Concert"
                  AttributeType: "S"
            KeySchema:
                - AttributeName: "ArtistId"
                  KeyType: "HASH"
                - AttributeName: "Concert"
                  KeyType: "RANGE"
            ProvisionedThroughput:
                ReadCapacityUnits: 1
                WriteCapacityUnits: 1
                """.trimIndent()
        )
    }

    @Test
    fun canUpdateAScalarValueWithGlobals() {
        val updatedTemplate = runInEdtAndGet {
            val template = yamlTemplate(template = TEST_TEMPLATE_WITH_GLOBALS)
            val resource = template.getResourceByName("MyFunction")
            resource!!.setScalarProperty("CodeUri", "new/uri.jar")
            template.text()
        }

        assertThat(updatedTemplate).isEqualTo(
            """
Description: "Some description"
Globals:
    Function:
        Runtime: java8
        CodeUri: target/out.jar
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java12
            CodeUri: new/uri.jar
    FooFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
    LambdaFunction:
        Type: AWS::Lambda::Function
        Properties:
            Handler: helloworld.App::handleRequest
                """.trimIndent()
        )
    }

    @Test
    fun canSaveToFile() {
        val template = yamlTemplate()
        val tempFile = File.createTempFile("tempTemplate", ".yaml")

        runInEdtAndWait {
            template.saveTo(tempFile)
        }

        assertThat(tempFile).hasContent(TEST_TEMPLATE)
    }

    @Test
    fun canParseByExtension() {
        val fakeFileType = object : FakeFileType() {
            override fun isMyFileType(@NotNull file: VirtualFile): Boolean = true

            @NotNull
            override fun getName(): String = "foo"

            @NotNull
            override fun getDescription(): String = ""
        }

        runInEdtAndWait {
            val matchYaml = FileTypeManager.parseFromString("*.canParseByExtension.yaml")
            val matchYml = FileTypeManager.parseFromString("*.canParseByExtension.yml")

            runWriteAction {
                FileTypeManagerEx.getInstance().associate(fakeFileType, matchYaml)
                FileTypeManagerEx.getInstance().associate(fakeFileType, matchYml)
            }

            Disposer.register(projectRule.fixture.testRootDisposable, Disposable {
                runWriteAction {
                    FileTypeManagerEx.getInstance().removeAssociation(fakeFileType, matchYml)
                    FileTypeManagerEx.getInstance().removeAssociation(fakeFileType, matchYaml)
                }
            })

            setOf("template.canParseByExtension.yaml", "template.canParseByExtension.yml").forEach {
                val yamlFile = projectRule.fixture.addFileToProject(it, TEST_TEMPLATE)
                assertThat(yamlFile.fileType).isEqualTo(fakeFileType)
                assertThat(CloudFormationTemplate.parse(projectRule.project, yamlFile.virtualFile)).isNotNull
            }
        }
    }

    @Test
    fun serverlessFunctionInheritsGlobalsProperties() {
        val template = yamlTemplate(template = TEST_TEMPLATE_WITH_GLOBALS)

        runInEdtAndWait {
            val samFunction = template.getResourceByName("FooFunction") as SamFunction
            assertThat(samFunction.runtime()).isEqualTo("java8")
            assertThat(samFunction.codeLocation()).isEqualTo("target/out.jar")
        }
    }

    @Test
    fun serverlessFunctionOverridesGlobalsProperties() {
        val template = yamlTemplate(template = TEST_TEMPLATE_WITH_GLOBALS)

        runInEdtAndWait {
            val samFunction = template.getResourceByName("MyFunction") as SamFunction
            assertThat(samFunction.runtime()).isEqualTo("java12")
            assertThat(samFunction.codeLocation()).isEqualTo("target/out.jar")
        }
    }

    @Test
    fun lambdaFunctionDoesNotInheritGlobalsProperties() {
        val template = yamlTemplate(template = TEST_TEMPLATE_WITH_GLOBALS)

        runInEdtAndWait {
            val lambdaFunction = template.getResourceByName("LambdaFunction") as LambdaFunction
            assertThatThrownBy { lambdaFunction.runtime() }.isInstanceOf(IllegalStateException::class.java).hasMessage(
                message("cloudformation.missing_property", "Runtime", lambdaFunction.logicalName)
            )
        }
    }

    @Test
    fun invalidTemplateIsHandledGracefully() {
        val template = yamlTemplate(
            """
            foo:
              bar
            ---
            hello:
              world
            """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(template.resources().toList()).isEmpty()
            assertThat(template.parameters().toList()).isEmpty()
            assertThat(template.globals().toList()).isEmpty()
        }
    }

    private fun yamlTemplate(template: String = TEST_TEMPLATE): CloudFormationTemplate = runInEdtAndGet {
        val file = projectRule.fixture.addFileToProject("template.yaml", template)
        CloudFormationTemplate.parse(projectRule.project, file.virtualFile)
    }

    private companion object {
        val TEST_TEMPLATE =
            """
Description: "Some description"
Parameters:
    TableName:
        Default: someTable
        Description: Storage for your data
        ConstraintDescription: No emojis
    TableTag:
        Description: Tag to add to the DynamoDb table
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: target/out.jar
    MyDynamoTable:
        Type: AWS::DynamoDB::Table
        Properties:
            AttributeDefinitions:
                - AttributeName: "ArtistId"
                  AttributeType: "S"
                - AttributeName: "Concert"
                  AttributeType: "S"
            KeySchema:
                - AttributeName: "ArtistId"
                  KeyType: "HASH"
                - AttributeName: "Concert"
                  KeyType: "RANGE"
            ProvisionedThroughput:
                ReadCapacityUnits: 1
                WriteCapacityUnits: 1
            """.trimIndent()

        val TEST_TEMPLATE_WITH_GLOBALS =
            """
Description: "Some description"
Globals:
    Function:
        Runtime: java8
        CodeUri: target/out.jar
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java12
    FooFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
    LambdaFunction:
        Type: AWS::Lambda::Function
        Properties:
            Handler: helloworld.App::handleRequest
            """.trimIndent()
    }
}
