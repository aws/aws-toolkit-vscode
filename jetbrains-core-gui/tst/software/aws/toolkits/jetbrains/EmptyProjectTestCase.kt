// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.testGuiFramework.impl.GuiTestCase
import com.intellij.testGuiFramework.util.scenarios.newProjectDialogModel
import org.junit.Before
import software.aws.toolkits.jetbrains.fixtures.createEmptyProject
import java.nio.file.Path
import java.nio.file.Paths

abstract class EmptyProjectTestCase : GuiTestCase() {

    protected val testDataPath: Path = Paths.get(System.getProperty("testDataPath"))

    @Before
    fun createEmptyProject() {
        welcomeFrame {
            createNewProject()
            newProjectDialogModel.createEmptyProject(projectFolder)
        }
    }
}
