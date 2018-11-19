// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.yaml

import com.intellij.openapi.fileTypes.ex.FakeFileType
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.annotations.NotNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
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
            assertNull(tableTag!!.defaultValue())
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
            try {
                FileTypeManagerEx.getInstanceEx().registerFileType(fakeFileType)
                setOf("template.yaml", "template.yml").forEach {
                    val yamlFile = projectRule.fixture.addFileToProject(it, TEST_TEMPLATE)
                    assertThat(yamlFile.fileType).isEqualTo(fakeFileType)
                    assertThat(CloudFormationTemplate.parse(projectRule.project, yamlFile.virtualFile)).isNotNull
                }
            } finally {
                FileTypeManagerEx.getInstanceEx().unregisterFileType(fakeFileType)
            }
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
    }
}