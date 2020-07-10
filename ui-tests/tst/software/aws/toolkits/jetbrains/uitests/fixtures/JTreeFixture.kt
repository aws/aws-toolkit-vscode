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
    fun clickPath(vararg paths: String) = runJsPathMethod("clickPath", *paths)
    fun expandPath(vararg paths: String) = runJsPathMethod("expandPath", *paths)
    fun rightClickPath(vararg paths: String) = runJsPathMethod("rightClickPath", *paths)
    fun doubleClickPath(vararg paths: String) = runJsPathMethod("doubleClickPath", *paths)

    fun clickRow(row: Int) = runJsRowMethod("clickRow", row)
    fun expandRow(row: Int) = runJsRowMethod("expandRow", row)

    private fun runJsPathMethod(name: String, vararg paths: String) {
        val path = paths.joinToString("/")
        step("$name $path") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.$name('$path') 
                """.trimIndent()
            )
        }
    }

    private fun runJsRowMethod(name: String, row: Int) {
        step("$name $row") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.$name($row) 
                """.trimIndent()
            )
        }
    }
}
