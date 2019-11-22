// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.io.exists
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils.getVersionAsJson
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils.makeATestSam
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.Paths
import kotlin.test.assertNotNull

class SamCommonTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Test
    fun testValidate_noPath() {
        val result = SamCommon.validate(null)
        assertEquals(message("sam.cli_not_configured"), result)
    }

    @Test
    fun testValidate_pathNotExists() {
        val result = SamCommon.validate("dasfasdfjlkakjsdf_not_a_real_path")
        assertThat(result).contains("File not found: \"dasfasdfjlkakjsdf_not_a_real_path\"")
    }

    @Test
    fun testValidate_exception() {
        Assume.assumeTrue(SystemInfo.isUnix)
        val path = projectRule.fixture.addFileToProject("badexe", "").virtualFile.path
        val result = SamCommon.validate(path)
        assertThat(result).contains("Permission denied")
    }

    @Test
    fun testValidate_exitNonZero() {
        val samPath = makeATestSam("stderr", exitCode = 100)
        val result = SamCommon.validate(samPath.toString())
        assertThat(result).contains("stderr")
    }

    @Test
    fun testValidate_ok() {
        val samPath = makeATestSam(SamCommonTestUtils.getMinVersionAsJson())
        val result = SamCommon.validate(samPath.toString())
        assertNull(result)
    }

    @Test
    fun validateBothParametersAreEqualOnSemVer() {
        assertThat(SamCommon.expectedSamMinVersion.rawVersion).isEqualTo(SamCommon.expectedSamMinVersion.parsedVersion)
        assertThat(SamCommon.expectedSamMaxVersion.rawVersion).isEqualTo(SamCommon.expectedSamMaxVersion.parsedVersion)
    }

    @Test
    fun compatibleSamVersion() {
        val versions = arrayOf(
            "0.${SamCommon.expectedSamMinVersion.minor}.${SamCommon.expectedSamMinVersion.patch}",
            "0.${SamCommon.expectedSamMinVersion.minor}.123",
            "0.${SamCommon.expectedSamMinVersion.minor}.999999999",
            "0.${SamCommon.expectedSamMinVersion.minor}.${SamCommon.expectedSamMinVersion.patch + 1}-beta",
            "0.${SamCommon.expectedSamMinVersion.minor}.${SamCommon.expectedSamMinVersion.patch + 1}-beta+build",
            "0.${SamCommon.expectedSamMaxVersion.minor - 1}.${SamCommon.expectedSamMinVersion.patch}"
        )
        for (version in versions) {
            assertNull(SamCommon.validate(makeATestSam(getVersionAsJson(version)).toString()))
        }
    }

    @Test
    fun unparsableVersion() {
        val versions = arrayOf(
            "GNU bash, version 3.2.57(1)-release (x86_64-apple-darwin16)",
            "GNU bash, version 3.2.57(1)-release",
            "12312312.123123131221"
        )
        for (version in versions) {
            val message = SamCommon.validate(makeATestSam(getVersionAsJson(version)).toString())
            assertThat(message).contains("Could not parse %s executable version from".format(SamCommon.SAM_NAME))
        }
    }

    @Test
    fun incompatableSamVersion_tooLow() {
        val versions = arrayOf(
            "0.5.9",
            "0.0.1",
            "0.5.9-dev",
            "0.6.2"
        )
        for (version in versions) {
            val message = SamCommon.validate(makeATestSam(getVersionAsJson(version)).toString())
            assertThat(message).contains("Bad SAM CLI executable version. Expected")
            assertThat(message).contains("Upgrade your SAM CLI")
        }
    }

    @Test
    fun getVersion_Valid() {
        val version = "0.5.9-dev"
        val actualVersion = SamCommon.getVersionString(makeATestSam(getVersionAsJson(version)).toString())
        assertThat(actualVersion).isEqualTo(version)
    }

    @Test
    fun getVersion_badPath() {
        val actualVersion = SamCommon.getVersionString(path = null)
        assertThat(actualVersion).isEqualTo("UNKNOWN")
    }

    @Test
    fun getVersion_Valid_exitNonZero() {
        val samPath = makeATestSam("stderr", exitCode = 100)
        val actualVersion = SamCommon.getVersionString(samPath.toString())
        assertThat(actualVersion).isEqualTo("UNKNOWN")
    }

    @Test
    fun incompatableSamVersion_tooHigh() {
        val versions = arrayOf(
            SamCommon.expectedSamMaxVersion.rawVersion,
            SamCommon.expectedSamMaxVersion.parsedVersion,
            "1.0.0",
            "1.5.9",
            "1.5.9-dev"
        )
        for (version in versions) {
            val message = SamCommon.validate(makeATestSam(getVersionAsJson(version)).toString())
            assertThat(message).contains("Bad SAM CLI executable version. Expected")
            assertThat(message).contains("Upgrade your AWS Toolkit")
        }
    }

    @Test(expected = java.lang.AssertionError::class)
    fun getTemplateFromDirectory_noYaml() {
        val basePath = projectRule.project.basePath?.let { Paths.get(it) } ?: throw NullPointerException("basepath is null")
        if (!basePath.exists()) {
            Files.createDirectory(basePath)
        }
        val projectBase = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(basePath.toFile())
            ?: throw NullPointerException("project base is null ($basePath)")
        SamCommon.getTemplateFromDirectory(projectBase)
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
