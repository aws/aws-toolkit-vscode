// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import java.awt.datatransfer.DataFlavor

class CopyServiceUrlActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    private val url = aString()

    @Test
    fun `Copy Service Url copies correct field`() {
        val action = CopyServiceUrlAction()
        action.actionPerformed(AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceUrl(url).build()), mock())
        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("https://$url")
    }
}
