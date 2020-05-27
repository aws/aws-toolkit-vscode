// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test

class ChangeAccountSettingsActionGroupTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun canDisplayBothRegionAndCredentialSelection() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.BOTH)
        val actions = group.getChildren(null)

        assertThat(actions).hasAtLeastOneElementOfType(ChangeRegionAction::class.java)
        assertThat(actions).hasAtLeastOneElementOfType(ChangeCredentialsAction::class.java)
    }

    @Test
    fun canDisplayOnlyRegionSelection() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.REGIONS)
        val actions = group.getChildren(null)

        assertThat(actions).hasAtLeastOneElementOfType(ChangeRegionAction::class.java)
        assertThat(actions).doesNotHaveAnyElementsOfTypes(ChangeCredentialsAction::class.java)
    }

    @Test
    fun canDisplayOnlyCredentialSelection() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.CREDENTIALS)
        val actions = group.getChildren(null)

        assertThat(actions).doesNotHaveAnyElementsOfTypes(ChangeRegionAction::class.java)
        assertThat(actions).hasAtLeastOneElementOfType(ChangeCredentialsAction::class.java)
    }
}
