// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer.panels.managers

import org.junit.Before
import org.mockito.kotlin.spy
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.BuildProgressTreePanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.LoadingPanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.BuildProgressSplitterPanelManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer.panels.PanelTestBase

class BuildProgressSplitterPanelManagerTest : PanelTestBase() {
    private lateinit var buildProgressSplitterPanelManagerMock: BuildProgressSplitterPanelManager
    private lateinit var statusTreePanelMock: BuildProgressTreePanel
    private lateinit var loadingPanelMock: LoadingPanel

    @Before
    override fun setup() {
        super.setup()
        loadingPanelMock = spy(LoadingPanel(project))
        buildProgressSplitterPanelManagerMock = spy(BuildProgressSplitterPanelManager(project))
        statusTreePanelMock = spy(BuildProgressTreePanel())
        buildProgressSplitterPanelManagerMock.loadingPanel = loadingPanelMock
        buildProgressSplitterPanelManagerMock.statusTreePanel = statusTreePanelMock
    }
}
