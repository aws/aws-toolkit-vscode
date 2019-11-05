// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.openapi.util.SystemInfo
import com.intellij.testGuiFramework.fixtures.WelcomeFrameFixture
import com.intellij.testGuiFramework.impl.actionLink
import com.intellij.testGuiFramework.impl.popupMenu

fun WelcomeFrameFixture.openSettingsDialog() {
    actionLink("Configure").click()
    val prefName = if (SystemInfo.isMac) "Preferences" else "Settings"
    popupMenu(prefName).clickSearchedItem()
}
