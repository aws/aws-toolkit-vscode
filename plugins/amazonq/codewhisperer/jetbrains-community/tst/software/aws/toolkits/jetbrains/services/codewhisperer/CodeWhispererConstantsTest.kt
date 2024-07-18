// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.help.HelpIdTranslator
import software.aws.toolkits.jetbrains.core.help.HelpIds
class CodeWhispererConstantsTest {

    @Rule
    @JvmField
    val application = ApplicationRule()

    @Test
    fun `codewhisperer help uri has correct doc link`() {
        assertThat(HelpIdTranslator().getHelpPageUrl(HelpIds.CODEWHISPERER_LOGIN_YES_NO.id))
            .isEqualTo("https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html")
    }
}
