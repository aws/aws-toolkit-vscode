// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.clouddebug

import com.intellij.testFramework.ProjectRule
import net.miginfocom.swing.MigLayout
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import javax.swing.DefaultListModel
import javax.swing.JList
import javax.swing.JPanel

class ArtifactMappingPopupTest {

    companion object {
        private fun expectedLayoutConstraint(columnWidth: Int) = "[$columnWidth][min!][]"
    }

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun artifactsPopupContainsNoElements() {
        val popup = ArtifactMappingPopup.createPopup(emptyList()) { }
        Assertions.assertThat(popup.listStep.values.size).isEqualTo(0)
    }

    @Test
    fun artifactsPopupContainsValidMapping() {
        val popup = ArtifactMappingPopup.createPopup(listOf(
            ArtifactMapping(localPath = "/tmp/local/path", remotePath = "/tmp/remote/path"),
            ArtifactMapping(localPath = "/tmp/another/local/path", remotePath = "/tmp/another/remote/path")
        )) { }
        Assertions.assertThat(popup.listStep.values.size).isEqualTo(2)
    }

    @Test
    fun artifactsPopupPathRendererShortLocalPath() {
        val renderer = PathMappingPopupCellRenderer()

        val model = DefaultListModel<ArtifactMapping>()
        val artifact = ArtifactMapping(localPath = "/local", remotePath = "/remote/path")
        model.addElement(artifact)

        val component =
            renderer.getListCellRendererComponent(list = JList(model), value = artifact, index = 0, selected = true, hasFocus = true)

        Assertions.assertThat(((component as JPanel).layout as MigLayout).columnConstraints)
            .isEqualTo(expectedLayoutConstraint(PathMappingPopupCellRenderer.LEFT_COMPONENT_MIN_WIDTH))
    }

    @Test
    fun artifactsPopupPathRendererVeryLongLocalPath() {
        val renderer = PathMappingPopupCellRenderer()

        val model = DefaultListModel<ArtifactMapping>()
        val artifact = ArtifactMapping(
            localPath = "/this/is/a/very/very/very/very/very/very/very/long/local/path",
            remotePath = "/remote/path"
        )
        model.addElement(artifact)

        val component =
            renderer.getListCellRendererComponent(list = JList(model), value = artifact, index = 0, selected = true, hasFocus = true)

        Assertions.assertThat(((component as JPanel).layout as MigLayout).columnConstraints)
            .isEqualTo(expectedLayoutConstraint(PathMappingPopupCellRenderer.LEFT_COMPONENT_MAX_WIDTH))
    }
}
