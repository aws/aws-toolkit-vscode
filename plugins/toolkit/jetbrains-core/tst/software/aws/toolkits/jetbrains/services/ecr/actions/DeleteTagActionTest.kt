// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.ecr.EcrTagNode
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository

class DeleteTagActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun `Hides when selected nodes have different repositories`() {
        val action = TestActionEvent()
        DeleteTagAction().update(
            listOf(
                EcrTagNode(projectRule.project, Repository("name", "", ""), "tag1"),
                EcrTagNode(projectRule.project, Repository("differentName", "", ""), "tag1")
            ),
            action
        )
        assertThat(action.presentation.isVisible).isFalse()
    }

    @Test
    fun `Shows when multiple nodes selected with the same repository`() {
        val action = TestActionEvent()
        DeleteTagAction().update(
            listOf(
                EcrTagNode(projectRule.project, Repository("name", "", ""), "tag1"),
                EcrTagNode(projectRule.project, Repository("name", "", ""), "tag1")
            ),
            action
        )
        assertThat(action.presentation.isVisible).isTrue()
    }
}
