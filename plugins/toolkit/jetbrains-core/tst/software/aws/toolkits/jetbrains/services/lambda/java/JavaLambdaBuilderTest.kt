// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.roots.ModuleRootManagerEx
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.testFramework.IdeaTestUtil
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import software.aws.toolkits.jetbrains.utils.setUpGradleProject
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

        projectRule.fixture.addModule("main")
    }

    @Test
    fun gradleRootProjectHandlerBaseDirIsCorrect() {
        val psiClass = projectRule.setUpGradleProject()

        val baseDir = sut.handlerBaseDirectory(projectRule.module, psiClass.methods.first())
        val moduleRoot = ModuleRootManagerEx.getInstanceEx(projectRule.module).contentRoots.first().path
        assertThat(baseDir).isEqualTo(Paths.get(moduleRoot))
    }

    @Test
    fun gradleRootProjectBuildDirectoryIsCorrect() {
        projectRule.setUpGradleProject()

        val baseDir = sut.getBuildDirectory(projectRule.module)
        val moduleRoot = ModuleRootManagerEx.getInstanceEx(projectRule.module).contentRoots.first().path
        assertThat(baseDir.toAbsolutePath()).isEqualTo(Paths.get(moduleRoot, SamCommon.SAM_BUILD_DIR, "build"))
    }

    @Test
    fun mavenRootPomHandlerBaseDirIsCorrect() = runTest {
        val psiClass = projectRule.setUpMavenProject()

        val module = ModuleManager.getInstance(projectRule.project).modules.first()
        val baseDir = sut.handlerBaseDirectory(module, psiClass.methods.first())
        val moduleRoot = ModuleRootManagerEx.getInstanceEx(module).contentRoots.first().path
        assertThat(baseDir).isEqualTo(Paths.get(moduleRoot))
    }

    @Test
    fun mavenRootPomBuildDirectoryIsCorrect() = runTest {
        projectRule.setUpMavenProject()

        val module = ModuleManager.getInstance(projectRule.project).modules.first()
        val baseDir = sut.getBuildDirectory(module)
        val moduleRoot = ModuleRootManagerEx.getInstanceEx(module).contentRoots.first().path
        assertThat(baseDir.toAbsolutePath()).isEqualTo(Paths.get(moduleRoot, SamCommon.SAM_BUILD_DIR, "build"))
    }

    @Test
    fun unsupportedBuildSystem() {
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
            sut.handlerBaseDirectory(projectRule.module, handlerPsi)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageEndingWith(message("lambda.build.java.unsupported_build_system", projectRule.module.name))
    }

    @Test
    fun javaHomePassedWhenNotInContainer() {
        envVarsRule.remove("JAVA_HOME")

        ModuleRootModificationUtil.setModuleSdk(projectRule.module, IdeaTestUtil.getMockJdk18())
        assertThat(sut.additionalBuildEnvironmentVariables(projectRule.project, projectRule.module, SamOptions(buildInContainer = false)))
            .extractingByKey("JAVA_HOME").isEqualTo(IdeaTestUtil.getMockJdk18Path().absolutePath)
    }

    @Test
    fun javaHomeNotPassedWhenInContainer() {
        envVarsRule.remove("JAVA_HOME")

        assertThat(sut.additionalBuildEnvironmentVariables(projectRule.project, projectRule.module, SamOptions(buildInContainer = true)))
            .doesNotContainKey("JAVA_HOME")
    }
}
