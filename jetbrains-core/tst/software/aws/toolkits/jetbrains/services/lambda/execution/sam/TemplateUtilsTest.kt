// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFileFactory
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.yaml.YAMLLanguage
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLMapping
import org.jetbrains.yaml.psi.YAMLPsiElement
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.UUID

class TemplateUtilsTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Test
    fun canPullFunctionsFromASamTemplate() {
        val file = folderRule.newFile("${UUID.randomUUID()}-template.yaml")

        file.writeText(
            """
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
        """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(findSamFunctionsFromTemplate(projectRule.project, file)).hasOnlyOneElementSatisfying {
                assertThat(it).isEqualTo(SamFunction("MyFunction", "helloworld.App::handleRequest", "java8"))
            }
        }
    }

    @Test
    fun canUpdateCodeUri() {
        val file = folderRule.newFile("${UUID.randomUUID()}-template.yaml")
        file.writeText(
            """
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: target/out.jar
        """.trimIndent()
        )

        runInEdtAndWait {
            updateCodeUriForFunctions(file, "new/uri.jar")
        }

        assertThat(file.readText()).isEqualTo(
            """
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
            CodeUri: new/uri.jar
        """.trimIndent()
        )
    }

    @Test
    fun canDetermineHandlerFromElement() {
        val file = yamlFile()

        val function = runInEdtAndGet {
            val functionElement = file.findByLocation("Resources.MyFunction") ?: throw RuntimeException("Can't find MyFunction")
            functionFromElement(functionElement)
        } ?: throw AssertionError("Function not found")

        assertThat(function.logicalName).isEqualTo("MyFunction")
        assertThat(function.handler).isEqualTo("helloworld.App::handleRequest")
        assertThat(function.runtime).isEqualTo("java8")
    }

    @Test
    fun onlyLogicalResourceNameIsMarked() {
        val file = yamlFile()
        val elements = mutableListOf<PsiElement>()
        runInEdtAndWait {
            file.forEach { element -> functionFromElement(element)?.let { elements.add(element) } }
        }
        assertThat(elements).hasSize(1)
    }

    private fun yamlFile(): YAMLFile {
        return runInEdtAndGet {
            PsiFileFactory.getInstance(projectRule.project).createFileFromText(
                YAMLLanguage.INSTANCE, """
    Resources:
        MyFunction:
            Type: AWS::Serverless::Function
            Properties:
                Handler: helloworld.App::handleRequest
                Runtime: java8
            """.trimIndent()
            ) as YAMLFile
        }
    }

    private fun YAMLPsiElement.forEach(visitor: (YAMLPsiElement) -> Unit) {
        visitor(this)
        yamlElements.forEach { it.forEach(visitor) }
    }
}

fun YAMLFile.findByLocation(location: String): YAMLKeyValue? = (documents.firstOrNull()?.topLevelValue as? YAMLMapping)?.findByLocation(location)

fun YAMLMapping.findByLocation(location: String): YAMLKeyValue? {
    val parts = location.split('.')
    val head = parts.first()
    val tail = parts.takeLast(parts.size - 1)
    return when (tail.isEmpty()) {
        true -> getKeyValueByKey(head)
        false -> (getKeyValueByKey(head)?.value as? YAMLMapping)?.findByLocation(tail.joinToString("."))
    }
}