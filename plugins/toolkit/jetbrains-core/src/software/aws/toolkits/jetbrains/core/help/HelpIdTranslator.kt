// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.help

import com.intellij.openapi.help.WebHelpProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn

class HelpIdTranslator : WebHelpProvider() {
    override fun getHelpPageUrl(helpTopicId: String) = HELP_REGISTRY.getOrElse(helpTopicId) {
        LOGGER.warn { "Missing id $helpTopicId" }
        DEFAULT_LOCATION
    }

    private companion object {
        const val DEFAULT_LOCATION = "https://docs.aws.amazon.com/console/toolkit-for-jetbrains"
        val LOGGER = getLogger<HelpIdTranslator>()
        private val HELP_REGISTRY by lazy {
            HelpIds.values().asSequence().map { it.id to it.url }.toMap()
        }
    }
}
