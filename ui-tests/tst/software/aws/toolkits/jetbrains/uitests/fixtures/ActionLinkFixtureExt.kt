// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.utils.Locators

object ActionLinkFixtureExt {
    fun byText(text: String) =
        Locators.byTypeAndProperties("com.intellij.ui.components.labels.ActionLink", Locators.XpathProperty.TEXT to text)

    fun byTextContains(text: String) =
        Locators.byTypeAndPropertiesContains("com.intellij.ui.components.labels.ActionLink", Locators.XpathProperty.TEXT to text)
}
