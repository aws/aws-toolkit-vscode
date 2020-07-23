// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.testFramework.IdeaTestUtil
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.buildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderTestUtils.packageLambda
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import software.aws.toolkits.jetbrains.utils.setUpGradleProject
import software.aws.toolkits.jetbrains.utils.setUpJdk
import software.aws.toolkits.jetbrains.utils.setUpMavenProject
import software.aws.toolkits.resources.message
import java.nio.file.Paths

class JavaLambdaBuilderTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val envVarsRule = EnvironmentVariableHelper()

    private val sut = JavaLambdaBuilder()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        envVarsRule.remove("JAVA_HOME")

        projectRule.fixture.addModule("main")
        projectRule.setUpJdk()
    }

    @Test
    fun gradleBuiltFromHandler() {
        val handlerPsi = projectRule.setUpGradleProject()

        val builtLambda = sut.buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun gradleBuiltFromTemplate() {
        projectRule.setUpGradleProject()

        val templateFile = projectRule.fixture.addFileToModule(
            projectRule.module,
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: com.example.SomeClass
                  CodeUri: .
                  Runtime: java8
                  Timeout: 900
            """.trimIndent()
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        val builtLambda = sut.buildLambdaFromTemplate(projectRule.module, templatePath, "SomeFunction")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun gradlePackage() {
        val handlerPsi = projectRule.setUpGradleProject()

        val lambdaPackage = sut.packageLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun mavenBuiltFromHandler() {
        val handlerPsi = projectRule.setUpMavenProject()

        val builtLambda = sut.buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun mavenBuiltFromTemplate() {
        projectRule.setUpMavenProject()

        val templateFile = projectRule.fixture.addFileToModule(
            projectRule.module,
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: com.example.SomeClass
                  CodeUri: .
                  Runtime: java8
                  Timeout: 900
            """.trimIndent()
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        val builtLambda = sut.buildLambdaFromTemplate(projectRule.module, templatePath, "SomeFunction")
        LambdaBuilderTestUtils.verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun mavenPackage() {
        val handlerPsi = projectRule.setUpMavenProject()

        val lambdaPackage = sut.packageLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        LambdaBuilderTestUtils.verifyZipEntries(
            lambdaPackage,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun unsupportedSystem() {
        val handlerPsi = projectRule.fixture.addClass(
            """
            package com.example;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """.trimIndent()
        )

        assertThatThrownBy {
            sut.buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageEndingWith(message("lambda.build.java.unsupported_build_system", projectRule.module.name))
    }

    @Test
    fun javaHomePassedWhenNotInContainer() {
        val commandLine = runBlocking {
            JavaLambdaBuilder().constructSamBuildCommand(
                projectRule.module,
                Paths.get("."),
                "SomeId",
                SamOptions(buildInContainer = false),
                Paths.get(".")
            )
        }
        assertThat(commandLine.environment).extractingByKey("JAVA_HOME").isEqualTo(IdeaTestUtil.requireRealJdkHome())
    }

    @Test
    fun javaHomeNotPassedWheInContainer() {
        val commandLine = runBlocking {
            JavaLambdaBuilder().constructSamBuildCommand(
                projectRule.module,
                Paths.get("."),
                "SomeId",
                SamOptions(buildInContainer = true),
                Paths.get(".")
            )
        }
        assertThat(commandLine.environment).doesNotContainKey("JAVA_HOME")
    }
}
