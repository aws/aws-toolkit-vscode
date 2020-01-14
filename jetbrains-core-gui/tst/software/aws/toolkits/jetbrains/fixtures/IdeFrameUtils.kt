// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.openapi.actionSystem.impl.ActionMenuItem
import com.intellij.openapi.wm.impl.IdeFrameImpl
import com.intellij.testGuiFramework.fixtures.IdeFrameFixture
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.impl.jList
import com.intellij.testGuiFramework.util.step
import com.intellij.ui.SimpleColoredComponent

fun IdeFrameFixture.clickMenuItem(predicate: (ActionMenuItem) -> Boolean) {
    findComponentWithTimeout<ActionMenuItem, IdeFrameImpl> { predicate(it) }.let { robot().click(it) }
}

fun IdeFrameFixture.configureConnection(profile: String, region: String) {
    step("Configure connection to profile: $profile, region $region") {
        val component =
            findComponentWithTimeout<SimpleColoredComponent, IdeFrameImpl> {
                it.javaClass.name.contains("IdeStatusBarImpl") && it.toolTipText == "AWS Connection Settings"
            }

        robot().click(component)
        jList(region).clickItem(region)

        robot().click(component)
        jList(profile).clickItem(profile)
    }
}
