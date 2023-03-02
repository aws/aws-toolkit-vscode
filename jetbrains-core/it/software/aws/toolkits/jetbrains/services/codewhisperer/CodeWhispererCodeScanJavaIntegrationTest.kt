// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.runInEdtAndWait
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaTestContext
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.RunWithRealCredentials.RequiresRealCredentials
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.resources.message

@RequiresRealCredentials
class CodeWhispererCodeScanJavaIntegrationTest : CodeWhispererIntegrationTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    @Test
    fun testCodeScanJavaProjectNoBuild() {
        projectRule as HeavyJavaCodeInsightTestFixtureRule
        val module = projectRule.fixture.addModule("main")

        val psiClass = projectRule.fixture.addClass(module, javaTestContext)
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }
        testCodeScanWithErrorMessage(message("codewhisperer.codescan.build_artifacts_not_found"))
    }
}
