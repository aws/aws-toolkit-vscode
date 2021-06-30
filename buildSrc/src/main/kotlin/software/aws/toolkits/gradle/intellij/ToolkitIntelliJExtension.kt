// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.provider.Property
import org.gradle.api.provider.Provider
import org.gradle.api.provider.ProviderFactory

abstract class ToolkitIntelliJExtension(private val providers: ProviderFactory) {
    enum class IdeFlavor { IC, IU, RD }

    abstract val ideFlavor: Property<IdeFlavor>

    fun ideProfile() = IdeVersions.ideProfile(providers)

    fun productProfile(): Provider<out ProductProfile> = ideFlavor.flatMap { flavor ->
        when (flavor) {
            IdeFlavor.IC -> ideProfile().map { it.community }
            IdeFlavor.IU -> ideProfile().map { it.ultimate }
            IdeFlavor.RD -> ideProfile().map { it.rider }
        }
    }
}
