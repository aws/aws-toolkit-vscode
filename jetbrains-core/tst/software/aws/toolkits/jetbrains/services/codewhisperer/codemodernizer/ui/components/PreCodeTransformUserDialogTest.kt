// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer.ui.components

import com.intellij.openapi.projectRoots.JavaSdkVersion
import junit.framework.TestCase.assertEquals
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codemodernizer.getJdkVersionText

class PreCodeTransformUserDialogTest {
    @Test
    fun `getJdkVersionText returns proper text when Java version is supported`() {
        val jdkVersionText = getJdkVersionText(JavaSdkVersion.JDK_1_8)
        val expectedText = "We found Java version: JDK_1_8. Select a different version if incorrect."
        assertEquals(jdkVersionText, expectedText)
    }

    @Test
    fun `getJdkVersionText returns proper text when Java version is unsupported`() {
        val jdkVersionText = getJdkVersionText(JavaSdkVersion.JDK_1_5)
        val expectedText = "We found an unsupported Java version (JDK_1_5). Select your version here if incorrect."
        assertEquals(jdkVersionText, expectedText)
    }
}
