// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode

class OpenServiceUrlActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    private val url = aString()

    @Test
    fun `Open Service Url passes the correct URL to the browser launcher`() {
        val launcher = mock<BrowserLauncher>()
        val action = OpenServiceUrlAction()

        ApplicationManager.getApplication().replaceService(BrowserLauncher::class.java, launcher, projectRule.project)
        action.actionPerformed(AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceUrl(url).build()), mock())

        verify(launcher).browse("https://$url", project = projectRule.project)
    }
}
