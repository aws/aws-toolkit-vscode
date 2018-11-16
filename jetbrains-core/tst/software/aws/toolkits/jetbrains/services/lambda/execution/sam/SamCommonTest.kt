// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.application.runWriteAction
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule

class SamCommonTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Test(expected = java.lang.AssertionError::class)
    fun getTemplateFromDirectory_noYaml() {
        SamCommon.getTemplateFromDirectory(projectRule.project.baseDir)
    }

    @Test
    fun getTemplateFromDirectory_singleYaml() {
        val file = yamlTemplate()
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            val templateFile = SamCommon.getTemplateFromDirectory(dir)
            assertNotNull(templateFile)
        }
    }

    @Test(expected = java.lang.AssertionError::class)
    fun getTemplateFromDirectory_multipleYaml() {
        val file = yamlTemplate()
        yamlTemplate(filename = "template.yml")
        yamlTemplate(filename = "theBestTemplate.yml")
        yamlTemplate(filename = "i_need_more_templates.yaml")
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            SamCommon.getTemplateFromDirectory(dir)
        }
    }

    @Test
    fun getCodeUri_noUri() {
        val file = yamlTemplate("""
Description: "Some description"
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: target/out.jar
        """.trimIndent())
        runInEdtAndWait {
            projectRule.fixture.addFileToProject("target/out.jar", "")
        }
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            val templateFile = SamCommon.getTemplateFromDirectory(dir)
            assertNotNull(templateFile)
            val codeUris = SamCommon.getCodeUrisFromTemplate(projectRule.project, templateFile)
            assertEquals(0, codeUris.size)
        }
    }

    @Test
    fun getCodeUri_singleUri() {
        val file = yamlTemplate("""
Description: "Some description"
Resources:
    HelloWorldFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello_world/
            Handler: app.handle_request
            Runtime: java8
        """.trimIndent())
        createChildren("hello_world")
        runInEdtAndWait {
            projectRule.fixture.addFileToProject("target/out.jar", "")
        }
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            val templateFile = SamCommon.getTemplateFromDirectory(dir)
            assertNotNull(templateFile)
            val codeUris = SamCommon.getCodeUrisFromTemplate(projectRule.project, templateFile)
            assertEquals(1, codeUris.size)
            assertEquals("hello_world", codeUris[0].name)
        }
    }

    @Test
    fun getCodeUri_samAndNotSam() {
        val file = yamlTemplate("""
Description: "Some description"
Resources:
    HelloWorldFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello_world/
            Handler: app.handle_request
            Runtime: java8
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
        """.trimIndent())
        createChildren("hello_world")
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            val templateFile = SamCommon.getTemplateFromDirectory(dir)
            assertNotNull(templateFile)
            val codeUris = SamCommon.getCodeUrisFromTemplate(projectRule.project, templateFile)
            assertEquals(1, codeUris.size)
            assertEquals("hello_world", codeUris[0].name)
        }
    }

    @Test
    fun getCodeUri_multipleUris() {
        val file = yamlTemplate("""
Description: "Some description"
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: target/out.jar
    HelloWorldFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello_world/
            Handler: app.handle_request
            Runtime: java8
    AnotherHelloWorldFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello_world_42/
            Handler: app.handle_request
            Runtime: java8
        """.trimIndent())
        createChildren("hello_world")
        createChildren("hello_world_42")
        createChildren("target", "out.jar")
        runReadAction {
            val dir = file.containingDirectory.virtualFile
            val templateFile = SamCommon.getTemplateFromDirectory(dir)
            assertNotNull(templateFile)
            val codeUris = SamCommon.getCodeUrisFromTemplate(projectRule.project, templateFile)
            assertEquals(2, codeUris.size)
            assertTrue(codeUris.any { it.name == "hello_world" })
            assertTrue(codeUris.any { it.name == "hello_world_42" })
        }
    }

    private fun yamlTemplate(template: String = TEST_TEMPLATE, filename: String = "template.yaml"): PsiFile = runInEdtAndGet {
        projectRule.fixture.addFileToProject(filename, template)
    }

    private fun createChildren(directory: String, file: String? = null) {
        runInEdtAndWait {
            runWriteAction {
                val dir = projectRule.project.baseDir.createChildDirectory(null, directory)
                if (file != null) {
                    dir.createChildData(null, file)
                }
            }
        }
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