// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.help.impl.HelpManagerImpl
import com.intellij.openapi.help.HelpManager
import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.help.HelpIds
class CodeWhispererConstantsTest {

    @Rule
    @JvmField
    val application = ApplicationRule()

    @Test
    fun `is codewishperer help uri has correct doc link`() {
        assertThat((HelpManager.getInstance() as HelpManagerImpl).getHelpUrl(HelpIds.CODEWHISPERER_LOGIN_YES_NO.id))
            .isEqualTo("https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html")
    }
}
