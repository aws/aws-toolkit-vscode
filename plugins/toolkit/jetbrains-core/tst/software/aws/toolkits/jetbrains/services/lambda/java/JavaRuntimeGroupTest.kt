// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
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
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

@RunWith(Parameterized::class)
class JavaRuntimeGroupTest(
    @Suppress("unused") private val name: String,
    private val sdk: () -> Sdk,
    private val expectedRuntime: LambdaRuntime?
) {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    private val sut = JavaRuntimeGroup()

    @Test
    fun sdkResultsInExpectedRuntime() {
        val module = projectRule.module

        WriteAction.computeAndWait<Unit, Throwable> {
            val sdk = sdk()
            ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.testRootDisposable)
            ModuleRootModificationUtil.setModuleSdk(module, sdk)
        }

        assertThat(sut.determineRuntime(module)).isEqualTo(expectedRuntime)
    }

    companion object {
        @Parameters(name = "{0}")
        @JvmStatic
        fun parameters(): Collection<Array<*>> = listOf(
            arrayOf<Any?>("Java 7", { IdeaTestUtil.getMockJdk17() }, LambdaRuntime.JAVA8_AL2),
            arrayOf<Any?>("Java 8", { IdeaTestUtil.getMockJdk18() }, LambdaRuntime.JAVA8_AL2),
            arrayOf<Any?>("Java 9", { IdeaTestUtil.getMockJdk9() }, LambdaRuntime.JAVA11),
            arrayOf<Any?>("Java 10", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_10.toJavaVersion()) }, LambdaRuntime.JAVA11),
            arrayOf<Any?>("Java 11", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_11.toJavaVersion()) }, LambdaRuntime.JAVA11),
            arrayOf<Any?>("Java 12", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_12.toJavaVersion()) }, LambdaRuntime.JAVA17),
            arrayOf<Any?>("Java 17", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_17.toJavaVersion()) }, LambdaRuntime.JAVA17),
            arrayOf<Any?>("Java 18", { IdeaTestUtil.getMockJdk(LanguageLevel.JDK_18.toJavaVersion()) }, null)
        )
    }
}
