// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.psi.PsiFileFactory
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.yaml.YAMLLanguage
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLMapping
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.findFunctionsFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.functionFromElement

class SamTemplateUtilsTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Test
    fun canPullFunctionsFromASamTemplate() {
        val file = yamlFile().virtualFile

        runInEdtAndWait {
            val functions = findFunctionsFromTemplate(projectRule.project, file)
            assertThat(functions).hasSize(2)
            assertFunction(functions[0], "MySamFunction", "hello.zip", "helloworld.App::handleRequest", "java8")
            assertFunction(functions[1], "MyLambdaFunction", "foo.zip", "foobar.App::handleRequest", "java8")
        }
    }

    @Test
    fun canPullFunctionFromASamTemplateWithGlobal() {
        val file = yamlFileWithGlobal().virtualFile
        runInEdtAndWait {
            val functions = findFunctionsFromTemplate(projectRule.project, file)
            assertThat(functions).hasSize(2)
            assertFunction(functions[0], "MySamFunction", "hello.zip", "helloworld.App::handleRequest", "java8")
            assertFunction(functions[1], "MyLambdaFunction", "foo.zip", "foobar.App::handleRequest", "java8")
        }
    }

    @Test
    fun canConvertAPsiElementFunction() {
        val file = yamlFile()

        val function = runInEdtAndGet {
            val functionElement =
                file.findByLocation("Resources.MySamFunction") ?: throw RuntimeException("Can't find MySamFunction")
            functionFromElement(functionElement)
        } ?: throw AssertionError("Function not found")

        assertFunction(function, "MySamFunction", "hello.zip", "helloworld.App::handleRequest", "java8")
    }

    private fun yamlFile(): YAMLFile = runInEdtAndGet {
        PsiFileFactory.getInstance(projectRule.project).createFileFromText(
            YAMLLanguage.INSTANCE, """
Resources:
    MySamFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello.zip
            Handler: helloworld.App::handleRequest
            Runtime: java8
    MyLambdaFunction:
        Type: AWS::Lambda::Function
        Properties:
            Code: foo.zip
            Handler: foobar.App::handleRequest
            Runtime: java8
        """.trimIndent()
        ) as YAMLFile
    }

    private fun yamlFileWithGlobal(): YAMLFile = runInEdtAndGet {
        PsiFileFactory.getInstance(projectRule.project).createFileFromText(
            YAMLLanguage.INSTANCE, """
Globals:
    Function:
        Runtime: java8
        Timeout: 180
Resources:
    MySamFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello.zip
            Handler: helloworld.App::handleRequest
    MyLambdaFunction:
        Type: AWS::Lambda::Function
        Properties:
            Code: foo.zip
            Handler: foobar.App::handleRequest
            Runtime: java8
        """.trimIndent()
        ) as YAMLFile
    }

    private fun assertFunction(
        function: Function,
        logicalName: String,
        codeLocation: String,
        handler: String,
        runtime: String
    ) {
        runInEdtAndWait {
            assertThat(function.logicalName).isEqualTo(logicalName)
            assertThat(function.codeLocation()).isEqualTo(codeLocation)
            assertThat(function.handler()).isEqualTo(handler)
            assertThat(function.runtime()).isEqualTo(runtime)
        }
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
