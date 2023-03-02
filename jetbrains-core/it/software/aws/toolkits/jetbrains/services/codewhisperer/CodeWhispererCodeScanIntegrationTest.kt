// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.cppFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.cppTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.utils.rules.RunWithRealCredentials.RequiresRealCredentials
import software.aws.toolkits.resources.message

@RequiresRealCredentials
class CodeWhispererCodeScanIntegrationTest : CodeWhispererIntegrationTestBase() {
    private val filePromptWithSecurityIssues = """
        from flask import app

        @app.route('/')
        def execute_input_noncompliant():
            from flask import request
            module_version = request.args.get("module_version")
            # Noncompliant: executes unsanitized inputs.
            exec("import urllib%s as urllib" % module_version)

        @app.route('/')
        def execute_input_compliant():
            from flask import request
            module_version = request.args.get("module_version")
            # Compliant: executes sanitized inputs.
            exec("import urllib%d as urllib" % int(module_version))
    """.trimIndent()

    @Test
    fun testCodeScanValidWithIssues() {
        projectRule.fixture.addFileToProject("test2.py", filePromptWithSecurityIssues)
        val response = runCodeScan()
        assertThat(response.issues.size).isEqualTo(3)
        assertThat(response.responseContext.codeScanTotalIssues).isEqualTo(3)
        assertThat(response.responseContext.codeScanJobId).isNotNull
    }

    @Test
    fun testCodeScanValidWithNoIssues() {
        val response = runCodeScan()
        assertThat(response.issues.size).isEqualTo(0)
        assertThat(response.responseContext.codeScanTotalIssues).isEqualTo(0)
        assertThat(response.responseContext.codeScanJobId).isNotNull
    }

    @Test
    fun testCodeScanFileTooLarge() {
        val largePrompt = "a".repeat(1024 * 300)
        val file = projectRule.fixture.addFileToProject("test2.py", largePrompt)
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }
        testCodeScanWithErrorMessage(
            message(
                "codewhisperer.codescan.file_too_large",
                CodeScanSessionConfig.create(file.virtualFile, projectRule.project).getPresentablePayloadLimit()
            )
        )
    }

    @Test
    fun testCodeScanUnsupportedLanguage() {
        val file = projectRule.fixture.addFileToProject(cppFileName, cppTestLeftContext)
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }
        testCodeScanWithErrorMessage(
            message("codewhisperer.codescan.file_ext_not_supported", file.virtualFile.extension ?: "")
        )
    }
}
