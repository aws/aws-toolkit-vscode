// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.packageLambda
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Paths

class PythonLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val sut = PythonLambdaBuilder()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()
    }

    @Test
    fun contentRootIsAdded() {
        val module = projectRule.module
        val handler = addPythonHandler("hello_world")
        addRequirementsFile("")
        val builtLambda = sut.buildLambda(module, handler, Runtime.PYTHON3_6, "hello_world/app.handle")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "hello_world/app.py",
            "requirements.txt"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun sourceRootTakesPrecedenceOverContentRoot() {
        val module = projectRule.module
        val handler = addPythonHandler("src")
        addRequirementsFile("src")

        PsiTestUtil.addSourceRoot(projectRule.module, handler.containingFile.virtualFile.parent)

        val builtLambda = sut.buildLambda(module, handler, Runtime.PYTHON3_6, "app.handle")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "app.py",
            "requirements.txt"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%/src" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun baseDirBasedOnRequirementsFileAtRootOfHandler() {
        val module = projectRule.module
        val handler = addPythonHandler("src")
        addRequirementsFile("src")

        val builtLambda = sut.buildLambda(module, handler, Runtime.PYTHON3_6, "app.handle")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "app.py",
            "requirements.txt"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%/src" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun dependenciesAreAdded() {
        val module = projectRule.module
        val handler = addPythonHandler("hello_world")
        addRequirementsFile("", "requests==2.20.0")

        val builtLambda = sut.buildLambda(module, handler, Runtime.PYTHON3_6, "hello_world/app.handle")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "hello_world/app.py",
            "requests/__init__.py"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun builtFromTemplate() {
        val module = projectRule.module
        addPythonHandler("hello_world")
        addRequirementsFile("hello_world", "requests==2.20.0")
        val templateFile = projectRule.fixture.addFileToProject(
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: app.handle
                  CodeUri: hello_world
                  Runtime: python3.6
                  Timeout: 900
            """.trimIndent()
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        val builtLambda = sut.buildLambdaFromTemplate(module, templatePath, "SomeFunction")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "app.py",
            "requests/__init__.py"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%/hello_world" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun packageLambdaIntoZip() {
        val handler = addPythonHandler("hello_world")
        addRequirementsFile("", "requests==2.20.0")

        val lambdaPackage = sut.packageLambda(projectRule.module, handler, Runtime.PYTHON3_6, "hello_world/app.handle")
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "hello_world/app.py",
            "requests/__init__.py"
        )
    }

    @Test
    fun buildInContainer() {
        val module = projectRule.module
        val handler = addPythonHandler("hello_world")
        addRequirementsFile("")
        val builtLambda = sut.buildLambda(module, handler, Runtime.PYTHON3_6, "hello_world/app.handle", true)
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "hello_world/app.py",
            "requirements.txt"
        )
        LambdaBuilderTestUtils.verifyPathMappings(
            module,
            builtLambda,
            "%PROJECT_ROOT%" to "/",
            "%BUILD_ROOT%" to "/"
        )
    }

    @Test
    fun packageInContainer() {
        val handler = addPythonHandler("hello_world")
        addRequirementsFile("", "requests==2.20.0")

        val lambdaPackage = sut.packageLambda(projectRule.module, handler, Runtime.PYTHON3_6, "hello_world/app.handle", true)
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "hello_world/app.py",
            "requests/__init__.py"
        )
    }

    private fun addPythonHandler(subPath: String): PyFunction {
        val psiFile = projectRule.fixture.addFileToProject(
            "$subPath/app.py",
            """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
        ) as PyFile

        return runInEdtAndGet {
            psiFile.findTopLevelFunction("handle")!!
        }
    }

    private fun addRequirementsFile(subPath: String, content: String = "") {
        projectRule.fixture.addFileToProject("$subPath/requirements.txt", content)
    }
}
