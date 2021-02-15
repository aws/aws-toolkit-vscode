// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.utils

import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.preferencesDialog
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame

/**
 * Setup SAM cli configuration from the welcome screen
 */
fun setupSamCli() {
    val samPath = System.getenv("SAM_CLI_EXEC")
    if (samPath.isNullOrEmpty()) {
        log.warn("No custom SAM set, skipping setup")
        return
    }

    uiTest {
        welcomeFrame {
            step("Open preferences page") {
                openPreferences()

                preferencesDialog {
                    // Search for AWS because sometimes it is off the screen
                    search("AWS")

                    selectPreferencePage("Tools", "AWS")

                    step("Set SAM CLI executable path to $samPath") {
                        textField("SAM CLI executable:").text = samPath
                    }

                    pressOk()
                }

                selectTab("Projects")
            }
        }
    }
}
