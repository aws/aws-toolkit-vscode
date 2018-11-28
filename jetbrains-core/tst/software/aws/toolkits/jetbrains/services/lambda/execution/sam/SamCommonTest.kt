// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.text.SemVer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermissions

class SamCommonTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Test
    fun testValidate_noPath() {
        val result = SamCommon.validate(null)
        println(result)
        assertEquals(message("lambda.run_configuration.sam.not_specified"), result)
    }

    @Test
    fun testValidate_pathNotExists() {
        Assume.assumeTrue(SystemInfo.isUnix)
        val result = SamCommon.validate("dasfasdfjlkakjsdf_not_a_real_path")
        println(result)
        assertTrue(result?.contains("No such file or directory") == true)
    }

    @Test
    fun testValidate_exception() {
        Assume.assumeTrue(SystemInfo.isUnix)
        val path = projectRule.fixture.addFileToProject("badexe", "").virtualFile.path
        val result = SamCommon.validate(path)
        println(result)
        assertTrue(result?.contains("Permission denied") == true)
    }

    @Test
    fun testValidate_exitNonZero() {
        Assume.assumeTrue(SystemInfo.isUnix)
        val path = projectRule.fixture.addFileToProject("badexe", "echo stderr >&2; exit 100;").virtualFile.path
        Files.setPosixFilePermissions(Paths.get(path), PosixFilePermissions.fromString("r-xr-xr-x"))

        val result = SamCommon.validate(path)
        println(result)
        assertTrue(result?.contains("stderr") == true)
    }

    @Test
    fun testValidate_ok() {
        Assume.assumeTrue(SystemInfo.isUnix)
        val path = projectRule.fixture.addFileToProject("good", "echo '${SamCommonTestUtils.getMinVersionAsJson()}'").virtualFile.path
        Files.setPosixFilePermissions(Paths.get(path), PosixFilePermissions.fromString("r-xr-xr-x"))

        val result = SamCommon.validate(path)
        println(result)
        assertNull(result)
    }

    @Test(expected = java.lang.AssertionError::class)
    fun getTemplateFromDirectory_noYaml() {
        val projectBase = LocalFileSystem.getInstance().findFileByPath(projectRule.project.basePath!!)
        SamCommon.getTemplateFromDirectory(projectBase!!)
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

    private fun createChildren(directory: String, file: String = "TestFile") {
        projectRule.fixture.addFileToProject("$directory/$file", "")
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

class SamCommonTestUtils {
    companion object {
        private fun getVersionAsJson(version: SemVer): String {
            val tree = SamCommon.mapper.createObjectNode()
            tree.put(SamCommon.SAM_INFO_VERSION_KEY, version.parsedVersion)
            return SamCommon.mapper.writeValueAsString(tree)
        }

        fun getMinVersionAsJson() = getVersionAsJson(SamCommon.expectedSamMinVersion)

        fun getMaxVersionAsJson() = getVersionAsJson(SamCommon.expectedSamMaxVersion)
    }
}