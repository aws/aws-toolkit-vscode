// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.pom.java.LanguageLevel
import com.intellij.testFramework.IdeaTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import org.junit.runners.Parameterized.Parameters
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

@RunWith(Parameterized::class)
class JavaRuntimeGroupTest(
    @Suppress("unused") private val name: String,
    private val sdk: () -> Sdk,
    private val expectedRuntime: Runtime?
) {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    private val sut = JavaRuntimeGroup()

    @Test
    fun sdkResultsInExpectedRuntime() {
        val module = projectRule.module

        ModuleRootModificationUtil.setModuleSdk(module, sdk())

        assertThat(sut.determineRuntime(module)).isEqualTo(expectedRuntime)
    }

    companion object {

        @Parameters(name = "{0}")
        @JvmStatic
        fun parameters(): Collection<Array<*>> = listOf(
            arrayOf<Any?>("Java 7", { IdeaTestUtil.getMockJdk17() }, Runtime.JAVA8),
            arrayOf<Any?>("Java 8", { IdeaTestUtil.getMockJdk18() }, Runtime.JAVA8),
            arrayOf<Any?>("Java 9", { IdeaTestUtil.getMockJdk9() }, Runtime.JAVA11),
            arrayOf<Any?>("Java 10", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_10.toJavaVersion()) }, Runtime.JAVA11),
            arrayOf<Any?>("Java 11", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_11.toJavaVersion()) }, Runtime.JAVA11),
            arrayOf<Any?>("Java 12", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_12.toJavaVersion()) }, null)
        )
    }
}
