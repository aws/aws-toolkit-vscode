// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.stepsProcessing.step

class JTreeFixture(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : ComponentFixture(remoteRobot, remoteComponent) {

    fun selectPath(vararg paths: String) {
        val path = paths.joinToString("/")
        step("select $path") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.clickPath('$path') 
                """.trimIndent()
            )
        }
    }
}
