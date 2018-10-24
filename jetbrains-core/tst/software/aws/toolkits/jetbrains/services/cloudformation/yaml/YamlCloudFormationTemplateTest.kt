// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.yaml

import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.testutils.rules.CodeInsightTestFixtureRule
import java.io.File

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

    private fun yamlTemplate(): CloudFormationTemplate = runInEdtAndGet {
        val file = projectRule.fixture.addFileToProject("template.yaml", TEST_TEMPLATE)
        CloudFormationTemplate.parse(projectRule.project, file.virtualFile)
    }

    private companion object {
        val TEST_TEMPLATE =
            """
Description: "Some description"
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