// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.extensions

import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.jupiter.api.extension.TestWatcher
import software.aws.toolkits.core.utils.outputStream
import java.net.URL
import java.nio.file.Paths

class TestRecorder : TestWatcher {
    private companion object {
        val TEST_REPORTS_LOCATION by lazy {
            System.getProperty("testReportPath")?.let {
                Paths.get(it)
            }
        }
    }

    override fun testFailed(context: ExtensionContext, cause: Throwable) {
        val testReport = TEST_REPORTS_LOCATION?.resolve(context.displayName) ?: return

        uiTest {
            testReport.resolve("uiHierarchy.html").outputStream().use {
                URL("http://127.0.0.1:$robotPort/").openStream().copyTo(it)
            }

            listOf("scripts.js", "xpathEditor.js", "updateButton.js", "styles.css", "img/locator.png").forEach { file ->
                testReport.resolve(Paths.get(file)).outputStream().use {
                    URL("http://127.0.0.1:$robotPort/$file").openStream().copyTo(it)
                }
            }
        }
    }
}
