// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setUpGradleProject
import software.aws.toolkits.jetbrains.utils.setUpMavenProject
import software.aws.toolkits.resources.message
import java.nio.file.Paths

class JavaLambdaBuilderTest : BaseLambdaBuilderTest() {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    override val lambdaBuilder: LambdaBuilder
        get() = JavaLambdaBuilder()

    @Before
    override fun setUp() {
        super.setUp()
        projectRule.fixture.addModule("main")
    }

    @Test
    fun gradleBuiltFromHandler() {
        val handlerPsi = projectRule.setUpGradleProject()

        val builtLambda = buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        verifyEntries(
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

        val builtLambda = buildLambdaFromTemplate(projectRule.module, templatePath, "SomeFunction")
        verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun gradlePackage() {
        val handlerPsi = projectRule.setUpGradleProject()

        val lambdaPackage = packageLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        verifyZipEntries(
            lambdaPackage,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun mavenBuiltFromHandler() {
        val handlerPsi = projectRule.setUpMavenProject()

        val builtLambda = buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        verifyEntries(
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

        val builtLambda = buildLambdaFromTemplate(projectRule.module, templatePath, "SomeFunction")
        verifyEntries(
            builtLambda,
            "com/example/SomeClass.class",
            "lib/aws-lambda-java-core-1.2.0.jar"
        )
    }

    @Test
    fun mavenPackage() {
        val handlerPsi = projectRule.setUpMavenProject()

        val lambdaPackage = packageLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        verifyZipEntries(
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
            buildLambda(projectRule.module, handlerPsi, Runtime.JAVA8, "com.example.SomeClass")
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageEndingWith(message("lambda.build.java.unsupported_build_system", projectRule.module.name))
    }
}
