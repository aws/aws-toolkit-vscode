// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager

class AwsSettingsMenuTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    private val mockSettingsManager by lazy { MockProjectAccountSettingsManager.getInstance(projectRule.project) }

    @Test
    fun itemsAreRefreshedWhenSettingsChange() {
        val sut = AwsSettingsMenu(projectRule.project)

        mockSettingsManager.internalRecentlyUsedRegions.add(AwsRegion.GLOBAL)
        projectRule.project.messageBus.syncPublisher(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED).activeRegionChanged(AwsRegion.GLOBAL)

        val actionGroup = sut.getChildren(null).first() as DefaultActionGroup
        val separators = actionGroup.getChildren(null).filterIsInstance<Separator>()

        assertThat(separators).anySatisfy { assertThat(it.text).isEqualTo("Recent Regions") }
    }
}